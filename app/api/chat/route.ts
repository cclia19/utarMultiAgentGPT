import { NextRequest, NextResponse, after } from "next/server";
import { metricsStore, newMetrics, markPipelineError } from "@/lib/analytics/metrics";
import { logChatEvent } from "@/lib/analytics/logEvent";
import { ai, MODEL_NAME } from "@/lib/gemini";
import { getAgentById } from "@/lib/agents";
import { detectAgentFromText } from "@/lib/routing";
import { looksLikeFactualQuestion, CASUAL_INTENT_CATEGORIES } from "@/lib/factualQuestion";
import { trySmallTalkReply, AVO_DADDY_REPLY } from "@/lib/smallTalk";
import { tryBusScheduleReply } from "@/lib/busSchedule";
import { BOTH_CAMPUSES_RULE, campusFamily } from "@/lib/campusOffices";
import { dropRepeatedAnswer } from "@/lib/repeatedAnswer";
import { FOLLOW_UPS_RULE, extractFollowUps, languageRule } from "@/lib/followUps";
import { routeWithLLM } from "@/lib/intentRouter";
import {
    getDeptCatalog,
    lookupStaff,
    matchRole,
    resolveDeptCodes,
    findDeptCodesForRole,
    type StaffRecord,
} from "@/lib/staffDirectory";
import { isPersonRoleQuestion } from "@/lib/personRoleQuestion";
import { getOrgUnitById } from "@/lib/orgUnits";
import {
    isAnswerChallenge,
    isIntakeOrCalendarQuestion,
    isProgrammeContentQuestion,
    formatEarlierAssistantAnswers,
    formatRecentConversation,
    extractOfficialUtarUrls,
    findRecentUserUtarUrls,
} from "@/lib/conversationSignals";
import {
    fetchOfficialUtarPage,
    fetchOfficialUtarPageCached,
    DACE_INTAKE_CALENDAR_URL,
    type OfficialPage,
} from "@/lib/officialPage";

/**
 * Vercel's default function timeout is 10s, which this route can exceed on a
 * cold cache: a position question measured 17.4s end to end (catalog fetch +
 * one fetch per matching department office + the routing LLM calls), against
 * 4.6s once the 24h catalog cache is warm. Being killed mid-flight would make
 * the first request after an idle period look broken.
 */
export const maxDuration = 60;

/**
 * The staff directory (www2.utar.edu.my) is hosted in Malaysia. Left to its own
 * devices this function executed in iad1 (US-East), and from there the fetch
 * failed in ~3.4s — far below the 15s budget, so the failure was a refused or
 * reset connection rather than a timeout. The same request succeeds from other
 * datacenters, which points at the egress path rather than the directory.
 *
 * Pinning execution to Singapore puts egress ~10ms from UTAR and on an APAC
 * address. If the directory still refuses from here the cause is not distance,
 * and the snapshot approach is the answer rather than another budget increase.
 */
export const preferredRegion = "sin1";

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

/**
 * Who does this fact apply to? Dates, fees and requirements differ by
 * programme level, programme and campus. Answering "5 Oct 2026" for everyone
 * from a postgraduate handbook was the failure this rule exists for.
 */
const APPLICABILITY_POLICY = `
APPLICABILITY RULE (who an answer applies to):
- Dates, intakes, fees, deadlines, requirements and procedures often differ by programme level (foundation, undergraduate, postgraduate), by programme (e.g. MBBS, Nursing, Master of Architecture), by campus (Kampar, Sungai Long) and by intake.
- For each fact, state who it applies to as the source states it (e.g. "Postgraduate programmes: 5 October 2026").
- Never generalise a fact from one group to all students. If the source is a handbook or page for one group (e.g. a Postgraduate Handbook), say so.
- If the evidence covers only some groups, give those, then say plainly which groups are not covered here and where to check (the official UTAR page for that office).
- If the user asks whether something applies to everyone and the evidence does not explicitly say so, do not answer "yes".
- When sources disagree, the official UTAR web page is authoritative over documents; mention the date of the source when it is shown.
`;

/**
 * One response style for every answering prompt (KB, web fallback, pasted
 * page), so answers look the same whichever path produced them. Topic rules
 * (bus routes, profiles, calendars) only add to this.
 */
const RESPONSE_STYLE = `
RESPONSE STYLE (every answer):
- Open with the direct answer in one or two sentences. No preamble ("Here is...", "Based on the information...") and do not restate the question.
- Then only the detail that answer needs. Aim for under 150 words; go longer only for step-by-step procedures or when the user asks for everything.
- Leave out background the user did not ask for (history, related services, expansions); offer it in one line instead if it is useful.
- Pick the layout that fits the content:
  - Dates, fees or rules that differ by group: one bullet per group, bold label first ("**Undergraduate:** 26 October 2026").
  - How-to or procedure: numbered steps, one action per step, with form names and offices in bold.
  - Schedule or timetable (bus trips, exam sessions): summarise it in your own words as short bullets. Never copy it as a table or row by row: Gemini blocks timetables reproduced from a document.
  - Comparison of two or more options on the same points: a compact table (at most 4 short columns).
  - Contact details: bullets for office, email, phone, location and hours (only the ones you have).
  - Anything else: short paragraphs of two or three sentences.
- Use a "###" heading only when the answer has two or more distinct parts. Never use "#" or "##".
- Bold only key facts (dates, amounts, deadlines, form names), never whole sentences.
- Write dates as "5 October 2026" and times as "7:15 am". Never copy footnote markers (*, ^, #) from tables; say what they mean in words.
- When there is a clear next step (a deadline, a form, an office to contact), end with one line starting "**Next step:**".
- Start every "###" heading with one fitting emoji (e.g. "### 📚 Core courses", "### 📞 Contact"). No other emoji in factual answers. Put blank lines between sections.
- Specific format rules elsewhere in these instructions (e.g. profile or contact sections) take precedence.
`;

/**
 * Added for intake / trimester-start questions. Calendar tables have one column
 * per intake cohort, and without this the model listed "February Intake
 * Postgraduate Programme, June Intake Postgraduate Programme, ..." under each
 * date instead of one date per programme level.
 */
function buildCalendarFormatInstruction(): string {
    // Malaysia date (UTC+8): "today or later" must not be a day behind before 8 am.
    const todayISO = new Date(Date.now() + 8 * 3600_000).toISOString().split("T")[0];
    return `
CALENDAR ANSWER FORMAT (intake and trimester start dates). Today's date: ${todayISO}
- An official UTAR page may be included below. It is evidence you may use, and it wins over documents when they disagree (e.g. campus-specific dates).
- Start with a short heading naming the trimester, e.g. "### October 2026 trimester".
- "Next trimester" / "when does the next trimester start": decide PER PROGRAMME LEVEL, using today's date (${todayISO}). For each level, the next start is the earliest start date that is TODAY OR LATER. Levels start on different dates, so one level's trimester having started does not move the others on: e.g. if postgraduate started on 5 October but undergraduate starts on 26 October, the undergraduate answer is still 26 October (October trimester) while postgraduate's next is January. Never present a date before today as the next start; if a level's current trimester has already begun, say so briefly ("Postgraduate: October trimester began 5 October 2026; next intake 25 January 2027"). Use one heading per trimester when levels fall in different trimesters.
- Then ONE bullet per programme level, date first, in this order: Postgraduate, Undergraduate, Foundation, then programmes with their own dates (e.g. MBBS, Nursing, Master of Architecture).
  Example: "**Postgraduate:** 5 October 2026". Put campus differences on the same bullet: "**Undergraduate:** 26 October 2026 (Kampar) / 27 October 2026 (Sungai Long)".
- Calendar tables have one column per intake (February, June, October intake). These are groups of students by when they enrolled, not separate programmes. If all intakes of a level start on the same date, give that date once and say it applies to both new and current students. Split by intake only when the dates differ, and then write "students who enrolled in the June intake", never "June Intake Postgraduate Programme".
- Never copy footnote markers (*, ^, #) from tables. If a footnote changes who a date applies to, say it in words.
- Leave out later trimesters and "to be confirmed" rows unless the user asked about them.
- Keep it short: no teaching-week or exam-period breakdown unless asked.
`;
}

/**
 * Added to the answering prompt when the user challenges or questions a
 * previous answer. Without it the model defended or reinterpreted its earlier
 * answer instead of admitting the mistake.
 */
function buildCorrectionInstruction(earlierAnswers: string): string {
    if (!earlierAnswers) return "";
    return `
CORRECTION MODE (the user is questioning or correcting a previous answer):
- Work out WHICH of your earlier answers (below, oldest first) the user means. "In the beginning", "at first" or "earlier" points to an early answer, not the most recent one.
- Re-check that answer against the evidence available now.
- If it was wrong, incomplete, or applied a fact to the wrong group, say so plainly in your FIRST sentence, e.g. "You're right — my earlier answer was wrong: 5 October 2026 is the start date for postgraduate programmes only." Then give the corrected, complete answer.
- If the user asks WHY you said something, give the honest reason in one sentence (e.g. the earlier answer relied on a source that only covered one group of students and I wrongly applied it to everyone), apologise briefly, then give the corrected answer.
- Never invent a justification, never reinterpret the earlier answer so it looks right, and never change the subject.
- If ANY of your earlier answers was wrong, admit it, even when a later answer already corrected it. Never say "I did not say that" unless none of the earlier answers below said it.
- If none of your earlier answers said what the user claims, say so politely and quote what you actually said.
- If the evidence confirms the answer was correct and complete, say so and show the supporting detail.
- If the evidence is not enough to decide, say you cannot confirm it and point to the official source.
- In this mode, if the evidence does not answer the question, output "${NO_KB_ANSWER}" so another source can be checked.

Your earlier answers in this conversation (oldest first):
"""
${earlierAnswers.slice(0, 5000)}
"""
`;
}

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

