import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const { findPerson, PEOPLE } = await import("./people.ts");

test("every profile photo exists in public/", () => {
    for (const p of PEOPLE) assert.ok(existsSync(new URL(`../public${p.photo}`, import.meta.url)), p.photo);
});

test("a question about the person shows their tile", () => {
    assert.equal(findPerson("who is avo", "")?.photo, "/people/aun-yichiet.jpg");
    assert.equal(findPerson("Who is Aun Yichiet?", "")?.photo, "/people/aun-yichiet.jpg");
    assert.equal(findPerson("who is prof choong", "")?.photo, "/people/choong-chee-keong.jpg");
    assert.equal(findPerson("who is the VP for student development?", "Prof. Dr Choong Chee Keong is the Vice President (Student Development and Alumni Relations).")?.name, "Prof. Dr Choong Chee Keong");
});

test("no tile for unrelated answers or lists of several people", () => {
    assert.equal(findPerson("when does the trimester start", "It starts on 26 October."), null);
    assert.equal(findPerson("where can I buy avocado", "Try the cafeteria."), null);
    assert.equal(findPerson("list the vice presidents", "Prof. Dr Choong Chee Keong … and Aun Yichiet (avo) …"), null);
});

test("the President and Vice Presidents get their tiles", () => {
    assert.equal(findPerson("who is the UTAR president?", "The President and CEO of UTAR is Ir. Prof. Dato' Dr. Ewe Hong Tat.")?.photo, "/people/ewe-hong-tat.jpg");
    assert.equal(findPerson("who is prof ewe", "")?.photo, "/people/ewe-hong-tat.jpg");
    assert.equal(findPerson("prof goi", "")?.photo, "/people/goi-bok-min.jpg");
    assert.equal(findPerson("who is prof zuridah", "")?.photo, "/people/zuraidah-abd-manaf.jpg");
    assert.equal(findPerson("who handles research at UTAR?", "Professor Dr. Zuraidah Binti Abd Manaf is the VP (RDC).")?.title, "Vice President (Research, Development and Commercialisation)");
});
