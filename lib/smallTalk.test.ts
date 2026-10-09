import { test } from "node:test";
import assert from "node:assert/strict";

const { trySmallTalkReply, isCreatorQuestion, isLecturerRankingQuestion, AVO_DADDY_REPLY } = await import("./smallTalk.ts");

test("creator questions reach the Avo easter egg, however they are phrased", () => {
    for (const q of [
        "who built you",
        "who build you",
        "Who made you?",
        "who create u",
        "who developed this bot",
        "who is your creator",
        "who are your developers",
        "you were made by who?",
        "hi, who build you ah",
        "siapa buat awak",
        "谁创造了你",
    ]) {
        assert.equal(isCreatorQuestion(q), true, q);
        assert.match(trySmallTalkReply(q) ?? "", /AVO|Avo/, q);
    }
});

test("asking for the bot's daddy gets the daddy lore", () => {
    for (const q of ["whos your daddy", "who's ur daddy?", "Who is your dad", "你的爸爸是谁"]) {
        assert.equal(trySmallTalkReply(q), AVO_DADDY_REPLY, q);
    }
});

test("questions about the bot get an instant reply", () => {
    for (const [q, re] of [
        ["are you smart", /Smart enough/],
        ["Are you smart?", /Smart enough/],
        ["hey r u really clever", /Smart enough/],
        ["are you stupid", /get things wrong/],
        ["are you human?", /AI assistant/],
        ["are you a bot or human", /AI assistant/],
        ["are you chatgpt", /AI assistant/],
        ["who are you", /UTARCHAT/],
        ["what can you do?", /I can help with/],
        ["tell me about yourself", /UTARCHAT/],
    ] as const) {
        assert.match(trySmallTalkReply(q) ?? "", re, q);
    }
});

test("lecturer popularity questions get the playful reply instead of a faculty question", () => {
    for (const q of [
        "who is most popular lecturer",
        "Who is the best lecturer in FICT?",
        "favourite lecturer?",
        "who is the nicest prof",
        "pensyarah paling popular",
        "最受欢迎的讲师是谁",
    ]) {
        assert.equal(isLecturerRankingQuestion(q), true, q);
        assert.match(trySmallTalkReply(q) ?? "", /EXO/, q);
    }
});

test("real UTAR questions still go through the pipeline", () => {
    for (const q of [
        "can you tell me who the FICT dean is",
        "are you open on Sunday",
        "are you able to check my application status",
        "who made the decision to increase the fees",
        "who built UTAR",
        "who is the dean of FICT",
        "what are the intake dates",
        "who is the lecturer for Data Structures",
        "best way to apply for a scholarship",
        "who won the best lecturer award this year",
        "What can you tell me about the Kampar library opening hours and the fees for the October intake?",
        // Owned by the existing "most handsome lecturer" egg.
        "who is the most handsome lecturer",
    ]) {
        assert.equal(trySmallTalkReply(q), null, q);
    }
});
