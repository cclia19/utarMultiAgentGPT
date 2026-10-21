/**
 * Alerts for the dev team (budget at 80%, breaker tripped). Sent by email
 * through Resend when RESEND_API_KEY and ALERT_EMAIL_TO are set, and/or POSTed
 * as JSON to ALERT_WEBHOOK_URL (Google Apps Script, Slack, etc.). With neither
 * set, the alert is only written to the server log.
 *
 * Never throws: an alert failing must not affect the chat.
 */
export async function sendAlert(subject: string, text: string, opts: { escalate?: boolean } = {}): Promise<void> {
    console.warn(`[abuse-alert] ${subject}\n${text}`);

    const tasks: Promise<unknown>[] = [];
    const resendKey = (process.env.RESEND_API_KEY || "").trim();
    const recipients = [process.env.ALERT_EMAIL_TO, opts.escalate ? process.env.ALERT_EMAIL_ESCALATE_TO : ""]
        .flatMap((v) => String(v || "").split(","))
        .map((v) => v.trim())
        .filter(Boolean);

    if (resendKey && recipients.length > 0) {
        tasks.push(
            fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    from: process.env.ALERT_EMAIL_FROM || "UTARCHAT alerts <onboarding@resend.dev>",
                    to: recipients,
                    subject,
                    text,
                }),
                signal: AbortSignal.timeout(8000),
            })
        );
    }

    const webhook = (process.env.ALERT_WEBHOOK_URL || "").trim();
    if (webhook) {
        tasks.push(
            fetch(webhook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: "utarchat", subject, text, escalate: Boolean(opts.escalate) }),
                signal: AbortSignal.timeout(8000),
            })
        );
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
        if (r.status === "rejected") console.warn("[abuse-alert] delivery failed:", (r.reason as any)?.message || r.reason);
    }
}
