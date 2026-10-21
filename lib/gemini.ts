import { GoogleGenAI } from "@google/genai";
import {
  recordGeminiCall,
  recordGeminiError,
  recordUsage,
  throwIfProviderUnavailable,
} from "./analytics/metrics.ts";
import { withChatCallLimits } from "./abuse/callLimits.ts";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY in environment variables");
}

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Count Gemini calls and tokens per chat request (see lib/analytics/metrics.ts).
const originalGenerateContent = ai.models.generateContent.bind(ai.models);
const originalGenerateContentStream = ai.models.generateContentStream.bind(ai.models);

// After a no-credit / quota / key error, the rest of the request fails at once
// instead of making more calls that cannot succeed.
ai.models.generateContent = (async (rawParams: any) => {
  throwIfProviderUnavailable();
  const params = withChatCallLimits(rawParams);
  const m = recordGeminiCall(params);
  try {
    const response = await originalGenerateContent(params);
    recordUsage(m, (response as any)?.usageMetadata);
    return response;
  } catch (error) {
    recordGeminiError(m, error);
    throw error;
  }
}) as typeof ai.models.generateContent;

ai.models.generateContentStream = (async (rawParams: any) => {
  throwIfProviderUnavailable();
  const params = withChatCallLimits(rawParams);
  const m = recordGeminiCall(params);
  let stream: AsyncGenerator<any>;
  try {
    stream = (await originalGenerateContentStream(params)) as any;
  } catch (error) {
    recordGeminiError(m, error);
    throw error;
  }
  return (async function* () {
    let lastUsage: any;
    try {
      for await (const chunk of stream) {
        if (chunk?.usageMetadata) lastUsage = chunk.usageMetadata;
        yield chunk;
      }
    } catch (error) {
      recordGeminiError(m, error);
      throw error;
    } finally {
      recordUsage(m, lastUsage);
    }
  })();
}) as typeof ai.models.generateContentStream;

export const MODEL_NAME = "gemini-2.5-flash"; 
export const STORE_DISPLAY_NAME = "UTAR Knowledge Base";
