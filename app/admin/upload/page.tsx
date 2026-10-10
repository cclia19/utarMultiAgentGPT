"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Lock, LogOut, RefreshCw, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { convertUpload } from "@/lib/kb/convert";

/**
 * Knowledge-base admin: per-department documents with versions, staff
 * uploads (PDF / Word / Markdown / text / HTML), rollback and sync reports.
 * Uses the analytics dashboard login (DASHBOARD_PASSWORD).
 */

type Unit = { id: string; name: string; shortLabel: string; storeName: string; documents: number };
type Doc = { key: string; unitId: string; title: string; origin: "web" | "portal" | "manual"; sourceUrl?: string; liveVersion: number; updatedAt: string };
type Legacy = { name: string; displayName: string; createTime?: string; sizeBytes?: string };
type Version = { version: number; chars: number; title: string; author: string; note?: string; createdAt: string; geminiDocument?: string };
type RunItem = { key: string; title: string; unitId: string; outcome: string; detail?: string; version?: number };
type Run = { id: number; kind: string; startedAt: string; finishedAt?: string; items: RunItem[] };

const ORIGIN_LABEL: Record<Doc["origin"], string> = { web: "Web", portal: "Portal", manual: "Upload" };
const ORIGIN_STYLE: Record<Doc["origin"], string> = {
    web: "bg-blue-50 text-blue-700 border-blue-100",
    portal: "bg-violet-50 text-violet-700 border-violet-100",
    manual: "bg-emerald-50 text-emerald-700 border-emerald-100",
};
const OUTCOME_STYLE: Record<string, string> = {
    published: "text-emerald-700",
    unchanged: "text-zinc-500",
    held: "text-amber-700",
    failed: "text-red-700",
    note: "text-zinc-500",
    retired: "text-zinc-500",
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "–");
const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : n > 1000 ? `${Math.round(n / 1000)} kB` : `${n} B`);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { cache: "no-store", ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
    return data as T;
}

function Login({ onDone }: { onDone: () => void }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await api("/api/admin/analytics/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
            onDone();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                <Lock className="h-5 w-5" /> UTARCHAT knowledge base
            </div>
            <p className="text-sm text-zinc-500">Sign in with the dashboard password.</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2" placeholder="Password" autoFocus />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={busy || !password} className="w-full rounded-lg bg-zinc-900 py-2 text-white disabled:opacity-50">
                {busy ? "Signing in…" : "Sign in"}
            </button>
        </form>
    );
}

