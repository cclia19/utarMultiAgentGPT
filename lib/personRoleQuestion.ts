/**
 * Fires only when the user asks WHO HOLDS A POSITION.
 *
 * Deliberately much narrower than `isProfileQuestion` in the chat route: this
 * predicate gates a strict "name nobody the directory cannot confirm" refusal,
 * so a false positive turns a working answer into a refusal.
 */
const ASKS_WHO = /\b(who\s+is|who's|who\s+are|whos)\b/i;

const ROLE_TERMS = [
    "vice president",
    "vice-president",
    "deputy president",
    "president",
    "registrar",
    "registra",
    "registar",
    "deputy dean",
    "dean",
    "head of department",
    "head of programme",
    "head of program",
    "hod",
    "hop",
    "director",
    "chairperson",
    "chairman",
];

const ROLE_ABBREVIATIONS: Array<{ pattern: RegExp; phrase: string }> = [
    { pattern: /\bvp\b/i, phrase: "vice president" },
    { pattern: /\brgo\b/i, phrase: "registrar" },
    { pattern: /\bhod\b/i, phrase: "head of department" },
];

export function isPersonRoleQuestion(message: string): {
    isRoleQuestion: boolean;
    rolePhrase: string;
} {
    const text = String(message || "").toLowerCase();

    if (!ASKS_WHO.test(text)) return { isRoleQuestion: false, rolePhrase: "" };

    for (const abbreviation of ROLE_ABBREVIATIONS) {
        if (abbreviation.pattern.test(text)) {
            return { isRoleQuestion: true, rolePhrase: abbreviation.phrase };
        }
    }

    // Longest match first, so "deputy dean" beats "dean".
    const matches = ROLE_TERMS
        .filter((term) => text.includes(term))
        .sort((a, b) => b.length - a.length);

    if (!matches.length) return { isRoleQuestion: false, rolePhrase: "" };

    return { isRoleQuestion: true, rolePhrase: matches[0] };
}
