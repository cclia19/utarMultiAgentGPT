/**
 * Format and failure checks on a finished answer. No Gemini, no network:
 * used by scripts/prelaunch-check.mjs to review many answers cheaply.
 *
 * "error" flags are always wrong for a student to see; "warn" flags break the
 * response style (RESPONSE_STYLE in app/api/chat/route.ts) or point at a
 * knowledge gap worth a look.
 */

export type LintFlag = {
    code: string;
    severity: "error" | "warn";
    detail: string;
};

const RULES: { code: string; severity: "error" | "warn"; detail: string; test: (text: string, body: string) => boolean }[] = [
    {
        code: "leaked-reasoning",
        severity: "error",
        detail: "model notes or tool calls leaked into the answer",
        test: (t) => /\btool_code\b|print\(\s*file_search|^\s*thought\s*$|^\s*(here'?s|here is) (the|my) plan\b/im.test(t),
    },
    {
        code: "empty",
        severity: "error",
        detail: "empty or placeholder answer",
        test: (t) => t.trim().length < 15 || /^no response generated\.?$/i.test(t.trim()),
    },
    {
        code: "sentinel",
        severity: "error",
        detail: "internal NO_KB_ANSWER marker shown",
        test: (t) => t.includes("NO_KB_ANSWER"),
    },
    {
        code: "retrieval-failed",
        severity: "error",
        detail: "fell through to the 'trouble retrieving' message",
        test: (t) => /having trouble retrieving/i.test(t),
    },
    {
        code: "internal-jargon",
        severity: "warn",
        detail: "mentions the knowledge base, documents or tools",
        test: (t) => /\b(knowledge base|retrieved (documents?|information)|provided (documents?|information|context)|file search|search results)\b/i.test(t),
    },
    {
        code: "preamble",
        severity: "warn",
        detail: "opens with filler instead of the answer",
        test: (_t, body) => /^(here (is|are)|here'?s|based on (the|my|available)|according to the (documents?|information|knowledge)|great question|that'?s a (great|good) question)\b/i.test(body),
    },
    {
        code: "footnote-marker",
        severity: "warn",
        detail: "table footnote marker (* or ^) copied into the text",
        // "Programme*", "Intake^" (not Markdown bold or bullets).
        test: (t) => /[A-Za-z)][\^](?=[\s:,.)]|$)/m.test(t) || /(?<!\*)[A-Za-z)]\*(?!\*)(?=[\s:,.)]|$)/m.test(t),
    },
    {
        code: "big-heading",
        severity: "warn",
        detail: "uses # or ## headings",
        test: (t) => /^#{1,2}\s/m.test(t),
    },
    {
        code: "too-long",
        severity: "warn",
        detail: "over 300 words (tables not counted)",
        test: (_t, body) =>
            body
                .split("\n")
                .filter((line) => !line.trim().startsWith("|"))
                .join(" ")
                .split(/\s+/)
                .filter(Boolean).length > 300,
    },
    {
        code: "no-answer",
        severity: "warn",
        detail: "says it could not find the information (possible knowledge gap)",
        test: (t) => /\b(couldn'?t|could not|unable to|was not able to) (find|locate|retrieve)\b|\b(no|don'?t have (any )?) (specific )?information (about|on|regarding)\b|\bnot (available|found) in (the|my) (records|information)\b/i.test(t),
    },
];

/** The answer without the appended "Official Links" section. */
export function answerBody(text: string): string {
    return String(text || "").split(/\n#{1,3}\s*🔗?\s*Official Links/i)[0].trim();
}

export function lintAnswer(text: string): LintFlag[] {
    const raw = String(text || "");
    const body = answerBody(raw);
    return RULES.filter((rule) => rule.test(raw, body)).map(({ code, severity, detail }) => ({ code, severity, detail }));
}
