import { htmlToKbText } from "../normalize.ts";
import type { KbDraft } from "../types.ts";

/**
 * Source: every programme on study.utar.edu.my (public, no login).
 *
 * For each programme listed on the "by faculty" page: its overview page
 * (fees, duration, intakes, campus, entry requirements, careers) and its
 * programme-structure page (courses by year, electives), filed in the
 * faculty's store taken from the page's "Faculty:" line.
 */

export const STUDY_BASE = "https://study.utar.edu.my/";
const LISTING_PAGES = ["ug-programme-faculty.php", "foundation.php"];

export type Unit = { id: string; name: string; shortLabel?: string; storeResourceIds?: string[] };
export type FetchHtml = (url: string) => Promise<string | null>;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * "Faculty of Information and Communication Technology (FICT)" -> the unit.
 * Matches the bracketed short name first (with MK / THP prefixes and spaces
 * ignored), then the full name.
 */
export function unitForFaculty(faculty: string, units: Unit[]): Unit | null {
    const short = /\(([^)]+)\)\s*$/.exec(faculty)?.[1] ?? "";
    const shortKey = squash(short).replace(/^(mk|thp)/, "");
    if (shortKey) {
        const hit = units.find((u) => [u.id, u.shortLabel ?? ""].some((x) => squash(x).replace(/^(mk|thp)/, "") === shortKey));
        if (hit) return hit;
    }
    // "Centre for Foundation Studies (Kampar Campus)": the bracket is part of the name.
    const fullKey = squash(faculty);
    const nameKey = squash(faculty.replace(/\([^)]*\)\s*$/, "")).replace(/healthscience$/, "healthsciences");
    return (
        units.find((u) => squash(u.name) === fullKey) ??
        units.find((u) => squash(u.name) === nameKey || squash(u.name).endsWith(nameKey) || nameKey.endsWith(squash(u.name))) ??
        null
    );
}

/** Programme pages linked from the listing pages: [{ url, name }]. */
export function programmeLinks(listingHtml: string): { url: string; name: string }[] {
    const seen = new Set<string>();
    const out: { url: string; name: string }[] = [];
    for (const m of listingHtml.matchAll(/<a\b[^>]*href="([^"]+\.php)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const name = m[2].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        if (!/^(Bachelor|Foundation in|Doctor of|Master of|Diploma in)\b/i.test(name)) continue;
        const url = new URL(m[1], STUDY_BASE).toString();
        if (!url.startsWith(STUDY_BASE) || seen.has(url)) continue;
        seen.add(url);
        out.push({ url, name: name.replace(/\s*\((New|NEW)\)\s*$/, "") });
    }
    return out;
}

/** The "Faculty:" value and the programme-structure link on a programme page. */
export function programmeFacts(html: string): { faculty: string | null; structureUrl: string | null } {
    // Block tags end a line; inline tags (<b>L</b>ee ...) must not split words.
    const text = html
        .replace(/<\/?(p|div|br|li|td|th|tr|h[1-6]|ul|ol|table|section)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ");
    const faculty = /\n\s*Faculty:?\s*\n(?:\s*\n)*\s*([^\n]+?)\s*\n/i.exec(text)?.[1]?.trim() ?? null;
    // The "Programme Structure" button. Some pages first link the CMS editor's
    // address (site.utar.edu.my:2083/3rdparty/rvsitebuilder/<page>), which is
    // the same page on the public site.
    const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+\.php)"[^>]*>((?:(?!<\/a>)[\s\S])*)<\/a>/gi)]
        .filter((m) => /structure/i.test(m[2].replace(/<[^>]+>/g, " ")))
        .map((m) => m[1].replace(/^https?:\/\/site\.utar\.edu\.my(:\d+)?\/3rdparty\/rvsitebuilder\//i, ""));
    const href = hrefs.find((h) => !/^https?:/i.test(h)) ?? hrefs[0];
    return { faculty, structureUrl: href ? new URL(href, STUDY_BASE).toString() : null };
}

const keyFor = (url: string) => `web:${url.replace(/^https?:\/\//, "")}`;

/** `note` problems are informational (e.g. a Foundation page without a structure page). */
export type SourceResult = { drafts: KbDraft[]; problems: { url: string; problem: string; note?: boolean }[] };

export async function collectStudyProgrammes(params: {
    fetchHtml: FetchHtml;
    units: Unit[];
    author: string;
    only?: RegExp;
    limit?: number;
    retrieved?: string;
}): Promise<SourceResult> {
    const { fetchHtml, units, author, only, limit, retrieved } = params;
    const drafts: KbDraft[] = [];
    const problems: SourceResult["problems"] = [];

    const listings = await Promise.all(LISTING_PAGES.map((p) => fetchHtml(STUDY_BASE + p)));
    if (listings.every((l) => !l)) return { drafts, problems: [{ url: STUDY_BASE, problem: "programme listing pages could not be fetched" }] };
    let programmes = programmeLinks(listings.filter(Boolean).join("\n"));
    if (only) programmes = programmes.filter((p) => only.test(p.url) || only.test(p.name));
    if (limit) programmes = programmes.slice(0, limit);

    for (const programme of programmes) {
        const html = await fetchHtml(programme.url);
        if (!html) {
            problems.push({ url: programme.url, problem: "page could not be fetched" });
            continue;
        }
        const { faculty, structureUrl } = programmeFacts(html);
        const unit = faculty ? unitForFaculty(faculty, units) : null;
        const storeName = unit?.storeResourceIds?.[0];
        if (!unit || !storeName) {
            problems.push({ url: programme.url, problem: `no knowledge store for faculty "${faculty ?? "not stated"}"` });
            continue;
        }
        const context = [`Programme: ${programme.name}`, `Faculty: ${faculty}`];
        const overview = htmlToKbText(html, { url: programme.url, context, retrieved, linePrefix: programme.name });
        drafts.push({ key: keyFor(programme.url), unitId: unit.id, storeName, title: `${programme.name} (programme page)`, origin: "web", sourceUrl: programme.url, text: overview.text, author });

        if (!structureUrl) {
            problems.push({ url: programme.url, problem: "no programme structure page linked", note: true });
            continue;
        }
        const structureHtml = await fetchHtml(structureUrl);
        if (!structureHtml) {
            problems.push({ url: structureUrl, problem: "programme structure page could not be fetched" });
            continue;
        }
        const structure = htmlToKbText(structureHtml, { url: structureUrl, title: `Programme structure: ${programme.name}`, context, retrieved, linePrefix: programme.name });
        drafts.push({ key: keyFor(structureUrl), unitId: unit.id, storeName, title: `${programme.name} (programme structure)`, origin: "web", sourceUrl: structureUrl, text: structure.text, author });
    }
    return { drafts, problems };
}
