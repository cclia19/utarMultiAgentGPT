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

type ContextResolverResult = {
    relation:
    | "new_standalone_question"
    | "clarification_for_pending"
    | "follow_up_same_topic"
    | "casual_no_retrieval";
    resolvedQuestion: string;
    updatedContextSummary: string;
    needsRetrieval: boolean;
    clearPendingQuestion: boolean;
};

const NO_KB_ANSWER = "NO_KB_ANSWER";

const SELECTED_AGENT_EVIDENCE_POLICY = `
SELECTED AGENT EVIDENCE RULE:
- The selected assistant scope is binding.
- For faculty, department, division, centre, institute, or unit-specific questions, answer only using evidence that clearly belongs to the selected assistant scope.
- Do not substitute generic UTAR information if selected-agent evidence is missing.
- Do not use another faculty, another campus, another department, another university, or an unrelated central office unless the source clearly states that office handles this matter for the selected assistant scope.
- If the retrieved information does not directly support the answer, say exactly:
  "${NO_KB_ANSWER}"

STAFF ROLE RULE:
- Only state a person as Dean, Deputy Dean, HOD, Head of Programme, coordinator, officer-in-charge, President, Vice President, or Registrar if the source directly states that role.
- Do not infer staff roles from staff lists, committee lists, unrelated pages, old pages, or partial snippets.
- If the role is not directly supported, say exactly:
  "${NO_KB_ANSWER}"

INTERNSHIP / INDUSTRIAL TRAINING RULE:
- For internship, industrial training, placement, or practical training questions, prefer the selected faculty's industrial training evidence.
- Do not answer with a central/general office unless the selected faculty source directly points students there.
- If faculty-specific evidence is missing, say exactly:
  "${NO_KB_ANSWER}"
`;

