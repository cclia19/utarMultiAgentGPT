import { test } from "node:test";
import assert from "node:assert/strict";

const {
    isIntakeOrCalendarQuestion,
    isAnswerChallenge,
    getLastAssistantAnswer,
    formatEarlierAssistantAnswers,
    extractOfficialUtarUrls,
    findRecentUserUtarUrls,
    htmlToGroundingText,
} = await import("./conversationSignals.ts");

const turn = (role: "user" | "model", text: string) => ({ role, parts: [{ text }] });

// Conversation from "UTARCHAT Testing.docx" (Oct 2026).
const DACE_URL = "https://admission.utar.edu.my/intake-and-Academic-Calendar.php";
const testingDocHistory = [
    turn("user", "When is the start date of Oct 2026 trimester"),
    turn("model", "The October 2026 trimester is scheduled to start on October 5, 2026."),
];

test("intake / commencement / calendar questions are detected (routed to DACE)", () => {
    for (const q of [
        "When is the start date of Oct 2026 trimester",
        "when does the October trimester start?",
        "What is the next intake for foundation?",
        "academic calendar 2026",
        "When is the commencement date for MBBS?",
        "when do classes start for new students",
        "Bila tarikh mula trimester Oktober?",
        "十月开学日期是什么时候？",
        "what are the confirmed start dates for october 2026",
        "October 2026 start date?",
        "When does MBBS start in October 2026?",
        "when will foundation begin in june",
    ]) {
        assert.equal(isIntakeOrCalendarQuestion(q), true, q);
    }
});

test("non-calendar questions are not detected", () => {
    for (const q of [
        "When is the final exam for FICT?",
        "How is CGPA calculated?",
        "what is the start date of my internship in June?",
        "industrial training start date for October 2026",
        "When does the final exam start in December?",
        "when does my internship start in June?",
        "What are the library opening hours?",
        "Who is the dean of FICT?",
        "hi",
    ]) {
        assert.equal(isIntakeOrCalendarQuestion(q), false, q);
    }
});

test("challenges to a previous answer are detected", () => {
    for (const q of [
        "Are you sure this date, 5 Oct 2026, is the start date of new trimester for all students?",
        "I think you are wrong, 5 Oct is for postgraduate students, not all students. You did not check carefully the link that I sent to you.",
        "So, why you said in the beginning that 5 Oct trimester is for all students?",
        "that's not correct",
        "please check again",
        "awak salah",
        "你错了",
    ]) {
        assert.equal(isAnswerChallenge(q, testingDocHistory), true, q);
    }
});

test("ordinary follow-ups and first messages are not challenges", () => {
    assert.equal(isAnswerChallenge("thanks!", testingDocHistory), false);
    assert.equal(isAnswerChallenge("what about Sungai Long campus?", testingDocHistory), false);
    assert.equal(isAnswerChallenge("How about the bus schedule?", testingDocHistory), false);
    // Nothing to challenge yet.
    assert.equal(isAnswerChallenge("are you sure?", [turn("user", "are you sure?")]), false);
});

test("last assistant answer is found", () => {
    const history = [...testingDocHistory, turn("user", "are you sure?")];
    assert.match(getLastAssistantAnswer(history), /October 5, 2026/);
    assert.equal(getLastAssistantAnswer([]), "");
});

test("correction mode sees the early wrong answer, not just the latest correct one", () => {
    // Testing.docx: the wrong answer came first, a correct one later, then
    // "why you said in the beginning...". The early answer must be visible.
    const history = [
        ...testingDocHistory,
        turn("user", "I think you are wrong, 5 Oct is for postgraduate students, not all students."),
        turn("model", "5 October 2026 is for postgraduate students only. Foundation starts 12 October 2026."),
        turn("user", "So, why you said in the beginning that 5 Oct trimester is for all students?"),
    ];
    const text = formatEarlierAssistantAnswers(history);
    assert.match(text, /Answer 1:\nThe October 2026 trimester is scheduled to start on October 5, 2026\./);
    assert.match(text, /Answer 2 \(most recent\):\n5 October 2026 is for postgraduate students only/);
    assert.ok(text.indexOf("Answer 1") < text.indexOf("Answer 2"), "oldest first");
    assert.equal(formatEarlierAssistantAnswers([turn("user", "hi")]), "");
});

