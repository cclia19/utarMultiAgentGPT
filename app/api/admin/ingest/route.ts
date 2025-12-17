import { NextRequest, NextResponse } from "next/server";
import { ai, STORE_DISPLAY_NAME } from "@/lib/gemini";
import AdmZip from "adm-zip";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import fs from "fs";
import os from "os";

export async function POST(req: NextRequest) {
    // 1. Auth Check
    const authHeader = req.headers.get("x-admin-secret");
    if (authHeader !== process.env.ADMIN_SECRET) {
        return NextResponse.json(
            { error: "Unauthorized access" },
            { status: 401 }
        );
    }

    const tempDir = path.join(os.tmpdir(), `utar-ingest-${Date.now()}`);

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json(
                { error: "No file detected" },
                { status: 400 }
            );
        }

        // 2. Prepare Temp Environment
        await mkdir(tempDir, { recursive: true });
        const buffer = Buffer.from(await file.arrayBuffer());
        const originalFilePath = path.join(tempDir, file.name);
        await writeFile(originalFilePath, buffer);

        // 3. File Processing Strategy
        let filesToProcess: string[] = [];

        if (file.name.toLowerCase().endsWith(".zip")) {
            console.log("Mode: ZIP Extraction");
            const zip = new AdmZip(originalFilePath);
            zip.extractAllTo(tempDir, true); // overwrite = true

            // Recursive crawler to find supported files
            const walkSync = (dir: string, filelist: string[] = []) => {
                const files = fs.readdirSync(dir);
                files.forEach((file) => {
                    const filepath = path.join(dir, file);
                    const stat = fs.statSync(filepath);
                    if (stat.isDirectory()) {
                        filelist = walkSync(filepath, filelist);
                    } else {
                        // Filter junk files and unsupported types
                        if (
                            !file.startsWith(".") &&
                            !file.startsWith("__MACOSX")
                        ) {
                            const ext = path.extname(file).toLowerCase();
                            if (
                                [
                                    ".pdf",
                                    ".txt",
                                    ".md",
                                    ".html",
                                    ".docx",
                                ].includes(ext)
                            ) {
                                filelist.push(filepath);
                            }
                        }
                    }
                });
                return filelist;
            };

            filesToProcess = walkSync(tempDir);
        } else {
            console.log("Mode: Single File");
            filesToProcess.push(originalFilePath);
        }

        if (filesToProcess.length === 0) {
            throw new Error("No valid documents found (PDF, TXT, MD, DOCX)");
        }

        // 4. Gemini Store Management
        // Efficiently find or create store
        const stores = await ai.fileSearchStores.list();
        let targetStoreId = "";

        for await (const store of stores) {
            if (store.displayName === STORE_DISPLAY_NAME) {
                targetStoreId = store.name as string;
                break;
            }
        }

        if (!targetStoreId) {
            const newStore = await ai.fileSearchStores.create({
                config: { displayName: STORE_DISPLAY_NAME },
            });
            targetStoreId = newStore.name as string;
        }

        // 5. Batch Upload & Import
        // We limit concurrency to avoid rate limits
        const BATCH_SIZE = 3;
        let processedCount = 0;

        for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
            const batch = filesToProcess.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async (filePath) => {
                    // A. Upload to Files API
                    const uploadResult = await ai.files.upload({
                        file: filePath,
                        config: { displayName: path.basename(filePath) },
                    });

                    // B. Import to Search Store
                    let operation = await ai.fileSearchStores.importFile({
                        fileSearchStoreName: targetStoreId,
                        fileName: uploadResult.name as string,
                    });

                    // C. Poll for completion
                    while (!operation.done) {
                        await new Promise((r) => setTimeout(r, 1000));
                        operation = await ai.operations.get({ operation });
                    }
                })
            );

            processedCount += batch.length;
        }

        return NextResponse.json({
            success: true,
            count: processedCount,
            storeId: targetStoreId,
        });
    } catch (error: any) {
        console.error("Ingest Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    } finally {
        // 6. Cleanup (Critical for server health)
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error("Cleanup failed:", e);
        }
    }
}
