import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request counters for Gemini usage. The chat route runs each request
 * inside `metricsStore.run(...)`, and the wrapped Gemini client in lib/gemini.ts
 * adds to whichever store is active. Outside a request (scripts, ingest) nothing
 * is recorded.
 */
export type RequestMetrics = {
    geminiCalls: number;
    webSearchCalls: number;
    fileSearchCalls: number;
    inputTokens: number;
    outputTokens: number;
    geminiErrors: number;
    pipelineError: boolean;
    /** A Gemini call hit its timeout (status "timeout" in the usage log). */
    timedOut: boolean;
    /** The last Gemini error in this request (status code + short message), for the usage log. */
    lastError: GeminiErrorInfo | null;
    /**
     * Set when Gemini refuses for a reason that will not change within this
     * request (no credit, quota, bad or restricted key). Every later call in
     * the request then fails at once instead of being sent.
     */
    providerError: GeminiErrorInfo | null;
};

export type GeminiErrorInfo = { status: number; message: string };

/** 401 bad key, 402 no prepaid credit, 403 key restricted/blocked, 429 quota or rate limit (plus 400 "API key not valid"). */
const PROVIDER_FATAL = new Set([401, 402, 403, 429]);

export const metricsStore = new AsyncLocalStorage<RequestMetrics>();

export function newMetrics(): RequestMetrics {
    return {
        geminiCalls: 0,
        webSearchCalls: 0,
        fileSearchCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        geminiErrors: 0,
        pipelineError: false,
        timedOut: false,
        lastError: null,
        providerError: null,
    };
}

function toolsOf(params: any): any[] {
    const tools = params?.config?.tools;
    return Array.isArray(tools) ? tools : [];
}

export function recordGeminiCall(params: any): RequestMetrics | undefined {
    const m = metricsStore.getStore();
    if (!m) return undefined;
    m.geminiCalls += 1;
    const tools = toolsOf(params);
    if (tools.some((t) => t && ("googleSearch" in t || "googleSearchRetrieval" in t))) {
        m.webSearchCalls += 1;
    }
    if (tools.some((t) => t && "fileSearch" in t)) {
        m.fileSearchCalls += 1;
    }
    return m;
}

export function recordUsage(m: RequestMetrics | undefined, usage: any) {
    if (!m || !usage) return;
    m.inputTokens += (usage.promptTokenCount || 0) + (usage.toolUsePromptTokenCount || 0);
    m.outputTokens += (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);
}

export function recordGeminiError(m: RequestMetrics | undefined, error?: unknown) {
    if (!m) return;
    m.geminiErrors += 1;
    if (isTimeoutError(error)) m.timedOut = true;
    const info = geminiErrorInfo(error);
    if (info) {
        m.lastError = info;
        const badKey = info.status === 400 && /api key/i.test(info.message);
        if ((PROVIDER_FATAL.has(info.status) || badKey) && !m.providerError) m.providerError = info;
    }
}

/**
 * Status code and short message of a Gemini API error, or null for anything
 * else (a parse error in our code, a timeout we raised ourselves).
 */
export function geminiErrorInfo(error: unknown): GeminiErrorInfo | null {
    const e = error as any;
    if (e instanceof GeminiUnavailableError) return { status: e.status, message: e.message };
    const raw = String(e?.message || "");
    let status = Number(e?.status ?? e?.code);
    if (!Number.isInteger(status) || status < 400) {
        const m = raw.match(/"code"\s*:\s*(\d{3})/);
        status = m ? Number(m[1]) : NaN;
    }
    if (!Number.isInteger(status) || status < 400 || status > 599) return null;
    const msg = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? raw;
    return { status, message: msg.replace(/\\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) };
}

/** Thrown instead of calling Gemini once a provider-fatal error was seen in this request. */
export class GeminiUnavailableError extends Error {
    status: number;
    constructor(info: GeminiErrorInfo) {
        super(info.message);
        this.name = "GeminiUnavailableError";
        this.status = info.status;
    }
}

/** For the wrapper in lib/gemini.ts: throw right away if this request already hit a provider-fatal error. */
export function throwIfProviderUnavailable() {
    const m = metricsStore.getStore();
    if (m?.providerError) throw new GeminiUnavailableError(m.providerError);
}

export function isTimeoutError(error: unknown): boolean {
    const e = error as any;
    const name = String(e?.name || "");
    return name === "TimeoutError" || name === "AbortError" || /timed?\s*out|timeout|aborted/i.test(String(e?.message || ""));
}

/** For timeouts the route enforces itself (Promise.race), which never reach the Gemini wrapper's catch. */
export function markTimeout() {
    const m = metricsStore.getStore();
    if (m) m.timedOut = true;
}

/** Called from the chat route's catch-all so the event is logged as an error. */
export function markPipelineError() {
    const m = metricsStore.getStore();
    if (m) m.pipelineError = true;
}
