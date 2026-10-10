/**
 * Source: the UTAR student intranet (portal.utar.edu.my/stuIntranet), which
 * needs a login. scripts/kb-portal-sync.mjs signs in through a real browser
 * window (the person types their own password and CAPTCHA) and then uses
 * these functions to decide what to collect and where it goes.
 *
 * Collected: regulations, the academic handbook, examination notices,
 * postgraduate rules and guidelines, UTAR guidelines, and an index of the
 * downloadable forms. Never collected: anything personal or interactive
 * (results, feedback, applications, Microsoft Forms, logout, timetables,
 * past papers).
 *
 * Pure functions only (no network), unit tested.
 */

export const PORTAL_BASE = "https://portal.utar.edu.my/stuIntranet/";
export const PORTAL_HOME = `${PORTAL_BASE}homeOverview.jsp`;

export type PortalLink = { title: string; url: string };

export type PortalSection = {
    id: string;
    /** Page listing the documents (relative to PORTAL_BASE); "home" = the menu itself. */
    path: string;
    title: string;
    /** Which department store each document belongs to (one or more). */
    unitsFor: (link: PortalLink) => string[];
    /** Only links whose URL matches (default: any document link). */
    match?: RegExp;
};

const DSA = ["dsa-kampar", "dsa-sungai-long"];

export const PORTAL_SECTIONS: PortalSection[] = [
    { id: "regulations", path: "regulations/index.jsp", title: "UTAR Rules and Regulations", unitsFor: () => ["registrar"] },
    { id: "handbook", path: "UTARHandBook/index.jsp", title: "UTAR Academic Handbook", unitsFor: () => ["general"] },
    { id: "examination", path: "home", title: "Examination notices", match: /\/stuIntranet\/examination\/[^/]+\.pdf$/i, unitsFor: () => ["deas"] },
    { id: "postgraduate", path: "Postgraduate/index.jsp", title: "Postgraduate rules and guidelines", unitsFor: () => ["ipsr"] },
    {
        id: "guidelines",
        path: "utarGuideline/index.jsp",
        title: "UTAR Guidelines",
        unitsFor: ({ title, url }) => {
            const s = `${title} ${url}`;
            if (/ITISC|Office 365|SharePoint|Internet/i.test(s)) return ["itisc"];
            if (/IPSR|thesis|field trip/i.test(s)) return ["ipsr"];
            if (/DSA|Clubs|Sports/i.test(s)) return DSA;
            return ["general"];
        },
    },
    { id: "dsa-guidelines", path: "DSAGuideline/index.jsp", title: "Clubs and Societies guidelines and forms", unitsFor: () => DSA },
];

/** Personal, interactive or staff-only pages that must never be collected. */
const NEVER = /pointerAT|studentFeedback|HybridStudy|forms\.(cloud\.)?microsoft|forms\.gle|docs\.google\.com\/forms|Logout|loginPage|examTimetable|pastPaper|annDetail|announcement\/index/i;

/** Files the sync can put in the knowledge base. Word/zip forms are listed in an index instead. */
export const isDocument = (url: string) => /\.pdf(\?|$)/i.test(url);
export const isForm = (url: string) => /\.(docx?|zip|xlsx?)(\?|$)/i.test(url);

function allowedHost(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === "portal.utar.edu.my" || host === "www2.utar.edu.my" || host === "web2.utar.edu.my";
    } catch {
        return false;
    }
}

/**
 * Absolute links from a page, as [{ title, url }], https and deduplicated.
 * Each opening <a> is read on its own: the intranet nests links
 * (<A href=detail><a href=file.pdf>title</a></a>) and leaves hrefs unquoted.
 */
export function pageLinks(html: string, pageUrl: string): PortalLink[] {
    const seen = new Set<string>();
    const out: PortalLink[] = [];
    for (const m of html.matchAll(/<a\b([^>]*)>/gi)) {
        const attr = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(m[1]);
        if (!attr) continue;
        const href = (attr[1] ?? attr[2] ?? attr[3]).trim();
        if (!href || href.startsWith("#") || /^javascript:/i.test(href) || /^mailto:/i.test(href)) continue;
        let url: string;
        try {
            url = new URL(href.replace(/&amp;/g, "&"), pageUrl).toString().replace(/^http:\/\//i, "https://");
        } catch {
            continue;
        }
        // Link text: up to the next <a or </a>.
        const after = html.slice(m.index! + m[0].length);
        const stop = after.search(/<\/?a\b/i);
        const title = (stop >= 0 ? after.slice(0, stop) : after.slice(0, 300))
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ title, url });
    }
    return out;
}

/** URLs and titles of the menu every intranet page repeats (relative links resolve differently per page, so titles too). */
export function menuKeys(homeHtml: string): Set<string> {
    const keys = new Set<string>();
    for (const l of pageLinks(homeHtml, PORTAL_HOME)) {
        keys.add(l.url);
        if (l.title) keys.add(`title:${l.title}`);
    }
    return keys;
}

