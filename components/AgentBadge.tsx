"use client";

import {
    Award,
    BookOpen,
    Building2,
    Bus,
    ClipboardCheck,
    Cpu,
    FileCheck2,
    FlaskConical,
    GraduationCap,
    HeartHandshake,
    Landmark,
    ShieldCheck,
    Sprout,
    Wallet,
    Wrench,
    Globe2,
    type LucideIcon,
} from "lucide-react";

/**
 * Who answered, as a small coloured badge with an icon. The General agent is
 * shown as "AVO" with a verified tick; underneath it is still the General
 * agent (display only).
 */

type Family = { icon: LucideIcon; tone: string };

const TONES = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    violet: "bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
    amber: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    pink: "bg-pink-50 text-pink-700 ring-pink-200/70 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-400/20",
    sky: "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    orange: "bg-orange-50 text-orange-700 ring-orange-200/70 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20",
    red: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    teal: "bg-teal-50 text-teal-700 ring-teal-200/70 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200/70 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20",
    yellow: "bg-yellow-50 text-yellow-800 ring-yellow-200/70 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-400/20",
    slate: "bg-slate-100 text-slate-700 ring-slate-200/70 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/20",
    purple: "bg-purple-50 text-purple-700 ring-purple-200/70 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20",
    lime: "bg-lime-50 text-lime-800 ring-lime-200/70 dark:bg-lime-500/10 dark:text-lime-300 dark:ring-lime-400/20",
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200/70 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10",
};

const FACULTIES = new Set(["fict", "fbf", "fass", "fegt", "fsc", "fam", "fmhs", "lkcfes", "fci", "fcs", "fed"]);

function familyOf(agentId: string): Family {
    const id = agentId.replace(/-(kampar|sungai-long)$/, "");
    if (FACULTIES.has(id)) return { icon: GraduationCap, tone: TONES.indigo };
    const map: Record<string, Family> = {
        dace: { icon: ClipboardCheck, tone: TONES.emerald },
        deas: { icon: FileCheck2, tone: TONES.violet },
        dfn: { icon: Wallet, tone: TONES.amber },
        scholarships: { icon: Award, tone: TONES.yellow },
        dsa: { icon: HeartHandshake, tone: TONES.pink },
        dgs: { icon: Bus, tone: TONES.sky },
        def: { icon: Wrench, tone: TONES.orange },
        dss: { icon: ShieldCheck, tone: TONES.red },
        library: { icon: BookOpen, tone: TONES.teal },
        itisc: { icon: Cpu, tone: TONES.cyan },
        registrar: { icon: Landmark, tone: TONES.slate },
        ipsr: { icon: FlaskConical, tone: TONES.purple },
        cfs: { icon: Sprout, tone: TONES.lime },
        oia: { icon: Globe2, tone: TONES.sky },
        diss: { icon: Globe2, tone: TONES.sky },
    };
    return map[id] ?? { icon: Building2, tone: TONES.zinc };
}

/** The blue verified tick (scalloped badge with a check), like a verified account. */
export function VerifiedTick({ className = "h-3.5 w-3.5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-label="Verified" role="img" className={className}>
            <path
                fill="#1d9bf0"
                d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
            />
            <path fill="#fff" d="M10.54 16.6 6.7 12.76l1.41-1.41 2.43 2.42 5.35-5.35 1.41 1.42z" />
        </svg>
    );
}

export function agentDisplayName(agentId?: string, label?: string): string {
    if (!agentId || agentId === "general") return "AVO";
    return (label || agentId).replace(/\s*Assistant$/i, "").trim();
}

export default function AgentBadge({ agentId, label, size = "sm" }: { agentId?: string; label?: string; size?: "sm" | "xs" }) {
    const isGeneral = !agentId || agentId === "general";
    const name = agentDisplayName(agentId, label);
    const pad = size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";
    if (isGeneral) {
        return (
            <span className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset ${pad} bg-sky-50 text-zinc-900 ring-sky-200/70 dark:bg-sky-500/10 dark:text-white dark:ring-sky-400/20`}>
                {name}
                <VerifiedTick />
            </span>
        );
    }
    const { icon: Icon, tone } = familyOf(agentId!);
    return (
        <span className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${pad} ${tone}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {name}
        </span>
    );
}
