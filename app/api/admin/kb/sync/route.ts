import { NextRequest, NextResponse } from "next/server";
import { kbGuard } from "@/lib/kb/server";

export const dynamic = "force-dynamic";

/**
 * The "Sync now" button: starts the monthly knowledge-base sync (GitHub
 * workflow kb-sync.yml: programme pages, official pages, staff research
 * profiles) right away, e.g. at the start of a trimester.
 *
 * Needs GITHUB_SYNC_TOKEN on Vercel: a fine-grained GitHub token for this
 * repository with "Actions: read and write".
 *
 * GET  → the latest run (status, when, link)
 * POST → start a run that publishes changes
 */
const REPO = "cclia19/utarMultiAgentGPT";
const WORKFLOW = "kb-sync.yml";

function github(path: string, init?: RequestInit) {
    return fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}${path}`, {
        ...init,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${process.env.GITHUB_SYNC_TOKEN}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

const notSetUp = () =>
    NextResponse.json({ error: "The Sync now button is not set up yet: add GITHUB_SYNC_TOKEN in Vercel (see docs/knowledge-base.md)." }, { status: 501 });

export async function GET(req: NextRequest) {
    const guard = kbGuard(req);
    if (guard.error) return guard.error;
    if (!process.env.GITHUB_SYNC_TOKEN) return notSetUp();
    const res = await github("/runs?per_page=1");
    if (!res.ok) return NextResponse.json({ error: `GitHub: ${res.status}` }, { status: 502 });
    const run = (await res.json()).workflow_runs?.[0];
    return NextResponse.json({
        run: run
            ? { status: run.status, conclusion: run.conclusion, startedAt: run.run_started_at ?? run.created_at, trigger: run.event, url: run.html_url }
            : null,
    });
}

export async function POST(req: NextRequest) {
    const guard = kbGuard(req);
    if (guard.error) return guard.error;
    if (!process.env.GITHUB_SYNC_TOKEN) return notSetUp();
    const res = await github("/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { apply: true } }) });
    if (res.status !== 204) return NextResponse.json({ error: `GitHub refused the request (${res.status}): ${await res.text()}` }, { status: 502 });
    return NextResponse.json({ ok: true });
}