/**
 * The documents a section lists: its own links (not the menu every page
 * repeats), on portal hosts, never personal or interactive pages.
 */
export function sectionLinks(section: PortalSection, sectionHtml: string, menu: Set<string>): { documents: PortalLink[]; forms: PortalLink[] } {
    const pageUrl = section.path === "home" ? PORTAL_HOME : PORTAL_BASE + section.path;
    const links = pageLinks(sectionHtml, pageUrl).filter(
        (l) =>
            allowedHost(l.url) &&
            !NEVER.test(l.url) &&
            !NEVER.test(l.title) &&
            (section.path === "home" || !(menu.has(l.url) || (l.title && menu.has(`title:${l.title}`))))
    );
    const relevant = section.match ? links.filter((l) => section.match!.test(l.url.split("?")[0])) : links;
    return {
        documents: relevant.filter((l) => isDocument(l.url)).map((l) => ({ ...l, title: l.title || decodeURIComponent(l.url.split("/").pop() ?? "document") })),
        forms: relevant.filter((l) => isForm(l.url) && l.title),
    };
}

/** Stable key for a portal document in a department store. */
export function portalKey(url: string, unitId: string): string {
    return `portal:${unitId}:${url.replace(/^https?:\/\//, "").split("?")[0]}`;
}

/** One Markdown document listing a section's downloadable forms (students sign in to download). */
export function formsIndex(section: PortalSection, forms: PortalLink[], retrieved: string): string {
    return [
        `# ${section.title}: forms`,
        `Source: ${PORTAL_BASE}${section.path} (UTAR student intranet; sign in to download), retrieved ${retrieved}.`,
        "",
        ...forms.map((f) => `- ${section.title} · Form: ${f.title} (${decodeURIComponent(f.url.split("/").pop() ?? "")})`),
        "",
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Programme structures (Course → Programme Structure). The portal lists every
// structure ever made for a programme, including old intakes and a few made
// for one student (with their name and student ID in the description).
// Only recent intake structures are taken, never personal ones.
// ---------------------------------------------------------------------------

export const STRUCTURE_LEVELS = ["F", "B", "M", "D", "P"] as const;
export const STRUCTURE_BASE = `${PORTAL_BASE}courseStructure/`;

/** `["C","FICT"]` pairs from the portal's AJAX drop-down responses. */
export function parseSelectPairs(js: string): [string, string][] {
    return [...js.matchAll(/\["([^"]*)","([^"]*)"\]/g)].map((m) => [m[1], m[2]] as [string, string]).filter(([v]) => v);
}

const cellText = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

const rowsOf = (html: string) =>
    [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>|$)/gi)].map((m) => ({
        html: m[0],
        cells: [...m[1].matchAll(/<td\b([^>]*)>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)].map((c) => ({ attrs: c[1], text: cellText(c[2]) })),
    }));

export type StructureRow = { code: string; mode: string; credits: string; description: string; url: string };

/** Rows of a programme's structure list (each links to viewStructure.jsp). */
export function parseStructureList(html: string): StructureRow[] {
    const out: StructureRow[] = [];
    for (const row of rowsOf(html)) {
        const href = /href=["']?(viewStructure\.jsp\?[^"' >]+)/i.exec(row.html)?.[1];
        if (!href || row.cells.length < 5) continue;
        const [, code, mode, credits, description] = row.cells.map((c) => c.text);
        out.push({ code, mode, credits, description, url: STRUCTURE_BASE + href.replace(/&amp;/g, "&") });
    }
    return out;
}

/** "UCCS261001" -> 2026-10 (intake year and month in the code). */
export function intakeOf(code: string): { year: number; month: number } | null {
    const m = /^[A-Z]{4}(\d{2})(\d{2})\d{2}$/.exec(code);
    if (!m) return null;
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { year: 2000 + Number(m[1]), month } : null;
}

/** A structure made for one person: a name or ID in brackets, "A/L", "A/P", or a student number. */
export function isPersonalStructure(description: string): boolean {
    return /\[[^\]]*\]|\b\d{2}[A-Z]{3}\d{5}\b|\b\d{7}\b|\bA\/[LP]\b|\b(?:intake|INTAKE)\s*-\s*[A-Z][a-z]+ [A-Z][a-z]+/.test(description);
}

/** Recent, non-personal structures, newest first: intakes from `years` years back up to a year ahead. */
export function keepStructures(rows: StructureRow[], now: Date, years = 3): StructureRow[] {
    const nowMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
    return rows
        .map((r) => ({ r, intake: intakeOf(r.code) }))
        .filter(({ r, intake }) => {
            if (!intake || isPersonalStructure(r.description)) return false;
            const months = intake.year * 12 + intake.month - 1;
            return months >= nowMonths - years * 12 && months <= nowMonths + 12;
        })
        .sort((a, b) => b.intake!.year * 12 + b.intake!.month - (a.intake!.year * 12 + a.intake!.month))
        .map(({ r }) => r);
}

