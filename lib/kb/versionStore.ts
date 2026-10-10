import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { KbDocument, KbDraft, KbRun, KbVersion, KbVersionStore } from "./types.ts";

/**
 * Where documents, versions and run reports are kept.
 *
 * PostgresVersionStore: production (the Neon database used for analytics).
 * FileVersionStore: one JSON file, for local dry runs and tests.
 */

type Sql = any; // postgres.js tagged-template client (lib/analytics/db.ts)

const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS kb_documents (
        key TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL,
        store_name TEXT NOT NULL,
        title TEXT NOT NULL,
        origin TEXT NOT NULL,
        source_url TEXT,
        live_version INT NOT NULL DEFAULT 0,
        gemini_document TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS kb_versions (
        key TEXT NOT NULL REFERENCES kb_documents(key) ON DELETE CASCADE,
        version INT NOT NULL,
        content_hash TEXT NOT NULL,
        text TEXT NOT NULL,
        chars INT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        gemini_document TEXT,
        PRIMARY KEY (key, version)
    )`,
    `CREATE TABLE IF NOT EXISTS kb_runs (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ,
        items JSONB NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS kb_documents_unit_idx ON kb_documents (unit_id)`,
];

const iso = (d: any) => (d instanceof Date ? d.toISOString() : String(d ?? ""));

export class PostgresVersionStore implements KbVersionStore {
    private ready: Promise<void> | null = null;
    private sql: Sql;
    constructor(sql: Sql) {
        this.sql = sql;
    }

    private schema() {
        this.ready ??= (async () => {
            for (const statement of SCHEMA) await this.sql.unsafe(statement);
        })();
        return this.ready;
    }

    private toDoc(r: any): KbDocument {
        return {
            key: r.key,
            unitId: r.unit_id,
            storeName: r.store_name,
            title: r.title,
            origin: r.origin,
            sourceUrl: r.source_url ?? undefined,
            liveVersion: r.live_version,
            geminiDocument: r.gemini_document ?? undefined,
            updatedAt: iso(r.updated_at),
        };
    }

    async getDocument(key: string) {
        await this.schema();
        const [r] = await this.sql`SELECT * FROM kb_documents WHERE key = ${key}`;
        return r ? this.toDoc(r) : null;
    }

    async getVersion(key: string, version: number): Promise<KbVersion | null> {
        await this.schema();
        const [r] = await this.sql`SELECT * FROM kb_versions WHERE key = ${key} AND version = ${version}`;
        return r
            ? { key: r.key, version: r.version, contentHash: r.content_hash, text: r.text, chars: r.chars, title: r.title, author: r.author, note: r.note ?? undefined, createdAt: iso(r.created_at), geminiDocument: r.gemini_document ?? undefined }
            : null;
    }

    async listDocuments(unitId?: string) {
        await this.schema();
        const rows = unitId
            ? await this.sql`SELECT * FROM kb_documents WHERE unit_id = ${unitId} ORDER BY title`
            : await this.sql`SELECT * FROM kb_documents ORDER BY unit_id, title`;
        return rows.map((r: any) => this.toDoc(r));
    }

    async listVersions(key: string) {
        await this.schema();
        const rows = await this.sql`
            SELECT key, version, content_hash, chars, title, author, note, created_at, gemini_document
            FROM kb_versions WHERE key = ${key} ORDER BY version DESC`;
        return rows.map((r: any) => ({ key: r.key, version: r.version, contentHash: r.content_hash, chars: r.chars, title: r.title, author: r.author, note: r.note ?? undefined, createdAt: iso(r.created_at), geminiDocument: r.gemini_document ?? undefined }));
    }

    async addVersion(draft: KbDraft, contentHash: string) {
        await this.schema();
        return this.sql.begin(async (tx: Sql) => {
            await tx`
                INSERT INTO kb_documents (key, unit_id, store_name, title, origin, source_url)
                VALUES (${draft.key}, ${draft.unitId}, ${draft.storeName}, ${draft.title}, ${draft.origin}, ${draft.sourceUrl ?? null})
                ON CONFLICT (key) DO UPDATE SET unit_id = EXCLUDED.unit_id, store_name = EXCLUDED.store_name,
                    title = EXCLUDED.title, source_url = EXCLUDED.source_url`;
            const [{ next }] = await tx`SELECT COALESCE(MAX(version), 0) + 1 AS next FROM kb_versions WHERE key = ${draft.key}`;
            await tx`
                INSERT INTO kb_versions (key, version, content_hash, text, chars, title, author, note)
                VALUES (${draft.key}, ${next}, ${contentHash}, ${draft.text}, ${draft.text.length}, ${draft.title}, ${draft.author}, ${draft.note ?? null})`;
            return Number(next);
        });
    }

    async setLive(key: string, version: number, geminiDocument: string) {
        await this.schema();
        await this.sql.begin(async (tx: Sql) => {
            await tx`UPDATE kb_versions SET gemini_document = NULL WHERE key = ${key} AND version <> ${version}`;
            await tx`UPDATE kb_versions SET gemini_document = ${geminiDocument} WHERE key = ${key} AND version = ${version}`;
            await tx`UPDATE kb_documents SET live_version = ${version}, gemini_document = ${geminiDocument}, updated_at = now() WHERE key = ${key}`;
        });
    }

    async saveRun(run: KbRun) {
        await this.schema();
        const [{ id }] = await this.sql`
            INSERT INTO kb_runs (kind, started_at, finished_at, items)
            VALUES (${run.kind}, ${run.startedAt}, ${run.finishedAt ?? null}, ${this.sql.json(run.items)})
            RETURNING id`;
        return Number(id);
    }

    async listRuns(limit = 20) {
        await this.schema();
        const rows = await this.sql`SELECT * FROM kb_runs ORDER BY id DESC LIMIT ${limit}`;
        return rows.map((r: any) => ({ id: Number(r.id), kind: r.kind, startedAt: iso(r.started_at), finishedAt: r.finished_at ? iso(r.finished_at) : undefined, items: r.items }));
    }
}

type FileData = { documents: Record<string, KbDocument>; versions: Record<string, KbVersion[]>; runs: KbRun[] };

/** Same behaviour in one JSON file (local dry runs, tests). Pass no path for memory only. */
export class FileVersionStore implements KbVersionStore {
    private data: FileData;
    private path?: string;
    constructor(path?: string) {
        this.path = path;
        this.data = path && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { documents: {}, versions: {}, runs: [] };
    }
    private save() {
        if (this.path) writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    }
    async getDocument(key: string) {
        return this.data.documents[key] ?? null;
    }
    async getVersion(key: string, version: number) {
        return this.data.versions[key]?.find((v) => v.version === version) ?? null;
    }
    async listDocuments(unitId?: string) {
        return Object.values(this.data.documents).filter((d) => !unitId || d.unitId === unitId);
    }
    async listVersions(key: string) {
        return (this.data.versions[key] ?? []).map(({ text: _text, ...rest }) => rest).reverse();
    }
    async addVersion(draft: KbDraft, contentHash: string) {
        const existing = this.data.documents[draft.key];
        this.data.documents[draft.key] = {
            key: draft.key,
            unitId: draft.unitId,
            storeName: draft.storeName,
            title: draft.title,
            origin: draft.origin,
            sourceUrl: draft.sourceUrl,
            liveVersion: existing?.liveVersion ?? 0,
            geminiDocument: existing?.geminiDocument,
            updatedAt: existing?.updatedAt ?? new Date().toISOString(),
        };
        const versions = (this.data.versions[draft.key] ??= []);
        const version = versions.length + 1;
        versions.push({ key: draft.key, version, contentHash, text: draft.text, chars: draft.text.length, title: draft.title, author: draft.author, note: draft.note, createdAt: new Date().toISOString() });
        this.save();
        return version;
    }
    async setLive(key: string, version: number, geminiDocument: string) {
        for (const v of this.data.versions[key] ?? []) v.geminiDocument = v.version === version ? geminiDocument : undefined;
        Object.assign(this.data.documents[key], { liveVersion: version, geminiDocument, updatedAt: new Date().toISOString() });
        this.save();
    }
    async saveRun(run: KbRun) {
        const id = this.data.runs.length + 1;
        this.data.runs.push({ ...run, id });
        this.save();
        return id;
    }
    async listRuns(limit = 20) {
        return [...this.data.runs].reverse().slice(0, limit);
    }
}
