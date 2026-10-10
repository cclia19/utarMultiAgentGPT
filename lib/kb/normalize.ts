/**
 * Official UTAR web page -> knowledge-base text.
 *
 * UTAR's sites are built with RVSiteBuilder: the page content sits inside
 * id="editable_area_content"; menus, banners and footers are outside it.
 * The output keeps headings, paragraphs and every list item / table row on
 * its own line, each list line prefixed with its heading so a retrieved
 * chunk still says what it belongs to ("YEAR 1: DISCRETE MATHEMATICS").
 * File Search chunks lost that context when tables were flattened cell by
 * cell, which is why course lists were not found.
 *
 * Pure functions only (no network) so it can be unit tested.
 */

const CONTENT_IDS = ["editable_area_content", "selected_body"];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };

function decode(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
        const lower = code.toLowerCase();
        if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
        if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
        return ENTITIES[lower] ?? m;
    });
}

/** Inner HTML of the first element with this id (balanced on its own tag name). */
export function elementById(html: string, id: string): string | null {
    const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i").exec(html);
    if (!open) return null;
    const tag = open[1].toLowerCase();
    const start = open.index + open[0].length;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    re.lastIndex = start;
    let depth = 1;
    for (let m = re.exec(html); m; m = re.exec(html)) {
        if (m[0].endsWith("/>")) continue;
        depth += m[1] ? -1 : 1;
        if (depth === 0) return html.slice(start, m.index);
    }
    return html.slice(start);
}

function inlineText(fragment: string): string {
    return decode(fragment.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export type KbPage = { title: string; text: string; lines: number };

/**
 * Converts one page. `title` falls back to the <title>; `context` lines go on
 * top (e.g. "Programme: Bachelor of Computer Science (Honours)").
 */
export function htmlToKbText(
    html: string,
    opts: { url: string; title?: string; context?: string[]; retrieved?: string; linePrefix?: string } = { url: "" }
): KbPage {
    // "Bachelor of Computer Science (Honours) · YEAR 1: DISCRETE MATHEMATICS"
    const label = (heading: string, text: string) =>
        [opts.linePrefix, heading ? `${heading.replace(/:\s*$/, "")}: ${text}` : text].filter(Boolean).join(" · ");
    const pageTitle = inlineText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
    let body = CONTENT_IDS.map((id) => elementById(html, id)).find((x) => x && x.trim()) ?? html;

    body = body
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg|iframe|form|nav|button)\b[\s\S]*?<\/\1>/gi, " ")
        .replace(/<img\b[^>]*>/gi, " ");

    // Block structure -> lines with markers, then flatten everything else.
    const out: string[] = [];
    let heading = "";
    const tokenRe = /<(h[1-6]|li|tr|p|div|th|dt|dd)\b[^>]*>([\s\S]*?)(?=<\/?(?:h[1-6]|li|tr|p|div|table|ul|ol|dl)\b|$)/gi;
    for (let m = tokenRe.exec(body); m; m = tokenRe.exec(body)) {
        const tag = m[1].toLowerCase();
        if (tag === "tr") {
            // A table row: its cells joined; a single bold-only cell acts as a heading.
            const cells = [...m[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?=<t[dh]\b|<\/tr|$)/gi)].map((c) => inlineText(c[1])).filter(Boolean);
            if (cells.length === 1 && /<th\b/i.test(m[0])) {
                heading = cells[0];
                out.push("", `### ${heading}`);
            } else if (cells.length) {
                out.push(`- ${label(heading, cells.join(" | "))}`);
            }
            continue;
        }
        const text = inlineText(m[2]);
        if (!text) continue;
        if (/^h[1-6]$/.test(tag) || tag === "th") {
            heading = text;
            out.push("", `### ${text}`);
        } else if (tag === "li" || tag === "dd") {
            out.push(`- ${label(heading, text)}`);
        } else {
            out.push(text);
        }
    }

    // Drop consecutive duplicates (nested divs repeat their text).
    const lines = out.filter((line, i) => line === "" || line !== out[i - 1]);
    const textBody = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const title = opts.title || pageTitle;
    const header = [
        `# ${title}`,
        `Source: ${opts.url}`,
        `Official UTAR web page, retrieved ${opts.retrieved ?? new Date().toISOString().slice(0, 10)}. Where it differs from older documents, this page is the current information.`,
        ...(opts.context ?? []),
    ].join("\n");
    return { title, text: `${header}\n\n${textBody}\n`, lines: lines.filter(Boolean).length };
}
