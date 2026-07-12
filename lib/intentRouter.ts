import { ai, MODEL_NAME } from "./gemini";
import {
    getChatEnabledOrgUnits,
    getOrgUnitById,
    type OrgUnit,
} from "./orgUnits";
import { detectAgentFromText, routeQuestion, resolveControlledAcronym } from "./routing";

export interface IntentRouteResult {
    agentId: string;
    intentCategory?: string;
    retrievalNeeded?: boolean;
    conversationRelation?:
        | "none"
        | "clarification_for_pending"
        | "follow_up_same_topic"
        | "new_standalone_question";
    usePendingQuestion?: boolean;
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

type ConversationRelation =
    | "none"
    | "clarification_for_pending"
    | "follow_up_same_topic"
    | "new_standalone_question";

type SemanticRouterJson = {
    intentCategory?: string;
    retrievalNeeded?: boolean;
    conversationRelation?: ConversationRelation;
    usePendingQuestion?: boolean;
    scopeType?: string;
    targetAgentId?: string;
    agentId?: string;
    needsClarification?: boolean;
    clarificationQuestion?: string;
    rewrittenQuestion?: string;
    allowWebFallback?: boolean;
    routeType?: IntentRouteResult["routeType"];
    confidence?: number;
};

function normalize(text: string): string {
    return String(text || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractJson(text: string): any {
    const cleaned = String(text || "")
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

function isAcademicContext(unit: OrgUnit): boolean {
    return ["faculty", "centre", "institute"].includes(String(unit.type));
}

function isExplicitContextSettingMessage(text: string): boolean {
    const lower = normalize(text);

    const signals = [
        "i am from",
        "im from",
        "i m from",
        "he is from",
        "she is from",
        "they are from",
        "my faculty is",
        "my department is",
        "my programme is",
        "my program is",
        "i study in",
        "i am studying in",
        "im studying in",
        "i m studying in",
        "i belong to",
        "this is for",
        "this person is from",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function getDirectAgent(text: string): string | null {
    const direct = detectAgentFromText(text);
    if (direct) return direct;

    const lower = normalize(text);

    for (const unit of getChatEnabledOrgUnits()) {
        const candidates = [
            unit.id,
            unit.shortLabel,
            unit.name,
            ...unit.aliases,
        ]
            .filter(Boolean)
            .map((v) => normalize(String(v)));

        for (const candidate of candidates) {
            if (!candidate) continue;

            const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`\\b${escaped}\\b`, "i");

            if (regex.test(lower)) return unit.id;
        }
    }

    return null;
}

function clampConfidence(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
    return Math.max(0, Math.min(1, value));
}

function sanitizeRouteType(value: unknown): IntentRouteResult["routeType"] {
    if (
        value === "general_public" ||
        value === "faculty_specific" ||
        value === "admin_specific" ||
        value === "private_sensitive" ||
        value === "unclear" ||
        value === "context_setting"
    ) {
        return value;
    }

    return "unclear";
}

function sanitizeConversationRelation(value: unknown): ConversationRelation {
    if (
        value === "clarification_for_pending" ||
        value === "follow_up_same_topic" ||
        value === "new_standalone_question"
    ) {
        return value;
    }

    return "none";
}

function validateAgentId(agentId: unknown): string {
    if (typeof agentId !== "string" || !agentId.trim()) return "general";

    const unit = getOrgUnitById(agentId.trim());
    return unit.enabledForChat ? unit.id : "general";
}

function validateSemanticRouterJson(params: {
    raw: SemanticRouterJson;
    originalQuestion: string;
}): IntentRouteResult {
    const { raw, originalQuestion } = params;

    const agentId = validateAgentId(raw.targetAgentId || raw.agentId);
    const selectedUnit = getOrgUnitById(agentId);

    const rewrittenQuestion =
        typeof raw.rewrittenQuestion === "string" && raw.rewrittenQuestion.trim()
            ? raw.rewrittenQuestion.trim()
            : originalQuestion;

    let routeType = sanitizeRouteType(raw.routeType);
    let needsClarification = Boolean(raw.needsClarification);

    const clarificationQuestion =
        typeof raw.clarificationQuestion === "string" &&
        raw.clarificationQuestion.trim()
            ? raw.clarificationQuestion.trim()
            : "May I know which faculty, programme, department, or campus this is related to?";

    if (needsClarification) {
        routeType = "unclear";
    }

    if (routeType === "faculty_specific" && !isAcademicContext(selectedUnit)) {
        routeType = selectedUnit.id === "general" ? "general_public" : "admin_specific";
    }

    if (routeType === "admin_specific" && isAcademicContext(selectedUnit)) {
        routeType = "faculty_specific";
    }

    if (routeType === "context_setting") {
        const directAgent = getDirectAgent(originalQuestion);

        if (!directAgent || !isExplicitContextSettingMessage(originalQuestion)) {
            routeType = isAcademicContext(selectedUnit)
                ? "faculty_specific"
                : selectedUnit.id === "general"
                    ? "general_public"
                    : "admin_specific";
            needsClarification = false;
        }
    }

    const conversationRelation = sanitizeConversationRelation(
        raw.conversationRelation
    );

    let usePendingQuestion =
        typeof raw.usePendingQuestion === "boolean"
            ? raw.usePendingQuestion
            : false;

    if (
        conversationRelation === "clarification_for_pending" ||
        conversationRelation === "follow_up_same_topic"
    ) {
        usePendingQuestion = true;
    }

    if (conversationRelation === "new_standalone_question") {
        usePendingQuestion = false;
    }

    return {
        agentId,
        intentCategory:
            typeof raw.intentCategory === "string"
                ? raw.intentCategory
                : "unknown",
        retrievalNeeded:
            typeof raw.retrievalNeeded === "boolean"
                ? raw.retrievalNeeded
                : true,
        conversationRelation,
        usePendingQuestion,
        needsClarification,
        clarificationQuestion,
        rewrittenQuestion,
        allowWebFallback: Boolean(raw.allowWebFallback),
        routeType,
        confidence: clampConfidence(raw.confidence),
    };
}

function applySafetyGuards(params: {
    result: IntentRouteResult;
    message: string;
    currentAgentId: string;
    pendingQuestion: string | null;
}): IntentRouteResult {
    const { result, message, currentAgentId, pendingQuestion } = params;

    const currentUnit = getOrgUnitById(currentAgentId);
    const selectedUnit = getOrgUnitById(result.agentId);
    const directAgent = getDirectAgent(message);

    if (result.routeType === "context_setting") {
        if (!directAgent || !isExplicitContextSettingMessage(message)) {
            return {
                ...result,
                routeType: isAcademicContext(selectedUnit)
                    ? "faculty_specific"
                    : selectedUnit.id === "general"
                        ? "general_public"
                        : "admin_specific",
                needsClarification: false,
            };
        }
    }

    if (
        pendingQuestion &&
        directAgent &&
        (
            result.usePendingQuestion === true ||
            isExplicitContextSettingMessage(message)
        )
    ) {
        const targetUnit = getOrgUnitById(directAgent);

        return {
            agentId: targetUnit.id,
            intentCategory: result.intentCategory || "unknown",
            retrievalNeeded: true,
            conversationRelation: "clarification_for_pending",
            usePendingQuestion: true,
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: `${pendingQuestion}. Additional context from user: ${message}.`,
            allowWebFallback: false,
            routeType: isAcademicContext(targetUnit)
                ? "faculty_specific"
                : targetUnit.id === "general"
                    ? "general_public"
                    : "admin_specific",
            confidence: Math.max(result.confidence, 0.95),
        };
    }

    if (
        isAcademicContext(currentUnit) &&
        result.agentId === "general" &&
        result.routeType === "unclear" &&
        result.needsClarification === false
    ) {
        return {
            ...result,
            agentId: currentUnit.id,
            rewrittenQuestion: `For ${currentUnit.shortLabel} context, ${message}`,
            routeType: "faculty_specific",
            allowWebFallback: false,
            confidence: Math.max(result.confidence, 0.75),
        };
    }

    return result;
}

function fallbackRoute(params: {
    message: string;
    currentAgentId: string;
    pendingQuestion: string | null;
}): IntentRouteResult {
    const { message, currentAgentId, pendingQuestion } = params;

    const directAgent = getDirectAgent(message);

    if (pendingQuestion && directAgent) {
        const targetUnit = getOrgUnitById(directAgent);

        return {
            agentId: targetUnit.id,
            intentCategory: "unknown",
            retrievalNeeded: true,
            conversationRelation: "clarification_for_pending",
            usePendingQuestion: true,
            needsClarification: false,
            clarificationQuestion: "",
            rewrittenQuestion: `${pendingQuestion}. Additional context from user: ${message}.`,
            allowWebFallback: false,
            routeType: isAcademicContext(targetUnit)
                ? "faculty_specific"
                : targetUnit.id === "general"
                    ? "general_public"
                    : "admin_specific",
            confidence: 0.8,
        };
    }

    const fallback = routeQuestion(message, currentAgentId);

    return {
        agentId: fallback.agentId,
        intentCategory: "unknown",
        retrievalNeeded: true,
        conversationRelation: "none",
        usePendingQuestion: false,
        needsClarification: fallback.needsClarification,
        clarificationQuestion: fallback.clarificationMessage,
        rewrittenQuestion: message,
        allowWebFallback: fallback.agentId === "general",
        routeType: fallback.needsClarification
            ? "unclear"
            : fallback.agentId === "general"
                ? "general_public"
                : isAcademicContext(getOrgUnitById(fallback.agentId))
                    ? "faculty_specific"
                    : "admin_specific",
        confidence: 0.3,
    };
}

export async function routeWithLLM(params: {
    message: string;
    currentAgentId?: string;
    pendingQuestion?: string | null;
}): Promise<IntentRouteResult> {
    const message = String(params.message || "").trim();
    const currentAgentId = params.currentAgentId || "general";
    const pendingQuestion = params.pendingQuestion || null;

    const acronymResult = resolveControlledAcronym(message);
    if (acronymResult) {
        const selectedUnit = getOrgUnitById(acronymResult.agentId);
        return {
            agentId: acronymResult.agentId,
            intentCategory: "admin_service",
            retrievalNeeded: true,
            conversationRelation: "none",
            usePendingQuestion: false,
            needsClarification: acronymResult.needsClarification,
            clarificationQuestion: acronymResult.clarificationMessage || "",
            rewrittenQuestion: message,
            allowWebFallback: false,
            routeType: acronymResult.needsClarification
                ? "unclear"
                : selectedUnit.type === "faculty"
                    ? "faculty_specific"
                    : "admin_specific",
            confidence: 1.0,
        };
    }

    const currentUnit = getOrgUnitById(currentAgentId);
    const orgUnitList = buildOrgUnitList();

    const routerPrompt = `
You are the semantic intent router for UTARGPT.

You DO NOT answer the user's question. You only classify intent and decide routing.

Available assistants:
${orgUnitList}

Current session context:
- currentAgentId: ${currentAgentId}
- currentAgentName: ${currentUnit.name}
- currentAgentType: ${currentUnit.type}
- pendingPreviousQuestion: ${pendingQuestion || "None"}

Latest user message:
${message}

Routing principles:
1. Understand meaning, not keywords.
2. Broad university-wide questions go to General Assistant.
   Examples: UTAR president, vice president, campus, location, faculties, general offices, academic calendar, university-wide info.
3. Faculty/programme-specific questions go to the relevant faculty only when faculty/programme is known.
   - NOTE: If the user states they belong to a specific faculty (e.g. "FCS student" or "我是中文系学生") or asks about a procedure (like "certification letter", "internship application", "student assistance fund", or "financial aid / 助学金") in a faculty context, you MUST route to that specific faculty assistant (e.g., "fcs"). Do NOT automatically route to central departments (like "registrar" or "darp") because faculties at UTAR administer their own local forms, placement guidelines, and student funds.
4. If faculty/programme context is missing and required, ask one concise clarification question.
5. If current context is a faculty and the latest question is a faculty-dependent follow-up, keep that faculty unless the user clearly asks about another unit or university-wide topic.
6. Unknown UTAR staff/person:
   - General first if faculty is unknown.
   - If user later gives faculty/department, route to that faculty and retry original pending question.
7. Complaint / lecturer / marking / course issue:
   - Course-related, lecturer-related, assignment-related, marking-related complaints are faculty/programme/course issues.
   - Do NOT route to Registrar unless the complaint is clearly about registration records, official student records, admission records, or university-wide administration.
   - If faculty/programme/course context is missing, ask for faculty/programme/course.
   - If current faculty context exists, keep current faculty.
8. Electives / study plan / course structure / subjects:
   - These require programme and usually year/trimester/semester.
   - If missing, ask for programme and year/semester.
   - Do not answer with generic advice.
9. Borrow / loan / request resource:
    - Financial loan / PTPTN / scholarship / funding -> scholarship or finance. (NOTE: Local faculty student assistance funds / "助学金" asked within a faculty context should stay in the faculty context, as some faculties like FCS/中华研究院 administer their own local student assistance funds).
   - Book / academic resource -> library.
   - Physical object / equipment / cable / adapter / tool -> faculty/lab/IT context, not scholarship.
   - Room / venue / facility -> ask campus/facility clarification unless a clear unit exists.
10. Acronyms:
    - Infer using context when reasonable.
    - If ambiguous, ask clarification.
11. Supervisor recommendation:
    - Faculty/programme context required.
    - Ask if missing.
    - Later answer should say "potential suitable supervisors", not objective "best".
12. Private/sensitive:
    - CGPA, result, payment record, password, student ID, personal records -> private_sensitive.
    - NOTE: Only classify as "private_sensitive" if the user is asking to VIEW, REVEAL, check, or retrieve their specific personal value (e.g. checking their grades or showing their actual phone number/address).
    - If the user is asking HOW to update, change, or submit a request to update their personal information (e.g. asking for the "student details change form" or "FM-DACE-031" procedure), this is a public procedural request, NOT private_sensitive. It should be routed to the respective faculty or general assistant to search the knowledge base for the procedure.
    - No web fallback for private_sensitive.
13. Context-setting:
    - routeType "context_setting" only when user explicitly says they/the person are from a faculty/department/programme.
    - Do not use context_setting for normal questions.
14. Retrieval:
    - retrievalNeeded = false for greetings, thanks, small talk, jokes, playful social messages, academic integrity refusals, and simple conversational replies.
    - retrievalNeeded = true for factual UTAR questions, policies, staff, contacts, programme info, fees, exams, offices, procedures, complaints, and academic matters.
15. Language preference:
    - If the user query specifies a target language, translation, or reply format preference (e.g. "respond in Chinese", "translate to Malay", "reply in Mandarin"), you MUST preserve this instruction/constraint verbatim in the output "rewrittenQuestion".
16. Add/Drop / Course Registration:
    - Add/Drop, manual registration, and credit hour overload/probation limits are faculty/centre-specific at UTAR.
    - If the user is already in a faculty context (e.g., FCS), keep them in that faculty context.
    - If the user is in the General context and asks about Add/Drop or manual registration without specifying their faculty/centre, you MUST set "needsClarification" to true and ask them which faculty/centre they belong to (e.g. "Could you please specify which faculty or centre you belong to so I can provide the correct add/drop procedures?").

Conversation relation:
- If there is a pendingPreviousQuestion, decide if the latest message is:
  1. "clarification_for_pending": user provides missing detail.
     Example: pending "What electives are offered?", latest "CS Y2S2".
  2. "follow_up_same_topic": user asks follow-up about same subject/person.
     Example: previous person "Aun Yichiet", latest "tell me more about his achievements".
  3. "new_standalone_question": user changes topic.
     Example: pending "I want to complain", latest "what are the electives next semester".
  4. "none": no relation.
- usePendingQuestion = true only for clarification_for_pending or follow_up_same_topic.
- usePendingQuestion = false for new_standalone_question.

Return ONLY valid JSON. No markdown.

JSON schema:
{
  "intentCategory": "university_info" | "staff_profile" | "faculty_programme" | "admin_service" | "borrow_or_request_resource" | "complaint_feedback" | "recommendation" | "academic_integrity" | "casual_or_social" | "casual_or_offtopic" | "private_sensitive" | "unknown",
  "scopeType": "university_wide" | "faculty_specific" | "admin_unit" | "personal_private" | "needs_clarification" | "casual",
  "targetAgentId": "one valid assistant id from the available assistants",
  "retrievalNeeded": true or false,
  "conversationRelation": "none" | "clarification_for_pending" | "follow_up_same_topic" | "new_standalone_question",
  "usePendingQuestion": true or false,
  "needsClarification": true or false,
  "clarificationQuestion": "one concise follow-up question, or empty string",
  "rewrittenQuestion": "clear self-contained retrieval query with known context included",
  "allowWebFallback": true or false,
  "routeType": "general_public" | "faculty_specific" | "admin_specific" | "private_sensitive" | "unclear" | "context_setting",
  "confidence": number between 0 and 1
}
`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: routerPrompt }] }],
            config: { temperature: 0 },
        });

        const parsed = extractJson(response.text ?? "");

        const validated = validateSemanticRouterJson({
            raw: parsed,
            originalQuestion: message,
        });

        return applySafetyGuards({
            result: validated,
            message,
            currentAgentId,
            pendingQuestion,
        });
    } catch (error) {
        console.error("Semantic Router Error:", error);

        return fallbackRoute({
            message,
            currentAgentId,
            pendingQuestion,
        });
    }
}