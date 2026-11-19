/**
 * Clarifying questions come from the router (or fixed English text), not the
 * answer step, so they ignored the language the student chose: in 中文 mode
 * "怎么转换课程?" got an English question back. The router is now told the
 * language; this catches the rest so they can be translated before sending.
 *
 * Pure, unit tested.
 */

export const CLARIFY_LANGUAGE_NAMES: Record<string, string> = { en: "English", ms: "Bahasa Melayu", zh: "Simplified Chinese (简体中文)" };

/** True when the text is not in the chosen language (English text in 中文 or BM mode). */
export function clarificationNeedsTranslation(text: string, language: unknown): boolean {
    const t = String(text || "").trim();
    if (!t) return false;
    if (language === "zh") return !/[一-鿿]/.test(t);
    if (language === "ms") return /\b(which|what|could|would|please|you|your|are|the|do|is)\b/i.test(t) && !/\b(anda|yang|atau|mana|boleh|apakah|sila)\b/i.test(t);
    return false;
}
