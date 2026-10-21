/**
 * People with a profile photo: an answer about one of them shows a profile
 * tile (name and title on the left, photo on the right). Photos live in
 * public/people/ (400×500 JPEG, cropped to the person only).
 *
 * To add someone: drop a 400×500 photo in public/people/ and add an entry
 * with the name and title exactly as UTAR writes them.
 *
 * Pure functions, unit tested.
 */

export type PersonProfile = {
    id: string;
    name: string;
    title: string;
    photo: string;
    /** Matched against the question, then the answer. */
    patterns: RegExp[];
};

export const PEOPLE: PersonProfile[] = [
    {
        id: "ewe-hong-tat",
        name: "Ir. Prof. Dato' Dr. Ewe Hong Tat",
        title: "President / CEO",
        photo: "/people/ewe-hong-tat.jpg",
        patterns: [/\bewe\s+hong\s+tat\b/i, /\bprof(essor)?\.?\s+(dato'?\s+)?(dr\.?\s+)?ewe\b/i],
    },
    {
        id: "goi-bok-min",
        name: "Ir. Prof. Dr. Goi Bok Min",
        title: "Vice President (Internationalisation and Academic Development)",
        photo: "/people/goi-bok-min.jpg",
        patterns: [/\bgoi\s+bok\s+min\b/i, /\bprof(essor)?\.?\s+(dr\.?\s+)?goi\b/i],
    },
    {
        id: "zuraidah-abd-manaf",
        name: "Professor Dr. Zuraidah Binti Abd Manaf",
        title: "Vice President (Research, Development and Commercialisation)",
        photo: "/people/zuraidah-abd-manaf.jpg",
        patterns: [/\bzura?i?dah\b/i, /\babd\.?\s+manaf\b/i],
    },
    {
        id: "aun-yichiet",
        name: "Aun Yichiet (Avo)",
        title: "Associate Professor, FICT · Co-founder, ABLEs",
        photo: "/people/aun-yichiet.jpg",
        patterns: [/\baun\s*yi\s*chiet\b/i, /\byichiet\b/i, /\bavo\b/i],
    },
    {
        id: "choong-chee-keong",
        name: "Prof. Dr Choong Chee Keong",
        title: "Vice President (Student Development and Alumni Relations)",
        photo: "/people/choong-chee-keong.jpg",
        patterns: [/\bchoong\s+chee\s+keong\b/i, /\bprof(essor)?\.?\s+(dr\.?\s+)?choong\b/i],
    },
];

export type PersonCard = Pick<PersonProfile, "name" | "title" | "photo">;

function matches(person: PersonProfile, text: string): boolean {
    return person.patterns.some((p) => p.test(text));
}

/**
 * The person an answer is about: named in the question, or the only one of
 * them named in the answer. A list of several people gets no photo.
 */
export function findPerson(question: string, answer: string): PersonCard | null {
    const q = String(question || "");
    const fromQuestion = PEOPLE.filter((p) => matches(p, q));
    const chosen =
        fromQuestion.length === 1
            ? fromQuestion[0]
            : fromQuestion.length === 0
                ? (() => {
                      const inAnswer = PEOPLE.filter((p) => matches(p, String(answer || "")));
                      return inAnswer.length === 1 ? inAnswer[0] : null;
                  })()
                : null;
    return chosen ? { name: chosen.name, title: chosen.title, photo: chosen.photo } : null;
}
