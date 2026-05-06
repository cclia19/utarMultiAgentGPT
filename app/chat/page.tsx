"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, MessageSquare } from "lucide-react";

type Role = "user" | "model";
type AgentId = string;

interface Message {
    role: Role;
    text: string;
    citations?: string[];
    sourceMode?: "fileSearch" | "webFallback" | "none";
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
    text: "Hi! I'm the UTAR AI Assistant. Ask me anything about UTAR — courses, admissions, fees, contacts, student support, and more. 😊",
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
        dfn: "dfn",
        dea: "dea",
        dace: "dace",
        oia: "oia",
        library: "library",
    };

    return map[normalized] || null;
}

function sourceLabel(sourceMode?: string): string {
    if (sourceMode === "fileSearch") return "KB";
    if (sourceMode === "webFallback") return "Web";
    return "None";
}

function sourceBadgeClass(sourceMode?: string): string {
    if (sourceMode === "fileSearch") {
        return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    }

    if (sourceMode === "webFallback") {
        return "bg-blue-50 text-blue-700 border border-blue-100";
    }

    return "bg-zinc-50 text-zinc-500 border border-zinc-100";
}

function getAgentLabelForUserBubble(agentLabel: string): string {
    return agentLabel || "UTAR Assistant";
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    const [selectedAgentId, setSelectedAgentId] = useState<AgentId>("general");
    const [selectedAgentLabel, setSelectedAgentLabel] = useState(
        "General UTAR Assistant"
    );

    const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
    const [lastResolvedTopic, setLastResolvedTopic] = useState<string | null>(
        null
    );

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
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Request failed");
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

            const botMsg: Message = {
                role: "model",
                text: data.text || "Sorry, I couldn't generate a response.",
                citations: data.citations ?? [],
                sourceMode: data.sourceMode ?? "none",
                storeDisplayName: data.storeDisplayName ?? "",
                selectedAgentId: data.selectedAgentId ?? agentForThisRequest,
                selectedAgentLabel:
                    data.selectedAgentLabel ?? selectedAgentLabel,
                needsClarification: data.needsClarification ?? false,
            };

            setMessages((prev) => [...prev, botMsg]);
        } catch (e: any) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "model",
                    text: `Error: ${e.message}`,
                    citations: [],
                    sourceMode: "none",
                    storeDisplayName: "",
                    selectedAgentId,
                    selectedAgentLabel,
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col min-h-[100dvh] bg-[#FDFDFD]">
            <header className="border-b border-zinc-100 px-4 py-3 bg-white">
                <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
                            <MessageSquare size={14} className="text-white" />
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-zinc-900">
                                UTAR AI Assistant
                            </p>
                            <p className="text-xs text-zinc-400">
                                Ask naturally. I’ll route your question to the right UTAR context.
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

            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 max-w-2xl mx-auto w-full">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${
                            msg.role === "user"
                                ? "justify-end"
                                : "justify-start"
                        }`}
                    >
                        <div
                            className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                                msg.role === "user"
                                    ? "bg-zinc-900 text-white rounded-br-sm"
                                    : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm shadow-sm"
                            }`}
                        >
                            {msg.role === "model" ? (
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
                            ) : (
                                <div>
                                    <p className="whitespace-pre-wrap">
                                        {msg.text}
                                    </p>

                                    <p className="mt-2 text-[10px] text-zinc-400">
                                        Sent to{" "}
                                        {getAgentLabelForUserBubble(
                                            selectedAgentLabel
                                        )}
                                    </p>
                                </div>
                            )}

                            {msg.role === "model" &&
                                i !== 0 &&
                                msg.selectedAgentLabel && (
                                    <div className="mt-3 pt-2 border-t border-zinc-100 flex flex-wrap gap-1.5">
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
                                )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-zinc-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                            <Loader2
                                size={14}
                                className="animate-spin text-zinc-400"
                            />
                            <span className="text-xs text-zinc-400">
                                Thinking...
                            </span>
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <div className="border-t border-zinc-100 px-4 py-3 max-w-2xl mx-auto w-full bg-[#FDFDFD]">
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
            </div>
        </div>
    );
}