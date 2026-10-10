import { test } from "node:test";
import assert from "node:assert/strict";

const { PORTAL_SECTIONS, sectionLinks, menuKeys, portalKey, formsIndex } = await import("./portal.ts");

const section = (id: string) => PORTAL_SECTIONS.find((s: any) => s.id === id)!;

const MENU_HTML = `
<a href="https://portal.utar.edu.my/stuIntranet/studentFeedback/index.jsp">Student Feedback</a>
<a href="announcement/index.jsp">Announcements</a>
<a href="examination/DEAS981625.pdf">FAQs on Physical Final Examination (Students) (25.06.2026)</a>
<a href="examination/examTimetable/index.jsp?status=M">Main Examination Timetable</a>
<a href="../pointerAT.jsp?reqView=NOR">Final Examination Result</a>
<a href="https://forms.cloud.microsoft/r/sHqAWQdyMj">UTAR Internal Scholarships Online Application</a>
<a href="javascript:navLink('/intranetLogout.jsp')">Logout</a>`;

test("the examination section takes only the exam PDFs from the menu, never results or timetables", () => {
    const { documents } = sectionLinks(section("examination"), MENU_HTML, new Set());
    assert.deepEqual(documents, [
        { title: "FAQs on Physical Final Examination (Students) (25.06.2026)", url: "https://portal.utar.edu.my/stuIntranet/examination/DEAS981625.pdf" },
    ]);
});

test("a section's own documents are kept and the repeated menu is dropped", () => {
    const menu = menuKeys(MENU_HTML);
    const html = `${MENU_HTML}
      <a href="/stuIntranet/2021/Rule_I_20210914.pdf">Admission into the University</a>
      <a href="http://portal.utar.edu.my/stuIntranet/RGO551041.pdf">Abolishment of Supplementary Examinations</a>
      <a href="https://evil.example/x.pdf">Elsewhere</a>
      <a href="https://forms.gle/abc">Apply now</a>`;
    const { documents } = sectionLinks(section("regulations"), html, menu);
    assert.deepEqual(documents.map((d: any) => d.title), ["Admission into the University", "Abolishment of Supplementary Examinations"]);
    assert.equal(documents[1].url, "https://portal.utar.edu.my/stuIntranet/RGO551041.pdf");
});

test("forms are listed separately, and guidelines go to the right department", () => {
    const html = `<a href="/stuIntranet/pdf/ITISC713935.pdf">Policy On Excessive Use of Campus Internet</a>
      <a href="/stuIntranet/pdf/QP-IPSR-PSU-021.pdf">QP-IPSR-PSU-021 Application for Field Trip</a>
      <a href="/stuIntranet/zip/Clubs_and_Societies_Forms_and_Guidelines_20200107.zip">DSA Clubs and Societies Forms and Guidelines</a>
      <a href="/stuIntranet/pdf/Labotory_Staff.pdf">General Laboratory Guidelines</a>`;
    const s = section("guidelines");
    const { documents, forms } = sectionLinks(s, html, new Set());
    assert.deepEqual(documents.map((d: any) => s.unitsFor(d)), [["itisc"], ["ipsr"], ["general"]]);
    assert.equal(forms.length, 1);
    assert.deepEqual(s.unitsFor(forms[0]), ["dsa-kampar", "dsa-sungai-long"]);
    assert.match(formsIndex(s, forms, "2026-10-10"), /^- UTAR Guidelines · Form: DSA Clubs and Societies Forms and Guidelines \(Clubs_and_Societies_Forms_and_Guidelines_20200107\.zip\)$/m);
});

test("keys are stable per department and ignore query strings", () => {
    assert.equal(portalKey("https://portal.utar.edu.my/stuIntranet/RGO551041.pdf?x=1", "registrar"), "portal:registrar:portal.utar.edu.my/stuIntranet/RGO551041.pdf");
});

const { parseSelectPairs, parseStructureList, keepStructures, isPersonalStructure, intakeOf, structureToMarkdown } = await import("./portal.ts");

