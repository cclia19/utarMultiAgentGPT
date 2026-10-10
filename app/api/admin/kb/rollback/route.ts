import { NextRequest, NextResponse } from "next/server";
import { kbGuard } from "@/lib/kb/server";
import { rollback } from "@/lib/kb/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { key, version, author }: publishes that version's content again as the newest version. */
export async function POST(req: NextRequest) {
    const guard = kbGuard(req);
    if (guard.error) return guard.error;
    const body = await req.json().catch(() => ({}));
    const key = String(body?.key ?? "");
    const version = Number(body?.version);
    const author = String(body?.author ?? "").trim();
    if (!key || !Number.isInteger(version) || version < 1) return NextResponse.json({ error: "key and version are required" }, { status: 400 });
    if (!author) return NextResponse.json({ error: "Enter your name (kept in the version history)." }, { status: 400 });
    const item = await rollback(key, version, `admin:${author}`.slice(0, 100), guard.deps);
    await guard.deps.store.saveRun({ kind: "rollback", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), items: [item] });
    return NextResponse.json({ item }, { status: item.outcome === "failed" ? 502 : 200 });
}
