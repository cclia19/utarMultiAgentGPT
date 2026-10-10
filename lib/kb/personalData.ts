/**
 * Keeps personal data out of the knowledge base (the chatbot is public).
 *
 * Portal announcements include lists of named students: bar lists, results,
 * exam slips, verification exercises, disciplinary actions. Two checks,
 * both must pass before anything is published:
 *   1. the title does not name such a list;
 *   2. the text (of the page, or of the PDF) does not contain several
 *      student IDs, whatever the title says.
 *
 * Pure functions, unit tested.
 */

const PERSONAL_TITLE = new RegExp(
    [
        "bar\\s*-?\\s*list",
        "barring",
        "\\bBK\\s*\\(A\\)",
        "\\bresults?\\b",
        "\\bslips?\\b",
        "e-?authori[sz]ation",
        "verification exercise",
        "disciplinary",
        "outcome of appeal",
        "\\bappeals?\\b",
        "uncollected",
        "\\bvenue\\b",
        "students who",
        "list of (students|candidates|names|graduands|recipients|winners)",
        "name list",
        "\\bshortlist",
        "successful (candidates|applicants)",
        "dean'?s list",
        "\\bwinners?\\b",
    ].join("|"),
    "i"
);

export function isPersonalTitle(title: string): boolean {
    return PERSONAL_TITLE.test(String(title || ""));
}

/** Distinct UTAR student IDs in a text: 7-digit (2106814) and older (06UCB01381). */
export function studentIds(text: string): string[] {
    const ids = new Set<string>();
    for (const m of String(text || "").matchAll(/(?<![\d-])\d{7}(?![\d-])|\b\d{2}[A-Z]{3}\d{5}\b/g)) ids.add(m[0]);
    return [...ids];
}

/** Three or more student IDs: treat the document as a list of students. */
export const MAX_STUDENT_IDS = 2;

export function personalDataReason(title: string, text: string): string | null {
    if (isPersonalTitle(title)) return "title names a list of students (bar list, results, slips, …)";
    // PDF text extraction can split a number ("21068 14"): count both readings.
    const rejoined = String(text || "").replace(/(\d) (?=\d)/g, "$1");
    const ids = [studentIds(text), studentIds(rejoined)].sort((a, b) => b.length - a.length)[0];
    if (ids.length > MAX_STUDENT_IDS) return `contains ${ids.length} student IDs`;
    return null;
}
