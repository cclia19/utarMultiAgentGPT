#!/usr/bin/env node
/**
 * Knowledge-base sync from the UTAR student intranet (login required).
 *
 *   node scripts/kb-portal-sync.mjs            # dry run: report only
 *   node scripts/kb-portal-sync.mjs --apply    # publish changes
 *   node scripts/kb-portal-sync.mjs --only regulations --apply
 *
 * A browser window opens at the portal. Sign in yourself (password and
 * CAPTCHA); the sync then continues on its own, collects only the sections
 * in lib/kb/sources/portal.ts and closes the window. Your password is never
 * read or stored; the window keeps its own browser profile in
 * ~/.utarchat-kb/portal-profile, so a still-valid session needs no sign-in.
 *
 * Versions: Postgres when DATABASE_URL is set, else kb-local-state.json.
 * Run monthly by the schedule installed with scripts/install-portal-schedule.sh.
 */
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./lib/loadEnv.mjs";

loadEnv();
const { chromium } = await import("playwright");
const { ORG_UNITS } = await import("../lib/orgUnits.ts");
const portal = await import("../lib/kb/sources/portal.ts");
const { PORTAL_SECTIONS, PORTAL_BASE, PORTAL_HOME, menuKeys, sectionLinks, portalKey, formsIndex } = portal;
const { unitForFaculty } = await import("../lib/kb/sources/studyProgrammes.ts");
const { publishAll, retireDocument } = await import("../lib/kb/sync.ts");
const { personalDataReason, isPersonalTitle } = await import("../lib/kb/personalData.ts");
const { pdfText } = await import("../lib/kb/pdfText.ts");

/**
 * Nothing with personal data is published (the chatbot is public): the
 * student-ID check runs on every PDF and page; the title check on
 * announcements (bar lists, results, slips, …).
 */
async function personalReason({ title, pdf, text, checkTitle }) {
    if (checkTitle && isPersonalTitle(title)) return "title names a list of students (bar list, results, slips, …)";
    const content = pdf ? await pdfText(pdf) : text;
    // A scanned announcement PDF cannot be checked, so it is not published.
    if (pdf && checkTitle && content.replace(/\s+/g, "").length < 100) return "scanned PDF without text, cannot be checked for personal data";
    return personalDataReason("", content);
}
const skipPersonal = (url, title, reason) => problems.push({ url, problem: `skipped (personal data): ${reason} – "${title}"`, note: true });
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
const LOGIN_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROFILE = path.join(os.homedir(), ".utarchat-kb", "portal-profile");
const retrieved = new Date().toISOString().slice(0, 10);

const notify = (message) =>
    process.platform === "darwin" &&
    execFile("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "UTARCHAT knowledge base"`], () => {});

// --- Where versions go, and whether anything is published -------------------
// Publishing must record versions in the shared database (the admin page and
// the other sync read them there); a local file would lose track of what is
// live and the next run would upload duplicates.
if (apply && !process.env.DATABASE_URL) {
    console.error("--apply needs DATABASE_URL (in .env.local or the environment). Dry runs work without it.");
    process.exit(2);
}

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
console.log(apply ? "Mode: APPLY (publishing to Gemini stores)" : "Mode: dry run (add --apply to publish)");

const units = new Map(ORG_UNITS.filter((u) => u.enabledForChat && u.storeResourceIds?.length).map((u) => [u.id, u]));
const wants = (id, title = "") => !only || only.test(id) || only.test(title);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date();

// --- Sign in ------------------------------------------------------------------
const context = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: { width: 1100, height: 800 } });
const page = context.pages()[0] ?? (await context.newPage());

async function signedIn() {
    try {
        const res = await context.request.get(PORTAL_HOME, { maxRedirects: 3 });
        const html = await res.text();
        return res.ok() && /intranetLogout|Logout/i.test(html) && !/loginPageV2|Secure User Login/i.test(html);
    } catch {
        return false;
    }
}

