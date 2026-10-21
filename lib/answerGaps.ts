/**
 * Does a knowledge-base answer admit that the thing asked for is not in its
 * documents ("The full tuition fees … are not specified in the available
 * documents")? Then the web is worth a try. Only explicit admissions count, so
 * a complete answer never goes to the web just for mentioning something it
 * doesn't cover.
 *
 * Pure functions, unit tested.
 */

const DOC = "(documents?|records?|sources?|information|materials?|knowledge base|data|files?|handbooks?)";
const QUALIFIER = "(the\\s+)?((available|provided|retrieved|current|uploaded|given|selected)\\s+)?";

const ADMISSIONS: RegExp[] = [
    // "… is not specified in the available documents"
    new RegExp(`\\b(not|n't)\\s+(specified|stated|mentioned|listed|provided|available|found|included|given|detailed|covered|indicated|shown)\\s+(in|within|by)\\s+${QUALIFIER}${DOC}\\b`, "i"),
    // "The available documents do not include …"
    new RegExp(`\\b${QUALIFIER}${DOC}\\s+(do(es)?\\s+not|don't|doesn't|did\\s+not|didn't)\\s+(contain|include|mention|specify|state|provide|list|cover|have|show|give)\\b`, "i"),
    // "There is no information on the full fee in the documents"
    new RegExp(`\\bno\\s+(specific\\s+|further\\s+|detailed\\s+)?(information|details?|mention|figures?|amounts?)\\s+(on|about|regarding|for|of)\\b.{0,80}\\b(in|within)\\s+${QUALIFIER}${DOC}\\b`, "i"),
];

/** Answers longer than this are substantive enough to keep, even with a "not mentioned" note. */
export const GAP_FALLBACK_MAX_CHARS = 1200;

export function admitsMissingAnswer(text: string): boolean {
    const t = String(text || "").replace(/[’]/g, "'").replace(/\s+/g, " ");
    return ADMISSIONS.some((re) => re.test(t));
}

/** A knowledge-base answer that should be retried on the web: an explicit admission, and not a long, substantive answer. */
export function kbAnswerHasGap(text: string): boolean {
    return admitsMissingAnswer(text) && String(text || "").trim().length < GAP_FALLBACK_MAX_CHARS;
}

/** The web fallback's own "nothing found" replies; then a partial knowledge-base answer is better. */
export function isWeakWebAnswer(text: string): boolean {
    return /couldn[’']t verify|could not verify|having trouble checking official/i.test(String(text || ""));
}
