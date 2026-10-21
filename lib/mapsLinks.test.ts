import { test } from "node:test";
import assert from "node:assert/strict";

const { normalizeMapsLinks, mapsSearchUrl, MAPS_LABEL } = await import("./mapsLinks.ts");
const { isMapsSearchLink } = await import("./answerGaps.ts");

test("the broken DSA link from 21 Oct 2026 becomes one clean link", () => {
    const broken =
        "- **Time:** 8:30 am - 5:30 pm (Monday - Friday) [📍 Open in Google Maps](https://www.google.com/maps/search/?api=1&query=Room+KB006,+Ground+Floor,+available information+Block,+Jalan+Sungai+Long,+Bandar+Sungai+Long,+Cheras,+43000+Kajang,+Selangor+UTAR+Sungai+Long+Campus)";
    const fixed = normalizeMapsLinks(broken);
    const links = [...fixed.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    assert.equal(links.length, 1);
    assert.equal(links[0][1], MAPS_LABEL);
    assert.equal(/\s/.test(links[0][2]), false, "no spaces in the URL");
    assert.equal(isMapsSearchLink(links[0][2]), true);
    assert.match(fixed, /^- \*\*Time:\*\* 8:30 am - 5:30 pm \(Monday - Friday\) \[📍/);
});

test("well-formed, split and bare Maps links are all normalised", () => {
    const ok = "[📍 Open in Google Maps](https://www.google.com/maps/search/?api=1&query=Block+N+UTAR+Kampar+Campus)";
    assert.equal(normalizeMapsLinks(ok), `[${MAPS_LABEL}](https://www.google.com/maps/search/?api=1&query=Block+N+UTAR+Kampar+Campus)`);
    const split = "[📍 Open in Google Maps]\n(https://www.google.com/maps/search/?api=1&query=Yau+Kee+Restaurant+Kampar)";
    assert.equal(normalizeMapsLinks(split), `[${MAPS_LABEL}](https://www.google.com/maps/search/?api=1&query=Yau+Kee+Restaurant+Kampar)`);
    const bare = "Find it here: https://www.google.com/maps/search/?api=1&query=Restoran+Maha+Maju+Kampar today";
    assert.equal(normalizeMapsLinks(bare), `Find it here: [${MAPS_LABEL}](https://www.google.com/maps/search/?api=1&query=Restoran+Maha+Maju+Kampar) today`);
});

test("place names are encoded safely and kept short", () => {
    assert.equal(mapsSearchUrl("Heritage Hall (Block A), UTAR Kampar"), "https://www.google.com/maps/search/?api=1&query=Heritage+Hall+(Block+A)%2C+UTAR+Kampar");
    assert.ok((mapsSearchUrl("x".repeat(500)) || "").length < 220);
    assert.equal(mapsSearchUrl("   "), null);
    assert.equal(normalizeMapsLinks("Other links stay: [UTAR](https://www.utar.edu.my)"), "Other links stay: [UTAR](https://www.utar.edu.my)");
});

test("long queries are cut at a word boundary", () => {
    const url = mapsSearchUrl("Room KB006, Ground Floor, Block KB, Jalan Sungai Long, Bandar Sungai Long, Cheras, 43000 Kajang, Selangor UTAR Sungai Long Campus extra words here")!;
    const q = decodeURIComponent(url.split("query=")[1].replace(/\+/g, " "));
    assert.ok(q.length <= 140, q);
    const words = "Room KB006, Ground Floor, Block KB, Jalan Sungai Long, Bandar Sungai Long, Cheras, 43000 Kajang, Selangor UTAR Sungai Long Campus extra words here".split(/[\s,]+/);
    assert.ok(words.includes(q.split(/[\s,]+/).pop()!), `ends on a whole word: ${q}`);
});
