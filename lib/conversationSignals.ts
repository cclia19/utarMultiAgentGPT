/**
 * Deterministic conversation signals used to steer the chat pipeline.
 *
 * Pure functions only (no Gemini, no network) so they can be unit tested and
 * so the decisions they make never depend on an LLM classification.
 */

// ---------------------------------------------------------------------------
// 1. Intake / commencement / academic-calendar questions belong to DACE.
// ---------------------------------------------------------------------------

const MONTH = "(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)";

const CALENDAR_PATTERNS: RegExp[] = [
    /\bintakes?\b/i,
    /\bacademic\s+calend[ae]r\b/i,
    /\b(trimester|semester|term|session)\b[^.?!]{0,40}\b(start|starts|starting|begin|begins|beginning|commence|commences|commencement|date|dates|opens?)\b/i,
    /\b(start|starting|begin|beginning|commencement|commence|reporting|registration)\b[^.?!]{0,40}\b(trimester|semester|term|session|intake)\b/i,
    /\bcommencement\s+date/i,
    /\bwhen\b[^.?!]{0,30}\b(class|classes|lectures?)\b[^.?!]{0,20}\b(start|begin|commence)/i,
    // "start dates for October 2026", "October 2026 start date"
    new RegExp(`\\b(start|starting|begin|beginning|commencement)\\s+dates?\\b[^.?!]{0,30}\\b${MONTH}\\b`, "i"),
    new RegExp(`\\b${MONTH}\\b[^.?!]{0,15}\\b(start|starting|commencement)\\s+dates?\\b`, "i"),
    // "when is the next trimester", "upcoming semester", "when is the trimester"
    /\b(next|upcoming|coming|new|following)\s+(trimester|semester|intake)\b/i,
    /\bwhen\b[^.?!]{0,30}\b(trimester|semester)\b/i,
    // "When does MBBS start in October 2026?"
    new RegExp(`\\bwhen\\b[^.?!]{0,40}\\b(start|starts|begin|begins|commence|commences)\\b[^.?!]{0,15}\\b${MONTH}\\b`, "i"),
    // Malay
    /\b(pengambilan|kalendar\s+akademik|tarikh\s+mula)\b/i,
    // Chinese
    /(开学|開學|入学日期|入學日期|学期开始|學期開始|校历|校曆|招生)/,
];

// Exam timetables / results belong to DEAS, not DACE.
const EXAM_PATTERN = /\b(exam|examination|final\s+exam|result|results|cgpa|gpa)\b/i;
// Internship start dates belong to the faculty, not DACE.
const NOT_CALENDAR_PATTERN = /\b(internship|industrial\s+training|practical\s+training|placement)\b/i;

export function isIntakeOrCalendarQuestion(text: string): boolean {
    const raw = String(text || "");
    if (!raw.trim()) return false;
    if (EXAM_PATTERN.test(raw) && !/\bintake|commence|start date|academic calendar/i.test(raw)) {
        return false;
    }
    if (NOT_CALENDAR_PATTERN.test(raw)) return false;
    return CALENDAR_PATTERNS.some((pattern) => pattern.test(raw));
}

// ---------------------------------------------------------------------------
// 2. The user is challenging / correcting / asking about a previous answer.
// ---------------------------------------------------------------------------

