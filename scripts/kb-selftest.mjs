#!/usr/bin/env node
/**
 * End-to-end check of the knowledge-base publisher against real Gemini, in a
 * temporary store that is deleted afterwards (the chatbot's stores are not
 * touched): publish v1, publish v2, confirm only v2 is left with its metadata,
 * ask a question that needs it, delete the store.
 *
 *   node scripts/kb-selftest.mjs
 */
import { loadEnv } from "./lib/loadEnv.mjs";
loadEnv();
const { ai, MODEL_NAME } = await import("../lib/gemini.ts");
const { GeminiPublisher } = await import("../lib/kb/publisher.ts");
const { FileVersionStore } = await import("../lib/kb/versionStore.ts");
const { publishDraft } = await import("../lib/kb/sync.ts");
const { fetchUtarHtml } = await import("../lib/kb/fetchHtml.ts");
const { htmlToKbText } = await import("../lib/kb/normalize.ts");

const url = "https://study.utar.edu.my/programme-structure-computer-science.php";
const html = await fetchUtarHtml(url);
if (!html) throw new Error("could not fetch " + url);
const page = htmlToKbText(html, { url, title: "Programme structure: Bachelor of Computer Science (Honours)", linePrefix: "Bachelor of Computer Science (Honours)" });

const created = await ai.fileSearchStores.create({ config: { displayName: "utarchat-kb-selftest (temporary)" } });
const storeName = created.name;
console.log("temporary store:", storeName);
let ok = true;
try {
    const deps = { store: new FileVersionStore(), publisher: new GeminiPublisher(ai) };
    const base = { key: "web:selftest/cs-structure", unitId: "fict", storeName, title: "CS structure (selftest)", origin: "web", sourceUrl: url, author: "selftest" };
    const v1 = await publishDraft({ ...base, text: page.text }, deps);
    console.log("v1:", v1.outcome, v1.detail ?? "");
    const v2 = await publishDraft({ ...base, text: page.text + "\n- Bachelor of Computer Science (Honours) · SELFTEST MARKER: QUANTUM BASKET WEAVING\n" }, deps);
    console.log("v2:", v2.outcome, v2.detail ?? "");

    const docs = [];
    for await (const d of await ai.fileSearchStores.documents.list({ parent: storeName })) docs.push(d);
    const meta = Object.fromEntries((docs[0]?.customMetadata ?? []).map((m) => [m.key, m.stringValue ?? m.numericValue]));
    console.log("documents in store:", docs.length, "|", docs.map((d) => d.displayName).join(", "), "|", JSON.stringify(meta));
    ok &&= docs.length === 1 && docs[0].displayName === "CS structure (selftest) (v2)" && Number(meta.kb_version) === 2;

    const answer = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: "Which Year 1 courses in Bachelor of Computer Science are mathematics courses? Also, what is the selftest marker?" }] }],
        config: { tools: [{ fileSearch: { fileSearchStoreNames: [storeName] } }], temperature: 0 },
    });
    const text = answer.text ?? "";
    console.log("answer:", text.replace(/\s+/g, " ").slice(0, 400));
    ok &&= /discrete mathematics/i.test(text) && /quantum basket weaving/i.test(text);
} catch (error) {
    ok = false;
    console.error(error);
} finally {
    await ai.fileSearchStores.delete({ name: storeName, config: { force: true } });
    console.log("temporary store deleted");
}
console.log(ok ? "SELFTEST PASSED" : "SELFTEST FAILED");
process.exit(ok ? 0 : 1);