${APPLICABILITY_POLICY}
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

function isSocialMediaHost(uri: string): boolean {
    try {
        const url = new URL(uri);
        const host = url.hostname.toLowerCase();
        return (
            host.includes("facebook.com") ||
            host.includes("instagram.com") ||
            host.includes("linkedin.com") ||
            host.includes("youtube.com") ||
            host.includes("youtu.be") ||
            host.includes("x.com") ||
            host.includes("twitter.com")
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

function computeUrlRankScore(uri: string): number {
    try {
        const url = new URL(uri);
        const host = url.hostname.toLowerCase();
        const path = url.pathname.replace(/\/+$/, "");

        const isUtarDomain =
            host === "utar.edu.my" ||
            host.endsWith(".utar.edu.my") ||
            host.includes("utar.edu.my");

        const isSocial = isSocialMediaHost(uri);

        if (isUtarDomain) {
            const pathSegments = path.split("/").filter(Boolean);
            const isDeep = pathSegments.length > 0;

            if (isDeep) {
                // Tier 1: UTAR deep link (path deeper than /).
                // Base 1000 + depth bonus + query bonus + subdomain bonus.
                let score = 1000 + Math.min(pathSegments.length, 10) * 10;
                if (url.search) score += 5;
                if (host !== "www.utar.edu.my" && host !== "utar.edu.my") {
                    score += 2;
                }
                return score;
            } else {
                // Tier 2: UTAR root link.
                // Subdomain root (e.g. library.utar.edu.my) base 500, main root base 400.
                if (host !== "www.utar.edu.my" && host !== "utar.edu.my") {
                    return 500;
                }
                return 400;
            }
        }

        if (isSocial) {
            // Tier 3: Social media link. Base score 10.
            return 10;
        }

        return 0;
    } catch {
        return 0;
    }
}

function rankAndFilterOfficialLinks(links: OfficialLink[]): OfficialLink[] {
    const merged = mergeLinks(links);

    const utarLinks: { link: OfficialLink; score: number; originalIndex: number }[] = [];
    const socialLinks: { link: OfficialLink; score: number; originalIndex: number }[] = [];

    merged.forEach((link, originalIndex) => {
        if (!link.uri || !isOfficialUtarSource(link.uri, link.title)) return;

        const isSocial = isSocialMediaHost(link.uri);
        const score = computeUrlRankScore(link.uri);

        if (isSocial) {
            socialLinks.push({ link, score, originalIndex });
        } else if (score >= 400) {
            utarLinks.push({ link, score, originalIndex });
        }
    });

    // If any official UTAR domain links exist (Tier 1 or Tier 2),
    // NEVER use social media links as a factual citation.
    if (utarLinks.length > 0) {
        utarLinks.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.originalIndex - b.originalIndex;
        });
        return utarLinks.map((item) => item.link);
    }

    // Only if NO UTAR domain links exist at all, keep social links placed last
    if (socialLinks.length > 0) {
        socialLinks.sort((a, b) => a.originalIndex - b.originalIndex);
        return socialLinks.map((item) => item.link);
    }

    return [];
}

function getCanonicalLinksForAgent(agentId: string): OfficialLink[] {
    const unit = getOrgUnitById(agentId);
    const unitWebsite = unit.website;

    if (unitWebsite && isOfficialUtarSource(unitWebsite)) {
        return [
            {
                title: `${unit.shortLabel || unit.name} Official Website`,
                uri: unitWebsite,
            },
            {
                title: "UTAR Official Website",
                uri: "https://www.utar.edu.my/",
            },
        ];
    }

    return [
        {
            title: "UTAR Official Website",
            uri: "https://www.utar.edu.my/",
        },
    ];
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
    const base = dropRepeatedAnswer(cleanUserFacingText(text)).replace(/\n{3,}/g, "\n\n").trim();
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
    const candidates = response?.candidates;
    let citations: string[] = [];

    if (candidates && candidates[0]?.groundingMetadata?.groundingChunks) {
        citations = candidates[0].groundingMetadata.groundingChunks
            .map((chunk: any) => {
                if (chunk.retrievedContext?.title) return chunk.retrievedContext.title;
                if (chunk.retrievedContext?.uri) return chunk.retrievedContext.uri;
                if (chunk.web?.title) return chunk.web.title;
                if (
                    chunk.web?.uri &&
                    !isGroundingRedirectUri(chunk.web.uri) &&
                    isOfficialUtarSource(chunk.web.uri, chunk.web?.title || "")
                ) {
                    return chunk.web.uri;
                }
                return null;
            })
            .filter(
                (val: string | null, index: number, self: (string | null)[]): val is string =>
                    Boolean(val) && self.indexOf(val) === index
            );
    }

    return citations;
}

const REDIRECT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
const redirectResolutionCache = new Map<string, { finalUri: string | null; expiresAt: number }>();

async function resolveRedirectUrl(uri: string, timeoutMs = 2500): Promise<string | null> {
    if (!uri) return null;

    const cached = redirectResolutionCache.get(uri);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.finalUri;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        let finalUrl: string | null = null;

        // Try HEAD first
        try {
            const headRes = await fetch(uri, {
                method: "HEAD",
                redirect: "follow",
                signal: abortController.signal,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
            });

            if (headRes.url && !isGroundingRedirectUri(headRes.url)) {
                finalUrl = headRes.url;
            }
        } catch {
            // HEAD might be rejected or fail; try ranged GET below
        }

        // If HEAD didn't resolve to a non-redirect destination, try ranged GET
        if (!finalUrl && !abortController.signal.aborted) {
            try {
                const getRes = await fetch(uri, {
                    method: "GET",
                    redirect: "follow",
                    signal: abortController.signal,
                    headers: {
                        Range: "bytes=0-0",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    },
                });

                if (getRes.url && !isGroundingRedirectUri(getRes.url)) {
                    finalUrl = getRes.url;
                }
            } catch {
                // Ignore GET failure
            }
        }

        let result: string | null = null;
        if (finalUrl && isOfficialUtarSource(finalUrl)) {
            result = finalUrl;
        }

        redirectResolutionCache.set(uri, {
            finalUri: result,
            expiresAt: Date.now() + REDIRECT_CACHE_TTL_MS,
        });

        return result;
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function extractOfficialWebLinks(response: any): Promise<OfficialLink[]> {
    const candidates = response?.candidates;
    const rawChunks = candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (!Array.isArray(rawChunks) || rawChunks.length === 0) {
        return [];
    }

    const groundingSupports = candidates?.[0]?.groundingMetadata?.groundingSupports;

    // Resolve all grounding chunks visited by Gemini in parallel
    const resolvedChunks = await Promise.allSettled(
        rawChunks.map(async (chunk: any) => {
            const title = chunk.web?.title || chunk.retrievedContext?.title || "";
            const uri = chunk.web?.uri || chunk.retrievedContext?.uri;
            if (!uri || typeof uri !== "string") {
                return null;
            }

            if (!isGroundingRedirectUri(uri)) {
                const directVerified = getVerifiedOfficialUri(uri, title);
                if (directVerified && !isGroundingRedirectUri(directVerified)) {
                    return {
                        title: cleanLinkTitle(title || "Official UTAR Link", directVerified),
                        uri: directVerified,
                    };
                }
            }

            const resolved = await resolveRedirectUrl(uri, 2500);
            if (resolved && isOfficialUtarSource(resolved, title)) {
                return {
                    title: cleanLinkTitle(title || "Official UTAR Link", resolved),
                    uri: resolved,
                };
            }
            return null;
        })
    );

    const chunkMap = new Map<number, OfficialLink>();
    resolvedChunks.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value) {
            chunkMap.set(idx, res.value);
        }
    });

    const orderedLinks: OfficialLink[] = [];

    // Per-part citations: map groundingSupports segments to chunk indices
    // so multi-part questions carry sources for each segment
    if (Array.isArray(groundingSupports) && groundingSupports.length > 0) {
        for (const support of groundingSupports) {
            const indices = support?.groundingChunkIndices;
            if (Array.isArray(indices)) {
                for (const idx of indices) {
                    const link = chunkMap.get(idx);
                    if (link) {
                        orderedLinks.push(link);
                    }
                }
            }
        }
    }

    // Append all resolved chunks in order (for remaining parts or when groundingSupports is absent)
    for (let i = 0; i < rawChunks.length; i++) {
        const link = chunkMap.get(i);
        if (link) {
            orderedLinks.push(link);
        }
    }

    return rankAndFilterOfficialLinks(orderedLinks);
}

function shouldUseWebFallback(text: string, message = ""): boolean {
    const hasNoKb = text.includes(NO_KB_ANSWER);
    if (hasNoKb) return true;

    if (message && isInstitutionalLeadershipQuestion(message)) {
        return true;
    }

    // Detailed substantive answers (>350 chars) should not be forced into web fallback
    if (text.trim().length > 350) {
        return false;
    }

    const normText = normalize(text);

    const weakSignals = [
        "couldnt find",
        "could not find",
        "no relevant information",
        "no specific information",
        "no response generated",
        "couldnt verify",
        "cannot be verified",
        "not verified",
        "not directly provided",
        "not provided in the search",
        "not readily available",
    ];

    const matched = weakSignals.find((signal) => normText.includes(normalize(signal)));
    if (matched) return true;

    return false;
}

