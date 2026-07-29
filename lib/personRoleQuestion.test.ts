import { test } from "node:test";
import assert from "node:assert/strict";
import { isPersonRoleQuestion } from "./personRoleQuestion.ts";

test("fires on questions asking who holds a position", () => {
    for (const q of [
        "who is utar vice president",
        "who is utar head of registrar",
        "who is the dean of FICT",
        "who's the HOD for computer science",
        "who is the president of UTAR",
    ]) {
        assert.equal(isPersonRoleQuestion(q).isRoleQuestion, true, `should fire: ${q}`);
    }
});

test("does not fire on questions that merely mention people or contact details", () => {
    for (const q of [
        "what's the FICT general office email",
        "how do I contact the faculty",
        "what research does UTAR do in AI",
        "where is the registrar's office located",
        "what are the office hours",
    ]) {
        assert.equal(isPersonRoleQuestion(q).isRoleQuestion, false, `should not fire: ${q}`);
    }
});

test("extracts the role phrase for directory matching", () => {
    assert.match(isPersonRoleQuestion("who is utar vice president").rolePhrase, /vice president/i);
    assert.match(isPersonRoleQuestion("who is the dean of FICT").rolePhrase, /dean/i);
    assert.match(isPersonRoleQuestion("who is utar head of registrar").rolePhrase, /registrar/i);
});

test("does not fire on sub-word boundary matches", () => {
    for (const q of [
        "who is the workshop coordinator",
        "who is orthodox",
    ]) {
        assert.equal(isPersonRoleQuestion(q).isRoleQuestion, false, `should not fire on sub-word: ${q}`);
    }
});

test("handles curly apostrophe in who's questions", () => {
    const res = isPersonRoleQuestion("who’s the dean of FICT");
    assert.equal(res.isRoleQuestion, true);
    assert.match(res.rolePhrase, /dean/i);
});

test("does not fire on eligibility, permission, or rule questions", () => {
    for (const q of [
        "who is eligible for the dean list",
        "who is allowed to sign the HOD form",
    ]) {
        assert.equal(isPersonRoleQuestion(q).isRoleQuestion, false, `should not fire on rule question: ${q}`);
    }
});

test("applies longest match rule across combined abbreviations and explicit terms", () => {
    const res = isPersonRoleQuestion("who is the hod or deputy dean");
    assert.equal(res.isRoleQuestion, true);
    assert.equal(res.rolePhrase, "deputy dean");
});

test("supports plural role phrasing", () => {
    const res = isPersonRoleQuestion("who are the deputy deans");
    assert.equal(res.isRoleQuestion, true);
    assert.match(res.rolePhrase, /deputy dean/i);
});

