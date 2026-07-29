/**
 * Fires only when the user asks WHO HOLDS A POSITION.
 *
 * Deliberately much narrower than `isProfileQuestion` in the chat route: this
 * predicate gates a strict "name nobody the directory cannot confirm" refusal,
 * so a false positive turns a working answer into a refusal.
 */
const ASKS_WHO = /\b(who\s+is|who's|who\s+are|whos)\b/i;

/**
 * Negative guard for rule, policy, eligibility, or authorization questions.
 * Questions asking about eligibility, permissions, or requirements ask about
 * rules rather than who currently holds a specific post.
 *
 * Position matters: rule words (eligible, allowed, etc.) must follow the who-is
 * prefix in the subject slot (optionally preceded by 'the' or 'person').
 * A post-holder question puts a role noun in the subject slot (e.g.
 * "who is the dean responsible for..."), so the guard must NOT fire when a rule
 * or qualification term appears later after a role noun.
 */
const IS_RULE_QUESTION =
    /\b(?:who\s+is|who's|who\s+are|whos)\s+(?:the\s+)?(?:person\s+)?(?:eligible|eligibility|allowed|permitted|qualify|qualifies|qualified|entitled|can\s+apply|required\s+to)\b/i;

interface RolePattern {
    pattern: RegExp;
    phrase: string;
}

const ROLE_PATTERNS: RolePattern[] = [
    // Role abbreviations
    { pattern: /\bvps?\b/i, phrase: "vice president" },
    { pattern: /\brgos?\b/i, phrase: "registrar" },
    { pattern: /\bhods?\b/i, phrase: "head of department" },
    { pattern: /\bhops?\b/i, phrase: "head of programme" },

    // Multi-word roles (explicit terms & plurals)
    { pattern: /\bvice[- ]presidents?\b/i, phrase: "vice president" },
    { pattern: /\bdeputy\s+presidents?\b/i, phrase: "deputy president" },
    { pattern: /\bdeputy\s+deans?\b/i, phrase: "deputy dean" },
    { pattern: /\bheads?\s+of\s+departments?\b/i, phrase: "head of department" },
    { pattern: /\bheads?\s+of\s+programmes?\b/i, phrase: "head of programme" },
    { pattern: /\bheads?\s+of\s+programs?\b/i, phrase: "head of program" },

    // Single-word roles & common misspellings (explicit terms & plurals)
    { pattern: /\bpresidents?\b/i, phrase: "president" },
    { pattern: /\bregistrars?\b/i, phrase: "registrar" },
    { pattern: /\bregistras?\b/i, phrase: "registra" },
    { pattern: /\bregistars?\b/i, phrase: "registar" },
    { pattern: /\bdeans?\b/i, phrase: "dean" },
    { pattern: /\bdirectors?\b/i, phrase: "director" },
    { pattern: /\bchairpersons?\b/i, phrase: "chairperson" },
    { pattern: /\bchairm[an]n?s?\b/i, phrase: "chairman" },
];

export function isPersonRoleQuestion(message: string): {
    isRoleQuestion: boolean;
    rolePhrase: string;
} {
    // Normalize smart quotes and curly apostrophes to standard ASCII apostrophe
    const text = String(message || "")
        .replace(/[\u2018\u2019\u201B\u2032`´]/g, "'")
        .toLowerCase();

    if (!ASKS_WHO.test(text)) return { isRoleQuestion: false, rolePhrase: "" };

    if (IS_RULE_QUESTION.test(text)) return { isRoleQuestion: false, rolePhrase: "" };

    // Collect candidates from all role patterns (abbreviations and explicit terms)
    const candidates: Array<{ phrase: string; matchedLength: number }> = [];

    for (const item of ROLE_PATTERNS) {
        const match = text.match(item.pattern);
        if (match) {
            candidates.push({
                phrase: item.phrase,
                matchedLength: match[0].length,
            });
        }
    }

    if (!candidates.length) return { isRoleQuestion: false, rolePhrase: "" };

    // Longest match in the input text wins (e.g. "deputy dean" beats "dean" or "hod")
    candidates.sort((a, b) => b.matchedLength - a.matchedLength);

    return { isRoleQuestion: true, rolePhrase: candidates[0].phrase };
}

