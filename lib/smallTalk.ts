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
// 3b. "Who is Avo?" / "Who is Aun Yichiet?" (the creator easter eggs).
// ---------------------------------------------------------------------------

// Shown as a tappable chip (the "Official Links" section of an answer).
const INSTAGRAM_LINK = `
### 🔗 Official Links

- [📸 Follow @yichiet on Instagram](https://www.instagram.com/yichiet/)
`;

export const AVO_WHO_REPLY = `
You know, I know la. 😏🥑

Avo is the one behind UTARCHAT. Follow him for more financial advice (and the occasional avocado).
${INSTAGRAM_LINK}`.trim();

export const AUN_YICHIET_REPLY = `
Aun Yichiet, also known as Avo. 🥑

### 👨‍🏫 Who he is

- Associate Professor at FICT (Faculty of Information and Communication Technology), UTAR
- Co-founder of ABLEs
- The brain (and caffeine) behind UTARCHAT
${INSTAGRAM_LINK}`.trim();

const AVO_NAME = /\b(avo|avocado)\b/;
const AVO_WHO = [
    /^(who|whos|who s|who is|who r|who are)\s+(is\s+|this\s+|that\s+)?(avo|avocado)\b/,
    /^(avo|avocado)\s+(is\s+)?(who|siapa)\b/,
    /^siapa\s+(itu\s+)?avo\b/,
    /^(do\s+)?(you|u)\s+know\s+avo\b/,
    /^(tell\s+me\s+about|what\s+about)\s+avo\b/,
];
const AVO_WHO_CJK = /(avo|Avo|AVO)\s*(是谁|是誰)|谁是\s*(avo|Avo|AVO)/;
const AUN_NAME = /\b(aun\s*yi\s*chiet|yichiet|yi\s*chiet|(dr|prof|professor|ts|assoc prof)\s+aun)\b/;
// "Aun Yichiet's email / office" is a real directory question: let the pipeline answer it.
const CONTACT = /\b(email|e mail|phone|tel|office|room|contact|consultation|ext|extension|block|where)\b/;

export function isAvoQuestion(message: string): boolean {
    const raw = String(message || "");
    if (AVO_WHO_CJK.test(raw)) return true;
    const text = smallTalkText(raw);
    return Boolean(text) && AVO_NAME.test(text) && AVO_WHO.some((p) => p.test(text));
}

export function isAunYichietQuestion(message: string): boolean {
    const text = normalize(message);
    if (!text || text.length > 70 || CONTACT.test(text)) return false;
    return AUN_NAME.test(text) || /(殷|aun)\s*(亦|yi)\s*(杰|chiet)/i.test(String(message || ""));
}

