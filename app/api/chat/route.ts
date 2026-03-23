import { NextRequest, NextResponse } from "next/server";
import { ai, MODEL_NAME, STORE_DISPLAY_NAME } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    try {
        const { message, history } = await req.json();

        // 1. Find the Store
        const stores = await ai.fileSearchStores.list();
        let storeName = "";
        for await (const s of stores) {
            if (s.displayName === STORE_DISPLAY_NAME) {
                storeName = s.name as string;
                break;
            }
        }

        if (!storeName) {
            return NextResponse.json({
                text: "System: The University knowledge base hasn't been initialized yet. Please contact admin.",
                citations: [],
            });
        }

        // 2. Prepare System Instruction
        const systemInstruction = `
      You are the official AI Assistant for UTAR (Universiti Tunku Abdul Rahman).

      BEHAVIOR:
      - Answer questions strictly based on the provided context files.
      - If the answer is not in the files, say "I couldn't find that information in the university documents."
      - Be polite, professional, and concise.

      FORMATTING REQUIRED:
      - **Emails**: When mentioning a staff member's email or a department email, ALWAYS format it as a markdown link with a subject line.
        Example: [registrar@utar.edu.my](mailto:registrar@utar.edu.my?subject=Student%20Inquiry)
      - **Links**: ONLY include a URL as a clickable link if that exact URL appears verbatim in the retrieved document context.
        Do NOT generate, infer, guess, or construct any URL that is not literally present in the source documents.
        Do NOT include URLs you are uncertain about. If in doubt, omit the link entirely and just mention the resource by name.
    `;

        // 3. Generate Content
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                ...history,
                { role: "user", parts: [{ text: message }] },
            ],
            config: {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: [storeName],
                        },
                    },
                ],
            },
        });

        // 4. Extract Text and Citations
        // response.text may be null/empty when Gemini uses the fileSearch tool and
        // returns the answer inside candidates[0].content.parts instead.
        let responseText = response.text ?? "";
        if (!responseText && response.candidates && response.candidates[0]?.content?.parts) {
            responseText = response.candidates[0].content.parts
                .filter((p: any) => typeof p.text === "string")
                .map((p: any) => p.text as string)
                .join("");
        }
        if (!responseText) responseText = "No response generated.";

        console.dir(
            {
                text: response.text,
                promptFeedback: (response as any).promptFeedback,
                functionCalls: (response as any).functionCalls,
                usage: (response as any).usageMetadata,
            },
            { depth: null }
        );

        // Parse grounding metadata for citations
        const candidates = response.candidates;
        let citations: string[] = [];

        if (candidates && candidates[0].groundingMetadata?.groundingChunks) {
            citations = candidates[0].groundingMetadata.groundingChunks
                .map(
                    (chunk: any) =>
                        chunk.retrievedContext?.title || "Unknown Document"
                )
                .filter(
                    (val: string, index: number, self: string[]) =>
                        self.indexOf(val) === index
                ); // Unique
        }

        return NextResponse.json({
            text: responseText,
            citations,
        });
    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json(
            { error: "Failed to generate response." },
            { status: 500 }
        );
    }
}
