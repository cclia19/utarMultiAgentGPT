import { test } from "node:test";
import assert from "node:assert/strict";

const { extractFollowUps, hideFollowUpLine, languageRule } = await import("./followUps.ts");

test("follow-up line is taken out of the answer and split into questions", () => {
    const answer = `You can apply for a supplementary exam on the Student Portal.

**Next step:** Register before the deadline.
FOLLOW-UPS: How much is the supplementary exam fee? | When are supplementary exams held? | Who do I contact at DEAS?

### 🔗 Official Links
- [DEAS](https://deas.utar.edu.my)`;
    const { text, followUps } = extractFollowUps(answer);
    assert.deepEqual(followUps, ["How much is the supplementary exam fee?", "When are supplementary exams held?", "Who do I contact at DEAS?"]);
    assert.doesNotMatch(text, /FOLLOW-UPS/);
    assert.match(text, /\*\*Next step:\*\* Register before the deadline\.\n\n### 🔗 Official Links/);
});

test("variants Gemini writes are understood; no line means no chips", () => {
    assert.deepEqual(extractFollowUps("Answer.\n**Follow-ups:** \"Fees?\" | 1. What about hostel? | Bus to Westlake").followUps, ["Fees?", "What about hostel?", "Bus to Westlake"]);
    assert.deepEqual(extractFollowUps("Hi there! 😊").followUps, []);
    assert.deepEqual(extractFollowUps("A\nFOLLOW-UPS: a | b | c | d | e five six | f seven eight | g nine ten").followUps, ["e five six", "f seven eight", "g nine ten"]);
});

test("streaming preview hides a half-written follow-up line", () => {
    assert.equal(hideFollowUpLine("The answer.\n\nFOLLOW-UPS: How much is"), "The answer.");
    assert.equal(hideFollowUpLine("The answer."), "The answer.");
});

test("language rule only for the three supported languages", () => {
    assert.match(languageRule("ms"), /Bahasa Melayu/);
    assert.match(languageRule("zh"), /简体中文/);
    assert.equal(languageRule("fr"), "");
    assert.equal(languageRule(undefined), "");
});
