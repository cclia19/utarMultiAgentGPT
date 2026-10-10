/**
 * Kampar campus bus schedules, answered from data instead of Gemini.
 *
 * Gemini blocks (finishReason OTHER / RECITATION) most answers that reproduce
 * the bus timetable PDFs, and the File Search store held an expired June
 * schedule. So the current schedules live here as data, the reply picks the
 * schedule for today's date in Malaysia, and the tables are drawn in code.
 *
 * Source: https://dgs.kpr.utar.edu.my/Bus_Service.php (PDFs "Updated 30.09.2026").
 * UPDATE EACH PERIOD: add the new period to PERIODS. After the last period
 * ends, the reply links to the official page instead of showing old times.
 *
 * Pure functions only (pass `now` in) so it can be unit tested.
 */

export const BUS_PAGE_URL = "https://dgs.kpr.utar.edu.my/Bus_Service.php";

type Stop =
    | "Stanford"
    | "Taman Mahsuri Impian"
    | "McDonald's bus stop"
    | "Champs Elysees / The Trails"
    | "Harvard & Cambridge"
    | "Westlake Homes";

type Route = {
    name: string;
    stops: Stop[];
    /**
     * One string per trip, as in the PDF:
     * "no | leaves UTAR | <one time per stop, or -> | back at UTAR".
     * A leading "*" on the trip number means not on Fridays. Notes in
     * brackets after a time, e.g. "7.00 am (D only)", are kept.
     */
    trips: string[];
    notes?: string[];
};

type Period = {
    label: string;
    /** Inclusive, Malaysia dates. */
    from: string;
    to: string;
    days?: string;
    pdfUrl: string;
    routes: Route[];
};

const STANFORD_MAHSURI_MCD: Route = {
    name: "Stanford, Taman Mahsuri Impian & McDonald's",
    stops: ["Stanford", "Taman Mahsuri Impian", "McDonald's bus stop"],
    trips: [
        "1 | 7.15 am | 7.25 am | 7.35 am | 7.40 am | 7.55 am",
        "2 | 7.55 am (from G-N-D) | - | 8.15 am | 8.20 am | 8.35 am",
        "3 | 9.00 am | 9.15 am | 9.25 am | 9.30 am | 9.45 am",
        "4 | 10.35 am | - | 10.50 am | 10.55 am | 11.10 am",
        "*5 | 12.45 pm | 1.00 pm | 1.10 pm | 1.15 pm | 1.30 pm",
        "6 | 3.00 pm | 3.15 pm | 3.25 pm | 3.30 pm | 3.45 pm",
        "7 | 4.30 pm | - | 4.45 pm | 4.50 pm | 5.05 pm",
        "8 | 6.15 pm | - | 6.30 pm | 6.35 pm | 6.50 pm",
    ],
};

const MAHSURI_CHAMPS_TRAILS: Route = {
    name: "Taman Mahsuri Impian, Champs Elysees & The Trails",
    stops: ["Taman Mahsuri Impian", "Champs Elysees / The Trails"],
    trips: [
        "1 | 7.15 am | - | 7.30 am | 7.50 am",
        "2 | 8.15 am | 8.35 am | - | 8.50 am",
        "3 | 9.10 am | - | 9.25 am | 9.45 am",
        "4 | 10.10 am | 10.30 am | - | 10.45 am",
        "5 | 11.10 am | 11.30 am | - | 11.45 am",
        "*6 | 1.10 pm | - | 1.25 pm | 1.45 pm",
        "7 | 2.15 pm | 2.35 pm | - | 2.50 pm",
        "8 | 4.15 pm | - | 4.30 pm | 4.50 pm",
        "9 | 5.15 pm | 5.35 pm | - | 5.50 pm",
        "10 | 6.15 pm | - | 6.30 pm | 6.45 pm",
        "11 | 8.40 pm | 9.00 pm | 9.15 pm | 9.30 pm",
    ],
    notes: ["Meadow Park residents can walk to The Trails bus stop."],
};

const HARVARD_CAMBRIDGE: Route = {
    name: "Harvard & Cambridge",
    stops: ["Harvard & Cambridge"],
    trips: [
        "1 | 7.00 am (D only) | 7.10 am | 7.25 am (D only)",
        "2 | 7.35 am (D only) | 7.45 am | 8.00 am",
        "3 | 8.10 am | 8.25 am | 8.40 am",
        "4 | 9.10 am | 9.25 am | 9.40 am",
        "5 | 10.10 am | 10.25 am | 10.40 am",
        "6 | 11.10 am | 11.25 am | 11.40 am",
        "*7 | 1.10 pm | 1.25 pm | 1.40 pm",
        "8 | 2.20 pm | 2.35 pm | 2.50 pm",
        "9 | 3.10 pm | 3.25 pm | 3.40 pm",
        "10 | 4.10 pm | 4.25 pm | 4.40 pm",
        "11 | 5.10 pm | 5.25 pm | 5.40 pm",
        "12 | 6.15 pm | 6.30 pm | 6.45 pm",
    ],
};