function isInstitutionalLeadershipQuestion(message: string): boolean {
    const lower = normalize(message);

    const signals = [
        "utar president",
        "president of utar",
        "president ceo",
        "president and ceo",
        "vice president",
        "vice presidents",
        "vice president of utar",
        "utar vice president",
        "registrar",
        "registra",
        "registar",
        "head of registrar",
        "rgo",
        "rgo of utar",
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
        "disciplinary record",
        "medical record",
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
        "my results",
        "my grade",
        "my grades",
        "my cgpa",
        "my gpa",
        "my disciplinary",
        "check my result",
        "check my grade",
        "check my cgpa",
        "check my gpa",
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
        return AVO_DADDY_REPLY;
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

async function generateDirectNoRetrievalResponse(message: string, history: any[] = [], extraRules = ""): Promise<string> {
    // The conversation is included so a reply about "what you said earlier" is
    // grounded in what was actually said. Without it the model invented
    // explanations for answers it could not see.
    const recent = formatRecentConversation(history.slice(0, -1), 6, 1200);
    const userText = recent
        ? `Recent conversation (for reference only):\n${recent}\n\nLatest user message:\n${message}`
        : message;
    const response = await withTimeout(
        ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: userText }] }],
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
- Do not state new UTAR facts (dates, fees, names, rules) in this reply.
- If the user refers to something you said earlier, rely only on the recent conversation shown. If your earlier reply was wrong or overstated, admit it plainly and briefly; never invent a reason or reinterpret what you said to make it look right.
- If the user asks you to do their assignment, politely refuse to do it for them, but offer to guide, explain, outline, review, or help them learn.
- If the message is casual, social, playful, or appreciation, reply naturally and briefly.
- If asked to rank or pick a favourite UTAR lecturer or staff member, say there is no official ranking and keep it playful. Never name a real person as the best or worst.
- Keep it concise.
- LANGUAGE RULE: Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). If the query is in English or language is not specified, default to English.
${extraRules}
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

function buildFileSearchUserMessage(message: string, agentId?: string): string {
    // Course tables sit far from the programme overview in the handbooks, so
    // "how much maths is in CS?" found the overview and said "not specified".
    if (isProgrammeContentQuestion(message)) {
        return `
User question:
${message}

Search intent:
This asks what a programme teaches. Search the programme structure / course list for the programme named (headings such as "Course Code", "Core", "Specialisation Modules", "Field Electives", "Free Modules"), not only the programme overview or entry requirements. Answer by listing the relevant courses by name and course code, grouped as the source groups them.
`;
    }
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

async function fetchLiveUtarSearchSnippets(userQuery: string): Promise<{ text: string; links: string[] }> {
    const cleanQuery = String(userQuery || "")
        .replace(/\bregistar\b/gi, "registrar")
        .replace(/\bregistra\b/gi, "registrar")
        .replace(/\bvp\b/gi, "vice president")
        .trim();

    const searchQuery = `UTAR ${cleanQuery}`;

    const encoded = encodeURIComponent(searchQuery);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;

    try {
        const response = await fetch(searchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            return { text: "", links: [] };
        }

        const html = await response.text();

        const snippets: string[] = [];
        const links: string[] = [];

        const snippetMatches = html.matchAll(/<a [^>]*class="result__snippet[^"]*"[^>]*>(.*?)<\/a>/g);
        for (const match of snippetMatches) {
            const cleanText = match[1].replace(/<[^>]+>/g, "").trim();
            if (cleanText && cleanText.length > 15) {
                snippets.push(cleanText);
            }
        }

        const urlMatches = html.matchAll(/<a [^>]*class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g);
        for (const match of urlMatches) {
            let rawUrl = match[1].trim();
            if (rawUrl.includes("uddg=")) {
                const decodedParam = rawUrl.split("uddg=")[1]?.split("&")[0];
                if (decodedParam) {
                    rawUrl = decodeURIComponent(decodedParam);
                }
            }
            if (rawUrl.startsWith("http") && rawUrl.includes("utar.edu.my")) {
                if (!links.includes(rawUrl)) {
                    links.push(rawUrl);
                }
            }
        }

        const formattedText = snippets.length
            ? snippets.slice(0, 8).map((s, i) => `[Snippet ${i + 1}]: ${s}`).join("\n")
            : "";

        return {
            text: formattedText,
            links: links.slice(0, 5),
        };
    } catch (error) {
        console.error("fetchLiveUtarSearchSnippets error:", error);
        return { text: "", links: [] };
    }
}

function formatStaffRecords(records: StaffRecord[]): string {
    const blocks = records.map((r) => {
        const lines = [`**${r.name}**`];

        // A person can hold several appointments; show every one the directory lists.
        if (r.adminPositions.length) {
            lines.push(`- **Position:** ${r.adminPositions.join(" · ")}`);
        }
        if (r.jobTitle) lines.push(`- **Title:** ${r.jobTitle}`);

        lines.push(`- **Department:** ${r.department}`);

        if (r.division) lines.push(`- **Unit:** ${r.division}`);
        if (r.email) lines.push(`- **Email:** ${r.email}`);
        if (r.phone) lines.push(`- **Phone:** ${r.phone}`);

        return lines.join("\n");
    });

    return blocks.join("\n\n");
}

/**
 * Answers "who holds position X" from the live UTAR staff directory.
 *
 * Every fact in the response comes from a parsed directory record. Returns null
 * only when this is not a role question at all; a lookup that finds nobody
 * returns a refusal rather than falling through to web search, because the web
 * path is what produced the stale-name bug this exists to fix.
 */
async function answerFromStaffDirectory(params: {
    effectiveMessage: string;
    selectedAgent: any;
}): Promise<WebFallbackResult | null> {
    const { effectiveMessage, selectedAgent } = params;
    const { isRoleQuestion, rolePhrase } = isPersonRoleQuestion(effectiveMessage);

    if (!isRoleQuestion) return null;

    const directoryLink = {
        title: "UTAR Staff Directory",
        uri: "https://www2.utar.edu.my/staffListSearchV2.jsp",
    };

    const refusal: WebFallbackResult = {
        text: `
I can't confirm who currently holds that position from UTAR's official staff directory, so I'd rather not name anyone than risk giving you an outdated name. 🔎

### 📢 What you can do
- Search the official UTAR Staff Directory directly using the link below.
- Contact the relevant UTAR office to confirm.
`.trim(),
        citations: [directoryLink.uri],
        needsClarification: false,
        pendingQuestion: null,
    };

    try {
        const catalog = await getDeptCatalog();
        if (!catalog.length) return refusal;

        // A role like "vice president" names its own offices; anything else is
        // scoped to the unit routing already selected.
        let deptCodes = findDeptCodesForRole(rolePhrase, catalog);

        if (!deptCodes.length) {
            const unit = getOrgUnitById(selectedAgent.id);
            deptCodes = resolveDeptCodes(unit, catalog);
        }

        if (!deptCodes.length) return refusal;

        const records = await lookupStaff({ deptCodes });
        const matched = matchRole(records, rolePhrase);

        if (!matched.length) return refusal;

        const text = [
            "### 📌 Summary",
            "",
            formatStaffRecords(matched),
        ].join("\n");

        return {
            text: appendOfficialLinks(text, [directoryLink]),
            citations: [directoryLink.uri],
            needsClarification: false,
            pendingQuestion: null,
        };
    } catch (error) {
        console.error("answerFromStaffDirectory failed:", error);
        return refusal;
    }
}

async function tryStaffDirectoryFallback(params: {
    effectiveMessage: string;
    selectedAgent: any;
    lastResolvedTopic: string | null;
    updatedContextSummary: string;
    routeType: string;
}): Promise<NextResponse | null> {
    const {
        effectiveMessage,
        selectedAgent,
        lastResolvedTopic,
        updatedContextSummary,
        routeType,
    } = params;

    const directoryAnswer = await answerFromStaffDirectory({
        effectiveMessage,
        selectedAgent,
    });

    if (!directoryAnswer) return null;

    return NextResponse.json({
        text: directoryAnswer.text,
        citations: directoryAnswer.citations,
        sourceMode: "staffDirectory",
        storeDisplayName: selectedAgent.storeDisplayName || "",
        selectedAgentId: selectedAgent.id,
        selectedAgentLabel: selectedAgent.label,
        needsClarification: false,
        pendingQuestion: null,
        lastResolvedTopic,
        contextSummary: updatedContextSummary,
        routeType,
    });
}

async function generatePublicWebFallback(params: {
    effectiveMessage: string;
    selectedAgent: any;
    profileMode: boolean;
    fileText?: string;
    fileCitations?: string[];
    reason: "kb_missing" | "kb_no_answer";
    extraInstruction?: string;
}): Promise<WebFallbackResult> {
    const {
        effectiveMessage,
        selectedAgent,
        profileMode,
        fileText = "",
        fileCitations = [],
        reason,
        extraInstruction = "",
    } = params;

    const agentId = selectedAgent.id || "general";

    const now = new Date();
    const currentYear = now.getFullYear();
    const nextYear = currentYear + 1;
    const todayISO = now.toISOString().split("T")[0];

    const supervisorMode = isSupervisorRecommendationQuestion(effectiveMessage);
    const institutionalMode = isInstitutionalLeadershipQuestion(effectiveMessage);
    const misconductMode = isMisconductConcernQuestion(effectiveMessage);
    const complaintMode = isComplaintQuestion(effectiveMessage);

    const webSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

SYSTEM CONTEXT & REAL-TIME DATE:
- Current Server Date: ${todayISO}
- Current Calendar Year: ${currentYear}
- Current Academic Session / Year Range: ${currentYear}–${nextYear}

CURRENT ASSISTANT SCOPE:
${selectedAgent.scopeInstruction}

Use public web search because the selected UTAR knowledge base is incomplete, unavailable, or insufficient.

SOURCE RULES:
- Prefer official UTAR sources first (utar.edu.my subdomains, rgo.utar.edu.my, news.utar.edu.my, and official UTAR staff directories).
- Do not use other universities for UTAR-specific answers.
- Do not invent emails, phone numbers, office locations, portals, supervisors, or links.
- Do not mention internal limitations, search snippets, filtering, grounding API, or source rejection.
- If exact official wording is unavailable for misconduct/complaint questions, still give safe, practical guidance without claiming exact policy text.
- Do not name the holder of any UTAR position (President, Vice President, Registrar, Dean, Deputy Dean, HOD, Director). Position holders are resolved from the official staff directory elsewhere. If asked, say the detail should be confirmed via the official UTAR Staff Directory.

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

${RESPONSE_STYLE}- Do not create empty link labels.

LANGUAGE RULE:
- Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). For example, if user asks in Chinese or says "respond in Chinese", translate and output the final response in Chinese.
- If the query is in English or language is not specified, default to English.
${extraInstruction}
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
Answer this UTAR question using official Google Search Grounding for Universiti Tunku Abdul Rahman (UTAR).

User Question:
${effectiveMessage}

Selected assistant:
${selectedAgent.label}

Important:
- Search for current Universiti Tunku Abdul Rahman (UTAR) information.
- Avoid other universities.
- For leadership/position queries, perform targeted search across UTAR portals (utar.edu.my, rgo.utar.edu.my, news.utar.edu.my, staff directory) to verify current active post-holders and list all active Vice Presidents across all portfolios.
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

        const officialLinks = await extractOfficialWebLinks(webResponse);
        let deepLinks = officialLinks;

        if (deepLinks.length === 0) {
            const liveSnippets = await fetchLiveUtarSearchSnippets(effectiveMessage);
            if (liveSnippets.links && liveSnippets.links.length > 0) {
                const searchLinks: OfficialLink[] = liveSnippets.links
                    .filter((u) => isOfficialUtarSource(u))
                    .map((u) => ({
                        title: cleanLinkTitle("", u),
                        uri: u,
                    }));
                deepLinks = rankAndFilterOfficialLinks(searchLinks);
            }
        }

        const canonicalLinks = getCanonicalLinksForAgent(agentId);
        const allowedLinks = deepLinks.length > 0 ? deepLinks : canonicalLinks;

        let baseText = finalCleanWebAnswer(
            extractResponseText(webResponse),
            allowedLinks
        );

        // extractResponseText() returns "No response generated." for empty output; at
        // 22 chars it slipped past the length check and reached users verbatim.
        const weakAnswer =
            baseText.trim().length < 20 ||
            baseText.includes(NO_KB_ANSWER) ||
            baseText.trim() === "No response generated.";

        if (weakAnswer && (institutionalMode || supervisorMode || profileMode)) {
            // Secondary live search snippet fallback if Google Search Grounding yielded weak/empty output
            const liveSnippets = await fetchLiveUtarSearchSnippets(effectiveMessage);
            if (liveSnippets.text) {
                const retryResponse = await ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `
User Question: ${effectiveMessage}

Live Search Snippets from Official UTAR Sources:
${liveSnippets.text}

Synthesize a clear, accurate, and complete answer directly answering the user's question using the live search snippets.
If asked about Registrar or RGO, state the Head of Registrar and official Registrar's Office details.
If asked about Vice Presidents, list all active Vice Presidents across portfolios based on search evidence.
`,
                                },
                            ],
                        },
                    ],
                    config: {
                        systemInstruction: { parts: [{ text: webSearchSystemInstruction }] },
                        temperature: 0.1,
                    },
                });

                const synthesizedText = finalClean(extractResponseText(retryResponse));
                if (synthesizedText && synthesizedText.length > 30 && !synthesizedText.includes(NO_KB_ANSWER)) {
                    const snippetLinks: OfficialLink[] = (liveSnippets.links || [])
                        .filter((u) => isOfficialUtarSource(u))
                        .map((u) => ({ title: cleanLinkTitle("", u), uri: u }));
                    const rankedSnippets = rankAndFilterOfficialLinks(snippetLinks);
                    const extraLinks = rankedSnippets.length > 0
                        ? rankedSnippets
                        : canonicalLinks;
                    return {
                        text: appendOfficialLinks(synthesizedText, extraLinks),
                        citations: extraLinks.map((l) => l.uri),
                        needsClarification: false,
                        pendingQuestion: null,
                    };
                }
            }
        }

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

        if (weakAnswer) {
            return {
                text: `
I'm having trouble retrieving the exact details from the UTAR portal right now. 🔎

### 📢 What you can do:
- Please refer directly to the official links below for the most up-to-date information.
- Try asking your question again in a moment.
- Contact the relevant department or faculty office for confirmation.
`.trim(),
                citations: allowedLinks.map((link) => link.uri),
                needsClarification: false,
                pendingQuestion: null,
            };
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

        try {
            const liveSnippets = await fetchLiveUtarSearchSnippets(effectiveMessage);
            if (liveSnippets.text) {
                const retryResponse = await ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `
User Question: ${effectiveMessage}

Live Search Snippets from Official UTAR Sources:
${liveSnippets.text}

Synthesize a clear, accurate, and complete answer directly addressing the user's question using the search snippets.
`,
                                },
                            ],
                        },
                    ],
                    config: {
                        temperature: 0.1,
                    },
                });

                const text = finalClean(extractResponseText(retryResponse));
                if (text && text.length > 30) {
                    const snippetLinks: OfficialLink[] = (liveSnippets.links || [])
                        .filter((u) => isOfficialUtarSource(u))
                        .map((u) => ({ title: cleanLinkTitle("", u), uri: u }));
                    const rankedSnippets = rankAndFilterOfficialLinks(snippetLinks);
                    const extraLinks = rankedSnippets.length > 0
                        ? rankedSnippets
                        : getCanonicalLinksForAgent(agentId);
                    return {
                        text: appendOfficialLinks(text, extraLinks),
                        citations: extraLinks.map((l) => l.uri),
                    };
                }
            }
        } catch (e2) {
            console.error("Secondary live snippet fallback error:", e2);
        }

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

