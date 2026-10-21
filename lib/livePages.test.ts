import { test } from "node:test";
import assert from "node:assert/strict";

const { livePagesFor, isInternshipQuestion, formatLiveEvidence, LIVE_PAGES } = await import("./livePages.ts");
const ids = (q: string) => livePagesFor(q).map((p) => p.id);

test("library hours questions read the live opening-hours page", () => {
    for (const q of ["What are the library opening hours?", "Is the library open on Saturday?", "library hours kampar", "Pukul berapa perpustakaan dibuka?", "图书馆几点开？"]) {
        assert.deepEqual(ids(q), ["library-hours"], q);
    }
    assert.deepEqual(ids("How do I borrow a book from the library?"), [], "not about hours");
});

test("postgraduate fee questions read the official IPSR fee page", () => {
    for (const q of ["What is the tuition fee for the Master in Data Science?", "How much is a PhD at UTAR?", "Berapa yuran sarjana?", "硕士学费多少？"]) {
        assert.deepEqual(ids(q), ["postgraduate-fees"], q);
    }
    assert.deepEqual(ids("How much is the Computer Science fee?"), [], "undergraduate fee: not this page");
});

test("internship questions read the industrial training portal", () => {
    for (const q of ["How do I apply for industrial training?", "internship for FICT students", "latihan industri", "实习怎么申请"]) {
        assert.equal(isInternshipQuestion(q), true, q);
        assert.deepEqual(ids(q), ["industrial-training"], q);
    }
    assert.equal(isInternshipQuestion("When does the trimester start?"), false);
});

test("evidence names the page, today's date and how to use it", () => {
    const page = LIVE_PAGES.find((p) => p.id === "library-hours")!;
    const text = formatLiveEvidence([{ page, title: "Library Opening Hours", url: page.urls[0], text: "Main Library Kampar Campus 8:00 am - 9:00 pm" }], "2026-10-21");
    assert.match(text, /read live today \(2026-10-21\)/);
    assert.match(text, /Mary KUOK Pick Hoo Library is on the Sungai Long Campus/);
    assert.equal(formatLiveEvidence([], "2026-10-21"), "");
});
