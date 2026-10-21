/**
 * Official UTAR pages read live (cached 15 min) for questions whose answers
 * change often or that the knowledge base only half covers: library hours
 * (special trimester-break hours), postgraduate fees, industrial training
 * (portal, faculties, programme coordinators). The page text is added to the
 * answer step as authoritative evidence, the same way as the intake calendar.
 *
 * To add a page: one entry with the question pattern, the URL(s) and a note
 * that tells the answer step how to use it.
 *
 * Pure functions (matching, formatting), unit tested.
 */

export type LivePage = {
    id: string;
    urls: string[];
    /** True when the question needs this page. */
    matches: (question: string) => boolean;
    /** How the answer step should use the page. */
    note: string;
};

const LIBRARY = /\b(library|libraries|perpustakaan)\b|图书馆/i;
const HOURS = /\b(hours?|open|opening|opens|close|closing|closed|time|times|when|weekend|saturday|sunday|holiday|buka|dibuka|tutup|ditutup|pukul|waktu|jam)\b|开|关|几点|时间|营业/i;
const FEE = /\b(fee|fees|yuran|tuition|cost|costs|how much|berapa|price)\b|学费|费用|多少钱/i;
const POSTGRAD = /\b(master|masters|phd|ph\.d|doctor(ate)?|postgraduate|post-graduate|pg|mba|msc|sarjana|pascasiswazah|doktor falsafah)\b|硕士|博士|研究生/i;
const INTERNSHIP = /\b(intern|interns|internship|internships|industrial training|industrial attachment|practical training|placement|latihan industri|praktikal)\b|实习|工业实习/i;

export const LIVE_PAGES: LivePage[] = [
    {
        id: "library-hours",
        urls: ["https://library.utar.edu.my/Opening-Hours.php"],
        matches: (q) => LIBRARY.test(q) && HOURS.test(q),
        note:
            "Library opening hours. The Main Library is on the Kampar Campus; the Mary KUOK Pick Hoo Library is on the Sungai Long Campus. " +
            "If special hours (trimester break, exam weeks, public holidays) cover today's date, lead with today's hours and the dates they apply, then give the general hours for both campuses.",
    },
    {
        id: "postgraduate-fees",
        urls: ["https://ipsr.utar.edu.my/Fees.php"],
        matches: (q) => FEE.test(q) && POSTGRAD.test(q),
        note:
            "Official postgraduate fees. UTAR does not publish one total per programme: coursework is charged per credit hour, plus one-time and yearly fees. " +
            "Never say the fee is 'not specified'. Show how it is worked out with these official figures, Malaysian and international, in a small table, and say the total depends on the programme's credit hours.",
    },
    {
        id: "industrial-training",
        urls: ["https://indtrng.utar.edu.my/faculties.aspx", "https://indtrng.utar.edu.my/coordinators.aspx"],
        matches: (q) => INTERNSHIP.test(q),
        note:
            "UTAR Industrial Training Management Portal (https://indtrng.utar.edu.my), used by most faculties. " +
            "LKC FES students use their faculty page instead: https://lkcfes.utar.edu.my/students/industrial-training/ . " +
            "When the student's faculty or programme is known, answer for that faculty and name its industrial training coordinator(s) with email from the coordinators list.",
    },
];

export function livePagesFor(question: string): LivePage[] {
    const q = String(question || "");
    return LIVE_PAGES.filter((p) => p.matches(q));
}

/** Shared by the router check and the internship clarification. */
export function isInternshipQuestion(question: string): boolean {
    return INTERNSHIP.test(String(question || ""));
}

// Each page's text is capped to keep the answer step's cost predictable.
export const LIVE_PAGE_MAX_CHARS = 14_000;

export function formatLiveEvidence(
    pages: { page: LivePage; title: string; url: string; text: string }[],
    todayMalaysia: string
): string {
    if (pages.length === 0) return "";
    return pages
        .map(
            ({ page, title, url, text }) =>
                `\nOFFICIAL UTAR PAGE, read live today (${todayMalaysia}); authoritative over documents:\n${title}\nURL: ${url}\nHOW TO USE IT: ${page.note}\n<<<PAGE\n${text.slice(0, LIVE_PAGE_MAX_CHARS)}\nPAGE>>>\n`
        )
        .join("");
}
