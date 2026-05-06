import type { AgentId } from "./agents";
import { findOrgUnitByAlias, getOrgUnitById } from "./orgUnits";

export interface RouteDecision {
    agentId: AgentId;
    needsClarification: boolean;
    clarificationMessage?: string;
}

const QUICK_UNIT_MAP: Record<string, string> = {
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

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function detectAgentFromText(text: string): AgentId | null {
    const normalized = normalize(text);

    if (QUICK_UNIT_MAP[normalized]) {
        return QUICK_UNIT_MAP[normalized];
    }

    const unit = findOrgUnitByAlias(text);

    if (!unit || !unit.enabledForChat) {
        return null;
    }

    return unit.id;
}

export function isFacultySpecificQuestion(text: string): boolean {
    const lower = text.toLowerCase();

    const signals = [
        "dean",
        "head of programme",
        "head of department",
        "hod",
        "faculty office",
        "department office",
        "lecturer",
        "academic advisor",
        "programme offered",
        "programmes offered",
        "office location",
        "faculty",
        "department",
        "my dean",
        "my lecturer",
        "my programme",
    ];

    return signals.some((signal) => lower.includes(signal));
}

export function routeQuestion(
    message: string,
    currentAgentId: AgentId = "general"
): RouteDecision {
    const detectedAgent = detectAgentFromText(message);

    if (detectedAgent) {
        return {
            agentId: detectedAgent,
            needsClarification: false,
        };
    }

    const currentUnit = getOrgUnitById(currentAgentId);

    if (currentUnit.id !== "general" && currentUnit.enabledForChat) {
        return {
            agentId: currentUnit.id,
            needsClarification: false,
        };
    }

    if (isFacultySpecificQuestion(message)) {
        return {
            agentId: "general",
            needsClarification: true,
            clarificationMessage:
                "May I know which faculty or department you are referring to? For example, FICT, FEGT, FBF, DHR, DFN, or IPSR.",
        };
    }

    return {
        agentId: "general",
        needsClarification: false,
    };
}