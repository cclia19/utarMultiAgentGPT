import type { KbDraft } from "../types.ts";

/**
 * Source: academic staff research profiles (www2.utar.edu.my/cv_V2), for
 * "who works on X?" and "what does Dr Y research?".
 *
 * One document per department, one block per person, every line naming the
 * person so a retrieved chunk is never anonymous. A person's areas are what
 * they list under "Area of Expertise"; when that is empty, their research
 * project and publication titles stand in (as they are, no AI summary, so
 * incomplete profiles cost nothing extra). People with none of these are left
 * out. Positions and contacts come from the Staff Directory.
 *
 * The parsers are pure and unit tested; fetching is passed in.
 */

export type DirectoryPerson = {
    name: string;
    adminPositions: string[];
    jobTitle?: string;
    department: string;
    division?: string;
    email?: string;
};
export type Dept = { code: string; label: string };

const ACADEMIC = /professor|lecturer|tutor|research fellow|instructor|teaching fellow/i;
export const isAcademic = (p: DirectoryPerson) => ACADEMIC.test(p.jobTitle ?? "");

const CV_BASE = "https://www2.utar.edu.my/cv_V2";
export const cvId = (email?: string) => (email && /@utar\.edu\.my$/i.test(email) ? email.split("@")[0].toLowerCase() : null);
export const cvUrls = (id: string) => ({
    profile: `${CV_BASE}/index.jsp?cv=${id}`,
    expertise: `${CV_BASE}/proExperience.jsp?cv=${id}&reqPageId=profExp`,
    projects: `${CV_BASE}/researchProject.jsp?cv=${id}&reqPageId=researchProj`,
    publications: `${CV_BASE}/publication.jsp?cv=${id}&reqPageId=publication`,
});

/** Visible lines of a CV page after the navigation and the person's name. */
export function cvLines(html: string): string[] {
    const text = String(html || "")
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<li[^>]*>/gi, "\n- ")
        .replace(/<(br|p|tr|h\d|div|ul|ol|table)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;| /g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&copy;/gi, "©");
    const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && l !== "-");
    // The navigation ends with "Research Project"; the next line is the person's name.
    const navEnd = lines.findIndex((l) => l.replace(/^- /, "") === "Research Project");
    if (navEnd < 0) return [];
    const end = lines.findIndex((l, i) => i > navEnd && /©|copyright|all rights reserved|UNIVERSITI TUNKU ABDUL RAHMAN DU012|Wholly owned by UTAR/i.test(l));
    return lines.slice(navEnd + 2, end > 0 ? end : undefined);
}

const bullets = (lines: string[]) => lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter(Boolean);

/** "Area of Expertise" items and current/past industry roles (role, company). */
export function parseExpertise(html: string): { areas: string[]; industry: string[] } {
    const lines = cvLines(html);
    const start = lines.findIndex((l) => /^Area Of Expertise$/i.test(l));
    const industryAt = lines.findIndex((l) => /Industry Experience$/i.test(l));
    const areas = start >= 0 ? bullets(lines.slice(start + 1, industryAt > start ? industryAt : undefined)) : [];
    const industry: string[] = [];
    if (industryAt >= 0) {
        const rest = lines.slice(industryAt + 1).filter((l) => !/Industry Experience$/i.test(l));
        // Each role is "<title>" then "<company>" then address lines; keep title and company.
        for (let i = 0; i + 1 < rest.length && industry.length < 3; i++) {
            if (/^\d|jalan|level|suite|road|street|\b\d{5}\b/i.test(rest[i])) continue;
            if (/^(- )/.test(rest[i])) continue;
            industry.push(`${rest[i]}, ${rest[i + 1]}`.replace(/\s+,/g, ","));
            i += 1;
            while (i + 1 < rest.length && /\d|jalan|level|suite|menara|road|street|malaysia/i.test(rest[i + 1])) i++;
        }
    }
    return { areas: areas.slice(0, 20), industry };
}

const LATEST_YEAR = new Date().getFullYear() + 1;
const yearOf = (s: string) => {
    // Plausible years only (ISSNs and page ranges look like years too).
    const years = [...s.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0])).filter((y) => y >= 1990 && y <= LATEST_YEAR);
    return years.length ? Math.max(...years) : 0;
};
const tidy = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
    // ALL-CAPS titles read better in sentence case.
    return t === t.toUpperCase() && /[A-Z]{4}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

/** Research project titles with their latest year, newest first. */
export function parseProjects(html: string, max = 8): { title: string; year: number }[] {
    return bullets(cvLines(html))
        .map((b) => ({ title: tidy(b.split(/\s,\s/)[0]), year: yearOf(b) }))
        .filter((p) => p.title.length > 8)
        .sort((a, b) => b.year - a.year)
        .slice(0, max);
}

