"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import AnswerBody, { splitAnswer } from "./AnswerBody";
import AgentBadge from "./AgentBadge";
import ThinkingLine, { type ThinkingStep } from "./ThinkingLine";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Copy, ExternalLink, FileText, Loader2, Pencil, RotateCcw, SquarePen, ThumbsUp, ThumbsDown } from "lucide-react";
import html2canvas from "html2canvas";
import WelcomeSplash from "./WelcomeSplash";
import FeedbackModal from "./FeedbackModal";
import { LANGS, STRINGS, defaultLang, type Lang } from "@/lib/i18n";

const LANG_KEY = "utarchat_lang";

// Anonymous per-browser ID for usage stats (no login). Random, holds no personal data.
const SESSION_KEY = "utarchat_anon_id";

// Kept in step with the server's abuse limits (lib/abuse/config.ts). The server
// enforces them; these only stop a normal long chat from being refused.
const MAX_MESSAGE_CHARS = 1000;
const HISTORY_TURNS = 6;
const HISTORY_CHARS = 6000;
// The server refuses bodies over 16 KB; Chinese text is 3 bytes a character.
const HISTORY_BYTES = 9000;
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
    /** The answer is a failure the student can retry ("temporarily unavailable", timeout, no connection). */
    failed?: boolean;
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

// The conversation is kept for this browser tab only (cleared when the tab closes).
const CHAT_KEY = "utarchat_chat_v1";
const STARTERS_SHOWN = 6;
const TOAST_MS = 5000;