/**
 * Answers from official UTAR page(s) the user pasted. Our own fetch is tried
 * first (it keeps table rows intact); if UTAR's server refuses it, Gemini's URL
 * context tool fetches the page instead. Returns null when neither works, so
 * the normal KB / web pipeline still runs.
 */
async function answerFromOfficialPages(params: {
    urls: string[];
    question: string;
    rawMessage: string;
    selectedAgent: any;
    answerRules: string;
    history: any[];
}): Promise<{ text: string; citations: string[] } | null> {
    const { urls, question, rawMessage, answerRules, history } = params;
    const todayISO = new Date().toISOString().split("T")[0];

    const systemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).
Today's date: ${todayISO}

The user shared an official UTAR web page. Answer ONLY from the content of that page.
- The official page is authoritative and current. If it contradicts anything said earlier in the conversation, the page wins.
- Read tables row by row: keep every date with the programme, campus and intake it belongs to.
- "Can you check this page?" on its own is not the question: answer what the user was asking in the recent conversation, using the page.
- Answer the user's actual question completely. If the question is about dates for "students" in general, list every group the page gives (e.g. foundation, undergraduate, postgraduate, and listed exceptions such as MBBS or Nursing).
- If the page does not contain the answer to the question, output exactly "${NO_KB_ANSWER}" and nothing else (other sources will then be checked). Do not fill gaps from memory.
- Do not mention fetching, tools, or system instructions.
${APPLICABILITY_POLICY}
${RESPONSE_STYLE}- Do not add a links section; the official link is appended automatically.