test("drop-down responses and the structure list are parsed", () => {
    assert.deepEqual(parseSelectPairs(`var _keys=[\n["","--"]\n,\n["C","FICT"]\n,\n["E","LKC FES"]\n];`), [["C", "FICT"], ["E", "LKC FES"]]);
    const list = `<table class="tbldata"><TR class="sub2header"><TD><strong>No</strong></TD><TD>Structure Code</TD><TD>Full / Part Time</TD><TD>Total Credit</TD><TD>Description</TD></TR>
      <tr><td>1</td><td><a href="viewStructure.jsp?reqLevel=B&amp;reqFaculty=C&amp;reqCourse=CS&amp;reqCode=UCCS261001&amp;reqPartcd=F">UCCS261001</a></td><td>Full Time</td><td>124.0</td><td>BACHELOR OF COMPUTER SCIENCE (HONOURS) 202610 intake</td></tr></table>`;
    assert.deepEqual(parseStructureList(list), [
        {
            code: "UCCS261001",
            mode: "Full Time",
            credits: "124.0",
            description: "BACHELOR OF COMPUTER SCIENCE (HONOURS) 202610 intake",
            url: "https://portal.utar.edu.my/stuIntranet/courseStructure/viewStructure.jsp?reqLevel=B&reqFaculty=C&reqCourse=CS&reqCode=UCCS261001&reqPartcd=F",
        },
    ]);
});

test("only recent structures are kept, and never ones made for one student", () => {
    const row = (code: string, description: string) => ({ code, mode: "Full Time", credits: "124", description, url: code });
    const rows = [
        row("UCCS221002", "BACHELOR OF COMPUTER SCIENCE (HONOURS) 202210 intake - Davin Cheong [2106814]"),
        row("UICS060101", "BACHELOR OF COMPUTER SCIENCE (HONS) (WONG YEN WEE 06UCB01381)"),
        row("UICS040501", "BACHELOR OF COMPUTER SCIENCE (HONS) (THINESKUMAR A/L ASOKOKUMARA, 04UCB03545)"),
        row("UCCS231001", "BACHELOR OF COMPUTER SCIENCE (HONOURS) 202310 intake"),
        row("UCCS261001", "BACHELOR OF COMPUTER SCIENCE (HONOURS) 202610 intake"),
        row("UCCS270101", "BACHELOR OF COMPUTER SCIENCE (HONOURS) 202701 intake"),
        row("ULCS090501", "BACHELOR OF COMPUTER SCIENCE (HONS) 200905 Intake"),
        row("UFCS250601", "Bachelor of Computer Science (Honours) - June 2025 Intake"),
    ];
    for (const r of rows.slice(0, 3)) assert.equal(isPersonalStructure(r.description), true, r.description);
    for (const r of rows.slice(3)) assert.equal(isPersonalStructure(r.description), false, r.description);
    for (const d of [
        "BACHELOR OF INFORMATION SYSTEMS (HONOURS) (BUSINESS INFORMATION SYSTEMS) 202610 intake",
        "BACHELOR OF COMPUTER SCIENCE (HONOURS) 202101 Intake - EXPERIENTIAL CAMP",
        "Part Time Bachelor of Computer Science (Hons) -Oct 2021",
    ]) {
        assert.equal(isPersonalStructure(d), false, d);
    }
    assert.deepEqual(intakeOf("UCCS261001"), { year: 2026, month: 10 });
    assert.deepEqual(keepStructures(rows, new Date("2026-10-10T00:00:00Z")).map((r: any) => r.code), ["UCCS270101", "UCCS261001", "UFCS250601", "UCCS231001"]);
});

test("a structure page becomes one line per course with its trimester", () => {
    const html = `<tr class="" > <td colspan="3" class="year">Year 1</td> </tr>
      <table width="100%" class="tbl"><tr><td colspan="4" class="header"><strong>Year 1 Trimester 1</strong></td></tr>
      <tr><td align="left"><a href="#" onClick=javascript:window.open('getSyllabus.jsp?fcode=UCCS261001&funits=UCCD1004')>UCCD1004</a></td><td align="left">PROGRAMMING CONCEPTS AND PRACTICES</td><td>Core</td><td>4.0</td></tr>
      <tr><td align="left"><a href="#">UBMM1011</a></td><td align="left">SUN ZI&#39;S ART OF WAR AND BUSINESS STRATEGIES</td><td>Free Modules</td><td>1.0</td></tr>
      <tr><td colspan="3" align="right"><b>Total Credit Hours&nbsp;</b></td> <td><b>5.0</b></td></tr></table>`;
    assert.equal(
        structureToMarkdown(html, "CS 202610 (FT)"),
        [
            "#### Year 1 Trimester 1",
            "- CS 202610 (FT) · Year 1 Trimester 1: UCCD1004 PROGRAMMING CONCEPTS AND PRACTICES (Core, 4.0 credits)",
            "- CS 202610 (FT) · Year 1 Trimester 1: UBMM1011 SUN ZI'S ART OF WAR AND BUSINESS STRATEGIES (Free Modules, 1.0 credits)",
            "- CS 202610 (FT) · Year 1 Trimester 1: total 5.0 credit hours",
        ].join("\n")
    );
});

