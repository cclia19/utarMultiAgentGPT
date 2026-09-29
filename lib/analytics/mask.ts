/**
 * Masks personal identifiers before a question is stored.
 * Order matters: specific patterns (email, IC, phone) run before the
 * generic long-number rule so they get meaningful labels.
 */
const RULES: Array<[RegExp, string]> = [
    // Email addresses
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]"],
    // Malaysian NRIC / MyKad: 900101-14-5678, 900101145678, 900101 14 5678
    [/\b\d{6}[\s-]?\d{2}[\s-]?\d{4}\b/g, "[IC]"],
    // Malaysian phone numbers: +6012-345 6789, 012-3456789, 03-1234 5678
    [/(?:\+?6?0)\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[PHONE]"],
    // Passport-style IDs: one or two letters followed by 6-9 digits
    [/\b[A-Z]{1,2}\d{6,9}\b/gi, "[ID]"],
    // Any other run of 7+ digits (student IDs, card or account numbers)
    [/\b(?:\d[\s-]?){6,}\d\b/g, "[NUMBER]"],
];

export const MAX_STORED_QUESTION_CHARS = 1000;

export function maskPersonalData(text: string): string {
    let out = String(text || "");
    for (const [pattern, label] of RULES) {
        out = out.replace(pattern, label);
    }
    return out.slice(0, MAX_STORED_QUESTION_CHARS);
}