const CHALLENGE_PATTERNS: RegExp[] = [
    /\bare\s+you\s+(sure|certain|positive)\b/i,
    /\byou\s*(are|re|'re)\s+(wrong|incorrect|mistaken)\b/i,
    /\b(that|this|it)\s*(is|'s)?\s*(not\s+(right|correct|true|accurate)|wrong|incorrect|inaccurate)\b/i,
    /\bwhy\s+(did\s+)?you\s+(say|said|tell|told|mention|mentioned|answer|answered|claim|claimed)\b/i,
    /\byou\s+(said|told\s+me|mentioned|claimed|answered)\b/i,
    /\b(check|verify|look)\s+(it\s+|this\s+|that\s+)?(again|carefully|properly)\b/i,
    /\bdouble[-\s]?check\b/i,
    /\bnot\s+(for\s+)?all\s+students\b/i,
    /\bi\s+think\s+you\s*(are|re|'re)?\s*(wrong|mistaken|incorrect)\b/i,
    /\byou\s+(did\s+not|didn't|didnt)\s+(check|read|look)\b/i,
    /\b(misleading|inaccurate)\b/i,
    // Malay
    /\b(anda|awak|kamu)\s+salah\b/i,
    /\b(tidak|tak)\s+betul\b/i,
    /\bbetul\s+ke\b/i,
    // Chinese
    /(你错了|你錯了|不对|不對|你确定|你確定|为什么你说|為什麼你說|错误|錯誤)/,
];

export function isAnswerChallenge(message: string, history: any[] = []): boolean {
    const raw = String(message || "").trim();
    if (!raw) return false;
    // A challenge needs something to challenge.
    if (!getLastAssistantAnswer(history)) return false;
    return CHALLENGE_PATTERNS.some((pattern) => pattern.test(raw));
}

function historyEntryText(entry: any): string {
    if (!entry?.parts || !Array.isArray(entry.parts)) return "";
    return entry.parts
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .join(" ")
        .trim();
}

export function getLastAssistantAnswer(history: any[]): string {
    if (!Array.isArray(history)) return "";
    for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        if (entry?.role === "model" || entry?.role === "assistant") {
            const text = historyEntryText(entry);
            if (text) return text;
        }
    }
    return "";
}

/**
 * The assistant's recent answers, oldest first and numbered, for correction
 * mode. A challenge often points at an earlier answer ("why did you say in the
 * beginning..."), and only showing the latest one let the model deny a mistake
 * it made two turns before.
 */
export function formatEarlierAssistantAnswers(history: any[], maxAnswers = 4, maxChars = 1200): string {
    if (!Array.isArray(history)) return "";
    const answers = history
        .filter((entry) => entry?.role === "model" || entry?.role === "assistant")
        .map((entry) => historyEntryText(entry))
        .filter(Boolean)
        .slice(-maxAnswers);
    if (answers.length === 0) return "";
    return answers
        .map((text, i) => {
            const label = i === answers.length - 1 ? `Answer ${i + 1} (most recent)` : `Answer ${i + 1}`;
            return `${label}:\n${text.slice(0, maxChars)}`;
        })
        .join("\n\n");
}

/**
 * Short transcript of the recent conversation, oldest first, for prompts that
 * must see what the assistant previously said.
 */
export function formatRecentConversation(history: any[], maxEntries = 8, maxChars = 1500): string {
    if (!Array.isArray(history)) return "";
    return history
        .slice(-maxEntries)
        .map((entry) => {
            const text = historyEntryText(entry);
            if (!text) return "";
            const role = entry?.role === "model" || entry?.role === "assistant" ? "Assistant" : "User";
            return `${role}: ${text.slice(0, maxChars)}`;
        })
        .filter(Boolean)
        .join("\n\n");
}

// ---------------------------------------------------------------------------
// 3. Official UTAR links pasted by the user.
// ---------------------------------------------------------------------------

export function isOfficialUtarHost(hostname: string): boolean {
    const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    return host === "utar.edu.my" || host.endsWith(".utar.edu.my");
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const BARE_UTAR_PATTERN = /(?<![\w./-])((?:[a-z0-9-]+\.)*utar\.edu\.my(?:\/[^\s<>"'`)\]]*)?)/gi;

/**
 * Returns up to `limit` distinct official UTAR URLs found in the text.
 * Only http(s) on utar.edu.my or a subdomain; anything else is ignored, so the
 * server never fetches arbitrary user-supplied hosts.
 */
export function extractOfficialUtarUrls(text: string, limit = 2): string[] {
    const raw = String(text || "");
    const candidates: string[] = [];

    for (const match of raw.matchAll(URL_PATTERN)) candidates.push(match[0]);
    for (const match of raw.matchAll(BARE_UTAR_PATTERN)) {
        const value = match[1];
        if (!candidates.some((c) => c.includes(value))) candidates.push(`https://${value}`);
    }

    const out: string[] = [];
    for (const candidate of candidates) {
        const trimmed = candidate.replace(/[.,;:!?]+$/, "");
        let url: URL;
        try {
            url = new URL(trimmed);
        } catch {
            continue;
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") continue;
        if (url.username || url.password) continue;
        if (url.port && url.port !== "80" && url.port !== "443") continue;
        if (!isOfficialUtarHost(url.hostname)) continue;
        url.hash = "";
        const normalized = url.toString();
        if (!out.includes(normalized)) out.push(normalized);
        if (out.length >= limit) break;
    }
    return out;
}

/**
 * Official links the user pasted in this message or in their recent turns
 * (e.g. "can you check this page? <url>" followed by "you did not check the link").
 */
export function findRecentUserUtarUrls(message: string, history: any[], lookbackUserTurns = 3): string[] {
    const fromMessage = extractOfficialUtarUrls(message);
    if (fromMessage.length) return fromMessage;
    if (!Array.isArray(history)) return [];

    const userTexts = history
        .filter((entry) => entry?.role === "user")
        .map(historyEntryText)
        .filter(Boolean)
        .slice(-lookbackUserTurns)
        .reverse();

    for (const text of userTexts) {
        const urls = extractOfficialUtarUrls(text);
        if (urls.length) return urls;
    }
    return [];
}

// ---------------------------------------------------------------------------
// 4. HTML to text that keeps table rows intact.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
    hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®",
};

export function decodeHtmlEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
        if (code[0] === "#") {
            const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
        }
        return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
    });
}

/**
 * Converts an HTML page to plain text for grounding.
 *
 * Table rows become single lines with cells separated by " | ", so a date stays
 * on the same line as the programme it belongs to. That is the property the
 * flattened PDF/HTML text in the knowledge base was missing.
 */
export function htmlToGroundingText(html: string): { title: string; text: string } {
    let s = String(html || "");

    const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : "";

    s = s
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, " ");

    // Tables: cells -> " | ", rows -> newline.
    s = s
        .replace(/<\/(td|th)>/gi, " | ")
        .replace(/<tr\b[^>]*>/gi, "\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<\/?(table|thead|tbody|tfoot)\b[^>]*>/gi, "\n");

    // Block-level breaks.
    s = s
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<h([1-6])\b[^>]*>/gi, (_m, level) => `\n\n${"#".repeat(Number(level))} `)
        .replace(/<\/(p|div|section|article|h[1-6]|ul|ol|li|dt|dd|header|main|aside)>/gi, "\n");

    s = s.replace(/<[^>]+>/g, " ");
    s = decodeHtmlEntities(s);

    const lines = s
        .split("\n")
        .map((line) =>
            line
                .replace(/[ \t ]+/g, " ")
                .replace(/(\s*\|\s*)+$/g, "")
                .replace(/^(\s*\|\s*)+/g, "")
                .replace(/\s*\|\s*(\|\s*)+/g, " | ")
                .trim()
        )
        .filter((line) => line && line !== "-" && line !== "|");

    const deduped: string[] = [];
    for (const line of lines) {
        if (deduped[deduped.length - 1] !== line) deduped.push(line);
    }

    return { title, text: deduped.join("\n") };
}

// ---------------------------------------------------------------------------
// 4. What a programme teaches (courses, subjects, maths content).
// ---------------------------------------------------------------------------

const TEACHING_PATTERN = /\b(courses?|subjects?|modules?|programme structure|program structure|course structure|syllabus|curriculum|electives?|specialis\w*|specializ\w*|what (will|do|would) (i|we|you|students) (learn|study)|how (much|many) (math|maths|mathematics|programming|coding|courses|subjects))\b/i;
const PROGRAMME_PATTERN = /\b(programme|program|degree|bachelor|master|diploma|foundation|computer science|engineering|accounting|information (systems|technology)|\bbcs\b|\bcs\b|\bit\b)\b/i;
// Questions about registering for or paying for courses are not about content.
const COURSE_ADMIN_PATTERN = /\b(register|registration|add\s*(\/|or|and)?\s*drop|withdraw|fees?|pay|deadline|timetable|exam)\b/i;

/** "What subjects are in Computer Science?", "how much maths is in the CS programme?" */
export function isProgrammeContentQuestion(text: string): boolean {
    const raw = String(text || "");
    return TEACHING_PATTERN.test(raw) && PROGRAMME_PATTERN.test(raw) && !COURSE_ADMIN_PATTERN.test(raw);
}
