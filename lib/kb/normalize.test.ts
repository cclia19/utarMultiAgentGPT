import { test } from "node:test";
import assert from "node:assert/strict";

const { htmlToKbText, elementById } = await import("./normalize.ts");

const PAGE = `<html><head><title>Structure Computer Science</title></head><body>
<div id="selected_navigator"><ul><li><a href="x.php">About UTAR</a></li><li>Programmes</li></ul></div>
<div id="editable_area_content"><div class="x">
<h2>Programme Structure: Bachelor of Computer Science (Honours)</h2>
<table><tbody><tr><th><b>YEAR 1</b></th></tr><tr><td><ul>
<li>PROGRAMMING CONCEPTS AND PRACTICES </li><li><b>MPU1* </b></li><li>DISCRETE MATHEMATICS</li></ul></td></tr></tbody></table>
<p>Fees: RM55,100 &amp; more</p>
<h3>Career Prospects:</h3><ul><li>Software Engineer</li></ul>
<script>var x = "<li>not content</li>";</script>
</div></div>
<div id="selected_footer"><p>Copyright UTAR</p></div></body></html>`;

test("only the page content is kept, with each item on its own line", () => {
    const { text, title } = htmlToKbText(PAGE, { url: "https://study.utar.edu.my/ps.php", retrieved: "2026-10-10", linePrefix: "Bachelor of Computer Science (Honours)" });
    assert.equal(title, "Structure Computer Science");
    assert.match(text, /^# Structure Computer Science\nSource: https:\/\/study\.utar\.edu\.my\/ps\.php\nOfficial UTAR web page, retrieved 2026-10-10\./);
    assert.match(text, /^### YEAR 1$/m);
    assert.match(text, /^- Bachelor of Computer Science \(Honours\) · YEAR 1: DISCRETE MATHEMATICS$/m);
    assert.match(text, /^Fees: RM55,100 & more$/m);
    assert.match(text, /^- Bachelor of Computer Science \(Honours\) · Career Prospects: Software Engineer$/m);
    assert.doesNotMatch(text, /About UTAR|Copyright|not content/);
});

test("nested elements with the same tag are matched to the right closing tag", () => {
    const html = `<div id="a"><div>inner</div><p>after</p></div><div>outside</div>`;
    assert.equal(elementById(html, "a"), `<div>inner</div><p>after</p>`);
    assert.equal(elementById(html, "missing"), null);
});
