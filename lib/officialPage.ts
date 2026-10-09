import { fetch as undiciFetch } from "undici";
import { getDirectoryDispatcher } from "./directoryTls.ts";
import { htmlToGroundingText, isOfficialUtarHost } from "./conversationSignals.ts";

/**
 * Fetches an official UTAR page (utar.edu.my or a subdomain) that the user
 * pasted, so the answer can be grounded on that exact page.
 *
 * Safety: only official UTAR hosts are fetched, redirects are followed manually
 * and must stay on official UTAR hosts, and size/time are capped.
 */

export type OfficialPage =
    | { kind: "html"; url: string; title: string; text: string }
    | { kind: "pdf"; url: string; title: string; base64: string };

const MAX_HTML_BYTES = 2_000_000;
const MAX_PDF_BYTES = 8_000_000;
const MAX_TEXT_CHARS = 60_000;
const MAX_REDIRECTS = 3;

async function readCapped(response: any, maxBytes: number): Promise<Uint8Array | null> {
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared && declared > maxBytes) return null;

    const reader = response.body?.getReader?.();
    if (!reader) {
        const buf = new Uint8Array(await response.arrayBuffer());
        return buf.byteLength > maxBytes ? null : buf;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            return null;
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

function decodeHtml(bytes: Uint8Array, contentType: string): string {
    const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 2048));
    const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
    const enc = charset || metaCharset || "utf-8";
    try {
        return new TextDecoder(enc === "iso-8859-1" ? "latin1" : enc).decode(bytes);
    } catch {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

export async function fetchOfficialUtarPage(rawUrl: string, timeoutMs = 10_000): Promise<OfficialPage | null> {
    let current: URL;
    try {
        current = new URL(rawUrl);
    } catch {
        return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (!isOfficialUtarHost(current.hostname)) return null;
            if (current.protocol !== "https:" && current.protocol !== "http:") return null;

            const response: any = await undiciFetch(current.toString(), {
                method: "GET",
                redirect: "manual",
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; UTARCHAT/1.0; +https://chat.utar.edu.my)",
                    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                signal: controller.signal,
                dispatcher: getDirectoryDispatcher(),
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get("location");
                await response.body?.cancel?.().catch(() => {});
                if (!location) return null;
                current = new URL(location, current);
                continue;
            }

            if (!response.ok) {
                console.warn("[officialPage] fetch status", response.status, current.toString());
                return null;
            }

            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            const finalUrl = current.toString();

            if (contentType.includes("application/pdf") || /\.pdf$/i.test(current.pathname)) {
                const bytes = await readCapped(response, MAX_PDF_BYTES);
                if (!bytes) return null;
                const name = decodeURIComponent(current.pathname.split("/").pop() || "document.pdf");
                return { kind: "pdf", url: finalUrl, title: name, base64: Buffer.from(bytes).toString("base64") };
            }

            if (!contentType.includes("html") && !contentType.includes("text/plain")) return null;

            const bytes = await readCapped(response, MAX_HTML_BYTES);
            if (!bytes) return null;
            const html = decodeHtml(bytes, contentType);
            const { title, text } = contentType.includes("html")
                ? htmlToGroundingText(html)
                : { title: "", text: html };

            if (text.trim().length < 40) return null;
            return { kind: "html", url: finalUrl, title, text: text.slice(0, MAX_TEXT_CHARS) };
        }
        return null;
    } catch (error) {
        console.error("fetchOfficialUtarPage failed:", rawUrl, (error as any)?.message || error);
        return null;
    } finally {
        clearTimeout(timer);
    }
}
