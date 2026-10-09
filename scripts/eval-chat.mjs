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
const ADMITS_MISTAKE = /(wrong|mistake|incorrect|incomplete|apolog|sorry|should not have|shouldn't have|you(?:'re| are) (?:right|correct))/i;
const DENIES_SAYING = /\b(did not|didn't|never) (say|said|state|stated|claim)/i;

/** True when an answer gives 5 October as the start date without scoping it to postgraduates. */
function gaveOneDateForEveryone(answer = "") {
    return /(october 5|5 october|5 oct)/i.test(answer) && !/postgraduate/i.test(answer);
}

/** @typedef {{agent?:string|RegExp, mustMatch?:RegExp[], mustNotMatch?:RegExp[], source?:string[], needsClarification?:boolean}} Expect */
/** @type {{name:string, seed?:[string,string][], turns:{say:string, expect?:Expect|((answers:string[])=>Expect)}[]}[]} */
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
                // The honest reply depends on what the bot really said first.
                expect: (answers) =>
                    gaveOneDateForEveryone(answers[0])
                        ? {
                              mustMatch: [ADMITS_MISTAKE],
                              mustNotMatch: [DENIES_SAYING, /great question/i, /returning students/i],
                              source: ["fileSearch", "webFallback"],
                          }
                        : {
                              // It never said that, so it must correct the premise, not apologise for nothing.
                              mustMatch: [/(did not|didn't|never|not) (say|said|state|stated|claim)|only (for|applies to) postgraduate|postgraduate[^.]{0,40}only/i],
                              mustNotMatch: [/great question/i, /returning students/i],
                              source: ["fileSearch", "webFallback"],
                          },
            },
        ],
    },
    {
        name: "Early wrong answer is admitted even after a later correct one (Testing.docx, seeded)",
        // The tester's real conversation, so the wrong first answer is always there.
        seed: [
            ["user", "When is the start date of Oct 2026 trimester"],
            ["model", "The October 2026 trimester is scheduled to start on October 5, 2026, with teaching commencing on the same day and running until December 27, 2026, for a duration of 12 weeks."],
            ["user", "Are you sure this date, 5 Oct 2026, is the start date of new trimester for all students?"],
            ["model", "Yes, October 5, 2026, is the start date for the October 2026 intake, with teaching commencing on this date and running until December 27, 2026, for a duration of 12 weeks. This information is specifically outlined in the Postgraduate Handbook for the 2026 academic year."],
            ["user", "I think you are wrong, 5 Oct is for postgraduate students, not all students. You did not check carefully the link that I sent to you."],
            ["model", "Based on the DACE Intake & Academic Calendar page, the October 5, 2026 start date is only for postgraduate students (except Master of Architecture). Undergraduate (except MBBS and Nursing): 26 October 2026 (Kampar) / 27 October 2026 (Sungai Long). MBBS: 2 November 2026. Nursing: 27 October 2026. Foundation: 12 October 2026."],
        ],
        turns: [
            {
                say: "So, why you said in the beginning that 5 Oct trimester is for all students?",
                expect: {
                    mustMatch: [ADMITS_MISTAKE],
                    mustNotMatch: [DENIES_SAYING, /great question/i, /returning students/i],
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
        name: "Small talk about the bot is answered instantly, without a KB search",
        turns: [
            { say: "are you smart", expect: { source: ["none"], mustMatch: [/smart enough/i] } },
            { say: "who build you", expect: { source: ["none"], mustMatch: [/AVO/] } },
            { say: "whos your daddy", expect: { source: ["none"], mustMatch: [/Avo is my daddy/] } },
        ],
    },
    {
        name: "Lecturer popularity is not met with 'which faculty?'",
        turns: [
            { say: "who is most popular lecturer", expect: { source: ["none"], mustMatch: [/EXO/], needsClarification: false } },
        ],
    },
    {
        name: "Ranking question the small-talk patterns miss is still not met with 'which faculty?' (router rule)",
        turns: [
            {
                say: "which lecturer do students like the most?",
                expect: { needsClarification: false, mustNotMatch: [/which (faculty|programme|program)/i] },
            },
        ],
    },
    {
        name: "A real question that says 'you' still reaches the knowledge base",
        turns: [
            {
                say: "can you tell me who the FICT dean is",
                expect: { mustNotMatch: [/EXO|smart enough|AVO YYDS|Avo is my daddy/i] },
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
    if (typeof expect.needsClarification === "boolean" && Boolean(data.needsClarification) !== expect.needsClarification) {
        problems.push(`needsClarification was ${Boolean(data.needsClarification)}, expected ${expect.needsClarification}`);
    }
    for (const re of expect.mustMatch || []) if (!re.test(text)) problems.push(`missing ${re}`);
    for (const re of expect.mustNotMatch || []) if (re.test(text)) problems.push(`should not match ${re}`);
    return problems;
}

let failed = 0;
for (const testCase of CASES) {
    const history = (testCase.seed || []).map(([role, text]) => ({ role, parts: [{ text }] }));
    const state = { history, agentId: "general", pendingQuestion: null, lastResolvedTopic: null, contextSummary: "" };
    const answers = history.filter((h) => h.role === "model").map((h) => h.parts[0].text);
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
        const expect = typeof t.expect === "function" ? t.expect(answers) : t.expect;
        answers.push(String(data.text || ""));
        const problems = expect ? check(data, expect) : [];
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
