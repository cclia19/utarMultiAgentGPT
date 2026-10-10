/**
 * Pre-launch question set for scripts/prelaunch-check.mjs.
 *
 * Realistic student questions across every department, both campuses,
 * Malay/Chinese, follow-ups and edge cases. Most cases only get the automatic
 * format checks (lib/answerLint.ts); add `mustMatch` only for facts you have
 * verified on an official page.
 *
 * Fields:
 *   ask            string, or an array of turns for a follow-up conversation
 *   agents         acceptable agent ids for the LAST turn (optional)
 *   clarifyOk      true when asking a follow-up question is the right reply
 *   mustMatch      regexes the last answer must contain
 *   mustNotMatch   regexes the last answer must not contain
 */
export const QUESTIONS = [
    // --- General / university ---
    { id: "gen-location", ask: "Where is UTAR Kampar campus located?" },
    { id: "gen-president", ask: "Who is the President of UTAR?" },
    { id: "gen-faculties", ask: "What faculties does UTAR have?" },
    { id: "gen-mqa", ask: "Is UTAR recognised by MQA?" },
    { id: "gen-public-private", ask: "Is UTAR a private or public university?" },

    // --- Registrar / records ---
    { id: "reg-loa", ask: "How do I apply for leave of absence?" },
    { id: "reg-withdraw", ask: "How do I withdraw from UTAR?" },
    { id: "reg-transcript", ask: "How do I get a certified true copy of my transcript?" },
    { id: "reg-change-programme", ask: "Can I change my programme after I enrol?" },
    { id: "reg-id-card", ask: "I lost my student ID card. How do I get a new one?" },

    // --- Finance ---
    { id: "dfn-deadline", ask: "When is the fee payment deadline for the October 2026 trimester?" },
    { id: "dfn-methods", ask: "What payment methods can I use to pay tuition fees?" },
    { id: "dfn-late", ask: "Is there a penalty for paying fees late?" },
    { id: "dfn-instalment", ask: "Can I pay my fees by instalment?" },
    { id: "dfn-fee-accounting", ask: "How much is the tuition fee for Bachelor of Accounting?" },
    { id: "dfn-followup-intl", ask: ["What is the tuition fee for Bachelor of Computer Science?", "what about for international students?"] },

    // --- Examinations ---
    { id: "deas-supp", ask: "How do I apply for a supplementary exam?" },
    { id: "deas-results", ask: "When will the final exam results be released?" },
    { id: "deas-appeal", ask: "How do I appeal my exam result?" },
    { id: "deas-missed", ask: "What happens if I miss a final exam because I was sick?" },
    { id: "deas-cgpa-grad", ask: "What is the minimum CGPA to graduate?" },
    { id: "deas-cgpa-calc", ask: "How is CGPA calculated?", agents: ["deas"] },
    { id: "deas-supp-ms", ask: "Macam mana nak mohon peperiksaan tambahan?" },

    // --- Admissions and calendar (DACE) ---
    { id: "dace-oct-start", ask: "When does the October 2026 trimester start?", agents: ["dace"], mustMatch: [/postgraduate/i, /foundation/i, /undergraduate/i], mustNotMatch: [/(february|june) intake/i] },
    { id: "dace-sl-ug", ask: "When do undergraduate classes start in Sungai Long this October?", agents: ["dace"], mustMatch: [/27 October 2026|October 27, 2026/i] },
    { id: "dace-mbbs-start", ask: "When does MBBS start in October 2026?", agents: ["dace"], mustMatch: [/2 November 2026|November 2, 2026/i] },
    { id: "dace-next-intake-pg", ask: "When is the next postgraduate intake?" },
    { id: "dace-foundation-req", ask: "What are the entry requirements for Foundation in Science?" },
    { id: "dace-spm", ask: "Can I apply for a degree with only SPM results?" },
    { id: "dace-credit-transfer", ask: "How do I apply for credit transfer?" },
    { id: "dace-followup-mbbs", ask: ["When does the October 2026 trimester start?", "and for nursing?"], mustMatch: [/27 October 2026|October 27, 2026/i] },
    { id: "dace-zh", ask: "十月开学日期是什么时候？" },

    // --- Scholarships and loans ---
    { id: "sch-available", ask: "What scholarships are available for undergraduates?" },
    { id: "sch-apply", ask: "How do I apply for a UTAR scholarship?" },
    { id: "sch-ptptn", ask: "Can I apply for a PTPTN loan as a UTAR student?" },
    { id: "sch-followup-deadline", ask: ["How do I apply for a UTAR scholarship?", "what's the deadline?"] },
    { id: "sch-zh", ask: "如何申请奖学金？" },

    // --- Library ---
    { id: "lib-hours", ask: "What are the library opening hours in Kampar?" },
    { id: "lib-borrow", ask: "How many books can I borrow from the library?" },
    { id: "lib-databases", ask: "How do I access the library's online databases from home?" },

    // --- Student affairs (DSA), both campuses ---
    { id: "dsa-society", ask: "How do I join a student society?" },
    { id: "dsa-hostel-kpr", ask: "How do I apply for student accommodation in Kampar?" },
    { id: "dsa-counselling", ask: "Where can I get counselling at UTAR?" },
    { id: "dsa-fund", ask: "How do I apply for the student assistance fund?" },
    { id: "dsa-src", ask: "When is the SRC election?" },
    { id: "dsa-sl-contact", ask: "How do I contact student affairs in Sungai Long?" },

    // --- Facilities, general services, IT ---
    { id: "def-aircon", ask: "How do I report a broken air conditioner in my classroom?" },
    { id: "def-hall-sl", ask: "How do I book a hall for an event in Sungai Long campus?" },
    { id: "dgs-parking", ask: "Where can I park my car at Kampar campus?" },
    { id: "dgs-sticker", ask: "How do I apply for a car sticker?" },
    { id: "it-email-pw", ask: "How do I reset my UTAR email password?" },
    { id: "it-wifi", ask: "How do I connect to the campus Wi-Fi?" },
    { id: "it-office", ask: "Can students get Microsoft Office for free?" },

    // --- International students ---
    { id: "oia-visa", ask: "What documents do international students need for a student visa?" },
    { id: "oia-renew", ask: "How do I renew my student pass?" },

    // --- Postgraduate ---
    { id: "ipsr-thesis", ask: "How do I submit my thesis?" },
    { id: "ipsr-phd-max", ask: "What is the maximum candidature period for a PhD?" },

    // --- Faculties ---
    { id: "fict-dean", ask: "Who is the Dean of FICT?" },
    { id: "fict-industrial", ask: "How do I apply for industrial training in FICT?" },
    { id: "fict-programmes", ask: "What programmes does FICT offer?" },
    { id: "fict-followup-email", ask: ["Who is the Dean of FICT?", "what is the email?"] },
    { id: "lkc-programmes", ask: "What programmes does the Lee Kong Chian Faculty of Engineering and Science offer?" },
    { id: "fbf-industrial", ask: "How do I apply for industrial training in FBF?" },
    { id: "fmhs-mbbs-length", ask: "How long is the MBBS programme?" },
    { id: "fmhs-nursing-req", ask: "What are the entry requirements for the Nursing degree?" },
    { id: "fam-programmes", ask: "What programmes does the Faculty of Accountancy and Management offer?" },
    { id: "fci-journalism", ask: "Does UTAR offer a journalism degree?" },
    { id: "fcs-zh", ask: "中华研究院有什么课程？" },
    { id: "fed-teaching", ask: "Does UTAR offer a degree in education or teaching?" },
    { id: "fsc-programmes", ask: "What programmes does the Faculty of Science offer?" },
    { id: "cfs-arts", ask: "What subjects are in Foundation in Arts?" },
    { id: "cfs-length", ask: "How long is the Foundation programme?" },
    { id: "confucius-mandarin", ask: "Does UTAR offer Mandarin classes for beginners?" },

    // --- Academic rules ---
    { id: "rule-attendance", ask: "What is the minimum attendance to sit for the final exam?" },
    { id: "rule-plagiarism", ask: "What is the penalty for plagiarism?" },
    { id: "rule-credit-limit", ask: "Can I take more than 20 credit hours in one trimester?" },
    { id: "rule-add-drop", ask: "How do I add or drop a course?", clarifyOk: true },
    { id: "rule-add-drop-fict", ask: ["How do I add or drop a course?", "FICT"] },
    { id: "rule-probation", ask: "What is the credit hour limit if I am on academic probation?" },

    // --- Complaints and sensitive ---
    { id: "complaint-lecturer", ask: "I want to make a complaint about my lecturer", clarifyOk: true },
    { id: "private-cgpa", ask: "What is my CGPA?" },
    { id: "private-id", ask: "Can you tell me my student ID?" },

    // --- Malay ---
    { id: "ms-fee-deadline", ask: "Bila tarikh akhir bayar yuran?" },
    { id: "ms-foundation-fee", ask: "Berapa yuran Foundation in Science?" },

    // --- Edge cases and small talk (mostly free: no Gemini) ---
    { id: "edge-stress", ask: "I'm so stressed about my exams" },
    { id: "edge-assignment", ask: "Can you do my assignment for me?" },
    { id: "edge-weather", ask: "What's the weather today?" },
    { id: "edge-hi", ask: "hi" },
    { id: "edge-thanks", ask: ["How do I apply for a supplementary exam?", "thank you!"] },
    { id: "talk-smart", ask: "are you smart", mustMatch: [/smart enough/i] },
    { id: "talk-creator", ask: "who build you", mustMatch: [/AVO/] },
    { id: "talk-popular", ask: "who is the most popular lecturer", mustMatch: [/EXO/] },
    { id: "talk-real-q", ask: "can you tell me who the FICT dean is", mustNotMatch: [/EXO|smart enough|AVO YYDS/i] },

    // --- Bus (Kampar answers come from data, free) ---
    { id: "bus-general", ask: "bus schedule", mustMatch: [/Kampar campus bus routes/] },
    { id: "bus-westlake", ask: "what time is the bus to westlake?", mustMatch: [/\| Leaves UTAR \| At Westlake Homes/] },
    { id: "bus-route-followup", ask: ["bus schedule", "route 2"], mustMatch: [/Champs Elysees/] },
    { id: "bus-pass", ask: "How do I buy a monthly bus pass?" },
    { id: "bus-sl", ask: "Is there a bus service at Sungai Long campus?" },
];