/** Instant reply for small talk about the bot, or null to run the pipeline. */
export function trySmallTalkReply(message: string): string | null {
    if (isAunYichietQuestion(message)) return AUN_YICHIET_REPLY;
    if (isAvoQuestion(message)) return AVO_WHO_REPLY;
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

// ---------------------------------------------------------------------------
// 4. Plain greetings, thanks and goodbyes: a fixed reply, no Gemini call and
//    never a web search. Only when the whole message is the greeting, so
//    "hi, when is the exam?" still reaches the pipeline.
// ---------------------------------------------------------------------------

type GreetingKind = "hello" | "morning" | "afternoon" | "evening" | "night" | "thanks" | "bye" | "ok";
type Lang = "en" | "ms" | "zh";

const GREETING_TAIL = "(\\s+(there|all|everyone|utarchat|utargpt|bot|ai|buddy|bro|sis|friend|ah|lah|la|leh))*";
const GREETINGS: [GreetingKind, RegExp][] = [
    ["morning", new RegExp(`^(good\\s*morning|morning|gm|selamat\\s+pagi|pagi)${GREETING_TAIL}$`)],
    ["afternoon", new RegExp(`^(good\\s*afternoon|afternoon|selamat\\s+(petang|tengah\\s*hari))${GREETING_TAIL}$`)],
    ["evening", new RegExp(`^(good\\s*evening|evening|selamat\\s+malam)${GREETING_TAIL}$`)],
    ["night", new RegExp(`^(good\\s*night|gn|nite|night)${GREETING_TAIL}$`)],
    ["hello", new RegExp(`^(hi+|hello+|hey+|helo+|hai+|hiya|yo+|howdy|greetings|sup|wassup|whats up|how are you|how r u|hi how are you|apa khabar|hai apa khabar)${GREETING_TAIL}$`)],
    ["thanks", new RegExp(`^((thank\\s*(you|u)|thanks|thx|tq|ty|tqvm|terima\\s+kasih|tq\\s+so\\s+much|thanks\\s+a\\s+lot)(\\s+(so|very)\\s+much)?)${GREETING_TAIL}$`)],
    ["bye", new RegExp(`^(bye+|bye bye|goodbye|see\\s+(you|ya|u)|cya|ttyl|jumpa\\s+lagi|selamat\\s+tinggal)${GREETING_TAIL}$`)],
    ["ok", new RegExp(`^(ok+|okay|okie|k|noted|got\\s+it|alright|cool|nice|great|awesome|baik|faham)${GREETING_TAIL}$`)],
];
const GREETINGS_CJK: [GreetingKind, RegExp][] = [
    ["morning", /^(早安|早上好|早)[!！~～。.]*$/],
    ["afternoon", /^(午安|下午好)[!！~～。.]*$/],
    ["evening", /^(晚上好)[!！~～。.]*$/],
    ["night", /^(晚安)[!！~～。.]*$/],
    ["hello", /^(你好|您好|哈喽|哈囉|嗨|你好吗)[!！~～。.呀啊]*$/],
    ["thanks", /^(谢谢|謝謝|多谢|多謝|感谢|感謝|谢谢你|謝謝你)[!！~～。.啦]*$/],
    ["bye", /^(再见|再見|拜拜|下次见)[!！~～。.]*$/],
    ["ok", /^(好的|好|明白|知道了|收到)[!！~～。.]*$/],
];

const GREETING_REPLIES: Record<Lang, Record<GreetingKind, string>> = {
    en: {
        hello: "Hi! 👋 What would you like to know about UTAR? I can help with courses, fees, exams, buses and campus services.",
        morning: "Good morning! ☀️ What can I help you with today?",
        afternoon: "Good afternoon! 🌤️ What would you like to know about UTAR?",
        evening: "Good evening! 🌙 What can I help you with?",
        night: "Good night! 🌙 Come back anytime you have a UTAR question.",
        thanks: "You're welcome! 😊 Anything else I can help with?",
        bye: "Bye! 👋 Come back anytime.",
        ok: "👍 Anything else you'd like to know?",
    },
    ms: {
        hello: "Hai! 👋 Apa yang anda ingin tahu tentang UTAR? Saya boleh bantu soal kursus, yuran, peperiksaan, bas dan perkhidmatan kampus.",
        morning: "Selamat pagi! ☀️ Apa yang boleh saya bantu hari ini?",
        afternoon: "Selamat petang! 🌤️ Apa yang anda ingin tahu tentang UTAR?",
        evening: "Selamat malam! 🌙 Apa yang boleh saya bantu?",
        night: "Selamat malam! 🌙 Datang lagi bila ada soalan tentang UTAR.",
        thanks: "Sama-sama! 😊 Ada apa-apa lagi yang boleh saya bantu?",
        bye: "Jumpa lagi! 👋",
        ok: "👍 Ada apa-apa lagi yang anda ingin tahu?",
    },
    zh: {
        hello: "你好！👋 想了解 UTAR 的什么？课程、学费、考试、巴士和校园服务我都可以帮你。",
        morning: "早上好！☀️ 今天有什么可以帮你？",
        afternoon: "下午好！🌤️ 想了解 UTAR 的什么？",
        evening: "晚上好！🌙 有什么可以帮你？",
        night: "晚安！🌙 有 UTAR 的问题随时回来问我。",
        thanks: "不客气！😊 还有什么可以帮你？",
        bye: "拜拜！👋 随时回来。",
        ok: "👍 还有什么想了解的吗？",
    },
};

export function greetingKind(message: string): GreetingKind | null {
    const raw = String(message || "").trim();
    if (!raw || raw.length > 40) return null;
    for (const [kind, pattern] of GREETINGS_CJK) if (pattern.test(raw)) return kind;
    const text = normalize(raw);
    for (const [kind, pattern] of GREETINGS) if (pattern.test(text)) return kind;
    return null;
}

/** Fixed reply for a plain greeting / thanks / goodbye, in the language picked on the chat page. */
export function tryGreetingReply(message: string, language?: unknown): string | null {
    const kind = greetingKind(message);
    if (!kind) return null;
    const lang: Lang = language === "ms" || language === "zh" ? language : "en";
    return GREETING_REPLIES[lang][kind];
}
