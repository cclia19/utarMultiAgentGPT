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
};

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

export function recordGeminiError(m: RequestMetrics | undefined) {
    if (m) m.geminiErrors += 1;
}

/** Called from the chat route's catch-all so the event is logged as an error. */
export function markPipelineError() {
    const m = metricsStore.getStore();
    if (m) m.pipelineError = true;
}
