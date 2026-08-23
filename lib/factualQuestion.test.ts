import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeFactualQuestion } from "./factualQuestion.ts";

// Regression: this exact question was answered from model knowledge with
// sourceMode "none" (invented opening hours) instead of from the KB.
test("factual questions must never be trusted to the no-retrieval path", () => {
    for (const q of [
        "what is the operating hour of utar kampar library",
        "How do I apply for a transcript?",
        "who is the Dean of FICT",
        "berapa yuran pengajian",
        "apakah waktu operasi perpustakaan",
        "图书馆几点开门",
        "宿舍多少钱",
    ]) {
        assert.equal(looksLikeFactualQuestion(q), true, q);
    }
});

test("genuine small talk stays on the fast no-retrieval path", () => {
    for (const q of [
        "hi there",
        "thank you so much",
        "you are awesome",
        "good morning",
        "ok noted",
        "",
    ]) {
        assert.equal(looksLikeFactualQuestion(q), false, q);
    }
});