/** One structure page as Markdown lines: each course carries programme, intake and trimester. */
export function structureToMarkdown(html: string, label: string): string {
    const lines: string[] = [];
    let term = "";
    for (const row of rowsOf(html)) {
        const cls = row.cells.map((c) => c.attrs).join(" ");
        const texts = row.cells.map((c) => c.text);
        if (/class=["']?year/i.test(cls)) continue; // "Year 1" (the trimester rows repeat it)
        if (/class=["']?header/i.test(cls) && /Year \d+/i.test(texts.join(" "))) {
            term = texts.join(" ").trim();
            lines.push("", `#### ${term}`);
            continue;
        }
        if (/^Total Credit Hours/i.test(texts[0] ?? "") && term) {
            lines.push(`- ${label} · ${term}: total ${texts[1] ?? ""} credit hours`);
            continue;
        }
        if (row.cells.length === 4 && /^[A-Z]{3,4}\d{4,5}$/.test(texts[0])) {
            const [code, name, type, credit] = texts;
            lines.push(`- ${label} · ${term || "Course"}: ${code} ${name} (${type}, ${credit} credits)`);
        }
    }
    return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Announcements (Highlight → Announcements): the last few months, each in
// its department's store. Older ones are retired by the sync.
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_LIST = `${PORTAL_BASE}announcement/annIndex.jsp`;
export const ANNOUNCEMENT_DAYS = 90;

/** `pdf`: the list often links the announcement's PDF directly. */
export type Announcement = { date: string; title: string; dept: string; url: string; id: string; pdf?: string };

/** Rows "dd/mm/yyyy | title | DEPT" with their detail link, newest first as listed. */
export function parseAnnouncementList(html: string): Announcement[] {
    const out: Announcement[] = [];
    for (const row of rowsOf(html)) {
        const href = /href=["']?([^"' >]*annDetail\.jsp\?fid=(\d+))/i.exec(row.html);
        const texts = row.cells.map((c) => c.text).filter(Boolean);
        const dateIdx = texts.findIndex((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t));
        if (!href || dateIdx < 0 || texts.length < dateIdx + 3) continue;
        const [d, m, y] = texts[dateIdx].split("/");
        const pdf = pageLinks(row.html, ANNOUNCEMENT_LIST).find((l) => allowedHost(l.url) && isDocument(l.url))?.url;
        out.push({ date: `${y}-${m}-${d}`, title: texts[dateIdx + 1], dept: texts[dateIdx + 2], url: new URL(href[1].replace(/&amp;/g, "&"), ANNOUNCEMENT_LIST).toString(), id: href[2], ...(pdf ? { pdf } : {}) });
    }
    return out;
}

export function recentAnnouncements(list: Announcement[], now: Date, days = ANNOUNCEMENT_DAYS): Announcement[] {
    const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    return list.filter((a) => a.date >= cutoff);
}

/**
 * Only the announcement itself: the page header also shows the signed-in
 * person's name and email, which must never reach the knowledge base.
 */
export function announcementContent(html: string): { text: string; attachments: PortalLink[] } {
    // The markers' spacing varies ("<!--  Add Content Here -->").
    const start = /<!--\s*Add Content Here\s*-->/i.exec(html);
    const end = start ? /<!--\s*End Content Here\s*-->/i.exec(html.slice(start.index)) : null;
    const body = start && end ? html.slice(start.index + start[0].length, start.index + end.index) : "";
    const attachments = pageLinks(body, ANNOUNCEMENT_LIST).filter((l) => allowedHost(l.url) && isDocument(l.url) && !/index\.jsp/i.test(l.url));
    const text = body
        .replace(/<div class="goback">[\s\S]*?<\/div>/i, "")
        .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&laquo;|&raquo;/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
    return { text, attachments };
}

/** Department code on an announcement (LIB, DGS-KPR, DEAS, RGO, …) -> org unit id. */
export function unitForDept(dept: string, unitIds: Set<string>): string {
    const code = dept.toUpperCase().trim();
    const direct: Record<string, string> = {
        LIB: "library",
        RGO: "registrar",
        DEAS: "deas",
        DACE: "dace",
        DFN: "dfn",
        DSA: "dsa-kampar",
        "DSA-KPR": "dsa-kampar",
        "DSA-SL": "dsa-sungai-long",
        "DGS-KPR": "dgs-kampar",
        "DGS-SL": "dgs-sungai-long",
        "DEF-KPR": "def-kampar",
        "DEF-SL": "def-sungai-long",
        "DSS-KPR": "dss-kampar",
        "DSS-SL": "dss-sungai-long",
        ITISC: "itisc",
        IPSR: "ipsr",
        OIA: "oia",
        DISS: "diss",
        DPP: "dpp",
        DHR: "dhr",
        LKCFES: "lkcfes",
        FES: "lkcfes",
        FMHS: "fmhs",
        FAS: "fass",
        FBF: "fbf",
        CFS: "cfs-kampar",
        "CFS-KPR": "cfs-kampar",
        "CFS-SL": "cfs-sungai-long",
    };
    const id = direct[code] ?? code.toLowerCase();
    return unitIds.has(id) ? id : "general";
}
