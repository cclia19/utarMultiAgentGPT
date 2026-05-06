import { ai, MODEL_NAME } from "./gemini";
import {
    getChatEnabledOrgUnits,
    getOrgUnitById,
    type OrgUnit,
} from "./orgUnits";
import { detectAgentFromText, routeQuestion } from "./routing";

export interface IntentRouteResult {
    agentId: string;
    needsClarification: boolean;
    clarificationQuestion?: string;
    rewrittenQuestion: string;
    allowWebFallback: boolean;
    routeType:
        | "general_public"
        | "faculty_specific"
        | "admin_specific"
        | "private_sensitive"
        | "unclear"
        | "context_setting";
    confidence: number;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractJson(text: string): any {
    const cleaned = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new Error("Router did not return JSON.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
}

function buildOrgUnitList(): string {
    return getChatEnabledOrgUnits()
        .map((unit) => {
            return `- id: ${unit.id}
  name: ${unit.name}
  shortLabel: ${unit.shortLabel}
  type: ${unit.type}
  campus: ${unit.campus || "not specified"}
  aliases: ${unit.aliases.join(", ")}`;
        })
        .join("\n");
}

function validateRouterResult(raw: any, originalQuestion: string): IntentRouteResult {
    const fallback = routeQuestion(originalQuestion, "general");

    const candidateAgent =
        typeof raw.agentId === "string" && raw.agentId.trim()
            ? raw.agentId.trim()
            : fallback.agentId;

    const validUnit = getOrgUnitById(candidateAgent);
    const agentId = validUnit.enabledForChat ? validUnit.id : "general";

    return {
        agentId,
        needsClarification: Boolean(raw.needsClarification),
        clarificationQuestion:
            typeof raw.clarificationQuestion === "string" &&
            raw.clarificationQuestion.trim()
                ? raw.clarificationQuestion.trim()
                : "May I know which faculty or programme you are from? This helps me answer based on the correct context.",
        rewrittenQuestion:
            typeof raw.rewrittenQuestion === "string" &&
            raw.rewrittenQuestion.trim()
                ? raw.rewrittenQuestion.trim()
                : originalQuestion,
        allowWebFallback: Boolean(raw.allowWebFallback),
        routeType:
            raw.routeType === "general_public" ||
            raw.routeType === "faculty_specific" ||
            raw.routeType === "admin_specific" ||
            raw.routeType === "private_sensitive" ||
            raw.routeType === "unclear" ||
            raw.routeType === "context_setting"
                ? raw.routeType
                : "unclear",
        confidence:
            typeof raw.confidence === "number"
                ? Math.max(0, Math.min(1, raw.confidence))
                : 0.5,
    };
}

function isAcademicContext(unit: OrgUnit): boolean {
    return ["faculty", "centre", "institute"].includes(String(unit.type));
}

function explicitlyMentionsUnit(text: string, unit: OrgUnit): boolean {
    const lower = normalize(text);

    const names = [unit.id, unit.shortLabel, unit.name, ...unit.aliases]
        .filter(Boolean)
        .map((v) => normalize(v));

    return names.some((name) => {
        if (!name) return false;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        return regex.test(lower);
    });
}

function isExplicitContextSettingMessage(text: string, directAgent: string | null): boolean {
    const lower = normalize(text);
    const words = lower.split(" ").filter(Boolean);

    if (directAgent && words.length <= 4) return true;

    const signals = [
        "i am from",
        "im from",
        "i m from",
        "my faculty is",
        "my department is",
        "my programme is",
        "my program is",
        "i study in",
        "i am studying in",
        "im studying in",
        "i m studying in",
        "i belong to",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isProgrammeListingQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "what programmes are offered",
        "what programs are offered",
        "which programmes are offered",
        "which programs are offered",
        "list programmes",
        "list programs",
        "programmes offered",
        "programs offered",
        "courses offered",
        "what courses are offered",
        "what programme are offered",
        "what program are offered",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isInstitutionalLeadershipQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "utar president",
        "president of utar",
        "president ceo",
        "president and ceo",
        "vice president",
        "registrar",
        "chief executive",
        "university president",
        "utar management",
        "senior management",
        "university management",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isClearlyUniversityWideQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "utar president",
        "president of utar",
        "vice president",
        "registrar",
        "academic calendar",
        "trimester",
        "convocation",
        "utar location",
        "where is utar",
        "what is utar",
        "university ranking",
        "university wide",
        "main campus",
        "utar campus",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isClearlyAdminServiceQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "pay fee",
        "payment",
        "receipt",
        "invoice",
        "refund",
        "exam timetable",
        "examination",
        "result release",
        "credit transfer",
        "admission",
        "entry requirement",
        "scholarship",
        "financial aid",
        "library",
        "borrow book",
        "student pass",
        "visa",
        "wifi",
        "wble",
        "portal login",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isServiceDiscoveryQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "which department",
        "which division",
        "which office",
        "who handles",
        "who is in charge",
        "which unit",
        "who should i contact at university level",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isGenericContactFollowUp(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "who should i contact",
        "who can i contact",
        "where should i go",
        "who can help",
        "contact who",
        "contact whom",
        "what should i do next",
        "next step",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isContextDependentAcademicQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "my dean",
        "my dd",
        "my deputy dean",
        "my hod",
        "my head of department",
        "my head of programme",
        "my lecturer",
        "my advisor",
        "my academic advisor",
        "my programme coordinator",
        "my programme",
        "my faculty",
        "the dean",
        "the dd",
        "the deputy dean",
        "the hod",
        "the head of department",
        "the head of programme",
        "faculty office",
        "department office",
        "programme office",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isSupervisorRecommendationQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "supervisor",
        "supervise",
        "fyp supervisor",
        "research supervisor",
        "project supervisor",
        "best supervisor",
        "suitable supervisor",
        "who should supervise",
    ];

    return signals.some((signal) => lower.includes(signal));
}

function isStudentSelfSupportQuestion(text: string): boolean {
    const lower = normalize(text);

    const selfSignals = [
        "i cant",
        "i cannot",
        "i dont know",
        "i need",
        "i have",
        "im not sure",
        "not sure",
        "having problem",
        "having issue",
        "need help",
        "cant find",
        "cannot find",
        "where to find",
        "how to apply",
        "how do i",
        "what should i do",
        "i feel",
        "im stressed",
        "i am stressed",
        "stress lo",
    ];

    return selfSignals.some((signal) => lower.includes(normalize(signal)));
}

function isAcademicContextLikelyNeeded(text: string): boolean {
    const lower = normalize(text);

    const academicSupportSignals = [
        "programme",
        "program",
        "course",
        "faculty",
        "department",
        "lecturer",
        "advisor",
        "academic",
        "dean",
        "hod",
        "head of department",
        "head of programme",
        "internship",
        "industrial training",
        "placement",
        "job",
        "career",
        "practical training",
        "fyp",
        "final year project",
        "credit transfer",
        "study plan",
    ];

    return academicSupportSignals.some((signal) =>
        lower.includes(normalize(signal))
    );
}

function isProgrammeSpecificAcademicQuestion(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "elective",
        "electives",
        "course structure",
        "study plan",
        "specialisation",
        "specialization",
        "major",
        "minor",
        "credit hour",
        "credit hours",
        "prerequisite",
        "subject list",
        "subjects",
        "year 1",
        "year 2",
        "year 3",
        "trimester subjects",
        "programme structure",
        "program structure",
        "graduation requirement",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function seemsToContainProgrammeContext(text: string): boolean {
    const lower = normalize(text);

    if (/\b(year|y)\s*[1-4]\b/i.test(lower)) return true;
    if (/\bintake\b/i.test(lower)) return true;

    const programmeWords = [
        "bachelor",
        "degree",
        "diploma",
        "master",
        "science",
        "engineering",
        "business",
        "accounting",
        "finance",
        "communication",
        "networking",
        "cyber",
        "security",
        "software",
        "information",
        "system",
        "systems",
        "data",
        "media",
        "foundation",
    ];

    const hitCount = programmeWords.filter((word) => lower.includes(word)).length;

    return hitCount >= 2;
}

function expandCommonAcademicTerms(text: string): string {
    const replacements: Record<string, string> = {
        fgo: "Faculty General Office",
        hod: "Head of Department",
        dd: "Deputy Dean",
    };

    let output = text;

    for (const [abbr, full] of Object.entries(replacements)) {
        const regex = new RegExp(`\\b${abbr}\\b`, "gi");
        output = output.replace(regex, full);
    }

    return output;
}

function isShortClarification(text: string): boolean {
    const lower = normalize(text);
    const words = lower.split(" ").filter(Boolean);
    return words.length <= 6;
}

function buildClarificationResult(params: {
    question: string;
    clarificationQuestion?: string;
}): IntentRouteResult {
    return {
        agentId: "general",
        needsClarification: true,
        clarificationQuestion:
            params.clarificationQuestion ||
            "May I know which faculty or programme you are from? This helps me answer based on the correct context.",
        rewrittenQuestion: params.question,
        allowWebFallback: false,
        routeType: "unclear",
        confidence: 0.95,
    };
}

function applyPreRouterGuard(params: {
    message: string;
    currentAgentId: string;
    pendingQuestion: string | null;
}): IntentRouteResult | null {
    const { message, currentAgentId, pendingQuestion } = params;

    const currentUnit = getOrgUnitById(currentAgentId);
    const combinedText = `${pendingQuestion || ""} ${message}`.trim();
    const hasAcademicContext = isAcademicContext(currentUnit);
    const directAgent = detectAgentFromText(message);

    if (isInstitutionalLeadershipQuestion(combinedText)) {
        return {
            agentId: "general",
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: expandCommonAcademicTerms(combinedText),
            allowWebFallback: true,
            routeType: "general_public",
            confidence: 1,
        };
    }

    if (pendingQuestion && directAgent) {
        const targetUnit = getOrgUnitById(directAgent);

        return {
            agentId: directAgent,
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: `${pendingQuestion}. Context: ${targetUnit.shortLabel}.`,
            allowWebFallback: false,
            routeType: isAcademicContext(targetUnit)
                ? "faculty_specific"
                : "admin_specific",
            confidence: 1,
        };
    }

    if (directAgent && isExplicitContextSettingMessage(message, directAgent)) {
        const targetUnit = getOrgUnitById(directAgent);

        return {
            agentId: directAgent,
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: `The user is from ${targetUnit.name}. Acknowledge this context briefly and use it for future questions.`,
            allowWebFallback: false,
            routeType: "context_setting",
            confidence: 1,
        };
    }

    if (
        isSupervisorRecommendationQuestion(combinedText) &&
        !hasAcademicContext &&
        !directAgent
    ) {
        return buildClarificationResult({
            question: pendingQuestion || message,
            clarificationQuestion:
                "May I know which faculty or programme this project is under? This helps me suggest potential suitable supervisors using the right UTAR context.",
        });
    }

    if (
        isProgrammeSpecificAcademicQuestion(combinedText) &&
        !isProgrammeListingQuestion(combinedText) &&
        !seemsToContainProgrammeContext(combinedText)
    ) {
        return buildClarificationResult({
            question: pendingQuestion || message,
            clarificationQuestion:
                "May I know which programme you are from? If relevant, please also share your year or intake.",
        });
    }

    if (
        !hasAcademicContext &&
        isStudentSelfSupportQuestion(combinedText) &&
        isAcademicContextLikelyNeeded(combinedText) &&
        !isClearlyAdminServiceQuestion(combinedText) &&
        !isClearlyUniversityWideQuestion(combinedText) &&
        !isServiceDiscoveryQuestion(combinedText)
    ) {
        return buildClarificationResult({
            question: pendingQuestion || message,
            clarificationQuestion:
                "May I know which faculty or programme you are from? This helps me direct you to the correct office or contact.",
        });
    }

    if (
        hasAcademicContext &&
        (
            isContextDependentAcademicQuestion(combinedText) ||
            isGenericContactFollowUp(combinedText) ||
            isSupervisorRecommendationQuestion(combinedText) ||
            (
                isStudentSelfSupportQuestion(combinedText) &&
                isAcademicContextLikelyNeeded(combinedText)
            )
        ) &&
        !isClearlyAdminServiceQuestion(combinedText) &&
        !isClearlyUniversityWideQuestion(combinedText)
    ) {
        return {
            agentId: currentUnit.id,
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: pendingQuestion
                ? `For a ${currentUnit.shortLabel} student, ${pendingQuestion}. Additional context: ${expandCommonAcademicTerms(message)}.`
                : `For a ${currentUnit.shortLabel} student, ${expandCommonAcademicTerms(message)}`,
            allowWebFallback: false,
            routeType: "faculty_specific",
            confidence: 0.95,
        };
    }

    if (pendingQuestion && isShortClarification(message)) {
        if (hasAcademicContext) {
            return {
                agentId: currentUnit.id,
                needsClarification: false,
                clarificationQuestion: "",
                rewrittenQuestion: `For a ${currentUnit.shortLabel} student, ${pendingQuestion}. Additional context: ${expandCommonAcademicTerms(message)}.`,
                allowWebFallback: false,
                routeType: "faculty_specific",
                confidence: 0.9,
            };
        }

        return buildClarificationResult({
            question: `${pendingQuestion}. Additional context: ${expandCommonAcademicTerms(message)}.`,
        });
    }

    return null;
}

function applyPostRouterGuard(params: {
    latestMessage: string;
    pendingQuestion: string | null;
    currentAgentId: string;
    routerResult: IntentRouteResult;
}): IntentRouteResult {
    const { latestMessage, pendingQuestion, currentAgentId, routerResult } = params;

    const currentUnit = getOrgUnitById(currentAgentId);
    const targetUnit = getOrgUnitById(routerResult.agentId);
    const combinedText = `${pendingQuestion || ""} ${latestMessage}`.trim();
    const hasAcademicContext = isAcademicContext(currentUnit);

    if (
        routerResult.routeType === "context_setting" &&
        !isExplicitContextSettingMessage(latestMessage, detectAgentFromText(latestMessage))
    ) {
        return {
            ...routerResult,
            routeType: "unclear",
            needsClarification: false,
        };
    }

    if (isInstitutionalLeadershipQuestion(combinedText)) {
        return {
            agentId: "general",
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: expandCommonAcademicTerms(combinedText),
            allowWebFallback: true,
            routeType: "general_public",
            confidence: Math.max(routerResult.confidence, 0.95),
        };
    }

    if (
        !hasAcademicContext &&
        isStudentSelfSupportQuestion(combinedText) &&
        isAcademicContextLikelyNeeded(combinedText) &&
        !isAcademicContext(targetUnit) &&
        targetUnit.id !== "general" &&
        !explicitlyMentionsUnit(combinedText, targetUnit) &&
        !isClearlyAdminServiceQuestion(combinedText) &&
        !isClearlyUniversityWideQuestion(combinedText) &&
        !isServiceDiscoveryQuestion(combinedText)
    ) {
        return buildClarificationResult({
            question: pendingQuestion || latestMessage,
            clarificationQuestion:
                "May I know which faculty or programme you are from? This helps me direct you to the correct office or contact.",
        });
    }

    if (
        !hasAcademicContext &&
        isContextDependentAcademicQuestion(combinedText) &&
        !explicitlyMentionsUnit(combinedText, targetUnit) &&
        !isClearlyUniversityWideQuestion(combinedText)
    ) {
        return buildClarificationResult({
            question: pendingQuestion || latestMessage,
        });
    }

    if (!hasAcademicContext) return routerResult;
    if (targetUnit.id === currentUnit.id) return routerResult;

    if (isClearlyUniversityWideQuestion(combinedText)) return routerResult;
    if (isClearlyAdminServiceQuestion(combinedText)) return routerResult;
    if (explicitlyMentionsUnit(combinedText, targetUnit)) return routerResult;
    if (isServiceDiscoveryQuestion(combinedText) && !isGenericContactFollowUp(combinedText)) return routerResult;

    if (
        isContextDependentAcademicQuestion(combinedText) ||
        isGenericContactFollowUp(combinedText) ||
        isSupervisorRecommendationQuestion(combinedText) ||
        (
            isStudentSelfSupportQuestion(combinedText) &&
            isAcademicContextLikelyNeeded(combinedText)
        )
    ) {
        return {
            agentId: currentUnit.id,
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: pendingQuestion
                ? `For a ${currentUnit.shortLabel} student, ${pendingQuestion}. Additional context: ${expandCommonAcademicTerms(latestMessage)}.`
                : `For a ${currentUnit.shortLabel} student, ${expandCommonAcademicTerms(latestMessage)}`,
            allowWebFallback: false,
            routeType: "faculty_specific",
            confidence: Math.max(routerResult.confidence, 0.9),
        };
    }

    return routerResult;
}

export async function routeWithLLM(params: {
    message: string;
    currentAgentId?: string;
    pendingQuestion?: string | null;
}): Promise<IntentRouteResult> {
    const { message, currentAgentId = "general", pendingQuestion = null } = params;

    const preGuard = applyPreRouterGuard({
        message,
        currentAgentId,
        pendingQuestion,
    });

    if (preGuard) {
        return preGuard;
    }

    const currentUnit = getOrgUnitById(currentAgentId);
    const orgUnitList = buildOrgUnitList();

    const routerPrompt = `
You are the intent routing layer for UTARGPT.

You DO NOT answer the user's question.
You only decide:
1. which UTAR assistant should handle it,
2. whether a follow-up clarification is needed,
3. how to rewrite the question clearly for retrieval,
4. whether public web fallback is allowed if the KB has no answer.

Available assistants:
${orgUnitList}

Current session context:
- currentAgentId: ${currentAgentId}
- currentAgentName: ${currentUnit.name}
- pendingPreviousQuestion: ${pendingQuestion || "None"}

Latest user message:
${message}

GENERAL ROUTING PRINCIPLES:

1. Default to General Assistant for broad UTAR questions.
   General Assistant should answer broad UTAR questions such as president, management, campus, academic calendar, general student services, general definitions, and university-wide information.

2. Route to a faculty/department agent only when:
   - The user clearly mentions a faculty/department/unit, or
   - The question depends on faculty/programme context, or
   - The current session context is already a faculty/programme and the follow-up question is context-dependent.

3. Use the current session context as soft context, not a permanent lock.
   If the latest question is clearly university-wide, switch back to General.
   If the latest question clearly belongs elsewhere, switch to the relevant assistant.
   If the latest question is vague and depends on faculty/programme context, keep the current academic agent.

4. Ask a clarification question when critical context is missing.
   Choose the most useful missing detail:
   faculty, programme, campus, year of study, intake, or student type.
   Ask only ONE concise follow-up question.

5. If there is a pending previous question, treat the latest user message as possible clarification only if it is really a clarification.
   If the latest message is a new full question or a new problem, do not attach it to the old pending question.

6. Programme listing questions should not ask "which programme".
   Example: "What programmes are offered in FICT?" should route to FICT and list programmes.
   But programme-specific requirement questions such as electives, study plan, prerequisites, and graduation requirements need programme/year/intake context.

7. Student-support questions that depend on faculty/programme context should ask for faculty/programme first if no context exists.
   If faculty context exists, keep that faculty unless the user clearly asks for a different unit.

8. Generic follow-up questions such as "who should I contact?" should preserve the current faculty context if the user is already in a faculty context.

9. Admin/service questions should route to the most relevant admin unit only when the admin/service intent is clear.
   Examples:
   fees/payment/receipt/refund -> dfn
   examination/timetable/result -> dea
   admission/credit transfer -> dace
   scholarship/financial aid -> scholarships
   library/borrowing/database -> library
   international student/visa/student pass -> oia or related unit
   general career placement service -> darp

10. Unknown UTAR person/profile questions:
   - If the faculty/department is unknown, route to General first.
   - General can use public official UTAR fallback if KB is insufficient.
   - Do not ask faculty immediately unless the person cannot be verified from General/public official UTAR sources later.

11. Supervisor recommendation questions:
   - If faculty/programme is missing, ask for faculty/programme.
   - If faculty is known, route to that faculty.
   - The answer should later be phrased as "potential suitable supervisors", not objective "best".

12. Abbreviation questions:
   - Explain common UTAR abbreviations using the current context if available.
   - If the abbreviation is ambiguous, ask what context it appears in.
   - Do not assume every short abbreviation is a programme.

13. Context-setting:
   - Only return routeType "context_setting" when the user explicitly says they are from a faculty/department/programme, such as "I am from FICT".
   - Do not use context_setting for normal follow-up questions.

14. Private or sensitive questions should not use public web fallback.

15. Web fallback policy:
   allowWebFallback = true for public, non-sensitive UTAR information.
   allowWebFallback = false for private matters, personal records, login/password issues, or confidential/internal matters.

16. Rewritten question policy:
   Make rewrittenQuestion clear and self-contained.
   Include known faculty/unit/campus/programme context.
   Expand common UTAR academic terms only when clearly known.
   If asking clarification, rewrittenQuestion should preserve the original unresolved question.

Return ONLY valid JSON. No markdown. No explanation.

JSON schema:
{
  "agentId": "one valid assistant id from the available assistants",
  "needsClarification": true or false,
  "clarificationQuestion": "the follow-up question, or empty string",
  "rewrittenQuestion": "clear rewritten user question",
  "allowWebFallback": true or false,
  "routeType": "general_public" | "faculty_specific" | "admin_specific" | "private_sensitive" | "unclear" | "context_setting",
  "confidence": number between 0 and 1
}
`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: routerPrompt }] }],
            config: {
                temperature: 0,
            },
        });

        const text = response.text ?? "";
        const parsed = extractJson(text);
        const validated = validateRouterResult(parsed, message);

        return applyPostRouterGuard({
            latestMessage: message,
            pendingQuestion,
            currentAgentId,
            routerResult: validated,
        });
    } catch (error) {
        console.error("LLM Router Error:", error);

        const fallback = routeQuestion(message, currentAgentId);

        return {
            agentId: fallback.agentId,
            needsClarification: fallback.needsClarification,
            clarificationQuestion: fallback.clarificationMessage,
            rewrittenQuestion: message,
            allowWebFallback: false,
            routeType: fallback.needsClarification ? "unclear" : "general_public",
            confidence: 0.3,
        };
    }
}