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
    dssm: "dssm",
    dfn: "dfn",
    dea: "deas",
    deas: "deas",
    dace: "dace",
    oia: "oia",
    library: "library",
    dgs: "dgs-kampar",
};

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function resolveControlledAcronym(text: string): {
    agentId: AgentId;
    needsClarification: boolean;
    clarificationMessage?: string;
} | null {
    const normalized = normalize(text);
    const words = normalized.split(" ");

    const hasWord = (word: string) => words.includes(word);

    const hasCampusSL = () => {
        return (
            hasWord("sl") ||
            hasWord("sungai") ||
            hasWord("long") ||
            normalized.includes("sungai long") ||
            normalized.includes("sg long") ||
            normalized.includes("sglong")
        );
    };

    const hasCampusKampar = () => {
        return (
            hasWord("kampar") ||
            hasWord("kpr") ||
            hasWord("kp")
        );
    };

    // 1. DSS (Department of Safety and Security)
    if (hasWord("dss") || hasWord("dsssl") || hasWord("dsskpr")) {
        if (hasCampusSL() || hasWord("dsssl")) {
            return {
                agentId: "dss-sungai-long",
                needsClarification: false,
            };
        }
        if (hasCampusKampar() || hasWord("dsskpr")) {
            return {
                agentId: "dss-kampar",
                needsClarification: false,
            };
        }
        return {
            agentId: "general",
            needsClarification: true,
            clarificationMessage:
                "Could you please specify which campus you are referring to (Kampar or Sungai Long) for DSS?",
        };
    }

    // 2. DSA (Department of Student Affairs)
    if (hasWord("dsa") || hasWord("dsasl") || hasWord("dsakpr")) {
        if (hasCampusSL() || hasWord("dsasl")) {
            return {
                agentId: "dsa-sungai-long",
                needsClarification: false,
            };
        }
        if (hasCampusKampar() || hasWord("dsakpr")) {
            return {
                agentId: "dsa-kampar",
                needsClarification: false,
            };
        }
        return {
            agentId: "general",
            needsClarification: true,
            clarificationMessage:
                "Could you please specify which campus you are referring to (Kampar or Sungai Long) for the Department of Student Affairs (DSA)?",
        };
    }

    // 3. DISS (Department of International Student Services)
    if (hasWord("diss")) {
        return {
            agentId: "diss",
            needsClarification: false,
        };
    }

    // 4. DSSM (Division of Sustainability and Strategic Management)
    if (hasWord("dssm")) {
        return {
            agentId: "dssm",
            needsClarification: false,
        };
    }

    // 5. DGS (Department of General Services)
    if (hasWord("dgs")) {
        if (hasCampusSL()) {
            return {
                agentId: "dgs-sungai-long",
                needsClarification: false,
            };
        }
        if (hasCampusKampar()) {
            return {
                agentId: "dgs-kampar",
                needsClarification: false,
            };
        }
        return {
            agentId: "general",
            needsClarification: true,
            clarificationMessage:
                "Could you please specify which campus you are referring to (Kampar or Sungai Long) for the Department of General Services (DGS)?",
        };
    }

    return null;
}

export function detectAgentFromText(text: string): AgentId | null {
    const acronymRes = resolveControlledAcronym(text);
    if (acronymRes && !acronymRes.needsClarification) {
        return acronymRes.agentId;
    }

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
        "add/drop",
        "add drop",
        "course registration",
    ];

    return signals.some((signal) => lower.includes(signal));
}

export function routeQuestion(
    message: string,
    currentAgentId: AgentId = "general"
): RouteDecision {
    const acronymRes = resolveControlledAcronym(message);
    if (acronymRes) {
        return {
            agentId: acronymRes.agentId,
            needsClarification: acronymRes.needsClarification,
            clarificationMessage: acronymRes.clarificationMessage,
        };
    }

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