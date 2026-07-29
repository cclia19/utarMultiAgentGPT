const DIRECTORY_ORIGIN = "https://www2.utar.edu.my";

export interface StaffRecord {
    name: string;
    adminPosition?: string;
    jobTitle?: string;
    department: string;
    division?: string;
    phone?: string;
    email?: string;
    profileUrl?: string; // absent for staff with no profile page
}

const EMAIL_RE = /[\w.+-]+@[\w.-]*utar\.edu\.my/g;

/**
 * Ground-truth record count, obtained WITHOUT parsing: every staff card carries
 * exactly one UTAR email. Comparing this against the parsed count detects parser
 * drift the moment UTAR changes their markup.
 */
export function countExpectedRecords(html: string): number {
    return new Set(html.match(EMAIL_RE) ?? []).size;
}

/**
 * The directory page is served as latin-1 and pads extensions with 0xA0.
 * Mojibake in retrieved text has broken retrieval in this project before,
 * so normalise aggressively before anything downstream sees it.
 */
function sanitize(value: string): string {
    return value
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[\u00A0\uFFFD]/g, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const PHONE_RE = /\d{2,4}\s*-\s*\d[\d\s]{5,}/;

export function parseStaffCards(html: string): StaffRecord[] {
    const records: StaffRecord[] = [];

    // Anchor on the card body div, NOT on searchId. Staff without a profile page
    // have no searchId, and anchoring on it drops them silently.
    const cardRe = /<div[^>]*text-align:left[^>]*>([\s\S]*?)<\/div>/g;

    for (const match of html.matchAll(cardRe)) {
        const body = match[1];
        if (!body.includes("@")) continue;

        const bolds = [...body.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => sanitize(m[1]));
        const name = bolds[0] || "";
        if (!name) continue;

        const adminPosition = bolds[1] || undefined;
        const jobTitle = sanitize((body.match(/<i>([\s\S]*?)<\/i>/) || [])[1] || "") || undefined;
        const email = (body.match(/[\w.+-]+@[\w.-]*utar\.edu\.my/) || [])[0];

        // searchId, when present, sits in the enclosing table tag just before the card body.
        const cardStart = html.lastIndexOf("<table", match.index ?? 0);
        const preceding = html.slice(cardStart >= 0 ? cardStart : Math.max(0, (match.index ?? 0) - 1200), match.index);
        const searchIdMatch = preceding.match(/searchId=([\w-]+)/);
        const searchId = searchIdMatch ? searchIdMatch[1] : undefined;

        // Remove the fields already captured, then read whatever text is left.
        const rest = body
            .replace(/<b>[\s\S]*?<\/b>/g, "\n")
            .replace(/<i>[\s\S]*?<\/i>/g, "\n")
            .replace(/<span[^>]*333399[^>]*>[\s\S]*?<\/span>/g, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "\n");

        const lines = rest.split("\n").map(sanitize).filter(Boolean);
        const phones = lines.filter((line) => PHONE_RE.test(line));
        const orgLines = lines.filter((line) => !phones.includes(line) && !line.includes("@"));

        records.push({
            name,
            adminPosition,
            jobTitle,
            department: orgLines[0] || "",
            division: orgLines[1] || undefined,
            phone: phones.join(" / ") || undefined,
            email,
            profileUrl: searchId
                ? `${DIRECTORY_ORIGIN}/staffListDetailV2.jsp?searchId=${searchId}`
                : undefined,
        });
    }

    return records;
}

import type { OrgUnit } from "./orgUnits";

export interface DeptOption {
    code: string;
    label: string;
}

export function parseDeptCatalog(html: string): DeptOption[] {
    const select = html.match(/<select[^>]*name="searchDept"[\s\S]*?<\/select>/);
    if (!select) return [];

    const options: DeptOption[] = [];

    for (const m of select[0].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)) {
        const code = m[1].trim();
        const label = sanitize(m[2]);
        if (!code || code === "ALL" || !label) continue;
        options.push({ code, label });
    }

    return options;
}

const STOPWORDS = /\b(the|of|and|for|s|amp)\b/g;

