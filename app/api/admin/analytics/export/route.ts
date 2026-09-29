import { NextRequest, NextResponse } from "next/server";
import { dashboardGuard } from "@/lib/analytics/guard";
import { readRange, TIMEZONE } from "@/lib/analytics/query";

export const dynamic = "force-dynamic";
const MAX_ROWS = 50000;

const COLUMNS = [
    "created_at_myt", "agent_label", "source_mode", "route_type", "is_follow_up",
    "needs_clarification", "status", "latency_ms", "gemini_calls", "web_search_calls",
    "input_tokens", "output_tokens", "question_masked",
] as const;

function csvCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    let s = String(value);
    // Neutralise spreadsheet formulas in user-supplied text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
    const guard = await dashboardGuard(req);
    if (guard.error) return guard.error;
    const sql = guard.sql;
    const { from, to, env } = readRange(req);

    try {
        const rows = await sql`
            SELECT to_char(created_at AT TIME ZONE ${TIMEZONE}, 'YYYY-MM-DD HH24:MI:SS') AS created_at_myt,
                agent_label, source_mode, route_type, is_follow_up, needs_clarification, status,
                latency_ms, gemini_calls, web_search_calls, input_tokens, output_tokens, question_masked
            FROM chat_events
            WHERE env = ${env}
              AND created_at >= (${from}::date::timestamp AT TIME ZONE ${TIMEZONE})
              AND created_at < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIMEZONE})
            ORDER BY created_at
            LIMIT ${MAX_ROWS}`;

        const lines = [COLUMNS.join(",")];
        for (const r of rows as any[]) lines.push(COLUMNS.map((c) => csvCell(r[c])).join(","));

        return new NextResponse("﻿" + lines.join("\r\n"), {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="utarchat-questions_${from}_to_${to}.csv"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err: any) {
        console.error("[analytics] export failed:", err);
        return NextResponse.json({ error: "Could not export." }, { status: 500 });
    }
}
