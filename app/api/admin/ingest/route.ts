import { NextRequest, NextResponse } from "next/server";
import { ai, STORE_DISPLAY_NAME } from "@/lib/gemini";

export async function POST(req: NextRequest) {
    // 1. Auth Check
    const authHeader = req.headers.get("x-admin-secret");
    if (authHeader !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { phase } = body;

        // --- PHASE 1: Generate Upload URL (Server-Side) ---
        // We do this here so the Client doesn't need the API Key
        if (phase === "init") {
            const { filename, mimeType, size } = body;

            const reqUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`;

            const initRes = await fetch(reqUrl, {
                method: "POST",
                headers: {
                    "X-Goog-Upload-Protocol": "resumable",
                    "X-Goog-Upload-Command": "start",
                    "X-Goog-Upload-Header-Content-Length": size.toString(),
                    "X-Goog-Upload-Header-Content-Type": mimeType,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ file: { display_name: filename } }),
            });

            const uploadUrl = initRes.headers.get("x-goog-upload-url");

            if (!uploadUrl) {
                throw new Error("Failed to get upload URL from Google");
            }

            return NextResponse.json({ uploadUrl });
        }

        // --- PHASE 2: Link File to Store (After Upload) ---
        if (phase === "link") {
            const { fileUri, mimeType } = body;

            // 1. Find/Create Store
            const stores = await ai.fileSearchStores.list();
            let storeId = "";
            for await (const s of stores) {
                if (s.displayName === STORE_DISPLAY_NAME) {
                    storeId = s.name as string;
                    break;
                }
            }
            if (!storeId) {
                const newStore = await ai.fileSearchStores.create({
                    config: { displayName: STORE_DISPLAY_NAME },
                });
                storeId = newStore.name as string;
            }

            // 2. Add to Store
            // The fileUri looks like "https://generativelanguage.googleapis.com/v1beta/files/xxxx"
            // We need just the name "files/xxxx"
            const resourceName = fileUri.split("/v1beta/")[1];

            await ai.fileSearchStores.importFile({
                fileSearchStoreName: storeId,
                fileName: resourceName,
            });

            return NextResponse.json({ success: true, storeId });
        }

        return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    } catch (error: any) {
        console.error("Ingest Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
