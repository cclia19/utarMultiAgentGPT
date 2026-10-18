/**
 * Abuse-protection limits (see "UTARCHAT Abuse Prevention Guideline", Oct 2026).
 * Every number comes from an env var so it can be tuned on Vercel without a
 * code change; the defaults are the guideline's starting values.
 */

function num(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export type AbuseLimits = {
    maxBodyBytes: number;
    maxMessageChars: number;
    historyTurns: number;
    historyChars: number;
    /** Client-sent helper fields (pendingQuestion, contextSummary, lastResolvedTopic). */
    maxSideFieldChars: number;
    minUniqueWordRatio: number;
    /** The unique-word check only applies to messages with at least this many words. */
    uniqueWordMinWords: number;
    repeatWindowSec: number;
    clientPerMinute: number;
    clientPerDay: number;
    ipPerMinute: number;
    ipPerDay: number;
    dailyBudgetRm: number;
    alertAtFraction: number;
    inputRmPerMTok: number;
    outputRmPerMTok: number;
    webSearchRmEach: number;
    /** Rough cost for a request that never finished (timed out / killed), whose tokens were never logged. */
    unfinishedRequestRm: number;
};

export function abuseLimits(): AbuseLimits {
    return {
        maxBodyBytes: num("MAX_BODY_BYTES", 16 * 1024),
        maxMessageChars: num("MAX_MESSAGE_CHARS", 1000),
        historyTurns: num("MAX_HISTORY_TURNS", 6),
        historyChars: num("MAX_HISTORY_CHARS", 6000),
        maxSideFieldChars: num("MAX_SIDE_FIELD_CHARS", 1500),
        minUniqueWordRatio: num("MIN_UNIQUE_WORD_RATIO", 0.3),
        uniqueWordMinWords: num("UNIQUE_WORD_MIN_WORDS", 12),
        repeatWindowSec: num("REPEAT_WINDOW_SEC", 600),
        clientPerMinute: num("RATE_CLIENT_PER_MIN", 5),
        clientPerDay: num("RATE_CLIENT_PER_DAY", 40),
        ipPerMinute: num("RATE_IP_PER_MIN", 20),
        ipPerDay: num("RATE_IP_PER_DAY", 300),
        dailyBudgetRm: num("DAILY_BUDGET_RM", 10),
        alertAtFraction: num("BUDGET_ALERT_FRACTION", 0.8),
        // Gemini 2.5 Flash list price (USD 0.30 in / 2.50 out per million tokens) at RM4.70 per USD,
        // the same conservative rate as scripts/prelaunch-check.mjs. Thinking tokens bill as output.
        inputRmPerMTok: num("GEMINI_INPUT_RM_PER_MTOK", 1.41),
        outputRmPerMTok: num("GEMINI_OUTPUT_RM_PER_MTOK", 11.75),
        // Search grounding is free up to the daily free tier; set this if the bill shows otherwise.
        webSearchRmEach: num("GEMINI_WEB_SEARCH_RM_EACH", 0),
        unfinishedRequestRm: num("UNFINISHED_REQUEST_RM", 0.03),
    };
}

export type GeminiCallLimits = {
    maxOutputTokens: number;
    /** Structured extraction (JSON mode, e.g. the staff directory page): bounded by the page, not the user. */
    maxJsonOutputTokens: number;
    maxThinkingTokens: number;
    timeoutMs: number;
};

export function geminiCallLimits(): GeminiCallLimits {
    return {
        maxOutputTokens: num("GEMINI_MAX_OUTPUT_TOKENS", 1024),
        maxJsonOutputTokens: num("GEMINI_MAX_JSON_OUTPUT_TOKENS", 8192),
        maxThinkingTokens: num("GEMINI_MAX_THINKING_TOKENS", 1024),
        timeoutMs: num("GEMINI_CALL_TIMEOUT_MS", 25_000),
    };
}

export function maintenanceOn(): boolean {
    return /^(on|1|true|yes)$/i.test((process.env.CHAT_MAINTENANCE || "").trim());
}