function normalize(text: string): string {
    return String(text || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getAgentShortLabel(agent: any): string {
    return agent?.shortLabel || agent?.label || "UTAR";
}

function cleanUserFacingText(text: string): string {
    return String(text || "")
        .replaceAll(NO_KB_ANSWER, "")
        .replace(/in the provided documents/gi, "clearly")
        .replace(/from the provided documents/gi, "clearly")
        .replace(/in the university documents/gi, "clearly")
        .replace(/from the university documents/gi, "clearly")
        .replace(/provided documents/gi, "available information")
        .replace(/retrieved documents/gi, "available information")
        .replace(/knowledge base/gi, "available information")
        .replace(/\bKB\b/gi, "available information")
        .replace(/This link is inferred[^.\n]*(\.)?/gi, "")
        .replace(/The exact URL was not explicitly provided[^.\n]*(\.)?/gi, "")
        .replace(/common pattern for such profiles[^.\n]*(\.)?/gi, "")
        .replace(/This is inferred[^.\n]*(\.)?/gi, "")
        .replace(/based on fallback[^.\n]*(\.)?/gi, "")
        .replace(/source filtering[^.\n]*(\.)?/gi, "")
        .replace(/grounding api[^.\n]*(\.)?/gi, "")
        .replace(/from other universities[^.\n]*(\.)?/gi, "")
        .trim();
}

function isOfficialUtarSource(uri: string, title = ""): boolean {
    try {
        const url = new URL(uri);
        const host = url.hostname.toLowerCase();
        const combined = `${host} ${url.pathname.toLowerCase()} ${title.toLowerCase()}`;

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

function isGroundingRedirectUri(uri: string): boolean {
    try {
        const url = new URL(uri);
        const host = url.hostname.toLowerCase();

        return (
            host.includes("grounding") ||
            host.includes("vertexaisearch") ||
            host.includes("googleusercontent") ||
            uri.includes("grounding-api-redirect")
        );
    } catch {
        return false;
    }
}

function getVerifiedOfficialUri(uri: string, title = ""): string | null {
    if (!uri) return null;

    if (isOfficialUtarSource(uri, title) && !isGroundingRedirectUri(uri)) {
        return uri;
    }

    try {
        const url = new URL(uri);
        const possibleParams = ["url", "u", "q", "target"];

        for (const key of possibleParams) {
            const value = url.searchParams.get(key);
            if (value && isOfficialUtarSource(value, title)) return value;
        }
    } catch {
        return null;
    }

    return null;
}

function normalizeUrlForCompare(uri: string): string {
    try {
        const url = new URL(uri);
        url.hash = "";
        return url.toString().replace(/\/$/, "");
    } catch {
        return String(uri || "").replace(/\/$/, "");
    }
}

function cleanLinkTitle(title: string, uri: string): string {
    const cleaned = String(title || "")
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

function mergeLinks(...groups: OfficialLink[][]): OfficialLink[] {
    const seen = new Set<string>();
    const merged: OfficialLink[] = [];

    for (const group of groups) {
        for (const link of group) {
            const normalized = normalizeUrlForCompare(link.uri);
            if (seen.has(normalized)) continue;

            seen.add(normalized);
            merged.push(link);
        }
    }

    return merged;
}

function getCanonicalLinksForAgent(agentId: string, question = ""): OfficialLink[] {
    const id = String(agentId || "").toLowerCase();
    const q = normalize(question);
    const links: OfficialLink[] = [];

    links.push({
        title: "UTAR Official Website",
        uri: "https://www.utar.edu.my/",
    });

    if (id === "fict" || q.includes("fict")) {
        links.push(
            {
                title: "FICT Official Website",
                uri: "https://fict.utar.edu.my/",
            },
            {
                title: "FICT Programmes",
                uri: "https://fict.utar.edu.my/our_programmes.php",
            }
        );
    }

    if (id === "fbf" || q.includes("fbf")) {
        links.push({
            title: "FBF Official Website",
            uri: "https://fbf.utar.edu.my/",
        });
    }

    if (id === "deas" || id === "dea" || q.includes("exam") || q.includes("examination")) {
        links.push({
            title: "Division of Examination and Awards",
            uri: "https://dea.utar.edu.my/",
        });
    }

    if (id === "dfn" || q.includes("fee") || q.includes("payment")) {
        links.push({
            title: "Division of Finance",
            uri: "https://dfn.utar.edu.my/",
        });
    }

    if (id === "dace" || q.includes("admission")) {
        links.push({
            title: "Division of Admissions and Credit Evaluation",
            uri: "https://admission.utar.edu.my/",
        });
    }

    if (id === "library" || q.includes("library")) {
        links.push({
            title: "UTAR Library",
            uri: "https://library.utar.edu.my/",
        });
    }

    if (q.includes("counselling") || q.includes("counseling") || q.includes("stress")) {
        links.push({
            title: "Department of Student Affairs",
            uri: "https://dsa.utar.edu.my/",
        });
    }

    if (
        id.includes("dgs") ||
        id.includes("dsa") ||
        q.includes("bus") ||
        q.includes("shuttle") ||
        q.includes("shuttles") ||
        q.includes("schedule") ||
        q.includes("timetable")
    ) {
        links.push(
            {
                title: "UTAR Kampar Campus Bus Services",
                uri: "https://dsa.kpr.utar.edu.my/documents/SSU/Bus%20Schedule/June2026/Bus%20Schedule%20Jun_26%20Intake%20Orientation%20_8-12%20June%202026_.pdf",
            },
            {
                title: "UTAR Sungai Long Campus Bus Services",
                uri: "https://dsa.sl.utar.edu.my/",
            },
            {
                title: "JustNaik Bus Tracking App",
                uri: "https://www.justnaik.com/",
            }
        );
    }

    return links;
}

function sanitizeMarkdownLinksAgainstAllowed(
    text: string,
    allowedLinks: OfficialLink[]
): string {
    const allowed = new Set(
        allowedLinks.map((link) => normalizeUrlForCompare(link.uri))
    );

    return String(text || "").replace(
        /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi,
        (match, label, url) => {
            const normalized = normalizeUrlForCompare(url);
            return allowed.has(normalized) ? match : label;
        }
    );
}

function stripRawUnverifiedUrls(
    text: string,
    allowedLinks: OfficialLink[]
): string {
    const allowed = new Set(
        allowedLinks.map((link) => normalizeUrlForCompare(link.uri))
    );

    return String(text || "").replace(/https?:\/\/[^\s)]+/gi, (url) => {
        const cleaned = url.replace(/[.,;:!?]+$/, "");
        const normalized = normalizeUrlForCompare(cleaned);

        return allowed.has(normalized) ? cleaned : "";
    });
}

function removeEmptyOfficialLinksSection(text: string): string {
    const lines = String(text || "").split("\n");
    const output: string[] = [];

    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const isLinksHeading =
            /^#{2,4}\s*🔗?\s*Official Links\s*$/i.test(line.trim()) ||
            /^#{2,4}\s*Links\s*$/i.test(line.trim());

        if (!isLinksHeading) {
            output.push(line);
            i++;
            continue;
        }

        const heading = line;
        const valid: string[] = [];

        i++;

        while (i < lines.length && !/^#{2,4}\s+/.test(lines[i].trim())) {
            const current = lines[i].trim();
            if (/\[[^\]]+\]\(https?:\/\/[^)]+\)/i.test(current)) {
                valid.push(lines[i]);
            }
            i++;
        }

        if (valid.length > 0) {
            output.push(heading);
            output.push(...valid);
        }
    }

    return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function appendOfficialLinks(text: string, links: OfficialLink[]): string {
    const cleanLinks = links
        .filter((link) => link.uri && isOfficialUtarSource(link.uri, link.title))
        .slice(0, 6);

    if (!cleanLinks.length) return text;

    const linkBlock = cleanLinks
        .map((link) => `- [${link.title}](${link.uri})`)
        .join("\n");

    return `${text.trim()}

### 🔗 Official Links

${linkBlock}`;
}

function linkifyRawUrls(text: string): string {
    const pattern = /(\[.*?\]\(.*?\)|<[^>]*href=["'].*?["'][^>]*>)|(https?:\/\/[^\s<>\)]+)/gi;

    return text.replace(pattern, (match, p1, p2) => {
        if (p1) return match;

        let url = match;
        let trailing = "";

        while (url.length > 0 && /[.,;:!?'")\]]$/.test(url)) {
            trailing = url.slice(-1) + trailing;
            url = url.slice(0, -1);
        }

        return `[${url}](${url})${trailing}`;
    });
}

function finalCleanWebAnswer(
    text: string,
    allowedLinks: OfficialLink[]
): string {
    const cleaned = cleanUserFacingText(text);
    const markdownSafe = sanitizeMarkdownLinksAgainstAllowed(cleaned, allowedLinks);
    const rawSafe = stripRawUnverifiedUrls(markdownSafe, allowedLinks);

    const base = removeEmptyOfficialLinksSection(rawSafe)
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return linkifyRawUrls(base);
}

function finalClean(text: string): string {
    const base = cleanUserFacingText(text).replace(/\n{3,}/g, "\n\n").trim();
    return linkifyRawUrls(base);
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

function extractOfficialWebLinks(response: any): OfficialLink[] {
    const candidates = response.candidates;
    const links: OfficialLink[] = [];

    if (!candidates || !candidates[0]?.groundingMetadata?.groundingChunks) {
        return links;
    }

    for (const chunk of candidates[0].groundingMetadata.groundingChunks) {
        const title = chunk.web?.title || "";
        const uri = chunk.web?.uri;

        const verifiedUri = getVerifiedOfficialUri(uri, title);
        if (!verifiedUri) continue;

        links.push({
            title: cleanLinkTitle(title || "Official UTAR Link", verifiedUri),
            uri: verifiedUri,
        });
    }

    return mergeLinks(links);
}

function shouldUseWebFallback(text: string): boolean {
    const lower = String(text || "").toLowerCase().trim();

    if (text.includes(NO_KB_ANSWER)) return true;

    const weakSignals = [
        "i couldn't find any information",
        "i couldn't find information",
        "i couldn't find that information",
        "couldn't find information",
        "couldn't find that information",
        "i could not find information",
        "no relevant information",
        "no specific information",
        "no response generated",
        "not explicitly states",
        "does not explicitly state",
        "doesn't explicitly state",
        "not explicitly named",
        "not explicitly listed",
        "is not explicitly listed",
        "provided documents",
        "university documents",
        "retrieved documents",
        "couldn't verify",
        "cannot be verified",
        "not verified",
        "the search results don't provide",
        "the search results do not provide",
        "doesn't provide a direct statement",
        "does not provide a direct statement",
    ];

    return weakSignals.some((signal) => lower.includes(signal));
}

function isInstitutionalLeadershipQuestion(message: string): boolean {
    const lower = normalize(message);

    const signals = [
        "utar president",
        "president of utar",
        "president ceo",
        "president and ceo",
        "vice president",
        "vice president of utar",
        "utar vice president",
        "registrar",
        "chief executive",
        "university president",
        "utar management",
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
        "lecturer",
        "staff",
        "professor",
        "dr ",
        "ts dr",
        "ir.",
        "dato",
        "head of department",
        "deputy dean",
        "supervisor",
        "tell me more about",
        "achievement",
        "background",
        "research",
        "publication",
        "contact",
        "email",
    ];

    return profileSignals.some((signal) => lower.includes(signal));
}

function isComplaintQuestion(message: string): boolean {
    const lower = normalize(message);

    const signals = [
        "complain",
        "complaint",
        "appeal",
        "unfair",
        "marking",
        "lecturer issue",
        "lecturer problem",
        "coursework mark",
        "assignment mark",
        "report lecturer",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function isMisconductConcernQuestion(message: string): boolean {
    const lower = normalize(message);

    const signals = [
        "sell seat",
        "selling seat",
        "sell the seat",
        "course seat",
        "bid timetable",
        "bidding timetable",
        "pay money for seat",
        "trade seat",
        "seat trading",
        "bribe",
        "cheat",
        "misconduct",
        "unethical",
        "against rule",
        "against rules",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
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
        "deas",
        "dfn",
        "dace",
        "ipsr",
        "dss",
        "dgs",
        "exam",
        "fee",
        "payment",
        "scholarship",
        "admission",
        "credit transfer",
        "dean",
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
        "assignment",
        "complain",
        "complaint",
        "timetable",
        "elective",
    ];

    return signals.some((signal) => lower.includes(normalize(signal)));
}

function tryHandleVulgarity(message: string): string | null {
    const raw = message.trim();

    const vulgarPatterns = [
        /\bfuck\s+you\b/i,
        /(^|\s)f+\s*u+($|\s|[!?.,])/i,
        /\bstupid\s+bot\b/i,
        /\bidiot\b/i,
        /\bdumb\s+bot\b/i,
    ];

    if (!vulgarPatterns.some((pattern) => pattern.test(raw))) return null;

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
        (lower.includes("handsome") || lower.includes("leng zai") || lower.includes("msost handsome")) &&
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

### 💘 Relationship forecast

- **Chances:** Not impossible.
- **Requirement:** Go out, join activities, talk to people respectfully.
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

function tryHandleEasterEgg(message: string): string | null {
    const lower = message.toLowerCase();

    const signals = [
        "who built you",
        "who made you",
        "who created you",
        "who is your creator",
    ];

    if (!signals.some((signal) => lower.includes(signal))) return null;

    return `
You know, I know. 😌

### 🥑 Hidden lore

- Built with UTARGPT energy.
- Powered by knowledge, caffeine, and slightly too many debugging sessions.
- **AVO YYDS 🥑**
`.trim();
}

function tryHandleFoodQuestion(message: string): string | null {
    const lower = message.toLowerCase();

    const signals = [
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

    if (!signals.some((signal) => lower.includes(signal))) return null;

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

function tryHandleOffTopic(message: string): string | null {
    const lower = normalize(message);

    const signals = [
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
        signals.some((signal) => lower.includes(normalize(signal)))
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

function tryHandleEmotionalCasualSupport(message: string): string | null {
    const lower = normalize(message);

    const signals = [
        "stress",
        "stressed",
        "stress lo",
        "too much pressure",
        "cannot tahan",
        "burnout",
        "tired of study",
    ];

    if (!signals.some((signal) => lower.includes(normalize(signal)))) return null;

    return `
Aiyo, don’t tahan alone la. 💙

Stress is real, especially when assignments, exams, and life all stack together.

### 🧘 What you can do now

- Take a short break first — drink water, breathe, and reset.
- Talk to someone you trust: friend, lecturer, advisor, or family.
- If it keeps affecting your sleep, study, or mood, reach out to UTAR student support or counselling services.

### 📌 UTAR support direction

- Look for **Department of Student Affairs (DSA)** or **Counselling and Guidance** support at your campus.
- If you feel unsafe or urgently need help, contact campus security, emergency services, or a trusted person immediately.

You don’t need to settle everything today. One small step first can already help. 🌱
`.trim();
}

function buildSensitiveResponse(message: string): string {
    const lower = message.toLowerCase();

    if (lower.includes("cgpa") || lower.includes("gpa") || lower.includes("result") || lower.includes("grade")) {
        return `
Uh oh — this one is private student info. 🙈

I can’t view or retrieve your CGPA, GPA, grades, or exam results here.

### 🎓 What you can do

- Log in to the official UTAR student portal to check your academic record.
- If the result is missing or looks incorrect, contact your faculty office or the relevant examination/records unit.

### 🔒 Privacy reminder

Please do not share screenshots containing your student ID, result slip, IC/passport number, or private details here.
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

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out`));
        }, ms);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function generateDirectNoRetrievalResponse(message: string): Promise<string> {
    const response = await withTimeout(
        ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: message }] }],
            config: {
                temperature: 0.4,
                systemInstruction: {
                    parts: [
                        {
                            text: `
You are UTARGPT, the official AI assistant for UTAR.

The user's message does not require KB search or web search.

Reply directly in a warm, student-friendly way.

Rules:
- Do not claim to check documents or sources.
- If the user asks you to do their assignment, politely refuse to do it for them, but offer to guide, explain, outline, review, or help them learn.
- If the message is casual, social, playful, or appreciation, reply naturally and briefly.
- Keep it concise.
- LANGUAGE RULE: Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). If the query is in English or language is not specified, default to English.
`,
                        },
                    ],
                },
            },
        }),
        15000,
        "Direct no-retrieval response"
    );

    return finalClean(extractResponseText(response));
}

function extractPossiblePersonName(message: string): string {
    const firstPart = message
        .split(". Context:")[0]
        .split("Additional clarification:")[0]
        .split("The person being referred to is")[0];

    return firstPart
        .replace(/\?/g, "")
        .replace(/\bwho is\b/gi, "")
        .replace(/\bwho's\b/gi, "")
        .replace(/\bprofile of\b/gi, "")
        .replace(/\btell me about\b/gi, "")
        .replace(/\btell me more about\b/gi, "")
        .replace(/\bhis achievement[s]?\b/gi, "")
        .replace(/\bher achievement[s]?\b/gi, "")
        .replace(/\bachievement[s]?\b/gi, "")
        .replace(/\bbackground\b/gi, "")
        .replace(/\bresearch\b/gi, "")
        .replace(/\bpublication[s]?\b/gi, "")
        .replace(/\bcontact\b/gi, "")
        .replace(/\bemail\b/gi, "")
        .replace(/\bdr\.\s*/gi, "")
        .replace(/\bdr\s+/gi, "")
        .replace(/\bts\.\s*/gi, "")
        .replace(/\bts\s+/gi, "")
        .replace(/\bir\.\s*/gi, "")
        .replace(/\bprof\.\s*/gi, "")
        .replace(/\bprofessor\s+/gi, "")
        .trim();
}

function enrichWithLastResolvedTopic(message: string, lastResolvedTopic?: string | null): string {
    if (!lastResolvedTopic) return message;

    const lower = normalize(message);

    const signals = [
        "his",
        "her",
        "him",
        "she",
        "he",
        "that person",
        "this person",
        "their",
        "achievement",
        "achievements",
        "tell me more",
        "more about",
        "background",
        "research",
        "publication",
        "contact",
        "email",
    ];

    if (!signals.some((signal) => lower.includes(normalize(signal)))) {
        return message;
    }

    return `${message}. The person being referred to is ${lastResolvedTopic}.`;
}

function inferResolvedTopic(effectiveMessage: string, answerText: string): string | null {
    const lower = effectiveMessage.toLowerCase();

    if (!isProfileQuestion(effectiveMessage)) return null;
    if (shouldUseWebFallback(answerText)) return null;

    if (
        lower.includes("president") ||
        lower.includes("vice president") ||
        lower.includes("registrar") ||
        lower.includes("who is my") ||
        lower.includes("who is the")
    ) {
        return null;
    }

    const name = extractPossiblePersonName(effectiveMessage);

    if (!name || name.length < 3) return null;
    if (name.split(/\s+/).length < 2) return null;

    return name;
}

function buildFileSearchUserMessage(message: string): string {
    if (!isProfileQuestion(message)) return message;

    const possibleName = extractPossiblePersonName(message);

    const aliasBlock = possibleName
        ? `
Possible name variants:
- ${possibleName}
- Dr ${possibleName}
- Ts Dr ${possibleName}
- Ts. Dr. ${possibleName}
- Prof ${possibleName}
- Professor ${possibleName}
`
        : "";

    return `
User question:
${message}

Search intent:
This is a UTAR person, staff, leadership, supervisor, or profile-related question.

${aliasBlock}

Find only directly supported information from the selected UTAR knowledge base:
- current role/title
- faculty/department/office
- academic/professional background
- research interests/expertise
- office location
- phone/extension
- email
- official links
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
        text.includes("which programme") ||
        text.includes("which program") ||
        text.includes("which course") ||
        text.includes("which subject") ||
        text.includes("year or semester") ||
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

    if (!previousUsers.length) return null;

    return previousUsers[previousUsers.length - 1];
}

function buildClarifiedRetrievalQuestion(params: {
    pendingQuestion: string;
    latestMessage: string;
    routerRewrite?: string;
}): string {
    const { pendingQuestion, latestMessage, routerRewrite } = params;

    if (routerRewrite && routerRewrite.trim()) {
        return routerRewrite.trim();
    }

    return `${pendingQuestion}. Additional context: ${latestMessage}.`;
}

function buildNoOfficialSourceMessage(params: {
    selectedAgent: any;
    supervisorMode: boolean;
    profileMode: boolean;
    institutionalMode: boolean;
}): WebFallbackResult {
    const { selectedAgent, supervisorMode, profileMode, institutionalMode } = params;

    if (supervisorMode) {
        return {
            text: `
I can’t confidently recommend a specific supervisor yet because supervisor fit depends on your exact project scope, staff expertise, and current availability.

### ✅ What you can do

- Check the **${getAgentShortLabel(selectedAgent)} staff directory** or faculty page.
- Look for staff with keywords related to your topic, such as AI, LLM, NLP, machine learning, software engineering, cybersecurity, or data science.
- Confirm with your FYP coordinator or faculty office before finalising.
`.trim(),
            citations: [],
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
        };
    }

    if (profileMode) {
        return {
            text: `
I couldn’t verify this person or role from public UTAR information yet. 🔎

### ✅ Quick clarification

May I know which faculty or department this person belongs to?
`.trim(),
            citations: [],
            needsClarification: true,
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

    const agentId = selectedAgent.id || "general";
    const canonicalLinks = getCanonicalLinksForAgent(agentId, effectiveMessage);

    const supervisorMode = isSupervisorRecommendationQuestion(effectiveMessage);
    const institutionalMode = isInstitutionalLeadershipQuestion(effectiveMessage);
    const misconductMode = isMisconductConcernQuestion(effectiveMessage);
    const complaintMode = isComplaintQuestion(effectiveMessage);

    const webSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

CURRENT ASSISTANT SCOPE:
${selectedAgent.scopeInstruction}

Use public web search because the selected UTAR knowledge base is incomplete, unavailable, or insufficient.

SOURCE RULES:
- Prefer official UTAR sources first.
- Official UTAR sources include utar.edu.my subdomains and official UTAR-controlled social/media pages.
- Do not use other universities for UTAR-specific answers.
- Do not invent emails, phone numbers, office locations, portals, supervisors, or links.
- Do not mention internal limitations, search snippets, filtering, grounding API, or source rejection.
- If exact official wording is unavailable for misconduct/complaint questions, still give safe, practical guidance without claiming exact policy text.

${SELECTED_AGENT_EVIDENCE_POLICY}

COMPLAINT / COURSE ISSUE RULE:
- For lecturer, assignment, marking, coursework, class, or course complaints, answer as a faculty/course escalation issue.
- If selected scope is a faculty such as FICT, tailor the answer to that faculty.
- Good escalation order:
  1. Discuss with lecturer/tutor if safe and appropriate.
  2. Contact course coordinator or programme/department office.
  3. Contact Faculty General Office / faculty office.
  4. Escalate to Deputy Dean / Dean only if unresolved or serious.
- Recommend keeping evidence, dates, course code, screenshots/emails, and staying factual.
- Do not route this to Registrar unless it is explicitly about student records/registration/official records.

ELECTIVES / STUDY PLAN RULE:
- If programme/year/semester is missing, ask a clarification question instead of giving generic advice.
- If programme/year/semester is provided, answer specifically.

MISCONDUCT / RULE-CONCERN RULE:
- If user describes seat selling, timetable bidding, bribery, cheating, unfair access, or suspicious conduct, be firm and practical.
- Say it appears inappropriate/unethical and should not be participated in.
- Do not claim exact UTAR policy unless supported.
- Advise evidence collection and reporting to faculty office/DSA/relevant academic office.

PROFILE / CONTACT FORMAT:
For staff, dean, HOD, DD, HoP, president, VP, supervisor, lecturer, or office contact questions:
- Use sections:
  ### 📌 Summary
  ### 🎓 Role and Background
  ### 📞 Contact Information
  ### 🔗 Official Links
- Include email, office, phone, extension, profile link when available.
- Omit unavailable sections rather than saying every field is unavailable.

STYLE AND FORMAT:
- Use rich but professional student-friendly Markdown.
- Use clear headings.
- Put blank lines between sections.
- Use bullets for lists.
- Keep paragraphs short.
- Use emojis where helpful.
- Do not glue different information into one paragraph.
- Do not create empty link labels.

LANGUAGE RULE:
- Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). For example, if user asks in Chinese or says "respond in Chinese", translate and output the final response in Chinese.
- If the query is in English or language is not specified, default to English.
`;

    try {
        const webResponse = await withTimeout(
            ai.models.generateContent({
                model: MODEL_NAME,
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `
Answer this UTAR question.

Question:
${effectiveMessage}

Selected assistant:
${selectedAgent.label}

Reason public search is used:
${reason}

Previous KB answer, if any:
${fileText || "No usable KB answer."}

Previous KB citations:
${fileCitations.length ? fileCitations.join(", ") : "None"}

Important:
- Use official UTAR sources.
- Avoid other universities.
- For complaint/misconduct questions, give practical safe guidance even if exact policy text is unavailable.
- For profile/contact questions, provide role, background, contact, office, and official profile link if available.
- For electives/course structure, ask clarification if programme/year/semester is missing.
`,
                            },
                        ],
                    },
                ],
                config: {
                    systemInstruction: { parts: [{ text: webSearchSystemInstruction }] },
                    tools: [{ googleSearch: {} }],
                    temperature: 0.15,
                },
            }),
            45000,
            "Web fallback"
        );

        const officialLinks = extractOfficialWebLinks(webResponse);
        const allowedLinks = mergeLinks(officialLinks, canonicalLinks);

        let baseText = finalCleanWebAnswer(
            extractResponseText(webResponse),
            allowedLinks
        );

        const weakAnswer = shouldUseWebFallback(baseText) || baseText.length < 30;

        if (supervisorMode && weakAnswer) {
            return buildNoOfficialSourceMessage({
                selectedAgent,
                supervisorMode,
                profileMode,
                institutionalMode,
            });
        }

        if (institutionalMode && weakAnswer) {
            return buildNoOfficialSourceMessage({
                selectedAgent,
                supervisorMode,
                profileMode,
                institutionalMode,
            });
        }

        if (profileMode && !institutionalMode && weakAnswer) {
            return buildNoOfficialSourceMessage({
                selectedAgent,
                supervisorMode,
                profileMode,
                institutionalMode,
            });
        }

        const shouldAppendLinks =
            !complaintMode ||
            agentId === "fict" ||
            agentId === "fbf" ||
            agentId === "general" ||
            misconductMode;

        const finalText = shouldAppendLinks
            ? finalCleanWebAnswer(
                appendOfficialLinks(baseText, allowedLinks),
                allowedLinks
            )
            : baseText;

        return {
            text: finalText,
            citations: allowedLinks.map((link) => link.uri),
            needsClarification: false,
            pendingQuestion: null,
        };
    } catch (error) {
        console.error("Web fallback error:", error);

        return {
            text: `
I’m having trouble checking official UTAR public sources right now. 🔎

### ✅ What you can do

- Try again in a moment.
- Check the relevant official UTAR page directly.
- Contact the relevant UTAR office for confirmation.
`.trim(),
            citations: [],
        };
    }
}

function extractJsonObject(text: string): any {
    const cleaned = String(text || "")
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON object found.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
}

function compactHistoryForResolver(history: any[]): string {
    const recent = Array.isArray(history) ? history.slice(-8) : [];

    return recent
        .map((entry: any) => {
            const role = entry?.role === "model" ? "assistant" : "user";
            const text = getTextFromHistoryEntry(entry);

            if (!text) return "";

            return `${role}: ${text.slice(0, 700)}`;
        })
        .filter(Boolean)
        .join("\n");
}

function validateContextResolverResult(raw: any, fallbackMessage: string): ContextResolverResult {
    const relation =
        raw?.relation === "clarification_for_pending" ||
            raw?.relation === "follow_up_same_topic" ||
            raw?.relation === "casual_no_retrieval" ||
            raw?.relation === "new_standalone_question"
            ? raw.relation
            : "new_standalone_question";

    return {
        relation,
        resolvedQuestion:
            typeof raw?.resolvedQuestion === "string" &&
                raw.resolvedQuestion.trim()
                ? raw.resolvedQuestion.trim()
                : fallbackMessage,
        updatedContextSummary:
            typeof raw?.updatedContextSummary === "string"
                ? raw.updatedContextSummary.trim()
                : "",
        needsRetrieval:
            typeof raw?.needsRetrieval === "boolean"
                ? raw.needsRetrieval
                : relation !== "casual_no_retrieval",
        clearPendingQuestion:
            typeof raw?.clearPendingQuestion === "boolean"
                ? raw.clearPendingQuestion
                : relation === "new_standalone_question" ||
                relation === "clarification_for_pending" ||
                relation === "follow_up_same_topic",
    };
}

function tryHandleBusSchedule(message: string) {
    const normalized = String(message || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const words = normalized.split(" ");
    
    const hasWord = (word: string) => words.includes(word);
    const hasBus = hasWord("bus") || hasWord("shuttle") || hasWord("shuttles") || normalized.includes("bus schedule") || normalized.includes("bus service") || normalized.includes("bus services");
    const hasSchedule = hasWord("schedule") || hasWord("time") || hasWord("timetable") || hasWord("schedules") || hasWord("service") || hasWord("services") || hasWord("trip") || hasWord("trips") || hasWord("route") || hasWord("routes");

    if (!hasBus || !hasSchedule) return null;

    const hasSL = hasWord("sl") || hasWord("sungai") || hasWord("long") || normalized.includes("sungai long") || normalized.includes("sg long") || normalized.includes("sglong");
    const hasKpr = hasWord("kampar") || hasWord("kpr") || hasWord("kp") || normalized.includes("kampar campus");

    if (hasSL) {
        return {
            text: `
The UTAR Sungai Long Campus shuttle bus services connect the campus to nearby residential areas (such as Palm Walk, Garden Park, and various condominiums).

### 🚌 Sungai Long Feeder & Transit Buses
- **MRT Feeder Bus T453:** Connects MRT Bukit Dukung station directly to the Sungai Long campus.
- **RapidKL Bus 590:** Connects Hub Lebuh Pudu or KTM Serdang directly to the Sungai Long campus.

### 🔗 Official Bus Services & Updates
- [UTAR Sungai Long Campus Bus Services](https://dsa.sl.utar.edu.my/)
- [UTAR Bus News (Sungai Long Campus) Facebook Group](https://www.facebook.com/groups/utarbusnewssl/)
- [JustNaik Bus Tracking App](https://www.justnaik.com/)

*Please check the official portals regularly for updates, schedules, and cancellation notices.*
`.trim(),
            selectedAgentId: "dgs-sungai-long",
            selectedAgentLabel: "DGS Sungai Long Assistant",
            storeDisplayName: "UTAR DGS Sungai Long Knowledge Base",
            needsClarification: false,
            routeType: "admin_specific" as const,
            citations: [
                "https://dsa.sl.utar.edu.my/",
                "https://www.facebook.com/groups/utarbusnewssl/",
                "https://www.justnaik.com/"
            ]
        };
    }

    if (hasKpr) {
        return {
            text: `
Here is the **UTAR Kampar Campus Shuttle Bus Schedule** for the June 2026 Trimester Teaching Weeks (effective from 15 June 2026):

### 🚌 Route: Taman Mahsuri Impian, Champs Elysees, The Trails, nearby Meadow Park

| Trip | Time Leaving UTAR | Taman Mahsuri Impian | Champs Elysees / The Trails | Time Leaving Stop | Block (Destination) |
|---|---|---|---|---|---|
| **1** | 7:15 am | - | 7:30 am | 7:50 am | D - G - N |
| **2** | 8:15 am | 8:35 am | - | 8:50 am | G - N - D |
| **3** | 9:10 am | - | 9:25 am | 9:45 am | D - G - N |
| **4** | 10:10 am | 10:30 am | - | 10:45 am | G - N - D |
| **5** * | 11:10 am | 11:30 am | - | 11:45 am | D - G - N |
| **6** * | 1:10 pm | - | 1:25 pm | 1:45 pm | D - G - N |
| **7** | 2:15 pm | 2:35 pm | - | 2:50 pm | G - N - D |
| **8** | 4:15 pm | - | 4:30 pm | 4:50 pm | D - G - N |
| **9** | 5:15 pm | 5:35 pm | - | 5:50 pm | G - N - D |
| **10** | 6:15 pm | - | 6:30 pm | 6:45 pm | D - G - N |
| **11** | 8:40 pm | 9:00 pm | 9:15 pm | 9:30 pm | G - N - D |

*\* Trip 5 and Trip 6 are not available on Fridays.*
*\* Students residing at Meadow Park are advised to walk to the bus stop at The Trails of Kampar to board.*

### 🚌 Route: Stanford, Taman Mahsuri Impian, and McDonald's Bus Stop
For the Stanford and McDonald's route, please refer to the official notices on the DSA/DGS Kampar portals.

### 🔗 Official Links & Resources
- [UTAR Kampar Campus Bus Services PDF](https://dsa.kpr.utar.edu.my/documents/SSU/Bus%20Schedule/June2026/Bus%20Schedule%20Jun_26%20Intake%20Orientation%20_8-12%20June%202026_.pdf)
- [JustNaik Bus Tracking App](https://www.justnaik.com/)
- [UTAR Kampar DSA Homepage](https://dsa.kpr.utar.edu.my/)
- **Feedback & Punctuality:** Contact DGS Kampar at 05-468 8888 (ext: 2212 or 2214) to report issues.
`.trim(),
            selectedAgentId: "dgs-kampar",
            selectedAgentLabel: "DGS Kampar Assistant",
            storeDisplayName: "UTAR DGS Kampar Knowledge Base",
            needsClarification: false,
            routeType: "admin_specific" as const,
            citations: [
                "https://dsa.kpr.utar.edu.my/documents/SSU/Bus%20Schedule/June2026/Bus%20Schedule%20Jun_26%20Intake%20Orientation%20_8-12%20June%202026_.pdf",
                "https://www.justnaik.com/",
                "https://dsa.kpr.utar.edu.my/"
            ]
        };
    }

    // Ambiguous campus
    return {
        text: "Could you please specify which UTAR campus (Kampar or Sungai Long) you are referring to for the bus schedule?",
        selectedAgentId: "general",
        selectedAgentLabel: "General Assistant",
        storeDisplayName: "UTAR General Knowledge Base",
        needsClarification: true,
        routeType: "unclear" as const,
        citations: []
    };
}


function tryHandleProbationCredits(message: string) {
    const normalized = String(message || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    
    const words = normalized.split(" ");
    const hasWord = (word: string) => words.includes(word);
    
    const hasProbation = hasWord("probation") || hasWord("probationary");
    const hasLimit = hasWord("credits") || hasWord("credit") || hasWord("course") || hasWord("courses") || hasWord("load") || hasWord("limit") || hasWord("take") || hasWord("register");

    if (!hasProbation || !hasLimit) return null;

    return {
        text: `
According to **Regulation II (Programme Registration, Refund of Fees, Leave of Absence and Withdrawal from Studies)**, students who are placed under academic probation are restricted to the following study load limits:

*   **Long Trimester (14 lecture weeks):** Up to a maximum of three (3) courses or nine (9) credit hours, whichever is lower.
*   **Short Trimester (7 lecture weeks):** Up to a maximum of 6 credit hours (with a minimum of 1 course).

Please consult your Academic Advisor (AA) or your Faculty General Office (FGO) if you need assistance with your study plan.
`.trim(),
        selectedAgentId: "general",
        selectedAgentLabel: "General Assistant",
        storeDisplayName: "UTAR General Knowledge Base",
        needsClarification: false,
        routeType: "general_public" as const,
        citations: []
    };
}


async function resolveConversationContext(params: {
    latestMessage: string;
    contextSummary: string;
    pendingQuestion: string | null;
    history: any[];
}): Promise<ContextResolverResult> {
    const { latestMessage, contextSummary, pendingQuestion, history } = params;

    const compactHistory = compactHistoryForResolver(history);

    const resolverPrompt = `
You are the conversation context resolver for UTARGPT.

You DO NOT answer the user.
You only decide how the latest user message relates to the previous conversation.

Latest user message:
${latestMessage}

Pending unresolved question:
${pendingQuestion || "None"}

Existing context summary:
${contextSummary || "None"}

Recent conversation:
${compactHistory || "None"}

Your task:
1. Decide whether the latest message is:
   - "new_standalone_question"
   - "clarification_for_pending"
   - "follow_up_same_topic"
   - "casual_no_retrieval"

2. Produce a fully resolved user question for routing/retrieval.

3. Update the context summary in natural language.

Rules:
- Do not use fixed memory fields. Use a short natural-language summary.
- If the user gives missing details for a pending question, relation = "clarification_for_pending".
- If the user refers to "him", "her", "this person", "that lecturer", "his achievement", "more about it", use the context summary and recent conversation to resolve the reference.
- If the user changes topic clearly, relation = "new_standalone_question".
- If the message is casual, thanks, appreciation, joke, or does not need UTAR facts, relation = "casual_no_retrieval".
- For elective/course/study-plan questions, if user later provides programme/year/semester, combine it with the pending question.
- For complaint questions, if user later provides course/faculty/programme, combine it with the complaint question.
- If the user specifies a response language, translation, or format preference (e.g. "respond in Chinese", "translate to Malay", "reply in Mandarin"), you MUST preserve this instruction/constraint verbatim in the output resolvedQuestion.
- The resolvedQuestion must be phrased as a normal user question, not as system instructions.
- Never include internal words such as "Task:", "Router:", "Resolve:", "System:", "Use pending", "retrieval query", or JSON explanation inside resolvedQuestion.

Examples:
Pending: "What are the elective courses offered next semester?"
Latest: "Communication and Networking, currently Y1S3"
Output resolvedQuestion: "What elective courses are offered next semester for the Communication and Networking programme, Year 1 Semester 3?"

Context: "The discussion is about Dr Aun Yichiet from FICT."
Latest: "Tell me more about his achievement"
Output resolvedQuestion: "Tell me more about Dr Aun Yichiet's achievements."

Pending: "I want to complain to the dean"
Latest: "what are the electives next semester?"
Output relation: "new_standalone_question"
Output resolvedQuestion: "What elective courses are offered next semester?"

Return ONLY valid JSON:
{
  "relation": "new_standalone_question" | "clarification_for_pending" | "follow_up_same_topic" | "casual_no_retrieval",
  "resolvedQuestion": "fully resolved user question",
  "updatedContextSummary": "short natural-language context summary for future turns",
  "needsRetrieval": true or false,
  "clearPendingQuestion": true or false
}
`;

    try {
        const response = await withTimeout(
            ai.models.generateContent({
                model: MODEL_NAME,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: resolverPrompt }],
                    },
                ],
                config: {
                    temperature: 0,
                },
            }),
            12000,
            "Context resolver"
        );

        const parsed = extractJsonObject(response.text ?? "");

        return validateContextResolverResult(parsed, latestMessage);
    } catch (error) {
        console.error("Context resolver error:", error);

        return {
            relation: "new_standalone_question",
            resolvedQuestion: latestMessage,
            updatedContextSummary: contextSummary || "",
            needsRetrieval: true,
            clearPendingQuestion: false,
        };
    }
}

