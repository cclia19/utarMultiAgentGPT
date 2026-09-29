import postgres from "postgres";

/**
 * Postgres connection for usage analytics (Neon in production).
 * Returns null when DATABASE_URL is not set, so the chat keeps working
 * and simply skips logging.
 */
type Sql = ReturnType<typeof postgres>;

let sqlClient: Sql | null | undefined;
let schemaReady: Promise<void> | null = null;

export function getSql(): Sql | null {
    if (sqlClient !== undefined) return sqlClient;
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
    if (!url) {
        sqlClient = null;
        return sqlClient;
    }
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    sqlClient = postgres(url, {
        ssl: isLocal ? false : "require",
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false, // required for Neon's pooled (pgbouncer) endpoint
    });
    return sqlClient;
}

export function ensureSchema(sql: Sql): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await sql`
                CREATE TABLE IF NOT EXISTS chat_events (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    env TEXT NOT NULL DEFAULT 'development',
                    session_id TEXT,
                    turn_index INT,
                    is_follow_up BOOLEAN,
                    agent_id TEXT,
                    agent_label TEXT,
                    source_mode TEXT,
                    route_type TEXT,
                    needs_clarification BOOLEAN,
                    status TEXT NOT NULL DEFAULT 'ok',
                    latency_ms INT,
                    gemini_calls INT,
                    web_search_calls INT,
                    input_tokens INT,
                    output_tokens INT,
                    question_chars INT,
                    question_masked TEXT
                )`;
            await sql`CREATE INDEX IF NOT EXISTS chat_events_env_created_idx ON chat_events (env, created_at)`;
        })().catch((err) => {
            schemaReady = null; // retry on the next request
            throw err;
        });
    }
    return schemaReady;
}

/** Deployment environment tag, so local and preview traffic never pollutes production stats. */
export function currentEnv(): string {
    return process.env.VERCEL_ENV || "development";
}
