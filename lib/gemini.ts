import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY in environment variables");
}

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const MODEL_NAME = "gemini-2.5-flash"; 
export const STORE_DISPLAY_NAME = "UTAR Knowledge Base";