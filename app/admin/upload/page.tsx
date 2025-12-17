"use client";

import { useState, useEffect } from "react";
import { UploadCloud, Check, X, Loader2, File, FolderArchive, Lock } from "lucide-react";
import { useSearchParams } from 'next/navigation';
import clsx from "clsx";

export default function AdminUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [log, setLog] = useState<string>("");
  const [secret, setSecret] = useState("");

  const searchParams = useSearchParams();

  useEffect(() => {
    const s = searchParams.get('secret');
    if (s) setSecret(s);
  }, [searchParams]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus("idle");
      setLog("");
    }
  };

  const handleUpload = async () => {
    if (!file || !secret) return;
    setStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "x-admin-secret": secret },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setStatus("success");
      setLog(`${data.count} files indexed successfully.`);
    } catch (error: any) {
      setStatus("error");
      setLog(error.message);
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
        {/* Header */}
        <div className="mb-8">
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">Data Ingestion</h1>
            <p className="text-zinc-500 text-sm mt-2">Upload university documents to the vector store.</p>
        </div>

        {/* Upload Card */}
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
                       file.name.endsWith('.zip') ? <FolderArchive size={20} className="text-zinc-700"/> : <File size={20} className="text-zinc-700"/>
                    ) : (
                        <UploadCloud size={20} className="text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                    )}
                </div>
                <div>
                    <p className="text-sm font-medium text-zinc-900">
                        {file ? file.name : "Drag and drop or click"}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                        {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, TXT, or ZIP archives"}
                    </p>
                </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex flex-col items-center gap-4">
            <button
                onClick={handleUpload}
                disabled={!file || status === "uploading"}
                className="w-full py-4 bg-zinc-900 hover:bg-black text-white rounded-2xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {status === "uploading" ? (
                    <>Processing <Loader2 size={14} className="animate-spin opacity-50" /></>
                ) : (
                    "Begin Indexing"
                )}
            </button>

            {/* Status Messages */}
            {status === "success" && (
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium bg-emerald-50 px-3 py-1.5 rounded-full">
                    <Check size={12} /> {log}
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