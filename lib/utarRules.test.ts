import { test } from "node:test";
import assert from "node:assert/strict";

const { isStudentWorkQuestion } = await import("./utarRules.ts");

test("work and job permission questions get the Rule XX s.15 evidence", () => {
    for (const q of [
        "can utar full time student get a full time job",
        "can I do a part time job as a UTAR student?",
        "Am I allowed to work part-time while studying?",
        "can students run their own business",
        "boleh pelajar kerja sambilan?",
        "学生可以兼职吗",
    ]) {
        assert.equal(isStudentWorkQuestion(q), true, q);
    }
});

test("other job topics do not", () => {
    for (const q of ["when is the job fair", "where is the library", "how does the bus work", "what is the coursework weightage"]) {
        assert.equal(isStudentWorkQuestion(q), false, q);
    }
});
