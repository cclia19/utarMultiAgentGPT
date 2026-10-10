import { NextRequest, NextResponse } from "next/server";
import { isLegacyDocument, kbGuard, kbUnits } from "@/lib/kb/server";
import { retireDocument } from "@/lib/kb/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST { unit, author, key } removes a staff upload from the knowledge base;
 * its versions stay, so History → "Make live again" brings it back.
 * POST { unit, author, legacyName } removes an old-uploader document; that
 * one has no saved copy and cannot be brought back.
 * Web and portal documents are not removed here: the monthly sync re-adds them.
 */
export async function POST(req: NextRequest) {
    const guard = kbGuard(req);
    if (guard.error) return guard.error;
    const body = await req.json().catch(() => ({}));
    const unit = kbUnits().find((u) => u.id === String(body?.unit ?? ""));
    const author = String(body?.author ?? "").trim();
    const key = String(body?.key ?? "");
    const legacyName = String(body?.legacyName ?? "");
    if (!unit) return NextResponse.json({ error: "Choose a department." }, { status: 400 });
    if (!author) return NextResponse.json({ error: "Enter your name (kept in the history)." }, { status: 400 });
    const now = () => new Date().toISOString();

    if (key) {
        const doc = await guard.deps.store.getDocument(key);
        if (!doc || doc.unitId !== unit.id) return NextResponse.json({ error: "Document not found in this department." }, { status: 404 });
        if (doc.origin !== "manual") {
            return NextResponse.json({ error: "This document comes from the UTAR website or portal; the monthly sync would add it back. Ask for the page to be changed at the source." }, { status: 400 });
        }
        const item = await retireDocument(key, `removed by admin:${author}`, guard.deps);
        if (!item) return NextResponse.json({ error: "This document is already removed." }, { status: 400 });
        await guard.deps.store.saveRun({ kind: "remove", startedAt: now(), finishedAt: now(), items: [item] });
        return NextResponse.json({ item }, { status: item.outcome === "failed" ? 502 : 200 });
    }

    if (legacyName) {
        const legacy = await isLegacyDocument(legacyName, unit.storeName);
        if (!legacy.ok) return NextResponse.json({ error: "Not an older upload in this department's store." }, { status: 400 });
        try {
            await guard.deps.publisher.remove(legacyName);
        } catch (error: any) {
            return NextResponse.json({ error: `Could not remove: ${error?.message || error}` }, { status: 502 });
        }
        const item = { key: legacyName, title: legacy.displayName ?? legacyName, unitId: unit.id, outcome: "retired" as const, detail: `older upload removed by admin:${author} (no copy was kept)` };
        await guard.deps.store.saveRun({ kind: "remove", startedAt: now(), finishedAt: now(), items: [item] });
        return NextResponse.json({ item });
    }

    return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
}