const drafts = [];
const problems = [];
let retireAnnouncements = null; // ids still current; other announcement documents are retired
try {
    await page.goto(`${PORTAL_BASE}default.jsp`);
    if (!(await signedIn())) {
        console.log("Sign in to the UTAR portal in the browser window that just opened. The sync continues by itself afterwards.");
        notify("Please sign in to the UTAR portal in the window that opened. The sync continues by itself.");
        const deadline = Date.now() + LOGIN_TIMEOUT_MS;
        while (!(await signedIn())) {
            if (Date.now() > deadline) throw new Error("not signed in within 20 minutes; nothing was changed");
            await page.waitForTimeout(3000);
        }
    }
    console.log("Signed in. Collecting portal sections…");
    await page.evaluate(() => {
        document.title = "UTARCHAT sync running… (you can leave this window)";
    }).catch(() => {});

    const home = await (await context.request.get(PORTAL_HOME)).text();
    const menu = menuKeys(home);

    for (const section of PORTAL_SECTIONS.filter((s) => wants(s.id, s.title))) {
        const url = section.path === "home" ? PORTAL_HOME : PORTAL_BASE + section.path;
        const res = await context.request.get(url);
        if (!res.ok()) {
            problems.push({ url, problem: `section page returned HTTP ${res.status()}` });
            continue;
        }
        const { documents, forms } = sectionLinks(section, section.path === "home" ? home : await res.text(), menu);
        console.log(`  ${section.title}: ${documents.length} documents, ${forms.length} forms`);

        for (const doc of documents) {
            const file = await context.request.get(doc.url).catch(() => null);
            const body = file && file.ok() ? await file.body() : null;
            const type = file?.headers()["content-type"] ?? "";
            if (file && file.status() === 404) {
                problems.push({ url: doc.url, problem: `broken link on the portal (HTTP 404) in "${section.title}": "${doc.title}"`, note: true });
                continue;
            }
            const isPdf = body && (/pdf/i.test(type) || body.subarray(0, 4).toString() === "%PDF");
            if (!isPdf) {
                problems.push({ url: doc.url, problem: body ? `not a PDF (${type})` : `could not be downloaded (HTTP ${file?.status() ?? "no response"})` });
                continue;
            }
            if (body.length > MAX_PDF_BYTES) {
                problems.push({ url: doc.url, problem: `larger than ${MAX_PDF_BYTES / 1024 / 1024} MB, skipped`, note: true });
                continue;
            }
            const personal = await personalReason({ title: doc.title, pdf: new Uint8Array(body) });
            if (personal) {
                skipPersonal(doc.url, doc.title, personal);
                continue;
            }
            for (const unitId of section.unitsFor(doc)) {
                const unit = units.get(unitId);
                if (!unit) {
                    problems.push({ url: doc.url, problem: `no knowledge store for "${unitId}"` });
                    continue;
                }
                drafts.push({
                    key: portalKey(doc.url, unitId),
                    unitId,
                    storeName: unit.storeResourceIds[0],
                    title: `${doc.title} (${section.title})`.slice(0, 300),
                    origin: "portal",
                    sourceUrl: doc.url,
                    text: `${doc.title} (PDF from the UTAR student intranet, ${section.title})`,
                    file: { data: new Uint8Array(body), mimeType: "application/pdf", name: decodeURIComponent(doc.url.split("/").pop() ?? "document.pdf") },
                    author: "sync:portal",
                });
            }
        }

        if (forms.length) {
            const byUnit = new Map();
            for (const f of forms) for (const unitId of section.unitsFor(f)) byUnit.set(unitId, [...(byUnit.get(unitId) ?? []), f]);
            for (const [unitId, list] of byUnit) {
                const unit = units.get(unitId);
                if (!unit) continue;
                drafts.push({
                    key: `portal:${unitId}:forms:${section.id}`,
                    unitId,
                    storeName: unit.storeResourceIds[0],
                    title: `${section.title}: forms`,
                    origin: "portal",
                    sourceUrl: url,
                    text: formsIndex(section, list, retrieved),
                    author: "sync:portal",
                });
            }
        }
    }

    // --- Programme structures: recent intakes, never ones made for one student
    if (wants("structures", "programme structures")) {
        console.log("  Programme structures…");
        const ajax = `${portal.STRUCTURE_BASE}AJAXSelect.jsp`;
        const post = async (form) => (await context.request.post(ajax, { form })).text();
        const unitList = [...units.values()];
        let programmes = 0;
        for (const level of portal.STRUCTURE_LEVELS) {
            const faculties = new Map(portal.parseSelectPairs(await post({ dataset: "queryGetFaculty", key: level, target: "reqFaculty", selected: "" })));
            for (const [facCode, facLabel] of faculties) {
                const byDept = portal.unitForDept(facLabel, new Set(units.keys()));
                const unit = unitForFaculty(`(${facLabel})`, unitList) ?? (byDept !== "general" ? units.get(byDept) : null);
                const courses = portal.parseSelectPairs(await post({ dataset: "queryGetCourse", key: level, key2: facCode, target: "reqCourse", selected: "" }));
                for (const [courseCode] of courses) {
                    const listUrl = `${portal.STRUCTURE_BASE}selectStructure.jsp?reqLevel=${level}&reqFaculty=${encodeURIComponent(facCode)}&reqCourse=${encodeURIComponent(courseCode)}`;
                    const rows = portal.keepStructures(portal.parseStructureList(await (await context.request.get(listUrl)).text()), now).slice(0, 6);
                    await pause(100);
                    if (!rows.length) continue;
                    if (!unit) {
                        problems.push({ url: listUrl, problem: `no knowledge store for faculty "${facLabel}"`, note: true });
                        continue;
                    }
                    const parts = [];
                    for (const row of rows) {
                        const md = portal.structureToMarkdown(await (await context.request.get(row.url)).text(), `${row.description} (${row.mode})`);
                        await pause(100);
                        if (md) parts.push(`### ${row.description} (${row.mode}, ${row.credits} credits, structure ${row.code})\n${md}`);
                    }
                    if (!parts.length) continue;
                    programmes++;
                    const name = rows[0].description;
                    drafts.push({
                        key: `portal:${unit.id}:structure:${level}-${facCode}-${courseCode}`,
                        unitId: unit.id,
                        storeName: unit.storeResourceIds[0],
                        title: `Programme structure (${facLabel} ${courseCode}): ${name}`.slice(0, 300),
                        origin: "portal",
                        sourceUrl: listUrl,
                        text: [
                            `# Programme structure: ${name}`,
                            `Source: UTAR student intranet, Course → Programme Structure (${facLabel}, programme code ${courseCode}), retrieved ${retrieved}. Recent intake structures, newest first; each course line names the intake structure it belongs to.`,
                            "",
                            ...parts,
                            "",
                        ].join("\n"),
                        author: "sync:portal",
                    });
                }
            }
        }
        console.log(`  Programme structures: ${programmes} programmes`);
    }

    // --- Announcements from the last 90 days, each in its department's store
    if (wants("announcements", "announcements")) {
        const list = portal.recentAnnouncements(portal.parseAnnouncementList(await (await context.request.get(portal.ANNOUNCEMENT_LIST)).text()), now);
        console.log(`  Announcements (last ${portal.ANNOUNCEMENT_DAYS} days): ${list.length}`);
        const unitIds = new Set(units.keys());
        for (const a of list) {
            if (isPersonalTitle(a.title)) {
                skipPersonal(a.url, a.title, "title names a list of students (bar list, results, slips, …)");
                continue;
            }
            const unitId = portal.unitForDept(a.dept, unitIds);
            const unit = units.get(unitId);
            const { text, attachments } = portal.announcementContent(await (await context.request.get(a.url)).text());
            await pause(100);
            const base = {
                key: `portal:${unitId}:ann:${a.id}`,
                unitId,
                storeName: unit.storeResourceIds[0],
                title: `${a.date} ${a.title} (${a.dept} announcement)`.slice(0, 300),
                origin: "portal",
                sourceUrl: a.url,
                author: "sync:portal",
            };
            const pdf = attachments[0] ?? (a.pdf ? { url: a.pdf, title: a.title } : null);
            if (pdf) {
                const res = await context.request.get(pdf.url).catch(() => null);
                const body = res && res.ok() ? await res.body() : null;
                if (body && body.length <= 10 * 1024 * 1024 && body.subarray(0, 4).toString() === "%PDF") {
                    const personal = await personalReason({ title: a.title, pdf: new Uint8Array(body), checkTitle: true });
                    if (personal) {
                        skipPersonal(a.url, a.title, personal);
                        continue;
                    }
                    drafts.push({ ...base, text: `${a.title} (${a.dept}, ${a.date})`, file: { data: new Uint8Array(body), mimeType: "application/pdf", name: decodeURIComponent(pdf.url.split("/").pop() ?? "attachment.pdf") } });
                    continue;
                }
            }
            if (text.length < 40) continue; // image-only announcement
            const personal = await personalReason({ title: a.title, text, checkTitle: true });
            if (personal) {
                skipPersonal(a.url, a.title, personal);
                continue;
            }
            drafts.push({
                ...base,
                text: `# ${a.title}\nUTAR announcement by ${a.dept}, ${a.date}. Source: ${a.url} (student intranet).\n\n${text}\n${attachments.map((l) => `- Attachment: ${l.title || l.url}`).join("\n")}\n`,
            });
        }
        retireAnnouncements = new Set(list.map((a) => a.id));
    }
} catch (error) {
    problems.push({ url: PORTAL_BASE, problem: error?.message || String(error) });
} finally {
    await context.close().catch(() => {});
}

