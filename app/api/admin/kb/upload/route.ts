import { NextRequest, NextResponse } from "next/server";
import { isLegacyDocument, kbGuard, kbUnits, slug } from "@/lib/kb/server";
import { convertUpload, MAX_UPLOAD_BYTES } from "@/lib/kb/convert";
import { publishDraft } from "@/lib/kb/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // waits for Gemini to index the document

/**
 * POST multipart: unit, title, author, note, optional key (to add a new
 * version of that document), and either
 *   file  a PDF (kept as the file), or
 *   text  Markdown the page already converted in the browser from Word /
 *         HTML / text (Word files with images are often over Vercel's
 *         4.5 MB request limit; the text alone is small), plus sourceName.
 * Optional replaceLegacy: an old-uploader document in the same store that is
 * removed once the new version is live (never before).
 */
export async function POST(req: NextRequest) {
    const guard = kbGuard(req);
    if (guard.error) return guard.error;
    const form = await req.formData();
    const unit = kbUnits().find((u) => u.id === String(form.get("unit") ?? ""));
    const title = String(form.get("title") ?? "").trim();
    const author = String(form.get("author") ?? "").trim();
    const note = String(form.get("note") ?? "").trim() || undefined;
    const file = form.get("file");
    const text = form.get("text");
    const sourceName = String(form.get("sourceName") ?? "upload").slice(0, 200);
    const existingKey = String(form.get("key") ?? "").trim();
    const replaceLegacy = String(form.get("replaceLegacy") ?? "").trim();

    if (!unit) return NextResponse.json({ error: "Choose a department." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Give the document a title." }, { status: 400 });
    if (!author) return NextResponse.json({ error: "Enter your name (kept in the version history)." }, { status: 400 });
    const hasText = typeof text === "string" && text.trim().length > 0;
    if (!hasText && (!(file instanceof File) || file.size === 0)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
    if (!hasText && (file as File).size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "PDF is larger than 4 MB. Save it as Word (.docx) and upload that, or split the PDF." }, { status: 413 });
    }

    const key = existingKey || `manual:${unit.id}:${slug(title)}`;
    const existing = await guard.deps.store.getDocument(key);
    if (existing && existing.origin !== "manual") {
        return NextResponse.json({ error: "That document is synced from the web; it updates itself each month." }, { status: 400 });
    }
    if (existing && existing.unitId !== unit.id) {
        return NextResponse.json({ error: `A document with this title already exists in ${existing.unitId}.` }, { status: 409 });
    }

    try {
        const converted = hasText
            ? { kind: `${sourceName.split(".").pop()} (converted in browser)`, text: String(text), file: undefined }
            : await convertUpload((file as File).name, new Uint8Array(await (file as File).arrayBuffer()), title);
        const item = await publishDraft(
            { key, unitId: unit.id, storeName: unit.storeName, title, origin: "manual", text: converted.text, file: converted.file, author: `admin:${author}`.slice(0, 100), note },
            guard.deps
        );
        const items = [item];
        // Replacing an older upload: remove it only once the new one is live.
        if (replaceLegacy && (item.outcome === "published" || item.outcome === "unchanged")) {
            const legacy = await isLegacyDocument(replaceLegacy, unit.storeName);
            if (legacy.ok) {
                try {
                    await guard.deps.publisher.remove(replaceLegacy);
                    items.push({ key: replaceLegacy, title: legacy.displayName ?? replaceLegacy, unitId: unit.id, outcome: "retired", detail: `older upload replaced by "${title}" (admin:${author})` });
                } catch (error: any) {
                    items.push({ key: replaceLegacy, title: legacy.displayName ?? replaceLegacy, unitId: unit.id, outcome: "failed", detail: `new version is live, but the older upload could not be removed: ${error?.message || error}` });
                }
            }
        }
        await guard.deps.store.saveRun({ kind: "upload", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), items });
        const status = item.outcome === "failed" ? 502 : 200;
        return NextResponse.json({ item, replaced: items[1] ?? null, key, converted: converted.kind, preview: converted.file ? null : converted.text.slice(0, 1500) }, { status });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Upload failed" }, { status: 400 });
    }
}
