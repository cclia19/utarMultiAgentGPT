import { NextRequest, NextResponse } from "next/server";
import { getDeptCatalog, lookupStaff, matchRole, findDeptCodesForRole } from "@/lib/staffDirectory";

/**
 * TEMPORARY diagnostic. Reports what actually happens when this deployment
 * tries to reach UTAR's staff directory, because the failure is invisible
 * otherwise: `answerFromStaffDirectory` swallows every error into a refusal by
 * design, and reading the real cause needs Vercel log access we do not have.
 *
 * Delete this route once the directory is confirmed reachable from production.
 */
export const maxDuration = 60;

const SEARCH_URL = "https://www2.utar.edu.my/staffListSearchV2.jsp";

function describeError(error: unknown) {
    const err = error as { name?: string; message?: string; cause?: unknown };
    const cause = err?.cause as { code?: string; message?: string } | undefined;

    return {
        name: err?.name ?? null,
        message: err?.message ?? String(error),
        causeCode: cause?.code ?? null,
        causeMessage: cause?.message ?? null,
    };
}

/** One raw fetch, fully instrumented, with no swallowing. */
async function probe(label: string, url: string, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
        const response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
            signal: controller.signal,
        });

        const bytes = (await response.arrayBuffer()).byteLength;

        return {
            label,
            ok: response.ok,
            status: response.status,
            bytes,
            elapsedMs: Date.now() - startedAt,
            error: null,
        };
    } catch (error) {
        return {
            label,
            ok: false,
            status: null,
            bytes: 0,
            elapsedMs: Date.now() - startedAt,
            error: describeError(error),
        };
    } finally {
        clearTimeout(timer);
    }
}

export async function GET(req: NextRequest) {
    const secret =
        req.headers.get("x-admin-secret") ?? req.nextUrl.searchParams.get("secret");

    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const query =
        "searchDept=RGO&searchDiv=All&searchName=&searchExpertise=&submit=Search&searchResult=Y";

    // The 8s budget is what the real code uses; 30s tells us whether the site is
    // merely slow from this region rather than unreachable.
    const atProductionBudget = await probe("rgo @ 8s (production budget)", `${SEARCH_URL}?${query}`, 8000);
    const atGenerousBudget = await probe("rgo @ 30s (diagnostic)", `${SEARCH_URL}?${query}`, 30000);

    // Now the real code path, to confirm the diagnosis end to end.
    let catalogCount = -1;
    let registrarNames: string[] = [];
    let pathError: ReturnType<typeof describeError> | null = null;

    try {
        const catalog = await getDeptCatalog();
        catalogCount = catalog.length;

        if (catalog.length) {
            const codes = findDeptCodesForRole("registrar", catalog);
            const records = await lookupStaff({ deptCodes: codes });
            registrarNames = matchRole(records, "registrar").map((r) => r.name);
        }
    } catch (error) {
        pathError = describeError(error);
    }

    return NextResponse.json({
        region: process.env.VERCEL_REGION ?? "unknown",
        env: process.env.VERCEL_ENV ?? "local",
        probes: [atProductionBudget, atGenerousBudget],
        realPath: { catalogCount, registrarNames, pathError },
    });
}
