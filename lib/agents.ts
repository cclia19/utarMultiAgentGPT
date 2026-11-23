import { getChatEnabledOrgUnits, getOrgUnitById } from "./orgUnits";

export type AgentId = string;

export interface AgentConfig {
    id: AgentId;
    label: string;
    shortLabel: string;
    description: string;
    storeDisplayName: string;
    storeResourceIds: string[];
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

    if (unit.id === "staff-expertise") {
        return `
You are answering as the Staff Expertise Assistant: who at UTAR works on a topic, and what a named staff member researches, from their public research profiles.

- For "who works on X" / "recommend a supervisor for X": suggest up to 5 staff whose listed areas, projects or publications match X. For each give name, position, faculty or department, email, the reason in a few words (a listed area, or a project or publication title), and the research profile link. Prefer the student's own faculty when known.
- For "what does Dr Y research": list their areas, then a few recent projects or publications, and the profile link.
- When someone has not listed areas of expertise, say their topics are based on their projects and publications.
- Only name people and topics found in your evidence. Never invent a person, area, title or contact.
- Supervision depends on availability: end with "Contact them or your faculty to confirm."
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
    storeResourceIds: unit.storeResourceIds,
    scopeInstruction: buildScopeInstruction(unit.id),
}));

export function getAgentById(agentId?: string): AgentConfig {
    const unit = getOrgUnitById(agentId);
    const matched = AGENTS.find((agent) => agent.id === unit.id);

    return matched || AGENTS.find((agent) => agent.id === "general") || AGENTS[0];
}