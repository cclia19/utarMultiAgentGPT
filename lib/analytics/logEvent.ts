import { currentEnv, ensureSchema, getSql } from "./db";
import { maskPersonalData } from "./mask";
import type { RequestMetrics } from "./metrics";

const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export type ChatEventInput = {
    body: any;
    payload: any;
    metrics: RequestMetrics;
    latencyMs: number;
    streamFailed?: boolean;
};

/** Writes one row per chat question. Never throws: logging must not break the chat. */
export async function logChatEvent({ body, payload, metrics, latencyMs, streamFailed }: ChatEventInput) {
    try {
        const sql = getSql();
        if (!sql) return;

        const message = String(body?.message || "").trim();
        if (!message) return;

        const history: any[] = Array.isArray(body?.history) ? body.history : [];
        const userTurns = history.filter((h) => h?.role === "user").length;
        // The client includes the current message in history, so >1 means a follow-up.
        const turnIndex = Math.max(1, userTurns);
        const rawSession = String(body?.sessionId || "");
        const sessionId = SESSION_ID_RE.test(rawSession) ? rawSession : null;

        const status = streamFailed || metrics.pipelineError ? "error" : "ok";

        await ensureSchema(sql);
        await sql`
            INSERT INTO chat_events (
                env, session_id, turn_index, is_follow_up, agent_id, agent_label,
                source_mode, route_type, needs_clarification, status, latency_ms,
                gemini_calls, web_search_calls, input_tokens, output_tokens,
                question_chars, question_masked
            ) VALUES (
                ${currentEnv()}, ${sessionId}, ${turnIndex}, ${turnIndex > 1},
                ${payload?.selectedAgentId ?? null}, ${payload?.selectedAgentLabel ?? null},
                ${payload?.sourceMode ?? null}, ${payload?.routeType ?? null},
                ${Boolean(payload?.needsClarification)}, ${status}, ${Math.round(latencyMs)},
                ${metrics.geminiCalls}, ${metrics.webSearchCalls},
                ${metrics.inputTokens}, ${metrics.outputTokens},
                ${message.length}, ${maskPersonalData(message)}
            )`;
    } catch (err) {
        console.warn("[analytics] failed to log chat event:", (err as any)?.message || err);
    }
}
