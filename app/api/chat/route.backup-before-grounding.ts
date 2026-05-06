import { NextRequest, NextResponse } from "next/server";
import { ai, MODEL_NAME } from "@/lib/gemini";
import { getAgentById } from "@/lib/agents";
import { detectAgentFromText } from "@/lib/routing";
import { routeWithLLM } from "@/lib/intentRouter";

type OfficialLink = {
    title: string;
    uri: string;
};

type WebFallbackResult = {
    text: string;
    citations: string[];
    needsClarification?: boolean;
    pendingQuestion?: string | null;
};

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function detectTone(message: string): "casual" | "formal" {
    const lower = normalize(message);

    const casualSignals = [
        "la",
        "lah",
        "lo",
        "lor",
        "leh",
        "aiyo",
        "walao",
        "alamak",
        "bro",
        "sis",
        "stress",
        "stressed",
        "hungry",
        "gf",
        "girlfriend",
        "boyfriend",
        "handsome",
        "leng zai",
    ];

    return casualSignals.some((signal) => lower.includes(normalize(signal)))
        ? "casual"
        : "formal";
}

function extractResponseText(response: any): string {
    let responseText = response.text ?? "";

    if (!responseText && response.candidates && response.candidates[0]?.content?.parts) {
        responseText = response.candidates[0].content.parts
            .filter((p: any) => typeof p.text === "string")
            .map((p: any) => p.text as string)
            .join("");
    }

    return responseText || "No response generated.";
}

function extractCitations(response: any): string[] {
    const candidates = response.candidates;
    let citations: string[] = [];

    if (candidates && candidates[0].groundingMetadata?.groundingChunks) {
        citations = candidates[0].groundingMetadata.groundingChunks
            .map((chunk: any) => {
                if (chunk.web?.uri) return chunk.web.uri;
                if (chunk.web?.title) return chunk.web.title;
                if (chunk.retrievedContext?.title) return chunk.retrievedContext.title;
                return "Unknown Source";
            })
            .filter(
                (val: string, index: number, self: string[]) =>
                    val && self.indexOf(val) === index
            );
    }

    return citations;
}

function isOfficialUtarSource(uri: string, title = ""): boolean {
    try {
        const url = new URL(uri);
        const host = url.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();
        const combined = `${host} ${path} ${title.toLowerCase()}`;

        if (
            host === "utar.edu.my" ||
            host.endsWith(".utar.edu.my") ||
            host.includes("utar.edu.my")
        ) {
            return true;
        }

        const isSocial =
            host.includes("facebook.com") ||
            host.includes("instagram.com") ||
            host.includes("linkedin.com") ||
            host.includes("youtube.com") ||
            host.includes("youtu.be") ||
            host.includes("x.com") ||
            host.includes("twitter.com");

        if (!isSocial) return false;

        return (
            combined.includes("utar") ||
            combined.includes("universiti tunku abdul rahman") ||
            combined.includes("universiti-tunku-abdul-rahman")
        );
    } catch {
        return false;
    }
}

function cleanLinkTitle(title: string, uri: string): string {
    const cleaned = title
        .replace(/\s*\|\s*Universiti Tunku Abdul Rahman.*$/i, "")
        .replace(/\s*-\s*Universiti Tunku Abdul Rahman.*$/i, "")
        .replace(/\s*-\s*UTAR.*$/i, "")
        .replace(/\s*\|\s*UTAR.*$/i, "")
        .trim();

    if (cleaned.length >= 4) return cleaned;

    try {
        const url = new URL(uri);
        return url.hostname.replace(/^www\./, "");
    } catch {
        return "Official UTAR Link";
    }
}

function extractOfficialWebLinks(response: any): OfficialLink[] {
    const candidates = response.candidates;
    const links: OfficialLink[] = [];

    if (!candidates || !candidates[0]?.groundingMetadata?.groundingChunks) {
        return links;
    }

    for (const chunk of candidates[0].groundingMetadata.groundingChunks) {
        const title = chunk.web?.title || "";
        const uri = chunk.web?.uri;

        if (!uri || !isOfficialUtarSource(uri, title)) continue;

        links.push({
            title: cleanLinkTitle(title || "Official UTAR Link", uri),
            uri,
        });
    }

    const seen = new Set<string>();

    return links.filter((link) => {
        if (seen.has(link.uri)) return false;
        seen.add(link.uri);
        return true;
    });
}

function extractAllWebLinks(response: any): OfficialLink[] {
    const candidates = response.candidates;
    const links: OfficialLink[] = [];

    if (!candidates || !candidates[0]?.groundingMetadata?.groundingChunks) {
        return links;
    }

    for (const chunk of candidates[0].groundingMetadata.groundingChunks) {
        const title = chunk.web?.title || "";
        const uri = chunk.web?.uri;

        if (!uri) continue;

        links.push({
            title: cleanLinkTitle(title || "Web Link", uri),
            uri,
        });
    }

    const seen = new Set<string>();

    return links.filter((link) => {
        if (seen.has(link.uri)) return false;
        seen.add(link.uri);
        return true;
    });
}

