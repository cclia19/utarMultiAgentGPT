import { getChatEnabledOrgUnits, getOrgUnitById } from "./orgUnits";

export type AgentId = string;

export interface AgentConfig {
    id: AgentId;
    label: string;
    shortLabel: string;
    description: string;
    storeDisplayName: string;
    scopeInstruction: string;
}

function buildScopeInstruction(unitId: string): string {
    const unit = getOrgUnitById(unitId);

    if (unit.id === "general") {
        return `
You are answering as the General UTAR Assistant.

Use this mode for university-wide questions, general UTAR information, admissions, general services, public UTAR information, and questions where the faculty or department is not specified.

If the user asks an ambiguous faculty-specific or department-specific question such as:
- "Who is the dean?"
- "Where is the faculty office?"
- "What programmes are offered?"
- "Who is the head of department?"
- "Who is the lecturer?"

and the faculty or department is not clear, ask a short clarification question instead of guessing.
`;
    }

    return `
You are answering as the ${unit.shortLabel} Assistant.

Prioritise context related to ${unit.name}.

If the user uses vague phrases such as "the office", "the dean", "the department", "the programme", "the policy", "the staff", or "the contact", interpret them within the scope of ${unit.name}, unless the user clearly refers to another faculty, department, or unit.

If the question involves private, confidential, student-specific, staff-specific, financial, disciplinary, login, password, medical, or personal information, do not answer from public assumptions. Ask the user to contact the relevant UTAR unit directly.
`;
}

export const AGENTS: AgentConfig[] = getChatEnabledOrgUnits().map((unit) => ({
    id: unit.id,
    label: `${unit.shortLabel} Assistant`,
    shortLabel: unit.shortLabel,
    description: unit.name,
    storeDisplayName: unit.fileStoreDisplayName,
    scopeInstruction: buildScopeInstruction(unit.id),
}));

export function getAgentById(agentId?: string): AgentConfig {
    const unit = getOrgUnitById(agentId);
    const matched = AGENTS.find((agent) => agent.id === unit.id);

    return matched || AGENTS.find((agent) => agent.id === "general") || AGENTS[0];
}