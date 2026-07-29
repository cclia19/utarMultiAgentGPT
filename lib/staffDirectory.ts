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

