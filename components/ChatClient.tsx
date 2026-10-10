"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import AnswerBody from "./AnswerBody";
import AgentBadge from "./AgentBadge";
import { ArrowUp, ArrowUpRight, Check, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import html2canvas from "html2canvas";
import DisclaimerModal from "./DisclaimerModal";
import FeedbackModal from "./FeedbackModal";
import { LANGS, STRINGS, defaultLang, type Lang } from "@/lib/i18n";

const LANG_KEY = "utarchat_lang";

// Anonymous per-browser ID for usage stats (no login). Random, holds no personal data.
const SESSION_KEY = "utarchat_anon_id";
function getAnonymousSessionId(): string {
    try {
        let id = localStorage.getItem(SESSION_KEY);
        if (!id) {
            id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return "";
    }
}

type Role = "user" | "model";
type AgentId = string;

interface Message {
    role: Role;
    text: string;
    thought?: string;
    isStreaming?: boolean;
    citations?: string[];
    sourceMode?: "fileSearch" | "webFallback" | "staffDirectory" | "officialSchedule" | "none";
    storeDisplayName?: string;
    selectedAgentId?: AgentId;
    selectedAgentLabel?: string;
    needsClarification?: boolean;
    followUps?: string[];
}

interface HistoryEntry {
    role: Role;
    parts: { text: string }[];
}

const WELCOME: Message = {
    role: "model",
    text: "Hi! I'm UTARCHAT, your friendly UTAR buddy! Ask me anything about UTAR—courses, admissions, fees, contacts, student support, and more 😊",
    citations: [],
    sourceMode: "none",
    storeDisplayName: "",
    selectedAgentId: "general",
    selectedAgentLabel: "General UTAR Assistant",
};

function detectAgentFromMessage(text: string): AgentId | null {
    const normalized = text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const map: Record<string, AgentId> = {
        general: "general",
        utar: "general",

        fict: "fict",
        fbf: "fbf",
        fas: "fass",
        fass: "fass",
        fegt: "fegt",
        fsc: "fsc",
        fam: "fam",
        fmhs: "fmhs",
        lkcfes: "lkcfes",
        "lkc fes": "lkcfes",
        fci: "fci",
        fcs: "fcs",
        fed: "fed",

        ipsr: "ipsr",
        dhr: "dhr",
        dssm: "dssm",
        dfn: "dfn",
        dea: "deas",
        deas: "deas",
        dace: "dace",
        oia: "oia",
        library: "library",
        diss: "diss",
        "dss sungai long": "dss-sungai-long",
        "dss sl": "dss-sungai-long",
        "dss kampar": "dss-kampar",
        "dss kpr": "dss-kampar",
        "dsa sungai long": "dsa-sungai-long",
        "dsa sl": "dsa-sungai-long",
        "dsa kampar": "dsa-kampar",
        "dsa kpr": "dsa-kampar",
        dgs: "dgs-kampar",
    };

    return map[normalized] || null;
}

export default function ChatClient() {
    const [messages, setMessages] = useState<Message[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<{ stage: string; text: string } | null>(null);
    // Steps the server reported for the current question, shown as a timeline.
    const [stages, setStages] = useState<{ stage: string; text: string }[]>([]);

    // EN / BM / 中文: page wording and the language answers are written in.
    const [lang, setLang] = useState<Lang>("en");
    useEffect(() => {
        try {
            const saved = localStorage.getItem(LANG_KEY) as Lang | null;
            setLang(saved && STRINGS[saved] ? saved : defaultLang());
        } catch {
            setLang(defaultLang());
        }
    }, []);
    const chooseLang = (l: Lang) => {
        setLang(l);
        try {
            localStorage.setItem(LANG_KEY, l);
        } catch {
            // not remembered; fine
        }
    };
    const t = STRINGS[lang];
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("general");
    const [selectedAgentLabel, setSelectedAgentLabel] = useState(
        "General UTAR Assistant"
    );

    const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
    const [lastResolvedTopic, setLastResolvedTopic] = useState<string | null>(
        null
    );

    const [feedbackModal, setFeedbackModal] = useState<{
        isOpen: boolean;
        rating: "like" | "dislike";
        userQuery: string;
        responseText: string;
        selectedAgentId?: string;
        selectedAgentLabel?: string;
        storeDisplayName?: string;
        sourceMode?: string;
        citations?: string[];
        screenshotBase64?: string;
        msgIndex?: number;
    }>({
        isOpen: false,
        rating: "like",
        userQuery: "",
        responseText: "",
    });
    const [feedbackGiven, setFeedbackGiven] = useState<Record<number, "like" | "dislike">>({});

    const handleOpenFeedback = async (
        index: number,
        msg: Message,
        rating: "like" | "dislike"
    ) => {
        const userMsg = messages[index - 1];
        const userQuery = userMsg?.role === "user" ? userMsg.text : "";
        let screenshotBase64 = "";

        try {
            const userElem = document.getElementById(`msg-container-${index - 1}`);
            const modelElem = document.getElementById(`msg-container-${index}`);

            if (modelElem) {
                const wrapper = document.createElement("div");
                wrapper.style.position = "absolute";
                wrapper.style.left = "-9999px";
                wrapper.style.top = "-9999px";
                wrapper.style.width = "680px";
                const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
                wrapper.style.backgroundColor = dark ? "#09090b" : "#ffffff";
                wrapper.style.padding = "24px";
                wrapper.style.borderRadius = "20px";
                wrapper.style.display = "flex";
                wrapper.style.flexDirection = "column";
                wrapper.style.gap = "16px";
                wrapper.style.fontFamily = "sans-serif";

                if (userElem) {
                    const clonedUser = userElem.cloneNode(true) as HTMLElement;
                    clonedUser.style.transform = "none";
                    wrapper.appendChild(clonedUser);
                }
                const clonedModel = modelElem.cloneNode(true) as HTMLElement;
                clonedModel.style.transform = "none";
                wrapper.appendChild(clonedModel);

                document.body.appendChild(wrapper);

                const canvas = await html2canvas(wrapper, {
                    scale: 1.5,
                    useCORS: true,
                    backgroundColor: dark ? "#09090b" : "#ffffff",
                    logging: false,
                });
                screenshotBase64 = canvas.toDataURL("image/png");
                document.body.removeChild(wrapper);
            }
        } catch (err) {
            console.error("Screenshot capture error:", err);
        }

        setFeedbackModal({
            isOpen: true,
            rating,
            userQuery,
            responseText: msg.text,
            selectedAgentId: msg.selectedAgentId,
            selectedAgentLabel: msg.selectedAgentLabel,
            storeDisplayName: msg.storeDisplayName,
            sourceMode: msg.sourceMode,
            citations: msg.citations,
            screenshotBase64,
            msgIndex: index,
        });
    };

    // Generic memory summary returned by route.ts.
    // This is intentionally not hardcoded into fixed fields like currentFaculty/currentProgramme/currentPerson.
    const [contextSummary, setContextSummary] = useState<string>("");

    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
    }, []);

    useEffect(() => {
        // The welcome screen stays at the top; scroll only once a chat starts.
        if (messages.length > 1 || loading) scrollToBottom();
    }, [messages, loading, stages, scrollToBottom]);

    // Phone keyboards shrink the visual viewport: keep the latest answer in view.
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const onResize = () => scrollToBottom(false);
        vv.addEventListener("resize", onResize);
        return () => vv.removeEventListener("resize", onResize);
    }, [scrollToBottom]);

    // Text box grows with the question (up to about five lines).
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [input]);

    const buildHistory = (msgs: Message[]): HistoryEntry[] =>
        msgs
            .filter((m) => m !== WELCOME)
            .map((m) => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));

    const handleSend = async (override?: string) => {
        const trimmed = (override ?? input).trim();

        if (!trimmed || loading) return;
        // A light tap on phones that support it (Android); iOS ignores it.
        try {
            navigator.vibrate?.(8);
        } catch {
            // no vibration support
        }

        const detectedAgent = detectAgentFromMessage(trimmed);

        let agentForThisRequest = selectedAgentId;

        if (pendingQuestion && detectedAgent) {
            agentForThisRequest = detectedAgent;
            setSelectedAgentId(detectedAgent);
        }

        const userMsg: Message = {
            role: "user",
            text: trimmed,
            selectedAgentId: agentForThisRequest,
            selectedAgentLabel,
        };

        const nextMessages = [...messages, userMsg];

        setMessages(nextMessages);
        setInput("");
        setLoading(true);
        setCurrentStatus({ stage: "analyzing", text: "Analyzing your question..." });
        setStages([{ stage: "analyzing", text: "" }]);

        // The streaming preview bubble always lands at this index: nextMessages is
        // already committed and nothing else appends while the stream is open. Keeping
        // the index out of the setMessages updater keeps that updater pure, which
        // matters under React StrictMode's double-invocation in dev.
        const previewIndex = nextMessages.length;
        let previewShown = false;
        let drain: number | undefined;

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: trimmed,
                    pendingQuestion,
                    history: buildHistory(nextMessages),
                    selectedAgentId: agentForThisRequest,
                    lastResolvedTopic,
                    contextSummary,
                    sessionId: getAnonymousSessionId(),
                    language: lang,
                    stream: true,
                }),
            });

            if (!res.ok || !res.body) {
                const failed = await res.json().catch(() => ({}));
                throw new Error(failed.error || "Request failed");
            }

            // NDJSON stream: provisional "status"/"thought"/"text"/"replace"/"reset" frames render a live
            // preview; the trailing "done" frame carries the authoritative payload.
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            // Target strings grow as frames arrive; the drain loop below reveals
            // them a few characters at a time. Gemini delivers ~200-char chunks
            // every ~180ms, which lands as visible blocks if rendered directly.
            let preview = "";
            let previewThought = "";
            let shownPreview = "";
            let shownThought = "";
            let data: any = null;
            let streamError = "";

            const renderPreview = () => {
                const text = shownPreview;
                if (!text) return;
                const shown = previewShown;
                previewShown = true;
                setMessages((prev) => {
                    const next = [...prev];
                    const bubble: Message = {
                        role: "model",
                        text,
                        isStreaming: true,
                        citations: [],
                        sourceMode: "none",
                        storeDisplayName: "",
                        selectedAgentId: agentForThisRequest,
                        selectedAgentLabel,
                    };
                    if (!shown && next.length === previewIndex) {
                        next.push(bubble);
                    } else {
                        next[previewIndex] = bubble;
                    }
                    return next;
                });
            };

            // Reveal buffered text at a steady rate so it reads as typing rather
            // than as blocks. The step scales with the backlog, so a burst catches
            // up quickly instead of falling further behind.
            const REVEAL_INTERVAL_MS = 16;
            const advance = (shown: string, target: string) => {
                if (shown.length >= target.length) return target;
                const remaining = target.length - shown.length;
                const step = Math.max(2, Math.ceil(remaining / 12));
                return target.slice(0, shown.length + step);
            };

            drain = window.setInterval(() => {
                if (shownPreview === preview && shownThought === previewThought) return;
                shownPreview = advance(shownPreview, preview);
                shownThought = advance(shownThought, previewThought);
                renderPreview();
            }, REVEAL_INTERVAL_MS);

            const handleFrame = (line: string) => {
                if (!line.trim()) return;
                let frame: any;
                try {
                    frame = JSON.parse(line);
                } catch {
                    return;
                }

                if (frame.type === "status") {
                    setCurrentStatus({ stage: frame.stage, text: frame.text });
                    setStages((prev) => (prev.some((p) => p.stage === frame.stage) ? prev : [...prev, { stage: frame.stage, text: frame.text }]));
                } else if (frame.type === "thought") {
                    setCurrentStatus({ stage: "reasoning", text: "Synthesizing verified answer..." });
                    setStages((prev) => (prev.some((p) => p.stage === "reasoning") ? prev : [...prev, { stage: "reasoning", text: "" }]));
                    previewThought += frame.delta || "";
                } else if (frame.type === "text") {
                    if (preview.length === 0) {
                        setCurrentStatus(null);
                    }
                    preview += frame.delta || "";
                } else if (frame.type === "replace") {
                    preview = frame.text || "";
                    // A replace rewrites history, so the revealed prefix may no
                    // longer be valid; keep whatever still matches.
                    if (!preview.startsWith(shownPreview)) shownPreview = "";
                    renderPreview();
                } else if (frame.type === "reset") {
                    preview = "";
                    previewThought = "";
                    shownPreview = "";
                    shownThought = "";
                    if (previewShown) {
                        previewShown = false;
                        setMessages((prev) => prev.filter((_, i) => i !== previewIndex));
                    }
                } else if (frame.type === "done") {
                    data = frame;
                    setCurrentStatus(null);
                } else if (frame.type === "error") {
                    streamError = frame.message || "Stream failed";
                    setCurrentStatus(null);
                }
            };

            for (; ;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) handleFrame(line);
            }
            if (buffer) handleFrame(buffer);

            if (drain !== undefined) window.clearInterval(drain);

            if (!data) {
                throw new Error(streamError || "Request failed");
            }

            const incomingAgentId = data.selectedAgentId as string | undefined;
            const incomingAgentLabel = data.selectedAgentLabel as
                | string
                | undefined;

            if (incomingAgentId) {
                setSelectedAgentId(incomingAgentId);
            }

            if (incomingAgentLabel) {
                setSelectedAgentLabel(incomingAgentLabel);
            }

            if (data.needsClarification && data.pendingQuestion) {
                setPendingQuestion(data.pendingQuestion);
            } else {
                setPendingQuestion(null);
            }

            if (
                typeof data.lastResolvedTopic === "string" &&
                data.lastResolvedTopic.trim()
            ) {
                setLastResolvedTopic(data.lastResolvedTopic.trim());
            }

            if (typeof data.contextSummary === "string") {
                setContextSummary(data.contextSummary);
            }

            const botMsg: Message = {
                role: "model",
                text: data.text || "Sorry, I couldn't generate a response.",
                thought: data.thought || previewThought || undefined,
                isStreaming: false,
                citations: data.citations ?? [],
                sourceMode: data.sourceMode ?? "none",
                storeDisplayName: data.storeDisplayName ?? "",
                selectedAgentId: data.selectedAgentId ?? agentForThisRequest,
                selectedAgentLabel:
                    data.selectedAgentLabel ?? selectedAgentLabel,
                needsClarification: data.needsClarification ?? false,
                followUps: Array.isArray(data.followUps) ? data.followUps : [],
            };

            const shown = previewShown;
            setMessages((prev) => {
                if (shown && prev[previewIndex]) {
                    const next = [...prev];
                    next[previewIndex] = botMsg;
                    return next;
                }
                return [...prev, botMsg];
            });
        } catch (e: any) {
            const shown = previewShown;
            const errorMsg: Message = {
                role: "model",
                text: `Error: ${e.message}`,
                citations: [],
                sourceMode: "none",
                storeDisplayName: "",
                selectedAgentId,
                selectedAgentLabel,
            };
            // Replace any half-written preview rather than leaving it above the error.
            setMessages((prev) => {
                if (shown && prev[previewIndex]) {
                    const next = [...prev];
                    next[previewIndex] = errorMsg;
                    return next;
                }
                return [...prev, errorMsg];
            });
        } finally {
            if (drain !== undefined) window.clearInterval(drain);
            setLoading(false);
            setStages([]);
        }
    };

    const lastIndex = messages.length - 1;
    const showWelcome = messages.length === 1 && !loading;
    const sourceText = (mode?: string) => (mode && t.sources[mode]) || "";

    return (
        <MotionConfig reducedMotion="user">
        <div className="flex h-[100dvh] flex-col bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            {/* Soft colour behind the glass header */}
            <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-gradient-to-b from-indigo-100/70 via-sky-50/40 to-transparent dark:from-indigo-950/40 dark:via-zinc-950/0" />

            <header className="sticky top-0 z-40 border-b border-white/60 bg-white/60 px-4 py-2.5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/5 dark:bg-zinc-950/60">
                <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <img src="/TARo.png" alt="UTARCHAT" className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-sm ring-1 ring-black/5 dark:ring-white/10" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-[15px] font-semibold tracking-tight">UTARCHAT</p>
                                <span className="rounded-full bg-zinc-900/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 ring-1 ring-inset ring-zinc-900/10 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10">
                                    Beta
                                </span>
                            </div>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{t.tagline}</p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {!showWelcome && (
                            <span className="hidden sm:inline-flex">
                                <AgentBadge agentId={selectedAgentId} label={selectedAgentLabel} size="xs" />
                            </span>
                        )}
                        {/* Language switch */}
                        <div role="radiogroup" aria-label="Language" className="flex rounded-full bg-zinc-900/5 p-0.5 ring-1 ring-inset ring-zinc-900/5 dark:bg-white/10 dark:ring-white/10">
                            {LANGS.map((l) => (
                                <button
                                    key={l.id}
                                    role="radio"
                                    aria-checked={lang === l.id}
                                    onClick={() => chooseLang(l.id)}
                                    className={`relative rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                                        lang === l.id ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                                    }`}
                                >
                                    {lang === l.id && (
                                        <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-zinc-700" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                                    )}
                                    <span className="relative">{l.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            <main ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain">
                <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
                    {showWelcome && (
                        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="pt-6 text-center sm:pt-12">
                            <motion.img
                                src="/TARo.png"
                                alt=""
                                className="mx-auto h-20 w-20 rounded-[22px] object-contain shadow-lg shadow-indigo-500/10 ring-1 ring-black/5 dark:ring-white/10"
                                initial={{ scale: 0.85, rotate: -6 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 220, damping: 14 }}
                            />
                            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{t.greetingTitle}</h1>
                            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{t.greetingBody}</p>

                            <p className="mt-8 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t.startersTitle}</p>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
                                {t.starters.map((st, n) => (
                                    <motion.button
                                        key={st.text}
                                        onClick={() => handleSend(st.text)}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.12 + n * 0.05 }}
                                        whileTap={{ scale: 0.98 }}
                                        className="group flex min-h-[52px] items-center gap-3 rounded-2xl text-left border border-zinc-200/80 bg-white/80 px-4 py-3 text-sm text-zinc-700 shadow-sm backdrop-blur transition hover:border-indigo-200 hover:bg-white hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-indigo-400/30 dark:hover:bg-white/10 dark:hover:text-white"
                                    >
                                        <span className="text-lg" aria-hidden>
                                            {st.emoji}
                                        </span>
                                        <span className="flex-1">{st.text}</span>
                                        <ArrowUpRight className="h-4 w-4 text-zinc-300 transition group-hover:text-indigo-500 dark:text-zinc-600" />
                                    </motion.button>
                                ))}
                            </div>
                        </motion.section>
                    )}

                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => {
                            if (i === 0) return null; // the welcome screen replaces the greeting bubble
                            const isUser = msg.role === "user";
                            return (
                                <motion.div
                                    key={i}
                                    id={`msg-container-${i}`}
                                    layout="position"
                                    initial={{ opacity: 0, y: 10, scale: 0.99 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                                >
                                    <div className={isUser ? "min-w-0 max-w-[85%]" : "min-w-0 w-full max-w-[95%] sm:max-w-[88%]"}>
                                        <div
                                            className={
                                                isUser
                                                    ? "rounded-3xl rounded-br-lg bg-gradient-to-br from-indigo-500 to-indigo-600 px-4 py-2.5 text-[15px] text-white shadow-md shadow-indigo-500/20"
                                                    : "rounded-3xl rounded-bl-lg border border-zinc-200/80 bg-white px-4 py-3.5 shadow-sm dark:border-white/10 dark:bg-zinc-900"
                                            }
                                        >
                                            {isUser ? <p className="whitespace-pre-wrap">{msg.text}</p> : <AnswerBody text={msg.text} />}

                                            {!isUser && !msg.isStreaming && msg.selectedAgentLabel && (
                                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 dark:border-white/5">
                                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                        <span>{t.answeredBy}</span>
                                                        <AgentBadge agentId={msg.selectedAgentId} label={msg.selectedAgentLabel} size="xs" />
                                                        {sourceText(msg.sourceMode) && <span className="text-zinc-400 dark:text-zinc-500">· {sourceText(msg.sourceMode)}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleOpenFeedback(i, msg, "like")}
                                                            aria-label={t.helpful}
                                                            title={t.helpful}
                                                            className={`rounded-full p-2 transition ${
                                                                feedbackGiven[i] === "like"
                                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                                                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                                                            }`}
                                                        >
                                                            <ThumbsUp className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleOpenFeedback(i, msg, "dislike")}
                                                            aria-label={t.report}
                                                            title={t.report}
                                                            className={`rounded-full p-2 transition ${
                                                                feedbackGiven[i] === "dislike"
                                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                                                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                                                            }`}
                                                        >
                                                            <ThumbsDown className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Suggested next questions, under the latest answer only */}
                                        {!isUser && i === lastIndex && !loading && (msg.followUps?.length ?? 0) > 0 && (
                                            <div className="mt-2.5 flex flex-wrap gap-2">
                                                {msg.followUps!.map((q, n) => (
                                                    <motion.button
                                                        key={q}
                                                        onClick={() => handleSend(q)}
                                                        initial={{ opacity: 0, y: 6 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 0.15 + n * 0.07 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-indigo-200/80 bg-white/80 px-3.5 py-2 text-left text-[13px] text-indigo-700 shadow-sm backdrop-blur transition hover:bg-indigo-50 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
                                                    >
                                                        {q}
                                                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                                    </motion.button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>

                    {/* Thinking timeline: the steps the server actually takes */}
                    {loading && !messages.some((m) => m.isStreaming) && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                            <div className="rounded-3xl rounded-bl-lg border border-zinc-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/80">
                                <ol className="space-y-1.5">
                                    {stages.map((st, n) => {
                                        const current = n === stages.length - 1;
                                        const label = t.stages[st.stage] || st.text || t.stages.analyzing;
                                        return (
                                            <motion.li key={st.stage} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-[13px]">
                                                {current ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                                )}
                                                <span className={current ? "font-medium text-zinc-800 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"}>
                                                    {label}
                                                    {current && <span className="animate-pulse">…</span>}
                                                </span>
                                            </motion.li>
                                        );
                                    })}
                                </ol>
                            </div>
                        </motion.div>
                    )}

                    <div ref={bottomRef} className="h-1" />
                </div>
            </main>

            <footer className="sticky bottom-0 z-30 border-t border-white/60 bg-slate-50/80 px-3 pt-3 backdrop-blur-xl pb-safe dark:border-white/5 dark:bg-zinc-950/80">
                <div className="mx-auto w-full max-w-3xl">
                    {pendingQuestion && (
                        <div className="mb-2 rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                            {t.waitingFor} <span className="font-medium">{pendingQuestion}</span>
                        </div>
                    )}

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="flex items-end gap-2 rounded-[26px] border border-zinc-200 bg-white p-1.5 pl-4 shadow-sm transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900 dark:focus-within:border-indigo-400/40"
                    >
                        <textarea
                            ref={inputRef}
                            rows={1}
                            enterKeyHint="send"
                            aria-label={t.placeholder}
                            className="max-h-[140px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-base leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:text-[15px]"
                            placeholder={t.placeholder}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onFocus={() => setTimeout(() => scrollToBottom(false), 250)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={loading}
                        />
                        <motion.button
                            type="submit"
                            whileTap={{ scale: 0.9 }}
                            disabled={loading || !input.trim()}
                            aria-label={t.send}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25 transition disabled:from-zinc-200 disabled:to-zinc-200 disabled:text-zinc-400 disabled:shadow-none dark:disabled:from-zinc-800 dark:disabled:to-zinc-800 dark:disabled:text-zinc-500"
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" strokeWidth={2.5} />}
                        </motion.button>
                    </form>
                    <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">{t.footer}</p>
                </div>
            </footer>

            <DisclaimerModal lang={lang} />
            <FeedbackModal
                isOpen={feedbackModal.isOpen}
                onClose={() => setFeedbackModal((prev) => ({ ...prev, isOpen: false }))}
                rating={feedbackModal.rating}
                userQuery={feedbackModal.userQuery}
                responseText={feedbackModal.responseText}
                selectedAgentId={feedbackModal.selectedAgentId}
                selectedAgentLabel={feedbackModal.selectedAgentLabel}
                storeDisplayName={feedbackModal.storeDisplayName}
                sourceMode={feedbackModal.sourceMode}
                citations={feedbackModal.citations}
                screenshotBase64={feedbackModal.screenshotBase64}
                onSubmitSuccess={() => {
                    if (feedbackModal.msgIndex !== undefined) {
                        setFeedbackGiven((prev) => ({
                            ...prev,
                            [feedbackModal.msgIndex!]: feedbackModal.rating,
                        }));
                    }
                }}
            />
        </div>
        </MotionConfig>
    );
}
