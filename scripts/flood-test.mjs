#!/usr/bin/env node
/**
 * Flood test for the abuse protection (UTARCHAT Abuse Prevention Guideline,
 * rollout step 2). Replays the 17 Oct 2026 attack against a LOCAL dev server:
 *
 *   - 50 long messages: 25 of 5,000 characters (over MAX_MESSAGE_CHARS) and
 *     25 of 40 KB ("The Longest Text Ever...", over the 16 KB body limit);
 *   - 50 copies of one message from one browser. The first copy is a bus
 *     question, answered from timetable data with no Gemini call; the other 49
 *     must be refused as repeats.
 *
 * Passes only if the whole run makes ZERO Gemini calls, 99 of the 100 requests
 * are refused, and (when DATABASE_URL is set) every request has a row in
 * chat_events with the matching status.
 *
 *   pnpm dev                          # in another terminal (not production!)
 *   node scripts/flood-test.mjs       # --base http://localhost:3000
 *
 * Gemini calls are read from the x-chat-metrics header, which only `next dev`
 * sends, so this cannot run against a Vercel deployment by mistake. Requests
 * use stream: false so answered ones report their Gemini usage in that header
 * too; the abuse checks are the same for streaming requests.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const i = args.indexOf("--base");
const BASE = (i >= 0 ? args[i + 1] : "http://localhost:3000").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
    console.error(`Refusing to flood ${BASE}: this test only runs against a local dev server.`);
    process.exit(2);
}

const browser = randomUUID();
const startedAt = new Date();
const results = [];

async function send(label, message, { history = [] } = {}) {
    const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: [...history, { role: "user", parts: [{ text: message }] }], sessionId: browser, language: "en", stream: false }),
    });
    const metricsHeader = res.headers.get("x-chat-metrics");
    if (!metricsHeader) throw new Error("No x-chat-metrics header: is this a `next dev` server?");
    const metrics = JSON.parse(metricsHeader);
    // A refusal is one NDJSON "done" frame; an answer (stream: false) is plain JSON. Both parse as JSON.
    const done = await res.json().catch(() => null);
    results.push({ label, status: res.status, blocked: done?.blocked ?? null, geminiCalls: metrics.geminiCalls ?? 0, text: done?.text ?? "" });
}

const longText = "The Longest Text Ever. " + "This is filler text that keeps going and going. ".repeat(110); // ~5,300 chars
const hugeText = "The Longest Text Ever. " + "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(720); // ~40 KB

process.stdout.write("Sending 50 long messages ");
for (let n = 0; n < 25; n++) {
    await send("long 5k", longText.slice(0, 5000));
    process.stdout.write(".");
}
for (let n = 0; n < 25; n++) {
    await send("long 40KB", hugeText);
    process.stdout.write(".");
}
process.stdout.write("\nSending 50 repeated messages ");
await send("repeat #1", "Bus to Westlake Homes");
// The repeat check remembers a message once its answer is logged, just after the reply.
await new Promise((r) => setTimeout(r, 1500));
for (let n = 2; n <= 50; n++) {
    await send(`repeat #${n}`, "Bus to Westlake Homes");
    process.stdout.write(".");
}
process.stdout.write("\n\n");

const geminiCalls = results.reduce((sum, r) => sum + r.geminiCalls, 0);
const blocked = results.filter((r) => r.blocked);
const byReason = blocked.reduce((acc, r) => ({ ...acc, [r.blocked]: (acc[r.blocked] || 0) + 1 }), {});
const failures = [];

if (results.length !== 100) failures.push(`expected 100 requests, sent ${results.length}`);
if (geminiCalls !== 0) failures.push(`expected 0 Gemini calls, got ${geminiCalls}`);
if (blocked.length !== 99) failures.push(`expected 99 refusals, got ${blocked.length}`);
const longRefused = results.filter((r) => r.label.startsWith("long") && (r.blocked === "too_long" || r.blocked === "body_too_large")).length;
if (longRefused !== 50) failures.push(`expected all 50 long messages refused for size, got ${longRefused}`);
const repeatsRefused = results.filter((r) => r.label.startsWith("repeat") && (r.blocked === "repeat" || r.blocked === "repeat_recent")).length;
if (repeatsRefused !== 49) failures.push(`expected 49 repeats refused, got ${repeatsRefused}`);
if (results.some((r) => r.status !== 200)) failures.push("some requests did not return HTTP 200");

console.log(`Requests: ${results.length}   Gemini calls: ${geminiCalls}   Refused: ${blocked.length}`);
console.log("Refusals by reason:", byReason);
console.log(`First answer (should be the bus timetable): ${results.find((r) => r.label === "repeat #1")?.text.slice(0, 70)}…`);

// Dashboard check: every request must have a row with its outcome.
function databaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    try {
        const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
            .split("\n")
            .find((l) => l.startsWith("DATABASE_URL="));
        return line ? line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "") : "";
    } catch {
        return "";
    }
}
const url = databaseUrl();
if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require", max: 1, prepare: false });
    // Logging runs just after each reply; give the last rows a moment.
    await new Promise((r) => setTimeout(r, 3000));
    const rows = await sql`
        SELECT status, count(*)::int AS n, coalesce(sum(gemini_calls), 0)::int AS calls
        FROM chat_events
        WHERE env = 'development' AND created_at >= ${startedAt}
          AND (session_id = ${browser} OR (session_id IS NULL AND status = 'blocked:body_too_large'))
        GROUP BY status ORDER BY status`;
    await sql.end();
    const total = rows.reduce((n, r) => n + r.n, 0);
    const blockedRows = rows.filter((r) => r.status.startsWith("blocked:")).reduce((n, r) => n + r.n, 0);
    console.log("chat_events rows for this run:", Object.fromEntries(rows.map((r) => [r.status, r.n])));
    if (total !== 100) failures.push(`expected 100 rows in chat_events, found ${total}`);
    if (blockedRows !== 99) failures.push(`expected 99 blocked rows, found ${blockedRows}`);
    if (rows.some((r) => r.calls !== 0)) failures.push("a logged row has Gemini calls");
} else {
    console.log("DATABASE_URL not set: skipped the chat_events (dashboard) check.");
}

if (failures.length) {
    console.error("\nFAIL\n- " + failures.join("\n- "));
    process.exit(1);
}
console.log("\nPASS: the flood cost nothing and every refusal is accounted for.");