/** Publication titles (the quoted part) with their year, newest first. */
export function parsePublications(html: string, max = 10): { title: string; year: number }[] {
    return bullets(cvLines(html))
        .map((b) => {
            const m = b.match(/["“]([^"”]{8,})["”]/);
            return m ? { title: tidy(m[1]), year: yearOf(b) } : null;
        })
        .filter((p): p is { title: string; year: number } => Boolean(p))
        .sort((a, b) => b.year - a.year)
        .slice(0, max);
}

/** One person's block, or null when there is nothing about their research. */
export function personBlock(p: DirectoryPerson, cv: { profileUrl: string; areas: string[]; industry: string[]; projects: { title: string; year: number }[]; publications: { title: string; year: number }[] }): string | null {
    if (!cv.areas.length && !cv.projects.length && !cv.publications.length) return null;
    const n = p.name;
    const roles = [p.jobTitle, ...p.adminPositions].filter(Boolean).join("; ");
    const where = [p.department, p.division].filter(Boolean).join(", ");
    const withYear = (x: { title: string; year: number }) => (x.year ? `${x.title} (${x.year})` : x.title);
    const lines = [
        `## ${n}`,
        `${n}: ${roles}. ${where}.${p.email ? ` Email: ${p.email}.` : ""} Research profile: ${cv.profileUrl}`,
        cv.areas.length
            ? `Areas of expertise of ${n} (listed by ${n}): ${cv.areas.join("; ")}.`
            : `${n} has not listed areas of expertise; the research topics of ${n} below come from their research projects and publications.`,
    ];
    if (cv.industry.length) lines.push(`Industry experience of ${n}: ${cv.industry.join("; ")}.`);
    if (cv.projects.length) lines.push(`Research projects of ${n}: ${cv.projects.map(withYear).join("; ")}.`);
    if (cv.publications.length) lines.push(`Recent publications of ${n}: ${cv.publications.map(withYear).join("; ")}.`);
    return lines.join("\n");
}

export type FetchText = (url: string) => Promise<string>;

/** Map with limited concurrency (polite to UTAR's server). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const i = next++;
                out[i] = await fn(items[i]);
            }
        })
    );
    return out;
}

export async function collectStaffExpertise(params: {
    depts: Dept[];
    lookupDept: (code: string) => Promise<DirectoryPerson[]>;
    fetchText: FetchText;
    storeName: string;
    author: string;
    only?: RegExp;
    concurrency?: number;
    log?: (s: string) => void;
}) {
    const drafts: KbDraft[] = [];
    const problems: { url: string; problem: string; note?: boolean }[] = [];
    const seen = new Set<string>();
    const stats = { academics: 0, withProfile: 0, listedAreas: 0 };

    for (const dept of params.depts.filter((d) => !params.only || params.only.test(d.label) || params.only.test(d.code))) {
        let people: DirectoryPerson[];
        try {
            people = (await params.lookupDept(dept.code)).filter(isAcademic).filter((p) => {
                const id = cvId(p.email);
                if (!id || seen.has(id)) return false; // staff listed under two departments: once
                seen.add(id);
                return true;
            });
        } catch (e: any) {
            problems.push({ url: `directory:${dept.code}`, problem: `directory lookup failed: ${e?.message || e}` });
            continue;
        }
        if (!people.length) continue;
        stats.academics += people.length;

        const blocks = await mapLimit(people, params.concurrency ?? 4, async (p) => {
            const id = cvId(p.email)!;
            const urls = cvUrls(id);
            const [exp, proj, pubs] = await Promise.all([params.fetchText(urls.expertise), params.fetchText(urls.projects), params.fetchText(urls.publications)]);
            if (!exp && !proj && !pubs) return null;
            const { areas, industry } = parseExpertise(exp);
            const block = personBlock(p, { profileUrl: urls.profile, areas, industry, projects: parseProjects(proj), publications: parsePublications(pubs) });
            if (block) {
                stats.withProfile++;
                if (areas.length) stats.listedAreas++;
            }
            return block;
        });
        const present = blocks.filter((b): b is string => Boolean(b));
        params.log?.(`${dept.code.padEnd(10)} ${String(people.length).padStart(4)} academics, ${present.length} with a research profile`);
        if (!present.length) continue;

        const title = `Staff research expertise: ${dept.label}`;
        const text = [`# ${title}`, "", `Source: UTAR Staff Directory and staff research profiles (www2.utar.edu.my/cv_V2).`, "", ...present.flatMap((b) => [b, ""])].join("\n");
        drafts.push({
            key: `web:staff-expertise:${dept.code}`,
            unitId: "staff-expertise",
            storeName: params.storeName,
            title,
            origin: "web",
            sourceUrl: `https://www2.utar.edu.my/staffListSearchV2.jsp?searchDept=${dept.code}`,
            text,
            author: params.author,
        });
    }
    return { drafts, problems, stats };
}
