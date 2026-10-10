/**
 * Chat page wording in the three languages of the language switch.
 * Answers themselves come from Gemini in the chosen language (lib/followUps.ts).
 */

export type Lang = "en" | "ms" | "zh";
export const LANGS: { id: Lang; label: string }[] = [
    { id: "en", label: "EN" },
    { id: "ms", label: "BM" },
    { id: "zh", label: "中文" },
];

/** Browser language -> default UI language. */
export function defaultLang(): Lang {
    if (typeof navigator === "undefined") return "en";
    const l = (navigator.language || "").toLowerCase();
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("ms") || l.startsWith("id")) return "ms";
    return "en";
}

type Starter = { emoji: string; text: string };

export type Strings = {
    tagline: string;
    greetingTitle: string;
    greetingBody: string;
    startersTitle: string;
    starters: Starter[];
    placeholder: string;
    send: string;
    footer: string;
    answeredBy: string;
    followUpsTitle: string;
    waitingFor: string;
    sources: Record<string, string>;
    stages: Record<string, string>;
    helpful: string;
    report: string;
    disclaimer: {
        title: string;
        beta: string;
        intro: string;
        items: { title: string; body: string }[];
        acknowledge: string;
        cta: string;
    };
};

export const STRINGS: Record<Lang, Strings> = {
    en: {
        tagline: "Ask naturally. I’ll find the right UTAR office.",
        greetingTitle: "Hi, I’m UTARCHAT 👋",
        greetingBody: "Your UTAR buddy for courses, fees, exams, buses, offices and student life.",
        startersTitle: "Try asking",
        starters: [
            { emoji: "📅", text: "When does the October 2026 trimester start?" },
            { emoji: "🚌", text: "Bus to Westlake Homes" },
            { emoji: "📝", text: "How do I apply for a supplementary exam?" },
            { emoji: "💰", text: "How much is the Computer Science fee?" },
            { emoji: "🎓", text: "What scholarships can I apply for?" },
            { emoji: "🧠", text: "Where can I get counselling?" },
        ],
        placeholder: "Ask anything about UTAR…",
        send: "Send",
        footer: "UTARCHAT (beta) can make mistakes. Check important info with the UTAR office.",
        answeredBy: "Answered by",
        followUpsTitle: "Ask next",
        waitingFor: "Waiting for your reply about:",
        sources: { fileSearch: "UTAR knowledge base", webFallback: "Official UTAR web", staffDirectory: "Staff directory", officialSchedule: "Official schedule" },
        stages: {
            analyzing: "Understanding your question",
            routing: "Finding the right office",
            agent_selected: "Asking the right office",
            officialPage: "Reading the official page",
            searching: "Searching UTAR documents",
            staffDirectory: "Checking the staff directory",
            webFallback: "Checking official UTAR websites",
            reasoning: "Writing your answer",
        },
        helpful: "Helpful",
        report: "Report a problem",
        disclaimer: {
            title: "Welcome to UTARCHAT",
            beta: "Beta",
            intro: "A quick note before you start.",
            items: [
                { title: "AI guidance, not official decisions", body: "Answers come from official UTAR sources but can be wrong or incomplete. UTAR policies and announcements always prevail." },
                { title: "Keep personal data out", body: "Don’t type passwords, IC/passport numbers or bank details. Questions are logged anonymously to improve UTARCHAT." },
                { title: "Verify what matters", body: "For admissions, exams, fees, scholarships, appeals or graduation, confirm with the UTAR office." },
            ],
            acknowledge: "I understand answers may contain mistakes and I’ll verify important information.",
            cta: "Start chatting",
        },
    },
    ms: {
        tagline: "Tanya saja, saya carikan jabatan UTAR yang berkaitan.",
        greetingTitle: "Hai, saya UTARCHAT 👋",
        greetingBody: "Kawan UTAR anda untuk soal kursus, yuran, peperiksaan, bas, jabatan dan kehidupan kampus.",
        startersTitle: "Cuba tanya",
        starters: [
            { emoji: "📅", text: "Bila trimester Oktober 2026 bermula?" },
            { emoji: "🚌", text: "Bas ke Westlake Homes" },
            { emoji: "📝", text: "Bagaimana memohon peperiksaan tambahan?" },
            { emoji: "💰", text: "Berapa yuran Sains Komputer?" },
            { emoji: "🎓", text: "Biasiswa apa yang boleh saya mohon?" },
            { emoji: "🧠", text: "Di mana boleh dapatkan kaunseling?" },
        ],
        placeholder: "Tanya apa sahaja tentang UTAR…",
        send: "Hantar",
        footer: "UTARCHAT (beta) boleh tersilap. Sahkan maklumat penting dengan pejabat UTAR.",
        answeredBy: "Dijawab oleh",
        followUpsTitle: "Tanya seterusnya",
        waitingFor: "Menunggu jawapan anda tentang:",
        sources: { fileSearch: "Pangkalan pengetahuan UTAR", webFallback: "Laman rasmi UTAR", staffDirectory: "Direktori staf", officialSchedule: "Jadual rasmi" },
        stages: {
            analyzing: "Memahami soalan anda",
            routing: "Mencari pejabat yang betul",
            agent_selected: "Bertanya pejabat berkenaan",
            officialPage: "Membaca laman rasmi",
            searching: "Mencari dokumen UTAR",
            staffDirectory: "Menyemak direktori staf",
            webFallback: "Menyemak laman rasmi UTAR",
            reasoning: "Menulis jawapan anda",
        },
        helpful: "Membantu",
        report: "Laporkan masalah",
        disclaimer: {
            title: "Selamat datang ke UTARCHAT",
            beta: "Beta",
            intro: "Nota ringkas sebelum anda mula.",
            items: [
                { title: "Panduan AI, bukan keputusan rasmi", body: "Jawapan berdasarkan sumber rasmi UTAR tetapi mungkin salah atau tidak lengkap. Dasar dan pengumuman UTAR sentiasa diutamakan." },
                { title: "Jangan kongsi data peribadi", body: "Jangan taip kata laluan, nombor IC/pasport atau butiran bank. Soalan direkodkan tanpa nama untuk menambah baik UTARCHAT." },
                { title: "Sahkan perkara penting", body: "Untuk kemasukan, peperiksaan, yuran, biasiswa, rayuan atau konvokesyen, sahkan dengan pejabat UTAR." },
            ],
            acknowledge: "Saya faham jawapan mungkin tersilap dan saya akan mengesahkan maklumat penting.",
            cta: "Mula berbual",
        },
    },
    zh: {
        tagline: "有问题尽管问，我帮你找对的 UTAR 部门。",
        greetingTitle: "你好，我是 UTARCHAT 👋",
        greetingBody: "你的 UTAR 小帮手，课程、学费、考试、校车、部门、校园生活都可以问我。",
        startersTitle: "试试问",
        starters: [
            { emoji: "📅", text: "2026年10月学期什么时候开始？" },
            { emoji: "🚌", text: "去 Westlake Homes 的校车" },
            { emoji: "📝", text: "怎样申请补考？" },
            { emoji: "💰", text: "计算机科学的学费是多少？" },
            { emoji: "🎓", text: "我可以申请哪些奖学金？" },
            { emoji: "🧠", text: "哪里可以找辅导咨询？" },
        ],
        placeholder: "问任何关于 UTAR 的问题…",
        send: "发送",
        footer: "UTARCHAT（测试版）可能出错，重要信息请向 UTAR 部门确认。",
        answeredBy: "回答来自",
        followUpsTitle: "接着问",
        waitingFor: "等待你补充：",
        sources: { fileSearch: "UTAR 知识库", webFallback: "UTAR 官方网站", staffDirectory: "职员名录", officialSchedule: "官方时间表" },
        stages: {
            analyzing: "理解你的问题",
            routing: "寻找对的部门",
            agent_selected: "询问相关部门",
            officialPage: "阅读官方网页",
            searching: "搜索 UTAR 文件",
            staffDirectory: "查询职员名录",
            webFallback: "查看 UTAR 官方网站",
            reasoning: "撰写答案",
        },
        helpful: "有帮助",
        report: "报告问题",
        disclaimer: {
            title: "欢迎使用 UTARCHAT",
            beta: "测试版",
            intro: "开始前的小提醒。",
            items: [
                { title: "AI 指引，不是官方决定", body: "答案来自 UTAR 官方资料，但可能有误或不完整。一切以 UTAR 政策和公告为准。" },
                { title: "不要输入个人资料", body: "请勿输入密码、身份证/护照号码或银行资料。提问会匿名记录，用于改进 UTARCHAT。" },
                { title: "重要事项请核实", body: "入学、考试、学费、奖学金、申诉或毕业等事项，请向 UTAR 相关部门确认。" },
            ],
            acknowledge: "我明白答案可能有误，重要信息我会自行核实。",
            cta: "开始聊天",
        },
    },
};