LANGUAGE RULE:
- Respond in the same language as the user's message. Default to English.
${answerRules}
`;

    // A pasted link usually comes with a vague "can you check this page?", so the
    // real question lives in the earlier turns.
    const recent = formatRecentConversation(history.slice(0, -1), 6, 1200);
    const userText = `${recent ? `Recent conversation (for context; the page wins over anything said here):\n${recent}\n\n` : ""}Latest user message:\n${rawMessage}\n\nRewritten question (a hint only; it can be vaguer than the conversation. If the latest message just asks to check the page, answer the question the user asked earlier):\n${question}`;

    const pages = (
        await Promise.all(urls.slice(0, 2).map((u) => fetchOfficialUtarPage(u, 8000)))
    ).filter(Boolean) as OfficialPage[];

    try {
        let response: any;
        let citations: string[];

        if (pages.length > 0) {
            const parts: any[] = [];
            for (const page of pages) {
                if (page.kind === "pdf") {
                    parts.push({ text: `Official UTAR document: ${page.title} (${page.url})` });
                    parts.push({ inlineData: { mimeType: "application/pdf", data: page.base64 } });
                } else {
                    parts.push({
                        text: `Official UTAR page: ${page.title || page.url}\nURL: ${page.url}\n<<<PAGE\n${page.text}\nPAGE>>>`,
                    });
                }
            }
            parts.push({ text: userText });
            citations = pages.map((p) => p.url);
            response = await withTimeout(
                ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: [{ role: "user", parts }],
                    config: {
                        systemInstruction: { parts: [{ text: systemInstruction }] },
                        temperature: 0.1,
                    },
                }),
                25000,
                "Official page answer"
            );
        } else {
            // UTAR refused our fetch: let Gemini fetch the page itself.
            citations = urls.slice(0, 2);
            response = await withTimeout(
                ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: `Official UTAR page(s):\n${citations.join("\n")}\n\n${userText}` }],
                        },
                    ],
                    config: {
                        systemInstruction: { parts: [{ text: systemInstruction }] },
                        tools: [{ urlContext: {} } as any],
                        temperature: 0.1,
                    },
                }),
                20000,
                "Official page answer (url context)"
            );
            const retrieval = response?.candidates?.[0]?.urlContextMetadata?.urlMetadata;
            const fetchedOk = Array.isArray(retrieval) && retrieval.some(
                (m: any) => String(m?.urlRetrievalStatus || "").includes("SUCCESS")
            );
            if (!fetchedOk) {
                console.warn("[officialPage] url context could not retrieve", citations.join(", "));
                return null;
            }
        }

        const text = finalClean(extractResponseText(response));
        if (!text || text.length < 20 || text.includes(NO_KB_ANSWER)) {
            console.warn(
                "[officialPage] page did not answer",
                JSON.stringify({ urls: citations, fetched: pages.length, question: question.slice(0, 200), reply: text.slice(0, 120) })
            );
            return null;
        }

        const links: OfficialLink[] = citations.map((uri) => ({ title: cleanLinkTitle("", uri), uri }));
        return { text: appendOfficialLinks(text, links), citations };
    } catch (error) {
        console.error("answerFromOfficialPages error:", error);
        return null;
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
    let relation: ContextResolverResult["relation"] =
        raw?.relation === "clarification_for_pending" ||
            raw?.relation === "follow_up_same_topic" ||
            raw?.relation === "casual_no_retrieval" ||
            raw?.relation === "new_standalone_question"
            ? raw.relation
            : "new_standalone_question";

    const isShortRouteQuery = /^(route\s*\d+|schedule\s*[ivx\d]+|westlake.*|option\s*\d+|\d+)$/i.test(fallbackMessage.trim());

    if (isShortRouteQuery) {
        relation = "clarification_for_pending";
    }

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
            isShortRouteQuery
                ? true
                : typeof raw?.needsRetrieval === "boolean"
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







async function resolveConversationContext(params: {
    latestMessage: string;
    contextSummary: string;
    pendingQuestion: string | null;
    history: any[];
}): Promise<ContextResolverResult> {
    const { latestMessage, contextSummary, pendingQuestion, history } = params;

    const compactHistory = compactHistoryForResolver(history);

    const resolverPrompt = `
You are the conversation context resolver for UTARCHAT.

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
- If the user questions, challenges or corrects a previous answer ("are you sure", "you are wrong", "why did you say...", "check again"), this is NOT casual: relation = "follow_up_same_topic", needsRetrieval = true, and resolvedQuestion must restate the underlying factual question with the user's correction or concern included (e.g. "What is the October 2026 trimester start date for each programme level (foundation, undergraduate, postgraduate)? The user says 5 October applies only to postgraduate students.").
- If the user pastes a UTAR web link, keep the link in resolvedQuestion.
- For elective/course/study-plan questions, if user later provides programme/year/semester, combine it with the pending question.
- For complaint questions, if user later provides course/faculty/programme, combine it with the complaint question.
- For bus schedule or timetable questions, if recent conversation or pending question is about bus schedules and the user enters a route/schedule/option choice (e.g. "1", "2", "3", "option 1", "route 1", "route 2", "route 3", "westlake", "schedule I") or campus choice ("Kampar", "Sungai Long"), relation MUST be "clarification_for_pending" or "follow_up_same_topic", and resolvedQuestion MUST combine the bus schedule query with the specified route or campus choice.
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

/**
 * Streaming support.
 *
 * Protocol: NDJSON (application/x-ndjson), one JSON object per line.
 *   {"type":"text","delta":"..."}   incremental, provisional preview text
 *   {"type":"replace","text":"..."} replace the whole provisional preview
 *   {"type":"reset"}                discard the provisional preview entirely
 *   {"type":"done", ...payload}     authoritative final payload (same shape as the JSON response)
 *   {"type":"error","message":"..."}
 *
 * The `done` frame always carries the full, final `text` plus every metadata field
 * the non-streaming JSON response carries, so the client can treat streamed deltas
 * as a preview only and adopt `done.text` as the truth.
 *
 * Only the File Search (KB) generation streams. Every other path (web fallback,
 * staff directory, pre-handlers) is produced in full, sanitised as today, and then
 * delivered as a single `done` frame.
 */
type StreamSink = {
    status: (stage: string, text: string) => void;
    thought: (delta: string) => void;
    text: (delta: string) => void;
    replace: (fullText: string) => void;
    reset: () => void;
    done: (payload: unknown) => void;
    error: (message: string) => void;
};

function createStreamSink(
    controller: ReadableStreamDefaultController<Uint8Array>
): StreamSink {
    const encoder = new TextEncoder();
    let closed = false;

    const write = (frame: Record<string, unknown>) => {
        if (closed) return;
        try {
            controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
        } catch {
            closed = true;
        }
    };

    return {
        status: (stage: string, text: string) => {
            write({ type: "status", stage, text });
        },
        thought: (delta: string) => {
            if (delta) write({ type: "thought", delta });
        },
        text: (delta: string) => {
            if (delta) write({ type: "text", delta });
        },
        replace: (fullText: string) => write({ type: "replace", text: fullText }),
        reset: () => write({ type: "reset" }),
        done: (payload: unknown) =>
            write({ type: "done", ...(payload as Record<string, unknown>) }),
        error: (message: string) => write({ type: "error", message }),
    };
}

/** Extract model reasoning / thought text from a streaming chunk if present. */
function extractChunkThoughts(chunk: any): string {
    const parts = chunk?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";

    return parts
        .filter((p: any) => p?.thought === true && typeof p?.text === "string")
        .map((p: any) => p.text as string)
        .join("");
}

/** Text of a single streaming chunk (excluding thought parts). Deliberately not
 *  extractResponseText(): that substitutes "No response generated." for empty output,
 *  which would corrupt the accumulator. */
function extractChunkText(chunk: any): string {
    const parts = chunk?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) {
        if (typeof chunk?.text === "string" && chunk.text) return chunk.text;
        return "";
    }

    return parts
        .filter((p: any) => !p?.thought && typeof p?.text === "string")
        .map((p: any) => p.text as string)
        .join("");
}


/** Race each iteration step against an absolute deadline so a stalled stream cannot
 *  hold the response open (withTimeout only guards the promise for the iterator). */
async function* iterateWithDeadline<T>(
    iterable: AsyncIterable<T>,
    deadline: number,
    label: string
): AsyncGenerator<T> {
    const it = iterable[Symbol.asyncIterator]();
    try {
        for (;;) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new Error(`${label} timed out`);
            const step = await withTimeout(it.next(), remaining, label);
            if (step.done) return;
            yield step.value;
        }
    } finally {
        await it.return?.(undefined as any).catch?.(() => { });
    }
}

/**
 * Classifies whether an error encountered during File Search is permanent/non-retryable
 * (e.g. quota/rate-limit 429, auth 401/403, malformed request 400/INVALID_ARGUMENT).
 * When true, the escalation ladder and primary-store fallback must abort immediately
 * to avoid hammering rate limits or repeating unfixable errors.
 * Never throws.
 */
