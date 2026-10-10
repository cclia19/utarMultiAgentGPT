import { test } from "node:test";
import assert from "node:assert/strict";

const { unitForFaculty, programmeFacts, programmeLinks } = await import("./studyProgrammes.ts");

const UNITS = [
    { id: "fict", name: "Faculty of Information and Communication Technology", shortLabel: "FICT", storeResourceIds: ["s/fict"] },
    { id: "fmhs", name: "M. Kandiah Faculty of Medicine and Health Sciences", shortLabel: "FMHS", storeResourceIds: ["s/fmhs"] },
    { id: "lkcfes", name: "Lee Kong Chian Faculty of Engineering and Science", shortLabel: "LKC FES", storeResourceIds: ["s/lkc"] },
    { id: "fbf", name: "Teh Hong Piow Faculty of Business and Finance", shortLabel: "THP FBF", storeResourceIds: ["s/fbf"] },
    { id: "fass", name: "Faculty of Arts and Social Science", shortLabel: "FAS", storeResourceIds: ["s/fas"] },
    { id: "fed", name: "Faculty of Education", shortLabel: "FED", storeResourceIds: ["s/fed"] },
    { id: "cfs-kampar", name: "Centre for Foundation Studies (Kampar Campus)", shortLabel: "CFS Kampar", storeResourceIds: ["s/cfsk"] },
    { id: "cfs-sungai-long", name: "Centre for Foundation Studies (Sungai Long Campus)", shortLabel: "CFS Sungai Long", storeResourceIds: ["s/cfss"] },
];

test("faculty names on the portal map to the right department store", () => {
    for (const [faculty, id] of [
        ["Faculty of Information and Communication Technology (FICT)", "fict"],
        ["M. Kandiah Faculty of Medicine and Health Science (MK FMHS)", "fmhs"],
        ["Lee Kong Chian Faculty of Engineering and Science (LKCFES)", "lkcfes"],
        ["Teh Hong Piow Faculty of Business and Finance (THP FBF)", "fbf"],
        ["Faculty of Arts and Social Science (FAS)", "fass"],
        ["Faculty of Education (FEd)", "fed"],
        ["Centre for Foundation Studies (Kampar Campus)", "cfs-kampar"],
        ["Centre for Foundation Studies (Sungai Long Campus)", "cfs-sungai-long"],
    ]) {
        assert.equal(unitForFaculty(faculty, UNITS)?.id, id, faculty);
    }
    assert.equal(unitForFaculty("Faculty of Something New (FSN)", UNITS), null);
});

test("faculty and structure link are read from a programme page", () => {
    const html = `<div><b>Faculty:</b></div><div><b>L</b>ee Kong Chian Faculty of Engineering and Science (LKCFES)</div>
      <a href="https://site.utar.edu.my:2083/3rdparty/rvsitebuilder/programme-structure-eee.php"><b>Programme Structure</b></a>
      <a href="programme-structure-eee.php"><b>Programme Structure</b></a> <a href="apply.php">Apply</a>`;
    assert.deepEqual(programmeFacts(html), {
        faculty: "Lee Kong Chian Faculty of Engineering and Science (LKCFES)",
        structureUrl: "https://study.utar.edu.my/programme-structure-eee.php",
    });
    assert.equal(programmeFacts(`<p>Faculty:</p><p>FICT</p><a href="structure-fintech.php">Programme Structure</a>`).structureUrl, "https://study.utar.edu.my/structure-fintech.php");
});

test("only programme links are taken from the listing, once each", () => {
    const html = `<a href="About-UTAR.php">About UTAR</a><a href="computer-science.php">Bachelor of Computer Science (Honours)</a>
      <a href="https://study.utar.edu.my/computer-science.php">Bachelor of Computer Science (Honours)</a>
      <a href="ACL.php">Bachelor of Arts (Honours) Applied Chinese Language (New)</a><a href="https://evil.example/x.php">Bachelor of Fake</a>`;
    assert.deepEqual(programmeLinks(html), [
        { url: "https://study.utar.edu.my/computer-science.php", name: "Bachelor of Computer Science (Honours)" },
        { url: "https://study.utar.edu.my/ACL.php", name: "Bachelor of Arts (Honours) Applied Chinese Language" },
    ]);
});
