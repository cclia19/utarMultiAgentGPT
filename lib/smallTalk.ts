/**
 * Instant replies for small talk about the bot itself, so "are you smart?" or
 * "who build you" never waits on the router and a knowledge-base search.
 *
 * Pure functions only (no Gemini, no network) so they can be unit tested.
 * Patterns are deliberately narrow: a real UTAR question that happens to say
 * "you" ("can you tell me the FICT dean?") must still reach the pipeline.
 */

// Same shape as route.ts normalize(): lowercase, apostrophes dropped,
// punctuation to spaces ("who's" -> "whos").
function normalize(text: string): string {
    return String(text || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Greetings in front of the real message ("hi, are you smart?").
const LEADING_FILLER = /^((hi|hello|hey|yo|helo|hai|eh|oi|ok|okay|so|btw|lol|haha)\s+)+/;

// Small talk is short; a long message is a real question that mentions "you".
const MAX_SMALL_TALK_CHARS = 60;

function smallTalkText(message: string): string {
    const text = normalize(message).replace(LEADING_FILLER, "");
    return text.length > MAX_SMALL_TALK_CHARS ? "" : text;
}

// ---------------------------------------------------------------------------
// 1. Who built the bot (the Avo easter egg).
// ---------------------------------------------------------------------------

const BOT = "(you|u|ya|yourself|this (bot|chatbot|chat|app|ai|thing)|utarchat|utargpt)";
const MAKE_VERB = "(build|built|builds|make|made|makes|create|created|creates|develop|developed|design|designed|program|programmed|code|coded|train|trained|own|owns)";
const MAKER = "(creator|creators|developer|developers|dev|devs|maker|makers|builder|owner|boss|daddy|dad|father|papa|parent|parents)";

const CREATOR_PATTERNS: RegExp[] = [
    new RegExp(`\\bwho\\s+(is\\s+|s\\s+|did\\s+|has\\s+)?${MAKE_VERB}\\s+${BOT}\\b`),
    new RegExp(`\\b(who|whos|who is|who s|who are|who r)\\s+(your|ur|yo)\\s+${MAKER}\\b`),
    new RegExp(`\\b${BOT}\\s+(was|were|is|are)?\\s*${MAKE_VERB}\\s+by\\s+(who|whom)\\b`),
    new RegExp(`\\b(your|ur)\\s+${MAKER}\\s+(is\\s+)?who\\b`),
    /\bsiapa\s+(yang\s+)?(buat|cipta|bina|reka)\s+(awak|kamu|you|u)\b/,
];
const CREATOR_PATTERNS_CJK = [/谁(创造|製造|制造|开发|開發|做|造)了?你/, /你的(创造者|創造者|爸爸|老爸|开发者|開發者)/];

const DADDY = /\b(daddy|dad|father|papa)\b|爸爸|老爸/;

export function isCreatorQuestion(message: string): boolean {
    const raw = String(message || "");
    if (CREATOR_PATTERNS_CJK.some((pattern) => pattern.test(raw))) return true;
    const text = smallTalkText(raw);
    return Boolean(text) && CREATOR_PATTERNS.some((pattern) => pattern.test(text));
}

export const AVO_DADDY_REPLY = `
Avo is my daddy 🥑 — not the sugar type.

He helped create me so students don’t have to be lonely.

### 🥑 Lore unlocked

- #dontworry
- #behappy
`.trim();

const CREATOR_REPLY = `
You know, I know. 😌

### 🥑 Hidden lore

- Built with UTARCHAT energy.
- Powered by knowledge, caffeine, and slightly too many debugging sessions.
- **AVO YYDS 🥑**
`.trim();

// ---------------------------------------------------------------------------
// 2. Questions about the bot itself: "are you smart", "who are you".
// ---------------------------------------------------------------------------

// Anchored at the start so "are you open on Sunday" is not caught.
const ARE_YOU = "^(are|r|ru)\\s+(you|u|ya)\\s+((really|very|so|actually|even)\\s+)?";
const SMART = new RegExp(`${ARE_YOU}(smart|clever|intelligent|good|useful|helpful|genius|a genius)( or not)?$`);
const NOT_SMART = new RegExp(`${ARE_YOU}(stupid|dumb|useless|slow)( or not)?$`);
const IDENTITY = new RegExp(`${ARE_YOU}(real|human|a human|a person|a real person|a bot|a robot|robot|bot|an ai|ai|chatgpt|gpt|gemini|alive|sentient)( or (a )?(bot|human|ai|robot|not))?$`);
const INTRO = /^((who|what)\s+(are|r)\s+(you|u)|what\s+(can|do)\s+(you|u)\s+do(\s+(for me|here))?|introduce\s+(yourself|urself)|tell\s+me\s+about\s+(yourself|urself)|what\s+is\s+(utarchat|utargpt))$/;

const HELP_LIST = `
### 📌 I can help with

- Intakes, fees, exams and scholarships
- Programmes, courses and faculty contacts
- Campus services and student support
`.trim();

const SMART_REPLY = `
Smart enough to read UTAR’s handbooks so you don’t have to. 😎

Not smart enough to never be wrong, though, so for anything important I’ll point you to the official source.

${HELP_LIST}
`.trim();

const NOT_SMART_REPLY = `
Sometimes, yes. 😅 I’m an AI, so I can get things wrong.

If an answer looks off, just ask “are you sure?” and I’ll re-check the official sources.
`.trim();

const IDENTITY_REPLY = `
I’m UTARCHAT, an AI assistant for UTAR students. 🤖 Not a human, and not UTAR staff.

I answer from UTAR’s official documents and websites, and I’ll tell you when I’m not sure.

${HELP_LIST}
`.trim();

const INTRO_REPLY = `
I’m UTARCHAT, your friendly UTAR buddy. 😊 Ask me naturally and I’ll find the right UTAR department for you.

${HELP_LIST}
`.trim();

// ---------------------------------------------------------------------------
// 3. "Who is the most popular lecturer?" There is no official ranking, so
//    asking for the faculty first only leads nowhere.
// ---------------------------------------------------------------------------

const RANKING = /\b(most\s+(popular|famous|liked|loved|favou?rite|chill|fun|kind|friendly|caring)|best|nicest|coolest|kindest|funniest|chillest|top|favou?rite|popular|famous)\b/;
const LECTURER = /\b(lecturers?|lectures|professors?|profs?|teachers?|tutors?|pensyarah)\b/;
// The "most handsome lecturer" egg in route.ts owns these.
const HANDSOME = /\b(handsome|leng zai|msost)\b/;
// "Who won the best lecturer award?" is a real question with an answer.
const AWARD = /\b(award|awards|prize|excellence|anugerah)\b/;
const RANKING_CJK = /(最受欢迎|最受歡迎|最好|最喜欢|最喜歡)的?(讲师|講師|老师|老師|教授)/;

export function isLecturerRankingQuestion(message: string): boolean {
    const raw = String(message || "");
    if (RANKING_CJK.test(raw)) return true;
    const text = normalize(raw);
    if (!text || text.length > 100 || HANDSOME.test(text) || AWARD.test(text)) return false;
    return RANKING.test(text) && LECTURER.test(text);
}

const LECTURER_RANKING_REPLY = `
No official ranking exists, and I’m not starting a faculty war. 😆

But if you’re asking who I stan… I love Avo more than EXO. 🥑

### 🎯 Real talk

- Ask your seniors who explains a subject well.
- Tell me your programme and subject, and I can help with the course details.
`.trim();

// ---------------------------------------------------------------------------

/** Instant reply for small talk about the bot, or null to run the pipeline. */
export function trySmallTalkReply(message: string): string | null {
    if (isCreatorQuestion(message)) {
        return DADDY.test(String(message || "").toLowerCase()) ? AVO_DADDY_REPLY : CREATOR_REPLY;
    }
    if (isLecturerRankingQuestion(message)) return LECTURER_RANKING_REPLY;

    const text = smallTalkText(message);
    if (!text) return null;
    if (SMART.test(text)) return SMART_REPLY;
    if (NOT_SMART.test(text)) return NOT_SMART_REPLY;
    if (IDENTITY.test(text)) return IDENTITY_REPLY;
    if (INTRO.test(text)) return INTRO_REPLY;
    return null;
}
