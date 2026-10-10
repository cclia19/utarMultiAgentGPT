/**
 * Suggested follow-up questions, written by Gemini in the same answer call
 * (no extra cost) on a last line "FOLLOW-UPS: q1 | q2 | q3", then taken out
 * of the answer and sent to the chat page as tappable chips.
 *
 * Pure functions, unit tested.
 */

export const FOLLOW_UPS_RULE = `
FOLLOW-UPS: After the answer (and after any "Next step" line), add one last line, exactly in this form:
FOLLOW-UPS: <question 1> | <question 2> | <question 3>
- 2 or 3 short questions (under 60 characters each) this student is likely to ask next, written as the student would type them, in the same language as your answer.
- They must be answerable by UTARCHAT (UTAR facts, procedures, contacts), not repeat the question just answered, and not be yes/no about the answer itself.
- Leave the line out for greetings, thanks and small talk.
`;

const LINE = /^[ \t>*_-]*\**FOLLOW[- ]?UPS?\**:\**[ \t]*(.*)$/im;

/** The answer without the follow-up line, and the questions from it (max 3). */
export function extractFollowUps(text: string): { text: string; followUps: string[] } {
    const raw = String(text || "");
    const m = LINE.exec(raw);
    if (!m) return { text: raw, followUps: [] };
    const followUps = m[1]
        .split(/\s*\|\s*/)
        .map((q) => q.replace(/^["'“‘\d.)\s-]+|["'”’]+$/g, "").trim())
        .filter((q) => q.length >= 4 && q.length <= 90)
        .slice(0, 3);
    const cleaned = (raw.slice(0, m.index) + raw.slice(m.index + m[0].length)).replace(/\n{3,}/g, "\n\n").trim();
    return { text: cleaned, followUps };
}

/** For the streaming preview: hide the follow-up line while it is being written. */
export function hideFollowUpLine(text: string): string {
    return String(text || "").replace(/\n?[ \t>*_-]*\**FOLLOW[- ]?UPS?\**:.*$/im, "").trimEnd();
}

/** UI language chosen on the chat page -> instruction for the answer prompts. */
export type ChatLanguage = "en" | "ms" | "zh";
const LANGUAGE_NAMES: Record<ChatLanguage, string> = { en: "English", ms: "Bahasa Melayu", zh: "Simplified Chinese (简体中文)" };

export function languageRule(language: unknown): string {
    const lang = String(language || "") as ChatLanguage;
    if (!LANGUAGE_NAMES[lang]) return "";
    return `\nLANGUAGE CHOSEN BY THE STUDENT: Reply in ${LANGUAGE_NAMES[lang]}, whatever language the question is in. Keep official names, course codes and form numbers as they are.\n`;
}
