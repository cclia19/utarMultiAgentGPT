/**
 * "Who is Dr Liew Soung Yue?", "Goi Bok Min's email", "siapa Chiang Jeng Fong",
 * "廖崇儒是谁": a question about a named staff member. These used to be answered
 * from uploaded documents, which often leave out (or have an older) admin
 * position; the live UTAR Staff Directory is checked first instead.
 *
 * Returns the name to search for, or null. Errs towards null: a name that
 * isn't one costs a directory search that finds nobody, and the documents
 * answer as before.
 *
 * Pure, unit tested.
 */

const HONORIFICS = /^(prof|professor|assoc|associate|asst|assistant|dr|ts|ir|dato'?|datuk|dato|tan sri|mr|ms|mrs|mdm|madam|puan|pn|encik|en|cik|sir|miss|ar|sr)\.?$/i;

// Words that mean the "name" is really something else.
const NOT_A_NAME = new Set([
    "my", "your", "our", "his", "her", "their", "the", "a", "an", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "best", "responsible", "in", "charge", "incharge", "contact", "person", "staff", "lecturer", "lecturers", "tutor", "supervisor", "advisor",
    "adviser", "coordinator", "counsellor", "counselor", "officer", "manager", "eligible", "allowed", "teaching", "taking", "handling", "behind",
    "utar", "utarchat", "avo", "you?", "there", "here", "online", "available", "going", "coming", "able", "the", "for", "to", "of", "and",
    "student", "students", "president", "vp", "dean", "head", "director", "registrar", "chairperson", "mascot", "chatbot", "bot", "ai",
]);

function clean(candidate: string): string | null {
    const words = candidate
        .replace(/[?!.,;:]+$/g, "")
        .trim()
        .split(/\s+/)
        .filter((w) => w && !HONORIFICS.test(w));
    if (!words.length || words.length > 5) return null;
    if (words.some((w) => NOT_A_NAME.has(w.toLowerCase()) || !/^[\p{L}][\p{L}'.-]*$/u.test(w))) return null;
    const name = words.join(" ");
    if (words.length === 1 && name.length < 4) return null;
    return name;
}

export function staffNameFromQuestion(question: string): string | null {
    const q = String(question || "")
        .replace(/[‘’`]/g, "'")
        .replace(/\s+/g, " ")
        .trim();

    // Chinese: "<name>是谁" (a Chinese name is 2-4 characters).
    const zh = q.match(/^([一-鿿]{2,4})(?:是谁|是誰)[?？]?$/);
    if (zh) return zh[1];

    const patterns = [
        /^(?:who\s+is|who's|whos|who\s+was|tell\s+me\s+about|siapa(?:kah)?)\s+(.+?)\s*\??$/i,
        /^(?:what\s+is|what's)\s+(?:the\s+)?(?:email|e-mail|contact|phone(?:\s+number)?|extension|office|position|title|role|job)\s+(?:of|for)\s+(.+?)\s*\??$/i,
        /^(?:email|e-mail|contact|phone(?:\s+number)?|extension|position|title|role)\s+(?:of|for)\s+(.+?)\s*\??$/i,
        /^(.+?)'s\s+(?:email|e-mail|contact|phone|extension|office|position|title|role|job)\b/i,
    ];
    for (const re of patterns) {
        const m = q.match(re);
        if (m) return clean(m[1]);
    }
    return null;
}
