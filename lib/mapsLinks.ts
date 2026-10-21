/**
 * Google Maps links in answers, rebuilt so they always render as one clean
 * "📍 Open in Google Maps" link. The model sometimes leaves spaces inside the
 * URL ("query=Room+KB006,+Ground+Floor,+available information+Block"), which
 * broke the markdown link and spilled the raw URL across the answer card.
 *
 * Pure functions, unit tested.
 */

const MAPS_BASE = "https://www.google.com/maps/search/?api=1&query=";
const MAX_QUERY_CHARS = 140;
export const MAPS_LABEL = "📍 Open in Maps";

/** A clean, encoded Maps search URL for a place, or null if there is nothing to search. */
export function mapsSearchUrl(place: string): string | null {
    let q = String(place || "");
    try {
        q = decodeURIComponent(q.replace(/\+/g, " "));
    } catch {
        q = q.replace(/\+/g, " ");
    }
    q = q.replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
    if (q.length > MAX_QUERY_CHARS) {
        // Cut at a word boundary, never mid-word.
        const cut = q.slice(0, MAX_QUERY_CHARS);
        q = cut.slice(0, Math.max(cut.lastIndexOf(" "), cut.lastIndexOf(","), 1));
    }
    q = q.replace(/[\s,]+$/g, "").trim();
    if (!q) return null;
    return MAPS_BASE + encodeURIComponent(q).replace(/%20/g, "+");
}

/**
 * Rewrites every Maps search link in an answer, whether well formed, broken by
 * spaces, split across a line break, or a bare URL, into
 * "[📍 Open in Google Maps](<clean url>)".
 */
export function normalizeMapsLinks(text: string): string {
    let out = String(text || "");

    // Markdown form; the URL may contain spaces or a line break before ")".
    out = out.replace(
        /\[([^\]\n]{0,80})\]\s*\(\s*https:\/\/(?:www\.)?google\.com\/maps\/search\/\?api=1&(?:amp;)?query=([^)]*)\)/gi,
        (match, _label, query) => {
            const url = mapsSearchUrl(String(query).replace(/\s*\n\s*/g, " "));
            return url ? `[${MAPS_LABEL}](${url})` : "";
        }
    );

    // Bare URLs (not already inside a markdown link).
    out = out.replace(
        /(^|[^(])https:\/\/(?:www\.)?google\.com\/maps\/search\/\?api=1&(?:amp;)?query=([^\s)\]]+)/gi,
        (match, pre, query) => {
            const url = mapsSearchUrl(query);
            return url ? `${pre}[${MAPS_LABEL}](${url})` : pre;
        }
    );
    return out;
}