export default function KnowledgeBaseAdmin() {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [tab, setTab] = useState<"documents" | "runs">("documents");
    const [units, setUnits] = useState<Unit[]>([]);
    const [unitId, setUnitId] = useState("");
    const [docs, setDocs] = useState<Doc[]>([]);
    const [legacy, setLegacy] = useState<Legacy[]>([]);
    const [history, setHistory] = useState<{ doc: Doc; versions: Version[] } | null>(null);
    const [runs, setRuns] = useState<Run[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; preview?: string } | null>(null);
    const [author, setAuthor] = useState("");
    const [localMode, setLocalMode] = useState(false);

    // Upload form
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [note, setNote] = useState("");
    const [versionOf, setVersionOf] = useState<Doc | null>(null);
    // An older upload (previous uploader) being replaced by a new, versioned one.
    const [replacing, setReplacing] = useState<Legacy | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        try {
            setAuthor(localStorage.getItem("kb-admin-author") ?? "");
        } catch {
            // storage unavailable: the name is just not remembered
        }
    }, []);
    useEffect(() => {
        try {
            if (author) localStorage.setItem("kb-admin-author", author);
        } catch {
            // ignore
        }
    }, [author]);

    const handleError = useCallback((err: any) => {
        if (err?.status === 401) setAuthed(false);
        else setMessage({ kind: "error", text: err?.message || "Something went wrong" });
    }, []);

    const loadUnits = useCallback(async () => {
        try {
            const data = await api<{ units: Unit[]; localMode?: boolean }>("/api/admin/kb?view=units");
            setUnits(data.units);
            setLocalMode(Boolean(data.localMode));
            setAuthed(true);
        } catch (err: any) {
            if (err?.status === 401) setAuthed(false);
            else {
                setAuthed(true);
                handleError(err);
            }
        }
    }, [handleError]);

    const loadDocs = useCallback(
        async (id: string) => {
            if (!id) return;
            setLoading(true);
            try {
                const data = await api<{ documents: Doc[]; legacy: Legacy[] }>(`/api/admin/kb?view=documents&unit=${encodeURIComponent(id)}`);
                setDocs(data.documents);
                setLegacy(data.legacy);
            } catch (err) {
                handleError(err);
            } finally {
                setLoading(false);
            }
        },
        [handleError]
    );

    const loadRuns = useCallback(async () => {
        try {
            setRuns((await api<{ runs: Run[] }>("/api/admin/kb?view=runs")).runs);
        } catch (err) {
            handleError(err);
        }
    }, [handleError]);

    useEffect(() => {
        loadUnits();
    }, [loadUnits]);
    useEffect(() => {
        loadDocs(unitId);
        setHistory(null);
        setVersionOf(null);
        setReplacing(null);
    }, [unitId, loadDocs]);
    useEffect(() => {
        if (tab === "runs") loadRuns();
    }, [tab, loadRuns]);

    const unit = useMemo(() => units.find((u) => u.id === unitId), [units, unitId]);

    const openHistory = async (doc: Doc) => {
        try {
            const data = await api<{ versions: Version[] }>(`/api/admin/kb?view=versions&key=${encodeURIComponent(doc.key)}`);
            setHistory({ doc, versions: data.versions });
        } catch (err) {
            handleError(err);
        }
    };

    const doRollback = async (doc: Doc, version: number) => {
        if (!author.trim()) return setMessage({ kind: "error", text: "Enter your name first (it goes into the version history)." });
        if (!confirm(`Make v${version} of “${doc.title}” live again? It is published as a new version.`)) return;
        try {
            const { item } = await api<{ item: RunItem }>("/api/admin/kb/rollback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: doc.key, version, author }),
            });
            setMessage({ kind: item.outcome === "failed" ? "error" : "ok", text: `${doc.title}: ${item.outcome}${item.version ? ` (now v${item.version})` : ""}${item.detail ? ` – ${item.detail}` : ""}` });
            await loadDocs(unitId);
            await openHistory(doc);
        } catch (err) {
            handleError(err);
        }
    };

    const remove = async (target: { doc?: Doc; legacy?: Legacy }) => {
        if (!unit) return;
        if (!author.trim()) return setMessage({ kind: "error", text: "Enter your name first (it goes into the history)." });
        const name = target.doc?.title ?? target.legacy?.displayName ?? "this document";
        const question = target.doc
            ? `Remove “${name}” from the chatbot's knowledge?\n\nIts versions are kept: History → “Make live again” brings it back.`
            : `Remove the older upload “${name}”?\n\nIt came from the previous uploader, which kept no copy, so this cannot be undone. To swap it for a newer file, use “Replace with new version” instead.`;
        if (!confirm(question)) return;
        try {
            const { item } = await api<{ item: RunItem }>("/api/admin/kb/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ unit: unit.id, author, ...(target.doc ? { key: target.doc.key } : { legacyName: target.legacy!.name }) }),
            });
            setMessage({ kind: item.outcome === "failed" ? "error" : "ok", text: `“${item.title}”: ${item.outcome === "retired" ? "removed from the knowledge base" : item.outcome}${item.detail ? ` – ${item.detail}` : ""}` });
            if (history?.doc.key === target.doc?.key) setHistory(null);
            await loadDocs(unit.id);
            await loadUnits();
        } catch (err) {
            handleError(err);
        }
    };

    const upload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unit || !file) return;
        setUploading(true);
        setMessage(null);
        try {
            const form = new FormData();
            form.set("unit", unit.id);
            form.set("title", versionOf ? versionOf.title : title);
            form.set("author", author);
            form.set("note", note);
            // Word / HTML / text are converted here and only the text is sent
            // (Word files with images are often over the 4.5 MB request limit).
            const converted = await convertUpload(file.name, new Uint8Array(await file.arrayBuffer()), versionOf ? versionOf.title : title);
            if (converted.file) {
                if (file.size > 4 * 1024 * 1024) throw new Error("PDF is larger than 4 MB. Save it as Word (.docx) and upload that, or split the PDF.");
                form.set("file", file);
            } else {
                form.set("text", converted.text);
                form.set("sourceName", file.name);
            }
            if (versionOf) form.set("key", versionOf.key);
            if (replacing) form.set("replaceLegacy", replacing.name);
            const data = await api<{ item: RunItem; replaced: RunItem | null; converted: string; preview: string | null }>("/api/admin/kb/upload", { method: "POST", body: form });
            const { item, replaced } = data;
            setMessage({
                kind: item.outcome === "failed" ? "error" : "ok",
                text:
                    item.outcome === "unchanged"
                        ? `“${item.title}” is identical to the live version, so nothing changed.`
                        : `“${item.title}” ${item.outcome}${item.version ? ` as v${item.version}` : ""} in ${unit.shortLabel} (${data.converted}).${item.detail ? ` ${item.detail}` : ""}${
                              replaced ? ` Older upload “${replaced.title}”: ${replaced.outcome === "retired" ? "removed" : replaced.detail}.` : ""
                          }`,
                preview: data.preview ?? undefined,
            });
            setTitle("");
            setNote("");
            setFile(null);
            setVersionOf(null);
            setReplacing(null);
            await loadDocs(unit.id);
            await loadUnits();
        } catch (err) {
            handleError(err);
        } finally {
            setUploading(false);
        }
    };

    const logout = async () => {
        await fetch("/api/admin/analytics/login", { method: "DELETE" });
        setAuthed(false);
    };

    if (authed === null) return <div className="flex min-h-screen items-center justify-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
    if (!authed) return <div className="min-h-screen bg-zinc-50 px-4"><Login onDone={loadUnits} /></div>;

    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-800">
            <header className="border-b border-zinc-200 bg-white">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                        <h1 className="text-lg font-semibold text-zinc-900">UTARCHAT knowledge base</h1>
                        <p className="text-xs text-zinc-500">Portal and web pages sync monthly · staff uploads are versioned · any version can be made live again</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" className="w-40 rounded-lg border border-zinc-300 px-2 py-1 text-sm" />
                        <button onClick={logout} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">
                            <LogOut className="h-4 w-4" /> Sign out
                        </button>
                    </div>
                </div>
                <nav className="mx-auto flex max-w-6xl gap-4 px-4 text-sm">
                    {(["documents", "runs"] as const).map((t) => (
                        <button key={t} onClick={() => setTab(t)} className={`border-b-2 pb-2 ${tab === t ? "border-zinc-900 font-medium text-zinc-900" : "border-transparent text-zinc-500"}`}>
                            {t === "documents" ? "Documents" : "Sync & upload history"}
                        </button>
                    ))}
                </nav>
            </header>

            <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
                {localMode && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Local test mode: no database is configured, so versions are saved to a local file and uploads are only recorded. The live knowledge stores are not changed.
                    </div>
                )}
                {message && (
                    <div className={`rounded-lg border px-3 py-2 text-sm ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                        <div className="flex justify-between gap-2">
                            <span>{message.text}</span>
                            <button onClick={() => setMessage(null)} className="text-xs opacity-60">Dismiss</button>
                        </div>
                        {message.preview && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-zinc-700">{message.preview}</pre>}
                    </div>
                )}

                {tab === "documents" && (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                                <option value="">Choose a department…</option>
                                {units.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.shortLabel} – {u.name} ({u.documents})
                                    </option>
                                ))}
                            </select>
                            {unit && (
                                <button onClick={() => loadDocs(unit.id)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm">
                                    <RefreshCw className="h-4 w-4" /> Refresh
                                </button>
                            )}
                            {unit && <span className="text-xs text-zinc-400">Store: {unit.storeName}</span>}
                        </div>

                        {unit && (
                            <div className="grid gap-4 lg:grid-cols-3">
                                <section className="space-y-3 lg:col-span-2">
                                    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                                                <tr>
                                                    <th className="px-3 py-2">Document</th>
                                                    <th className="px-3 py-2">Source</th>
                                                    <th className="px-3 py-2">Live</th>
                                                    <th className="px-3 py-2">Updated</th>
                                                    <th className="px-3 py-2" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loading && (
                                                    <tr>
                                                        <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                                                            <Loader2 className="inline h-4 w-4 animate-spin" />
                                                        </td>
                                                    </tr>
                                                )}
                                                {!loading && docs.length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">No versioned documents yet.</td>
                                                    </tr>
                                                )}
                                                {!loading &&
                                                    docs.map((d) => (
                                                        <tr key={d.key} className="border-t border-zinc-100">
                                                            <td className="px-3 py-2">
                                                                <div className="font-medium text-zinc-900">{d.title}</div>
                                                                {d.sourceUrl && (
                                                                    <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-blue-600 underline">
                                                                        {d.sourceUrl}
                                                                    </a>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span className={`rounded-full border px-2 py-0.5 text-xs ${ORIGIN_STYLE[d.origin]}`}>{ORIGIN_LABEL[d.origin]}</span>
                                                            </td>
                                                            <td className="px-3 py-2">{d.liveVersion ? `v${d.liveVersion}` : <span className="text-xs text-zinc-400">removed</span>}</td>
                                                            <td className="px-3 py-2 text-xs text-zinc-500">{fmtDate(d.updatedAt)}</td>
                                                            <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                                                                <button onClick={() => openHistory(d)} className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-0.5 text-xs">
                                                                    <History className="h-3 w-3" /> History
                                                                </button>
                                                                {d.origin === "manual" && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setReplacing(null);
                                                                            setVersionOf(d);
                                                                        }}
                                                                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs"
                                                                    >
                                                                        New version
                                                                    </button>
                                                                )}
                                                                {d.origin === "manual" && d.liveVersion > 0 && (
                                                                    <button onClick={() => remove({ doc: d })} className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50">
                                                                        <Trash2 className="h-3 w-3" /> Remove
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {history && (
                                        <div className="rounded-xl border border-zinc-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <h2 className="text-sm font-semibold">History: {history.doc.title}</h2>
                                                <button onClick={() => setHistory(null)} className="text-xs text-zinc-500">Close</button>
                                            </div>
                                            <ul className="divide-y divide-zinc-100 text-sm">
                                                {history.versions.map((v) => (
                                                    <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                                        <div>
                                                            <span className="font-medium">v{v.version}</span>
                                                            {v.version === history.doc.liveVersion && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">live</span>}
                                                            <span className="ml-2 text-xs text-zinc-500">
                                                                {fmtDate(v.createdAt)} · {v.author} · {fmtSize(v.chars)}
                                                                {v.note ? ` · ${v.note}` : ""}
                                                            </span>
                                                        </div>
                                                        {v.version !== history.doc.liveVersion && (
                                                            <button onClick={() => doRollback(history.doc, v.version)} className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2 py-0.5 text-xs">
                                                                <RotateCcw className="h-3 w-3" /> Make live again
                                                            </button>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {legacy.length > 0 && (
                                        <details open className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                                            <summary className="cursor-pointer text-zinc-600">
                                                {legacy.length} older upload{legacy.length > 1 ? "s" : ""} from the previous uploader (not versioned)
                                            </summary>
                                            <p className="mt-1 text-xs text-zinc-500">“Replace with new version” uploads the newer file with versioning, then removes the older one once the new one is live.</p>
                                            <ul className="mt-2 divide-y divide-zinc-100 text-xs text-zinc-600">
                                                {legacy.map((l) => (
                                                    <li key={l.name} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                                        <span>
                                                            {l.displayName || l.name} · {fmtDate(l.createTime)}
                                                            {l.sizeBytes ? ` · ${fmtSize(Number(l.sizeBytes))}` : ""}
                                                        </span>
                                                        <span className="space-x-1 whitespace-nowrap">
                                                            <button
                                                                onClick={() => {
                                                                    setVersionOf(null);
                                                                    setReplacing(l);
                                                                    setTitle((l.displayName || "").replace(/\.(pdf|docx?|txt|md)$/i, "").replace(/[_-]+/g, " ").trim());
                                                                }}
                                                                className="rounded border border-zinc-300 px-2 py-0.5"
                                                            >
                                                                Replace with new version
                                                            </button>
                                                            <button onClick={() => remove({ legacy: l })} className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-0.5 text-red-700 hover:bg-red-50">
                                                                <Trash2 className="h-3 w-3" /> Remove
                                                            </button>
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    )}
                                </section>

                                <form onSubmit={upload} className="h-fit space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
                                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                                        <UploadCloud className="h-4 w-4" /> {versionOf ? `New version of “${versionOf.title}”` : `Upload to ${unit.shortLabel}`}
                                    </h2>
                                    {replacing && (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                                            Replaces the older upload “{replacing.displayName || replacing.name}”. It is removed once the new version is live.{" "}
                                            <button type="button" onClick={() => setReplacing(null)} className="underline">
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                    {versionOf ? (
                                        <button type="button" onClick={() => setVersionOf(null)} className="text-xs text-zinc-500 underline">
                                            Upload a different document instead
                                        </button>
                                    ) : (
                                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. FICT Handbook 2026" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
                                    )}
                                    <input type="file" accept=".pdf,.docx,.md,.markdown,.txt,.html,.htm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
                                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (optional)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
                                    <p className="text-xs text-zinc-500">PDF (up to 4 MB) is kept as the file. Word, HTML and text are converted to Markdown in your browser so tables stay row by row; images are left out.</p>
                                    <button
                                        disabled={uploading || !file || !author.trim() || (!versionOf && !title.trim())}
                                        className="w-full rounded-lg bg-zinc-900 py-2 text-sm text-white disabled:opacity-40"
                                    >
                                        {uploading ? "Uploading and indexing…" : !author.trim() ? "Enter your name at the top" : "Upload"}
                                    </button>
                                </form>
                            </div>
                        )}
                    </>
                )}

                {tab === "runs" && (
                    <div className="space-y-3">
                        <button onClick={loadRuns} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm">
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </button>
                        {runs.length === 0 && <p className="text-sm text-zinc-500">No syncs or uploads yet.</p>}
                        {runs.map((r) => {
                            const counts = r.items.reduce<Record<string, number>>((acc, i) => ((acc[i.outcome] = (acc[i.outcome] ?? 0) + 1), acc), {});
                            const attention = r.items.filter((i) => i.outcome === "held" || i.outcome === "failed");
                            return (
                                <details key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                                    <summary className="cursor-pointer">
                                        <span className="font-medium">{r.kind}</span> · {fmtDate(r.startedAt)} ·{" "}
                                        {Object.entries(counts).map(([o, n]) => (
                                            <span key={o} className={`mr-2 ${OUTCOME_STYLE[o] ?? ""}`}>
                                                {o} {n}
                                            </span>
                                        ))}
                                        {attention.length > 0 && <span className="text-amber-700">· {attention.length} need a look</span>}
                                    </summary>
                                    <ul className="mt-2 space-y-1 text-xs">
                                        {[...attention, ...r.items.filter((i) => !attention.includes(i))].map((i, n) => (
                                            <li key={n} className={OUTCOME_STYLE[i.outcome] ?? ""}>
                                                <b>{i.outcome}</b> · {i.unitId} · {i.title}
                                                {i.version ? ` · v${i.version}` : ""}
                                                {i.detail ? ` – ${i.detail}` : ""}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
