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

        // searchId, when present, sits in the enclosing table just before the card.
        const preceding = html.slice(Math.max(0, (match.index ?? 0) - 1200), match.index);
        const ids = [...preceding.matchAll(/searchId=(\d+)/g)];
        const searchId = ids.length ? ids[ids.length - 1][1] : null;

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
