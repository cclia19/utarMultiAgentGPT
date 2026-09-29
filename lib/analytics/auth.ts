import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const DASHBOARD_COOKIE = "utarchat_dash";
export const DASHBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sha256(value: string): Buffer {
    return createHash("sha256").update(value).digest();
}

export function dashboardEnabled(): boolean {
    return Boolean(process.env.DASHBOARD_PASSWORD);
}

export function passwordMatches(input: string): boolean {
    const expected = process.env.DASHBOARD_PASSWORD;
    if (!expected) return false;
    return timingSafeEqual(sha256(String(input || "")), sha256(expected));
}

/** Session token derived from the password: changing the password logs everyone out. */
export function sessionToken(): string | null {
    const pw = process.env.DASHBOARD_PASSWORD;
    if (!pw) return null;
    return createHmac("sha256", pw).update("utarchat-dashboard-v1").digest("hex");
}

export function isDashboardAuthed(req: NextRequest): boolean {
    const expected = sessionToken();
    const got = req.cookies.get(DASHBOARD_COOKIE)?.value || "";
    if (!expected || got.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
