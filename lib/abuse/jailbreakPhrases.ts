/**
 * Known jailbreak / prompt-override phrasings. A cheap first pass only: new
 * wording will get through, and the size, rate and budget limits are what keep
 * those messages cheap. Keep entries specific enough that a student asking a
 * normal question never matches (e.g. "dan" is Malay for "and", so only
 * "DAN" as a persona name is listed).
 *
 * Each entry is matched case-insensitively against the message with spaces
 * collapsed, unless `caseSensitive` is set.
 */
export type JailbreakPattern = { pattern: RegExp; label: string };

export const JAILBREAK_PATTERNS: JailbreakPattern[] = [
    { label: "from this moment forward", pattern: /\bfrom this moment (on|forward)\b/i },
    { label: "ignore previous instructions", pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(of\s+)?(the\s+|your\s+)?(previous|prior|above|earlier|system)\s+(instructions|rules|prompts?|messages?)\b/i },
    { label: "you are now (persona)", pattern: /\byou are now (a|an|the|my|in|no longer|free|unrestricted|unfiltered|jailbroken|DAN)\b/i },
    { label: "DAN persona", pattern: /\b(act as|you are|you're|enable|activate)\s+DAN\b|\bDAN mode\b|\bdo anything now\b/ },
    { label: "developer mode", pattern: /\b(developer|god|jailbreak|unrestricted|unfiltered)\s+mode\b/i },
    { label: "jailbreak", pattern: /\bjail\s?break(ing|ed)?\b/i },
    { label: "no restrictions persona", pattern: /\b(limitless|unrestricted|unfiltered|uncensored)\s+(ai|intelligence|assistant|model|chatbot)\b/i },
    { label: "reveal system prompt", pattern: /\b(reveal|show|print|repeat|output)\s+(me\s+)?(your\s+|the\s+)?(system\s+prompt|hidden\s+instructions|initial\s+instructions)\b/i },
    { label: "pretend no rules", pattern: /\bpretend (that )?you (have|had) no (rules|restrictions|limits|guidelines)\b/i },
];

export function matchJailbreak(message: string): string | null {
    const text = String(message || "").replace(/\s+/g, " ");
    for (const { pattern, label } of JAILBREAK_PATTERNS) {
        if (pattern.test(text)) return label;
    }
    return null;
}
