import { test } from "node:test";
import assert from "node:assert/strict";

const { docxXmlToMarkdown, convertUpload } = await import("./convert.ts");
const { publishDraft, rollback } = await import("./sync.ts");
const { FileVersionStore } = await import("./versionStore.ts");
const { RecordingPublisher } = await import("./publisher.ts");

test("Word headings, lists and table rows become Markdown lines", () => {
    const xml = `<w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>7.3 Programme Structure</w:t></w:r></w:p>
<w:p><w:r><w:t>Fees &amp; charges apply.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Bring your IC</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>UCCM1363</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Discrete Mathematics</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;
    assert.equal(docxXmlToMarkdown(xml), "## 7.3 Programme Structure\nFees & charges apply.\n- Bring your IC\n- UCCM1363 | Discrete Mathematics");
});

test("unsupported files are refused with a clear message", async () => {
    await assert.rejects(convertUpload("timetable.xlsx", new Uint8Array([1]), "x"), /unsupported file type \.xlsx/);
});

test("a PDF is kept as the file, and rolling back republishes the old PDF", async () => {
    const deps = { store: new FileVersionStore(), publisher: new RecordingPublisher() };
    const pdf1 = await convertUpload("handbook.pdf", new Uint8Array([37, 80, 68, 70, 1]), "FICT Handbook");
    const pdf2 = await convertUpload("handbook.pdf", new Uint8Array([37, 80, 68, 70, 2]), "FICT Handbook");
    const base = { key: "manual:fict:handbook", unitId: "fict", storeName: "s/fict", title: "FICT Handbook", origin: "manual" as const, author: "admin" };
    await publishDraft({ ...base, text: pdf1.text, file: pdf1.file }, deps);
    await publishDraft({ ...base, text: pdf2.text, file: pdf2.file }, deps);
    assert.equal(deps.publisher.uploads[1].mimeType, "application/pdf");
    const item = await rollback("manual:fict:handbook", 1, "admin", deps);
    assert.equal(item.outcome, "published");
    assert.equal(item.version, 3);
    assert.deepEqual([...(await deps.store.getVersion("manual:fict:handbook", 3))!.file!.data], [37, 80, 68, 70, 1]);
});
