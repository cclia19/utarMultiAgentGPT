import { test } from "node:test";
import assert from "node:assert/strict";

const { geminiErrorInfo, newMetrics, metricsStore, recordGeminiError, throwIfProviderUnavailable, GeminiUnavailableError } = await import("./metrics.ts");

// The exact shape production logged on 21 Oct 2026.
const PREPAY_402 = Object.assign(
    new Error('{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. ","status":"RESOURCE_EXHAUSTED"}}'),
    { name: "ApiError", status: 402 }
);

test("Gemini API errors give their status code and a short message", () => {
    const info = geminiErrorInfo(PREPAY_402);
    assert.equal(info?.status, 402);
    assert.match(info!.message, /^Your prepayment credits are depleted/);
    assert.ok(info!.message.length <= 160);

    const wrapped = new Error('{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Quota exceeded\\"}}","code":429,"status":"Too Many Requests"}}');
    assert.equal(geminiErrorInfo(wrapped)?.status, 429);
});

test("our own errors are not mistaken for Gemini errors", () => {
    assert.equal(geminiErrorInfo(new Error("context resolver timed out")), null);
    assert.equal(geminiErrorInfo(new SyntaxError("Unexpected token")), null);
    assert.equal(geminiErrorInfo(undefined), null);
});

test("after a no-credit / quota / key error, the rest of the request stops calling Gemini", async () => {
    const m = newMetrics();
    await metricsStore.run(m, async () => {
        throwIfProviderUnavailable(); // nothing yet
        recordGeminiError(m, PREPAY_402);
        assert.deepEqual(m.providerError && m.providerError.status, 402);
        assert.throws(() => throwIfProviderUnavailable(), (e: any) => e instanceof GeminiUnavailableError && e.status === 402);
    });
});

test("a passing outage (503) is recorded but does not stop the request", async () => {
    const m = newMetrics();
    await metricsStore.run(m, async () => {
        recordGeminiError(m, Object.assign(new Error('{"error":{"code":503,"message":"The model is overloaded."}}'), { status: 503 }));
        assert.equal(m.lastError?.status, 503);
        assert.equal(m.providerError, null);
        throwIfProviderUnavailable();
    });
});
