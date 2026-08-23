"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    Send,
    Loader2,
    ThumbsUp,
    ThumbsDown,
    Brain,
    ChevronDown,
    Sparkles,
    Compass,
    Database,
    Globe,
    Users,
} from "lucide-react";
import html2canvas from "html2canvas";
import DisclaimerModal from "./DisclaimerModal";
import FeedbackModal from "./FeedbackModal";

type Role = "user" | "model";
type AgentId = string;

function renderStatusIcon(stage?: string) {
    switch (stage) {
        case "analyzing":
            return <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />;
        case "routing":
        case "agent_selected":
            return <Compass className="w-3.5 h-3.5 text-indigo-600 animate-spin" />;
        case "searching":
            return <Database className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />;
        case "webFallback":
            return <Globe className="w-3.5 h-3.5 text-blue-600 animate-pulse" />;
        case "staffDirectory":
            return <Users className="w-3.5 h-3.5 text-amber-600 animate-pulse" />;
        case "reasoning":
            return <Brain className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />;
        default:
            return <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />;
    }
}

interface Message {
    role: Role;
    text: string;
    thought?: string;
    isStreaming?: boolean;
    citations?: string[];
    sourceMode?: "fileSearch" | "webFallback" | "staffDirectory" | "none";
    storeDisplayName?: string;
    selectedAgentId?: AgentId;
    selectedAgentLabel?: string;
    needsClarification?: boolean;
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

function sourceLabel(sourceMode?: string): string {
    if (sourceMode === "fileSearch") return "KB";
    if (sourceMode === "webFallback") return "Web";
    if (sourceMode === "staffDirectory") return "Staff Directory";
    return "None";
}

function sourceBadgeClass(sourceMode?: string): string {
    if (sourceMode === "fileSearch") {
        return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    }

    if (sourceMode === "webFallback") {
        return "bg-blue-50 text-blue-700 border border-blue-100";
    }

    if (sourceMode === "staffDirectory") {
        return "bg-amber-50 text-amber-700 border border-amber-100";
    }

    return "bg-zinc-50 text-zinc-500 border border-zinc-100";
}

export default function ChatClient() {
    const [messages, setMessages] = useState<Message[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<{ stage: string; text: string } | null>(null);

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
    const [expandedThoughts, setExpandedThoughts] = useState<Record<number, boolean>>({});

    const toggleThought = (index: number) => {
        setExpandedThoughts((prev) => ({
            ...prev,
            [index]: !prev[index],
        }));
    };

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
                wrapper.style.backgroundColor = "#ffffff";
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
                    backgroundColor: "#ffffff",
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

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const buildHistory = (msgs: Message[]): HistoryEntry[] =>
        msgs
            .filter((m) => m !== WELCOME)
            .map((m) => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));

    const handleSend = async () => {
        const trimmed = input.trim();

        if (!trimmed || loading) return;

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
                const thought = shownThought;
                const shown = previewShown;
                previewShown = true;
                setMessages((prev) => {
                    const next = [...prev];
                    const bubble: Message = {
                        role: "model",
                        text,
                        thought: thought || undefined,
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
                } else if (frame.type === "thought") {
                    setCurrentStatus({ stage: "reasoning", text: "Synthesizing verified answer..." });
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
        }
    };

    return (
        <div className="flex flex-col min-h-[100dvh] bg-[#FDFDFD]">
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-zinc-100/80 shadow-xs px-4 py-3">
                <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <img
                            src="/TARo.png"
                            alt="UTARCHAT Logo"
                            className="w-12 h-12 object-contain"
                        />

                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-zinc-900">
                                    UTARCHAT
                                </p>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 rounded-full uppercase tracking-wider">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                    Limited Beta
                                </span>
                            </div>
                            <p className="text-xs text-zinc-400">
                                Ask naturally. I’ll route your question to the right place.
                            </p>
                        </div>
                    </div>

                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[11px] text-zinc-400">
                            Current context
                        </span>
                        <span className="text-xs font-medium text-zinc-700">
                            {selectedAgentLabel}
                        </span>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-6 space-y-5 max-w-2xl mx-auto w-full">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        id={`msg-container-${i}`}
                        className={`flex p-1 rounded-xl transition-colors ${msg.role === "user"
                            ? "justify-end"
                            : "justify-start"
                            }`}
                    >
                        <div
                            className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user"
                                ? "bg-[#1a1845] text-white rounded-br-sm"
                                : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm shadow-sm"
                                }`}
                        >
                            {msg.role === "model" ? (
                                <div>
                                    {msg.isStreaming && currentStatus && !msg.text && (
                                        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50/90 border border-indigo-100 text-xs font-medium text-indigo-900 shadow-xs animate-pulse">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                {renderStatusIcon(currentStatus.stage)}
                                                <span>{currentStatus.text}</span>
                                            </span>
                                        </div>
                                    )}

                                    {msg.thought && (
                                        <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/40 text-xs overflow-hidden transition-all duration-200">
                                            <button
                                                type="button"
                                                onClick={() => toggleThought(i)}
                                                className="w-full flex items-center justify-between px-3 py-2 text-left font-medium text-indigo-900/90 hover:bg-indigo-100/50 transition-colors"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <Brain className={`w-3.5 h-3.5 text-indigo-600 ${msg.isStreaming && !msg.text ? "animate-pulse" : ""}`} />
                                                    <span>{msg.isStreaming && !msg.text ? "Thinking..." : "Thought Process"}</span>
                                                </span>
                                                <ChevronDown
                                                    className={`w-3.5 h-3.5 text-indigo-500 transition-transform duration-200 ${
                                                        (expandedThoughts[i] ?? Boolean(msg.isStreaming && !msg.text)) ? "rotate-180" : ""
                                                    }`}
                                                />
                                            </button>
                                            {(expandedThoughts[i] ?? Boolean(msg.isStreaming && !msg.text)) && (
                                                <div className="px-3 pb-3 pt-1 text-zinc-600 font-mono text-[11px] leading-relaxed whitespace-pre-wrap border-t border-indigo-100/60 max-h-64 overflow-y-auto">
                                                    {msg.thought}
                                                    {msg.isStreaming && !msg.text && (
                                                        <span className="inline-block w-1.5 h-3 ml-1 bg-indigo-500 animate-pulse align-middle" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div
                                        className="
                                            prose prose-sm prose-zinc max-w-none leading-relaxed
                                            prose-headings:mt-5 prose-headings:mb-2 prose-headings:font-semibold
                                            prose-p:my-3
                                            prose-ul:my-3 prose-ol:my-3 prose-li:my-1.5
                                            prose-a:text-blue-600 prose-a:underline prose-a:font-medium hover:prose-a:text-blue-800
                                            prose-strong:text-zinc-900
                                            prose-hr:my-4
                                        "
                                    >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            a: ({ href, children }) => (
                                                <a
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 underline font-medium hover:text-blue-800 break-words"
                                                >
                                                    {children} ↗
                                                </a>
                                            ),
                                            p: ({ children }) => (
                                                <p className="my-3 leading-relaxed">
                                                    {children}
                                                </p>
                                            ),
                                            h3: ({ children }) => (
                                                <h3 className="mt-5 mb-2 text-sm font-semibold text-zinc-900">
                                                    {children}
                                                </h3>
                                            ),
                                            ul: ({ children }) => (
                                                <ul className="my-3 list-disc pl-5 space-y-1.5">
                                                    {children}
                                                </ul>
                                            ),
                                            ol: ({ children }) => (
                                                <ol className="my-3 list-decimal pl-5 space-y-1.5">
                                                    {children}
                                                </ol>
                                            ),
                                            blockquote: ({ children }) => (
                                                <blockquote className="border-l-4 border-zinc-200 pl-3 italic text-zinc-600">
                                                    {children}
                                                </blockquote>
                                            ),
                                        }}
                                    >
                                        {msg.text}
                                    </ReactMarkdown>
                                    </div>
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            )}

                            {msg.role === "model" &&
                                i !== 0 &&
                                msg.selectedAgentLabel && (
                                    <div className="mt-3 pt-2 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-1.5">
                                        <div className="flex flex-wrap gap-1.5 items-center">
                                            <span className="inline-flex items-center text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full">
                                                Answered by {msg.selectedAgentLabel}
                                            </span>

                                            <span
                                                className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full ${sourceBadgeClass(
                                                    msg.sourceMode
                                                )}`}
                                            >
                                                Source: {sourceLabel(msg.sourceMode)}
                                            </span>

                                            {msg.storeDisplayName && (
                                                <span className="inline-flex items-center text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full">
                                                    Store: {msg.storeDisplayName}
                                                </span>
                                            )}
                                        </div>

                                        {/* Feedback Thumbs Buttons */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleOpenFeedback(i, msg, "like")}
                                                className={`p-1.5 rounded-lg border transition-colors ${
                                                    feedbackGiven[i] === "like"
                                                        ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                                        : "bg-zinc-50 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 border-zinc-200"
                                                }`}
                                                title="Helpful Response"
                                            >
                                                <ThumbsUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleOpenFeedback(i, msg, "dislike")}
                                                className={`p-1.5 rounded-lg border transition-colors ${
                                                    feedbackGiven[i] === "dislike"
                                                        ? "bg-amber-100 text-amber-700 border-amber-300"
                                                        : "bg-zinc-50 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 border-zinc-200"
                                                }`}
                                                title="Report Issue / Inaccurate Response"
                                            >
                                                <ThumbsDown className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                ))}

                {loading && !messages.some((m) => m.isStreaming) && (
                    <div className="flex justify-start">
                        <div className="bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/80 border border-indigo-100/90 rounded-2xl rounded-bl-sm px-4 py-3 shadow-xs flex items-center gap-2.5 transition-all">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                            </span>
                            <div className="flex items-center gap-1.5 text-xs text-indigo-950 font-medium">
                                {renderStatusIcon(currentStatus?.stage)}
                                <span>{currentStatus?.text || "Analyzing your question..."}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </main>

            <footer className="border-t border-zinc-100 px-4 py-3 max-w-2xl mx-auto w-full bg-[#FDFDFD]">
                {pendingQuestion && (
                    <div className="mb-2 text-[11px] text-zinc-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        Waiting for clarification on:{" "}
                        <span className="font-medium">{pendingQuestion}</span>
                    </div>
                )}

                <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2 focus-within:border-zinc-400 transition-colors">
                    <input
                        className="flex-1 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
                        placeholder="Ask about UTAR courses, fees, exams, offices, support..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={loading}
                    />

                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-900 text-white disabled:opacity-40 active:scale-95 transition-transform"
                    >
                        {loading ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Send size={12} />
                        )}
                    </button>
                </div>
                <div className="mt-2 text-center text-[11px] text-zinc-400">
                    UTARCHAT (Limited Beta) can make mistake. Check important info
                </div>
            </footer>
            <DisclaimerModal />
            <FeedbackModal
                isOpen={feedbackModal.isOpen}
                onClose={() =>
                    setFeedbackModal((prev) => ({ ...prev, isOpen: false }))
                }
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
    );
}