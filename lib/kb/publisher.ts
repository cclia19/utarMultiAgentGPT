import type { GoogleGenAI } from "@google/genai";
import type { KbPublisher } from "./types.ts";

/**
 * Writes knowledge-base documents to Gemini File Search stores.
 * Metadata lets anyone looking at a store tell these documents apart from
 * ones the old intranet uploader added (which carry no kb_key).
 */
export class GeminiPublisher implements KbPublisher {
    private ai: GoogleGenAI;
    private pollMs: number;
    private timeoutMs: number;
    constructor(ai: GoogleGenAI, pollMs = 2000, timeoutMs = 180_000) {
        this.ai = ai;
        this.pollMs = pollMs;
        this.timeoutMs = timeoutMs;
    }

    async upload(params: { storeName: string; displayName: string; text: string; mimeType: string; metadata: Record<string, string | number> }) {
        let op: any = await this.ai.fileSearchStores.uploadToFileSearchStore({
            fileSearchStoreName: params.storeName,
            file: new Blob([params.text], { type: params.mimeType }),
            config: {
                mimeType: params.mimeType,
                displayName: params.displayName,
                customMetadata: Object.entries(params.metadata).map(([key, value]) =>
                    typeof value === "number" ? { key, numericValue: value } : { key, stringValue: value }
                ),
            },
        });
        const deadline = Date.now() + this.timeoutMs;
        // Upload operations usually come back finished, with the document
        // name; polling them by name is not supported (it fails with "fetch failed").
        while (!op.done && !op.response?.documentName && !op.error) {
            if (Date.now() > deadline) throw new Error(`indexing did not finish in ${this.timeoutMs / 1000} s`);
            await new Promise((r) => setTimeout(r, this.pollMs));
            op = await this.ai.operations.get({ operation: op });
        }
        if (op.error) throw new Error(op.error.message || JSON.stringify(op.error));
        const name = op.response?.documentName;
        if (!name) throw new Error("upload finished without a document name");
        return name as string;
    }

    async remove(documentName: string) {
        await this.ai.fileSearchStores.documents.delete({ name: documentName, config: { force: true } });
    }
}

/** Records what would be uploaded, touches nothing. */
export class RecordingPublisher implements KbPublisher {
    uploads: { storeName: string; displayName: string; chars: number; metadata: Record<string, string | number> }[] = [];
    removed: string[] = [];
    private n = 0;
    async upload(params: { storeName: string; displayName: string; text: string; mimeType: string; metadata: Record<string, string | number> }) {
        this.uploads.push({ storeName: params.storeName, displayName: params.displayName, chars: params.text.length, metadata: params.metadata });
        return `${params.storeName}/documents/test-${++this.n}`;
    }
    async remove(documentName: string) {
        this.removed.push(documentName);
    }
}
