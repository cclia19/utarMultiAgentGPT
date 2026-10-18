import { currentEnv, ensureSchema, getSql } from "./db";
import { maskPersonalData } from "./mask";
import type { RequestMetrics } from "./metrics";

/**
 * One row per chat request in chat_events.
 *
 * - A request that passes the abuse checks gets a row with status "started"
 *   before the first Gemini call (startChatEvent), updated when it ends
 *   (finishChatEvent) to "answered", "failed" or "timeout". A row still
 *   "started" minutes later means the platform killed the request.
 * - A blocked request gets one row with status "blocked:<reason>" (logBlockedEvent).
 *
 * Logging never throws: it must not break the chat.
 */

const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
// Blocked messages can be huge pastes: keep only the start, for review.
const BLOCKED_PREVIEW_CHARS = 300;

export type ChatStatus = "started" | "answered" | "failed" | "timeout" | `blocked:${string}`;

function requestFields(body: any) {
    const message = String(body?.message || "").trim();
    const history: any[] = Array.isArray(body?.history) ? body.history : [];
    const userTurns = history.filter((h) => h?.role === "user").length;
    // The client includes the current message in history, so >1 means a follow-up.
    const turnIndex = Math.max(1, userTurns);
    const rawSession = String(body?.sessionId || "");
    const sessionId = SESSION_ID_RE.test(rawSession) ? rawSession : null;
    return { message, turnIndex, sessionId };
}

/** Row for a request about to run the pipeline. Returns its id, or null if logging is off or failed. */
export async function startChatEvent(params: { body: any; ipHash: string }): Promise<number | null> {
    try {
        const sql = getSql();
        if (!sql) return null;
        const { message, turnIndex, sessionId } = requestFields(params.body);
        await ensureSchema(sql);
        const [row] = await sql`
            INSERT INTO chat_events (
                env, session_id, turn_index, is_follow_up, status, question_chars, question_masked, ip_hash
            ) VALUES (
                ${currentEnv()}, ${sessionId}, ${turnIndex}, ${turnIndex > 1}, 'started',
                ${message.length}, ${maskPersonalData(message)}, ${params.ipHash}
            )
            RETURNING id`;
        return row ? Number(row.id) : null;
    } catch (err) {
        console.warn("[analytics] failed to start chat event:", (err as any)?.message || err);
        return null;
    }
}

export async function finishChatEvent(params: {
    id: number | null;
    body: any;
    ipHash: string;
    payload: any;
    metrics: RequestMetrics;
    latencyMs: number;
    streamFailed?: boolean;
}) {
    const { id, body, ipHash, payload, metrics, latencyMs, streamFailed } = params;
    // A timed-out call that a later fallback recovered from still counts as answered.
    const failed = Boolean(streamFailed || metrics.pipelineError);
    const status: ChatStatus = failed ? (metrics.timedOut ? "timeout" : "failed") : "answered";
    try {
        const sql = getSql();
        if (!sql) return;
        await ensureSchema(sql);
        if (id !== null) {
            await sql`
                UPDATE chat_events SET
                    agent_id = ${payload?.selectedAgentId ?? null},
                    agent_label = ${payload?.selectedAgentLabel ?? null},
                    source_mode = ${payload?.sourceMode ?? null},
                    route_type = ${payload?.routeType ?? null},
                    needs_clarification = ${Boolean(payload?.needsClarification)},
                    status = ${status},
                    latency_ms = ${Math.round(latencyMs)},
                    gemini_calls = ${metrics.geminiCalls},
                    web_search_calls = ${metrics.webSearchCalls},
                    input_tokens = ${metrics.inputTokens},
                    output_tokens = ${metrics.outputTokens},
                    finished_at = now()
                WHERE id = ${id}`;
            return;
        }
        // The start row could not be written: write the whole row now.
        const { message, turnIndex, sessionId } = requestFields(body);
        await sql`
            INSERT INTO chat_events (
                env, session_id, turn_index, is_follow_up, agent_id, agent_label,
                source_mode, route_type, needs_clarification, status, latency_ms,
                gemini_calls, web_search_calls, input_tokens, output_tokens,
                question_chars, question_masked, ip_hash, finished_at
            ) VALUES (
                ${currentEnv()}, ${sessionId}, ${turnIndex}, ${turnIndex > 1},
                ${payload?.selectedAgentId ?? null}, ${payload?.selectedAgentLabel ?? null},
                ${payload?.sourceMode ?? null}, ${payload?.routeType ?? null},
                ${Boolean(payload?.needsClarification)}, ${status}, ${Math.round(latencyMs)},
                ${metrics.geminiCalls}, ${metrics.webSearchCalls},
                ${metrics.inputTokens}, ${metrics.outputTokens},
                ${message.length}, ${maskPersonalData(message)}, ${ipHash}, now()
            )`;
    } catch (err) {
        console.warn("[analytics] failed to finish chat event:", (err as any)?.message || err);
    }
}

/** One row for a request refused by the abuse checks (no Gemini call was made). */
export async function logBlockedEvent(params: {
    body: any;
    ipHash: string;
    reason: string;
    detail?: string;
    rawChars?: number;
    latencyMs: number;
}) {
    try {
        const sql = getSql();
        if (!sql) return;
        const { message, turnIndex, sessionId } = requestFields(params.body);
        await ensureSchema(sql);
        await sql`
            INSERT INTO chat_events (
                env, session_id, turn_index, is_follow_up, source_mode, status, latency_ms,
                gemini_calls, web_search_calls, input_tokens, output_tokens,
                question_chars, question_masked, ip_hash, block_reason, finished_at
            ) VALUES (
                ${currentEnv()}, ${sessionId}, ${turnIndex}, ${turnIndex > 1}, 'blocked',
                ${`blocked:${params.reason}`}, ${Math.round(params.latencyMs)},
                0, 0, 0, 0,
                ${params.rawChars ?? message.length},
                ${message ? maskPersonalData(message.slice(0, BLOCKED_PREVIEW_CHARS)) : null},
                ${params.ipHash}, ${params.detail ? `${params.reason}: ${params.detail}`.slice(0, 300) : params.reason}, now()
            )`;
    } catch (err) {
        console.warn("[analytics] failed to log blocked event:", (err as any)?.message || err);
    }
}
