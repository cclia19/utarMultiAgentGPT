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

// "You may refer to the Maps section in the FICT Handbook": points elsewhere instead of answering.
const REDIRECT = /\b(you (may|can|should|could) (refer to|check|consult|look (at|up))|please (refer to|check|consult|look at)|refer to the|kindly refer to|for (more )?details?,? (please )?(refer to|see|check))\b.{0,100}\b(handbook|section|website|webpage|page|portal|document|guide|guidebook|brochure|map|maps|notice|announcement)\b/i;
/** A short answer that only points elsewhere. */
export const REDIRECT_ONLY_MAX_CHARS = 500;

export function onlyRedirects(text: string): boolean {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > 0 && t.length < REDIRECT_ONLY_MAX_CHARS && REDIRECT.test(t);
}

/**
 * A knowledge-base answer that should be retried on the web: an explicit
 * admission (and not a long, substantive answer), or a short answer that only
 * sends the student somewhere else.
 */
export function kbAnswerHasGap(text: string): boolean {
    return (admitsMissingAnswer(text) && String(text || "").trim().length < GAP_FALLBACK_MAX_CHARS) || onlyRedirects(text);
}

/** For every answer: solve the question; a document or map is extra, never the answer. */
export const ANSWER_DIRECTLY_RULE = `
ANSWER DIRECTLY: Solve the question with the details in your evidence (block, floor and room; steps; names and contacts; dates; amounts). Never answer only by telling the user to refer to a handbook section, website or document; you may mention one after the actual answer.
PLACES: When the answer names a place on or near a UTAR campus (a block, lab, office, hall, cafe), add a Google Maps link in exactly this form, with + for spaces and only the place name and campus in the query: [📍 Open in Maps](https://www.google.com/maps/search/?api=1&query=Place+Name+UTAR+Kampar+Campus). Use the campus the place is on.
`;

/** Google Maps search links are safe to keep in answers (a search, not an invented address). */
export function isMapsSearchLink(url: string): boolean {
    return /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^\s)]+$/i.test(String(url || "").trim());
}

/** The web fallback's own "nothing found" replies; then a partial knowledge-base answer is better. */
export function isWeakWebAnswer(text: string): boolean {
    return /couldn[’']t verify|could not verify|having trouble checking official/i.test(String(text || ""));
}

/**
 * "Can I / am I allowed to …" questions: the verdict comes first, then the rule.
 * The bot used to quote Rule XX s.15 and then say "there isn't an outright ban".
 */
export const VERDICT_FIRST_RULE = `
VERDICT FIRST: When the user asks whether they can, may or are allowed to do something (work or take a job, defer, take two programmes, bring or use something, and so on), start with a one-line verdict in bold: **Yes**, **No**, **Only with approval** or **It depends**, based on UTAR's rules in your evidence. Then name the rule and section (e.g. "Rule XX – Student Code of Conduct, Section 15") and quote or paraphrase it, then give the practical next step.
- When a rule restricts something, the verdict must reflect the restriction. Never soften it into "there is no outright ban".
- Apply the rule to the user's situation. Example: Rule XX Section 15 bars any employment, full-time or part-time, that conflicts with a student's position, so a full-time job while studying full-time is **No**; part-time work may be acceptable only if it does not conflict with studies (check with DSA).
`;
