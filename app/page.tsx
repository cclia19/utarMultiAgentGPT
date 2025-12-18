"use client";

import { useState, useEffect, Suspense } from "react";
import {
    UploadCloud,
    Check,
    X,
    Loader2,
    File as FileIcon,
    FolderArchive,
    Lock,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";

function AdminUploadContent() {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<
        "idle" | "uploading" | "success" | "error" | "unzipping"
    >("idle");
    const [log, setLog] = useState<string>("");
    const [secret, setSecret] = useState("");
    const [progress, setProgress] = useState("");

    const searchParams = useSearchParams();

    useEffect(() => {
        const s = searchParams.get("secret");
        if (s) setSecret(s);
    }, [searchParams]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus("idle");
            setLog("");
            setProgress("");
        }
    };

    const uploadSingleFile = async (fileToUpload: Blob, fileName: string) => {
        // Phase 1: Get Upload URL
        const initRes = await fetch("/api/admin/ingest", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-secret": secret,
            },
            body: JSON.stringify({
                phase: "init",
                filename: fileName,
                mimeType: fileToUpload.type || "application/pdf",
                size: fileToUpload.size,
            }),
        });

        if (!initRes.ok) {
            const errData = await initRes.json();
            throw new Error(errData.error || "Failed to initialize upload");
        }
        const { uploadUrl } = await initRes.json();

        // Phase 2: Upload Direct to Google (Bypass Vercel Limit)
        const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                "Content-Length": fileToUpload.size.toString(),
                "X-Goog-Upload-Command": "upload, finalize",
                "X-Goog-Upload-Offset": "0", // <--- THIS LINE IS REQUIRED
            },
            body: fileToUpload,
        });

        if (!uploadRes.ok) throw new Error("Google upload failed");
        const googleData = await uploadRes.json();
        const fileUri = googleData.file.uri;

        // Phase 3: Link to Knowledge Base
        const linkRes = await fetch("/api/admin/ingest", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-admin-secret": secret,
            },
            body: JSON.stringify({
                phase: "link",
                fileUri: fileUri,
                mimeType: fileToUpload.type,
            }),
        });

        if (!linkRes.ok) throw new Error("Failed to index file");
    };

    const handleUpload = async () => {
        if (!file || !secret) return;
        setStatus("uploading");
        setLog("Starting process...");

        try {
            let totalCount = 0;

            // 1. Handle ZIP Files Client-Side (Bypass 4.5MB Vercel Limit)
            if (file.name.toLowerCase().endsWith(".zip")) {
                setStatus("unzipping");
                setLog("Unzipping file in browser...");

                const zip = new JSZip();
                const zipContent = await zip.loadAsync(file);

                const filesToProcess: { name: string; blob: Blob }[] = [];

                // Extract valid files
                zipContent.forEach((relativePath, zipEntry) => {
                    const isJunk =
                        zipEntry.name.startsWith("__MACOSX") ||
                        zipEntry.name.startsWith(".");
                    const isSupported = /\.(pdf|txt|md|docx|html)$/i.test(
                        zipEntry.name
                    );

                    if (!zipEntry.dir && !isJunk && isSupported) {
                        filesToProcess.push({
                            name:
                                zipEntry.name.split("/").pop() || zipEntry.name, // Simple filename
                            blob: null as any, // Will load async below
                        });
                    }
                });

                if (filesToProcess.length === 0)
                    throw new Error("No supported files found in ZIP");

                setLog(`Found ${filesToProcess.length} files. Uploading...`);
                setStatus("uploading");

                // Upload sequentially to avoid Rate Limits & Race Conditions
                for (let i = 0; i < filesToProcess.length; i++) {
                    const entryName =
                        zipContent.files[
                            Object.keys(zipContent.files).find((k) =>
                                k.endsWith(filesToProcess[i].name)
                            ) || ""
                        ];
                    const blob = await entryName.async("blob");

                    setProgress(`${i + 1} / ${filesToProcess.length}`);
                    setLog(`Uploading: ${filesToProcess[i].name}`);

                    await uploadSingleFile(blob, filesToProcess[i].name);
                    totalCount++;
                }
            } else {
                // 2. Handle Single File (Non-ZIP)
                // Direct upload allows large files, so we remove the limit check
                await uploadSingleFile(file, file.name);
                totalCount = 1;
            }

            setStatus("success");
            setLog(`${totalCount} documents indexed successfully.`);
            setProgress("");
        } catch (error: any) {
            console.error(error);
            setStatus("error");
            setLog(error.message || "An unexpected error occurred");
            setProgress("");
        }
    };

    if (!secret) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#FDFDFD]">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto border border-zinc-100">
                        <Lock size={20} className="text-zinc-400" />
                    </div>
                    <input
                        type="password"
                        placeholder="Enter access key"
                        className="text-center border-b border-zinc-200 focus:border-zinc-900 outline-none py-2 bg-transparent placeholder:text-zinc-300 transition-colors"
                        onChange={(e) => setSecret(e.target.value)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
                        Data Ingestion
                    </h1>
                    <p className="text-zinc-500 text-sm mt-2">
                        Upload university documents to the vector store.
                    </p>
                </div>

                <div className="bg-white rounded-3xl border border-zinc-100 shadow-xl shadow-zinc-100/50 p-2">
                    <div className="relative group border border-dashed border-zinc-200 rounded-2xl p-12 transition-all hover:bg-zinc-50 hover:border-zinc-300">
                        <input
                            type="file"
                            accept=".pdf,.txt,.md,.zip"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />

                        <div className="flex flex-col items-center justify-center text-center space-y-4 pointer-events-none">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-zinc-100 flex items-center justify-center">
                                {file ? (
                                    file.name.endsWith(".zip") ? (
                                        <FolderArchive
                                            size={20}
                                            className="text-zinc-700"
                                        />
                                    ) : (
                                        <FileIcon
                                            size={20}
                                            className="text-zinc-700"
                                        />
                                    )
                                ) : (
                                    <UploadCloud
                                        size={20}
                                        className="text-zinc-300 group-hover:text-zinc-500 transition-colors"
                                    />
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-900">
                                    {file
                                        ? file.name
                                        : "Drag and drop or click"}
                                </p>
                                <p className="text-xs text-zinc-400 mt-1">
                                    {file
                                        ? `${(file.size / 1024 / 1024).toFixed(
                                              2
                                          )} MB`
                                        : "PDF, TXT, or ZIP archives"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col items-center gap-4">
                    <button
                        onClick={handleUpload}
                        disabled={
                            !file ||
                            status === "uploading" ||
                            status === "unzipping"
                        }
                        className="w-full py-4 bg-zinc-900 hover:bg-black text-white rounded-2xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {status === "uploading" || status === "unzipping" ? (
                            <>
                                {status === "unzipping"
                                    ? "Unzipping..."
                                    : `Processing ${progress}`}
                                <Loader2
                                    size={14}
                                    className="animate-spin opacity-50"
                                />
                            </>
                        ) : (
                            "Begin Indexing"
                        )}
                    </button>

                    {(status === "success" || status === "uploading") && (
                        <div className="flex items-center gap-2 text-zinc-600 text-xs font-medium bg-zinc-50 px-3 py-1.5 rounded-full">
                            {status === "success" ? (
                                <Check size={12} className="text-emerald-500" />
                            ) : (
                                <Loader2 size={12} className="animate-spin" />
                            )}
                            {log}
                        </div>
                    )}

                    {status === "error" && (
                        <div className="flex items-center gap-2 text-rose-600 text-xs font-medium bg-rose-50 px-3 py-1.5 rounded-full">
                            <X size={12} /> {log}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminUploadPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
                    <Loader2 className="animate-spin text-zinc-300" />
                </div>
            }
        >
            <AdminUploadContent />
        </Suspense>
    );
}
