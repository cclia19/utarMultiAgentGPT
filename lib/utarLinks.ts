/**
 * Verified UTAR system links and the "who to contact" rule.
 *
 * Answers used to describe how to reach a system ("go to utar.edu.my, click
 * UTAR Portal, then Information Gateway…") or say "log in to the Student
 * Portal" with no link. They also sometimes sent students to a different
 * office than the one answering (an OIA answer pointing to DSA because an
 * older handbook page said so). These rules make answers link directly and
 * stay consistent about whom to contact.
 *
 * Each URL here was checked by hand (19 Nov 2026). Pure, unit tested.
 */

import { ORG_UNITS, type OrgUnit } from "./orgUnits.ts";

export const SYSTEM_LINKS: { title: string; uri: string; use: string }[] = [
    { title: "UTAR Portal (Student Portal)", uri: "https://portal.utar.edu.my/", use: "exam timetables and slips, results, class timetables, announcements, e-mail, personal details" },
    { title: "Course Registration System", uri: "https://unitreg.utar.edu.my/", use: "registering and adding/dropping units" },
    { title: "WBLE", uri: "https://wble.utar.edu.my/", use: "lecture notes, assignments and course pages (WBLE)" },
    { title: "WBLE (Sungai Long Campus)", uri: "https://ewble-sl.utar.edu.my/", use: "WBLE for Sungai Long Campus courses" },
];

/** Every link answers may use without a web source: the systems above and each office's official website. */
export function verifiedLinks(): { title: string; uri: string }[] {
    const offices = ORG_UNITS.filter((u) => u.website).map((u) => ({ title: u.name, uri: u.website! }));
    return [...SYSTEM_LINKS.map(({ title, uri }) => ({ title, uri })), ...offices];
}

export const DIRECT_LINKS_RULE = `
DIRECT LINKS: When the answer tells the student to log in to, open or check one of these UTAR systems, link it right there in the sentence (a Markdown link with a short name), instead of describing how to navigate to it from the homepage:
${SYSTEM_LINKS.map((l) => `- [${l.title}](${l.uri}): ${l.use}`).join("\n")}
Lead with the link, even when your evidence describes the navigation steps (e.g. "Log in at [UTAR Portal (Student Portal)](https://portal.utar.edu.my/) with your student ID"); keep the navigation steps out unless the student asks for them.
Never put a URL in bold; write links as [Name](https://…).
`;

/** Whom to contact: the office answering, unless the evidence says a specific step belongs to another office. */
export function contactRule(unit: Pick<OrgUnit, "id" | "name" | "website"> | undefined): string {
    if (!unit || unit.id === "general") {
        return `
WHO TO CONTACT: When you tell the student to contact an office, name the one office that handles this topic and give its contact or website from your evidence. Do not list several offices for the same enquiry.
`;
    }
    const site = unit.website ? ` (website: ${unit.website})` : "";
    return `
WHO TO CONTACT: This question is answered by ${unit.name}${site}. When you tell the student whom to contact, point them to ${unit.name} and its contact details or website. Name a different office only when your evidence says that office handles this specific step, and then say why in a few words. If an official UTAR web page and a document disagree about which office handles something, follow the web page.
`;
}
