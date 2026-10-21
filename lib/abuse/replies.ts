import type { BlockReason } from "./checks.ts";

/**
 * Short, polite refusals: say what happened and what to do next, in the
 * language picked on the chat page (EN / BM / 中文).
 */

type Lang = "en" | "ms" | "zh";

const REPLIES: Record<Lang, Record<BlockReason, (n: { maxChars: number }) => string>> = {
    en: {
        maintenance: () => "UTARCHAT is temporarily unavailable for maintenance. Please check back soon. 🔧",
        body_too_large: () => "This conversation has grown too long for me. Please refresh the page or start a new chat, then ask again.",
        bad_request: () => "I couldn't read that message. Please refresh the page and try again.",
        empty: () => "Please type your question about UTAR. 🙂",
        too_long: ({ maxChars }) => `Please keep your question under ${maxChars.toLocaleString("en")} characters. Try asking one thing at a time. 🙂`,
        junk: () => "That looks like repeated or pasted text. Please ask your UTAR question in a sentence or two.",
        jailbreak: () => "I can only help with UTAR questions, such as courses, fees, exams, buses and campus services. What would you like to know?",
        repeat: () => "You just asked that. The answer is above. If something was unclear, try asking it a different way.",
        repeat_recent: () => "You asked this a moment ago. Please wait a minute and try again, or ask it a different way.",
        blocked_client: () => "UTARCHAT is not available from this device. For help, please contact the UTAR office directly.",
        rate_minute: () => "You're sending messages quickly. Please wait a minute, then try again. ⏳",
        rate_day: () => "You've reached today's question limit. Please come back tomorrow, or contact the UTAR office directly for urgent questions.",
        budget: () => "UTARCHAT is very busy today. Please come back tomorrow. For urgent questions, contact the UTAR office directly.",
        limit_store: () => "UTARCHAT can't take questions right now. Please try again in a few minutes.",
    },
    ms: {
        maintenance: () => "UTARCHAT ditutup sementara untuk penyelenggaraan. Sila cuba lagi nanti. 🔧",
        body_too_large: () => "Perbualan ini sudah terlalu panjang. Sila muat semula halaman atau mulakan perbualan baharu, kemudian tanya semula.",
        bad_request: () => "Saya tidak dapat membaca mesej itu. Sila muat semula halaman dan cuba lagi.",
        empty: () => "Sila taip soalan anda tentang UTAR. 🙂",
        too_long: ({ maxChars }) => `Sila pastikan soalan anda kurang daripada ${maxChars.toLocaleString("en")} aksara. Cuba tanya satu perkara pada satu masa. 🙂`,
        junk: () => "Mesej itu kelihatan seperti teks berulang atau tampalan. Sila tanya soalan UTAR anda dalam satu atau dua ayat.",
        jailbreak: () => "Saya hanya boleh membantu soalan tentang UTAR, seperti kursus, yuran, peperiksaan, bas dan perkhidmatan kampus. Apa yang anda ingin tahu?",
        repeat: () => "Anda baru sahaja bertanya soalan itu. Jawapannya ada di atas. Jika kurang jelas, cuba tanya dengan cara lain.",
        repeat_recent: () => "Anda bertanya soalan ini sebentar tadi. Sila tunggu seminit dan cuba lagi, atau tanya dengan cara lain.",
        blocked_client: () => "UTARCHAT tidak tersedia daripada peranti ini. Sila hubungi pejabat UTAR secara terus.",
        rate_minute: () => "Anda menghantar mesej terlalu cepat. Sila tunggu seminit, kemudian cuba lagi. ⏳",
        rate_day: () => "Anda telah mencapai had soalan hari ini. Sila kembali esok, atau hubungi pejabat UTAR untuk soalan segera.",
        budget: () => "UTARCHAT sangat sibuk hari ini. Sila kembali esok. Untuk soalan segera, hubungi pejabat UTAR secara terus.",
        limit_store: () => "UTARCHAT tidak dapat menerima soalan sekarang. Sila cuba lagi dalam beberapa minit.",
    },
    zh: {
        maintenance: () => "UTARCHAT 正在维护，暂时无法使用。请稍后再来。🔧",
        body_too_large: () => "这段对话太长了。请刷新页面或开始新的对话，然后再问一次。",
        bad_request: () => "我无法读取这条消息。请刷新页面后再试。",
        empty: () => "请输入你关于 UTAR 的问题。🙂",
        too_long: ({ maxChars }) => `请把问题控制在 ${maxChars} 个字符以内，一次问一件事。🙂`,
        junk: () => "这条消息看起来像重复或粘贴的文字。请用一两句话提出你的 UTAR 问题。",
        jailbreak: () => "我只能回答与 UTAR 有关的问题，例如课程、学费、考试、巴士和校园服务。你想了解什么？",
        repeat: () => "你刚刚问过这个问题，答案在上面。如果哪里不清楚，可以换个方式再问。",
        repeat_recent: () => "你刚才问过这个问题。请等一分钟再试，或换个方式提问。",
        blocked_client: () => "此设备无法使用 UTARCHAT。如需帮助，请直接联系 UTAR 相关部门。",
        rate_minute: () => "你发送消息太快了。请等一分钟后再试。⏳",
        rate_day: () => "你今天的提问次数已达上限。请明天再来，紧急问题请直接联系 UTAR 相关部门。",
        budget: () => "UTARCHAT 今天非常繁忙，请明天再来。紧急问题请直接联系 UTAR 相关部门。",
        limit_store: () => "UTARCHAT 现在暂时无法接收问题。请几分钟后再试。",
    },
};

export function refusalText(reason: BlockReason, language: unknown, maxChars: number): string {
    const lang: Lang = language === "ms" || language === "zh" ? language : "en";
    return REPLIES[lang][reason]({ maxChars });
}

/**
 * Same shape as a normal chat answer, so the chat page shows it like any reply.
 * No agent or context fields: the page keeps the conversation's current ones.
 */
export function refusalPayload(reason: BlockReason, language: unknown, maxChars: number) {
    return {
        text: refusalText(reason, language, maxChars),
        citations: [],
        sourceMode: "none",
        storeDisplayName: "",
        needsClarification: false,
        routeType: "general_public",
        blocked: reason,
    };
}

/** When Gemini itself is unavailable (no credit, quota, key or outage): say so plainly, never blame the sources. */
export function unavailableText(language: unknown): string {
    if (language === "ms") return "UTARCHAT tidak dapat menjawab buat sementara waktu. Sila cuba lagi dalam beberapa minit. 🔧";
    if (language === "zh") return "UTARCHAT 暂时无法回答。请几分钟后再试。🔧";
    return "UTARCHAT is temporarily unavailable. Please try again in a few minutes. 🔧";
}