const { parseAnnouncementList, recentAnnouncements, announcementContent, unitForDept } = await import("./portal.ts");

test("announcements: list, last 90 days, department store", () => {
    const list = `<table><tr><td><input name="tick"></td><td>09/10/2026</td><td><a href="https://portal.utar.edu.my/stuIntranet/announcement/annDetail.jsp?fid=46695">October 2026 Trimester Buggy Schedule</a></td><td>DGS-KPR</td></tr>
      <tr><td><input name="tick"></td><td>14/07/2010</td><td><a href="annDetail.jsp?fid=1673">Chaining / Clamping Of Vehicles</a></td><td>RGO</td></tr></table>`;
    const all = parseAnnouncementList(list);
    assert.deepEqual(all.map((a: any) => [a.date, a.dept, a.id]), [["2026-10-09", "DGS-KPR", "46695"], ["2010-07-14", "RGO", "1673"]]);
    assert.deepEqual(recentAnnouncements(all, new Date("2026-10-10T00:00:00Z")).map((a: any) => a.id), ["46695"]);
    const units = new Set(["dgs-kampar", "library", "registrar", "general", "fam"]);
    assert.equal(unitForDept("DGS-KPR", units), "dgs-kampar");
    assert.equal(unitForDept("FAM", units), "fam");
    assert.equal(unitForDept("XYZ", units), "general");
});

test("announcement content never includes the signed-in person's name", () => {
    const html = `<div class="breadcrumb"><H3> Aun Yichiet (17057) aunyc@utar.edu.my</H3></div>
      <div id="pagecontent"><H1>Announcement Details</H1> <!-- Add Content Here -->
      <div class="goback"><a href="https://portal.utar.edu.my/stuIntranet/announcement/index.jsp">&laquo; Back</a></div>
      <div class="title"> October 2026 Trimester Buggy Schedule</div>
      <p><a href="https://web2.utar.edu.my/portal/ictService/upload/2026/10/DGS-KPR984092.pdf">Buggy 1 Schedule.pdf</a></p>
      <p>Pickup points are near Block D.</p> <!-- End Content Here --> </div>`;
    const { text, attachments } = announcementContent(html);
    assert.doesNotMatch(text, /Aun|17057|aunyc|Back/);
    assert.match(text, /October 2026 Trimester Buggy Schedule/);
    assert.match(text, /Pickup points are near Block D\./);
    assert.deepEqual(attachments.map((a: any) => a.url), ["https://web2.utar.edu.my/portal/ictService/upload/2026/10/DGS-KPR984092.pdf"]);
    assert.deepEqual(announcementContent("<html>no markers here, Aun Yichiet</html>"), { text: "", attachments: [] });
});

test("the intranet's unquoted links and marker spacing are handled", () => {
    const list = `<table><tr > <td><input type="checkbox" name="tick" value="46712"></th> <td>09/10/2026</td> <td><A target="_self" href="https://portal.utar.edu.my/stuIntranet/announcement/annDetail.jsp?fid=46712"><a href=http://www2.utar.edu.my/media/Announcement/2026/LIB984141.pdf target=_blank> Library Maintenance Works at Kampar Library </a></a></td> <td>LIB</td> </table>`;
    const [a] = parseAnnouncementList(list);
    assert.equal(a.title, "Library Maintenance Works at Kampar Library");
    assert.equal(a.pdf, "https://www2.utar.edu.my/media/Announcement/2026/LIB984141.pdf");
    const detail = `<H3>Aun Yichiet (17057)</H3><!--  Add Content Here --> <div class="title"> <a href=http://www2.utar.edu.my/media/Announcement/2026/LIB984141.pdf target=_blank> Library Maintenance Works </a></div> <!-- End Content Here -->`;
    const { text, attachments } = announcementContent(detail);
    assert.equal(text, "Library Maintenance Works");
    assert.equal(attachments[0].url, "https://www2.utar.edu.my/media/Announcement/2026/LIB984141.pdf");
});
