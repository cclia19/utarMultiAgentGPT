import { createHash } from "node:crypto";
import type { AbuseLimits } from "./config.ts";
import { matchJailbreak } from "./jailbreakPhrases.ts";

/**
 * Cheap, pure checks that run before anything touches Neon or Gemini:
 * size limits, history trimming and the junk filter. No LLM, no I/O.
 */

export type BlockReason =
    | "maintenance"
    | "body_too_large"
    | "bad_request"
    | "empty"
    | "too_long"
    | "junk"
    | "jailbreak"
    | "repeat"
    | "blocked_client"
    | "rate_minute"
    | "rate_day"
    | "budget"
    | "limit_store";

type HistoryEntry = { role: "user" | "model"; parts: { text: string }[] };

function entryText(entry: any): string {
    if (typeof entry?.text === "string") return entry.text;
    if (typeof entry?.content === "string") return entry.content;
    if (!Array.isArray(entry?.parts)) return "";
    return entry.parts
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("");
}

/**
 * The last `turns` messages, at most `maxChars` characters in total. The newest
 * messages are kept; the oldest one that does not fit whole is cut short.
 * Only text parts and known roles survive, so nothing else reaches a prompt.
 */
export function trimHistory(history: unknown, turns: number, maxChars: number): HistoryEntry[] {
    if (!Array.isArray(history) || turns <= 0 || maxChars <= 0) return [];
    const recent = history.slice(-turns);
    const out: HistoryEntry[] = [];
    let budget = maxChars;
    for (let i = recent.length - 1; i >= 0 && budget > 0; i--) {
        const entry = recent[i];
        const role = entry?.role === "model" ? "model" : entry?.role === "user" ? "user" : null;
        if (!role) continue;
        let text = entryText(entry);
        if (text.length > budget) text = text.slice(0, budget);
        budget -= text.length;
        out.unshift({ role, parts: [{ text }] });
    }
    return out;
}

function capString(value: unknown, max: number): unknown {
    return typeof value === "string" && value.length > max ? value.slice(0, max) : value;
}

/** A copy of the request body that is safe to hand to the pipeline: history trimmed, helper fields capped. */
export function sanitizeBody(body: any, limits: AbuseLimits): any {
    return {
        ...body,
        message: String(body?.message ?? "").trim(),
        history: trimHistory(body?.history, limits.historyTurns, limits.historyChars),
        pendingQuestion: capString(body?.pendingQuestion, limits.maxMessageChars),
        contextSummary: capString(body?.contextSummary, limits.maxSideFieldChars),
        lastResolvedTopic: capString(body?.lastResolvedTopic, 200),
    };
}

/** Message size: empty or longer than the limit. */
export function checkMessageSize(message: string, limits: AbuseLimits): BlockReason | null {
    if (!message) return "empty";
    if (message.length > limits.maxMessageChars) return "too_long";
    return null;
}

/** Share of distinct words among all words (1 = every word different). */
export function uniqueWordRatio(message: string): { ratio: number; words: number } {
    const words = message
        .toLowerCase()
        .split(/[\s,.;:!?"'()[\]{}<>|/\\]+/)
        .filter(Boolean);
    if (words.length === 0) return { ratio: 1, words: 0 };
    return { ratio: new Set(words).size / words.length, words: words.length };
}

/**
 * Junk filter, no LLM: repetitive text ("spam spam spam ..."), long runs of
 * one character, and known jailbreak phrasings.
 */
export function checkJunk(message: string, limits: AbuseLimits): { reason: BlockReason; detail: string } | null {
    const jailbreak = matchJailbreak(message);
    if (jailbreak) return { reason: "jailbreak", detail: jailbreak };

    const { ratio, words } = uniqueWordRatio(message);
    if (words >= limits.uniqueWordMinWords && ratio < limits.minUniqueWordRatio) {
        return { reason: "junk", detail: `unique-word ratio ${ratio.toFixed(2)}` };
    }
    if (/([\s\S])\1{29,}/u.test(message.replace(/\s/g, ""))) {
        return { reason: "junk", detail: "character run" };
    }
    return null;
}

/** Stable fingerprint of a message for the "same as last time" check. */
export function messageFingerprint(message: string): string {
    const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

/** Today's date in Malaysia (YYYY-MM-DD), for day windows and the budget. */
export function malaysiaDay(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(now);
}

/** The current minute (UTC, YYYY-MM-DDTHH:MM), for per-minute windows. */
export function minuteWindow(now: Date = new Date()): string {
    return now.toISOString().slice(0, 16);
}

export function estimateCostRm(
    usage: { inputTokens: number; outputTokens: number; webSearchCalls: number; unfinished: number },
    limits: AbuseLimits
): number {
    return (
        (usage.inputTokens / 1e6) * limits.inputRmPerMTok +
        (usage.outputTokens / 1e6) * limits.outputRmPerMTok +
        usage.webSearchCalls * limits.webSearchRmEach +
        usage.unfinished * limits.unfinishedRequestRm
    );
}
