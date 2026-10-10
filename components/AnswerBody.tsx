"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a bot answer as: the direct answer, then one card per "###"
 * section (short ones side by side on wide screens), a highlighted
 * "Next step" callout, and the official links as chips.
 */

const markdownComponents: Components = {
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-medium hover:text-blue-800 break-words"
        >
            {children} ↗
        </a>
    ),
    p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
    h3: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-900">{children}</h3>,
    ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
    // Timetables can be wider than a phone: scroll the table, not the page.
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full border-collapse text-xs">{children}</table>
        </div>
    ),
    th: ({ children }) => (
        <th className="border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left font-semibold text-zinc-900 whitespace-nowrap">
            {children}
        </th>
    ),
    td: ({ children }) => <td className="border-b border-zinc-100 px-2 py-1.5 align-top">{children}</td>,
    // Used for the "Next step" callout (see NEXT_STEP below) and any quote.
    blockquote: ({ children }) => (
        <blockquote className="my-3 rounded-lg border border-blue-100 border-l-4 border-l-blue-500 bg-blue-50 px-3 py-1 text-zinc-800 not-italic">
            {children}
        </blockquote>
    ),
};

const PROSE =
    "prose prose-sm prose-zinc max-w-none leading-relaxed prose-p:my-2 prose-li:my-0.5 prose-strong:text-zinc-900 prose-blockquote:not-italic prose-blockquote:font-normal";

function Markdown({ text }: { text: string }) {
    return (
        <div className={PROSE}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {text}
            </ReactMarkdown>
        </div>
    );
}

type Section = { title: string; body: string };

// "**Next step:** ..." becomes a callout.
const NEXT_STEP = /^\s*\*\*Next step:?\*\*:?/im;

export function splitAnswer(text: string): { intro: string; sections: Section[]; links: { label: string; href: string }[] } {
    const withCallout = String(text || "")
        .split("\n")
        .map((line) => (NEXT_STEP.test(line) ? `> ${line.trim().replace(/^\*\*Next step:?\*\*:?/i, "➡️ **Next step:**")}` : line))
        .join("\n");

    const parts = withCallout.split(/^#{2,3}\s+/m);
    const intro = parts[0].trim();
    const sections: Section[] = [];
    let links: { label: string; href: string }[] = [];

    for (const part of parts.slice(1)) {
        const [titleLine, ...rest] = part.split("\n");
        const title = titleLine.trim();
        const body = rest.join("\n").trim();
        if (/official links/i.test(title)) {
            links = [...body.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ label: m[1], href: m[2] }));
            continue;
        }
        sections.push({ title, body });
    }
    return { intro, sections, links };
}

/** Long sections, tables and step lists get the full width. */
function isWide(section: Section): boolean {
    return section.body.length > 320 || section.body.includes("|") || (section.body.match(/^\s*\d+\.\s/gm) || []).length > 3;
}

/** Short sections sit in pairs; one left without a partner takes the full width. */
function fullWidthFlags(sections: Section[]): boolean[] {
    const flags = sections.map(isWide);
    let run: number[] = [];
    const closeRun = () => {
        if (run.length % 2 === 1) flags[run[run.length - 1]] = true;
        run = [];
    };
    sections.forEach((_, i) => (flags[i] ? closeRun() : run.push(i)));
    closeRun();
    return flags;
}

export default function AnswerBody({ text }: { text: string }) {
    const { intro, sections, links } = splitAnswer(text);
    const fullWidth = fullWidthFlags(sections);

    return (
        <div className="space-y-3">
            {intro && <Markdown text={intro} />}

            {sections.length > 0 && (
                <div className="grid gap-2 lg:grid-cols-2">
                    {sections.map((section, i) => (
                        <section
                            key={i}
                            className={`rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 ${fullWidth[i] ? "lg:col-span-2" : ""}`}
                        >
                            <h3 className="mb-1 text-sm font-semibold text-zinc-900">{section.title}</h3>
                            {section.body && <Markdown text={section.body} />}
                        </section>
                    ))}
                </div>
            )}

            {links.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-xs text-zinc-500">🔗 Official links:</span>
                    {links.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                            {link.label} ↗
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
