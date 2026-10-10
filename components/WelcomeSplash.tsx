"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    ArrowUp,
    Award,
    BookOpen,
    Bus,
    ChevronRight,
    ClipboardCheck,
    FlaskConical,
    GraduationCap,
    HeartHandshake,
    Landmark,
    Lock,
    Moon,
    ShieldCheck,
    Sparkles,
    Sun,
    Wallet,
    Wrench,
    X,
} from "lucide-react";
import { LANGS, STRINGS, type Lang } from "@/lib/i18n";
import { VerifiedTick } from "./AgentBadge";

/**
 * First-visit welcome screen: the launch bento (same tiles as the launch
 * poster). The beta notice lives in the "Before you start" tile, which
 * expands into the notice card; accepting it closes the screen for good.
 *
 * Phones and tablets get a 2 / 4 column stack in reading order; from 1280px
 * wide the tiles are placed by grid areas into the poster layout.
 */

// Same key as the old notice modal: anyone who already accepted it skips this screen.
const STORAGE_KEY = "utarchat_disclaimer_accepted_v2";

const NOTICE_ICONS = [
    { icon: Sparkles, tone: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300" },
    { icon: Lock, tone: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300" },
    { icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300" },
];

const TILE = "relative flex min-h-[150px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[26px] bg-[#f2f2f7] p-4 text-center dark:bg-zinc-900 xl:min-h-0";
const LABEL = "text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 2xl:text-lg";
const UTAR_BLUE = "#1e3a8a";
const UTAR_RED = "#e31837";

const range = (from: number, to: number, step: number) => {
    const out: number[] = [];
    for (let v = from; v <= to; v += step) out.push(v);
    return out;
};

export default function WelcomeSplash({ lang = "en", onChooseLang }: { lang?: Lang; onChooseLang?: (l: Lang) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [noticeOpen, setNoticeOpen] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const reduce = useReducedMotion();
    const t = STRINGS[lang];
    const s = t.splash;
    const n = t.disclaimer;

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) setIsOpen(true);
        } catch {
            setIsOpen(true);
        }
    }, []);

    useEffect(() => {
        if (!noticeOpen) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNoticeOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [noticeOpen]);

    const accept = () => {
        if (!agreed) return;
        try {
            localStorage.setItem(STORAGE_KEY, "true");
        } catch {
            // storage blocked: the welcome screen shows again next visit
        }
        setNoticeOpen(false);
        setIsOpen(false);
    };

    let order = 0;
    const tile = (className: string, children: ReactNode, key: string) => (
        <motion.div
            key={key}
            initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.04 * order++, type: "spring", stiffness: 260, damping: 28 }}
            className={className}
        >
            {children}
        </motion.div>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="welcome"
                    className="fixed inset-0 z-50 overflow-y-auto bg-white text-zinc-900 dark:bg-black dark:text-zinc-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: reduce ? 1 : 1.02 }}
                    transition={{ duration: 0.35 }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="UTARCHAT"
                >
                    {/* Language switch, top right */}
                    <div className="relative z-10 flex justify-end px-3 pt-3 sm:px-5 xl:absolute xl:right-0 xl:top-0 xl:pt-2">
                        <div role="radiogroup" aria-label="Language" className="flex rounded-full border border-white/60 bg-white/70 p-0.5 text-xs font-semibold shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/70">
                            {LANGS.map((l) => (
                                <button
                                    key={l.id}
                                    role="radio"
                                    aria-checked={lang === l.id}
                                    onClick={() => onChooseLang?.(l.id)}
                                    className={`relative rounded-full px-3 py-1.5 transition-colors ${lang === l.id ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"}`}
                                >
                                    {lang === l.id && <motion.span layoutId="splash-lang-pill" className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-zinc-700" />}
                                    <span className="relative">{l.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mx-auto grid max-w-[1920px] grid-cols-2 gap-3 px-3 pb-6 pt-2 sm:grid-cols-4 sm:px-5 xl:h-[max(calc(100dvh-2.5rem),820px)] xl:grid-cols-6 xl:grid-rows-4 xl:gap-4 xl:px-8 xl:pb-5 xl:pt-10 xl:[grid-template-areas:'left_agents_agents_langs_dark_verified'_'left_bus_hero_hero_notice_follow'_'left_depts_hero_hero_prog_follow'_'left_campus_campus_devices_prog_avo']">
                        {/* HERO */}
                        {tile(
                            "col-span-2 flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-[30px] p-6 text-white sm:col-span-4 xl:min-h-0 xl:[grid-area:hero] bg-[radial-gradient(120%_90%_at_85%_100%,rgba(227,24,55,0.85)_0%,rgba(227,24,55,0)_55%),linear-gradient(150deg,#1b1a4a_0%,#1e3a8a_55%,#2347a8_100%)]",
                            <>
                                <img src="/TARo.png" alt="TARo, the UTARCHAT mascot" className="h-20 w-20 rounded-[24px] bg-white object-contain shadow-[0_18px_40px_rgba(10,12,40,0.4)] 2xl:h-28 2xl:w-28 2xl:rounded-[30px]" />
                                <h1 className="mt-5 whitespace-nowrap text-6xl font-extrabold tracking-[-0.04em] sm:text-7xl xl:text-[min(6rem,calc(5.2vw-8px))]">UTARCHAT</h1>
                                <button
                                    onClick={() => setNoticeOpen(true)}
                                    className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-white/30 to-white/10 px-7 py-3 text-lg font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_0_0_1px_rgba(255,255,255,0.28),0_12px_30px_rgba(10,12,40,0.28)] backdrop-blur-xl backdrop-saturate-150 transition hover:from-white/40 active:scale-[0.98]"
                                >
                                    {s.getStarted}
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                                <p className="mt-3 text-sm font-medium text-white/70">chat.utar.edu.my</p>
                            </>,
                            "hero",
                        )}

                        {/* BEFORE YOU START (the beta notice, expandable) */}
                        <motion.button
                            key="notice"
                            initial={reduce ? false : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.06 }}
                            onClick={() => setNoticeOpen(true)}
                            className={`${TILE} col-span-2 cursor-pointer ring-2 ring-transparent transition hover:ring-[#1e3a8a]/30 sm:col-span-4 xl:col-span-1 xl:[grid-area:notice]`}
                        >
                            <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-rose-300 via-rose-500 to-rose-700 shadow-[0_14px_30px_rgba(190,18,60,0.3),inset_0_2px_0_rgba(255,255,255,0.35)] 2xl:h-20 2xl:w-20">
                                <ShieldCheck className="h-8 w-8 text-white 2xl:h-10 2xl:w-10" strokeWidth={1.9} />
                            </span>
                            <span className={LABEL}>{s.notice}</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1e3a8a] shadow-sm dark:bg-zinc-800 dark:text-sky-300">
                                {s.tapToRead}
                                <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                        </motion.button>

                        {/* SMART ROUTING */}
                        {tile(
                            `${TILE} col-span-2 !items-stretch !justify-center !gap-2 sm:col-span-4 xl:col-span-2 xl:[grid-area:agents] 2xl:!flex-row 2xl:!items-center 2xl:!gap-5 2xl:px-6`,
                            <>
                                <div className="flex flex-wrap items-baseline gap-x-2 text-left 2xl:block 2xl:max-w-[7.5rem] 2xl:shrink-0">
                                    <div className="text-2xl font-extrabold leading-none tracking-tight 2xl:text-[2rem] 2xl:leading-[1.05]">{s.smartRouting}</div>
                                    <div className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 2xl:mt-2 2xl:text-base 2xl:leading-snug">{s.toRightOffice}</div>
                                </div>
                                <RoutingDiagram question={s.routeQuestion} offices={s.offices} />
                            </>,
                            "agents",
                        )}

                        {/* LANGUAGES */}
                        {tile(
                            `${TILE} gap-0 xl:[grid-area:langs]`,
                            <>
                                <div className="text-4xl font-extrabold leading-[1.05] tracking-tight text-[#1b1a4a] dark:text-white 2xl:text-5xl">Hello</div>
                                <div className="text-4xl font-extrabold leading-[1.05] tracking-tight text-[#1e3a8a] dark:text-sky-300 2xl:text-5xl">Hai</div>
                                <div className="text-4xl font-extrabold leading-[1.15] text-[#e31837] 2xl:text-5xl">你好</div>
                            </>,
                            "langs",
                        )}

                        {/* UTAR VERIFIED */}
                        {tile(
                            `${TILE} xl:[grid-area:verified]`,
                            <>
                                <VerifiedTick className="h-20 w-20 drop-shadow-[0_12px_18px_rgba(29,155,240,0.35)] 2xl:h-28 2xl:w-28" />
                                <span className={LABEL}>{s.verified}</span>
                            </>,
                            "verified",
                        )}

                        {/* FOLLOW-UPS */}
                        {tile(
                            `${TILE} col-span-2 xl:col-span-1 xl:[grid-area:follow]`,
                            <>
                                <div className="flex flex-col items-center gap-2.5">
                                    {s.followUpChips.map((q, i) => (
                                        <span
                                            key={q}
                                            className={`rounded-full px-4 py-2.5 text-sm font-semibold shadow-[0_8px_20px_rgba(30,58,138,0.14)] 2xl:px-5 2xl:py-3 2xl:text-base ${
                                                i === 1 ? "bg-[#1e3a8a] text-white" : "bg-white text-[#1e3a8a] dark:bg-zinc-800 dark:text-sky-300"
                                            }`}
                                            style={{ transform: `rotate(${[-3, 2, -1.5][i]}deg)` }}
                                        >
                                            {q}
                                        </span>
                                    ))}
                                </div>
                                <span className={`${LABEL} mt-2`}>{s.followUps}</span>
                            </>,
                            "follow",
                        )}

                        {/* LIVE BUS */}
                        {tile(
                            `${TILE} col-span-2 xl:col-span-1 xl:[grid-area:bus]`,
                            <>
                                <div className="flex items-center gap-2.5 whitespace-nowrap rounded-[20px] bg-white py-2.5 pl-2.5 pr-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.10)] dark:bg-zinc-800 2xl:gap-3 2xl:py-3 2xl:pl-3 2xl:pr-4">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-300 via-sky-500 to-sky-700 shadow-[0_8px_18px_rgba(3,105,161,0.3)] 2xl:h-14 2xl:w-14 2xl:rounded-2xl">
                                        <Bus className="h-5 w-5 text-white 2xl:h-7 2xl:w-7" strokeWidth={1.8} />
                                    </span>
                                    <div className="text-left">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.2)]" />
                                            {s.nextBus}
                                        </div>
                                        <div className="text-lg font-extrabold tracking-tight 2xl:text-2xl">11:15 am</div>
                                    </div>
                                </div>
                                <span className={LABEL}>{s.liveBus}</span>
                            </>,
                            "bus",
                        )}

                        {/* 41 DEPARTMENTS */}
                        {tile(
                            `${TILE} xl:[grid-area:depts]`,
                            <>
                                <DepartmentGrid />
                                <span className={LABEL}>{s.departments}</span>
                            </>,
                            "depts",
                        )}

                        {/* DARK MODE */}
                        {tile(
                            `${TILE} xl:[grid-area:dark]`,
                            <>
                                <div className="flex h-20 w-20 items-center justify-around rounded-full bg-[linear-gradient(90deg,#ffffff_50%,#1c1c1e_50%)] shadow-[0_10px_26px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(0,0,0,0.06)] 2xl:h-28 2xl:w-28">
                                    <Sun className="h-6 w-6 text-amber-500 2xl:h-7 2xl:w-7" strokeWidth={2} />
                                    <Moon className="h-6 w-6 fill-zinc-100 text-zinc-100 2xl:h-7 2xl:w-7" />
                                </div>
                                <span className={LABEL}>{s.darkMode}</span>
                            </>,
                            "dark",
                        )}

                        {/* PROGRAMME STRUCTURES */}
                        {tile(
                            `${TILE} col-span-2 !items-start xl:col-span-1 xl:[grid-area:prog] 2xl:p-6`,
                            <>
                                <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[linear-gradient(150deg,#3b63d1_0%,#1e3a8a_55%,#b3123a_100%)] shadow-[0_14px_30px_rgba(30,58,138,0.32),inset_0_2px_0_rgba(255,255,255,0.3)] 2xl:h-20 2xl:w-20">
                                    <GraduationCap className="h-8 w-8 text-white 2xl:h-10 2xl:w-10" strokeWidth={1.8} />
                                </span>
                                <span className={`${LABEL} text-left`}>{s.programmes}</span>
                                <div className="flex flex-col items-start gap-2">
                                    {[
                                        ["AI Techniques", UTAR_BLUE, ""],
                                        ["Deep Learning", UTAR_RED, "ml-4"],
                                        ["Data Communications", "#0ea5e9", ""],
                                        ["Cloud Computing", "#f59e0b", "ml-4 opacity-55"],
                                    ].map(([name, dot, extra]) => (
                                        <span key={name} className={`flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-[13px] font-semibold shadow-[0_6px_14px_rgba(15,23,42,0.07)] dark:bg-zinc-800 2xl:text-[15px] ${extra}`}>
                                            <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </>,
                            "prog",
                        )}

                        {/* BOTH CAMPUSES */}
                        {tile(
                            `${TILE} col-span-2 !flex-row gap-3 xl:[grid-area:campus] 2xl:gap-5`,
                            <>
                                <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                    <KamparArt />
                                    <figcaption className="text-base font-extrabold tracking-tight 2xl:text-xl">Kampar</figcaption>
                                </figure>
                                <figure className="flex min-w-0 flex-1 flex-col items-center gap-2">
                                    <SungaiLongArt />
                                    <figcaption className="text-base font-extrabold tracking-tight 2xl:text-xl">Sungai Long</figcaption>
                                </figure>
                            </>,
                            "campus",
                        )}

                        {/* PHONE & DESKTOP */}
                        {tile(
                            `${TILE} xl:[grid-area:devices]`,
                            <>
                                <DevicesArt />
                                <span className={LABEL}>{s.devices}</span>
                            </>,
                            "devices",
                        )}

                        {/* ASK ANYTHING (avocado wink) */}
                        {tile(
                            `${TILE} gap-1 xl:[grid-area:avo]`,
                            <>
                                <AvocadoShh />
                                <span className="mt-2 text-xl font-extrabold tracking-tight 2xl:text-2xl">{s.askAnything}</span>
                                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 2xl:text-base">{s.noHistory}</span>
                            </>,
                            "avo",
                        )}

                        {/* LEFT COLUMN: phone (wide screens only) + 24/7 */}
                        <div className="contents xl:flex xl:min-h-0 xl:flex-col xl:gap-4 xl:[grid-area:left]">
                            {tile(
                                `${TILE} hidden xl:flex xl:flex-[9]`,
                                <>
                                    <PhoneMock />
                                    <span className={LABEL}>{s.answersAsCards}</span>
                                </>,
                                "phone",
                            )}
                            {tile(
                                "relative col-span-2 flex min-h-[220px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[26px] p-4 text-center text-white xl:min-h-0 xl:flex-[7] bg-[radial-gradient(70%_45%_at_30%_18%,rgba(251,146,60,0.55)_0%,rgba(251,146,60,0)_70%),linear-gradient(165deg,#3b4a9a_0%,#202a6b_45%,#0b1033_100%)]",
                                <>
                                    <Stars />
                                    <SunMoon />
                                    <div className="relative mt-2 text-6xl font-extrabold leading-none tracking-[-0.05em] 2xl:text-7xl">24/7</div>
                                    <div className="relative text-base font-semibold 2xl:text-lg">{s.atYourService}</div>
                                    <div className="relative text-sm font-medium text-white/65">{s.neverSleeps}</div>
                                </>,
                                "247",
                            )}
                        </div>
                    </div>

                    {/* The notice card, expanded from the "Before you start" tile */}
                    <AnimatePresence>
                        {noticeOpen && (
                            <motion.div
                                key="notice-card"
                                className="fixed inset-0 z-20 flex items-end justify-center p-3 sm:items-center sm:p-6"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-md dark:bg-black/55" onClick={() => setNoticeOpen(false)} />
                                <motion.div
                                    role="dialog"
                                    aria-modal="true"
                                    aria-labelledby="notice-title"
                                    initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                                    className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/60 bg-white/70 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-zinc-900/70 dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
                                >
                                    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/70 to-transparent dark:from-white/10" />
                                    <button
                                        onClick={() => setNoticeOpen(false)}
                                        aria-label={s.close}
                                        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900/5 text-zinc-500 transition hover:bg-zinc-900/10 dark:bg-white/10 dark:text-zinc-300"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                    <div className="relative max-h-[85dvh] overflow-y-auto px-6 pb-6 pt-7">
                                        <div className="flex flex-col items-center text-center">
                                            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/70 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/10">
                                                <img src="/TARo.png" alt="" className="h-12 w-12 rounded-xl object-contain" />
                                            </div>
                                            <h2 id="notice-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                                                {n.title}
                                                <span className="rounded-full bg-zinc-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 ring-1 ring-inset ring-zinc-900/10 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/15">
                                                    {n.beta}
                                                </span>
                                            </h2>
                                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{n.intro}</p>
                                        </div>

                                        <ul className="mt-6 space-y-4">
                                            {n.items.map((item, i) => {
                                                const { icon: Icon, tone } = NOTICE_ICONS[i];
                                                return (
                                                    <li key={item.title} className="flex gap-3">
                                                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                                                            <Icon className="h-[18px] w-[18px]" />
                                                        </span>
                                                        <div>
                                                            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{item.title}</p>
                                                            <p className="mt-0.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">{item.body}</p>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>

                                        <label className="mt-6 flex cursor-pointer select-none items-start gap-3 rounded-2xl border border-white/70 bg-white/50 p-3 dark:border-white/10 dark:bg-white/5">
                                            <span className="relative mt-0.5 inline-flex shrink-0">
                                                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="peer sr-only" />
                                                <span className="h-6 w-10 rounded-full bg-zinc-300 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 dark:bg-zinc-700" />
                                                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                                            </span>
                                            <span className="text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">{n.acknowledge}</span>
                                        </label>

                                        <button
                                            onClick={accept}
                                            disabled={!agreed}
                                            className="mt-4 w-full rounded-full bg-gradient-to-b from-[#2f56c4] to-[#1e3a8a] py-3 text-sm font-semibold text-white shadow-lg shadow-[#1e3a8a]/25 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:from-zinc-300 disabled:to-zinc-300 disabled:text-zinc-500 disabled:shadow-none dark:disabled:from-zinc-700 dark:disabled:to-zinc-700 dark:disabled:text-zinc-400"
                                        >
                                            {n.cta}
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* ---------- tile graphics ---------- */

function RoutingDiagram({ question, offices }: { question: string; offices: { library: string; scholarships: string; admissions: string } }) {
    return (
        <div className="flex h-[120px] min-w-0 flex-1 items-center 2xl:h-[150px]">
            <span className="shrink-0 whitespace-nowrap rounded-[18px_18px_6px_18px] bg-gradient-to-br from-[#2f56c4] to-[#1e3a8a] px-3.5 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(30,58,138,0.28)] 2xl:text-[15px]">
                {question}
            </span>
            <svg viewBox="0 0 100 176" preserveAspectRatio="none" aria-hidden className="h-full min-w-[20px] flex-1" fill="none">
                <path d="M0 88 C50 88 50 22 100 22" stroke="#c7c7cc" strokeWidth="2" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
                <path d="M0 88 C50 88 50 154 100 154" stroke="#c7c7cc" strokeWidth="2" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />
                <path d="M0 88 L100 88" stroke={UTAR_BLUE} strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="flex h-full shrink-0 flex-col justify-between">
                <Office icon={BookOpen} tone="from-teal-400 to-teal-600" label={offices.library} faded />
                <Office icon={Award} tone="from-amber-300 to-amber-600" label={offices.scholarships} />
                <Office icon={ClipboardCheck} tone="from-emerald-400 to-emerald-600" label={offices.admissions} faded />
            </div>
        </div>
    );
}

function Office({ icon: Icon, tone, label, faded }: { icon: typeof Award; tone: string; label: string; faded?: boolean }) {
    return (
        <span
            className={`flex items-center gap-2 whitespace-nowrap rounded-[14px] bg-white px-2.5 font-bold dark:bg-zinc-800 ${
                faded ? "h-8 text-xs opacity-45 2xl:h-10 2xl:text-sm" : "h-10 text-sm shadow-[0_12px_26px_rgba(30,58,138,0.18),inset_0_0_0_2px_#1e3a8a] dark:shadow-[inset_0_0_0_2px_#7dd3fc] 2xl:h-11"
            }`}
        >
            <span className={`flex items-center justify-center rounded-lg bg-gradient-to-br ${tone} ${faded ? "h-6 w-6" : "h-7 w-7"}`}>
                <Icon className={faded ? "h-3.5 w-3.5 text-white" : "h-4 w-4 text-white"} strokeWidth={2.2} />
            </span>
            {label}
        </span>
    );
}

function DepartmentGrid() {
    const icons = [
        { icon: GraduationCap, tone: "from-indigo-400 to-indigo-600" },
        { icon: Bus, tone: "from-sky-400 to-sky-600" },
        { icon: Wallet, tone: "from-amber-400 to-amber-600" },
        { icon: ClipboardCheck, tone: "from-emerald-400 to-emerald-600" },
        { icon: HeartHandshake, tone: "from-pink-400 to-pink-600" },
        { icon: BookOpen, tone: "from-teal-400 to-teal-600" },
        { icon: FlaskConical, tone: "from-violet-400 to-violet-600" },
        { icon: Wrench, tone: "from-orange-400 to-orange-600" },
        { icon: Landmark, tone: "from-slate-400 to-slate-600" },
    ];
    return (
        <div className="grid grid-cols-3 gap-2">
            {icons.map(({ icon: Icon, tone }, i) => (
                <span key={i} className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${tone} shadow-[0_6px_14px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.3)]`}>
                    <Icon className="h-[18px] w-[18px] text-white" strokeWidth={1.9} />
                </span>
            ))}
        </div>
    );
}

function PhoneMock() {
    const row = (level: string, date: string) => (
        <div key={level} className="flex justify-between rounded-[10px] bg-[#f4f4f8] px-2 py-1.5 text-[10px] text-zinc-900">
            <span className="font-bold">{level}</span>
            <span>{date}</span>
        </div>
    );
    return (
        <div className="flex min-h-0 w-full flex-1 justify-center">
            <div className="aspect-[232/462] h-full max-h-[462px] rounded-[42px] bg-[#111113] p-2 shadow-[0_26px_52px_rgba(17,17,19,0.24)]">
                <div className="relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-[34px] bg-[#f8fafc] px-2.5 pb-2.5 pt-9 text-left">
                    <div className="absolute left-1/2 top-2.5 h-5 w-[72px] -translate-x-1/2 rounded-xl bg-[#111113]" />
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                    <div className="self-end rounded-[16px_16px_4px_16px] bg-gradient-to-br from-[#2f56c4] to-[#1e3a8a] px-2.5 py-2 text-[10.5px] font-semibold text-white">When does the October trimester start?</div>
                    <span className="inline-flex items-center gap-1 self-start rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                        <ClipboardCheck className="h-2.5 w-2.5" strokeWidth={2.4} />
                        Admissions (DACE)
                    </span>
                    <div className="flex flex-col gap-1.5 rounded-[16px_16px_16px_4px] bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        <div className="text-[11px] font-extrabold text-zinc-900">October 2026 trimester</div>
                        {row("Postgraduate", "5 Oct")}
                        {row("Foundation", "12 Oct")}
                        {row("Undergraduate", "26 Oct")}
                        {row("MBBS", "2 Nov")}
                        <div className="rounded-lg border-l-[3px] border-[#1e3a8a] bg-blue-50 px-2 py-1.5 text-[9.5px] font-semibold text-[#1e3a8a]">Next step: check your offer letter</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {["What about fees?", "Bus to campus"].map((c) => (
                            <span key={c} className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[9.5px] font-semibold text-[#1e3a8a]">{c}</span>
                        ))}
                    </div>
                    </div>
                    <div className="flex h-8 shrink-0 items-center justify-between rounded-2xl border border-zinc-200 bg-white py-0.5 pl-3 pr-0.5 text-[10px] text-zinc-400">
                        Ask anything about UTAR
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1e3a8a]">
                            <ArrowUp className="h-3.5 w-3.5 text-white" strokeWidth={2.6} />
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DevicesArt() {
    return (
        <div className="relative h-[100px] w-[160px] 2xl:h-[122px] 2xl:w-[196px]">
            <div className="absolute left-[4%] top-0 h-[85%] w-[82%] rounded-xl bg-[#1d1d1f] p-1.5">
                <div className="h-full w-full rounded-md bg-[linear-gradient(150deg,#1b1a4a,#1e3a8a_60%,#e31837)]" />
            </div>
            <div className="absolute left-0 top-[85%] h-2 w-[90%] rounded-b-lg bg-gradient-to-b from-zinc-300 to-zinc-400" />
            <div className="absolute right-0 top-[25%] h-[75%] w-[27%] rounded-xl bg-[#1d1d1f] p-1 shadow-[0_10px_20px_rgba(0,0,0,0.22)]">
                <div className="flex h-full w-full flex-col gap-1 rounded-lg bg-[#f8fafc] px-1 py-2">
                    <span className="h-1.5 w-3/5 self-end rounded bg-[#1e3a8a]" />
                    <span className="h-3 w-4/5 rounded bg-zinc-200" />
                    <span className="h-1.5 w-1/2 self-end rounded bg-[#1e3a8a]" />
                </div>
            </div>
        </div>
    );
}

function Stars() {
    const stars: [number, number, number, number][] = [
        [30, 40, 1.6, 0.9], [70, 90, 1.1, 0.6], [220, 30, 1.4, 0.8], [250, 120, 1, 0.5], [40, 190, 1.2, 0.6],
        [230, 210, 1.6, 0.8], [130, 22, 1, 0.5], [190, 80, 1, 0.6], [20, 120, 1, 0.5], [255, 170, 1.1, 0.6],
    ];
    return (
        <svg viewBox="0 0 280 240" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
            {stars.map(([cx, cy, r, o]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#ffffff" opacity={o} />
            ))}
        </svg>
    );
}

function SunMoon() {
    return (
        <svg viewBox="0 0 124 96" aria-hidden className="relative h-[86px] w-[112px] overflow-visible 2xl:h-[110px] 2xl:w-[142px]">
            <defs>
                <radialGradient id="sp-sun" cx="0.4" cy="0.35" r="0.7">
                    <stop offset="0" stopColor="#fff3b0" />
                    <stop offset="0.6" stopColor="#fbbf24" />
                    <stop offset="1" stopColor="#f97316" />
                </radialGradient>
            </defs>
            <circle cx="44" cy="44" r="40" fill="#fbbf24" opacity="0.18" />
            <circle cx="44" cy="44" r="28" fill="url(#sp-sun)" />
            <path transform="translate(56 30) scale(2.4)" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="#fde68a" stroke="#202a6b" strokeWidth="1.4" strokeLinejoin="round" paintOrder="stroke" />
        </svg>
    );
}

function AvocadoShh() {
    const shape = "M40 4 C26 4 20 18 18 32 C16 44 6 54 6 70 C6 88 22 98 40 98 C58 98 74 88 74 70 C74 54 64 44 62 32 C60 18 54 4 40 4 Z";
    return (
        <svg viewBox="0 0 80 100" aria-hidden className="h-[84px] w-[68px] -rotate-6 drop-shadow-[0_12px_16px_rgba(22,101,52,0.28)] 2xl:h-[106px] 2xl:w-[85px]">
            <defs>
                <linearGradient id="sp-avo-skin" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4d7c0f" />
                    <stop offset="1" stopColor="#14532d" />
                </linearGradient>
                <radialGradient id="sp-avo-flesh" cx="0.45" cy="0.4" r="0.7">
                    <stop offset="0" stopColor="#fef9c3" />
                    <stop offset="0.55" stopColor="#d9f99d" />
                    <stop offset="1" stopColor="#a3e635" />
                </radialGradient>
                <radialGradient id="sp-avo-pit" cx="0.35" cy="0.3" r="0.75">
                    <stop offset="0" stopColor="#d6a676" />
                    <stop offset="0.6" stopColor="#92562b" />
                    <stop offset="1" stopColor="#5b3416" />
                </radialGradient>
            </defs>
            <path d={shape} fill="url(#sp-avo-skin)" />
            <path d={shape} transform="translate(40 56) scale(0.84) translate(-40 -56)" fill="url(#sp-avo-flesh)" />
            <circle cx="40" cy="68" r="15" fill="url(#sp-avo-pit)" />
            <ellipse cx="35" cy="62" rx="4.5" ry="3" fill="#ffffff" opacity="0.45" />
            {/* wink + shh */}
            <ellipse cx="32" cy="37" rx="2.4" ry="3" fill="#1f2937" />
            <circle cx="32.8" cy="36" r="0.8" fill="#ffffff" />
            <path d="M44.5 37.5 q3 -3 6 0" stroke="#1f2937" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <ellipse cx="27" cy="44" rx="3.2" ry="1.8" fill="#fb7185" opacity="0.45" />
            <ellipse cx="53" cy="44" rx="3.2" ry="1.8" fill="#fb7185" opacity="0.45" />
            <ellipse cx="40" cy="46" rx="2.6" ry="1.8" fill="#7f1d1d" />
            <path d="M13 64 Q22 62 34 55" stroke="#3f6212" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <rect x="38.2" y="39" width="4.6" height="13" rx="2.3" fill="#4d7c0f" stroke="#14532d" strokeWidth="0.8" />
            <ellipse cx="39.5" cy="54.5" rx="5.6" ry="4.6" fill="#4d7c0f" stroke="#14532d" strokeWidth="0.8" />
        </svg>
    );
}

const CAMPUS_ART = "block h-auto w-full max-w-[260px] rounded-[18px] shadow-[0_12px_26px_rgba(15,23,42,0.16)]";

function KamparArt() {
    const pillars = (x0: number, x1: number, y: number, h: number, step: number, op = 1) =>
        range(x0, x1, step).map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={3} height={h} fill="#b91c1c" opacity={op} />);
    return (
        <svg viewBox="0 0 260 150" aria-hidden className={CAMPUS_ART}>
            <defs>
                <linearGradient id="sp-kSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2f4a8a" />
                    <stop offset="0.55" stopColor="#93acd8" />
                    <stop offset="1" stopColor="#f6cf9f" />
                </linearGradient>
                <linearGradient id="sp-kGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffe7a3" />
                    <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient id="sp-kPool" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#1f2937" />
                    <stop offset="1" stopColor="#0b1220" />
                </linearGradient>
                <linearGradient id="sp-kRef" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f59e0b" stopOpacity="0.75" />
                    <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
            </defs>
            <rect width="260" height="150" fill="url(#sp-kSky)" />
            <path d="M0 78 C30 64 52 70 78 62 C104 54 130 66 160 58 C190 50 222 60 260 54 L260 88 L0 88 Z" fill="#6b84b8" opacity="0.75" />
            <rect x="8" y="78" width="58" height="16" fill="url(#sp-kGlow)" opacity="0.9" />
            <path d="M4 79 L70 79 L66 74 L8 74 Z" fill="#3f4652" />
            {pillars(10, 64, 79, 15, 9)}
            <rect x="194" y="78" width="58" height="16" fill="url(#sp-kGlow)" opacity="0.9" />
            <path d="M190 79 L256 79 L252 74 L194 74 Z" fill="#3f4652" />
            {pillars(196, 250, 79, 15, 9)}
            <rect x="68" y="66" width="124" height="28" fill="url(#sp-kGlow)" />
            {pillars(70, 188, 66, 28, 10)}
            <path d="M52 68 Q74 64 88 46 L172 46 Q186 64 208 68 L196 68 L64 68 Z" fill="#4b5563" />
            <path d="M92 46 L168 46 L160 38 L100 38 Z" fill="#374151" />
            <rect x="98" y="36" width="64" height="3" rx="1.5" fill="#1f2937" />
            <rect x="60" y="66" width="140" height="2.5" fill="#fde68a" opacity="0.9" />
            <rect x="0" y="94" width="260" height="6" fill="#9ca3af" />
            <rect x="0" y="100" width="260" height="50" fill="url(#sp-kPool)" />
            <rect x="68" y="101" width="124" height="26" fill="url(#sp-kRef)" />
            <rect x="8" y="101" width="58" height="12" fill="url(#sp-kRef)" opacity="0.7" />
            <rect x="194" y="101" width="58" height="12" fill="url(#sp-kRef)" opacity="0.7" />
            {pillars(70, 188, 101, 16, 10, 0.5)}
            <path d="M0 150 L0 128 L60 150 Z" fill="#d1d5db" />
            <path d="M260 150 L260 120 L200 150 Z" fill="#4d7c4f" />
        </svg>
    );
}

function SungaiLongArt() {
    const bands = (x: number, y: number, w: number, count: number, gap: number, fill = "#f8fafc") =>
        range(0, count - 1, 1).map((i) => <rect key={`b${x}-${y + i * gap}`} x={x} y={y + i * gap} width={w} height={2.5} fill={fill} />);
    const windows = (x0: number, y0: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number, fill: string) =>
        range(0, rows - 1, 1).flatMap((r) => range(0, cols - 1, 1).map((c) => <rect key={`w${x0 + c * gx}-${y0 + r * gy}`} x={x0 + c * gx} y={y0 + r * gy} width={w} height={h} fill={fill} />));
    const trees: [number, number, number, string][] = [
        [10, 122, 14, "#2f6b3a"], [34, 128, 12, "#2f6b3a"], [62, 124, 13, "#2f6b3a"], [96, 130, 11, "#2f6b3a"], [154, 128, 12, "#2f6b3a"],
        [182, 122, 14, "#2f6b3a"], [212, 128, 13, "#2f6b3a"], [244, 122, 15, "#2f6b3a"],
        [22, 118, 8, "#4f8f4f"], [196, 116, 8, "#4f8f4f"], [236, 114, 7, "#4f8f4f"], [76, 120, 7, "#4f8f4f"],
    ];
    return (
        <svg viewBox="0 0 260 150" aria-hidden className={CAMPUS_ART}>
            <defs>
                <linearGradient id="sp-sSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4f8fdc" />
                    <stop offset="1" stopColor="#d6e9fb" />
                </linearGradient>
            </defs>
            <rect width="260" height="150" fill="url(#sp-sSky)" />
            <path d="M20 26 C70 18 120 24 170 16" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.55" fill="none" />
            <rect x="168" y="22" width="64" height="100" fill="#eef2f7" />
            <rect x="166" y="20" width="68" height="5" fill="#ffffff" />
            {windows(174, 30, 5, 10, 8, 4, 11, 9, "#9aa7b8")}
            <rect x="14" y="56" width="54" height="66" fill="#b5553b" />
            {bands(14, 66, 54, 6, 9)}
            <path d="M10 57 L41 42 L72 57 Z" fill="#9b2c1f" />
            <rect x="76" y="50" width="100" height="72" fill="#b8573d" />
            {bands(76, 60, 100, 7, 9)}
            {windows(80, 63, 4, 6, 5, 4, 8, 9, "#5b6b80")}
            {windows(146, 63, 4, 6, 5, 4, 8, 9, "#5b6b80")}
            <rect x="108" y="34" width="38" height="88" fill="#ffffff" />
            <path d="M106 36 Q127 22 148 36 Z" fill="#ffffff" />
            <rect x="116" y="44" width="22" height="34" fill="#b8573d" />
            {bands(116, 52, 22, 3, 9, "#ffffff")}
            <rect x="104" y="96" width="46" height="6" fill="#f8fafc" />
            <rect x="110" y="98" width="34" height="2" fill="#1e3a8a" />
            <rect x="0" y="132" width="260" height="18" fill="#a5452f" />
            {trees.map(([cx, cy, r, fill]) => (
                <circle key={`t${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />
            ))}
        </svg>
    );
}
