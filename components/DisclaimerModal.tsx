"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { STRINGS } from "@/lib/i18n";

// v2: adds the anonymous question-logging notice, so returning users see it once.
const STORAGE_KEY = "utarchat_disclaimer_accepted_v2";

const ICONS = [
    { icon: Sparkles, tone: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300" },
    { icon: Lock, tone: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300" },
    { icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300" },
];

/** First-visit notice: frosted "liquid glass" card over a soft colour glow. */
export default function DisclaimerModal({ lang = "en", onAccept }: { lang?: Lang; onAccept?: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const reduce = useReducedMotion();
    const t = STRINGS[lang].disclaimer;

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) setIsOpen(true);
        } catch {
            setIsOpen(true);
        }
    }, []);

    const accept = () => {
        if (!agreed) return;
        try {
            localStorage.setItem(STORAGE_KEY, "true");
        } catch {
            // storage blocked: the notice shows again next visit
        }
        setIsOpen(false);
        onAccept?.();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="disclaimer-title"
                >
                    {/* Backdrop with colour glows the glass picks up */}
                    <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-md dark:bg-black/55" />
                    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-[85%] rounded-full bg-indigo-400/45 blur-3xl dark:bg-indigo-600/35" />
                        <div className="absolute left-1/2 top-1/2 h-64 w-64 translate-x-[10%] rounded-full bg-sky-300/45 blur-3xl dark:bg-sky-600/30" />
                        <div className="absolute left-1/2 top-2/3 h-56 w-56 -translate-x-1/2 rounded-full bg-fuchsia-300/35 blur-3xl dark:bg-fuchsia-700/25" />
                    </div>

                    <motion.div
                        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 260, damping: 26 }}
                        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/60 bg-white/60 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-900/60 dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
                    >
                        {/* Light catching the top edge of the glass */}
                        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/70 to-transparent dark:from-white/10" />

                        <div className="relative max-h-[85dvh] overflow-y-auto px-6 pb-6 pt-7">
                            <div className="flex flex-col items-center text-center">
                                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/70 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/10">
                                    <img src="/TARo.png" alt="" className="h-12 w-12 rounded-xl object-contain" />
                                </div>
                                <h2 id="disclaimer-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                                    {t.title}
                                    <span className="rounded-full bg-zinc-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 ring-1 ring-inset ring-zinc-900/10 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/15">
                                        {t.beta}
                                    </span>
                                </h2>
                                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.intro}</p>
                            </div>

                            <ul className="mt-6 space-y-4">
                                {t.items.map((item, i) => {
                                    const { icon: Icon, tone } = ICONS[i];
                                    return (
                                        <motion.li
                                            key={item.title}
                                            initial={reduce ? false : { opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.08 + i * 0.06 }}
                                            className="flex gap-3"
                                        >
                                            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                                                <Icon className="h-[18px] w-[18px]" />
                                            </span>
                                            <div>
                                                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{item.title}</p>
                                                <p className="mt-0.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">{item.body}</p>
                                            </div>
                                        </motion.li>
                                    );
                                })}
                            </ul>

                            <label className="mt-6 flex cursor-pointer select-none items-start gap-3 rounded-2xl border border-white/70 bg-white/50 p-3 dark:border-white/10 dark:bg-white/5">
                                {/* iOS-style switch */}
                                <span className="relative mt-0.5 inline-flex shrink-0">
                                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="peer sr-only" />
                                    <span className="h-6 w-10 rounded-full bg-zinc-300 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 dark:bg-zinc-700" />
                                    <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                                </span>
                                <span className="text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">{t.acknowledge}</span>
                            </label>

                            <button
                                onClick={accept}
                                disabled={!agreed}
                                className="mt-4 w-full rounded-full bg-gradient-to-b from-indigo-500 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:from-zinc-300 disabled:to-zinc-300 disabled:text-zinc-500 disabled:shadow-none dark:disabled:from-zinc-700 dark:disabled:to-zinc-700 dark:disabled:text-zinc-400"
                            >
                                {t.cta}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
