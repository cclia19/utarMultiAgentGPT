import { metricsStore } from "../analytics/metrics.ts";
import { geminiCallLimits } from "./config.ts";

/**
 * Abuse protection: inside a chat request every call gets an answer-length cap,
 * a bounded thinking budget and an HTTP timeout (GEMINI_MAX_OUTPUT_TOKENS,
 * GEMINI_MAX_THINKING_TOKENS, GEMINI_CALL_TIMEOUT_MS). On Gemini 2.5 thinking
 * tokens count towards maxOutputTokens, so the cap is answer + thinking.
 * JSON-mode extraction calls (staff directory pages) get a larger cap, since
 * their size is set by the page rather than by the user's message.
 * Calls outside a chat request (KB sync, scripts) are left as they are.
 */
export function withChatCallLimits(params: any, inChatRequest = Boolean(metricsStore.getStore()), limits = geminiCallLimits()): any {
  if (!inChatRequest) return params;
  const config = { ...(params?.config || {}) };

  const thinking = config.thinkingConfig;
  let thinkingBudget = 0;
  if (thinking?.thinkingBudget !== 0) {
    const asked = thinking?.thinkingBudget;
    thinkingBudget =
      typeof asked === "number" && asked >= 0 && asked <= limits.maxThinkingTokens ? asked : limits.maxThinkingTokens;
    config.thinkingConfig = { ...(thinking || {}), thinkingBudget };
  }

  const answerCap = config.responseMimeType === "application/json" ? limits.maxJsonOutputTokens : limits.maxOutputTokens;
  const cap = answerCap + thinkingBudget;
  config.maxOutputTokens = Math.min(Number(config.maxOutputTokens) || cap, cap);

  const timeout = Number(config.httpOptions?.timeout) || limits.timeoutMs;
  config.httpOptions = { ...(config.httpOptions || {}), timeout: Math.min(timeout, limits.timeoutMs) };

  return { ...params, config };
}