// --- Publish ------------------------------------------------------------------
const startedAt = new Date().toISOString();
console.log(`${drafts.length} documents collected; ${problems.length} problems`);
const items = await publishAll(drafts, { store, publisher }, {
    dryRun: !apply,
    force,
    concurrency: 2,
    onItem: (i) => console.log(`${i.outcome.padEnd(10)} ${i.unitId.padEnd(16)} ${i.title}${i.detail ? `  (${i.detail})` : ""}`),
});
// Announcements that left the 90-day window come out of the store.
if (retireAnnouncements) {
    for (const doc of await store.listDocuments()) {
        const id = /:ann:(\d+)$/.exec(doc.key)?.[1];
        if (!id || !doc.liveVersion || retireAnnouncements.has(id)) continue;
        const item = await retireDocument(doc.key, `announcement older than ${portal.ANNOUNCEMENT_DAYS} days`, { store, publisher }, { dryRun: !apply });
        if (item) {
            items.push(item);
            console.log(`${item.outcome.padEnd(10)} ${item.unitId.padEnd(16)} ${item.title}`);
        }
    }
}

const run = {
    kind: apply ? "portal:apply" : "portal:dry-run",
    startedAt,
    finishedAt: new Date().toISOString(),
    items: [...items, ...problems.map((p) => ({ key: p.url, title: p.url, unitId: "", outcome: p.note ? "note" : "failed", detail: p.problem }))],
};
if (apply) await store.saveRun(run);

