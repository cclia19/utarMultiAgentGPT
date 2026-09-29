import { NextRequest, NextResponse } from "next/server";
import { dashboardGuard } from "@/lib/analytics/guard";
import { readRange, TIMEZONE } from "@/lib/analytics/query";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const SOURCES = new Set(["fileSearch", "webFallback", "staffDirectory", "none"]);

export async function GET(req: NextRequest) {
    const guard = await dashboardGuard(req);
    if (guard.error) return guard.error;
    const sql = guard.sql;
    const { from, to, env } = readRange(req);
    const p = req.nextUrl.searchParams;
    const search = (p.get("q") || "").trim().slice(0, 100);
    const source = SOURCES.has(p.get("source") || "") ? (p.get("source") as string) : "";
    const page = Math.max(0, Math.min(1000, parseInt(p.get("page") || "0", 10) || 0));

    try {
        const where = sql`env = ${env}
            AND created_at >= (${from}::date::timestamp AT TIME ZONE ${TIMEZONE})
            AND created_at < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIMEZONE})
            ${search ? sql`AND question_masked ILIKE ${"%" + search.replace(/[%_\\]/g, "\\$&") + "%"}` : sql``}
            ${source ? sql`AND coalesce(source_mode, 'none') = ${source}` : sql``}`;

        const [{ total }] = await sql`SELECT count(*)::int AS total FROM chat_events WHERE ${where}`;
        const rows = await sql`
            SELECT id::text, created_at, agent_label, source_mode, is_follow_up, status,
                latency_ms, question_masked
            FROM chat_events WHERE ${where}
            ORDER BY created_at DESC
            LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`;

        return NextResponse.json({ total, page, pageSize: PAGE_SIZE, rows });
    } catch (err: any) {
        console.error("[analytics] questions failed:", err);
        return NextResponse.json({ error: "Could not load questions." }, { status: 500 });
    }
}