export const PERIODS: Period[] = [
    {
        label: "October 2026 trimester: Foundation teaching weeks and Degree orientation week",
        from: "2026-10-12",
        to: "2026-10-23",
        days: "Monday to Friday",
        pdfUrl: "https://dgs.kpr.utar.edu.my/documents/01Oct26_FTWnDOR_20261012_to_20261023.pdf",
        routes: [
            STANFORD_MAHSURI_MCD,
            MAHSURI_CHAMPS_TRAILS,
            HARVARD_CAMBRIDGE,
            {
                name: "Westlake Homes I",
                stops: ["Westlake Homes"],
                trips: [
                    "1 | 7.00 am (D only) | 7.10 am | 7.30 am (D only)",
                    "2 | 7.30 am (D only) | 7.40 am | 8.00 am",
                    "3 | 8.45 am | 9.00 am | 9.20 am",
                    "4 | 9.45 am | 10.00 am | 10.20 am",
                    "5 | 10.45 am | 11.00 am | 11.20 am",
                    "*6 | 12.00 pm | 12.15 pm | 12.35 pm",
                    "*7 | 2.00 pm | 2.15 pm | 2.35 pm",
                    "8 | 2.45 pm | 3.00 pm | 3.20 pm",
                    "9 | 3.45 pm | 4.00 pm | 4.20 pm",
                    "10 | 4.45 pm | 5.00 pm | 5.20 pm",
                    "11 | 6.05 pm | 6.20 pm | 6.35 pm",
                ],
            },
            {
                name: "Westlake Homes II",
                stops: ["Westlake Homes"],
                trips: [
                    "1 | 7.10 am (D only) | 7.20 am | 7.40 am",
                    "2 | 8.00 am | 8.15 am | 8.35 am",
                    "3 | 9.15 am | 9.30 am | 9.50 am",
                    "4 | 10.15 am | 10.30 am | 10.50 am",
                    "5 | 11.15 am | 11.30 am | 11.50 am",
                    "*6 | 1.15 pm | 1.30 pm | 1.50 pm",
                    "7 | 2.15 pm | 2.30 pm | 2.50 pm",
                    "8 | 3.15 pm | 3.30 pm | 3.50 pm",
                    "9 | 4.15 pm | 4.30 pm | 4.50 pm",
                    "10 | 5.15 pm | 5.30 pm | 5.50 pm",
                    "11 | 6.30 pm | 6.45 pm | 7.00 pm",
                ],
            },
        ],
    },
    {
        // The PDF says "until further notice"; its file name ends on 13 Dec 2026.
        label: "October 2026 trimester: teaching weeks",
        from: "2026-10-26",
        to: "2026-12-13",
        pdfUrl: "https://dgs.kpr.utar.edu.my/documents/03Oct26_TW_20261026_to_20261213.pdf",
        routes: [
            STANFORD_MAHSURI_MCD,
            MAHSURI_CHAMPS_TRAILS,
            HARVARD_CAMBRIDGE,
            {
                name: "Harvard & Cambridge and Westlake Homes",
                stops: ["Harvard & Cambridge", "Westlake Homes"],
                trips: [
                    "1 | 7.10 am (D only) | 7.20 am | 7.25 am | 7.45 am",
                    "2 | 8.40 am | 8.55 am | 9.00 am | 9.20 am",
                    "3 | 9.40 am | 9.55 am | 10.00 am | 10.20 am",
                    "4 | 10.40 am | 10.55 am | 11.00 am | 11.20 am",
                    "5 | 11.40 am | 11.55 am | 12.00 pm | 12.15 pm",
                    "*6 | 1.40 pm | 1.55 pm | 2.00 pm | 2.20 pm",
                    "7 | 2.40 pm | 2.55 pm | 3.00 pm | 3.20 pm",
                    "8 | 3.40 pm | 3.55 pm | 4.00 pm | 4.20 pm",
                    "9 | 4.40 pm | 4.55 pm | 5.00 pm | 5.20 pm",
                    "10 | 6.40 pm | 6.55 pm | 7.00 pm | 7.15 pm",
                    "11 | 8.15 pm | 8.30 pm | 8.35 pm | 8.50 pm",
                    "12 | 9.00 pm | 9.15 pm | 9.20 pm | 9.35 pm",
                ],
            },
            {
                name: "Westlake Homes I",
                stops: ["Westlake Homes"],
                trips: [
                    "1 | 7.00 am (D only) | 7.10 am | 7.30 am (D only)",
                    "2 | 7.30 am (D only) | 7.40 am | 8.00 am",
                    "3 | 9.00 am | 9.15 am | 9.35 am",
                    "4 | 10.00 am | 10.15 am | 10.35 am",
                    "5 | 11.00 am | 11.15 am | 11.35 am",
                    "6 | 12.00 pm | 12.15 pm | 12.30 pm",
                    "7 | 2.00 pm | 2.15 pm | 2.35 pm",
                    "8 | 3.00 pm | 3.15 pm | 3.35 pm",
                    "9 | 4.00 pm | 4.15 pm | 4.35 pm",
                    "10 | 5.00 pm | 5.15 pm | 5.35 pm",
                    "11 | 6.00 pm | 6.15 pm | 6.30 pm",
                ],
            },
            {
                name: "Westlake Homes II",
                stops: ["Westlake Homes"],
                trips: [
                    "1 | 7.00 am (D only) | 7.10 am | 7.30 am",
                    "2 | 8.00 am | 8.15 am | 8.35 am",
                    "3 | 9.15 am | 9.30 am | 9.50 am",
                    "4 | 10.15 am | 10.30 am | 10.50 am",
                    "5 | 11.15 am | 11.30 am | 11.50 am",
                    "6 | 1.15 pm | 1.30 pm | 1.50 pm",
                    "7 | 2.15 pm | 2.30 pm | 2.50 pm",
                    "8 | 3.15 pm | 3.30 pm | 3.50 pm",
                    "9 | 4.15 pm | 4.30 pm | 4.50 pm",
                    "10 | 5.15 pm | 5.30 pm | 5.50 pm",
                    "11 | 6.15 pm | 6.30 pm | 6.45 pm",
                ],
            },
            {
                name: "Westlake Homes III",
                stops: ["Westlake Homes"],
                trips: [
                    "1 | 7.10 am (D only) | 7.20 am | 7.40 am",
                    "2 | 7.55 am | 8.05 am | 8.25 am",
                    "3 | 9.30 am | 9.45 am | 10.05 am",
                    "4 | 10.30 am | 10.45 am | 11.05 am",
                    "5 | 11.30 am | 11.45 am | 12.00 pm",
                    "6 | 12.15 pm | 12.30 pm | 12.45 pm",
                    "7 | 2.30 pm | 2.45 pm | 3.05 pm",
                    "8 | 3.30 pm | 3.45 pm | 4.05 pm",
                    "9 | 4.30 pm | 4.45 pm | 5.05 pm",
                    "10 | 5.30 pm | 5.45 pm | 6.05 pm",
                    "11 | 6.20 pm | 6.35 pm | 6.50 pm",
                ],
            },
        ],
    },
];

