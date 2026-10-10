/**
 * Offices that exist once per campus (dsa-kampar / dsa-sungai-long, ...).
 *
 * When the campus is not stated, the router asked "Kampar or Sungai Long?"
 * even for "how long is the Foundation programme?" or "where can I get
 * counselling?". Instead, answer from both campus offices in one File Search
 * call (the existing two-unit fan-out) and let the answer split by campus only
 * where the campuses differ.
 *
 * Pure functions only, so they can be unit tested.
 */

const CAMPUS_SUFFIX = /-(kampar|sungai-long)$/;

// Which campus office a question belongs to when the router left it on General.
const FAMILY_KEYWORDS: [string, RegExp][] = [
    ["cfs", /\bfoundation\b/i],
    ["dsa", /\b(dsa|counsel+ing|counsel+or|societ(y|ies)|clubs?|src|student (representative )?council|regulation xiii|hostel|accommodation|co-?curricular|student affairs|student activit(y|ies))\b/i],
    ["dgs", /\b(dgs|car sticker|vehicle sticker|parking|bus|buses|shuttle|monthly pass|transport)\b/i],
    ["def", /\b(air[\s-]?cond(itioner|itioning)?|aircon|repair|broken|maintenance|leak(ing)?|lights?|facilit(y|ies)|hall|venue|room booking|book (a )?(room|hall|venue))\b/i],
    ["dss", /\b(dss|security|guard|lost and found|lost item|stolen|theft|safety)\b/i],
];

/** "dsa" for "dsa-kampar", else null. */
export function campusFamily(agentId: string): string | null {
    return CAMPUS_SUFFIX.test(agentId) ? agentId.replace(CAMPUS_SUFFIX, "") : null;
}

export function isCampusQuestion(clarification: string): boolean {
    return /\b(campus|kampar|sungai\s*long)\b/i.test(String(clarification || ""));
}

/**
 * [Kampar office, Sungai Long office] to answer from when the router wants to
 * ask "which campus?", or null to keep the router's decision.
 */
export function bothCampusOffices(params: {
    agentId: string;
    needsClarification: boolean;
    clarificationQuestion?: string;
    message: string;
}): [string, string] | null {
    const { agentId, needsClarification, clarificationQuestion = "", message } = params;
    if (!needsClarification || !isCampusQuestion(clarificationQuestion)) return null;
    const family =
        campusFamily(agentId) ??
        (agentId === "general" ? FAMILY_KEYWORDS.find(([, re]) => re.test(message))?.[0] ?? null : null);
    return family ? [`${family}-kampar`, `${family}-sungai-long`] : null;
}

export const BOTH_CAMPUSES_RULE = `
BOTH CAMPUSES RULE: The user did not say which campus, so you have the Kampar and the Sungai Long office of the same department.
- If the answer is the same for both campuses, give it once and say it applies to both.
- If it differs, use one "### Kampar campus" and one "### Sungai Long campus" section, each short.
- If you only have evidence for one campus, answer for that campus and say so.
- Do not ask which campus.
`;
