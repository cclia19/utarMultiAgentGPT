/**
 * Retrieval safety net.
 *
 * The no-retrieval path (`generateDirectNoRetrievalResponse`) answers from the
 * model's own knowledge with no store, no citations, and an instruction not to
 * mention that nothing was checked. That is correct for social chat and actively
 * harmful for a factual question -- a wrong `needsRetrieval: false` from either
 * the resolver or the router turns "what are the library hours" into a confident
 * invented answer.
 *
 * So `needsRetrieval: false` is only trusted when the message does not look like
 * a question. Interrogative shape only -- no UTAR names, dates or facts -- so
 * this stays valid when the knowledge bases change.
 */

// Matched on whole words: English interrogatives embed inside unrelated words
// ("how" in "however", "list" in "listen"), so the boundaries matter.
const ENGLISH_MARKERS = [
    "what", "when", "where", "who", "whom", "whose", "which", "how", "why",
    "is there", "are there", "can i", "do i", "does", "list", "opening", "operating",
];

// Malay takes the -kah interrogative suffix (apa -> apakah, berapa -> berapakah),
// so these match as word prefixes instead.
const MALAY_MARKER_PREFIXES = [
    "apa", "bila", "mana", "siapa", "bagaimana", "berapa", "ada",
];

export const CASUAL_INTENT_CATEGORIES = new Set([
    "casual_or_social",
    "casual_or_offtopic",
]);

export function looksLikeFactualQuestion(text: string): boolean {
    const raw = String(text || "").trim();
    if (!raw) return false;

    // CJK interrogatives (no word boundaries in Chinese, so substring is correct here).
    if (/[什甚麼么幾几哪裡里怎樣样多少何時时]/.test(raw)) return true;

    if (raw.includes("?") || raw.includes("？")) return true;

    const lower = raw.toLowerCase();

    const hasEnglishMarker = ENGLISH_MARKERS.some((marker) =>
        new RegExp(`(^|[^a-z])${marker}([^a-z]|$)`).test(lower)
    );
    if (hasEnglishMarker) return true;

    return MALAY_MARKER_PREFIXES.some((prefix) =>
        new RegExp(`(^|[^a-z])${prefix}`).test(lower)
    );
}
