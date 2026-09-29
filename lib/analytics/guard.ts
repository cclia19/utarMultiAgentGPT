import { NextRequest, NextResponse } from "next/server";
import { isDashboardAuthed } from "./auth";
import { ensureSchema, getSql } from "./db";

/** Shared checks for dashboard API routes: auth first, then database availability. */
export async function dashboardGuard(req: NextRequest) {
    if (!isDashboardAuthed(req)) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    const sql = getSql();
    if (!sql) {
        return {
            error: NextResponse.json(
                { error: "DATABASE_URL is not set, so no usage data is being recorded yet." },
                { status: 503 }
            ),
        };
    }
    await ensureSchema(sql);
    return { sql };
}
