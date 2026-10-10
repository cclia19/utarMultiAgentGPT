import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDashboardAuthed } from "@/lib/analytics/auth";
import { getSql } from "@/lib/analytics/db";
import { ai } from "@/lib/gemini";
import { ORG_UNITS } from "@/lib/orgUnits";
import path from "node:path";
import { GeminiPublisher, RecordingPublisher } from "./publisher.ts";
import { FileVersionStore, PostgresVersionStore } from "./versionStore.ts";

/**
 * Shared setup for the /admin/upload API routes: the dashboard login, the
 * Postgres version store and the Gemini publisher. Must not import anything
 * that loads the `undici` package (see lib/kb/fetchHtml.ts).
 */
export function kbGuard(req: NextRequest) {
    if (!isDashboardAuthed(req)) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    const sql = getSql();
    if (!sql) {
        // `next dev` without a database: local test mode. Versions go to a JSON
        // file and uploads are only recorded, so the live stores are untouched.
        if (process.env.NODE_ENV !== "production") {
            return { localMode: true, deps: { store: new FileVersionStore(path.resolve(process.cwd(), "../kb-admin-local-state.json")), publisher: new RecordingPublisher() } };
        }
        return { error: NextResponse.json({ error: "DATABASE_URL is not set: versions cannot be stored." }, { status: 503 }) };
    }
    return { localMode: false, deps: { store: new PostgresVersionStore(sql), publisher: new GeminiPublisher(ai) } };
}

/** Departments that answer questions and have a knowledge store. */
export function kbUnits() {
    return ORG_UNITS.filter((u: any) => u.enabledForChat && u.storeResourceIds?.length).map((u: any) => ({
        id: u.id as string,
        name: u.name as string,
        shortLabel: (u.shortLabel ?? u.id) as string,
        storeName: u.storeResourceIds[0] as string,
    }));
}

/** Documents in a store that this system did not create (old intranet uploader). */
export async function legacyDocuments(storeName: string) {
    const out: { name: string; displayName: string; createTime?: string; sizeBytes?: string }[] = [];
    const pager = await ai.fileSearchStores.documents.list({ parent: storeName, config: { pageSize: 20 } });
    for await (const d of pager as any) {
        const managed = (d.customMetadata ?? []).some((m: any) => m.key === "kb_key");
        if (!managed) out.push({ name: d.name, displayName: d.displayName, createTime: d.createTime, sizeBytes: d.sizeBytes });
        if (out.length >= 200) break;
    }
    return out;
}

export const slug = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