const FOOTER = `
- Buses leave from Blocks D, G and N (in that order) and come back via N, G and D. "D only" means Block D only.
- Fare: **RM1.00 per trip**. Tickets from DFN; pay with Touch 'n Go, Boost or eWang.
- Times can change without notice and arrivals depend on traffic. Late bus? Call DGS at 05-468 8888 ext 2214.
`.trim();

// ---------------------------------------------------------------------------
// Parsing and dates
// ---------------------------------------------------------------------------

type Trip = { no: string; notFriday: boolean; times: (string | null)[] };

function parseTrip(row: string): Trip {
    const [rawNo, ...cells] = row.split("|").map((c) => c.trim());
    return {
        no: rawNo.replace("*", ""),
        notFriday: rawNo.startsWith("*"),
        times: cells.map((c) => (c === "-" ? null : c.replace(/(\d)\.(\d\d)/, "$1:$2"))),
    };
}

/** Minutes after midnight for "7:15 am (D only)". */
function minutesOf(time: string): number {
    const m = /(\d{1,2}):(\d\d)\s*(am|pm)/i.exec(time);
    if (!m) return -1;
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    return h * 60 + Number(m[2]);
}

/** Today's date (YYYY-MM-DD), weekday and minutes in Malaysia. */
function malaysiaNow(now: Date) {
    const kl = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return {
        date: kl.toISOString().slice(0, 10),
        weekday: kl.getUTCDay(), // 0 = Sunday
        minutes: kl.getUTCHours() * 60 + kl.getUTCMinutes(),
    };
}

function formatDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The period running today, else the next one, else null (data has run out). */
export function pickPeriod(now: Date, periods: Period[] = PERIODS): { period: Period; upcoming: boolean } | null {
    const today = malaysiaNow(now).date;
    const current = periods.find((p) => p.from <= today && today <= p.to);
    if (current) return { period: current, upcoming: false };
    const next = periods.filter((p) => p.from > today).sort((a, b) => a.from.localeCompare(b.from))[0];
    return next ? { period: next, upcoming: true } : null;
}

// ---------------------------------------------------------------------------
// Understanding the question
// ---------------------------------------------------------------------------

function normalize(text: string): string {
    return String(text || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^\w\s&]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const BUS_WORD = /\b(bus|buses|shuttle|bas)\b/;
// Not timetable questions: the knowledge base answers these.
const NOT_SCHEDULE = /\b(pass|passes|ticket|tickets|fare|fares|price|cost|map|complain|complaint|lost|driver|apply|application|parking)\b/;
const OTHER_CAMPUS = /\b(sungai long|sg long|sl campus|bandar sungai long)\b/;

const STOP_KEYWORDS: [RegExp, Stop][] = [
    [/\bstanford\b/, "Stanford"],
    [/\bmahsuri\b/, "Taman Mahsuri Impian"],
    [/\b(mcdonalds?|mcd|mcds|mekdi)\b/, "McDonald's bus stop"],
    [/\b(champs|elysees|trails|meadow)\b/, "Champs Elysees / The Trails"],
    [/\b(harvard|cambridge)\b/, "Harvard & Cambridge"],
    [/\bwestlake\b/, "Westlake Homes"],
];

const ROMAN: Record<string, string> = { "1": "I", i: "I", "2": "II", ii: "II", "3": "III", iii: "III" };

/** A bus-timetable question about the Kampar campus. */
export function isBusScheduleQuestion(message: string, history: any[] = []): boolean {
    const text = normalize(message);
    if (!text || OTHER_CAMPUS.test(text) || NOT_SCHEDULE.test(text)) return false;
    if (BUS_WORD.test(text)) return true;
    // Follow-up to a bus answer: "what about westlake?", "route 2".
    const lastAnswer = [...(Array.isArray(history) ? history : [])]
        .reverse()
        .find((h) => h?.role === "model" || h?.role === "assistant");
    const lastText = String(lastAnswer?.parts?.map((p: any) => p?.text || "").join(" ") || "");
    const followsBusAnswer = lastText.includes("Kampar campus bus");
    const namesStopOrRoute = STOP_KEYWORDS.some(([re]) => re.test(text)) || /\broute\s*\d{1,2}\b/.test(text) || /^\d{1,2}$/.test(text);
    return followsBusAnswer && namesStopOrRoute;
}

function findRoutes(text: string, routes: Route[]): Route[] {
    // "route 2" refers to the numbered list in the general answer.
    const numbered = /\broute\s*(\d{1,2})\b/.exec(text) || /^(\d{1,2})$/.exec(text);
    if (numbered) {
        const route = routes[Number(numbered[1]) - 1];
        return route ? [route] : [];
    }
    // "westlake homes 2", "westlake ii"
    const westlake = /\bwestlake(?:\s+homes?)?\s+(iii|ii|i|1|2|3)\b/.exec(text);
    if (westlake) return routes.filter((r) => r.name === `Westlake Homes ${ROMAN[westlake[1]]}`);
    return [];
}

function findStop(text: string): Stop | null {
    const hit = STOP_KEYWORDS.find(([re]) => re.test(text));
    return hit ? hit[1] : null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function tripLabel(trip: Trip): string {
    return trip.notFriday ? `${trip.no} (not Fri)` : trip.no;
}

function routeTable(route: Route): string {
    const head = ["Trip", "Leaves UTAR", ...route.stops, "Back at UTAR"];
    const rows = route.trips.map(parseTrip).map((t) => [tripLabel(t), ...t.times.map((x) => x ?? "–")]);
    return [
        `| ${head.join(" | ")} |`,
        `| ${head.map(() => "---").join(" | ")} |`,
        ...rows.map((r) => `| ${r.join(" | ")} |`),
    ].join("\n");
}

function nextDepartureLine(times: { leaves: string; label: string; notFriday: boolean }[], now: Date, period: Period, upcoming: boolean): string {
    const { weekday, minutes } = malaysiaNow(now);
    if (upcoming || weekday === 0 || weekday === 6) return "";
    const next = times.find((t) => minutesOf(t.leaves) > minutes && !(t.notFriday && weekday === 5));
    return next ? `**Next bus from UTAR:** ${next.leaves} (${next.label}).` : "No more buses from UTAR today.";
}

function periodLine(period: Period, upcoming: boolean): string {
    const range = `${formatDate(period.from)} – ${formatDate(period.to)}`;
    const days = period.days ? `, ${period.days}` : "";
    return upcoming
        ? `Today is between schedules. The next one starts on **${formatDate(period.from)}** (${period.label}; ${range}${days}).`
        : `Schedule for **${period.label}** (${range}${days}).`;
}

function nextPeriodLine(period: Period, periods: Period[]): string {
    const next = periods.filter((p) => p.from > period.to).sort((a, b) => a.from.localeCompare(b.from))[0];
    return next ? `From ${formatDate(next.from)} a different schedule applies (${next.label}); ask again after that date or check the official page.` : "";
}

function links(period: Period): string {
    return `### 🔗 Official Links\n\n- [Schedule PDF](${period.pdfUrl})\n- [DGS Kampar bus services](${BUS_PAGE_URL})`;
}

/**
 * Markdown answer for a Kampar bus-timetable question, or null when the
 * message is not one (the normal pipeline then answers it).
 */
export function tryBusScheduleReply(message: string, history: any[] = [], now: Date = new Date(), periods: Period[] = PERIODS): string | null {
    if (!isBusScheduleQuestion(message, history)) return null;

    const picked = pickPeriod(now, periods);
    if (!picked) {
        return [
            "I don't have the current Kampar campus bus schedule yet. The timetable changes every few weeks, so please check the official page for the latest version.",
            `- [DGS Kampar bus services](${BUS_PAGE_URL})`,
        ].join("\n\n");
    }
    const { period, upcoming } = picked;
    const text = normalize(message);
    const routes = findRoutes(text, period.routes);
    const stop = routes.length ? null : findStop(text);
    const parts: string[] = [];

    if (routes.length) {
        const route = routes[0];
        parts.push(periodLine(period, upcoming));
        const trips = route.trips.map(parseTrip).filter((t) => t.times[0]);
        const next = nextDepartureLine(trips.map((t) => ({ leaves: t.times[0]!, label: `trip ${t.no}`, notFriday: t.notFriday })), now, period, upcoming);
        if (next) parts.push(next);
        parts.push(`### 🚌 Kampar campus bus: ${route.name}`, routeTable(route));
        if (route.notes) parts.push(route.notes.join(" "));
    } else if (stop) {
        // Every bus that serves this stop, across routes, sorted by time.
        const rows = period.routes.flatMap((route) => {
            const col = route.stops.indexOf(stop);
            if (col < 0) return [];
            return route.trips.map(parseTrip).flatMap((t) => {
                const atStop = t.times[col + 1];
                if (!atStop) return [];
                return [{ leaves: t.times[0]!, atStop, back: t.times[t.times.length - 1] ?? "–", route: route.name, notFriday: t.notFriday }];
            });
        }).sort((a, b) => minutesOf(a.leaves) - minutesOf(b.leaves));

        parts.push(periodLine(period, upcoming));
        const next = nextDepartureLine(rows.map((r) => ({ leaves: r.leaves, label: r.route, notFriday: r.notFriday })), now, period, upcoming);
        if (next) parts.push(next);
        parts.push(`### 🚌 Kampar campus bus to ${stop}`);
        parts.push(
            [
                `| Leaves UTAR | At ${stop} | Back at UTAR | Route |`,
                "| --- | --- | --- | --- |",
                ...rows.map((r) => `| ${r.leaves}${r.notFriday ? " (not Fri)" : ""} | ${r.atStop} | ${r.back} | ${r.route} |`),
            ].join("\n")
        );
        if (stop === "Champs Elysees / The Trails") parts.push("Meadow Park residents can walk to The Trails bus stop.");
    } else {
        parts.push(periodLine(period, upcoming), `### 🚌 Kampar campus bus routes`);
        parts.push(
            period.routes
                .map((route, i) => {
                    const trips = route.trips.map(parseTrip);
                    return `${i + 1}. **${route.name}**: ${trips.length} trips, first bus ${trips[0].times[0]}, last bus ${trips[trips.length - 1].times[0]}`;
                })
                .join("\n")
        );
        parts.push(`Tell me your stop (e.g. "bus to Westlake Homes") or a route number (e.g. "route 2") and I'll show the full timetable.`);
    }

    const after = nextPeriodLine(period, periods);
    parts.push("### ℹ️ Good to know");
    if (after) parts.push(after);
    parts.push(FOOTER, links(period));
    return parts.join("\n\n");
}
