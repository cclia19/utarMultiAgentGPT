# Abuse protection

Added after the 17 Oct 2026 incident (see "UTARCHAT Abuse Prevention Guideline"). The rule: **reject abuse before it reaches Gemini.** All checks run server-side in `app/api/chat/route.ts`, cheapest first. The first check that fails returns a short, polite reply, logs the request as `blocked:<reason>` and makes no Gemini call.

| Order | Check | Code | Refusal reason |
|---|---|---|---|
| 0 | Maintenance mode (`CHAT_MAINTENANCE=on`) | route | `maintenance` |
| 2 | Body over 16 KB (checked before parsing) | route | `body_too_large` |
| 2 | Empty message or over 1,000 characters | `lib/abuse/checks.ts` | `empty`, `too_long` |
| 2 | History trimmed to the last 6 messages / 6,000 characters; helper fields capped | `lib/abuse/checks.ts` | (trimmed, not refused) |
| 3 | Jailbreak phrases (`lib/abuse/jailbreakPhrases.ts`) | `checks.ts` | `jailbreak` |
| 3 | Repetitive text (under 30% unique words) or a long run of one character | `checks.ts` | `junk` |
| 3 | Same as this browser's last answered message (within 10 min) | `lib/abuse/guard.ts` | `repeat` |
| 4 | Manual block (`blocked_clients` table) | `guard.ts` | `blocked_client` |
| 4 | Rate limits: browser ID 5/min, 40/day; IP hash 20/min, 300/day | `guard.ts` | `rate_minute`, `rate_day` |
| 5 | Daily budget breaker: estimated spend today (MYT) ≥ RM10. One alert at 80%, one at 100% | `guard.ts` | `budget` |
| 6 | Every Gemini call in a chat request: ≤1,024 answer tokens + ≤1,024 thinking tokens, 25 s timeout. Off-topic messages get a fixed reply | `lib/abuse/callLimits.ts`, route | |

**Fail closed:** if Neon cannot be reached (or `DATABASE_URL` is missing), the chat refuses with `limit_store`.

## Settings (Vercel env vars)

All optional; the defaults are the guideline's starting values.

| Variable | Default | |
|---|---|---|
| `CHAT_MAINTENANCE` | off | `on` = every request gets the maintenance reply (redeploy after changing) |
| `MAX_BODY_BYTES` | 16384 | |
| `MAX_MESSAGE_CHARS` | 1000 | also hard-coded as `MAX_MESSAGE_CHARS` in `components/ChatClient.tsx` (input box) |
| `MAX_HISTORY_TURNS` / `MAX_HISTORY_CHARS` | 6 / 6000 | the chat page trims to the same limits |
| `MIN_UNIQUE_WORD_RATIO` / `UNIQUE_WORD_MIN_WORDS` | 0.3 / 12 | |
| `REPEAT_WINDOW_SEC` | 600 | |
| `RATE_CLIENT_PER_MIN` / `RATE_CLIENT_PER_DAY` | 5 / 40 | per browser ID |
| `RATE_IP_PER_MIN` / `RATE_IP_PER_DAY` | 20 / 300 | per IP hash; loose on purpose (campus Wi-Fi) |
| `DAILY_BUDGET_RM` / `BUDGET_ALERT_FRACTION` | 10 / 0.8 | `0` turns the breaker off |
| `GEMINI_INPUT_RM_PER_MTOK` / `GEMINI_OUTPUT_RM_PER_MTOK` | 1.41 / 11.75 | Gemini 2.5 Flash list price at RM4.70/USD |
| `GEMINI_WEB_SEARCH_RM_EACH` | 0 | set if the bill shows paid search grounding |
| `UNFINISHED_REQUEST_RM` | 0.03 | cost assumed for a request that never logged its tokens |
| `GEMINI_MAX_OUTPUT_TOKENS` / `GEMINI_MAX_THINKING_TOKENS` | 1024 / 1024 | |
| `GEMINI_MAX_JSON_OUTPUT_TOKENS` | 8192 | JSON extraction of staff directory pages |
| `GEMINI_CALL_TIMEOUT_MS` | 25000 | |
| `ABUSE_IP_SALT` | derived from the Gemini key | salt for the IP hash |
| `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_ESCALATE_TO`, `ALERT_EMAIL_FROM` | | alert emails via Resend (`ESCALATE_TO` = ITISC, breaker only) |
| `ALERT_WEBHOOK_URL` | | alerts also POSTed here as JSON |

Without `RESEND_API_KEY` or `ALERT_WEBHOOK_URL`, alerts only appear in the Vercel logs (`[abuse-alert]`).

## Neon tables

Created automatically on first use:

- `rate_limit_counters` (key, window, count), with rows deleted after 2 days;
- `client_last_message` (repeat check), with rows deleted after 1 day;
- `blocked_clients` (manual blocks);
- `abuse_alerts` (one row per alert sent per day).

`chat_events` gains `ip_hash` (blanked after 7 days), `block_reason` and `finished_at`. Its `status` is now one of:

- `started`: still running, or killed by the platform if it is old;
- `answered`, `failed` or `timeout`;
- `blocked:<reason>`.

Block a browser or an IP hash (find them on the dashboard or in `chat_events`):

```sql
INSERT INTO blocked_clients (client_id, reason) VALUES ('<browser id>', 'flood 17 Oct');
INSERT INTO blocked_clients (ip_hash, reason, expires_at) VALUES ('<ip hash>', 'flood', now() + interval '7 days');
```

## Testing

- `pnpm test` runs the unit tests for every layer (`lib/abuse/abuse.test.ts`).
- `node scripts/flood-test.mjs` runs against a local `pnpm dev`. It sends 50 long and 50 repeated messages and asserts zero Gemini calls and 99 refusals. The first copy of the repeated message is answered from bus data, at no cost. With `DATABASE_URL` set it also checks the rows in `chat_events`.
- Local runs without Neon: start the dev server with `ABUSE_STORE=memory` (ignored in production builds); otherwise every request is refused (fail closed).