function isNonRetryableFileSearchError(error: unknown): boolean {
    try {
        if (!error) return false;

        const err = error as any;

        // Check numerical / string status code properties
        const checkStatus = (val: any): boolean => {
            const num = typeof val === "number" ? val : parseInt(String(val), 10);
            return num === 400 || num === 401 || num === 403 || num === 429;
        };

        if (
            checkStatus(err.status) ||
            checkStatus(err.statusCode) ||
            checkStatus(err.httpStatus) ||
            checkStatus(err.code) ||
            checkStatus(err.response?.status) ||
            checkStatus(err.cause?.status) ||
            checkStatus(err.cause?.statusCode)
        ) {
            return true;
        }

        // Collect all text from message, details, code, errorDetails, cause, and stringification
        const textParts: string[] = [];

        const collectText = (obj: any, depth = 0) => {
            if (!obj || depth > 3) return;
            if (typeof obj === "string") {
                textParts.push(obj);
                return;
            }
            if (typeof obj?.message === "string") textParts.push(obj.message);
            if (typeof obj?.statusText === "string") textParts.push(obj.statusText);
            if (typeof obj?.code === "string") textParts.push(obj.code);
            if (typeof obj?.reason === "string") textParts.push(obj.reason);
            if (typeof obj?.errorDetails === "string") textParts.push(obj.errorDetails);
            if (Array.isArray(obj?.errorDetails)) {
                try {
                    textParts.push(JSON.stringify(obj.errorDetails));
                } catch { }
            }
            if (typeof obj?.details === "string") textParts.push(obj.details);
            if (obj?.cause) collectText(obj.cause, depth + 1);
        };

        collectText(err);
        try {
            textParts.push(String(error));
        } catch { }

        const combined = textParts.join(" ").toLowerCase();

        // 1. Quota / Rate limit (HTTP 429, RESOURCE_EXHAUSTED)
        if (
            combined.includes("429") ||
            combined.includes("resource_exhausted") ||
            combined.includes("resource exhausted") ||
            combined.includes("rate limit") ||
            combined.includes("ratelimit") ||
            combined.includes("rate-limit") ||
            combined.includes("quota") ||
            combined.includes("too many requests")
        ) {
            return true;
        }

        // 2. Auth / Permission (HTTP 401, 403, UNAUTHENTICATED, PERMISSION_DENIED)
        if (
            combined.includes("401") ||
            combined.includes("403") ||
            combined.includes("unauthenticated") ||
            combined.includes("permission_denied") ||
            combined.includes("permission denied") ||
            combined.includes("unauthorized") ||
            combined.includes("forbidden") ||
            combined.includes("api key") ||
            combined.includes("api_key")
        ) {
            return true;
        }

        // 3. Invalid Argument / Malformed request (HTTP 400, INVALID_ARGUMENT)
        if (
            combined.includes("400") ||
            combined.includes("invalid_argument") ||
            combined.includes("invalid argument") ||
            combined.includes("bad request")
        ) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/** Minimum characters buffered before any KB text may be emitted. Must comfortably
 *  exceed the NO_KB_ANSWER sentinel and the longest weak-signal phrase that
 *  shouldUseWebFallback matches on, so we never emit text we would then retract. */
const STREAM_GATE_CHARS = 80;

async function executeFileSearchAttempt(params: {
    request: any;
    sink: StreamSink | null;
    effectiveMessage: string;
    timeoutMs: number;
}): Promise<{
    fileResponse: any;
    rawText: string;
    finishReason: string;
    isRecoverableFailure: boolean;
    rawThoughts: string;
    streamedText: string;
}> {
    const { request, sink, effectiveMessage, timeoutMs } = params;
    let raw = "";
    let rawThoughts = "";
    let streamedText = "";
    let finishReason = "";
    const groundingChunks: any[] = [];
    const groundingSupports: any[] = [];

    if (sink) {
        const deadline = Date.now() + timeoutMs;
        const iterator = await withTimeout(
            ai.models.generateContentStream(request),
            timeoutMs,
            "File search"
        );

        for await (const chunk of iterateWithDeadline(iterator, deadline, "File search")) {
            const cand = (chunk as any)?.candidates?.[0];
            if (cand?.finishReason) {
                finishReason = cand.finishReason;
            }
            const meta = cand?.groundingMetadata?.groundingChunks;
            if (Array.isArray(meta)) groundingChunks.push(...meta);
            const supports = cand?.groundingMetadata?.groundingSupports;
            if (Array.isArray(supports)) groundingSupports.push(...supports);

            const thoughtPiece = extractChunkThoughts(chunk);
            if (thoughtPiece) {
                rawThoughts += thoughtPiece;
                sink.thought(thoughtPiece);
            }

            const piece = extractChunkText(chunk);
            if (!piece) continue;
            raw += piece;

            // Gate: never emit until we have enough text to rule out the
            // NO_KB_ANSWER sentinel / weak-signal fallback triggers.
            if (!streamedText && (raw.length < STREAM_GATE_CHARS || shouldUseWebFallback(raw, effectiveMessage))) {
                continue;
            }

            const cleaned = finalClean(raw);
            if (cleaned === streamedText) continue;

            if (cleaned.startsWith(streamedText)) {
                sink.text(cleaned.slice(streamedText.length));
            } else {
                sink.replace(cleaned);
            }
            streamedText = cleaned;
        }

        const fileResponse = {
            text: raw,
            candidates: [
                {
                    content: { parts: [{ text: raw }] },
                    finishReason: finishReason || (raw.trim().length > 0 ? "STOP" : "EMPTY"),
                    groundingMetadata: {
                        groundingChunks: groundingChunks.length ? groundingChunks : undefined,
                        groundingSupports: groundingSupports.length ? groundingSupports : undefined,
                    },
                },
            ],
        };

        const isRecoverableFailure =
            raw.trim().length === 0 ||
            (finishReason !== "" && finishReason !== "STOP");

        return {
            fileResponse,
            rawText: raw,
            finishReason: finishReason || (raw.trim().length > 0 ? "STOP" : "EMPTY"),
            isRecoverableFailure,
            rawThoughts,
            streamedText,
        };
    } else {
        const response = await withTimeout(
            ai.models.generateContent(request),
            timeoutMs,
            "File search"
        );
        const cand = response?.candidates?.[0];
        finishReason = cand?.finishReason || "";
        raw = extractResponseText(response);
        if (raw === "No response generated.") raw = "";

        const isRecoverableFailure =
            raw.trim().length === 0 ||
            (finishReason !== "" && finishReason !== "STOP");

        return {
            fileResponse: response,
            rawText: raw,
            finishReason: finishReason || (raw.trim().length > 0 ? "STOP" : "EMPTY"),
            isRecoverableFailure,
            rawThoughts: "",
            streamedText: "",
        };
    }
}

/** Moves Gemini's "FOLLOW-UPS:" line out of the answer into followUps (chips on the chat page). */
function withFollowUps(payload: any) {
    if (!payload || typeof payload.text !== "string") return payload;
    const { text, followUps } = extractFollowUps(payload.text);
    return { ...payload, text, followUps };
}

export async function POST(req: NextRequest) {
    let body: any;

    try {
        body = await req.json();
    } catch (err) {
        // Preserve the previous behaviour: an unparseable body produced the friendly
        // error payload from the catch-all, not a pipeline run on an empty message.
        return handleChat(null, null, err);
    }

    // Usage analytics: count Gemini calls/tokens for this request and log one row
    // after the response has been sent (see lib/analytics). Logging never blocks
    // or breaks the chat.
    const metrics = newMetrics();
    const startedAt = Date.now();

    if (body?.stream !== true) {
        const raw = await metricsStore.run(metrics, () => handleChat(body));
        const latencyMs = Date.now() - startedAt;
        const payload = withFollowUps(await raw.json().catch(() => null));
        after(() => logChatEvent({ body, payload, metrics, latencyMs }));
        const res = NextResponse.json(payload, { status: raw.status });
        // Local runs only (next dev): lets scripts/prelaunch-check.mjs add up the
        // Gemini cost of a test run. Vercel builds run with NODE_ENV=production.
        if (process.env.NODE_ENV !== "production") {
            res.headers.set("x-chat-metrics", JSON.stringify({ ...metrics, latencyMs }));
        }
        return res;
    }

    let finishLog: (result: { payload: any; latencyMs: number; streamFailed: boolean }) => void = () => {};
    const logResult = new Promise<{ payload: any; latencyMs: number; streamFailed: boolean }>((resolve) => {
        finishLog = resolve;
    });
    after(async () => {
        const result = await logResult;
        await logChatEvent({ body, metrics, ...result });
    });

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const sink = createStreamSink(controller);
            let payload: any = null;
            let streamFailed = false;
            try {
                const res = await metricsStore.run(metrics, () => handleChat(body, sink));
                payload = withFollowUps(await res.json());
                sink.done(payload);
            } catch (err: any) {
                streamFailed = true;
                console.error("Chat stream error:", err);
                sink.error(err?.message || "Stream failed");
            } finally {
                finishLog({ payload, latencyMs: Date.now() - startedAt, streamFailed });
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    });
}

async function handleChat(
    body: any,
    sink: StreamSink | null = null,
    parseError: unknown = null
) {
    let fallbackAgentId = "general";

    try {
        if (parseError) throw parseError;

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
        // Language picked on the chat page (EN / BM / 中文); empty = follow the question.
        const chosenLanguageRule = languageRule(body?.language);
        sink?.status("analyzing", "Analyzing your question...");

        const enrichedMessage = enrichWithLastResolvedTopic(
            rawMessage,
            lastResolvedTopic
        );

        // Kampar bus timetables come from data, not Gemini: Gemini blocks most
        // answers that reproduce the timetable PDFs (see lib/busSchedule.ts).
        const busReply = tryHandleVulgarity(rawMessage) ? null : tryBusScheduleReply(rawMessage, history);
        if (busReply) {
            const busAgent = getAgentById("dgs-kampar");
            return NextResponse.json({
                text: busReply,
                citations: [],
                sourceMode: "officialSchedule",
                storeDisplayName: "",
                selectedAgentId: busAgent.id,
                selectedAgentLabel: busAgent.label,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic,
                routeType: "admin_specific",
            });
        }

        const directPreReplies = [
            tryHandleVulgarity(rawMessage),
            trySmallTalkReply(rawMessage),
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

        const contextResolution =
            history.length === 0 && !pendingQuestion
                ? {
                    relation: "new_standalone_question" as const,
                    resolvedQuestion: rawMessage,
                    updatedContextSummary: "",
                    needsRetrieval: true,
                    clearPendingQuestion: false,
                }
                : await resolveConversationContext({
                    latestMessage: rawMessage,
                    contextSummary: String(incomingContextSummary || ""),
                    pendingQuestion,
                    history,
                });

        const resolvedMessage = contextResolution.resolvedQuestion || rawMessage;
        const updatedContextSummary = contextResolution.updatedContextSummary || "";
        const resolverSaysNoRetrieval = contextResolution.needsRetrieval === false;



        const pendingForRouter =
            contextResolution.relation === "clarification_for_pending" ||
                contextResolution.relation === "follow_up_same_topic"
                ? pendingQuestion
                : null;

        sink?.status("routing", "Identifying relevant UTAR department...");

        const routerResult = await routeWithLLM({
            message: resolvedMessage,
            rawMessage: rawMessage,
            currentAgentId: fallbackAgentId,
            pendingQuestion: pendingForRouter,
        });

        const selectedAgent = getAgentById(routerResult.agentId);
        const secondaryAgent = routerResult.secondaryAgentId
            ? getOrgUnitById(routerResult.secondaryAgentId).enabledForChat
                ? getAgentById(routerResult.secondaryAgentId)
                : null
            : null;
        const hasSecondary = Boolean(
            secondaryAgent &&
            secondaryAgent.id !== selectedAgent.id
        );

        const displayAgentLabel = hasSecondary
            ? `${selectedAgent.label} + ${secondaryAgent!.label}`
            : selectedAgent.label;
        const displayStoreDisplayName = hasSecondary
            ? `${selectedAgent.storeDisplayName || selectedAgent.label} + ${secondaryAgent!.storeDisplayName || secondaryAgent!.label}`
            : (selectedAgent.storeDisplayName || "");

        sink?.status("agent_selected", `Routing to ${displayAgentLabel}...`);

        // A challenge to a previous answer ("are you sure", "why did you say...")
        // must be re-checked against evidence, never answered from the model alone.
        const answerChallenge = isAnswerChallenge(rawMessage, history);
        const earlierAnswers = answerChallenge ? formatEarlierAssistantAnswers(history) : "";
        const correctionInstruction = answerChallenge ? buildCorrectionInstruction(earlierAnswers) : "";
        const modelSaysNoRetrieval =
            !answerChallenge &&
            (resolverSaysNoRetrieval || (routerResult as any).retrievalNeeded === false);

        // Never let a factual-looking question reach the ungrounded path on the
        // strength of one boolean. Failing towards the store costs seconds;
        // failing away from it costs correctness.
        const retrievalForcedBySafetyNet =
            modelSaysNoRetrieval &&
            looksLikeFactualQuestion(rawMessage) &&
            !CASUAL_INTENT_CATEGORIES.has(String((routerResult as any).intentCategory || ""));

        if (retrievalForcedBySafetyNet) {
            console.warn(
                "[retrieval-safety-net] overriding needsRetrieval=false for factual question:",
                JSON.stringify(rawMessage),
                "| intentCategory:", (routerResult as any).intentCategory,
                "| resolverSaysNoRetrieval:", resolverSaysNoRetrieval,
                "| routerRetrievalNeeded:", (routerResult as any).retrievalNeeded
            );
        }

        if (!routerResult.needsClarification && modelSaysNoRetrieval && !retrievalForcedBySafetyNet) {
            const directText = await generateDirectNoRetrievalResponse(rawMessage, history, chosenLanguageRule);

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

        const calendarQuestion = isIntakeOrCalendarQuestion(rawMessage) || isIntakeOrCalendarQuestion(effectiveMessage);
        const bothCampuses =
            hasSecondary && campusFamily(selectedAgent.id) !== null && campusFamily(selectedAgent.id) === campusFamily(secondaryAgent!.id);
        const answerRules =
            correctionInstruction +
            (calendarQuestion ? buildCalendarFormatInstruction() : "") +
            (bothCampuses ? BOTH_CAMPUSES_RULE : "") +
            FOLLOW_UPS_RULE +
            chosenLanguageRule;

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

        // Official UTAR link pasted by the user (this turn, or a recent turn when
        // the user is now challenging an answer): ground on that exact page.
        // The official web page is authoritative over KB documents.
        const pastedThisTurn = extractOfficialUtarUrls(rawMessage).length > 0;
        const pageUrls = pastedThisTurn || answerChallenge
            ? findRecentUserUtarUrls(rawMessage, history)
            : [];
        if (pageUrls.length > 0) {
            sink?.status("officialPage", "Reading the official UTAR page you shared...");
            const pageAnswer = await answerFromOfficialPages({
                urls: pageUrls,
                question: effectiveMessage,
                rawMessage,
                selectedAgent,
                answerRules,
                history,
            });
            if (pageAnswer) {
                const newTopic = inferResolvedTopic(effectiveMessage, pageAnswer.text) || lastResolvedTopic;
                return NextResponse.json({
                    text: pageAnswer.text,
                    citations: pageAnswer.citations,
                    sourceMode: "webFallback",
                    storeDisplayName: "",
                    selectedAgentId: selectedAgent.id,
                    selectedAgentLabel: selectedAgent.label,
                    needsClarification: false,
                    pendingQuestion: null,
                    lastResolvedTopic: newTopic,
                    contextSummary: updatedContextSummary,
                    routeType: routerResult.routeType,
                });
            }
        }

        const primaryStoreNames = selectedAgent.storeResourceIds ?? [];
        const secondaryStoreNames = hasSecondary ? (secondaryAgent!.storeResourceIds ?? []) : [];
        const storeNames = Array.from(new Set([...primaryStoreNames, ...secondaryStoreNames]));

        if (storeNames.length === 0) {
            sink?.status("staffDirectory", "Checking UTAR Staff Directory...");
            const staffDirResponse = await tryStaffDirectoryFallback({
                effectiveMessage,
                selectedAgent,
                lastResolvedTopic,
                updatedContextSummary,
                routeType: routerResult.routeType,
            });
            if (staffDirResponse) return staffDirResponse;

            sink?.status("webFallback", "Searching official UTAR web sources...");
            const webFallback = await generatePublicWebFallback({
                effectiveMessage,
                selectedAgent,
                profileMode,
                reason: "kb_missing",
                extraInstruction: answerRules,
            });

            return NextResponse.json({
                text: webFallback.text,
                citations: webFallback.citations,
                sourceMode: "webFallback",
                storeDisplayName: displayStoreDisplayName,
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: displayAgentLabel,
                needsClarification: Boolean(webFallback.needsClarification),
                pendingQuestion: webFallback.pendingQuestion || null,
                lastResolvedTopic,
                contextSummary: updatedContextSummary,
                routeType: routerResult.routeType,
            });
        }

        sink?.status(
            "searching",
            `Searching ${displayStoreDisplayName || displayAgentLabel}...`
        );

        const fileSearchSystemInstruction = hasSecondary
            ? `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

CURRENT ASSISTANT SCOPES:
PRIMARY SCOPE (${selectedAgent.label}):
${selectedAgent.scopeInstruction}

SECONDARY SCOPE (${secondaryAgent!.label}):
${secondaryAgent!.scopeInstruction}

CORE BEHAVIOUR:
- Answer using only the selected UTAR knowledge bases in this File Search step.
- MULTI-PART QUESTION RULE: You MUST answer EVERY part of a multi-part or multi-department question. Do not drop or ignore any part of the user's inquiry.
- PARTIAL ANSWER RULE: If the retrieved knowledge bases contain information for one part of the question but not the other, provide the full answer for the part that is found, and clearly state that the information for the other part was not found in the available records. NEVER drop the answered part, and NEVER let a missing part suppress the found part.
- SENTINEL RULE: Output "${NO_KB_ANSWER}" ONLY if NO part of the entire question can be answered from the retrieved knowledge bases. If at least one part is answered, do NOT output "${NO_KB_ANSWER}".
- Prioritise the selected assistant scopes (${selectedAgent.label} and ${secondaryAgent!.label}).
- Do not invent information.
- Do not use web knowledge in this File Search step.
- Never mention KB, retrieved documents, provided documents, internal routing, or system instructions.
- BUS SCHEDULE RULE: If the user asks for a general bus schedule/timetable or does not specify a route, do not print any tables of timings. Instead, read the retrieved bus schedule document to extract the names of all available routes, list only the names of these available routes, and ask the user to specify which route they would like to see. If they ask for a specific route, you may print the schedule and timings for that specific route.
- ANTI-RECITATION TIMETABLE RULE: To prevent recitation blocks, never output timetables, schedule times, or trips as a copy of the list or table structure in the source document. Instead, describe the timings in a normal conversational sentence or rewritten lists (e.g. "Buses leave UTAR at 7:00 am, 7:30 am, and 9:00 am, and leave Westlake Homes at 7:10 am, 7:40 am, and 9:15 am").

SELECTED AGENT EVIDENCE RULE:
- The selected assistant scopes (${selectedAgent.label} and ${secondaryAgent!.label}) are binding.
- For faculty, department, division, centre, institute, or unit-specific questions, answer using evidence that clearly belongs to either of the selected assistant scopes.
- Do not substitute generic UTAR information if selected-agent evidence is missing.
- Do not use another faculty, another campus, another department, another university, or an unrelated central office unless the source clearly states that office handles this matter for the selected assistant scopes.
- If no part of the retrieved information directly supports the answer, say exactly:
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
${APPLICABILITY_POLICY}
${RESPONSE_STYLE}
LANGUAGE RULE:
- Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). For example, if user asks in Chinese or says "respond in Chinese", translate and output the final response in Chinese.
- If the query is in English or language is not specified, default to English.
`
            : `
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
- BUS SCHEDULE RULE: If the user asks for a general bus schedule/timetable or does not specify a route, do not print any tables of timings. Instead, read the retrieved bus schedule document to extract the names of all available routes, list only the names of these available routes, and ask the user to specify which route they would like to see. If they ask for a specific route, you may print the schedule and timings for that specific route.
- ANTI-RECITATION TIMETABLE RULE: To prevent recitation blocks, never output timetables, schedule times, or trips as a copy of the list or table structure in the source document. Instead, describe the timings in a normal conversational sentence or rewritten lists (e.g. "Buses leave UTAR at 7:00 am, 7:30 am, and 9:00 am, and leave Westlake Homes at 7:10 am, 7:40 am, and 9:15 am").

${SELECTED_AGENT_EVIDENCE_POLICY}

${RESPONSE_STYLE}
LANGUAGE RULE:
- Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). For example, if user asks in Chinese or says "respond in Chinese", translate and output the final response in Chinese.
- If the query is in English or language is not specified, default to English.
`;

        const singleStoreSystemInstruction = `
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
- BUS SCHEDULE RULE: If the user asks for a general bus schedule/timetable or does not specify a route, do not print any tables of timings. Instead, read the retrieved bus schedule document to extract the names of all available routes, list only the names of these available routes, and ask the user to specify which route they would like to see. If they ask for a specific route, you may print the schedule and timings for that specific route.
- ANTI-RECITATION TIMETABLE RULE: To prevent recitation blocks, never output timetables, schedule times, or trips as a copy of the list or table structure in the source document. Instead, describe the timings in a normal conversational sentence or rewritten lists (e.g. "Buses leave UTAR at 7:00 am, 7:30 am, and 9:00 am, and leave Westlake Homes at 7:10 am, 7:40 am, and 9:15 am").

${SELECTED_AGENT_EVIDENCE_POLICY}

${RESPONSE_STYLE}
LANGUAGE RULE:
- Always respond in the same language as the user's query or requested language instruction (e.g. Chinese, Malay, Tamil, etc.). For example, if user asks in Chinese or says "respond in Chinese", translate and output the final response in Chinese.
- If the query is in English or language is not specified, default to English.
`;

        const KB_TOTAL_BUDGET_MS = 20000;
        const kbStartTime = Date.now();

        // DACE's KB calendar lacks the campus split and the MBBS / Nursing dates,
        // so calendar questions also get the official intake page (cached; on a
        // failed fetch the answer falls back to the KB alone).
        const calendarPage =
            calendarQuestion && selectedAgent.id === "dace" && pageUrls.length === 0
                ? await fetchOfficialUtarPageCached(DACE_INTAKE_CALENDAR_URL)
                : null;
        // In the system instruction, not the user turn: page text in the user
        // turn made Gemini write fake tool_code / "thought" text into the answer.
        const officialPageEvidence =
            calendarPage?.kind === "html"
                ? `\nOFFICIAL UTAR PAGE (evidence you may use alongside File Search; authoritative over documents):\n${calendarPage.title}\nURL: ${calendarPage.url}\n<<<PAGE\n${calendarPage.text}\nPAGE>>>\n`
                : "";

        const buildFileSearchReq = (storeList: string[], instruction: string) => ({
            model: MODEL_NAME,
            contents: [
                {
                    role: "user",
                    parts: [{ text: buildFileSearchUserMessage(effectiveMessage, selectedAgent.id) }],
                },
            ],
            config: {
                systemInstruction: { parts: [{ text: instruction + answerRules + officialPageEvidence }] },
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: storeList,
                        },
                    } as any,
                ],
                temperature: 0.1,
                thinkingConfig: {
                    thinkingBudget: -1,
                    includeThoughts: true,
                },
            },
        });

        let fileResponse: any = null;
        let streamedText = "";
        let rawThoughts = "";
        let succeeded = false;
        // Gemini stops with RECITATION, or OTHER with no text, when an answer
        // copies a source table (every Kampar bus-route answer did). An identical
        // retry hits the same block, so retry without tables.
        let lastFinishReason = "";
        const withRecitationFallback = (instruction: string) =>
            lastFinishReason === "RECITATION" || lastFinishReason === "OTHER"
                ? `${instruction}\nThe previous attempt was blocked for copying the source. Do NOT use a table this time: summarise the timings or items in your own words as short bullets.\n`
                : instruction;
        let escalationAborted = false;

        // Step 1: Identical call retry ladder (up to 2 attempts total: 1 initial + 1 retry)
        for (let attempt = 1; attempt <= 2; attempt++) {
            const elapsed = Date.now() - kbStartTime;
            const remaining = KB_TOTAL_BUDGET_MS - elapsed;
            if (remaining < 1500) {
                console.warn(`[fileSearch] escalation budget exhausted (${elapsed}ms elapsed) before attempt ${attempt}`);
                break;
            }

            const timeoutForAttempt = Math.min(remaining, 15000);

            try {
                const req = buildFileSearchReq(storeNames, withRecitationFallback(fileSearchSystemInstruction));
                const result = await executeFileSearchAttempt({
                    request: req,
                    sink,
                    effectiveMessage,
                    timeoutMs: timeoutForAttempt,
                });

                fileResponse = result.fileResponse;
                streamedText = result.streamedText;
                rawThoughts = result.rawThoughts;

                console.warn(
                    `[fileSearch] attempt ${attempt} finished with finishReason=${result.finishReason} (chars=${result.rawText.trim().length})`
                );
                lastFinishReason = result.finishReason;

                if (!result.isRecoverableFailure) {
                    succeeded = true;
                    break;
                }

                // Recoverable failure: reset any streamed preview before next retry
                if (streamedText) {
                    sink?.reset();
                    streamedText = "";
                    rawThoughts = "";
                }

                // Short backoff (~300-600ms) between identical attempts if budget permits
                if (attempt < 2) {
                    const timeAfterAttempt = Date.now() - kbStartTime;
                    if (KB_TOTAL_BUDGET_MS - timeAfterAttempt > 2000) {
                        await new Promise((r) => setTimeout(r, 400));
                    }
                }
            } catch (err: any) {
                const isNonRetryable = isNonRetryableFileSearchError(err);
                console.warn(
                    `[fileSearch] attempt ${attempt} threw error${isNonRetryable ? " (non-retryable, aborting ladder)" : ""}: ${err?.message || err}`
                );
                if (streamedText) {
                    sink?.reset();
                    streamedText = "";
                    rawThoughts = "";
                }
                if (isNonRetryable) {
                    escalationAborted = true;
                    break;
                }
            }
        }

        // Step 2: Primary store only retry (if multi-store / secondary attached, and previous attempts were recoverable failures, not aborted)
        const canTryPrimaryOnly = !escalationAborted && !succeeded && hasSecondary && primaryStoreNames.length > 0;
        if (canTryPrimaryOnly) {
            const elapsed = Date.now() - kbStartTime;
            const remaining = KB_TOTAL_BUDGET_MS - elapsed;
            if (remaining >= 1500) {
                const timeoutForAttempt = Math.min(remaining, 15000);
                try {
                    console.warn(`[fileSearch] escalating to primary store only (${primaryStoreNames.join(", ")})...`);
                    const req = buildFileSearchReq(primaryStoreNames, withRecitationFallback(singleStoreSystemInstruction));
                    const result = await executeFileSearchAttempt({
                        request: req,
                        sink,
                        effectiveMessage,
                        timeoutMs: timeoutForAttempt,
                    });

                    fileResponse = result.fileResponse;
                    streamedText = result.streamedText;
                    rawThoughts = result.rawThoughts;

                    console.warn(
                        `[fileSearch] primary-store attempt finished with finishReason=${result.finishReason} (chars=${result.rawText.trim().length})`
                    );
                    lastFinishReason = result.finishReason;

                    if (!result.isRecoverableFailure) {
                        succeeded = true;
                    } else if (streamedText) {
                        sink?.reset();
                        streamedText = "";
                        rawThoughts = "";
                    }
                } catch (err: any) {
                    const isNonRetryable = isNonRetryableFileSearchError(err);
                    console.warn(
                        `[fileSearch] primary-store attempt threw error${isNonRetryable ? " (non-retryable)" : ""}: ${err?.message || err}`
                    );
                    if (streamedText) {
                        sink?.reset();
                        streamedText = "";
                        rawThoughts = "";
                    }
                }
            } else {
                console.warn(`[fileSearch] insufficient budget for primary-store attempt (${elapsed}ms elapsed)`);
            }
        }

        const rawFileText = fileResponse ? extractResponseText(fileResponse) : "";
        const fileText = finalClean(rawFileText);
        const fileCitations = fileResponse ? extractCitations(fileResponse) : [];

        const isGeneralBusQuery = /bus|shuttle|transit|schedule|timetable/i.test(effectiveMessage) && selectedAgent.id === "dgs-kampar";

        const fileNotFound =
            !succeeded ||
            fileText.length === 0 ||
            shouldUseWebFallback(rawFileText, effectiveMessage) ||
            (fileCitations.length === 0 && fileText.length < 50);

        if (fileNotFound && streamedText) {
            // We emitted a provisional preview but the answer is being replaced by a
            // fallback path — retract it so nothing unverified stays on screen.
            sink?.reset();
            streamedText = "";
        } else if (!fileNotFound && streamedText && streamedText !== fileText) {
            sink?.replace(fileText);
            streamedText = fileText;
        }

        if (!fileNotFound) {
            const newTopic = inferResolvedTopic(effectiveMessage, fileText) || lastResolvedTopic;

            return NextResponse.json({
                text: fileText,
                thought: rawThoughts || undefined,
                citations: fileCitations,
                sourceMode: "fileSearch",
                storeDisplayName: displayStoreDisplayName,
                selectedAgentId: selectedAgent.id,
                selectedAgentLabel: displayAgentLabel,
                needsClarification: false,
                pendingQuestion: null,
                lastResolvedTopic: newTopic,
                contextSummary: updatedContextSummary,
                routeType: routerResult.routeType,
            });
        }

        const staffDirResponse = await tryStaffDirectoryFallback({
            effectiveMessage,
            selectedAgent,
            lastResolvedTopic,
            updatedContextSummary,
            routeType: routerResult.routeType,
        });
        if (staffDirResponse) return staffDirResponse;

        const webFallback = await generatePublicWebFallback({
            effectiveMessage,
            selectedAgent,
            profileMode,
            fileText,
            fileCitations,
            reason: "kb_no_answer",
            extraInstruction: answerRules,
        });

        const newTopic =
            inferResolvedTopic(effectiveMessage, webFallback.text) || lastResolvedTopic;

        return NextResponse.json({
            text: webFallback.text,
            citations: webFallback.citations,
            sourceMode: "webFallback",
            storeDisplayName: displayStoreDisplayName,
            selectedAgentId: selectedAgent.id,
            selectedAgentLabel: displayAgentLabel,
            needsClarification: Boolean(webFallback.needsClarification),
            pendingQuestion: webFallback.pendingQuestion || null,

            lastResolvedTopic: newTopic,
            contextSummary: updatedContextSummary,
            routeType: routerResult.routeType,
        });
    } catch (error: any) {
        console.error("Chat Error:", error);
        markPipelineError();

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