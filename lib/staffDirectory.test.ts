import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseStaffCards, countExpectedRecords } from "./staffDirectory.ts";

const fixture = (name: string) =>
    fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "latin1");

test("parses EVERY record on the page, not just the ones with profile links", () => {
    // A parser anchored on searchId drops staff without profile links while still
    // passing field-level tests. This assertion catches that invariant violation.
    for (const name of ["rdc.html", "rgo-loh.html", "fict.html"]) {
        const html = fixture(name);
        const records = parseStaffCards(html);
        assert.equal(
            records.length,
            countExpectedRecords(html),
            `${name}: parsed ${records.length} but page contains ${countExpectedRecords(html)} staff`
        );
    }
});

test("extracts profileUrl for every FICT record, accepting numeric and alphanumeric searchIds", () => {
    const html = fixture("fict.html");
    const records = parseStaffCards(html);
    assert.equal(records.length, countExpectedRecords(html));

    assert.ok(
        records.every((r) => r.profileUrl && /staffListDetailV2\.jsp\?searchId=[\w-]+$/.test(r.profileUrl)),
        "every FICT record has a valid profileUrl matching numeric or alphanumeric searchId"
    );
    assert.ok(records.every((r) => r.name && r.email), "every record has name and email");
});

test("parses a card that has an administrative position", () => {
    const html = fixture("rdc.html");
    const records = parseStaffCards(html);
    assert.equal(records.length, countExpectedRecords(html));

    const vp = records.find((r) => r.adminPosition?.includes("Vice President"));

    assert.ok(vp, "expected a Vice President record in the RDC fixture");
    assert.equal(vp.name, "Prof. Dr Zuraidah Binti Abd Manaf");
    assert.equal(vp.adminPosition, "Vice President (R&D and Commercialisation)");
    assert.equal(vp.jobTitle, "Professor");
    assert.equal(vp.department, "Faculty of Accountancy and Management");
    assert.equal(vp.email, "zuraidahm@utar.edu.my");
    assert.match(vp.profileUrl ?? "", /staffListDetailV2\.jsp\?searchId=[\w-]+$/);
});

test("parses a card that has no administrative position", () => {
    const html = fixture("rdc.html");
    const records = parseStaffCards(html);
    assert.equal(records.length, countExpectedRecords(html));

    const staff = records.find((r) => r.name.includes("Aswini"));

    assert.ok(staff, "expected the Aswini record");
    assert.equal(staff.adminPosition, undefined);
    assert.equal(staff.jobTitle, "Senior Assistant Manager");
    assert.equal(staff.department, "Office of VP (R&D and Commercialisation)");
});

test("joins multiple phone numbers and does not mistake one for a division", () => {
    const html = fixture("rgo-loh.html");
    const records = parseStaffCards(html);
    assert.equal(records.length, countExpectedRecords(html));

    const loh = records[0];
    assert.equal(loh.name, "Ms Loh Siaw Yien");
    assert.equal(loh.adminPosition, "Registrar");
    assert.equal(loh.department, "Registrar's Office");
    assert.equal(loh.email, "lohsy@utar.edu.my");
    assert.equal(loh.division, undefined, "the 05-468 8888 phone must not land in division");
    assert.match(loh.phone ?? "", /05-468 8888 ext: 2517/);
    assert.match(loh.phone ?? "", /03-90860288 ext: 386/);
});

test("parses division when present and finds faculty leadership", () => {
    const html = fixture("fict.html");
    const records = parseStaffCards(html);
    assert.equal(records.length, countExpectedRecords(html));
    assert.ok(records.length > 10, "FICT fixture should hold many staff");

    const dean = records.find((r) => r.adminPosition === "Dean");
    assert.ok(dean, "expected a Dean record");
    assert.equal(dean.name, "Prof Ts Dr Liew Soung Yue");
    assert.equal(dean.department, "Faculty of Information and Communication Technology");
    assert.equal(dean.division, "Department of Computer and Communication Technology");

    const deputies = records.filter((r) => r.adminPosition?.startsWith("Deputy Dean"));
    assert.ok(deputies.length >= 3, "expected at least three Deputy Deans");
});

test("strips the page's non-UTF8 padding bytes out of parsed text", () => {
    const html = fixture("rgo-loh.html");
    const records = parseStaffCards(html);
    assert.equal(records.length, countExpectedRecords(html));

    for (const r of records) {
        const all = [r.name, r.adminPosition, r.jobTitle, r.department, r.phone, r.email]
            .filter(Boolean)
            .join(" ");
        assert.ok(!all.includes("\u00A0"), "no raw non-breaking space should survive");
        assert.ok(!all.includes("\uFFFD"), "no replacement character should survive");
        assert.equal(all, all.replace(/\s{2,}/g, " "), "no doubled whitespace should survive");
    }
});
