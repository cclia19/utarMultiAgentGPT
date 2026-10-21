import { test } from "node:test";
import assert from "node:assert/strict";

const { admitsMissingAnswer, kbAnswerHasGap, isWeakWebAnswer, onlyRedirects, isMapsSearchLink } = await import("./answerGaps.ts");

test("the Master in Data Science fee answer (21 Oct 2026) is a gap worth a web search", () => {
    const answer =
        "The provided information details recurring fees per year, charged after the minimum study duration based on the course structure. The full tuition fees for the Master in Data Science programme are not specified in the available documents.";
    assert.equal(admitsMissingAnswer(answer), true);
    assert.equal(kbAnswerHasGap(answer), true);
});

test("other explicit admissions are gaps", () => {
    for (const a of [
        "The retrieved documents do not include the application deadline for this intake.",
        "The documents don't specify the hostel fee for Sungai Long.",
        "The exam date is not stated in the provided information.",
        "There is no information on the Master of Architecture fee in the available records.",
        "The dean's name is not mentioned in the handbook.",
    ]) {
        assert.equal(admitsMissingAnswer(a), true, a);
    }
});

test("complete answers and ordinary negatives are not gaps (no needless web search)", () => {
    for (const a of [
        "The October 2026 trimester starts on 26 October 2026 for Kampar and 27 October 2026 for Sungai Long.",
        "Hostel fees are not included in the tuition fee; pay them separately to DSA.",
        "Students are not allowed to bring food into the library.",
        "This scholarship is not available to postgraduate students.",
        "The fee is RM 38,000 for the whole programme. Recurring fees are not charged after the minimum study duration.",
        "If your name is not listed in the results, contact DEAS.",
    ]) {
        assert.equal(admitsMissingAnswer(a), false, a);
    }
});

test("a long, substantive answer with a small note keeps the knowledge base", () => {
    const long = "### Programme structure\n" + "- Course details and credit hours for each trimester.\n".repeat(30) + "The elective list for 2027 is not specified in the available documents.";
    assert.equal(admitsMissingAnswer(long), true);
    assert.equal(kbAnswerHasGap(long), false);
});

test("the web fallback's own not-found replies are recognised", () => {
    assert.equal(isWeakWebAnswer("I couldn’t verify this from public UTAR information yet. 🔎"), true);
    assert.equal(isWeakWebAnswer("I’m having trouble checking official UTAR public sources right now. 🔎"), true);
    assert.equal(isWeakWebAnswer("The Master in Data Science fee is RM 38,000."), false);
});

test("a short answer that only points to a handbook is a gap (21 Oct 2026, FICT lab location)", () => {
    const a = 'For specific locations within the campus, you may refer to the "Maps of Faculty" section in the UTAR FICT Handbook 2026, which includes ground and first-floor map layouts.';
    assert.equal(onlyRedirects(a), true);
    assert.equal(kbAnswerHasGap(a), true);
    assert.equal(onlyRedirects("Please refer to the DSA website for the hostel application form."), true);
});

test("a real answer that also mentions a document is not a redirect", () => {
    const a = "The Networking Lab is in Block N, Level 1, Room N101 (Kampar). " + "It has 40 workstations and opens 8 am to 6 pm on weekdays. ".repeat(8) + "You may refer to the FICT Handbook for the floor map.";
    assert.equal(onlyRedirects(a), false);
    assert.equal(onlyRedirects("The lab is in Block N, Room N101."), false);
});

test("only Google Maps search links are allowed through", () => {
    assert.equal(isMapsSearchLink("https://www.google.com/maps/search/?api=1&query=Block+N+UTAR+Kampar+Campus"), true);
    assert.equal(isMapsSearchLink("https://maps.google.com/?q=somewhere"), false);
    assert.equal(isMapsSearchLink("https://evil.example.com/maps/search/?api=1&query=x"), false);
});
