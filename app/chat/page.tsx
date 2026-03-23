"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, BookOpen, MessageSquare } from "lucide-react";

type Role = "user" | "model";

interface Part {
    text: string;
}

interface HistoryEntry {
    role: Role;
    parts: Part[];
}

interface Message {
    role: Role;
    text: string;
    citations?: string[];
}

const WELCOME: Message = {
    role: "model",
    text: "Hi! I'm the UTAR AI Assistant. Ask me anything about UTAR — courses, admissions, fees, contacts, and more.",
    citations: [],
};
export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([WELCOME]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

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

        const userMsg: Message = { role: "user", text: trimmed };
        const next = [...messages, userMsg];
        setMessages(next);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: trimmed,
                    history: buildHistory(next),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Request failed");
            setMessages((prev) => [
                ...prev,
                { role: "model", text: data.text || "Sorry, I couldn't generate a response.", citations: data.citations ?? [] },
            ]);
        } catch (e: any) {
            setMessages((prev) => [
                ...prev,
                { role: "model", text: `Error: ${e.message}`, citations: [] },
            ]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col min-h-[100dvh] bg-[#FDFDFD]">
            {/* Header */}
            <header className="border-b border-zinc-100 px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
                    <MessageSquare size={14} className="text-white" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-zinc-900">UTAR AI Assistant</p>
                    <p className="text-xs text-zinc-400">Powered by university knowledge base</p>
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl mx-auto w-full">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                            msg.role === "user"
                                ? "bg-zinc-900 text-white rounded-br-sm"
                                : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm shadow-sm"
                        }`}>
                            {msg.role === "model" ? (
                                <div className="prose prose-sm prose-zinc max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            )}
                            {msg.citations && msg.citations.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-zinc-100 flex flex-wrap gap-1">
                                    {msg.citations.map((c, ci) => (
                                        <span key={ci} className="inline-flex items-center gap-1 text-xs text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-full">
                                            <BookOpen size={9} /> {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-zinc-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                            <Loader2 size={14} className="animate-spin text-zinc-400" />
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-zinc-100 px-4 py-3 max-w-2xl mx-auto w-full">
                <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-2 focus-within:border-zinc-400 transition-colors">
                    <input
                        className="flex-1 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
                        placeholder="Ask about UTAR courses, admissions, fees..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                        disabled={loading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-900 text-white disabled:opacity-40 active:scale-95 transition-transform"
                    >
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
