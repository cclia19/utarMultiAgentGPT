import { test } from "node:test";
import assert from "node:assert/strict";

const { isPersonalTitle, studentIds, personalDataReason } = await import("./personalData.ts");

test("announcement titles that name lists of students are caught", () => {
    for (const t of [
        "FINAL BAR LIST FOR JUNE 2026 TRIMESTER (FOUNDATION PROGRAMME - KAMPAR CAMPUS)",
        "FCS JUNE 2026 TRIMESTER BARLIST- SL CAMPUS",
        "THP FBF pending BK(A) list",
        "NOTIFICATION OF MBB01 FIRST PROFESSIONAL EXAMINATION RESULT - (MS)",
        "MUET Session 2, 2026 Result Announcement",
        "MUET EXAMINATION SLIP (SESSION 3) 2026",
        "Student E-Authorisation Slip (September 2026 Examination) - Foundation Programme",
        "Student Verification Exercise - Joined 202610",
        "ANNOUNCEMENT ON DISCIPLINARY ACTION TAKEN AGAINST STUDENTS FOR CONTRAVENING EXAMINATION REGULATIONS",
        "Outcome of Appeal Course Review for September 2026 First Professional Examination Result",
        "NOTICE - Uncollected Vehicle Stickers (UTAR - Kampar & Sungai Long Campus)",
        "Announcement on MUET Written Test Venue (SESSION 3 2026)",
        "UNDERGRADUATE OCTOBER 2026 INTAKE STUDENTS WHO PROCEED FROM UTAR FOUNDATION PROGRAMME",
    ]) {
        assert.equal(isPersonalTitle(t), true, t);
    }
    for (const t of [
        "Library Opening Hours for Trimester Break (7 - 25 October 2026)",
        "October 2026 Trimester Buggy Schedule, poster and pickup points",
        "PTPTN Application for October/November 2026 Trimester",
        "Postponement of MUET Speaking Test (SESSION 3 2026)",
        "September 2026 Examination Timetable for Foundation and Undergraduate Programmes",
        "Study Tour to Dongseo University (4-11 January 2027)",
    ]) {
        assert.equal(isPersonalTitle(t), false, t);
    }
});

test("several student IDs in the text mark it as personal, whatever the title", () => {
    const list = "No Name ID\n1 TAN AH KOW 2106814\n2 LIM MEI LING 2203117\n3 KUMAR A/L RAJ 2301559\n4 WONG 06UCB01381";
    assert.deepEqual(studentIds(list).sort(), ["06UCB01381", "2106814", "2203117", "2301559"]);
    assert.match(personalDataReason("Pre-registration of courses", list)!, /contains 4 student IDs/);
    // Phone numbers, dates and course codes are not student IDs.
    assert.equal(personalDataReason("Contact", "Call 05-468 8888 ext 2214 or 03-9086 0288. UCCD1004, 20261012, RM55,100."), null);
    // Split by PDF text extraction.
    assert.match(personalDataReason("x", "TAN 21068 14\nLIM 22031 17\nKUMAR 2301 559")!, /contains 3 student IDs/);
    // One or two IDs (e.g. a contact person) are allowed.
    assert.equal(personalDataReason("Contact", "Enquiries: staff no. 2106814"), null);
});