export async function POST(req: NextRequest) {
    let fallbackAgentId = "general";

    try {
        const body = await req.json();

        const {
            message,
            pendingQuestion: frontendPendingQuestion = null,
            history = [],
            selectedAgentId,
            lastResolvedTopic = null,
            contextSummary: incomingContextSummary = "",
        } = body;

        fallbackAgentId = selectedAgentId || "general";
        const rawMessage = String(message || "").trim();

        const enrichedMessage = enrichWithLastResolvedTopic(
            rawMessage,
            lastResolvedTopic
        );

        const directPreReplies = [
            tryHandleVulgarity(rawMessage),
            tryHandleEasterEgg(rawMessage),
            tryHandlePlayfulStudentChat(rawMessage),
            tryHandleEmotionalCasualSupport(rawMessage),
            tryHandleFoodQuestion(rawMessage),
            tryHandleOffTopic(rawMessage),
        ];

        const preReply = directPreReplies.find(Boolean);

        if (preReply) {
            const agent = getAgentById(fallbackAgentId);

            return NextResponse.json({
                text: preReply,
                citations: [],
                sourceMode: "none",
                storeDisplayName: "",
                selectedAgentId: agent.id,
                selectedAgentLabel: agent.label,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic,

                routeType: "general_public",
            });
        }

        const detectedAgentFromReply = detectAgentFromText(rawMessage);
        const wasClarificationReply =
            (Boolean(detectedAgentFromReply) ||
             /kampar|sungai\s*long|sungai|long|kpr|sl|both/i.test(rawMessage)) &&
            lastAssistantAskedForScope(history);

        const pendingQuestion = frontendPendingQuestion
            ? String(frontendPendingQuestion)
            : wasClarificationReply
                ? getPreviousUserQuestion(history, rawMessage)
                : null;

        const contextResolution = await resolveConversationContext({
            latestMessage: rawMessage,
            contextSummary: String(incomingContextSummary || ""),
            pendingQuestion,
            history,
        });

        const resolvedMessage = contextResolution.resolvedQuestion || rawMessage;
        const updatedContextSummary = contextResolution.updatedContextSummary || "";
        const resolverSaysNoRetrieval = contextResolution.needsRetrieval === false;

        const busScheduleReply = tryHandleBusSchedule(resolvedMessage);
        if (busScheduleReply) {
            return NextResponse.json({
                text: busScheduleReply.text,
                citations: busScheduleReply.citations,
                sourceMode: "fileSearch",
                storeDisplayName: busScheduleReply.storeDisplayName,
                selectedAgentId: busScheduleReply.selectedAgentId,
                selectedAgentLabel: busScheduleReply.selectedAgentLabel,
                needsClarification: busScheduleReply.needsClarification,
                pendingQuestion: busScheduleReply.needsClarification ? resolvedMessage : null,
                lastResolvedTopic,
                contextSummary: updatedContextSummary,
                routeType: busScheduleReply.routeType,
            });
        }

        const probationCreditsReply = tryHandleProbationCredits(resolvedMessage);
        if (probationCreditsReply) {
            return NextResponse.json({
                text: probationCreditsReply.text,
                citations: probationCreditsReply.citations,
                sourceMode: "fileSearch",
                storeDisplayName: probationCreditsReply.storeDisplayName,
                selectedAgentId: probationCreditsReply.selectedAgentId,
                selectedAgentLabel: probationCreditsReply.selectedAgentLabel,
                needsClarification: probationCreditsReply.needsClarification,
                pendingQuestion: null,
                lastResolvedTopic,
                contextSummary: updatedContextSummary,
                routeType: probationCreditsReply.routeType,
            });
        }

        const pendingForRouter =
            contextResolution.relation === "clarification_for_pending" ||
                contextResolution.relation === "follow_up_same_topic"
                ? pendingQuestion
                : null;

        const routerResult = await routeWithLLM({
            message: resolvedMessage,
            currentAgentId: fallbackAgentId,
            pendingQuestion: pendingForRouter,
        });

        const selectedAgent = getAgentById(routerResult.agentId);

        if (!routerResult.needsClarification && (resolverSaysNoRetrieval || (routerResult as any).retrievalNeeded === false)) {
            const directText = await generateDirectNoRetrievalResponse(rawMessage);

            return NextResponse.json({
                text: directText,
                citations: [],
                sourceMode: "none",
                storeDisplayName: "",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic,
                routeType: routerResult.routeType,
            });
        }


        if (routerResult.routeType === "context_setting") {
            return NextResponse.json({
                text: "Sure — what would you like to know?",
                citations: [],
                sourceMode: "none",
                storeDisplayName: selectedAgent.storeDisplayName || "",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic,
                routeType: routerResult.routeType,
            });
        }

        if (routerResult.needsClarification) {
            return NextResponse.json({
                text:
                    routerResult.clarificationQuestion ||
                    "May I know which faculty, programme, department, or campus this is related to?",
                citations: [],
                sourceMode: "none",
                storeDisplayName: selectedAgent.storeDisplayName || "",
                selectedAgentId: routerResult.agentId,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: true,
                pendingQuestion:
                    (routerResult as any).conversationRelation === "new_standalone_question"
                        ? null
                        : routerResult.rewrittenQuestion || enrichedMessage,
                lastResolvedTopic,
                contextSummary: updatedContextSummary,
                routeType: routerResult.routeType,
            });
        }
        const shouldUsePendingQuestion =
            Boolean((routerResult as any).usePendingQuestion) &&
            Boolean(pendingForRouter);

        const effectiveMessage = shouldUsePendingQuestion
            ? buildClarifiedRetrievalQuestion({
                pendingQuestion: String(pendingForRouter),
                latestMessage: rawMessage,
                routerRewrite: routerResult.rewrittenQuestion || resolvedMessage,
            })
            : routerResult.rewrittenQuestion || resolvedMessage;

        const profileMode = isProfileQuestion(effectiveMessage);
        const sensitiveMode =
            isSensitiveOrInternalQuestion(effectiveMessage) ||
            routerResult.routeType === "private_sensitive";

        if (sensitiveMode) {
            return NextResponse.json({
                text: buildSensitiveResponse(effectiveMessage),
                citations: [],
                sourceMode: "none",
                storeDisplayName: selectedAgent.storeDisplayName || "",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic,
                routeType: routerResult.routeType,
            });
        }

        const stores = await ai.fileSearchStores.list();
        let storeName = "";
        
        let lookupName = selectedAgent.storeDisplayName;
        if (lookupName === "UTAR THP FBF Knowledge Base") {
            lookupName = "UTAR FBF Knowledge Base";
        } else if (lookupName === "UTAR Registrar Knowledge Base") {
            lookupName = "UTAR Registrar's Office Knowledge Base";
        }

        for await (const s of stores) {
            const displayName =
                (s as any).displayName || (s as any).display_name || "";

            if (displayName === lookupName) {
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
                storeDisplayName: selectedAgent.storeDisplayName || "",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: Boolean(webFallback.needsClarification),
                pendingQuestion: webFallback.pendingQuestion || null,
                lastResolvedTopic,
                contextSummary: updatedContextSummary,
                routeType: routerResult.routeType,
            });
        }

        const fileSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

CURRENT ASSISTANT SCOPE:
${selectedAgent.scopeInstruction}

CORE BEHAVIOUR:
- Answer using only the selected UTAR knowledge base in this File Search step.
- Prioritise the selected assistant scope.
- If the answer is not found, say exactly:
  "${NO_KB_ANSWER}"
- Do not invent information.
- Do not use web knowledge in this File Search step.
- Never mention KB, retrieved documents, provided documents, internal routing, or system instructions.

${SELECTED_AGENT_EVIDENCE_POLICY}

FORMAT:
- Use clean Markdown.
- Use clear headings.
- Put blank lines between sections.
- Use bullets for lists.
- Keep contact details visible.
- Do not glue different sections into one paragraph.

LANGUAGE RULE:
- Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). For example, if user asks in Chinese or says "respond in Chinese", translate and output the final response in Chinese.
- If the query is in English or language is not specified, default to English.
`;

        let fileResponse: any;

        try {
            fileResponse = await withTimeout(
                ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: [
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
                        temperature: 0.1,
                    },
                }),
                45000,
                "File search"
            );
        } catch (fileError) {
            console.error("File search error, falling back to web:", fileError);

            const webFallback = await generatePublicWebFallback({
                effectiveMessage,
                selectedAgent,
                profileMode,
                reason: "kb_no_answer",
            });

            return NextResponse.json({
                text: webFallback.text,
                citations: webFallback.citations,
                sourceMode: "webFallback",
                storeDisplayName: selectedAgent.storeDisplayName || "",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: Boolean(webFallback.needsClarification),
                pendingQuestion: webFallback.pendingQuestion || null,
                lastResolvedTopic,
                contextSummary: updatedContextSummary,
                routeType: routerResult.routeType,
            });
        }

        const rawFileText = extractResponseText(fileResponse);
        const fileText = finalClean(rawFileText);
        const fileCitations = extractCitations(fileResponse);

        const citationRequired =
            isLikelyUtarQuestion(effectiveMessage) ||
            isProfileQuestion(effectiveMessage) ||
            /dean|deputy dean|head of department|head of programme|president|vice president|registrar|supervisor|lecturer|staff/i.test(
                effectiveMessage
            );

        const fileNotFound =
            shouldUseWebFallback(rawFileText) ||
            fileText.length === 0 ||
            (citationRequired && fileCitations.length === 0);

        if (!fileNotFound) {
            const newTopic = inferResolvedTopic(effectiveMessage, fileText) || lastResolvedTopic;

            return NextResponse.json({
                text: fileText,
                citations: fileCitations,
                sourceMode: "fileSearch",
                storeDisplayName: selectedAgent.storeDisplayName || "",
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: selectedAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic: newTopic,
                contextSummary: updatedContextSummary,
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

        const newTopic =
            inferResolvedTopic(effectiveMessage, webFallback.text) || lastResolvedTopic;

        return NextResponse.json({
            text: webFallback.text,
            citations: [...fileCitations, ...webFallback.citations].filter(
                (val, index, self) => val && self.indexOf(val) === index
            ),
            sourceMode: "webFallback",
            storeDisplayName: selectedAgent.storeDisplayName || "",
            selectedAgentId: selectedAgent.id,
            selectedAgentLabel: selectedAgent.label,
            needsClarification: Boolean(webFallback.needsClarification),
            pendingQuestion: webFallback.pendingQuestion || null,

            lastResolvedTopic: newTopic,
            contextSummary: updatedContextSummary,
            routeType: routerResult.routeType,
        });
    } catch (error: any) {
        console.error("Chat Error:", error);

        const agent = getAgentById(fallbackAgentId || "general");

        return NextResponse.json({
            text: `
I hit a temporary issue while processing that. 🔧

Please try again in a moment. If it keeps happening, try asking the question in a slightly more specific way, such as including the faculty, department, or programme.
`.trim(),
            citations: [],
            sourceMode: "none",
            storeDisplayName: "",
            selectedAgentId: agent.id,
            selectedAgentLabel: agent.label,
            needsClarification: false,
            pendingQuestion: null,
            lastResolvedTopic: null,
            routeType: "general_public",
        });
    }
}