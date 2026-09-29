import { NextRequest, NextResponse } from "next/server";
import { dashboardGuard } from "@/lib/analytics/guard";
import { readRange, TIMEZONE } from "@/lib/analytics/query";

export const dynamic = "force-dynamic";

// Question text is kept for 12 months, then blanked (counts are kept).
const RETENTION = "12 months";
let lastRetentionRun = 0;

export async function GET(req: NextRequest) {
    const guard = await dashboardGuard(req);
    if (guard.error) return guard.error;
    const sql = guard.sql;
    const { from, to, env } = readRange(req);

    try {
        if (Date.now() - lastRetentionRun > 6 * 60 * 60 * 1000) {
            lastRetentionRun = Date.now();
            await sql`UPDATE chat_events SET question_masked = NULL
                      WHERE question_masked IS NOT NULL AND created_at < now() - ${RETENTION}::interval`;
        }

        const where = sql`env = ${env}
            AND created_at >= (${from}::date::timestamp AT TIME ZONE ${TIMEZONE})
            AND created_at < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIMEZONE})`;

        const [totals] = await sql`
            SELECT
                count(*)::int AS questions,
                count(DISTINCT session_id)::int AS sessions,
                count(*) FILTER (WHERE source_mode = 'fileSearch')::int AS kb,
                count(*) FILTER (WHERE source_mode = 'webFallback')::int AS web,
                count(*) FILTER (WHERE source_mode = 'staffDirectory')::int AS directory,
                count(*) FILTER (WHERE source_mode = 'none' OR source_mode IS NULL)::int AS direct,
                count(*) FILTER (WHERE status = 'error')::int AS errors,
                count(*) FILTER (WHERE is_follow_up)::int AS follow_ups,
                count(*) FILTER (WHERE needs_clarification)::int AS clarifications,
                coalesce(round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)), 0)::int AS p50_ms,
                coalesce(round(percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms)), 0)::int AS p90_ms,
                coalesce(sum(gemini_calls), 0)::int AS gemini_calls,
                coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
                coalesce(sum(output_tokens), 0)::bigint AS output_tokens
            FROM chat_events WHERE ${where}`;

        const daily = await sql`
            SELECT to_char(created_at AT TIME ZONE ${TIMEZONE}, 'YYYY-MM-DD') AS day,
                count(*)::int AS questions,
                count(DISTINCT session_id)::int AS sessions,
                count(*) FILTER (WHERE source_mode = 'fileSearch')::int AS kb,
                count(*) FILTER (WHERE source_mode = 'webFallback')::int AS web
            FROM chat_events WHERE ${where}
            GROUP BY 1 ORDER BY 1`;

        const heatmap = await sql`
            SELECT extract(isodow FROM created_at AT TIME ZONE ${TIMEZONE})::int AS dow,
                extract(hour FROM created_at AT TIME ZONE ${TIMEZONE})::int AS hour,
                count(*)::int AS questions
            FROM chat_events WHERE ${where}
            GROUP BY 1, 2`;

        const agents = await sql`
            SELECT coalesce(agent_label, 'Unknown') AS agent, count(*)::int AS questions,
                count(*) FILTER (WHERE source_mode = 'webFallback')::int AS web
            FROM chat_events WHERE ${where}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 20`;

        return NextResponse.json({
            range: { from, to, env, timezone: TIMEZONE },
            totals: {
                ...totals,
                input_tokens: Number(totals.input_tokens),
                output_tokens: Number(totals.output_tokens),
            },
            daily,
            heatmap,
            agents,
        });
    } catch (err: any) {
        console.error("[analytics] summary failed:", err);
        return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
    }
}
