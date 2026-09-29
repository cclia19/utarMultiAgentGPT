"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Lock, LogOut, Search } from "lucide-react";
import {
    COLORS,
    Heatmap,
    HeatmapScale,
    Legend,
    RankedBars,
    StackedBars,
    type StackedPoint,
} from "@/components/analytics/charts";

type Totals = {
    questions: number; sessions: number; kb: number; web: number; directory: number; direct: number;
    errors: number; follow_ups: number; clarifications: number; p50_ms: number; p90_ms: number;
    gemini_calls: number; input_tokens: number; output_tokens: number;
};
type Summary = {
    range: { from: string; to: string; env: string; timezone: string };
    totals: Totals;
    daily: Array<{ day: string; questions: number; sessions: number; kb: number; web: number }>;
    heatmap: Array<{ dow: number; hour: number; questions: number }>;
    agents: Array<{ agent: string; questions: number; web: number }>;
};
type QuestionRow = {
    id: string; created_at: string; agent_label: string | null; source_mode: string | null;
    is_follow_up: boolean; status: string; latency_ms: number | null; question_masked: string | null;
};

const LAUNCH_DATE = "2026-08-04";
const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SOURCE_LABEL: Record<string, string> = {
    fileSearch: "KB", webFallback: "Web", staffDirectory: "Directory", none: "Direct",
};

function klToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}
function shift(date: string, days: number) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}
function fmtDay(d: string) {
    return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });
}
function pct(n: number, d: number) {
    return d ? `${Math.round((n / d) * 100)}%` : "–";
}
function secs(ms: number) {
    return ms ? `${(ms / 1000).toFixed(1)}s` : "–";
}

type Grain = "day" | "week" | "month";

/** Fill missing days with zero and group into day / ISO week (Mon) / month buckets. */
function bucketize(summary: Summary, grain: Grain): StackedPoint[] {
    const byDay = new Map(summary.daily.map((d) => [d.day, d]));
    const buckets = new Map<string, StackedPoint>();
    const n = daysBetween(summary.range.from, summary.range.to);
    for (let i = 0; i < n; i++) {
        const day = shift(summary.range.from, i);
        const row = byDay.get(day);
        let key = day;
        let label = fmtDay(day);
        if (grain === "week") {
            const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
            key = shift(day, -dow);
            label = `Wk ${fmtDay(key)}`;
        } else if (grain === "month") {
            key = day.slice(0, 7);
            label = new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
        }
        const b = buckets.get(key) || { label, kb: 0, web: 0, other: 0 };
        if (row) {
            b.kb += row.kb;
            b.web += row.web;
            b.other += row.questions - row.kb - row.web;
        }
        buckets.set(key, b);
    }
    return [...buckets.values()];
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-medium text-zinc-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
            {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
        </div>
    );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
                {right}
            </div>
            {children}
        </section>
    );
}

function Login({ onDone }: { onDone: () => void }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const res = await fetch("/api/admin/analytics/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
        });
        setBusy(false);
        if (res.ok) onDone();
        else setError((await res.json().catch(() => ({}))).error || "Login failed.");
    };
    return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
            <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-zinc-900">
                    <Lock className="h-4 w-4" />
                    <h1 className="text-base font-semibold">UTARCHAT usage dashboard</h1>
                </div>
                <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="pw">Password</label>
                <input
                    id="pw"
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                />
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                <button
                    disabled={busy || !password}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
                </button>
            </form>
        </main>
    );
}

