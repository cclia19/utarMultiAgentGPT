#!/usr/bin/env node
/**
 * Pre-launch check: asks every question in scripts/prelaunch-questions.mjs
 * against a LOCAL dev server, runs the automatic answer checks
 * (lib/answerLint.ts) and writes a report, while keeping the Gemini spend
 * under a budget.
 *
 *   pnpm dev                                   # in another terminal
 *   node scripts/prelaunch-check.mjs           # all questions, budget RM20
 *   node scripts/prelaunch-check.mjs --only "dace-|bus-" --budget-myr 5
 *   node scripts/prelaunch-check.mjs --rerun-flagged   # only last run's problems
 *
 * Cost comes from the x-chat-metrics header that `next dev` adds to each
 * reply (tokens and web-search calls). Prices are gemini-2.5-flash list
 * prices; web searches are counted at the paid rate even though the first
 * 1,500 a day are free, so the estimate errs high.
 *
 * Output (next to the repo folder):
 *   prelaunch-report.md    problems first, then a table of every question
 *   prelaunch-results.json full answers, for --rerun-flagged and review
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { QUESTIONS } from "./prelaunch-questions.mjs";
import { lintAnswer, answerBody } from "../lib/answerLint.ts";

const PRICE = { inputPerM: 0.3, outputPerM: 2.5, webSearch: 0.035 }; // USD
const MYR_PER_USD = 4.7;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("--base", "http://localhost:3000").replace(/\/$/, "");
const BUDGET_MYR = Number(opt("--budget-myr", "20"));
const ONLY = opt("--only", "");
const CONCURRENCY = Number(opt("--concurrency", "3"));
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const JSON_PATH = path.join(OUT_DIR, "prelaunch-results.json");
const REPORT_PATH = path.join(OUT_DIR, "prelaunch-report.md");

// Every question is logged to analytics in deployed environments; this script
// is for the local dev server only.
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    console.error(`Refusing to run against ${BASE}: local dev server only.`);
    process.exit(2);
}

let cases = QUESTIONS;
if (ONLY) cases = cases.filter((c) => new RegExp(ONLY).test(c.id));
if (args.includes("--rerun-flagged")) {
    const previous = JSON.parse(await readFile(JSON_PATH, "utf8"));
    const flagged = new Set(previous.results.filter((r) => r.problems.length).map((r) => r.id));
    cases = cases.filter((c) => flagged.has(c.id));
}

const costUsd = (m) =>
    (m.inputTokens / 1e6) * PRICE.inputPerM + (m.outputTokens / 1e6) * PRICE.outputPerM + m.webSearchCalls * PRICE.webSearch;

let spentUsd = 0;
let stoppedForBudget = false;

async function ask(state, message) {
    const history = [...state.history, { role: "user", parts: [{ text: message }] }];
    const started = Date.now();
    const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message,
            history,
            selectedAgentId: state.agentId,
            pendingQuestion: state.pendingQuestion,
            lastResolvedTopic: state.lastResolvedTopic,
            contextSummary: state.contextSummary,
            sessionId: "prelaunch-check",
            stream: false,
        }),
    });
    const metrics = JSON.parse(res.headers.get("x-chat-metrics") || "null");
    const data = res.ok ? await res.json() : { text: `HTTP ${res.status}` };
    state.history = [...history, { role: "model", parts: [{ text: data.text || "" }] }];
    state.agentId = data.selectedAgentId || state.agentId;
    state.pendingQuestion = data.pendingQuestion ?? null;
    state.lastResolvedTopic = data.lastResolvedTopic ?? state.lastResolvedTopic;
    state.contextSummary = data.contextSummary ?? state.contextSummary;
    return { data, ok: res.ok, metrics, latencyMs: Date.now() - started };
}

async function runCase(c) {
    const turns = Array.isArray(c.ask) ? c.ask : [c.ask];
    const state = { history: [], agentId: "general", pendingQuestion: null, lastResolvedTopic: null, contextSummary: "" };
    let last = null;
    let caseUsd = 0;
    let geminiCalls = 0;
    for (const turn of turns) {
        try {
            last = await ask(state, turn);
        } catch (error) {
            last = { data: { text: "" }, ok: false, metrics: null, latencyMs: 0, error: error.message };
            break;
        }
        if (last.metrics) {
            caseUsd += costUsd(last.metrics);
            geminiCalls += last.metrics.geminiCalls;
        }
    }
    spentUsd += caseUsd;

    const text = String(last.data.text || "");
    const problems = [];
    if (!last.ok) problems.push({ code: "request-failed", severity: "error", detail: last.error || text });
    for (const flag of lintAnswer(text)) {
        if (flag.code === "no-answer" && c.clarifyOk) continue;
        problems.push(flag);
    }
    if (last.data.needsClarification && !c.clarifyOk) {
        problems.push({ code: "asked-clarification", severity: "warn", detail: "replied with a follow-up question instead of an answer" });
    }
    if (c.agents && !c.agents.includes(last.data.selectedAgentId)) {
        problems.push({ code: "wrong-agent", severity: "warn", detail: `answered by ${last.data.selectedAgentId}, expected ${c.agents.join(" or ")}` });
    }
    for (const re of c.mustMatch || []) {
        if (!re.test(text)) problems.push({ code: "missing-fact", severity: "error", detail: `missing ${re}` });
    }
    for (const re of c.mustNotMatch || []) {
        if (re.test(text)) problems.push({ code: "wrong-content", severity: "error", detail: `should not match ${re}` });
    }
    if (last.latencyMs > 25000) problems.push({ code: "slow", severity: "warn", detail: `${Math.round(last.latencyMs / 1000)} s` });

    return {
        id: c.id,
        ask: turns,
        agent: last.data.selectedAgentId || "",
        source: last.data.sourceMode || "",
        latencyMs: last.latencyMs,
        geminiCalls,
        costUsd: caseUsd,
        problems,
        text,
    };
}

const results = [];
const queue = [...cases];
const budgetUsd = BUDGET_MYR / MYR_PER_USD;
console.log(`Running ${cases.length} cases against ${BASE} (budget RM${BUDGET_MYR} ≈ US$${budgetUsd.toFixed(2)})`);

async function worker() {
    while (queue.length) {
        // Leave room for the cases still in flight.
        if (spentUsd > budgetUsd * 0.95) {
            stoppedForBudget = true;
            return;
        }
        const c = queue.shift();
        const r = await runCase(c);
        results.push(r);
        const mark = r.problems.some((p) => p.severity === "error") ? "✗" : r.problems.length ? "!" : "✓";
        console.log(
            `${mark} ${r.id.padEnd(24)} ${(r.agent + " · " + r.source).padEnd(30)} ${String(Math.round(r.latencyMs / 1000)).padStart(3)}s  RM${(spentUsd * MYR_PER_USD).toFixed(2)}  ${r.problems.map((p) => p.code).join(", ")}`
        );
    }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// --- Report -----------------------------------------------------------------
const order = new Map(cases.map((c, i) => [c.id, i]));
results.sort((a, b) => order.get(a.id) - order.get(b.id));
const flagged = results.filter((r) => r.problems.length);
const byCode = {};
for (const r of flagged) for (const p of r.problems) (byCode[p.code] ??= []).push(r.id);

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [
    `# Pre-launch check`,
    ``,
    `${new Date().toISOString()} · ${results.length}/${cases.length} cases · ${flagged.length} with problems · est. cost RM${(spentUsd * MYR_PER_USD).toFixed(2)} (US$${spentUsd.toFixed(2)})${stoppedForBudget ? " · **stopped at budget**" : ""}`,
    ``,
    `## Problems by type`,
    ``,
    ...Object.entries(byCode).sort((a, b) => b[1].length - a[1].length).map(([code, ids]) => `- **${code}** (${ids.length}): ${ids.join(", ")}`),
    ``,
    `## Flagged answers`,
    ``,
];
for (const r of flagged) {
    lines.push(
        `### ${r.id}`,
        ``,
        `**Asked:** ${r.ask.map((t) => `“${t}”`).join(" → ")}  `,
        `**Agent:** ${r.agent} · **Source:** ${r.source} · ${Math.round(r.latencyMs / 1000)} s`,
        ``,
        ...r.problems.map((p) => `- \`${p.severity}\` **${p.code}**: ${p.detail}`),
        ``,
        "```text",
        answerBody(r.text).slice(0, 1200),
        "```",
        ``
    );
}
lines.push(
    `## All cases`,
    ``,
    `| Case | Agent | Source | Time | Problems |`,
    `| --- | --- | --- | --- | --- |`,
    ...results.map((r) => `| ${r.id} | ${r.agent} | ${r.source} | ${Math.round(r.latencyMs / 1000)} s | ${esc(r.problems.map((p) => p.code).join(", ") || "✓")} |`)
);

await writeFile(REPORT_PATH, lines.join("\n") + "\n");
await writeFile(JSON_PATH, JSON.stringify({ at: new Date().toISOString(), spentUsd, stoppedForBudget, results }, null, 2));
console.log(`\n${flagged.length} of ${results.length} cases flagged. Est. cost RM${(spentUsd * MYR_PER_USD).toFixed(2)}.`);
console.log(`Report: ${REPORT_PATH}`);
process.exit(results.some((r) => r.problems.some((p) => p.severity === "error")) ? 1 : 0);
