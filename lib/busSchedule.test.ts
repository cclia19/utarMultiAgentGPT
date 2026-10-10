import { test } from "node:test";
import assert from "node:assert/strict";

const { tryBusScheduleReply, isBusScheduleQuestion, pickPeriod, PERIODS, BUS_PAGE_URL } = await import("./busSchedule.ts");

// Malaysia is UTC+8: 03:00Z is 11:00 in Kampar.
const SAT_10_OCT = new Date("2026-10-10T04:00:00Z");
const WED_14_OCT_11AM = new Date("2026-10-14T03:00:00Z");
const FRI_30_OCT_1130 = new Date("2026-10-30T03:30:00Z");
const AFTER_DATA = new Date("2026-12-20T03:00:00Z");

const toMinutes = (t: string) => {
    const m = /(\d{1,2})\.(\d\d)\s*(am|pm)/.exec(t)!;
    return (Number(m[1]) % 12 + (m[3] === "pm" ? 12 : 0)) * 60 + Number(m[2]);
};

test("every trip row has one cell per stop and times that run forward", () => {
    for (const period of PERIODS) {
        assert.ok(period.from <= period.to, period.label);
        for (const route of period.routes) {
            let lastLeave = -1;
            for (const row of route.trips) {
                const [no, ...cells] = row.split("|").map((c: string) => c.trim());
                assert.match(no, /^\*?\d{1,2}$/, `${route.name}: ${row}`);
                assert.equal(cells.length, route.stops.length + 2, `${route.name}: ${row}`);
                const times = cells.filter((c: string) => c !== "-").map(toMinutes);
                assert.ok(times.every((t: number) => t >= 0), `${route.name}: ${row}`);
                for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], `${route.name}: ${row}`);
                assert.ok(times[0] > lastLeave, `${route.name}: departures out of order at ${row}`);
                lastLeave = times[0];
            }
        }
    }
});

test("the schedule shown follows today's date in Malaysia", () => {
    assert.deepEqual(pickPeriod(SAT_10_OCT)?.upcoming, true);
    assert.equal(pickPeriod(SAT_10_OCT)?.period.from, "2026-10-12");
    assert.equal(pickPeriod(WED_14_OCT_11AM)?.period.from, "2026-10-12");
    assert.equal(pickPeriod(new Date("2026-10-25T04:00:00Z"))?.period.from, "2026-10-26");
    assert.equal(pickPeriod(FRI_30_OCT_1130)?.period.from, "2026-10-26");
    // 23 Oct 23:30 in Kampar is still the first period although it is 15:30Z.
    assert.equal(pickPeriod(new Date("2026-10-23T15:30:00Z"))?.period.from, "2026-10-12");
    assert.equal(pickPeriod(AFTER_DATA), null);
});

test("a general question lists the routes", () => {
    const reply = tryBusScheduleReply("bus schedule", [], WED_14_OCT_11AM)!;
    assert.match(reply, /Kampar campus bus routes/);
    assert.match(reply, /1\. \*\*Stanford, Taman Mahsuri Impian & McDonald's\*\*/);
    assert.match(reply, /Westlake Homes II/);
    assert.match(reply, /RM1\.00 per trip/);
});

test("a stop gets one table of every bus serving it, sorted, with the next bus", () => {
    const reply = tryBusScheduleReply("what time is the bus to westlake?", [], WED_14_OCT_11AM)!;
    assert.match(reply, /\| Leaves UTAR \| At Westlake Homes \| Back at UTAR \| Route \|/);
    assert.match(reply, /\*\*Next bus from UTAR:\*\* 11:15 am \(Westlake Homes II\)/);
    assert.ok(reply.indexOf("| 7:00 am (D only)") < reply.indexOf("| 6:30 pm"));
    assert.doesNotMatch(reply, /Harvard & Cambridge \|/);
});

test("Friday skips the trips that do not run on Fridays", () => {
    // 11:30 on Friday: trip 6 of Harvard & Cambridge and Westlake Homes (1:40 pm) is not on Fridays.
    const reply = tryBusScheduleReply("bus to harvard", [], FRI_30_OCT_1130)!;
    assert.match(reply, /teaching weeks/);
    assert.match(reply, /\*\*Next bus from UTAR:\*\* 11:40 am/);
    const fri = tryBusScheduleReply("bus to harvard", [], new Date("2026-10-30T04:15:00Z"))!; // 12:15
    assert.match(fri, /\*\*Next bus from UTAR:\*\* 2:20 pm \(Harvard & Cambridge\)/);
});

test("a named route gets its own table", () => {
    const reply = tryBusScheduleReply("westlake homes 2 bus", [], WED_14_OCT_11AM)!;
    assert.match(reply, /Kampar campus bus: Westlake Homes II/);
    assert.match(reply, /\| Trip \| Leaves UTAR \| Westlake Homes \| Back at UTAR \|/);
    assert.match(reply, /\| 6 \(not Fri\) \| 1:15 pm \| 1:30 pm \| 1:50 pm \|/);
});

test("follow-ups after a bus answer work without saying 'bus'", () => {
    const first = tryBusScheduleReply("bus schedule", [], WED_14_OCT_11AM)!;
    const history = [
        { role: "user", parts: [{ text: "bus schedule" }] },
        { role: "model", parts: [{ text: first }] },
        { role: "user", parts: [{ text: "route 2" }] },
    ];
    assert.match(tryBusScheduleReply("route 2", history, WED_14_OCT_11AM)!, /Taman Mahsuri Impian, Champs Elysees & The Trails/);
    assert.match(tryBusScheduleReply("what about stanford?", history, WED_14_OCT_11AM)!, /bus to Stanford/);
    // Without a bus answer before it, "route 2" is not a bus question.
    assert.equal(tryBusScheduleReply("route 2", [], WED_14_OCT_11AM), null);
});

test("between schedules, the next one is shown with its start date", () => {
    const reply = tryBusScheduleReply("bus schedule", [], SAT_10_OCT)!;
    assert.match(reply, /Today is between schedules\. The next one starts on \*\*Mon, 12 Oct 2026\*\*/);
    assert.doesNotMatch(reply, /Next bus from UTAR/);
});

test("after the last schedule ends, no old times are shown", () => {
    const reply = tryBusScheduleReply("bus schedule", [], AFTER_DATA)!;
    assert.match(reply, /don't have the current Kampar campus bus schedule/);
    assert.ok(reply.includes(BUS_PAGE_URL));
    assert.doesNotMatch(reply, /\d:\d\d [ap]m/);
});

test("bus passes, fares, other campuses and non-bus questions go to the normal pipeline", () => {
    for (const q of [
        "how do I buy a bus pass",
        "bus ticket price",
        "is there a bus in Sungai Long campus",
        "where is the bus route map",
        "I want to complain about the bus driver",
        "where is Westlake Homes",
        "how to get to stanford",
    ]) {
        assert.equal(isBusScheduleQuestion(q), false, q);
    }
});
