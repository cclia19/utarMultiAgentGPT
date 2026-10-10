/**
 * Text of a PDF (Node only), for the personal-data check before a portal
 * PDF is published. Returns "" when the PDF has no text layer or cannot be
 * read; the caller decides what that means.
 */
export async function pdfText(data: Uint8Array, maxPages = 60): Promise<string> {
    try {
        const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            parts.push(content.items.map((item: any) => item.str ?? "").join(" "));
        }
        await doc.destroy();
        return parts.join("\n");
    } catch {
        return "";
    }
}
