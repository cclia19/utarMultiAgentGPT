#!/usr/bin/env node
/**
 * Four-question smoke test after a deploy: a greeting, a knowledge-base
 * question, a question that needs the web, and a follow-up. Prints where each
 * answer came from and how long it took. Costs a few sen of Gemini.
 *
 *   node scripts/smoke-chat.mjs                       # local pnpm dev
 *   node scripts/smoke-chat.mjs --base https://<preview>.vercel.app
 *
 * Not for production: every question is logged on the usage dashboard.
 */
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const i = args.indexOf("--base");
const BASE = (i >= 0 ? args[i + 1] : "http://localhost:3000").replace(/\/$/, "");
if (/utar-multi-agent-gpt\.vercel\.app|chat\.utar\.edu\.my/.test(BASE)) {
    console.error("Refusing to run against production.");
    process.exit(2);
}
// Vercel previews behind Deployment Protection need the bypass secret.
const bypass = process.env.VERCEL_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS } : {};

const sessionId = randomUUID();
const history = [];
let context = { selectedAgentId: undefined, lastResolvedTopic: null, contextSummary: "" };
const failures = [];

async function ask(label, message, expect) {
    history.push({ role: "user", parts: [{ text: message }] });
    const started = Date.now();
    const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...bypass },
        body: JSON.stringify({ message, history, sessionId, language: "en", stream: false, ...context }),
    });
    const data = await res.json().catch(() => ({}));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const metrics = JSON.parse(res.headers.get("x-chat-metrics") || "null");
    history.push({ role: "model", parts: [{ text: data.text || "" }] });
    context = {
        selectedAgentId: data.selectedAgentId ?? context.selectedAgentId,
        lastResolvedTopic: data.lastResolvedTopic ?? context.lastResolvedTopic,
        contextSummary: data.contextSummary ?? context.contextSummary,
    };
    const calls = metrics ? `${metrics.geminiCalls} Gemini calls` : "";
    console.log(`\n${label}: "${message}"\n  ${res.status} · ${secs}s · ${data.selectedAgentLabel || "-"} · source ${data.sourceMode || "-"} ${calls}${data.blocked ? ` · BLOCKED ${data.blocked}` : ""}`);
    console.log("  " + String(data.text || "").replace(/\s+/g, " ").slice(0, 220));
    const problem = expect(data, metrics);
    if (problem) failures.push(`${label}: ${problem}`);
}

const unavailable = (d) => /temporarily unavailable|trouble checking official/i.test(d.text || "");

await ask("1 greeting", "good morning", (d, m) =>
    d.sourceMode !== "none" ? "should be a fixed reply" : m && m.geminiCalls !== 0 ? "greeting used Gemini" : null
);
await ask("2 knowledge base", "When does the October 2026 trimester start for undergraduates?", (d) =>
    unavailable(d) ? "bot unavailable" : !/26|27/.test(d.text || "") ? "expected 26/27 Oct" : null
);
await ask("3 follow-up", "what about postgraduate?", (d) =>
    unavailable(d) ? "bot unavailable" : !/5\s*Oct|October\s*5|5 October/i.test(d.text || "") ? "expected PG 5 Oct" : null
);
await ask("4 web", "What news did UTAR publish this month?", (d) =>
    unavailable(d) ? "bot unavailable" : d.sourceMode !== "webFallback" ? `expected web, got ${d.sourceMode}` : null
);

if (failures.length) {
    console.error("\nFAIL\n- " + failures.join("\n- "));
    process.exit(1);
}
console.log("\nPASS: all four answered.");
