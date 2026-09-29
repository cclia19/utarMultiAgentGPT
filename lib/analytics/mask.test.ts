import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPersonalData } from "./mask.ts";

test("masks IC numbers", () => {
    assert.equal(maskPersonalData("my ic is 900101-14-5678 ok"), "my ic is [IC] ok");
    assert.equal(maskPersonalData("ic 900101145678"), "ic [IC]");
});

test("masks phone numbers", () => {
    assert.equal(maskPersonalData("call me 012-3456789"), "call me [PHONE]");
    assert.equal(maskPersonalData("call +6012 345 6789 pls"), "call [PHONE] pls");
});

test("masks emails", () => {
    assert.equal(maskPersonalData("email ali@1utar.my now"), "email [EMAIL] now");
});

test("masks student IDs and long numbers", () => {
    assert.equal(maskPersonalData("my id 2104567 cannot login"), "my id [NUMBER] cannot login");
    assert.equal(maskPersonalData("card 4111 1111 1111 1111"), "card [NUMBER]");
});

test("keeps ordinary text, money and years", () => {
    const q = "Is the fee RM55,100 for 2026 intake?";
    assert.equal(maskPersonalData(q), q);
});