export default function AnalyticsPage() {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [from, setFrom] = useState(shift(klToday(), -29));
    const [to, setTo] = useState(klToday());
    const [env, setEnv] = useState("");
    const [grain, setGrain] = useState<Grain>("day");
    const [summary, setSummary] = useState<Summary | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showTable, setShowTable] = useState(false);

    const [q, setQ] = useState("");
    const [source, setSource] = useState("");
    const [page, setPage] = useState(0);
    const [questions, setQuestions] = useState<{ total: number; pageSize: number; rows: QuestionRow[] } | null>(null);

    const qs = useMemo(() => {
        const p = new URLSearchParams({ from, to });
        if (env) p.set("env", env);
        return p;
    }, [from, to, env]);

    const loadSummary = useCallback(async () => {
        setLoading(true);
        setError("");
        const res = await fetch(`/api/admin/analytics/summary?${qs}`, { cache: "no-store" });
        setLoading(false);
        if (res.status === 401) return setAuthed(false);
        setAuthed(true);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setError(data.error || "Could not load data.");
        setSummary(data);
        if (!env) setEnv(data.range.env);
    }, [qs, env]);

    const loadQuestions = useCallback(async () => {
        const p = new URLSearchParams(qs);
        if (q) p.set("q", q);
        if (source) p.set("source", source);
        p.set("page", String(page));
        const res = await fetch(`/api/admin/analytics/questions?${p}`, { cache: "no-store" });
        if (res.ok) setQuestions(await res.json());
    }, [qs, q, source, page]);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { if (authed) loadQuestions(); }, [authed, loadQuestions]);

    const series = useMemo(() => (summary ? bucketize(summary, grain) : []), [summary, grain]);

    const peaks = useMemo(() => {
        if (!summary || !summary.totals.questions) return null;
        const busiestDay = [...summary.daily].sort((a, b) => b.questions - a.questions)[0];
        const byDow = new Array(7).fill(0);
        const byHour = new Array(24).fill(0);
        for (const c of summary.heatmap) { byDow[c.dow - 1] += c.questions; byHour[c.hour] += c.questions; }
        const dow = byDow.indexOf(Math.max(...byDow));
        const hour = byHour.indexOf(Math.max(...byHour));
        return { busiestDay, dow, hour };
    }, [summary]);

    const logout = async () => {
        await fetch("/api/admin/analytics/login", { method: "DELETE" });
        setAuthed(false);
        setSummary(null);
    };

    const preset = (days: number | "launch") => {
        const t = klToday();
        setTo(t);
        setFrom(days === "launch" ? LAUNCH_DATE : shift(t, -(days - 1)));
        setPage(0);
    };

    if (authed === false) return <Login onDone={() => { setAuthed(null); loadSummary(); }} />;

    const t = summary?.totals;
    const nDays = summary ? daysBetween(summary.range.from, summary.range.to) : 1;

    return (
        <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:px-8">
            <div className="mx-auto max-w-6xl space-y-5">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold text-zinc-900">UTARCHAT usage</h1>
                        <p className="text-sm text-zinc-500">
                            Every question asked in UTARCHAT. Times in Malaysia time (GMT+8).
                        </p>
                    </div>
                    <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
                        <LogOut className="h-4 w-4" /> Sign out
                    </button>
                </header>

                {/* Filters: one row above the charts */}
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-sm">
                    {[
                        { l: "7 days", v: 7 as const },
                        { l: "30 days", v: 30 as const },
                        { l: "90 days", v: 90 as const },
                        { l: "Since launch", v: "launch" as const },
                    ].map((p) => (
                        <button key={p.l} onClick={() => preset(p.v)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100">
                            {p.l}
                        </button>
                    ))}
                    <span className="mx-1 hidden h-5 w-px bg-zinc-200 sm:inline-block" />
                    <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="rounded-lg border border-zinc-200 px-2 py-1.5" aria-label="From" />
                    <span className="text-zinc-400">to</span>
                    <input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="rounded-lg border border-zinc-200 px-2 py-1.5" aria-label="To" />
                    <select value={env} onChange={(e) => setEnv(e.target.value)} className="rounded-lg border border-zinc-200 px-2 py-1.5" aria-label="Environment">
                        <option value="production">Live (production)</option>
                        <option value="preview">Preview</option>
                        <option value="development">Local testing</option>
                    </select>
                    <a href={`/api/admin/analytics/export?${qs}`} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-white">
                        <Download className="h-4 w-4" /> Export CSV
                    </a>
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                </div>

                {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}

                {t && (
                    <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <Stat label="Questions answered" value={t.questions.toLocaleString()} sub={`${(t.questions / nDays).toFixed(1)} per day on average`} />
                            <Stat label="Unique browsers" value={t.sessions.toLocaleString()} sub="Approximate users (no login)" />
                            <Stat label="Answered from knowledge base" value={pct(t.kb, t.questions)} sub={`Web search: ${pct(t.web, t.questions)}`} />
                            <Stat label="Typical response time" value={secs(t.p50_ms)} sub={`90% within ${secs(t.p90_ms)}`} />
                        </div>

                        {peaks && (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <Stat label="Busiest day" value={fmtDay(peaks.busiestDay.day)} sub={`${peaks.busiestDay.questions.toLocaleString()} questions`} />
                                <Stat label="Busiest weekday" value={DAYS_LONG[peaks.dow]} />
                                <Stat label="Peak hour" value={`${String(peaks.hour).padStart(2, "0")}:00–${String(peaks.hour).padStart(2, "0")}:59`} />
                            </div>
                        )}

                        <Card
                            title="Questions over time"
                            right={
                                <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5 text-xs">
                                    {(["day", "week", "month"] as Grain[]).map((g) => (
                                        <button key={g} onClick={() => setGrain(g)} className={`rounded-md px-2.5 py-1 capitalize ${grain === g ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}>
                                            {g}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            <StackedBars data={series} />
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <Legend items={[
                                    { label: "Knowledge base", color: COLORS.kb },
                                    { label: "Web search", color: COLORS.web },
                                    { label: "Other (greetings, clarifications, directory)", color: COLORS.other },
                                ]} />
                                <button onClick={() => setShowTable((s) => !s)} className="text-xs text-zinc-500 underline">
                                    {showTable ? "Hide table" : "Show as table"}
                                </button>
                            </div>
                            {showTable && (
                                <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-zinc-200">
                                    <table className="w-full text-left text-xs">
                                        <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                                            <tr><th className="p-2">Period</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">KB</th><th className="p-2 text-right">Web</th><th className="p-2 text-right">Other</th></tr>
                                        </thead>
                                        <tbody>
                                            {series.map((s) => (
                                                <tr key={s.label} className="border-t border-zinc-100 tabular-nums">
                                                    <td className="p-2">{s.label}</td>
                                                    <td className="p-2 text-right">{s.kb + s.web + s.other}</td>
                                                    <td className="p-2 text-right">{s.kb}</td>
                                                    <td className="p-2 text-right">{s.web}</td>
                                                    <td className="p-2 text-right">{s.other}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                            <div className="lg:col-span-2">
                                <Card title="When students ask (weekday × hour)" right={<HeatmapScale />}>
                                    <Heatmap cells={summary!.heatmap} />
                                </Card>
                            </div>
                            <Card title="By department agent">
                                {summary!.agents.length ? (
                                    <>
                                        <RankedBars rows={summary!.agents.map((a) => ({ label: a.agent, value: a.questions, web: a.web }))} />
                                        <div className="mt-4">
                                            <Legend items={[{ label: "Without web search", color: COLORS.kb }, { label: "Web search", color: COLORS.web }]} />
                                        </div>
                                    </>
                                ) : <p className="text-sm text-zinc-500">No data yet.</p>}
                            </Card>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <Stat label="Follow-up questions" value={pct(t.follow_ups, t.questions)} />
                            <Stat label="Bot asked to clarify" value={pct(t.clarifications, t.questions)} />
                            <Stat label="Errors" value={t.errors.toLocaleString()} sub={pct(t.errors, t.questions) + " of questions"} />
                            <Stat label="Gemini tokens used" value={`${((t.input_tokens + t.output_tokens) / 1e6).toFixed(2)}M`} sub={`${t.gemini_calls.toLocaleString()} Gemini calls`} />
                        </div>
                    </>
                )}

                <Card
                    title={`Question snapshots${questions ? ` (${questions.total.toLocaleString()})` : ""}`}
                    right={
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-zinc-400" />
                                <input
                                    value={q}
                                    onChange={(e) => { setQ(e.target.value); setPage(0); }}
                                    placeholder="Search questions"
                                    className="w-52 rounded-lg border border-zinc-200 py-1.5 pl-8 pr-2"
                                />
                            </div>
                            <select value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} className="rounded-lg border border-zinc-200 px-2 py-1.5" aria-label="Answer source">
                                <option value="">All sources</option>
                                <option value="fileSearch">Knowledge base</option>
                                <option value="webFallback">Web search</option>
                                <option value="staffDirectory">Staff directory</option>
                                <option value="none">Direct reply</option>
                            </select>
                        </div>
                    }
                >
                    <p className="mb-3 text-xs text-zinc-500">
                        Personal details (IC, phone, email, ID numbers) are masked before saving. Question text is kept for 12 months.
                        Filter by “Web search” to see topics missing from the knowledge base.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="text-xs text-zinc-500">
                                <tr className="border-b border-zinc-200">
                                    <th className="py-2 pr-3 font-medium">Time (MYT)</th>
                                    <th className="py-2 pr-3 font-medium">Question</th>
                                    <th className="py-2 pr-3 font-medium">Agent</th>
                                    <th className="py-2 pr-3 font-medium">Source</th>
                                    <th className="py-2 text-right font-medium">Time taken</th>
                                </tr>
                            </thead>
                            <tbody>
                                {questions?.rows.map((r) => (
                                    <tr key={r.id} className="border-b border-zinc-100 align-top">
                                        <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums text-zinc-500">
                                            {new Date(r.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                        </td>
                                        <td className="py-2 pr-3 text-zinc-800">
                                            {r.question_masked ?? <span className="text-zinc-400">(text expired)</span>}
                                            {r.is_follow_up && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">follow-up</span>}
                                            {r.status === "error" && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">error</span>}
                                        </td>
                                        <td className="py-2 pr-3 text-xs text-zinc-600">{r.agent_label || "–"}</td>
                                        <td className="py-2 pr-3 text-xs">
                                            <span className="inline-flex items-center gap-1.5 text-zinc-700">
                                                <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.source_mode === "webFallback" ? COLORS.web : r.source_mode === "fileSearch" ? COLORS.kb : COLORS.other }} />
                                                {SOURCE_LABEL[r.source_mode || "none"] || r.source_mode}
                                            </span>
                                        </td>
                                        <td className="py-2 text-right text-xs tabular-nums text-zinc-500">{r.latency_ms ? secs(r.latency_ms) : "–"}</td>
                                    </tr>
                                ))}
                                {questions && questions.rows.length === 0 && (
                                    <tr><td colSpan={5} className="py-6 text-center text-sm text-zinc-500">No questions in this range.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {questions && questions.total > questions.pageSize && (
                        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-zinc-200 px-3 py-1 disabled:opacity-40">Previous</button>
                            <span className="text-xs text-zinc-500">Page {page + 1} of {Math.ceil(questions.total / questions.pageSize)}</span>
                            <button disabled={(page + 1) * questions.pageSize >= questions.total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-zinc-200 px-3 py-1 disabled:opacity-40">Next</button>
                        </div>
                    )}
                </Card>
            </div>
        </main>
    );
}