/** Answer as plain text for copying: no markdown symbols, links as "label (url)". */
function toPlainText(md: string): string {
    return md
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
        .replace(/^\s*[-*]\s+/gm, "• ")
        .replace(/^>\s?/gm, "")
        .replace(/`/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** Citation -> chip: official links open in a new tab; document names are labels. */
function sourceChip(citation: string): { label: string; href?: string } {
    if (/^https?:\/\//i.test(citation)) {
        try {
            const url = new URL(citation);
            const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "").replace(/\.(php|html?|aspx?)$/i, "");
            const host = url.hostname.replace(/^www\./, "");
            const label = last ? `${host} · ${last.replace(/[-_]+/g, " ")}` : host;
            return { label: label.length > 48 ? label.slice(0, 47) + "…" : label, href: url.href };
        } catch {
            return { label: citation.slice(0, 48) };
        }
    }
    const title = citation.replace(/\.(pdf|docx?|md|txt|html?)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    return { label: title.length > 48 ? title.slice(0, 47) + "…" : title };
}

function pickStarters<T>(pool: T[], n: number): T[] {
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

export default function ChatClient() {
    const [messages, setMessages] = useState<Message[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    // Steps the server reported for the current question, shown as a timeline.
    // The thinking line: the current step, and the office it is working with (kept across steps).
    const [thinking, setThinking] = useState<ThinkingStep | null>(null);
    const [thinkingOffice, setThinkingOffice] = useState<ThinkingStep | null>(null);
    // Steps that arrive together (office chosen, then searching) would flash by,
    // so each one stays on screen for a moment. Never delays the answer itself.
    const stepQueue = useRef<ThinkingStep[]>([]);
    const stepTimer = useRef<number | undefined>(undefined);
    const STEP_MIN_MS = 700;
    const showNextStep = useCallback(() => {
        const next = stepQueue.current.shift();
        if (!next) {
            stepTimer.current = undefined;
            return;
        }
        setThinking(next);
        if (next.agentId && next.agentId !== "general") setThinkingOffice(next);
        stepTimer.current = window.setTimeout(showNextStep, STEP_MIN_MS);
    }, []);
    const queueStep = useCallback(
        (step: ThinkingStep) => {
            stepQueue.current.push(step);
            if (stepTimer.current === undefined) showNextStep();
        },
        [showNextStep]
    );
    const clearSteps = useCallback(() => {
        stepQueue.current = [];
        if (stepTimer.current !== undefined) window.clearTimeout(stepTimer.current);
        stepTimer.current = undefined;
    }, []);

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

    // Follow new messages only while the student is at the bottom (or just sent
    // something). Reading an earlier answer is never interrupted: a "jump to
    // latest" button appears instead.
    const atBottomRef = useRef(true);
    const followNextRef = useRef(false);
    const [showJump, setShowJump] = useState(false);
    const [hasNew, setHasNew] = useState(false);
    const onMainScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        atBottomRef.current = atBottom;
        setShowJump(!atBottom);
        if (atBottom) setHasNew(false);
    }, []);
    const jumpToLatest = () => {
        followNextRef.current = true;
        setHasNew(false);
        scrollToBottom();
    };

    useEffect(() => {
        // The welcome screen stays at the top; scroll only once a chat starts.
        if (!(messages.length > 1 || loading)) return;
        if (atBottomRef.current || followNextRef.current) {
            scrollToBottom();
            followNextRef.current = false;
        } else if (messages[messages.length - 1]?.role === "model") {
            setHasNew(true);
        }
    }, [messages, loading, thinking, scrollToBottom]);

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

    // Small toast above the input (new chat started · Undo, Copied, …).
    const [toast, setToast] = useState<{ id: number; text: string; action?: { label: string; run: () => void } } | null>(null);
    const toastTimer = useRef<number | undefined>(undefined);
    const showToast = useCallback((text: string, action?: { label: string; run: () => void }) => {
        if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
        setToast({ id: Date.now(), text, action });
        toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
    }, []);

    // Starter questions: 6 picked at random from the language's pool on each visit.
    const [starters, setStarters] = useState(() => t.starters.slice(0, STARTERS_SHOWN));
    useEffect(() => {
        setStarters(pickStarters(STRINGS[lang].starters, STARTERS_SHOWN));
    }, [lang]);

    // Keep the chat across a refresh, for this tab only.
    const [restored, setRestored] = useState(false);
    useEffect(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) || "null");
            if (saved && Array.isArray(saved.messages) && saved.messages.length > 0) {
                setMessages([WELCOME, ...saved.messages]);
                if (saved.selectedAgentId) setSelectedAgentId(saved.selectedAgentId);
                if (saved.selectedAgentLabel) setSelectedAgentLabel(saved.selectedAgentLabel);
                setPendingQuestion(saved.pendingQuestion ?? null);
                setLastResolvedTopic(saved.lastResolvedTopic ?? null);
                setContextSummary(saved.contextSummary ?? "");
                setFeedbackGiven(saved.feedbackGiven ?? {});
            }
        } catch {
            // nothing saved, or storage blocked
        }
        setRestored(true);
    }, []);
    useEffect(() => {
        if (!restored || loading) return;
        try {
            const kept = messages.slice(1).slice(-40).map(({ thought, isStreaming, ...m }) => m);
            if (kept.length === 0) sessionStorage.removeItem(CHAT_KEY);
            else sessionStorage.setItem(CHAT_KEY, JSON.stringify({ messages: kept, selectedAgentId, selectedAgentLabel, pendingQuestion, lastResolvedTopic, contextSummary, feedbackGiven }));
        } catch {
            // storage full or blocked: the chat just won't survive a refresh
        }
    }, [restored, loading, messages, selectedAgentId, selectedAgentLabel, pendingQuestion, lastResolvedTopic, contextSummary, feedbackGiven]);

    // Each send gets a number; a newer chat ignores answers to an older one.
    const chatGen = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    /** New chat (header button or logo). Undo brings the old one back for a few seconds. */
    const newChat = () => {
        if (messages.length <= 1 && !loading) {
            inputRef.current?.focus();
            return;
        }
        chatGen.current += 1;
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
        clearSteps();
        setThinking(null);
        setThinkingOffice(null);
        // An unanswered question that was still loading is dropped from the undo copy.
        const kept = loading && messages[messages.length - 1]?.role === "user" ? messages.slice(0, -1) : messages;
        const snapshot = { messages: kept, selectedAgentId, selectedAgentLabel, pendingQuestion, lastResolvedTopic, contextSummary, feedbackGiven };
        setMessages([WELCOME]);
        setSelectedAgentId("general");
        setSelectedAgentLabel("General UTAR Assistant");
        setPendingQuestion(null);
        setLastResolvedTopic(null);
        setContextSummary("");
        setFeedbackGiven({});
        setInput("");
        setStarters(pickStarters(t.starters, STARTERS_SHOWN));
        scrollRef.current?.scrollTo({ top: 0 });
        showToast(t.ui.newChatStarted, {
            label: t.ui.undo,
            run: () => {
                setMessages(snapshot.messages);
                setSelectedAgentId(snapshot.selectedAgentId);
                setSelectedAgentLabel(snapshot.selectedAgentLabel);
                setPendingQuestion(snapshot.pendingQuestion);
                setLastResolvedTopic(snapshot.lastResolvedTopic);
                setContextSummary(snapshot.contextSummary);
                setFeedbackGiven(snapshot.feedbackGiven);
                followNextRef.current = true;
            },
        });
    };

    const copyAnswer = async (msg: Message) => {
        const text = toPlainText(msg.text);
        try {
            await navigator.clipboard.writeText(text);
            showToast(t.ui.copied);
        } catch {
            try {
                const area = document.createElement("textarea");
                area.value = text;
                area.style.position = "fixed";
                area.style.opacity = "0";
                document.body.appendChild(area);
                area.select();
                const ok = document.execCommand("copy");
                document.body.removeChild(area);
                showToast(ok ? t.ui.copied : t.ui.copyFailed);
            } catch {
                showToast(t.ui.copyFailed);
            }
        }
    };

    /** Ask the question behind a failed answer again. */
    const retryAnswer = (index: number) => {
        const question = messages[index - 1];
        if (loading || question?.role !== "user") return;
        handleSend(question.text, messages.slice(0, index - 1));
    };

    /** Put the last question back in the box to fix and resend (its answer is removed). */
    const editQuestion = (index: number) => {
        if (loading || messages[index]?.role !== "user") return;
        const snapshot = messages;
        setInput(messages[index].text);
        setMessages(messages.slice(0, index));
        window.setTimeout(() => inputRef.current?.focus(), 50);
        showToast(t.ui.editing, {
            label: t.ui.undo,
            run: () => {
                setMessages(snapshot);
                setInput("");
            },
        });
    };

    /** The last few messages, newest first in priority, within the size the server accepts. */
    const buildHistory = (msgs: Message[]): HistoryEntry[] => {
        const encoder = new TextEncoder();
        const recent = msgs.filter((m) => m !== WELCOME).slice(-HISTORY_TURNS);
        const out: HistoryEntry[] = [];
        let chars = HISTORY_CHARS;
        let bytes = HISTORY_BYTES;
        for (let i = recent.length - 1; i >= 0 && chars > 0 && bytes > 0; i--) {
            let text = recent[i].text.slice(0, chars);
            while (text && encoder.encode(text).length > bytes) text = text.slice(0, Math.floor(text.length * 0.8));
            chars -= text.length;
            bytes -= encoder.encode(text).length;
            out.unshift({ role: recent[i].role, parts: [{ text }] });
        }
        return out;
    };

    const handleSend = async (override?: string, base?: Message[]) => {
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

        const baseMessages = base ?? messages;
        const nextMessages = [...baseMessages, userMsg];
        const gen = ++chatGen.current;
        const controller = new AbortController();
        abortRef.current = controller;
        followNextRef.current = true;

        setMessages(nextMessages);
        setInput("");
        setLoading(true);
        // A follow-up starts as "Following up with <office>"; the server may move it on.
        const isFollowUp = baseMessages.some((m) => m.role === "model" && m !== WELCOME);
        const lastOffice = selectedAgentId && selectedAgentId !== "general" ? { stage: "followUp", agentId: selectedAgentId, agentLabel: selectedAgentLabel } : null;
        clearSteps();
        setThinkingOffice(null);
        queueStep(isFollowUp ? lastOffice ?? { stage: "followUp" } : { stage: "analyzing" });

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                signal: controller.signal,
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

            // NDJSON stream: "status" frames drive the thinking line; the trailing
            // "done" frame carries the answer. Partial "text" is not shown: answers
            // are laid out as cards and tiles, which only make sense complete.
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let previewThought = "";
            let answering = false;
            let data: any = null;
            let streamError = "";

            const handleFrame = (line: string) => {
                if (!line.trim()) return;
                let frame: any;
                try {
                    frame = JSON.parse(line);
                } catch {
                    return;
                }

                if (frame.type === "status") {
                    queueStep({ stage: frame.stage, agentId: frame.agentId, agentLabel: frame.agentLabel });
                } else if (frame.type === "thought") {
                    previewThought += frame.delta || "";
                } else if ((frame.type === "text" || frame.type === "replace") && !answering) {
                    answering = true;
                    queueStep({ stage: "reasoning" });
                } else if (frame.type === "done") {
                    data = frame;
                } else if (frame.type === "error") {
                    streamError = frame.message || "Stream failed";
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

            if (!data) {
                throw new Error(streamError || "Request failed");
            }
            // A new chat was started while this answer was on its way.
            if (gen !== chatGen.current) return;

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
                failed: Boolean(data.retryable),
            };

            setMessages((prev) => [...prev, botMsg]);
        } catch (e: any) {
            if (e?.name === "AbortError" || gen !== chatGen.current) return;
            const errorMsg: Message = {
                role: "model",
                text: t.ui.networkError,
                failed: true,
                citations: [],
                sourceMode: "none",
                storeDisplayName: "",
                selectedAgentId,
                selectedAgentLabel,
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            // Only the current chat's request may reset the loading state.
            if (gen === chatGen.current) {
                abortRef.current = null;
                setLoading(false);
                clearSteps();
                setThinking(null);
                setThinkingOffice(null);
            }
        }
    };

    const lastIndex = messages.length - 1;
    const lastUserIndex = messages.reduce((last, m, i) => (m.role === "user" ? i : last), -1);
    const showWelcome = messages.length === 1 && !loading && restored;
    const sourceText = (mode?: string) => (mode && t.sources[mode]) || "";

    return (
        <MotionConfig reducedMotion="user">
        <div className="flex h-[100dvh] flex-col bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            {/* Soft colour behind the glass header */}
            <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-gradient-to-b from-indigo-100/70 via-sky-50/40 to-transparent dark:from-indigo-950/40 dark:via-zinc-950/0" />

            <header className="sticky top-0 z-40 border-b border-white/60 bg-white/60 px-4 py-2.5 backdrop-blur-xl backdrop-saturate-150 dark:border-white/5 dark:bg-zinc-950/60">
                <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <button onClick={newChat} aria-label={t.ui.newChat} title={t.ui.newChat} className="shrink-0 rounded-xl transition active:scale-95">
                            <img src="/TARo.png" alt="UTARCHAT" className="h-10 w-10 rounded-xl object-contain shadow-sm ring-1 ring-black/5 dark:ring-white/10" />
                        </button>
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
                        <button
                            onClick={newChat}
                            aria-label={t.ui.newChat}
                            title={t.ui.newChat}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-900/5 hover:text-zinc-900 active:scale-95 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <SquarePen className="h-[18px] w-[18px]" />
                        </button>
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

            <main ref={scrollRef} onScroll={onMainScroll} className="relative flex-1 overflow-y-auto overscroll-contain">
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
                                {starters.map((st, n) => (
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

                                            {/* Sources, when the answer doesn't already list its official links */}
                                            {!isUser && !msg.failed && (msg.citations?.length ?? 0) > 0 && splitAnswer(msg.text).links.length === 0 && (
                                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                    <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t.ui.sources}</span>
                                                    {msg.citations!.slice(0, 3).map((c) => {
                                                        const chip = sourceChip(c);
                                                        const cls = "inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[12px] text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300";
                                                        return chip.href ? (
                                                            <a key={c} href={chip.href} target="_blank" rel="noopener noreferrer" className={`${cls} transition hover:border-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200`}>
                                                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                                                                <span className="truncate">{chip.label}</span>
                                                            </a>
                                                        ) : (
                                                            <span key={c} className={cls} title={c}>
                                                                <FileText className="h-3 w-3 shrink-0" aria-hidden />
                                                                <span className="truncate">{chip.label}</span>
                                                            </span>
                                                        );
                                                    })}
                                                    {msg.citations!.length > 3 && <span className="text-[12px] text-zinc-400">+{msg.citations!.length - 3}</span>}
                                                </div>
                                            )}

                                            {!isUser && !msg.isStreaming && msg.selectedAgentLabel && (
                                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 dark:border-white/5">
                                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                        <span>{t.answeredBy}</span>
                                                        <AgentBadge agentId={msg.selectedAgentId} label={msg.selectedAgentLabel} size="xs" />
                                                        {sourceText(msg.sourceMode) && <span className="text-zinc-400 dark:text-zinc-500">· {sourceText(msg.sourceMode)}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => copyAnswer(msg)}
                                                            aria-label={t.ui.copy}
                                                            title={t.ui.copy}
                                                            className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </button>
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

                                        {/* Try again, under a failed latest answer */}
                                        {!isUser && msg.failed && i === lastIndex && !loading && (
                                            <motion.button
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                whileTap={{ scale: 0.97 }}
                                                onClick={() => retryAnswer(i)}
                                                className="mt-2.5 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                {t.ui.tryAgain}
                                            </motion.button>
                                        )}

                                        {/* Edit the last question */}
                                        {isUser && i === lastUserIndex && !loading && (
                                            <div className="mt-1 flex justify-end">
                                                <button
                                                    onClick={() => editQuestion(i)}
                                                    aria-label={t.ui.edit}
                                                    title={t.ui.edit}
                                                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-zinc-400 transition hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                    {t.ui.edit}
                                                </button>
                                            </div>
                                        )}

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

                    {/* Thinking line: one step at a time, changing in place */}
                    {loading && thinking && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                            <div className="min-w-[240px] max-w-full rounded-3xl rounded-bl-lg border border-zinc-200/80 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/80">
                                <ThinkingLine step={thinking} office={thinkingOffice} stages={t.stages} />
                            </div>
                        </motion.div>
                    )}

                    <div ref={bottomRef} className="h-1" />
                </div>
            </main>

            <footer className="sticky bottom-0 z-30 border-t border-white/60 bg-slate-50/80 px-3 pt-3 backdrop-blur-xl pb-safe dark:border-white/5 dark:bg-zinc-950/80">
                <div className="relative mx-auto w-full max-w-3xl">
                    <div className="pointer-events-none absolute inset-x-0 bottom-full mb-3 flex flex-col items-center gap-2">
                        <AnimatePresence>
                            {showJump && messages.length > 1 && (
                                <motion.button
                                    key="jump"
                                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 8, scale: 0.9 }}
                                    onClick={jumpToLatest}
                                    aria-label={t.ui.jumpToLatest}
                                    className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white/90 px-3 text-[13px] font-medium text-zinc-700 shadow-md backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-zinc-800/90 dark:text-zinc-200"
                                >
                                    <ArrowDown className="h-4 w-4" />
                                    {hasNew && <span>{t.ui.newAnswer}</span>}
                                </motion.button>
                            )}
                            {toast && (
                                <motion.div
                                    key={toast.id}
                                    role="status"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-zinc-900 py-2 pl-4 pr-2 text-[13px] text-white shadow-lg dark:bg-white dark:text-zinc-900"
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        {toast.text === t.ui.copied && <Check className="h-3.5 w-3.5" />}
                                        {toast.text}
                                    </span>
                                    {toast.action ? (
                                        <button
                                            onClick={() => {
                                                toast.action!.run();
                                                setToast(null);
                                            }}
                                            className="rounded-full bg-white/15 px-3 py-1 font-semibold transition hover:bg-white/25 dark:bg-zinc-900/10 dark:hover:bg-zinc-900/20"
                                        >
                                            {toast.action.label}
                                        </button>
                                    ) : (
                                        <span className="w-1" />
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
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
                            maxLength={MAX_MESSAGE_CHARS}
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
                    {input.length > MAX_MESSAGE_CHARS * 0.8 ? (
                        <p className={`mt-2 text-center text-[11px] font-medium ${input.length >= MAX_MESSAGE_CHARS ? "text-rose-500" : "text-zinc-500 dark:text-zinc-400"}`} aria-live="polite">
                            {input.length.toLocaleString("en")} / {MAX_MESSAGE_CHARS.toLocaleString("en")}
                        </p>
                    ) : (
                        <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">{t.footer}</p>
                    )}
                </div>
            </footer>

            <WelcomeSplash lang={lang} onChooseLang={chooseLang} />
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
