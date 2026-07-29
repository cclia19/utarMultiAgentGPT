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

import { parseDeptCatalog, resolveDeptCodes } from "./staffDirectory.ts";
import { ORG_UNITS, getOrgUnitById } from "./orgUnits.ts";

const catalog = () => parseDeptCatalog(fixture("rdc.html"));

test("scrapes the department catalog out of the page's own select element", () => {
    const options = catalog();

    assert.ok(options.length > 90, `expected ~101 departments, got ${options.length}`);
    assert.ok(options.some((o) => o.code === "RGO" && o.label === "Registrar's Office"));
    assert.ok(options.some((o) => o.code === "RDC" && o.label.startsWith("Office of VP")));
    assert.ok(!options.some((o) => o.code === "ALL"), "the 'All' sentinel is not a department");
});

test("resolves a unit whose shortLabel matches the directory code", () => {
    assert.deepEqual(resolveDeptCodes(getOrgUnitById("fict"), catalog()), ["FICT"]);
});

test("resolves a unit by full name when its code does not match", () => {
    assert.deepEqual(resolveDeptCodes(getOrgUnitById("registrar"), catalog()), ["RGO"]);
    assert.deepEqual(resolveDeptCodes(getOrgUnitById("fbf"), catalog()), ["THP FBF"]);
});

test("prefers the code match over a misleading substring match", () => {
    // "innovation" appears in BOTH "Division of Innovation, Commercialisation and
    // Entrepreneurship" (DICE, correct) and "Centre for Curriculum Development and
    // Innovation" (CCDI, wrong). Code-match-first is what disambiguates.
    assert.deepEqual(resolveDeptCodes(getOrgUnitById("dice"), catalog()), ["DICE"]);
});

test("returns both campus codes for a unit the directory splits by campus", () => {
    const codes = resolveDeptCodes(getOrgUnitById("diss"), catalog());
    assert.ok(codes.length === 2, `expected two campus codes, got ${JSON.stringify(codes)}`);
    assert.ok(codes.some((c) => c.includes("KPR")));
    assert.ok(codes.some((c) => c.includes("SL")));
});

test("returns nothing for General UTAR, which is not a department", () => {
    assert.deepEqual(resolveDeptCodes(getOrgUnitById("general"), catalog()), []);
});

test("resolves every org unit except General UTAR", () => {
    const options = catalog();
    const unresolved = ORG_UNITS
        .filter((u) => u.id !== "general")
        .filter((u) => resolveDeptCodes(u, options).length === 0)
        .map((u) => u.id);

    assert.deepEqual(unresolved, [], `unresolved units: ${unresolved.join(", ")}`);
});

import { matchRole, findDeptCodesForRole } from "./staffDirectory.ts";

test("filters records down to the holders of the asked-about role", () => {
    const records = parseStaffCards(fixture("fict.html"));

    const deans = matchRole(records, "dean");
    assert.ok(deans.length >= 1);
    assert.ok(deans.every((r) => r.adminPosition), "role matches must have an admin position");
    assert.ok(deans.some((r) => r.name === "Prof Ts Dr Liew Soung Yue"));
});

test("does not let 'dean' swallow 'deputy dean' when the exact role exists", () => {
    const records = parseStaffCards(fixture("fict.html"));
    const deans = matchRole(records, "dean");

    assert.equal(deans.length, 1, "exact 'Dean' should win over the Deputy Deans");
    assert.equal(deans[0].adminPosition, "Dean");
});

test("returns nothing when no one holds the role", () => {
    const records = parseStaffCards(fixture("fict.html"));
    assert.deepEqual(matchRole(records, "chancellor"), []);
});

test("derives the three VP office codes from the catalog rather than a hardcoded list", () => {
    const codes = findDeptCodesForRole("vice president", catalog());

    assert.equal(codes.length, 3, `expected three VP offices, got ${JSON.stringify(codes)}`);
    assert.ok(codes.includes("IAD"));
    assert.ok(codes.includes("RDC"));
    assert.ok(codes.includes("SDAR"));
});

test("derives the registrar and president office codes from the catalog", () => {
    assert.deepEqual(findDeptCodesForRole("registrar", catalog()), ["RGO"]);
    assert.deepEqual(findDeptCodesForRole("president", catalog()), ["PRES"]);
});

import { htmlToVisibleText } from "./staffDirectory.ts";

test("reduces a directory page to visible text with no markup", () => {
    const text = htmlToVisibleText(fixture("rdc.html"));

    assert.ok(!text.includes("<"), "no tags should survive");
    assert.ok(!text.includes("text-align"), "no style attributes should survive");
    assert.ok(!/searchId/.test(text), "no markup identifiers should survive");
    assert.ok(!text.includes("Registrar's Office"), "the dept <select> should be stripped");

    // The facts an extractor needs must still be present.
    assert.ok(text.includes("Prof. Dr Zuraidah Binti Abd Manaf"));
    assert.ok(text.includes("Vice President (R&D and Commercialisation)"));
    assert.ok(text.includes("zuraidahm@utar.edu.my"));
});

test("visible text stays small enough to extract cheaply", () => {
    // ~1.3k chars for RDC, ~6.3k for FICT when measured during design.
    assert.ok(htmlToVisibleText(fixture("rdc.html")).length < 4000);
    assert.ok(htmlToVisibleText(fixture("fict.html")).length < 20000);
});



