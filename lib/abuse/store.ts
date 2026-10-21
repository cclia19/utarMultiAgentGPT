import { getSql } from "../analytics/db.ts";

/**
 * Where the abuse limits keep their state: per-window request counters, each
 * client's last message (for the repeat check), manual blocks, today's spend
 * and which alerts were already sent.
 *
 * Production uses Neon (the same database as the usage analytics). An
 * in-memory store exists for unit tests and for local runs without Neon
 * (ABUSE_STORE=memory, ignored in production builds).
 */

export type CounterHit = { key: string; window: string };

export type SpendToday = {
    inputTokens: number;
    outputTokens: number;
    webSearchCalls: number;
    /** Requests still "started" long after they began, or timed out: their tokens were never logged. */
    unfinished: number;
};

export interface AbuseStore {
    /** Manual block, and the client's last answered message (only if within the repeat window). */
    lookup(params: { clientKey: string; ipHash: string; repeatWindowSec: number }): Promise<{ blocked: boolean; lastFingerprint: string | null; lastAgeSec: number | null }>;
    /** Adds one to each counter atomically; returns the new counts in the same order. */
    hit(counters: CounterHit[]): Promise<number[]>;
    spendToday(malaysiaDay: string): Promise<SpendToday>;
    rememberMessage(clientKey: string, fingerprint: string): Promise<void>;
    /** True the first time an alert kind is claimed for the day (so each alert is sent once). */
    claimAlert(malaysiaDay: string, kind: string): Promise<boolean>;
}

/* ---------- Neon ---------- */

type Sql = NonNullable<ReturnType<typeof getSql>>;
let schemaReady: Promise<void> | null = null;

function ensureAbuseSchema(sql: Sql): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await sql`
                CREATE TABLE IF NOT EXISTS rate_limit_counters (
                    key TEXT NOT NULL,
                    win TEXT NOT NULL,
                    count INT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (key, win)
                )`;
            await sql`
                CREATE TABLE IF NOT EXISTS client_last_message (
                    client_key TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`;
            await sql`
                CREATE TABLE IF NOT EXISTS blocked_clients (
                    id BIGSERIAL PRIMARY KEY,
                    client_id TEXT,
                    ip_hash TEXT,
                    reason TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    expires_at TIMESTAMPTZ
                )`;
            await sql`
                CREATE TABLE IF NOT EXISTS abuse_alerts (
                    day TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (day, kind)
                )`;
        })().catch((err) => {
            schemaReady = null;
            throw err;
        });
    }
    return schemaReady;
}

let lastCleanup = 0;

class NeonAbuseStore implements AbuseStore {
    private sql: Sql;

    constructor(sql: Sql) {
        this.sql = sql;
    }

    async lookup({ clientKey, ipHash, repeatWindowSec }: { clientKey: string; ipHash: string; repeatWindowSec: number }) {
        await ensureAbuseSchema(this.sql);
        const [row] = await this.sql`
            SELECT
                EXISTS (
                    SELECT 1 FROM blocked_clients
                    WHERE (client_id = ${clientKey} OR ip_hash = ${ipHash})
                      AND (expires_at IS NULL OR expires_at > now())
                ) AS blocked,
                (SELECT fingerprint FROM client_last_message
                  WHERE client_key = ${clientKey}
                    AND updated_at > now() - make_interval(secs => ${repeatWindowSec})) AS last_fingerprint,
                (SELECT extract(epoch FROM now() - updated_at)::float FROM client_last_message
                  WHERE client_key = ${clientKey}) AS last_age_sec`;
        return {
            blocked: Boolean(row?.blocked),
            lastFingerprint: row?.last_fingerprint ?? null,
            lastAgeSec: row?.last_age_sec == null ? null : Number(row.last_age_sec),
        };
    }

