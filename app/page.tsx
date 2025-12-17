"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    Send,
    Sparkles,
    ArrowUpRight,
    Mail,
    Command,
    Disc,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

type Message = {
    role: "user" | "model";
    text: string;
    citations?: string[];
};

export default function Home() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "model",
            text: "Welcome to UTAR Knowledge. I can access university documents, guidelines, and staff contacts. How can I help?",
        },
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll logic
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [messages, isLoading]);

    // Focus input on load
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput("");
        setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
        setIsLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMsg,
                    history: messages.slice(-6).map((m) => ({
                        role: m.role,
                        parts: [{ text: m.text }],
                    })),
                }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            setMessages((prev) => [
                ...prev,
                { role: "model", text: data.text, citations: data.citations },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "model",
                    text: "I encountered a connection error. Please try again.",
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-white text-zinc-900 selection:bg-zinc-100">
            {/* Minimal Header */}
            <header className="fixed top-0 w-full z-10 bg-white/80 backdrop-blur-xl border-b border-zinc-100">
                <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-zinc-900 rounded-full" />
                        <span className="text-xs font-semibold tracking-tight text-zinc-900">
                            UTAR / INTELLIGENCE
                        </span>
                    </div>
                    <a
                        href="/admin/upload"
                        className="opacity-0 hover:opacity-100 transition-opacity"
                        aria-label="Admin Access"
                    >
                        <div className="w-1.5 h-1.5 bg-zinc-200 hover:bg-zinc-400 rounded-full" />
                    </a>
                </div>
            </header>

            {/* Chat Container */}
            <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col pt-24 pb-36 px-6">
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto scrollbar-hidden space-y-8"
                >
                    <AnimatePresence initial={false}>
                        {messages.map((msg, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                className={clsx(
                                    "flex flex-col gap-2",
                                    msg.role === "user"
                                        ? "items-end"
                                        : "items-start"
                                )}
                            >
                                {/* Role Label (Only for AI) */}
                                {msg.role === "model" && (
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400 font-medium ml-1">
                                        <Sparkles size={10} strokeWidth={2} />
                                        <span>Assistant</span>
                                    </div>
                                )}

                                {/* Message Content */}
                                <div
                                    className={clsx(
                                        "relative px-4 py-2.5 max-w-2xl text-[15px] leading-7",
                                        msg.role === "user"
                                            ? "bg-zinc-100 text-zinc-900 rounded-2xl rounded-tr-sm font-medium"
                                            : "pl-0 text-zinc-800"
                                    )}
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        className="prose prose-zinc prose-sm max-w-none prose-p:my-1 prose-headings:font-medium prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold prose-ul:my-2"
                                        components={{
                                            a: ({ href, children }) => {
                                                const isMail =
                                                    href?.startsWith("mailto:");
                                                return (
                                                    <a
                                                        href={href}
                                                        target={
                                                            isMail
                                                                ? undefined
                                                                : "_blank"
                                                        }
                                                        rel="noreferrer"
                                                        className="inline-flex items-baseline gap-0.5 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 transition-all"
                                                    >
                                                        <span>{children}</span>
                                                        {isMail ? (
                                                            <Mail
                                                                size={10}
                                                                className="self-center opacity-50"
                                                            />
                                                        ) : (
                                                            <ArrowUpRight
                                                                size={10}
                                                                className="self-center opacity-50"
                                                            />
                                                        )}
                                                    </a>
                                                );
                                            },
                                        }}
                                    >
                                        {msg.text}
                                    </ReactMarkdown>
                                </div>

                                {/* Citations (Footnotes style) */}
                                {msg.citations && msg.citations.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.2 }}
                                        className="flex flex-wrap gap-2 mt-1 ml-0.5"
                                    >
                                        {msg.citations.map((cite, cIdx) => (
                                            <button
                                                key={cIdx}
                                                className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-zinc-100 hover:border-zinc-200 transition-colors shadow-sm"
                                            >
                                                <Disc
                                                    size={10}
                                                    className="text-zinc-300 group-hover:text-blue-500 transition-colors"
                                                />
                                                <span className="text-[10px] text-zinc-500 font-medium max-w-[150px] truncate">
                                                    {cite}
                                                </span>
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Loading State (Minimalist) */}
                    {isLoading && (
                        <div className="flex items-center gap-2 text-zinc-300 pl-1">
                            <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                            <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.1s]" />
                            <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.2s]" />
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Input Area */}
            <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-white via-white/90 to-transparent pt-10 pb-8 px-6 z-20">
                <div className="max-w-2xl mx-auto relative">
                    <form onSubmit={handleSubmit} className="relative group">
                        <div className="absolute inset-0 bg-zinc-200/50 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-50 transition-opacity duration-500" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about courses, guidelines, or staff..."
                            className="w-full pl-5 pr-14 py-4 bg-white/50 backdrop-blur-xl border border-zinc-200 rounded-2xl shadow-[0_2px_20px_-12px_rgba(0,0,0,0.1)] focus:outline-none focus:ring-[1px] focus:ring-zinc-300 focus:bg-white transition-all text-[15px] placeholder:text-zinc-400 font-normal"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 top-2 p-2.5 bg-zinc-900 hover:bg-black text-white rounded-xl transition-all disabled:opacity-0 disabled:scale-90"
                        >
                            <Send size={16} strokeWidth={2} />
                        </button>
                    </form>

                    <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-zinc-400 font-medium uppercase tracking-widest opacity-60">
                        <span className="flex items-center gap-1">
                            <Command size={10} /> Powered by Gemini
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
