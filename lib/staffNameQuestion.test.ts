import { test } from "node:test";
import assert from "node:assert/strict";

const { staffNameFromQuestion } = await import("./staffNameQuestion.ts");

test("named staff questions give the name to look up", () => {
    assert.equal(staffNameFromQuestion("who is Dr Liew Soung Yue?"), "Liew Soung Yue");
    assert.equal(staffNameFromQuestion("Who is Prof. Dr Choong Chee Keong"), "Choong Chee Keong");
    assert.equal(staffNameFromQuestion("who is goi bok min"), "goi bok min");
    assert.equal(staffNameFromQuestion("what is the email of Ts Tan Teik Boon"), "Tan Teik Boon");
    assert.equal(staffNameFromQuestion("Chiang Jeng Fong's email"), "Chiang Jeng Fong");
    assert.equal(staffNameFromQuestion("siapa Zuraidah"), "Zuraidah");
    assert.equal(staffNameFromQuestion("廖崇儒是谁"), "廖崇儒");
});

test("not a person's name: null", () => {
    for (const q of ["who is my supervisor", "who is eligible for the scholarship", "who is the dean of FICT", "who is responsible for hostel", "who are you", "who is avo", "how do I apply", "who is in charge of exams", "who is the best lecturer"]) {
        assert.equal(staffNameFromQuestion(q), null, q);
    }
});
