import { test } from "node:test";
import assert from "node:assert/strict";

const { clarificationNeedsTranslation } = await import("./clarifyLanguage.ts");

test("English clarification in 中文 or BM mode needs translating", () => {
    const q = "Could you please specify whether you intend to change a specific course or transfer to a different programme?";
    assert.equal(clarificationNeedsTranslation(q, "zh"), true);
    assert.equal(clarificationNeedsTranslation(q, "ms"), true);
    assert.equal(clarificationNeedsTranslation(q, "en"), false);
});

test("already in the chosen language: leave it", () => {
    assert.equal(clarificationNeedsTranslation("你是哪个学院的学生？", "zh"), false);
    assert.equal(clarificationNeedsTranslation("Anda dari fakulti mana?", "ms"), false);
});
