import { test } from "node:test";
import assert from "node:assert/strict";

const { isStudentLifeQuestion } = await import("./studentLife.ts");

test("food, places, getting around, renting and advice are student-life questions", () => {
    for (const q of [
        "what to eat near UTAR Kampar",
        "best food in Kampar",
        "any good cafe near Sungai Long campus?",
        "where to eat supper in Kampar",
        "what to do in Kampar on weekends",
        "places to visit near Sungai Long",
        "things to do around Kampar",
        "how to get to Kampar from KL",
        "KTM from Ipoh to Kampar",
        "room for rent near UTAR Kampar",
        "cost of living in Kampar for students",
        "what laptop should I buy for computer science",
        "is a MacBook ok for FICT?",
        "study tips for finals",
        "Kampar 有什么好吃的？",
        "双溪龙周末去哪玩",
        "makan apa sedap dekat Kampar",
    ]) {
        assert.equal(isStudentLifeQuestion(q), true, q);
    }
});

test("UTAR rules, services and real UTAR questions are not", () => {
    for (const q of [
        "Can I bring food into the library?",
        "Are drinks allowed in the lecture hall?",
        "How do I apply for hostel?",
        "UTAR bus to Westlake",
        "When does the October trimester start?",
        "How much is the Computer Science fee?",
        "Who is the Dean of FICT?",
        "Can I rent a venue at UTAR for an event?",
        "What is the library opening hours?",
    ]) {
        assert.equal(isStudentLifeQuestion(q), false, q);
    }
});
