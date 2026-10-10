/**
 * Gemini with the File Search tool sometimes writes the whole answer twice in
 * one response, reworded ("The Bachelor of Computer Science ... aims to equip
 * ..." then "The Bachelor of Computer Science ... emphasizes providing ...").
 * Students saw both copies glued together.
 *
 * Cut the answer where a paragraph restarts an earlier one: mostly the same
 * words as an earlier paragraph of real length. Pure function, unit tested.
 */

const MIN_WORDS = 12;
const SIMILARITY = 0.55;

function words(paragraph: string): Set<string> {
    return new Set(
        paragraph
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2)
    );
}

function similarity(a: Set<string>, b: Set<string>): number {
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    return shared / Math.max(1, Math.min(a.size, b.size));
}

/** The answer without a repeated second copy (unchanged when there is none). */
export function dropRepeatedAnswer(text: string): string {
    const raw = String(text || "");
    // A glued restart has no blank line: "...directly.The Bachelor of ..."
    const spaced = raw.replace(/([a-z][.!?])([A-Z][a-z])/g, "$1\n\n$2");
    const paragraphs = spaced.split(/\n\s*\n/);
    // Only prose paragraphs in the same section are compared: per-campus
    // sections and bullet lists legitimately repeat wording.
    let section = 0;
    const seen: { section: number; words: Set<string> }[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        if (/^#/.test(paragraph)) {
            section++;
            continue;
        }
        if (/^([*\-|>]|\d+\.)\s/.test(paragraph)) continue;
        const current = words(paragraph);
        if (current.size < MIN_WORDS) continue;
        if (seen.some((earlier) => earlier.section === section && similarity(current, earlier.words) >= SIMILARITY)) {
            // Keep the first, complete copy.
            return paragraphs.slice(0, i).join("\n\n").trim();
        }
        seen.push({ section, words: current });
    }
    return raw;
}
