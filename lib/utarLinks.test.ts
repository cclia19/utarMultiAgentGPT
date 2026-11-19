import { test } from "node:test";
import assert from "node:assert/strict";

const { DIRECT_LINKS_RULE, contactRule, verifiedLinks } = await import("./utarLinks.ts");

test("the direct-links rule names the Student Portal with its URL", () => {
    assert.match(DIRECT_LINKS_RULE, /\[UTAR Portal \(Student Portal\)\]\(https:\/\/portal\.utar\.edu\.my\/\)/);
});

test("the contact rule anchors on the answering office", () => {
    const r = contactRule({ id: "oia", name: "Office of International Affairs", website: "https://oia.utar.edu.my/" });
    assert.match(r, /answered by Office of International Affairs \(website: https:\/\/oia\.utar\.edu\.my\/\)/);
    assert.match(r, /follow the web page/);
    assert.match(contactRule({ id: "general", name: "General UTAR" }), /one office/);
});

test("verified links include the systems and office websites", () => {
    const uris = verifiedLinks().map((l) => l.uri);
    assert.ok(uris.includes("https://portal.utar.edu.my/"));
    assert.ok(uris.includes("https://deas.utar.edu.my/"));
});
