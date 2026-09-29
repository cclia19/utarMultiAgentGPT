import { NextRequest, NextResponse } from "next/server";
import {
    DASHBOARD_COOKIE,
    DASHBOARD_COOKIE_MAX_AGE,
    dashboardEnabled,
    passwordMatches,
    sessionToken,
} from "@/lib/analytics/auth";

export async function POST(req: NextRequest) {
    if (!dashboardEnabled()) {
        return NextResponse.json({ error: "Dashboard is not configured." }, { status: 503 });
    }
    const body = await req.json().catch(() => ({}));
    if (!passwordMatches(String(body?.password || ""))) {
        await new Promise((r) => setTimeout(r, 800)); // slow down guessing
        return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(DASHBOARD_COOKIE, sessionToken() as string, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: DASHBOARD_COOKIE_MAX_AGE,
    });
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(DASHBOARD_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
}