    async hit(counters: CounterHit[]) {
        await ensureAbuseSchema(this.sql);
        const keys = counters.map((c) => c.key);
        const wins = counters.map((c) => c.window);
        // One statement, so concurrent requests can never both read the old count.
        const rows = await this.sql`
            INSERT INTO rate_limit_counters (key, win, count)
            SELECT * FROM unnest(${keys}::text[], ${wins}::text[], array_fill(1, ARRAY[${counters.length}::int]))
            ON CONFLICT (key, win) DO UPDATE
                SET count = rate_limit_counters.count + 1, updated_at = now()
            RETURNING key, win, count`;
        if (Date.now() - lastCleanup > 60 * 60 * 1000) {
            lastCleanup = Date.now();
            this.sql`DELETE FROM rate_limit_counters WHERE updated_at < now() - interval '2 days'`.catch(() => {});
            this.sql`DELETE FROM client_last_message WHERE updated_at < now() - interval '1 day'`.catch(() => {});
            // IP hashes are only kept short-term (rate limiting and incident review).
            this.sql`UPDATE chat_events SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < now() - interval '7 days'`.catch(() => {});
        }
        const byKey = new Map(rows.map((r: any) => [`${r.key}|${r.win}`, Number(r.count)]));
        return counters.map((c) => byKey.get(`${c.key}|${c.window}`) ?? Number.MAX_SAFE_INTEGER);
    }

    async spendToday(malaysiaDay: string) {
        const [row] = await this.sql`
            SELECT
                coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
                coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
                coalesce(sum(web_search_calls), 0)::bigint AS web_search_calls,
                count(*) FILTER (
                    WHERE status = 'timeout'
                       OR (status = 'started' AND created_at < now() - interval '90 seconds')
                )::int AS unfinished
            FROM chat_events
            WHERE created_at >= (${malaysiaDay}::date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')`;
        return {
            inputTokens: Number(row?.input_tokens ?? 0),
            outputTokens: Number(row?.output_tokens ?? 0),
            webSearchCalls: Number(row?.web_search_calls ?? 0),
            unfinished: Number(row?.unfinished ?? 0),
        };
    }

    async rememberMessage(clientKey: string, fingerprint: string) {
        await ensureAbuseSchema(this.sql);
        await this.sql`
            INSERT INTO client_last_message (client_key, fingerprint) VALUES (${clientKey}, ${fingerprint})
            ON CONFLICT (client_key) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, updated_at = now()`;
    }

    async claimAlert(malaysiaDay: string, kind: string) {
        await ensureAbuseSchema(this.sql);
        const rows = await this.sql`
            INSERT INTO abuse_alerts (day, kind) VALUES (${malaysiaDay}, ${kind})
            ON CONFLICT DO NOTHING RETURNING kind`;
        return rows.length > 0;
    }
}

/* ---------- in memory (tests, local runs without Neon) ---------- */

export class MemoryAbuseStore implements AbuseStore {
    counters = new Map<string, number>();
    lastMessages = new Map<string, { fingerprint: string; at: number }>();
    blockedClients = new Set<string>();
    alerts = new Set<string>();
    spend: SpendToday = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0, unfinished: 0 };
    failing = false;

    private check() {
        if (this.failing) throw new Error("limit store unavailable");
    }

    async lookup({ clientKey, ipHash, repeatWindowSec }: { clientKey: string; ipHash: string; repeatWindowSec: number }) {
        this.check();
        const last = this.lastMessages.get(clientKey);
        const fresh = last && Date.now() - last.at <= repeatWindowSec * 1000;
        return {
            blocked: this.blockedClients.has(clientKey) || this.blockedClients.has(ipHash),
            lastFingerprint: fresh ? last.fingerprint : null,
            lastAgeSec: last ? (Date.now() - last.at) / 1000 : null,
        };
    }

    async hit(counters: CounterHit[]) {
        this.check();
        return counters.map(({ key, window }) => {
            const id = `${key}|${window}`;
            const next = (this.counters.get(id) ?? 0) + 1;
            this.counters.set(id, next);
            return next;
        });
    }

    async spendToday() {
        this.check();
        return this.spend;
    }

    async rememberMessage(clientKey: string, fingerprint: string) {
        this.check();
        this.lastMessages.set(clientKey, { fingerprint, at: Date.now() });
    }

    async claimAlert(day: string, kind: string) {
        this.check();
        const id = `${day}|${kind}`;
        if (this.alerts.has(id)) return false;
        this.alerts.add(id);
        return true;
    }
}

let memoryStore: MemoryAbuseStore | null = null;

/**
 * The store for this deployment, or null when none is configured. The chat
 * route refuses requests when this is null (fail closed).
 */
export function getAbuseStore(): AbuseStore | null {
    if (process.env.NODE_ENV !== "production" && process.env.ABUSE_STORE === "memory") {
        memoryStore ??= new MemoryAbuseStore();
        return memoryStore;
    }
    const sql = getSql();
    return sql ? new NeonAbuseStore(sql) : null;
}
