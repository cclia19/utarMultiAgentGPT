import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const match = envText.match(/GEMINI_API_KEY=(.+)/);
const apiKey = match ? match[1].trim() : "";

const ai = new GoogleGenAI({ apiKey });
const storeName = "fileSearchStores/utar-dea-knowledge-base-vnkcqtpgrpql";
const question = "what is the policy for taking examination in special venue";

const sysInst = "You are UTARGPT. Answer using only the selected UTAR knowledge base in this File Search step. If not found say NO_KB_ANSWER";

async function testVariant(label, toolObj) {
    try {
        console.log(`\nTesting variant [${label}]:`);
        const res = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: question,
            config: {
                systemInstruction: sysInst,
                tools: [toolObj],
                temperature: 0.1,
            }
        });
        console.log("Result:", res.text);
    } catch (e) {
        console.log("Error:", e.message);
    }
}

async function main() {
    await testVariant("fileSearch with file_search_store_names", { fileSearch: { file_search_store_names: [storeName] } });
}

main();
