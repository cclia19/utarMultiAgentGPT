import { createHash } from "node:crypto";
import type { AbuseLimits } from "./config.ts";
import {
    checkJunk,
    checkMessageSize,
    estimateCostRm,
    malaysiaDay,
    messageFingerprint,
    minuteWindow,
    sanitizeBody,
    type BlockReason,
} from "./checks.ts";
import type { AbuseStore } from "./store.ts";

/**
 * Runs the abuse layers in order and stops at the first that fails, before
 * any Gemini call:
 *   size limits -> junk filter (incl. repeat of the last message) -> manual
 *   blocks and rate limits (Neon) -> daily budget breaker.
 * Maintenance mode and the raw body-size limit run earlier, in the route,
 * because they apply before the body is parsed.
 *
 * Fail closed: if the limit store is missing or errors, the request is refused.
 */

export type GuardAlert = { kind: string; subject: string; text: string; escalate: boolean };

export type GuardResult =
    | {
          ok: true;
          body: any;
          clientKey: string;
          fingerprint: string;
          spendRm: number;
          alerts: GuardAlert[];
      }
    | {
          ok: false;
          reason: BlockReason;
          detail?: string;
          clientKey: string;
          alerts: GuardAlert[];
      };

const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** The browser ID the chat page sends; without one, the client is its IP. */
export function clientKeyFor(body: any, ipHash: string): string {
    const id = String(body?.sessionId || "");
    return SESSION_ID_RE.test(id) ? id : `ip:${ipHash}`;
}

/** First address in x-forwarded-for (set by Vercel), else x-real-ip. */
export function clientIp(headers: { get(name: string): string | null }): string {
    const forwarded = headers.get("x-forwarded-for") || "";
    const first = forwarded.split(",")[0]?.trim();
    return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Salted SHA-256 of the IP; the raw IP is never stored. */
export function hashIp(ip: string): string {
    const salt = process.env.ABUSE_IP_SALT || createHash("sha256").update(`utarchat-ip|${process.env.GEMINI_API_KEY || ""}`).digest("hex");
    return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

let budgetCache: { day: string; at: number; costRm: number } | null = null;
const BUDGET_CACHE_MS = 15_000;

export function resetBudgetCache() {
    budgetCache = null;
}

async function todaysSpendRm(store: AbuseStore, limits: AbuseLimits, day: string, now: number): Promise<number> {
    if (budgetCache && budgetCache.day === day && now - budgetCache.at < BUDGET_CACHE_MS) return budgetCache.costRm;
    const usage = await store.spendToday(day);
    const costRm = estimateCostRm(usage, limits);
    budgetCache = { day, at: now, costRm };
    return costRm;
}

export async function runGuards(params: {
    body: any;
    ipHash: string;
    store: AbuseStore | null;
    limits: AbuseLimits;
    now?: Date;
}): Promise<GuardResult> {
    const { ipHash, store, limits } = params;
    const now = params.now ?? new Date();
    const body = sanitizeBody(params.body, limits);
    const clientKey = clientKeyFor(body, ipHash);
    const alerts: GuardAlert[] = [];
    const refuse = (reason: BlockReason, detail?: string): GuardResult => ({ ok: false, reason, detail, clientKey, alerts });

    // Layer 2: size.
    const sizeReason = checkMessageSize(body.message, limits);
    if (sizeReason) return refuse(sizeReason, `${body.message.length} chars`);

    // Layer 3: junk (no I/O).
    const junk = checkJunk(body.message, limits);
    if (junk) return refuse(junk.reason, junk.detail);

    // Everything below needs the limit store. Fail closed.
    if (!store) return refuse("limit_store", "no store configured");
    const fingerprint = messageFingerprint(body.message);
    const day = malaysiaDay(now);

    try {
        const { blocked, lastFingerprint } = await store.lookup({ clientKey, ipHash, repeatWindowSec: limits.repeatWindowSec });
        if (blocked) return refuse("blocked_client");
        // Layer 3 (cont.): the same message as this client's last answered one.
        if (lastFingerprint && lastFingerprint === fingerprint) return refuse("repeat");

        // Layer 4: rate limits, per browser ID and per IP (hash).
        const minute = minuteWindow(now);
        const [clientMin, clientDay, ipMin, ipDay] = await store.hit([
            { key: `c:${clientKey}`, window: minute },
            { key: `c:${clientKey}`, window: day },
            { key: `i:${ipHash}`, window: minute },
            { key: `i:${ipHash}`, window: day },
        ]);
        if (clientDay > limits.clientPerDay) return refuse("rate_day", `browser ${clientDay}/${limits.clientPerDay} today`);
        if (ipDay > limits.ipPerDay) return refuse("rate_day", `ip ${ipDay}/${limits.ipPerDay} today`);
        if (clientMin > limits.clientPerMinute) return refuse("rate_minute", `browser ${clientMin}/${limits.clientPerMinute} per min`);
        if (ipMin > limits.ipPerMinute) return refuse("rate_minute", `ip ${ipMin}/${limits.ipPerMinute} per min`);

        // Layer 5: daily budget breaker (estimated from logged tokens, all environments: one shared key).
        const spendRm = await todaysSpendRm(store, limits, day, now.getTime());
        const budget = limits.dailyBudgetRm;
        if (budget > 0 && spendRm >= budget) {
            if (await store.claimAlert(day, "budget_100")) {
                alerts.push({
                    kind: "budget_100",
                    escalate: true,
                    subject: `UTARCHAT paused for today: daily Gemini budget reached (RM${spendRm.toFixed(2)} of RM${budget})`,
                    text: `Estimated Gemini spend today (${day}, MYT) is RM${spendRm.toFixed(2)}, at or above the daily budget of RM${budget}.\nThe chatbot now answers "busy, back tomorrow" until midnight MYT.\nCheck the usage dashboard for the source, and see the incident runbook in the abuse prevention guideline.`,
                });
            }
            return refuse("budget", `RM${spendRm.toFixed(2)} of RM${budget}`);
        }
        if (budget > 0 && spendRm >= budget * limits.alertAtFraction && (await store.claimAlert(day, "budget_80"))) {
            alerts.push({
                kind: "budget_80",
                escalate: false,
                subject: `UTARCHAT at ${Math.round((spendRm / budget) * 100)}% of today's Gemini budget`,
                text: `Estimated Gemini spend today (${day}, MYT) is RM${spendRm.toFixed(2)} of the RM${budget} daily budget.\nAt 100% the chatbot pauses until midnight MYT. Normal use is about RM4 a day, so check the dashboard for unusual traffic.`,
            });
        }
        return { ok: true, body, clientKey, fingerprint, spendRm, alerts };
    } catch (err: any) {
        console.error("[abuse] limit store failed, refusing request:", err?.message || err);
        return refuse("limit_store", String(err?.message || err).slice(0, 200));
    }
}