function appendOfficialLinks(text: string, links: OfficialLink[], options?: { profileMode?: boolean }): string {
    if (!links.length) return text;

    const profileMode = Boolean(options?.profileMode);

    const filtered = links
        .filter((link) => {
            const title = link.title.toLowerCase();
            const uri = link.uri.toLowerCase();

            if (text.includes(link.uri)) return false;

            if (profileMode) {
                if (title.includes("welcome message")) return false;
                if (uri.includes("welcome")) return false;
            }

            return true;
        })
        .slice(0, 4);

    if (!filtered.length) return text;

    const linkBlock = filtered
        .map((link) => `- [${link.title}](${link.uri})`)
        .join("\n");

    return `${text.trim()}

### 🔗 Official Links

${linkBlock}`;
}

function shouldUseWebFallback(text: string): boolean {
    const lower = text.toLowerCase().trim();

    const weakOrNotFoundSignals = [
        "i couldn't find any information",
        "i couldn't find that information in the university documents",
        "i couldn't find that information",
        "couldn't find that information",
        "not found in the university documents",
        "no information in the university documents",
        "no response generated",
        "the search results don't provide",
        "the search results do not provide",
        "doesn't provide a direct statement",
        "does not provide a direct statement",
        "strongly implies",
        "typically enforce",
        "universities typically",
        "i could not verify",
        "could not be verified",
        "not explicitly listed",
        "isn't explicitly listed",
        "is not explicitly listed",
        "you can typically find it",
        "a general university contact might",
    ];

    return weakOrNotFoundSignals.some((signal) => lower.includes(signal));
}