const count = (o) => run.items.filter((i) => i.outcome === o).length;
const report = [
    `# Portal sync (${run.kind})`,
    "",
    `${startedAt} → ${run.finishedAt}`,
    "",
    `- published: ${count("published")} · unchanged: ${count("unchanged")} · would change (dry run): ${count("dry-run")} · held: ${count("held")} · retired: ${count("retired")} · failed: ${count("failed")} · notes: ${count("note")}`,
    "",
    "| Outcome | Department | Document | Detail |",
    "| --- | --- | --- | --- |",
    ...run.items
        .sort((a, b) => a.outcome.localeCompare(b.outcome) || a.unitId.localeCompare(b.unitId))
        .map((i) => `| ${i.outcome} | ${i.unitId} | ${i.title.replace(/\|/g, "/")} | ${(i.detail ?? "").replace(/\|/g, "/")} |`),
];
await writeFile(path.join(OUT_DIR, "kb-portal-sync-report.md"), report.join("\n") + "\n");
await closeDb();
notify(count("failed") ? `Portal sync finished with ${count("failed")} problems. See kb-portal-sync-report.md` : `Portal sync finished: ${count("published")} updated, ${count("unchanged")} unchanged.`);
console.log(`\nReport: ${path.join(OUT_DIR, "kb-portal-sync-report.md")}`);
process.exit(count("failed") ? 1 : 0);