test("correction mode keeps only the most recent few answers", () => {
    const history = [1, 2, 3, 4, 5, 6].flatMap((n) => [turn("user", `q${n}`), turn("model", `a${n}`)]);
    const text = formatEarlierAssistantAnswers(history, 4);
    assert.doesNotMatch(text, /\ba2\b/);
    assert.match(text, /Answer 1:\na3\n\nAnswer 2:\na4\n\nAnswer 3:\na5\n\nAnswer 4 \(most recent\):\na6$/);
});

test("official UTAR links are extracted", () => {
    assert.deepEqual(extractOfficialUtarUrls(`can you check this page? ${DACE_URL}`), [DACE_URL]);
    assert.deepEqual(extractOfficialUtarUrls(`see (${DACE_URL}).`), [DACE_URL]);
    assert.deepEqual(
        extractOfficialUtarUrls("check admission.utar.edu.my/intake-and-Academic-Calendar.php please"),
        [DACE_URL]
    );
    assert.deepEqual(extractOfficialUtarUrls("https://utar.edu.my/"), ["https://utar.edu.my/"]);
});

test("non-UTAR and unsafe links are ignored", () => {
    for (const text of [
        "https://utar.edu.my.evil.com/x",
        "https://evilutar.edu.my/x",
        "https://user:pw@admission.utar.edu.my/x",
        "https://admission.utar.edu.my:8443/x",
        "ftp://admission.utar.edu.my/x",
        "https://www.google.com/search?q=utar.edu.my",
        "no links here",
    ]) {
        assert.deepEqual(extractOfficialUtarUrls(text), [], text);
    }
});

test("a link pasted in an earlier turn is reused when the user challenges", () => {
    const history = [
        ...testingDocHistory,
        turn("user", `can you check this page? ${DACE_URL}`),
        turn("model", "Summary of the postgraduate calendar from the PG Handbook..."),
        turn("user", "I think you are wrong. You did not check the link that I sent to you."),
    ];
    assert.deepEqual(findRecentUserUtarUrls("I think you are wrong.", history), [DACE_URL]);
    assert.deepEqual(findRecentUserUtarUrls("hello", testingDocHistory), []);
});

test("HTML tables keep each date on the same line as its programme", () => {
    const html = `
<html><head><title>Intake &amp; Academic Calendar</title><style>.x{}</style><script>var a=1;</script></head>
<body><nav>Home | About</nav>
<h2>October 2026 Intake</h2>
<table>
  <tr><th>Programme</th><th>Commencement</th></tr>
  <tr><td>Undergraduate (except MBBS &amp; Nursing)</td><td>26 October 2026 (Kampar)<br>27 October 2026 (Sungai Long)</td></tr>
  <tr><td>Foundation</td><td>12 October 2026</td></tr>
  <tr><td>Postgraduate</td><td>5&nbsp;October 2026</td></tr>
</table>
<p>Please refer to the latest Academic Calendar.</p>
</body></html>`;
    const { title, text } = htmlToGroundingText(html);
    assert.equal(title, "Intake & Academic Calendar");
    assert.match(text, /^## October 2026 Intake$/m);
    assert.match(text, /^Programme \| Commencement$/m);
    assert.match(text, /^Foundation \| 12 October 2026$/m);
    assert.match(text, /^Postgraduate \| 5 October 2026$/m);
    assert.match(text, /Undergraduate \(except MBBS & Nursing\) \| 26 October 2026 \(Kampar\)/);
    assert.doesNotMatch(text, /var a=1|\.x\{\}|Home \| About/);
});