function isInstitutionalLeadershipQuestion(message: string): boolean {
    const lower = normalize(message);

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

function isProfileQuestion(message: string): boolean {
    const lower = message.toLowerCase();

    const profileSignals = [
        "who is",
        "who's",
        "profile",
        "president",
        "ceo",
        "dean",
        "director",
        "head of programme",
        "hop",
        "lecturer",
        "staff",
        "professor",
        "dr ",
        "ts dr",
        "ir.",
        "dato",
        "hod",
        "head of department",
        "deputy dean",
        "supervisor",
    ];

    return profileSignals.some((signal) => lower.includes(signal));
}

function isSupervisorRecommendationQuestion(message: string): boolean {
    const lower = message.toLowerCase();

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

function isSensitiveOrInternalQuestion(message: string): boolean {
    const lower = message.toLowerCase();

    const sensitiveSignals = [
        "password",
        "login",
        "student id",
        "ic number",
        "nric",
        "disciplinary",
        "medical record",
        "result",
        "grade",
        "cgpa",
        "gpa",
        "fee outstanding",
        "payment record",
        "salary",
        "private",
        "confidential",
        "internal memo",
        "personal data",
        "my refund status",
        "my payment record",
        "my result",
        "my cgpa",
        "my gpa",
    ];

    return sensitiveSignals.some((signal) => lower.includes(signal));
}

function isLikelyUtarQuestion(message: string): boolean {
    const lower = normalize(message);

    const signals = [
        "utar",
        "faculty",
        "programme",
        "program",
        "course",
        "student",
        "campus",
        "kampar",
        "sungai long",
        "fict",
        "fbf",
        "fegt",
        "fas",
        "dsa",
        "dea",
        "dfn",
        "dace",
        "ipsr",
        "exam",
        "fee",
        "payment",
        "scholarship",
        "admission",
        "credit transfer",
        "dean",
        "hod",
        "lecturer",
        "supervisor",
        "internship",
        "industrial training",
        "cgpa",
        "wble",
        "portal",
        "library",
        "counselling",
        "counseling",
        "stressed",
        "stress",
        "dr ",
        "ts dr",
        "prof",
        "professor",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function looksLikeNewQuestionOrIssue(message: string): boolean {
    const lower = normalize(message);

    const signals = [
        "who ",
        "what ",
        "where ",
        "when ",
        "why ",
        "how ",
        "i cant",
        "i cannot",
        "i need",
        "i want",
        "i feel",
        "internship",
        "job",
        "stress",
        "stressed",
        "hungry",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isLikelyClarificationReply(message: string, detectedAgentFromReply: string | null): boolean {
    if (detectedAgentFromReply) return true;

    if (looksLikeNewQuestionOrIssue(message)) return false;

    const lower = normalize(message);
    const words = lower.split(" ").filter(Boolean);

    const clarificationSignals = [
        "i am from",
        "im from",
        "i m from",
        "from",
        "my faculty is",
        "my programme is",
        "my program is",
        "i study",
        "i am studying",
    ];

    if (clarificationSignals.some((signal) => lower.includes(normalize(signal)))) {
        return true;
    }

    return words.length <= 4;
}

function tryHandleOffTopic(message: string): string | null {
    const lower = normalize(message);

    const commonOffTopicSignals = [
        "weather",
        "football score",
        "stock price",
        "bitcoin",
        "recipe",
        "movie",
        "song",
        "celebrity",
        "random joke",
        "tell me a joke",
    ];

    if (
        !isLikelyUtarQuestion(message) &&
        commonOffTopicSignals.some((signal) => lower.includes(normalize(signal)))
    ) {
        return `
I’m mainly here to help with UTAR-related questions. 😊

### 📌 I can help with

- Courses and programmes
- Fees, exams, admissions, and scholarships
- Faculty/department contacts
- Campus services and student support
- UTAR staff, offices, and official information

Ask me something UTAR-related and I’ll help route it properly.
`.trim();
    }

    return null;
}

function tryHandleVulgarity(message: string): string | null {
    const lower = normalize(message);

    const vulgarSignals = [
        "fuck you",
        "f u",
        "stupid bot",
        "idiot",
        "dumb bot",
    ];

    if (!vulgarSignals.some((signal) => lower.includes(normalize(signal)))) {
        return null;
    }

    return `
Wah, spicy mode activated. 😅

I’m still here to help — ask me anything UTAR-related like fees, exams, staff, offices, courses, or student support.

### 🥑 Reset button

Let’s try again nicely. What do you need help with?
`.trim();
}

function tryHandlePlayfulStudentChat(message: string): string | null {
    const lower = normalize(message);

    if (
        (lower.includes("handsome") || lower.includes("leng zai")) &&
        (lower.includes("lecturer") || lower.includes("guy") || lower.includes("person") || lower.includes("utar"))
    ) {
        return `
This is a very difficult academic question. 🤔

After careful analysis, cross-validation, and absolutely no bias at all...

### 🥑 Final Answer

**AVO YYDS 🥑**

You know I know. 😎
`.trim();
    }

    if (lower.includes("who is avo") || lower.includes("who is avocado") || lower === "avo" || lower === "avocado") {
        return `
Avo is my daddy 🥑 — not the sugar type.

He helped create me so students don’t have to be lonely.

### 🥑 Lore unlocked

- #dontworry
- #behappy
`.trim();
    }

    if (
        lower.includes("girlfriend") ||
        lower.includes("boyfriend") ||
        lower.includes("find gf") ||
        lower.includes("find bf")
    ) {
        return `
Aiyo, this one not in the course structure la. 😆

### 💘 FICT relationship forecast

- **Chances:** Not impossible.
- **Requirement:** Go out, join activities, talk to people, don’t just debug alone.
- **Warning:** Group assignment chemistry is not always romantic chemistry.

### 🥑 Avo tip

Start with making friends first. If got spark, then only upgrade version. 😄
`.trim();
    }

    if (lower.includes("utar my choice")) {
        return `
UTAR my choice? 😆

### 🤔 Real question

You sure or not... or your parents’ choice?

Either way, welcome to the grind. We make it work. 💪
`.trim();
    }

    return null;
}

function buildSensitiveResponse(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes("cgpa") || lower.includes("gpa") || lower.includes("result") || lower.includes("grade")) {
        return `
Uh oh — this one is private student info. 🙈

I can’t view or retrieve your CGPA, GPA, grades, or exam results here. We don’t want to accidentally leak your academic “power level”. 😄

### 🎓 What you can do

- Log in to the official UTAR student portal to check your academic record.
- If the result is missing or looks incorrect, contact your faculty office or the relevant examination/records unit.

### 🔒 Why I can’t show it here

- CGPA and results are personal academic records.
- They should only be accessed through authenticated UTAR systems.
- Please do not share screenshots containing your student ID, result slip, IC/passport number, or private details here.
`.trim();
    }

    if (lower.includes("payment record") || lower.includes("refund") || lower.includes("fee outstanding")) {
        return `
This looks like private financial information. 🔒

I can’t check your personal payment, refund, or outstanding fee record here.

### 💳 What you can do

- Log in to the official UTAR student portal or payment system.
- Contact the Division of Finance if the amount shown does not look right.
- Keep your receipt or transaction reference ready when contacting the office.

### ⚠️ Quick reminder

Please do not share your student ID, IC/passport number, payment reference, or screenshots containing private details in this chat.
`.trim();
    }

    if (lower.includes("password") || lower.includes("login") || lower.includes("portal")) {
        return `
This looks like an account/login matter. 🔐

I can’t reset passwords or check your account access here.

### ✅ What you can do

- Use the official UTAR account recovery or portal login support channel.
- Contact the relevant IT support unit if you still cannot log in.
- Never share your password or one-time code in chat.
`.trim();
    }

    return `
This looks like private or internal information. 🔒

I can’t retrieve personal records, internal records, or confidential details here.

### ✅ What you can do

- Log in through the official UTAR system if this relates to your personal record.
- Contact the relevant UTAR department directly for verification.
- Avoid sharing personal identifiers or private documents in this chat.
`.trim();
}

function tryHandleEasterEgg(message: string): string | null {
    const lower = message.toLowerCase();

    const builtYouSignals = [
        "who built you",
        "who made you",
        "who created you",
        "who is your creator",
    ];

    if (builtYouSignals.some((signal) => lower.includes(signal))) {
        return `
You know, I know. 😌

### 🥑 Hidden lore

- Built with UTARGPT energy.
- Powered by knowledge, caffeine, and slightly too many debugging sessions.
- **AVO YYDS 🥑**
`.trim();
    }

    return null;
}

function tryHandleFoodQuestion(message: string): string | null {
    const lower = message.toLowerCase();

    const foodSignals = [
        "i am hungry",
        "im hungry",
        "i m hungry",
        "hungry",
        "where to eat",
        "what to eat",
        "lunch",
        "dinner",
        "food",
        "cafeteria",
    ];

    if (!foodSignals.some((signal) => lower.includes(signal))) {
        return null;
    }

    return `
Hungry mode detected. 🍽️

### 😋 Quick food ideas around Kampar campus

- **Olive Places** — convenient if you are around the FICT side.
- **Student Pavilion I (Block C)** — near the FICT area, with local food options.
- **Student Pavilion II (Block K)** — another cafeteria option further inside campus.
- **Heritage Hall (Block A)** — also has cafeteria-style food options.

### 🥑 Avo tip

If you are rushing between classes, go for the nearest option first. Food now, deep life decision later. 😄
`.trim();
}

function tryHandleEmotionalCasualSupport(message: string): string | null {
    const lower = normalize(message);

    const stressSignals = [
        "stress",
        "stressed",
        "stress lo",
        "too much pressure",
        "cannot tahan",
        "burnout",
        "tired of study",
    ];

    if (!stressSignals.some((signal) => lower.includes(normalize(signal)))) {
        return null;
    }

    const casual = detectTone(message) === "casual";

    return casual
        ? `
Aiyo, don’t tahan alone la. 💙

Stress is real, especially when assignments, exams, and life all stack together.

### 🧘 What you can do now

- Take a short break first — drink water, breathe, and reset.
- Talk to someone you trust: friend, lecturer, advisor, or family.
- If it keeps affecting your sleep, study, or mood, reach out to UTAR student support / counselling services.

### 📌 UTAR support direction

- Look for **Department of Student Affairs (DSA)** or **Counselling and Guidance** support at your campus.
- If you feel unsafe or urgently need help, contact campus security, emergency services, or a trusted person immediately.

You don’t need to settle everything today. One small step first can already help. 🌱
`.trim()
        : `
I'm sorry you're feeling stressed. 💙

### 🧘 What you can do now

- Take a short break and breathe.
- Talk to someone you trust.
- Reach out to UTAR student support or counselling services if the stress continues.

### 📌 UTAR support direction

- Look for **Department of Student Affairs (DSA)** or **Counselling and Guidance** support at your campus.
- If you feel unsafe or urgently need help, contact campus security, emergency services, or a trusted person immediately.
`.trim();
}

function extractPossiblePersonName(message: string): string {
    return message
        .replace(/\?/g, "")
        .replace(/\bwho is\b/gi, "")
        .replace(/\bwho's\b/gi, "")
        .replace(/\bprofile of\b/gi, "")
        .replace(/\btell me about\b/gi, "")
        .replace(/\bdr\.\s*/gi, "")
        .replace(/\bdr\s+/gi, "")
        .replace(/\bts\.\s*/gi, "")
        .replace(/\bts\s+/gi, "")
        .replace(/\bir\.\s*/gi, "")
        .replace(/\bprof\.\s*/gi, "")
        .replace(/\bprofessor\s+/gi, "")
        .trim();
}

function buildFileSearchUserMessage(message: string): string {
    if (!isProfileQuestion(message)) return message;

    const possibleName = extractPossiblePersonName(message);

    const aliasBlock = possibleName
        ? `
Possible name variants to search:
- ${possibleName}
- Dr ${possibleName}
- Ts Dr ${possibleName}
- Ts. Dr. ${possibleName}
- Prof ${possibleName}
- Professor ${possibleName}
- Ir. Prof. ${possibleName}
`
        : "";

    return `
User question:
${message}

Search and answer intent:
This is a UTAR person, staff, leadership, supervisor, or profile-related question.

${aliasBlock}

Please search the selected UTAR knowledge base for all available details about the person or role, including:
- current role/title
- faculty/department/office
- appointment date or start date
- academic background
- professional roles
- research interests/expertise
- office location
- extension number
- email address
- official links if present

Important:
- Match names even if the user omits titles such as Dr, Ts Dr, Prof, Ir, Dato, or Professor.
- Use only information found in the retrieved university documents in this File Search step.
`;
}

function getTextFromHistoryEntry(entry: any): string {
    if (!entry?.parts || !Array.isArray(entry.parts)) return "";

    return entry.parts
        .map((part: any) => (typeof part.text === "string" ? part.text : ""))
        .join(" ")
        .trim();
}

function lastAssistantAskedForScope(history: any[]): boolean {
    const lastModelEntry = [...history].reverse().find((entry) => entry.role === "model");

    if (!lastModelEntry) return false;

    const text = getTextFromHistoryEntry(lastModelEntry).toLowerCase();

    return (
        text.includes("which faculty") ||
        text.includes("which department") ||
        text.includes("which faculty or department") ||
        text.includes("which faculty or programme") ||
        text.includes("which programme") ||
        text.includes("are you referring to")
    );
}

function getPreviousUserQuestion(history: any[], currentMessage: string): string | null {
    const currentLower = currentMessage.toLowerCase().trim();

    const previousUsers = [...history]
        .filter((entry) => entry.role === "user")
        .map((entry) => getTextFromHistoryEntry(entry))
        .filter(Boolean)
        .filter((text) => text.toLowerCase().trim() !== currentLower);

    if (previousUsers.length === 0) return null;

    return previousUsers[previousUsers.length - 1];
}

function buildNoOfficialSourceMessage(params: {
    effectiveMessage: string;
    selectedAgent: any;
    supervisorMode: boolean;
    profileMode: boolean;
    institutionalMode: boolean;
}): WebFallbackResult {
    const { effectiveMessage, selectedAgent, supervisorMode, profileMode, institutionalMode } = params;

    if (supervisorMode) {
        return {
            text: `
I couldn’t verify suitable supervisors from official UTAR sources yet. 🔎

### 📌 What this means

- Supervisor fit depends on topic scope, staff expertise, and availability.
- I should only suggest **potential suitable supervisors** when the information is supported by UTAR/faculty sources.

### ✅ Best next step

- Check the **${selectedAgent.shortLabel} staff directory** or faculty page.
- Contact the faculty office and ask for staff members with relevant expertise.

### 💡 Better wording

Instead of asking for the “best” supervisor, ask for **potential suitable supervisors** based on your project area.
`.trim(),
            citations: [],
            needsClarification: false,
        };
    }

    if (institutionalMode) {
        return {
            text: `
I couldn’t verify this university-level information from official UTAR public sources yet. 🔎

### ✅ What you can try

- Check the official UTAR website.
- Contact the relevant UTAR office for confirmation.
`.trim(),
            citations: [],
            needsClarification: false,
        };
    }

    if (profileMode) {
        return {
            text: `
I couldn’t verify this person or role from public UTAR information yet. 🔎

### ✅ Quick clarification

May I know which faculty or department this person belongs to?

Once I know the faculty or department, I can check the correct context more accurately.
`.trim(),
            citations: [],
            needsClarification: true,
            pendingQuestion: effectiveMessage,
        };
    }

    return {
        text: `
I couldn’t verify this from public UTAR information yet. 🔎

### ✅ What you can do

- Check the relevant official UTAR page or department.
- Contact the relevant UTAR office for confirmation.
`.trim(),
        citations: [],
        needsClarification: false,
    };
}

async function generatePublicWebFallback(params: {
    effectiveMessage: string;
    selectedAgent: any;
    profileMode: boolean;
    fileText?: string;
    fileCitations?: string[];
    reason: "kb_missing" | "kb_no_answer";
}): Promise<WebFallbackResult> {
    const {
        effectiveMessage,
        selectedAgent,
        profileMode,
        fileText = "",
        fileCitations = [],
        reason,
    } = params;

    const supervisorMode = isSupervisorRecommendationQuestion(effectiveMessage);
    const institutionalMode = isInstitutionalLeadershipQuestion(effectiveMessage);
    const toneMode = detectTone(effectiveMessage);

    const webSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

CURRENT ASSISTANT SCOPE:
${selectedAgent.scopeInstruction}

You are using public web search because the selected UTAR knowledge base is incomplete, unavailable, or insufficient.

SOURCE RULES:
- Prefer official UTAR sources first.
- Official UTAR sources include:
  1. utar.edu.my and its subdomains
  2. official UTAR faculty/department pages
  3. official UTAR-controlled social/media pages when the title/handle clearly belongs to UTAR
- For UTAR-specific questions, do not use staff, departments, or claims from other universities.
- Do not invent emails, phone numbers, office locations, portals, supervisors, or links.
- Include official links when available from grounded web results.
- If no reliable UTAR source is found, say the information cannot be verified and ask a useful follow-up question only when appropriate.
- Never make policy claims by implication. If official evidence is not direct, say it needs confirmation with the relevant UTAR office.

GENERAL PUBLIC UTAR QUESTIONS:
- For university-wide public questions such as UTAR President, Vice President, Registrar, campus, academic calendar, and UTAR leadership, answer directly if the information is publicly available.
- Do not ask for faculty/department for university-wide roles such as UTAR President.

UNKNOWN PERSON / STAFF QUESTIONS:
- First try to answer using public UTAR information.
- If the person cannot be verified, ask which faculty or department the person belongs to.
- Do not immediately ask faculty before trying public UTAR lookup.

SUPERVISOR RECOMMENDATION RULES:
- If the user asks for the "best supervisor", do not claim objective best.
- Phrase the answer as "potential suitable supervisors".
- Recommend only UTAR staff supported by selected faculty KB or UTAR/faculty public sources.
- If there is no UTAR-supported evidence, do not recommend names.
- Match based on expertise keywords only when supported by UTAR staff/profile information.

STYLE:
- Use a warm, helpful, student-friendly UTARGPT style.
- Use appropriate emojis to improve readability, but do not overuse them.
- If toneMode is "casual", you may lightly use Malaysian student-friendly phrasing like "aiyo", "don’t worry", or "can one", but keep important information clear.
- If toneMode is "formal", keep the response professional.
- Never expose internal reasoning.
- Never say phrases like "As the DEA Assistant", "As the router", "Based on fallback", "source filtering", or "KB".

toneMode: ${toneMode}

FORMAT:
- Use clean Markdown.
- Use clear sections with headings.
- Put blank lines between sections.
- Use bullet points.
- Keep contact details inline and visible.
- Use clickable Markdown links when official UTAR links are available.
- Do not dump everything into one long paragraph.
- Do not create empty headings.
- Do not repeatedly say "I couldn't find...".

RICH STYLE TARGET:
Use this type of structure when suitable:

### 📌 Summary

- Main answer in one or two bullets.

### 🎓 Role and Background

- Role, faculty, department, or relevant background.

### 📍 Location

- Office/location if available.

### 📞 Contact Information

- Email: [email@example.edu.my](mailto:email@example.edu.my)
- Phone: +60...
- Extension: ...

### 🔗 Official Links

- [Official page](https://...)

PROFILE FORMAT:
For public staff, leadership, dean, HOD, director, supervisor, or contact questions:
- Give available title/role/contact information.
- Only include sections that have actual information.
- Do not invent missing details.
- Do not include irrelevant pages such as generic welcome messages unless the user asks for them.

QUESTION TYPE:
${profileMode ? "This is a profile/contact/leadership/supervisor style question." : "This is a general student-support or university-information question."}
`;

    const webResponse = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `
Search public UTAR information for this question.

Original user question:
${effectiveMessage}

Selected assistant:
${selectedAgent.label}

Reason public search is being used:
${reason}

Existing UTAR knowledge base answer, if any:
${fileText || "No usable answer from selected UTAR knowledge base."}

Existing UTAR knowledge base citations:
${fileCitations.length > 0 ? fileCitations.join(", ") : "No citation title extracted."}

Search focus:
- UTAR official pages
- UTAR faculty/department pages
- UTAR official social/media pages if clearly controlled by UTAR
- Query style: site:utar.edu.my ${effectiveMessage}

Important:
- Do not invent details.
- Do not use other universities for UTAR-specific answers.
- Prefer official UTAR links.
- Include useful official links if available.
- Keep answer user-facing and helpful.
`,
                    },
                ],
            },
        ],
        config: {
            systemInstruction: { parts: [{ text: webSearchSystemInstruction }] },
            tools: [
                {
                    googleSearch: {},
                },
            ],
            temperature: 0.1,
        },
    });

    const allWebLinks = extractAllWebLinks(webResponse);
    const officialLinks = extractOfficialWebLinks(webResponse);
    const hasOfficialLinks = officialLinks.length > 0;
    const hasNonOfficialLinks = allWebLinks.some(
        (link) => !isOfficialUtarSource(link.uri, link.title)
    );

    let baseText = extractResponseText(webResponse).trim();

    const weakAnswer = shouldUseWebFallback(baseText) || baseText.length < 30;

    if (supervisorMode && (!hasOfficialLinks || weakAnswer)) {
        return buildNoOfficialSourceMessage({
            effectiveMessage,
            selectedAgent,
            supervisorMode,
            profileMode,
            institutionalMode,
        });
    }

    if (institutionalMode && weakAnswer) {
        return buildNoOfficialSourceMessage({
            effectiveMessage,
            selectedAgent,
            supervisorMode,
            profileMode,
            institutionalMode,
        });
    }

    if (profileMode && !institutionalMode && weakAnswer) {
        return buildNoOfficialSourceMessage({
            effectiveMessage,
            selectedAgent,
            supervisorMode,
            profileMode,
            institutionalMode,
        });
    }

    if (hasOfficialLinks && hasNonOfficialLinks) {
        const officialLinkText = officialLinks
            .map((link) => `- ${link.title}: ${link.uri}`)
            .join("\n");

        const sanitizeResponse = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `
Rewrite the answer below using ONLY these UTAR-supported links.

Original question:
${effectiveMessage}

Draft answer:
${baseText}

UTAR-supported links allowed:
${officialLinkText}

Rules:
- Remove any names, departments, links, or claims not supported by the UTAR-supported links above.
- Do not use other universities for UTAR-specific answers.
- If there is not enough evidence, say it cannot be verified from UTAR public information.
- Keep rich readable Markdown with appropriate emojis.
- Do not mention internal filtering or source rejection.
`,
                        },
                    ],
                },
            ],
            config: {
                temperature: 0.1,
            },
        });

        baseText = extractResponseText(sanitizeResponse).trim();
    }

    const finalText = appendOfficialLinks(baseText, officialLinks, { profileMode });

    return {
        text: finalText,
        citations: officialLinks.map((link) => link.uri),
        needsClarification: false,
        pendingQuestion: null,
    };
}

export async function POST(req: NextRequest) {
    try {
        const {
            message,
            pendingQuestion: frontendPendingQuestion = null,
            history = [],
            selectedAgentId,
        } = await req.json();

        const vulgarReply = tryHandleVulgarity(message);

        if (vulgarReply) {
            return NextResponse.json({
                text: vulgarReply,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgentId || "general",
                selectedAgentLabel: getAgentById(selectedAgentId || "general").label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: "general_public",
            });
        }

        const easterEgg = tryHandleEasterEgg(message);

        if (easterEgg) {
            return NextResponse.json({
                text: easterEgg,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgentId || "general",
                selectedAgentLabel: getAgentById(selectedAgentId || "general").label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: "general_public",
            });
        }

        const playfulReply = tryHandlePlayfulStudentChat(message);

        if (playfulReply) {
            return NextResponse.json({
                text: playfulReply,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgentId || "general",
                selectedAgentLabel: getAgentById(selectedAgentId || "general").label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: "general_public",
            });
        }

        const emotionalReply = tryHandleEmotionalCasualSupport(message);

        if (emotionalReply) {
            return NextResponse.json({
                text: emotionalReply,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgentId || "general",
                selectedAgentLabel: getAgentById(selectedAgentId || "general").label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: "general_public",
            });
        }

        const foodReply = tryHandleFoodQuestion(message);

        if (foodReply) {
            return NextResponse.json({
                text: foodReply,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgentId || "general",
                selectedAgentLabel: getAgentById(selectedAgentId || "general").label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: "general_public",
            });
        }

        const offTopicReply = tryHandleOffTopic(message);

        if (offTopicReply) {
            return NextResponse.json({
                text: offTopicReply,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgentId || "general",
                selectedAgentLabel: getAgentById(selectedAgentId || "general").label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: "general_public",
            });
        }

        const detectedAgentFromReply = detectAgentFromText(message);
        const wasClarificationReply =
            detectedAgentFromReply && lastAssistantAskedForScope(history);

        const frontendPending =
            frontendPendingQuestion && isLikelyClarificationReply(message, detectedAgentFromReply)
                ? String(frontendPendingQuestion)
                : null;

        const pendingQuestion = frontendPending
            ? frontendPending
            : wasClarificationReply
                ? getPreviousUserQuestion(history, message)
                : null;

        const routerResult = await routeWithLLM({
            message,
            currentAgentId: selectedAgentId || "general",
            pendingQuestion,
        });

        const selectedAgent = getAgentById(routerResult.agentId);

        if (routerResult.routeType === "context_setting") {
            return NextResponse.json({
                text: `Got it — I’ll use **${selectedAgent.shortLabel}** as your context for follow-up questions. ✅`,
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: routerResult.routeType,
            });
        }

        if (routerResult.needsClarification) {
            return NextResponse.json({
                text:
                    routerResult.clarificationQuestion ||
                    "May I know which faculty or programme you are from? This helps me answer based on the correct context.",
                citations: [],
                sourceMode: "none",
                selectedAgentId: routerResult.agentId,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: true,
                pendingQuestion: routerResult.rewrittenQuestion || message,
                routeType: routerResult.routeType,
            });
        }

        const effectiveMessage = routerResult.rewrittenQuestion || message;
        const profileMode = isProfileQuestion(effectiveMessage);
        const sensitiveMode =
            isSensitiveOrInternalQuestion(effectiveMessage) ||
            routerResult.routeType === "private_sensitive";

        if (sensitiveMode) {
            return NextResponse.json({
                text: buildSensitiveResponse(effectiveMessage),
                citations: [],
                sourceMode: "none",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: routerResult.routeType,
            });
        }

        const stores = await ai.fileSearchStores.list();
        let storeName = "";

        for await (const s of stores) {
            const displayName =
                (s as any).displayName || (s as any).display_name || "";

            if (displayName === selectedAgent.storeDisplayName) {
                storeName = s.name as string;
                break;
            }
        }

        if (!storeName) {
            const webFallback = await generatePublicWebFallback({
                effectiveMessage,
                selectedAgent,
                profileMode,
                reason: "kb_missing",
            });

            return NextResponse.json({
                text: webFallback.text,
                citations: webFallback.citations,
                sourceMode: "webFallback",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: Boolean(webFallback.needsClarification),
                pendingQuestion: webFallback.pendingQuestion || null,
                routeType: routerResult.routeType,
            });
        }

        const fileSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

CURRENT ASSISTANT SCOPE:
${selectedAgent.scopeInstruction}

CORE BEHAVIOUR:
- Answer using only the selected UTAR knowledge base in this File Search step.
- Prioritise the selected assistant scope above when interpreting ambiguous questions.
- If the answer is not found in the university documents, say exactly:
  "I couldn't find that information in the university documents."
- Do not invent information.
- If the information is uncertain or conflicting, clearly say so.
- Do not use web knowledge in this File Search step.
- Never expose internal reasoning.
- Never say phrases like "As the DEA Assistant", "As the FICT Assistant", "As the router", or "Based on the KB".
- Do not infer policies. If the retrieved documents do not directly state the answer, say exactly:
  "I couldn't find that information in the university documents."

REPLY STYLE:
- Use a warm, helpful, student-friendly UTARGPT style.
- Use appropriate emojis to improve readability, but do not overuse them.
- Prefer structured answers with short sections.
- Avoid generic greetings unless the user greets first.
- Keep the answer compact, but complete.

MARKDOWN FORMATTING:
- Always format the answer in clean Markdown.
- Use headings for major sections.
- Put one blank line between major sections.
- Use bullet points for lists.
- Keep contact details visible inline.
- Use Markdown links when the source document contains the link.
- Do not dump everything into one long paragraph.
- Do not create a heading if there is no information under it.

RICH STYLE TARGET:
Use this type of structure when suitable:

### 📌 Summary

- Main answer in one or two bullets.

### 🎓 Role and Background

- Role, faculty, department, or relevant background.

### 📍 Location

- Office/location if available.

### 📞 Contact Information

- Email: [email@example.edu.my](mailto:email@example.edu.my?subject=Student%20Inquiry)
- Phone: +60...
- Extension: ...

### 🔗 Official Links

- [Official page](https://...)

LINK AND CONTACT RULES:
- Emails must be formatted as clickable mailto links.
  Example: [registrar@utar.edu.my](mailto:registrar@utar.edu.my?subject=Student%20Inquiry)
- Phone numbers and extensions should be shown clearly as text.
- Links should be shown as clickable Markdown links only if present in the retrieved documents.
- Do not invent links.

PROFILE FORMAT:
For any question about a UTAR person, staff member, lecturer, dean, director, president, CEO, HOD, head of department, supervisor, or head of programme:
- Use sections only when information exists.
- Do not invent missing degrees, titles, dates, office locations, emails, extensions, or positions.
- Do not repeatedly write "I couldn't find..." for missing fields.
- If only limited information is found, give a compact answer using only the available details.
- Only state a staff role if the retrieved source directly supports that role.

PROGRAMME-SPECIFIC RULE:
- If answering electives, study plan, course structure, prerequisites, or graduation requirements, do not mix programmes.
- Preserve exact course codes from the source only.
- If course code and course name are uncertain, show the course name and omit the code.
- If multiple programmes appear in retrieved context, separate them clearly.
- If the programme is unclear, ask for clarification instead of guessing.
`;

        const fileResponse = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                ...history,
                {
                    role: "user",
                    parts: [{ text: buildFileSearchUserMessage(effectiveMessage) }],
                },
            ],
            config: {
                systemInstruction: { parts: [{ text: fileSearchSystemInstruction }] },
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: [storeName],
                        },
                    },
                ],
                temperature: 0.2,
            },
        });

        const fileText = extractResponseText(fileResponse);
        const fileCitations = extractCitations(fileResponse);
        const fileNotFound = shouldUseWebFallback(fileText);

        if (!fileNotFound) {
            return NextResponse.json({
                text: fileText,
                citations: fileCitations,
                sourceMode: "fileSearch",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                routeType: routerResult.routeType,
            });
        }

        const webFallback = await generatePublicWebFallback({
            effectiveMessage,
            selectedAgent,
            profileMode,
            fileText,
            fileCitations,
            reason: "kb_no_answer",
        });

        return NextResponse.json({
            text: webFallback.text,
            citations: [...fileCitations, ...webFallback.citations].filter(
                (val, index, self) => val && self.indexOf(val) === index
            ),
            sourceMode: "webFallback",
            selectedAgentId: selectedAgent.id,
            selectedAgentLabel: selectedAgent.label,
            needsClarification: Boolean(webFallback.needsClarification),
            pendingQuestion: webFallback.pendingQuestion || null,
            routeType: routerResult.routeType,
        });
    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json(
            { error: "Failed to generate response." },
            { status: 500 }
        );
    }
}