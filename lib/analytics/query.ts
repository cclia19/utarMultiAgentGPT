import type { NextRequest } from "next/server";
import { currentEnv } from "./db";

export const TIMEZONE = "Asia/Kuala_Lumpur";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ENVS = new Set(["production", "preview", "development"]);

function klToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

function shiftDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Reads ?from=YYYY-MM-DD&to=YYYY-MM-DD&env=... (Malaysia dates). Defaults to the last 30 days. */
export function readRange(req: NextRequest) {
    const p = req.nextUrl.searchParams;
    const to = DATE_RE.test(p.get("to") || "") ? (p.get("to") as string) : klToday();
    const from = DATE_RE.test(p.get("from") || "") ? (p.get("from") as string) : shiftDays(to, -29);
    const envParam = p.get("env") || "";
    const env = ENVS.has(envParam) ? envParam : currentEnv();
    return { from, to, env };
}
