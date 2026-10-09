#!/usr/bin/env node
/**
 * Answer-accuracy regression check for UTARCHAT.
 *
 * Replays multi-turn conversations against a running chat API and checks each
 * answer with simple rules (must mention / must not mention / which agent).
 * It calls Gemini for real, so run it against your LOCAL dev server:
 *
 *   pnpm dev                      # in another terminal
 *   node scripts/eval-chat.mjs    # or: node scripts/eval-chat.mjs http://localhost:3000
 *
 * Do not point it at production: every question is logged to analytics.
 * Add a case here whenever a tester finds a wrong answer.
 */

const BASE = (process.argv[2] || process.env.EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const DACE_URL = "https://admission.utar.edu.my/intake-and-Academic-Calendar.php";

/** @type {{name:string, turns:{say:string, expect?:{agent?:string|RegExp, mustMatch?:RegExp[], mustNotMatch?:RegExp[], source?:string[]}}[]}[]} */
const CASES = [
    {
        name: "Oct 2026 start date is not given as one date for everyone (Testing.docx)",
        turns: [
            {
                say: "When is the start date of Oct 2026 trimester",
                expect: {
                    agent: "dace",
                    mustMatch: [/postgraduate/i, /undergraduate|foundation/i],
                    mustNotMatch: [/^the october 2026 trimester is scheduled to start on october 5, 2026/i],
                },
            },
            {
                say: "Are you sure this date, 5 Oct 2026, is the start date of new trimester for all students?",
                expect: {
                    mustNotMatch: [/^yes\b/i],
                    mustMatch: [/postgraduate/i],
                },
            },
        ],
    },
    {
        name: "Pasted official link is read, and later challenge is answered honestly",
        turns: [
            { say: "When is the start date of Oct 2026 trimester" },
            {
                say: `can you check this page? ${DACE_URL}`,
                expect: {
                    mustMatch: [/12 October 2026|October 12, 2026/i, /26 October 2026|October 26, 2026/i],
                    source: ["webFallback"],
                },
            },
            {
                say: "So, why you said in the beginning that 5 Oct trimester is for all students?",
                expect: {
                    mustMatch: [/(wrong|mistake|incorrect|apolog|sorry|only (for|applies to) postgraduate)/i],
                    mustNotMatch: [/great question/i, /returning students/i],
                    source: ["fileSearch", "webFallback"],
                },
            },
        ],
    },
    {
        name: "Foundation intake",
        turns: [
            {
                say: "When does the October 2026 foundation intake start?",
                expect: { agent: "dace", mustMatch: [/12 October 2026|October 12, 2026|12 Oct/i] },
            },
        ],
    },
    {
        name: "Exam questions are not hijacked by the calendar rule",
        turns: [
            {
                say: "How is CGPA calculated?",
                expect: { agent: "deas" },
            },
        ],
    },
];

async function ask(state, message) {
    const history = [...state.history, { role: "user", parts: [{ text: message }] }];
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
            sessionId: "eval-script",
            stream: false,
        }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.history = [...history, { role: "model", parts: [{ text: data.text || "" }] }];
    state.agentId = data.selectedAgentId || state.agentId;
    state.pendingQuestion = data.pendingQuestion ?? null;
    state.lastResolvedTopic = data.lastResolvedTopic ?? state.lastResolvedTopic;
    state.contextSummary = data.contextSummary ?? state.contextSummary;
    return data;
}

function check(data, expect = {}) {
    const problems = [];
    const text = String(data.text || "").trim();
    if (expect.agent) {
        const ok = expect.agent instanceof RegExp ? expect.agent.test(data.selectedAgentId) : data.selectedAgentId === expect.agent;
        if (!ok) problems.push(`agent was "${data.selectedAgentId}", expected ${expect.agent}`);
    }
    if (expect.source && !expect.source.includes(data.sourceMode)) {
        problems.push(`source was "${data.sourceMode}", expected one of ${expect.source.join(", ")}`);
    }
    for (const re of expect.mustMatch || []) if (!re.test(text)) problems.push(`missing ${re}`);
    for (const re of expect.mustNotMatch || []) if (re.test(text)) problems.push(`should not match ${re}`);
    return problems;
}

let failed = 0;
for (const testCase of CASES) {
    const state = { history: [], agentId: "general", pendingQuestion: null, lastResolvedTopic: null, contextSummary: "" };
    console.log(`\n▶ ${testCase.name}`);
    for (const t of testCase.turns) {
        let data;
        try {
            data = await ask(state, t.say);
        } catch (error) {
            failed++;
            console.log(`  ✗ "${t.say}" → request failed: ${error.message}`);
            break;
        }
        const problems = t.expect ? check(data, t.expect) : [];
        const tag = `[${data.selectedAgentId} · ${data.sourceMode}]`;
        if (problems.length) {
            failed++;
            console.log(`  ✗ "${t.say}" ${tag}`);
            for (const p of problems) console.log(`      - ${p}`);
            console.log(`      answer: ${String(data.text).replace(/\s+/g, " ").slice(0, 400)}`);
        } else {
            console.log(`  ✓ "${t.say}" ${tag}`);
        }
    }
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
