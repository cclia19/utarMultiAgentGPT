import { NextRequest, NextResponse } from "next/server";
import { kbGuard, kbUnits, legacyDocuments } from "@/lib/kb/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/kb?view=units | documents&unit=fict | versions&key=... | runs
 */
export async function GET(req: NextRequest) {
    const guard = kbGuard(req);
    if (guard.error) return guard.error;
    const { store } = guard.deps;
    const view = req.nextUrl.searchParams.get("view") ?? "units";
    try {
        if (view === "units") {
            const docs = await store.listDocuments();
            const counts = docs.reduce<Record<string, number>>((acc, d) => ((acc[d.unitId] = (acc[d.unitId] ?? 0) + 1), acc), {});
            return NextResponse.json({ localMode: guard.localMode, units: kbUnits().map((u) => ({ ...u, documents: counts[u.id] ?? 0 })) });
        }
        if (view === "documents") {
            const unitId = req.nextUrl.searchParams.get("unit") ?? "";
            const unit = kbUnits().find((u) => u.id === unitId);
            if (!unit) return NextResponse.json({ error: "Unknown department" }, { status: 400 });
            const [documents, legacy] = await Promise.all([store.listDocuments(unitId), legacyDocuments(unit.storeName).catch(() => [])]);
            return NextResponse.json({ unit, documents, legacy });
        }
        if (view === "versions") {
            const key = req.nextUrl.searchParams.get("key") ?? "";
            const [document, versions] = await Promise.all([store.getDocument(key), store.listVersions(key)]);
            if (!document) return NextResponse.json({ error: "Unknown document" }, { status: 404 });
            return NextResponse.json({ document, versions });
        }
        if (view === "runs") return NextResponse.json({ runs: await store.listRuns(20) });
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    } catch (error: any) {
        console.error("[kb admin]", error);
        return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
    }
}
