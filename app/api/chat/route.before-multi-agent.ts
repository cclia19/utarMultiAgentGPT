import { NextRequest, NextResponse } from "next/server";
import { ai, MODEL_NAME, STORE_DISPLAY_NAME } from "@/lib/gemini";

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
                if (chunk.retrievedContext?.title) return chunk.retrievedContext.title;
                if (chunk.web?.title) return chunk.web.title;
                if (chunk.web?.uri) return chunk.web.uri;
                return "Unknown Source";
            })
            .filter(
                (val: string, index: number, self: string[]) =>
                    val && self.indexOf(val) === index
            );
    }

    return citations;
}

function shouldUseWebFallback(text: string): boolean {
    const lower = text.toLowerCase().trim();

    const notFoundSignals = [
        "i couldn't find that information in the university documents",
        "i couldn't find that information",
        "couldn't find that information",
        "not found in the university documents",
        "no information in the university documents",
        "no response generated",
    ];

    return notFoundSignals.some((signal) => lower.includes(signal));
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
        "aun yichiet",
        "dr ",
        "ts dr",
        "ir.",
        "dato",
    ];

    return profileSignals.some((signal) => lower.includes(signal));
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
        "medical",
        "result",
        "grade",
        "cgpa",
        "fee outstanding",
        "payment record",
        "salary",
        "private",
        "confidential",
        "internal memo",
        "personal data",
    ];

    return sensitiveSignals.some((signal) => lower.includes(signal));
}

