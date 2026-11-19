import { test } from "node:test";
import assert from "node:assert/strict";

const { cvLines, parseExpertise, parseProjects, parsePublications, personBlock, cvId, isAcademic } = await import("./staffExpertise.ts");

const NAV = ["About Me", "Academic and Social Activities", "Awards", "Publication", "Research Project"].map((n) => `<li><a>${n}</a></li>`).join("");
const page = (body: string) => `<html><ul>${NAV}</ul><h1>Ts Dr Aun Yichiet</h1>${body}<p>Copyright &copy; 2026 Universiti Tunku Abdul Rahman | All Rights Reserved</p></html>`;

test("CV sections are read after the navigation and the name, without the footer", () => {
    const lines = cvLines(page("<h3>Research Project</h3><ul><li>deep learning in botnet detection , UTARRF , June 2019 - May 2020.</li></ul>"));
    assert.equal(lines[0], "Research Project");
    assert.ok(!lines.some((l) => /copyright/i.test(l)));
    assert.deepEqual(parseProjects(page("<h3>Research Project</h3><ul><li>deep learning in botnet detection , UTARRF , June 2019 - May 2020.</li></ul>")), [{ title: "deep learning in botnet detection", year: 2020 }]);
});

test("expertise areas and industry roles", () => {
    const r = parseExpertise(page("<h3>Area Of Expertise</h3><ol><li>Cognitive IoT</li><li>Self Healing Networks</li></ol><h3>Current Industry Experience</h3><ul><li></li></ul><p>Data Scientist and Project Manager</p><p>Malayan Flour Mill (MFM)</p><p>Suite 28.01, Level 28, Menara Citibank</p>"));
    assert.deepEqual(r.areas, ["Cognitive IoT", "Self Healing Networks"]);
    assert.deepEqual(r.industry, ["Data Scientist and Project Manager, Malayan Flour Mill (MFM)"]);
});

test("publication titles with plausible years only", () => {
    const pubs = parsePublications(page(`<ul><li>A, B , "SMART FACTORY ATTACK PROTECTION", Journal X, pp. 2079-2085, May 2024.</li><li>C , "Older work on networks", Conf Y, 2019.</li></ul>`));
    assert.deepEqual(pubs, [{ title: "Smart factory attack protection", year: 2024 }, { title: "Older work on networks", year: 2019 }]);
});

test("a person with nothing about their research gets no block; others name the person on every line", () => {
    const p = { name: "Dr X", adminPositions: [], jobTitle: "Lecturer", department: "FICT", email: "x@utar.edu.my" };
    assert.equal(personBlock(p, { profileUrl: "u", areas: [], industry: [], projects: [], publications: [] }), null);
    const b = personBlock(p, { profileUrl: "u", areas: [], industry: [], projects: [{ title: "IoT farming", year: 2025 }], publications: [] })!;
    assert.match(b, /Dr X has not listed areas of expertise/);
    assert.match(b, /Research projects of Dr X: IoT farming \(2025\)/);
});

test("academic staff and CV ids", () => {
    assert.equal(cvId("aunyc@utar.edu.my"), "aunyc");
    assert.equal(cvId("someone@gmail.com"), null);
    assert.equal(isAcademic({ name: "a", adminPositions: [], jobTitle: "Assistant Professor", department: "" }), true);
    assert.equal(isAcademic({ name: "a", adminPositions: [], jobTitle: "Assistant Laboratory Manager", department: "" }), false);
});