function normalizeLabel(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(STOPWORDS, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function codeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokens(value: string): Set<string> {
    return new Set(normalizeLabel(value).split(" ").filter((t) => t.length > 2));
}

/**
 * Maps an OrgUnit onto directory department codes using only the live catalog,
 * so a UTAR reorganisation needs no code change.
 *
 * Order is load-bearing and must not be rearranged:
 *   1. code match   - shortLabel/id against the option code
 *   2. exact name   - full name against the option label
 *   3. token overlap - accepted only at >= 0.6
 *
 * `aliases` is deliberately NOT consulted. Aliases are short and ambiguous by
 * design (tuned for routing), and matching on them sends `dice` to CCDI.
 *
 * Returns every option that ties for the winning score, so units the directory
 * splits across campuses yield both codes.
 */
export function resolveDeptCodes(unit: OrgUnit, catalog: DeptOption[]): string[] {
    if (!catalog.length) return [];

    const byCode = catalog.filter((o) => {
        const oCodeKey = codeKey(o.code);
        const oBaseCodeKey = codeKey(o.code.split("-")[0]);
        const shortKey = codeKey(unit.shortLabel);
        const idKey = codeKey(unit.id);
        return (
            oCodeKey === shortKey ||
            oCodeKey === idKey ||
            oBaseCodeKey === shortKey ||
            oBaseCodeKey === idKey
        );
    });
    if (byCode.length) return byCode.map((o) => o.code);

    const unitName = normalizeLabel(unit.name);
    const byName = catalog.filter((o) => normalizeLabel(o.label) === unitName);
    if (byName.length) return byName.map((o) => o.code);

    const unitTokens = tokens(unit.name);
    let best = 0;
    const scored: Array<{ code: string; score: number }> = [];

    for (const option of catalog) {
        const optionTokens = tokens(option.label);
        const shared = [...unitTokens].filter((t) => optionTokens.has(t)).length;
        const score = shared / Math.max(unitTokens.size, optionTokens.size, 1);
        scored.push({ code: option.code, score });
        if (score > best) best = score;
    }

    if (best < 0.6) return [];
    return scored.filter((s) => s.score === best).map((s) => s.code);
}

/**
 * Role vocabulary. This is the one place a role phrase is written down, and it
 * maps to a SEARCH FRAGMENT matched against live catalog labels — never to a
 * department code. Adding a role is a one-line data edit; renaming a UTAR
 * department needs no edit at all.
 */
const ROLE_LABEL_HINTS: Array<{ role: RegExp; labelFragment: RegExp }> = [
    { role: /\bvice\s*president|\bvp\b|\bdeputy\s*president\b/i, labelFragment: /^office of vp\b/i },
    { role: /\bregistrar\b|\bregistra\b|\bregistar\b|\brgo\b/i, labelFragment: /^registrar/i },
    { role: /\bpresident\b|\bceo\b|\bchief executive\b/i, labelFragment: /^president/i },
];

export function findDeptCodesForRole(rolePhrase: string, catalog: DeptOption[]): string[] {
    for (const hint of ROLE_LABEL_HINTS) {
        if (!hint.role.test(rolePhrase)) continue;

        const codes = catalog
            .filter((o) => hint.labelFragment.test(o.label))
            .map((o) => o.code);

        if (codes.length) return codes;
    }

    return [];
}

/**
 * Narrows records to those whose administrative position matches the phrase the
 * user asked about. Matching runs against whatever `adminPosition` strings the
 * directory returned, so new or renamed positions work with no code change.
 *
 * Exact matches win outright: asking for the "dean" must not also return the
 * three Deputy Deans.
 */
export function matchRole(records: StaffRecord[], rolePhrase: string): StaffRecord[] {
    const wanted = normalizeLabel(rolePhrase);
    if (!wanted) return [];

    const held = records.filter((r) => r.adminPosition);

    const exact = held.filter((r) => normalizeLabel(r.adminPosition!) === wanted);
    if (exact.length) return exact;

    const leading = held.filter((r) => normalizeLabel(r.adminPosition!).startsWith(wanted));
    if (leading.length) return leading;

    return held.filter((r) => normalizeLabel(r.adminPosition!).includes(wanted));
}

const SEARCH_URL = `${DIRECTORY_ORIGIN}/staffListSearchV2.jsp`;
const FETCH_TIMEOUT_MS = 8000;
const STAFF_CACHE_TTL = 6 * 60 * 60 * 1000;
const CATALOG_CACHE_TTL = 24 * 60 * 60 * 1000;

const staffCache = new Map<string, { at: number; records: StaffRecord[] }>();
let catalogCache: { at: number; options: DeptOption[] } | null = null;

async function fetchDirectoryHtml(params: { dept: string; name: string }): Promise<string> {
    const query = new URLSearchParams({
        searchDept: params.dept,
        searchDiv: "All",
        searchName: params.name,
        searchExpertise: "",
        submit: "Search",
        searchResult: "Y",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(`${SEARCH_URL}?${query}`, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
            signal: controller.signal,
        });

        if (!response.ok) return "";

        // The page is latin-1; decoding it as UTF-8 corrupts phone extensions.
        const buffer = await response.arrayBuffer();
        return new TextDecoder("latin1").decode(buffer);
    } catch (error) {
        console.error("staffDirectory fetch failed:", error);
        return "";
    } finally {
        clearTimeout(timer);
    }
}

export async function getDeptCatalog(): Promise<DeptOption[]> {
    if (catalogCache && Date.now() - catalogCache.at < CATALOG_CACHE_TTL) {
        return catalogCache.options;
    }

    const html = await fetchDirectoryHtml({ dept: "ALL", name: " nobody " });
    const options = parseDeptCatalog(html);

    // Keep serving a stale catalog rather than none if the directory is down.
    if (!options.length) return catalogCache?.options ?? [];

    catalogCache = { at: Date.now(), options };
    return options;
}

export async function lookupStaff(q: {
    deptCodes?: string[];
    name?: string;
}): Promise<StaffRecord[]> {
    const deptCodes = q.deptCodes?.length ? q.deptCodes : ["ALL"];
    const name = q.name ?? "";
    const key = `${deptCodes.join(",")}|${name}`;

    const cached = staffCache.get(key);
    if (cached && Date.now() - cached.at < STAFF_CACHE_TTL) return cached.records;

    const pages = await Promise.all(
        deptCodes.map((dept) => fetchDirectoryHtml({ dept, name }))
    );

    const seen = new Set<string>();
    const records: StaffRecord[] = [];

    for (const html of pages) {
        for (const record of parseStaffCards(html)) {
            if (seen.has(record.profileUrl)) continue;
            seen.add(record.profileUrl);
            records.push(record);
        }
    }

    if (records.length) staffCache.set(key, { at: Date.now(), records });
    return records;
}



