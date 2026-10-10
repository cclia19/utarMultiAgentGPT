import { htmlToKbText } from "../normalize.ts";
import type { KbDraft } from "../types.ts";
import type { FetchHtml, Unit } from "./studyProgrammes.ts";

/**
 * Source: single official public pages (the portal's Academic Calendar link
 * points here). Each goes to the listed stores. (The Centre for Healthy
 * Minds page has no text content, only headings, so it is not included.)
 */
export const PUBLIC_PAGES: { url: string; title: string; unitIds: string[] }[] = [
    { url: "https://admission.utar.edu.my/intake-and-Academic-Calendar.php", title: "Intakes and academic calendar (DACE)", unitIds: ["dace"] },
];

export async function collectPublicPages(params: { fetchHtml: FetchHtml; units: Unit[]; author: string; only?: RegExp; retrieved?: string }) {
    const drafts: KbDraft[] = [];
    const problems: { url: string; problem: string; note?: boolean }[] = [];
    for (const page of PUBLIC_PAGES.filter((p) => !params.only || params.only.test(p.url) || params.only.test(p.title))) {
        const html = await params.fetchHtml(page.url);
        if (!html) {
            problems.push({ url: page.url, problem: "page could not be fetched" });
            continue;
        }
        const { text } = htmlToKbText(html, { url: page.url, title: page.title, retrieved: params.retrieved });
        for (const unitId of page.unitIds) {
            const unit = params.units.find((u) => u.id === unitId);
            const storeName = unit?.storeResourceIds?.[0];
            if (!storeName) {
                problems.push({ url: page.url, problem: `no knowledge store for "${unitId}"` });
                continue;
            }
            drafts.push({ key: `web:${unitId}:${page.url.replace(/^https?:\/\//, "")}`, unitId, storeName, title: page.title, origin: "web", sourceUrl: page.url, text, author: params.author });
        }
    }
    return { drafts, problems };
}
