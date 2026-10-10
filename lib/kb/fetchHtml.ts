import https from "node:https";
import http from "node:http";
import tls from "node:tls";
import { UTAR_DIRECTORY_CA_CHAIN } from "../certs/utarDirectoryChain.ts";
import { isOfficialUtarHost } from "../conversationSignals.ts";

/**
 * Fetches an official UTAR page's HTML for the knowledge-base sync.
 *
 * UTAR servers do not send their intermediate certificate, so the Sectigo
 * chain from lib/certs is added to Node's roots (same chain as
 * lib/directoryTls.ts). Deliberately uses node:https, not the `undici`
 * package: importing undici replaces the global dispatcher that Node's
 * fetch (and so the Gemini SDK) uses, and File Search uploads then fail
 * with "invalid content-length header".
 *
 * Only utar.edu.my hosts; follows up to 3 redirects on those hosts; one
 * retry; null on failure (the sync then keeps the live version).
 */

const CA = [...tls.rootCertificates, ...(UTAR_DIRECTORY_CA_CHAIN.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [])];
const MAX_BYTES = 5_000_000;

function get(url: string, timeoutMs: number, redirects = 3): Promise<string | null> {
    return new Promise((resolve) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return resolve(null);
        }
        if (!isOfficialUtarHost(parsed.hostname)) return resolve(null);
        const client = parsed.protocol === "http:" ? http : https;
        const req = client.get(
            parsed,
            { headers: { "User-Agent": "UTARCHAT-KB-Sync/1.0 (+https://chat.utar.edu.my)", Accept: "text/html" }, ca: CA, timeout: timeoutMs },
            (res) => {
                const status = res.statusCode ?? 0;
                if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
                    res.resume();
                    return resolve(get(new URL(res.headers.location, parsed).toString(), timeoutMs, redirects - 1));
                }
                if (status !== 200) {
                    res.resume();
                    return resolve(null);
                }
                const chunks: Buffer[] = [];
                let size = 0;
                res.on("data", (c: Buffer) => {
                    size += c.length;
                    if (size > MAX_BYTES) req.destroy();
                    else chunks.push(c);
                });
                res.on("end", () => resolve(size > MAX_BYTES ? null : Buffer.concat(chunks).toString("utf8")));
                res.on("error", () => resolve(null));
            }
        );
        req.on("timeout", () => req.destroy());
        req.on("error", () => resolve(null));
    });
}

export async function fetchUtarHtml(url: string, timeoutMs = 20_000): Promise<string | null> {
    const first = await get(url, timeoutMs);
    if (first !== null) return first;
    await new Promise((r) => setTimeout(r, 1500));
    return get(url, timeoutMs);
}
