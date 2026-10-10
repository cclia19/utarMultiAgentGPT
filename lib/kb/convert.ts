import JSZip from "jszip";
import { htmlToKbText } from "./normalize.ts";

/**
 * Staff uploads -> what goes into the knowledge base.
 *
 * .md / .txt   as they are
 * .docx        Markdown: headings kept, every table row on its own line
 *              ("cell | cell"), so a retrieved chunk keeps its context
 * .html        the same cleaner as the web sync
 * .pdf         kept as the original file (Gemini reads PDFs itself)
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel request body limit is 4.5 MB

export type Converted = { text: string; file?: { data: Uint8Array; mimeType: string; name: string }; kind: string };

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (t: string) => t.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENTITIES[e]);
const tidy = (t: string) => t.replace(/[ \t]+/g, " ").trim();

/**
 * Word document body -> Markdown, in one pass over the XML so text inside
 * tables (also tables inside text boxes or other tables) stays with its row:
 * the outermost table's rows become "- cell | cell" lines. The fallback copy
 * Word keeps of every text box (mc:Fallback) is skipped.
 */
export function docxXmlToMarkdown(documentXml: string): string {
    const out: string[] = [];
    const token = /<(\/?)(w:tbl|w:tr|w:tc|w:p|w:t|w:tab|w:br|w:pStyle|w:numPr|mc:Fallback)\b([^>]*?)(\/?)>|([^<]+)|<[^>]*>/g;

    let fallback = 0;
    let tableDepth = 0;
    let inText = false;
    let para = "";
    let paraLevel = "";
    let paraList = false;
    let cell = "";
    let row: string[] = [];

    for (const m of documentXml.matchAll(token)) {
        const [, closing, tag, attrs, selfClosing, text] = m;
        if (tag === "mc:Fallback") {
            if (!selfClosing) fallback += closing ? -1 : 1;
            continue;
        }
        if (fallback > 0) continue;
        if (text !== undefined) {
            if (inText) para += unescapeXml(text);
            continue;
        }
        if (!tag) continue;
        switch (tag) {
            case "w:t":
                inText = !closing && !selfClosing;
                break;
            case "w:tab":
            case "w:br":
                para += " ";
                break;
            case "w:pStyle":
                paraLevel = /w:val="(?:Heading|heading)(\d)"/.exec(attrs)?.[1] ?? paraLevel;
                break;
            case "w:numPr":
                paraList = true;
                break;
            case "w:p":
                if (!closing) {
                    para = "";
                    paraLevel = "";
                    paraList = false;
                } else {
                    const t = tidy(para);
                    if (t && tableDepth > 0) cell += (cell ? " " : "") + t;
                    else if (t) out.push(paraLevel ? `\n${"#".repeat(Math.min(Number(paraLevel) + 1, 4))} ${t}` : paraList ? `- ${t}` : t);
                }
                break;
            case "w:tbl":
                tableDepth += closing ? -1 : 1;
                if (closing && tableDepth === 0) out.push("");
                break;
            case "w:tc":
                if (tableDepth === 1) {
                    if (!closing) cell = "";
                    else if (tidy(cell)) row.push(tidy(cell));
                }
                break;
            case "w:tr":
                if (tableDepth === 1) {
                    if (!closing) row = [];
                    else if (row.length) out.push(`- ${row.join(" | ")}`);
                }
                break;
        }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function convertUpload(name: string, data: Uint8Array, title: string): Promise<Converted> {
    const ext = name.toLowerCase().split(".").pop() ?? "";
    const header = `# ${title}\nUploaded document (${name}).\n\n`;
    if (ext === "pdf") return { kind: "pdf", text: `${title} (PDF ${name})`, file: { data, mimeType: "application/pdf", name } };
    if (ext === "md" || ext === "markdown" || ext === "txt") return { kind: ext, text: header + new TextDecoder().decode(data) };
    if (ext === "html" || ext === "htm") return { kind: "html", text: htmlToKbText(new TextDecoder().decode(data), { url: name, title }).text };
    if (ext === "docx") {
        const zip = await JSZip.loadAsync(data);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (!xml) throw new Error("not a Word document (word/document.xml missing)");
        return { kind: "docx", text: header + docxXmlToMarkdown(xml) };
    }
    throw new Error(`unsupported file type .${ext}: use PDF, Word (.docx), Markdown, text or HTML`);
}
