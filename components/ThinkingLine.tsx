"use client";

import { AnimatePresence, motion, type TargetAndTransition } from "framer-motion";
import { Brain, Compass, FileText, Globe, Link2, Search, Sparkles, Users, type LucideIcon } from "lucide-react";
import { agentDisplayName, agentIcon } from "./AgentBadge";

/**
 * The "thinking" indicator: one line that changes in place as the server works
 * (understanding → finding the office → checking documents → answering).
 * Black and white on purpose (calm and techy); the answer that follows keeps
 * its colourful badges and emoji. Motion stops under "reduce motion" via the
 * page's MotionConfig.
 */

export type ThinkingStep = { stage: string; agentId?: string; agentLabel?: string };

const STAGE_ICONS: Record<string, LucideIcon> = {
    analyzing: Brain,
    followUp: Link2,
    routing: Compass,
    searching: Search,
    officialPage: FileText,
    staffDirectory: Users,
    webFallback: Globe,
    reasoning: Sparkles,
};

// A small, looping motion per step, so the icon hints at what is happening.
const STAGE_MOTION: Record<string, TargetAndTransition> = {
    analyzing: { scale: [1, 1.12, 1], transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } },
    followUp: { rotate: [0, -12, 0], transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } },
    routing: { rotate: [-25, 25, -25], transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
    agent_selected: { scale: [0.6, 1.15, 1], transition: { duration: 0.45, ease: "easeOut" } },
    searching: { x: [-2.5, 2.5, -2.5], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
    officialPage: { y: [0, -1.5, 0], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
    staffDirectory: { scale: [1, 1.08, 1], transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } },
    webFallback: { rotate: [0, 360], transition: { duration: 5, repeat: Infinity, ease: "linear" } },
    reasoning: { opacity: [0.45, 1, 0.45], scale: [0.95, 1.05, 0.95], transition: { duration: 1.3, repeat: Infinity, ease: "easeInOut" } },
};

/** Short office name for the thinking line ("FICT", not "FICT Assistant"); the general agent reads as UTAR. */
export function officeName(agentId?: string, label?: string): string {
    if (!agentId || agentId === "general") return "UTAR";
    const parts = String(label || "").split(/\s*\+\s*/).filter(Boolean);
    if (parts.length <= 1) return agentDisplayName(agentId, label);
    // Two offices at once: "DSA Kampar Assistant + DSA Sungai Long" reads as "DSA".
    const bases = parts.map((p) => p.replace(/\s*Assistant$/i, "").replace(/\s+(Kampar|Sungai Long)$/i, "").trim());
    return Array.from(new Set(bases)).join(" + ");
}

export function thinkingLabel(step: ThinkingStep, stages: Record<string, string>): string {
    const office = step.agentId ? officeName(step.agentId, step.agentLabel) : "";
    const key = step.stage === "followUp" && (!step.agentId || step.agentId === "general") ? "followUpGeneral" : step.stage;
    const template = stages[key] || stages.analyzing || "";
    return template.replace("{office}", office || "UTAR");
}

export default function ThinkingLine({ step, office, stages }: { step: ThinkingStep; office: ThinkingStep | null; stages: Record<string, string> }) {
    const Icon = step.stage === "agent_selected" ? agentIcon(step.agentId) : STAGE_ICONS[step.stage] || Sparkles;
    const label = thinkingLabel(step, stages);
    const OfficeIcon = office ? agentIcon(office.agentId) : null;

    return (
        <div className="flex items-center gap-2.5 py-1" role="status" aria-live="polite" aria-label={label}>
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center text-zinc-900 dark:text-zinc-100">
                <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                        key={step.stage + (step.agentId || "")}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <motion.span animate={STAGE_MOTION[step.stage]} className="flex">
                            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                        </motion.span>
                    </motion.span>
                </AnimatePresence>
            </span>

            <span className="relative grid h-6 min-w-0 flex-1 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                        key={label}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                        className="thinking-shimmer col-start-1 row-start-1 flex items-center whitespace-nowrap text-[14px] font-medium"
                    >
                        {label}…
                    </motion.span>
                </AnimatePresence>
            </span>

            {office && OfficeIcon && (
                <motion.span
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hidden shrink-0 items-center gap-1 rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 sm:inline-flex"
                >
                    <OfficeIcon className="h-3 w-3" strokeWidth={2} aria-hidden />
                    {officeName(office.agentId, office.agentLabel)}
                </motion.span>
            )}
        </div>
    );
}
