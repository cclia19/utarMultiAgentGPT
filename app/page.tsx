"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Sparkles, User, ArrowUpRight, Mail, AlignLeft, Info } from "lucide-react";
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
    { role: "model", text: "Welcome to UTAR. How may I assist you with your academic inquiries today?" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading]);

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
          history: messages.slice(-6).map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          }))
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        { role: "model", text: data.text, citations: data.citations }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "I apologize, but I am unable to access that information at the moment." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto border-x border-zinc-100/50 bg-[#FDFDFD]">
      {/* Premium Header */}
      <header className="sticky top-0 z-20 bg-[#FDFDFD]/80 backdrop-blur-md border-b border-zinc-100 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-900 text-white rounded-lg flex items-center justify-center shadow-lg shadow-zinc-200">
            <Sparkles size={14} fill="currentColor" className="text-zinc-400" />
          </div>
          <div>
            <h1 className="font-medium text-sm text-zinc-900 tracking-tight">UTAR Knowledge Base</h1>
            <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">Official AI Assistant</p>
          </div>
        </div>
        <a href="/admin/upload" className="opacity-0 hover:opacity-100 transition-opacity">
          <div className="w-2 h-2 rounded-full bg-zinc-200 hover:bg-zinc-400" />
        </a>
      </header>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-10 scrollbar-hide pb-32">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                "flex gap-5 max-w-2xl",
                msg.role === "user" ? "ml-auto flex-row-reverse" : ""
              )}
            >
              {/* Avatar */}
              <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border",
                msg.role === "user" 
                  ? "bg-zinc-100 border-zinc-200 text-zinc-600" 
                  : "bg-white border-zinc-100 text-zinc-900 shadow-sm"
              )}>
                {msg.role === "user" ? <User size={14} /> : <AlignLeft size={14} />}
              </div>

              {/* Bubble */}
              <div className={clsx(
                "space-y-2",
                msg.role === "user" ? "text-right" : "text-left"
              )}>
                <div className={clsx(
                  "px-6 py-4 rounded-2xl text-sm leading-7 shadow-sm",
                  msg.role === "user" 
                    ? "bg-zinc-900 text-zinc-50 rounded-tr-sm" 
                    : "bg-white border border-zinc-100 text-zinc-700 rounded-tl-sm shadow-zinc-100/50"
                )}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => {
                        const isMail = href?.startsWith("mailto:");
                        return (
                          <a 
                            href={href} 
                            target={isMail ? undefined : "_blank"} 
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 transition-all mx-1"
                          >
                            {children}
                            {isMail ? <Mail size={10} /> : <ArrowUpRight size={10} />}
                          </a>
                        );
                      },
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
                      strong: ({ children }) => <span className="font-semibold text-zinc-900">{children}</span>,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>

                {/* Citations Footer */}
                {msg.citations && msg.citations.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-wrap gap-2 mt-2 ml-1"
                  >
                    {msg.citations.map((cite, cIdx) => (
                      <span key={cIdx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-50 border border-zinc-100 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                        <Info size={10} /> {cite}
                      </span>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex gap-5 max-w-2xl">
             <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-zinc-100 shadow-sm">
               <Sparkles size={14} className="animate-pulse text-zinc-400" />
             </div>
             <div className="flex gap-1.5 items-center px-4">
                <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.2s]" />
             </div>
          </div>
        )}
      </div>

      {/* Floating Input */}
      <div className="fixed bottom-0 w-full max-w-4xl p-6 z-10">
        <div className="relative group">
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="w-full pl-6 pr-14 py-4 bg-white/80 backdrop-blur-xl border border-zinc-200/80 rounded-2xl shadow-2xl shadow-zinc-200/50 focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:bg-white transition-all text-sm placeholder:text-zinc-400 font-medium"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-2 p-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-all disabled:opacity-0 disabled:scale-95"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
        <div className="text-center mt-3">
            <p className="text-[10px] text-zinc-300 font-medium">AI can make mistakes. Check important info.</p>
        </div>
      </div>
    </div>
  );
}