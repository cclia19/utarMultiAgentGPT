import { test } from "node:test";
import assert from "node:assert/strict";

const { publishDraft, rollback, contentHash } = await import("./sync.ts");
const { FileVersionStore } = await import("./versionStore.ts");
const { RecordingPublisher } = await import("./publisher.ts");

const page = (body: string, date = "2026-10-10") =>
    `# Programme Structure\nSource: https://study.utar.edu.my/x.php\nOfficial UTAR web page, retrieved ${date}.\n\n${body}\n`;
const LONG = Array.from({ length: 40 }, (_, i) => `- YEAR 1: COURSE ${i}`).join("\n");

const draft = (text: string, extra: object = {}) => ({
    key: "web:study.utar.edu.my/x.php",
    unitId: "fict",
    storeName: "fileSearchStores/fict",
    title: "Structure Computer Science",
    origin: "web" as const,
    sourceUrl: "https://study.utar.edu.my/x.php",
    text,
    author: "sync:public",
    ...extra,
});

function setup() {
    return { store: new FileVersionStore(), publisher: new RecordingPublisher() };
}

test("a new page is published as v1 with metadata", async () => {
    const deps = setup();
    const item = await publishDraft(draft(page(LONG)), deps);
    assert.equal(item.outcome, "published");
    assert.equal(item.version, 1);
    assert.equal(deps.publisher.uploads[0].displayName, "Structure Computer Science (v1)");
    assert.equal(deps.publisher.uploads[0].metadata.kb_key, "web:study.utar.edu.my/x.php");
    assert.equal(deps.publisher.uploads[0].metadata.kb_version, 1);
    const doc = await deps.store.getDocument("web:study.utar.edu.my/x.php");
    assert.equal(doc?.liveVersion, 1);
    assert.equal(doc?.geminiDocument, "fileSearchStores/fict/documents/test-1");
});

test("the same content next month is skipped, even with a new retrieval date", async () => {
    const deps = setup();
    await publishDraft(draft(page(LONG, "2026-10-10")), deps);
    const item = await publishDraft(draft(page(LONG, "2026-11-01")), deps);
    assert.equal(item.outcome, "unchanged");
    assert.equal(deps.publisher.uploads.length, 1);
    assert.equal(contentHash(page(LONG, "2026-10-10")), contentHash(page(LONG, "2026-11-01")));
});

test("a changed page becomes v2 and the old document is removed after the upload", async () => {
    const deps = setup();
    await publishDraft(draft(page(LONG)), deps);
    const item = await publishDraft(draft(page(LONG + "\n- YEAR 3: NEW ELECTIVE")), deps);
    assert.equal(item.outcome, "published");
    assert.equal(item.version, 2);
    assert.deepEqual(deps.publisher.removed, ["fileSearchStores/fict/documents/test-1"]);
    assert.equal((await deps.store.listVersions("web:study.utar.edu.my/x.php")).length, 2);
});

test("a broken crawl is held and the live version stays", async () => {
    const deps = setup();
    await publishDraft(draft(page(LONG)), deps);
    const shrunk = await publishDraft(draft(page(Array.from({ length: 6 }, (_, i) => `- YEAR 1: HALF-LOADED COURSE ${i}`).join("\n"))), deps);
    assert.equal(shrunk.outcome, "held");
    assert.match(shrunk.detail!, /shrank from \d+ to \d+ chars; kept v1/);
    const empty = await publishDraft(draft("# x"), deps);
    assert.equal(empty.outcome, "held");
    assert.equal(deps.publisher.uploads.length, 1);
    // --force publishes it anyway; manual uploads are never held.
    assert.equal((await publishDraft(draft(page("- tiny but intended page ".repeat(10))), deps, { force: true })).outcome, "published");
    assert.equal((await publishDraft(draft("short note", { key: "manual:fict:note", origin: "manual" }), deps)).outcome, "published");
});

test("dry run changes nothing", async () => {
    const deps = setup();
    const item = await publishDraft(draft(page(LONG)), deps, { dryRun: true });
    assert.equal(item.outcome, "dry-run");
    assert.match(item.detail!, /^new \(\d+ chars\)$/);
    assert.equal(deps.publisher.uploads.length, 0);
    assert.equal(await deps.store.getDocument("web:study.utar.edu.my/x.php"), null);
});

test("a failed upload keeps the live version", async () => {
    const deps = setup();
    await publishDraft(draft(page(LONG)), deps);
    deps.publisher.upload = async () => {
        throw new Error("503 from Gemini");
    };
    const item = await publishDraft(draft(page(LONG + "\n- YEAR 3: NEW")), deps);
    assert.equal(item.outcome, "failed");
    assert.match(item.detail!, /live version unchanged: 503 from Gemini/);
    const doc = await deps.store.getDocument("web:study.utar.edu.my/x.php");
    assert.equal(doc?.liveVersion, 1);
    assert.deepEqual(deps.publisher.removed, []);
});

test("rollback publishes the old text again as the newest version", async () => {
    const deps = setup();
    await publishDraft(draft(page(LONG)), deps);
    await publishDraft(draft(page(LONG + "\n- YEAR 3: WRONG CHANGE")), deps);
    const item = await rollback("web:study.utar.edu.my/x.php", 1, "admin:avo", deps);
    assert.equal(item.outcome, "published");
    assert.equal(item.version, 3);
    const v3 = await deps.store.getVersion("web:study.utar.edu.my/x.php", 3);
    assert.equal(v3?.note, "rollback to v1");
    assert.equal(v3?.text, page(LONG));
});