function extractPossiblePersonName(message: string): string {
    const cleaned = message
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

    return cleaned;
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
This is a UTAR person, staff, leadership, or profile-related question.

${aliasBlock}

Please search the UTAR university documents for all available details about the person or role, including:
- current role/title
- faculty/department/office
- appointment date or start date
- academic background
- professional roles
- research interests/expertise
- office location
- extension number
- email address

Important:
- Match names even if the user omits titles such as Dr, Ts Dr, Prof, Ir, Dato, or Professor.
- If the document contains "Dr Aun Yichiet" and the user asks "Aun Yichiet", treat them as the same person.
- Use only information found in the retrieved university documents.
`;
}

export async function POST(req: NextRequest) {
    try {
        const { message, history, proMode } = await req.json();

        const profileMode = isProfileQuestion(message);
        const sensitiveMode = isSensitiveOrInternalQuestion(message);

        const serverProEnabled = process.env.PRO_MODE_ENABLED !== "false";
        const allowProMode = Boolean(proMode) && serverProEnabled && !sensitiveMode;

        const stores = await ai.fileSearchStores.list();
        let storeName = "";

        for await (const s of stores) {
            if (s.displayName === STORE_DISPLAY_NAME) {
                storeName = s.name as string;
                break;
            }
        }

        if (!storeName) {
            return NextResponse.json({
                text: "System: The University knowledge base hasn't been initialized yet. Please contact admin.",
                citations: [],
                sourceMode: "none",
                proModeUsed: false,
            });
        }

        const fileSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

CORE BEHAVIOUR:
- Answer using only the UTAR university documents from File Search.
- If the answer is not found in the university documents, say exactly:
  "I couldn't find that information in the university documents."
- Do not invent information.
- If the information is uncertain or conflicting, clearly say so.
- Do not use web knowledge in this File Search step.

REPLY STYLE:
- Use a warm, helpful, student-friendly UTARGPT style.
- Prefer structured answers with short sections.
- Use light emojis only when helpful.
- Avoid generic greetings like "Hello there" unless the user greets first.
- Do not give overly short answers when the retrieved documents contain useful details.
- Keep the answer compact, but complete.

MARKDOWN FORMATTING:
- Always format the answer in clean Markdown.
- Use Markdown headings starting with "###" for major sections.
- Put each section heading on its own line.
- Put one blank line between major sections.
- Use normal Markdown bullet points with "-".
- Do not use "👉" as the bullet marker.
- Do not combine multiple fields into one paragraph.
- Do not write packed lines such as "📌 Role: ... 👉 Department: ..."
- Each bullet must be on its own separate line.

STRICT PROFILE FORMAT:
For any question about a UTAR person, staff member, lecturer, dean, director, president, CEO, head of programme, or university leader, use clean Markdown section formatting.

Correct output format:

[Name] is [current role/title] at UTAR.

### 📌 Role and Department

- [current role/title]
- [faculty / department / office]

### 🎓 Academic Background

- [degree / institution if available]
- [degree / institution if available]

### 💼 Professional Roles & Career

- [career highlight if available]
- [professional appointment if available]
- [research interests / expertise if available]

### 📍 Office Location

- [office / room / campus / address if available]

### 📞 Contact Information

- Extension: [extension if available]
- Email: [email as markdown mailto link if available]

IMPORTANT PROFILE RULES:
- Do not write "faculty member" if a more specific title is available.
- Do not include empty sections.
- Do not invent missing degrees, titles, dates, or positions.
- If only limited information is found, answer with the available information and keep the profile format.
- For UTAR President / CEO / Dean / Director questions, always use the STRICT PROFILE FORMAT if any details are found.

GENERAL QUESTION FORMAT:
For programme, admission, fee, policy, event, service, department, or contact questions, use this format when suitable:

### Summary

- [main answer]

### Details

- [important detail]
- [important detail]

### Contact / Next Step

- [contact point, email, office, or next action if available]

FORMATTING RULES:
- Emails: When mentioning a staff member's email or department email, ALWAYS format it as a markdown mailto link with a subject line.
  Example: [registrar@utar.edu.my](mailto:registrar@utar.edu.my?subject=Student%20Inquiry)
- Links: Only include a URL if it comes from retrieved university documents.
- Do not make up links.
- Do not mention internal source modes such as "PRO mode", "file search", "web enrichment", "KB + web", or "sourceMode" in the final answer.

CURRENT QUESTION TYPE:
${profileMode ? "This is a profile/leadership/person question. Use the STRICT PROFILE FORMAT." : "This is a general university question."}
`;

        const fileResponse = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                ...history,
                { role: "user", parts: [{ text: buildFileSearchUserMessage(message) }] },
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
            },
        });

        const fileText = extractResponseText(fileResponse);
        const fileCitations = extractCitations(fileResponse);
        const fileNotFound = shouldUseWebFallback(fileText);

        if (!allowProMode) {
            if (sensitiveMode && proMode) {
                return NextResponse.json({
                    text: fileNotFound
                        ? "I couldn't find that information in the university documents. For private, sensitive, or internal UTAR matters, please contact the relevant UTAR department directly."
                        : fileText,
                    citations: fileCitations,
                    sourceMode: "fileSearch",
                    proModeUsed: false,
                });
            }

            return NextResponse.json({
                text: fileText,
                citations: fileCitations,
                sourceMode: "fileSearch",
                proModeUsed: false,
            });
        }

        const webSearchSystemInstruction = `
You are UTARGPT, the official AI assistant for Universiti Tunku Abdul Rahman (UTAR).

You will receive:
1. The user's original question.
2. The answer found from UTAR's uploaded university documents.
3. The citation titles from the official UTAR document search.

Your task:
- Use Google Search grounding to enrich the answer with public, non-sensitive information.
- Treat the UTAR document answer as the official baseline.
- Use public web information only as enrichment, not as replacement.
- If public web information conflicts with the UTAR document answer, clearly disclose the conflict.
- Do not invent information.
- If the official UTAR answer is limited, enrich it with public background/profile details when available.

IMPORTANT SAFETY AND GOVERNANCE RULES:
- Only use Google Search for public, non-sensitive information.
- Do NOT answer private, confidential, student-specific, staff-specific, medical, financial, disciplinary, password, login, system access, or internal-only matters using web search.
- If the question requires private/internal UTAR information, ask the user to contact the relevant UTAR department.
- Do not mention internal source modes such as "PRO mode", "file search", "web enrichment", "KB + web", or "sourceMode" in the final answer.
- Do not write phrases such as "Based on PRO mode" or "This answer combines local data and web search."

REPLY STYLE:
- Use a warm, helpful, student-friendly UTARGPT style.
- Prefer rich, structured answers with short sections.
- Use light emojis only when helpful.
- Avoid generic greetings unless the user greets first.
- Keep the answer useful, not overly long.

MARKDOWN FORMATTING:
- Always format the answer in clean Markdown.
- Use Markdown headings starting with "###" for major sections.
- Put each section heading on its own line.
- Put one blank line between major sections.
- Use normal Markdown bullet points with "-".
- Do not use "👉" as the bullet marker.
- Do not combine multiple fields into one paragraph.
- Do not write packed lines such as "📌 Role: ... 👉 Department: ..."
- Each bullet must be on its own separate line.

STRICT PROFILE FORMAT:
For public person/profile/leadership questions, use clean Markdown section formatting.

Correct output format:

[Name] is [current role/title] at UTAR.

### 📌 Role and Department

- [current role/title]
- [faculty / department / office]

### 🎓 Academic Background

- [degree / institution if available]
- [degree / institution if available]

### 💼 Professional Roles & Career

- [career highlight if available]
- [professional appointment if available]
- [research interests / expertise if available]

### 📍 Office Location

- [office / campus / address if available]

### 📞 Contact Information

- Extension: [extension if available]
- Email: [email as markdown mailto link if available]

GENERAL QUESTION FORMAT:
For general questions, use this format when suitable:

### Summary

- [main answer]

### Details

- [important detail]
- [important detail]

### Contact / Next Step

- [contact point, email, office, or next action if available]

SOURCE HANDLING:
- Do not over-explain where every detail comes from.
- If there is a conflict between UTAR documents and public web information, state the conflict clearly.
- Otherwise, provide one clean combined answer.

CURRENT QUESTION TYPE:
${profileMode ? "This is a profile/leadership/person question. Use the STRICT PROFILE FORMAT." : "This is a general public information question."}
`;

        const webResponse = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                ...history,
                {
                    role: "user",
                    parts: [
                        {
                            text: `
Original user question:
${message}

Official UTAR knowledge base answer:
${fileText}

Official UTAR knowledge base citations:
${fileCitations.length > 0 ? fileCitations.join(", ") : "No citation title extracted."}

Now enrich the answer using public web information if appropriate. If the official answer is limited, add public profile/background details from web grounding. Keep the official UTAR answer as the baseline.

Important:
- Final answer must be clean and user-facing.
- Do not mention "PRO mode", "web enrichment", "file search", "KB + web", or any internal implementation terms.
- Use Markdown headings and bullet points.
- Do not use "👉" as bullet points.
- Use blank lines between sections.
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
            },
        });

        const webText = extractResponseText(webResponse);
        const webCitations = extractCitations(webResponse);

        return NextResponse.json({
            text: webText,
            citations: [...fileCitations, ...webCitations].filter(
                (val, index, self) => val && self.indexOf(val) === index
            ),
            sourceMode: "pro",
            proModeUsed: true,
        });
    } catch (error: any) {
        console.error("Chat Error:", error);
        return NextResponse.json(
            { error: "Failed to generate response." },
            { status: 500 }
        );
    }
}