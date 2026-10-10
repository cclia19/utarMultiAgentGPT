#!/usr/bin/env node
/**
 * Knowledge-base sync from official UTAR web pages.
 *
 *   node scripts/kb-sync.mjs                         # dry run: report only, nothing changes
 *   node scripts/kb-sync.mjs --apply                 # publish changes to the Gemini stores
 *   node scripts/kb-sync.mjs --only computer-science --apply
 *   node scripts/kb-sync.mjs --force --only <page>   # publish a page the safeguards held
 *   node scripts/kb-sync.mjs --out-dir reports      # where kb-sync-report.md goes
 *
 * Versions are kept in Postgres when DATABASE_URL is set (production), else in
 * kb-local-state.json next to the repo (local trials). Writes kb-sync-report.md.
 * Run monthly by .github/workflows/kb-sync.yml.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnv } from "./lib/loadEnv.mjs";

loadEnv();
const { ORG_UNITS } = await import("../lib/orgUnits.ts");
const { collectStudyProgrammes } = await import("../lib/kb/sources/studyProgrammes.ts");
const { fetchUtarHtml } = await import("../lib/kb/fetchHtml.ts");
const { publishAll } = await import("../lib/kb/sync.ts");
const { FileVersionStore, PostgresVersionStore } = await import("../lib/kb/versionStore.ts");
const { GeminiPublisher, RecordingPublisher } = await import("../lib/kb/publisher.ts");

const args = process.argv.slice(2);
const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};
const apply = args.includes("--apply");
const force = args.includes("--force");
const only = opt("--only") ? new RegExp(opt("--only"), "i") : undefined;
const limit = opt("--limit") ? Number(opt("--limit")) : undefined;
const OUT_DIR = opt("--out-dir") ? path.resolve(opt("--out-dir")) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let store;
let closeDb = async () => {};
if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 2, prepare: false });
    closeDb = () => sql.end();
    store = new PostgresVersionStore(sql);
    console.log("Versions: Postgres (DATABASE_URL)");
} else {
    store = new FileVersionStore(path.join(OUT_DIR, "kb-local-state.json"));
    console.log("Versions: kb-local-state.json (no DATABASE_URL)");
}

let publisher = new RecordingPublisher();
if (apply) {
    const { ai } = await import("../lib/gemini.ts");
    publisher = new GeminiPublisher(ai);
}
console.log(apply ? "Mode: APPLY (publishing to Gemini stores)" : "Mode: dry run (nothing is changed; add --apply to publish)");

const startedAt = new Date().toISOString();
const units = ORG_UNITS.filter((u) => u.enabledForChat);
console.log("Collecting study.utar.edu.my programmes…");
const { drafts, problems } = await collectStudyProgrammes({ fetchHtml: fetchUtarHtml, units, author: "sync:public", only, limit });
console.log(`${drafts.length} documents from ${new Set(drafts.map((d) => d.sourceUrl)).size} pages; ${problems.length} problems`);

const items = await publishAll(drafts, { store, publisher }, {
    dryRun: !apply,
    force,
    onItem: (i) => console.log(`${i.outcome.padEnd(10)} ${i.unitId.padEnd(8)} ${i.title}${i.detail ? `  (${i.detail})` : ""}`),
});
const run = { kind: apply ? "public:apply" : "public:dry-run", startedAt, finishedAt: new Date().toISOString(), items: [...items, ...problems.map((p) => ({ key: p.url, title: p.url, unitId: "", outcome: p.note ? "note" : "failed", detail: p.problem }))] };
if (apply) await store.saveRun(run);

const count = (o) => run.items.filter((i) => i.outcome === o).length;
const lines = [
    `# Knowledge-base sync (${run.kind})`,
    ``,
    `${startedAt} → ${run.finishedAt}`,
    ``,
    `- published: ${count("published")} · unchanged: ${count("unchanged")} · would change (dry run): ${count("dry-run")} · held for review: ${count("held")} · failed: ${count("failed")}`,
    ``,
    `| Outcome | Department | Document | Detail |`,
    `| --- | --- | --- | --- |`,
    ...run.items
        .sort((a, b) => a.outcome.localeCompare(b.outcome) || a.unitId.localeCompare(b.unitId))
        .map((i) => `| ${i.outcome} | ${i.unitId} | ${i.title.replace(/\|/g, "/")} | ${(i.detail ?? "").replace(/\|/g, "/")} |`),
];
await writeFile(path.join(OUT_DIR, "kb-sync-report.md"), lines.join("\n") + "\n");
await closeDb();
console.log(`\nReport: ${path.join(OUT_DIR, "kb-sync-report.md")}`);
process.exit(count("failed") ? 1 : 0);
