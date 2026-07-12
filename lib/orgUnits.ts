export type OrgUnitType =
    | "general"
    | "leadership"
    | "faculty"
    | "institute"
    | "centre"
    | "division"
    | "department"
    | "office"
    | "library";

export interface OrgUnit {
    id: string;
    name: string;
    shortLabel: string;
    type: OrgUnitType;
    campus?: "Kampar" | "Sungai Long" | "Both";
    aliases: string[];
    fileStoreDisplayName: string;
    enabledForChat: boolean;
    enabledForUpload: boolean;
    studentFacing: boolean;
}

export const ORG_UNITS: OrgUnit[] = [
    {
        id: "general",
        name: "General UTAR",
        shortLabel: "General",
        type: "general",
        aliases: ["general", "utar", "university", "main", "general utar"],
        fileStoreDisplayName: "UTAR General Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },

    // Leadership / central offices
    {
        id: "president-office",
        name: "President's Office",
        shortLabel: "President's Office",
        type: "leadership",
        aliases: ["president", "president office", "utar president", "ceo"],
        fileStoreDisplayName: "UTAR General Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "vp-international-academic",
        name: "Office of VP (Internationalisation and Academic Development)",
        shortLabel: "VP IAD",
        type: "leadership",
        aliases: ["vp internationalisation", "academic development", "internationalisation"],
        fileStoreDisplayName: "UTAR General Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "vp-rd-commercialisation",
        name: "Office of VP (R & D and Commercialisation)",
        shortLabel: "VP R&D",
        type: "leadership",
        aliases: ["vp research", "commercialisation", "r&d", "research and development"],
        fileStoreDisplayName: "UTAR General Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "vp-student-alumni",
        name: "Office of VP (Student Development and Alumni Relations)",
        shortLabel: "OVP SDAR",
        type: "leadership",
        aliases: ["student development", "alumni relations", "vp student", "sdar", "ovp sdar", "ovp-sdar"],
        fileStoreDisplayName: "UTAR OVP SDAR Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "registrar",
        name: "Registrar's Office",
        shortLabel: "Registrar",
        type: "office",
        aliases: ["registrar", "registrar office", "student record", "academic record"],
        fileStoreDisplayName: "UTAR Registrar Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },

    // Key student service divisions
    {
        id: "dfn",
        name: "Division of Finance",
        shortLabel: "DFN",
        type: "division",
        aliases: ["dfn", "finance", "division of finance", "fees", "payment", "receipt", "invoice", "billing"],
        fileStoreDisplayName: "UTAR DFN Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "deas",
        name: "Division of Examination and Awards",
        shortLabel: "DEAS",
        type: "division",
        aliases: ["dea", "deas", "exam", "examination", "awards", "results", "exam timetable"],
        fileStoreDisplayName: "UTAR DEAS Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dace",
        name: "Division of Admissions and Credit Evaluation",
        shortLabel: "DACE",
        type: "division",
        aliases: ["admission", "admissions", "credit evaluation", "dace", "entry requirement"],
        fileStoreDisplayName: "UTAR DACE Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dpp",
        name: "Division of Programme Promotion",
        shortLabel: "DPP",
        type: "division",
        aliases: ["programme promotion", "program promotion", "dpp", "marketing", "course promotion"],
        fileStoreDisplayName: "UTAR DPP Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "library",
        name: "Library",
        shortLabel: "Library",
        type: "library",
        aliases: ["library", "utar library", "book", "database", "journal", "borrowing"],
        fileStoreDisplayName: "UTAR Library Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "oia",
        name: "Office of International Affairs",
        shortLabel: "OIA",
        type: "office",
        aliases: ["oia", "international affairs", "mobility", "exchange programme", "international collaboration"],
        fileStoreDisplayName: "UTAR OIA Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "diss",
        name: "Department of International Student Services",
        shortLabel: "DISS",
        type: "department",
        aliases: ["international student", "international student services", "diss", "visa", "student pass"],
        fileStoreDisplayName: "UTAR DISS Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "scholarships",
        name: "Department of Scholarships and Financial Aid",
        shortLabel: "Scholarships",
        type: "department",
        aliases: ["scholarship", "scholarships", "financial aid", "loan", "bursary"],
        fileStoreDisplayName: "UTAR Scholarships Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },

    // Student affairs / campus services
    {
        id: "dsa-kampar",
        name: "Department of Student Affairs (Kampar Campus)",
        shortLabel: "DSA Kampar",
        type: "department",
        campus: "Kampar",
        aliases: ["dsa", "dsa kampar", "dsa kpr", "dsa-kpr", "dsakpr", "student affairs kampar", "student affairs", "student activity"],
        fileStoreDisplayName: "UTAR DSA Kampar Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dsa-sungai-long",
        name: "Department of Student Affairs (Sungai Long Campus)",
        shortLabel: "DSA Sungai Long",
        type: "department",
        campus: "Sungai Long",
        aliases: ["dsa", "dsa sungai long", "dsa sl", "dsa-sl", "dsasl", "student affairs sungai long", "student affairs"],
        fileStoreDisplayName: "UTAR DSA Sungai Long Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "soft-skills",
        name: "Department of Soft Skills Competency (Sungai Long & Kampar Campuses)",
        shortLabel: "Soft Skills",
        type: "department",
        campus: "Both",
        aliases: ["soft skills", "usssd", "soft skill points", "soft skills competency"],
        fileStoreDisplayName: "UTAR Soft Skills Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },

    // Facilities / safety / services
    {
        id: "def-kampar",
        name: "Department of Estates and Facilities (Kampar Campus)",
        shortLabel: "DEF Kampar",
        type: "department",
        campus: "Kampar",
        aliases: ["estate kampar", "facilities kampar", "def kampar", "maintenance kampar"],
        fileStoreDisplayName: "UTAR DEF Kampar Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "def-sungai-long",
        name: "Department of Estates and Facilities (Sungai Long Campus)",
        shortLabel: "DEF Sungai Long",
        type: "department",
        campus: "Sungai Long",
        aliases: ["estate sungai long", "facilities sungai long", "def sungai long", "maintenance sungai long"],
        fileStoreDisplayName: "UTAR DEF Sungai Long Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dss-kampar",
        name: "Department of Safety and Security (Kampar Campus)",
        shortLabel: "DSS Kampar",
        type: "department",
        campus: "Kampar",
        aliases: ["dss", "dss kampar", "dss kpr", "dss-kpr", "dsskpr", "security kampar", "safety kampar", "emergency kampar", "safety and security"],
        fileStoreDisplayName: "UTAR DSS Kampar Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dss-sungai-long",
        name: "Department of Safety and Security (Sungai Long Campus)",
        shortLabel: "DSS Sungai Long",
        type: "department",
        campus: "Sungai Long",
        aliases: ["dss", "dss sungai long", "dss sl", "dss-sl", "dsssl", "security sungai long", "safety sungai long", "emergency sungai long", "safety and security"],
        fileStoreDisplayName: "UTAR DSS Sungai Long Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dgs-kampar",
        name: "Department of General Services (Kampar Campus)",
        shortLabel: "DGS Kampar",
        type: "department",
        campus: "Kampar",
        aliases: ["dgs", "dgs kampar", "general services", "room booking", "teaching room", "venue booking", "general services kampar"],
        fileStoreDisplayName: "UTAR DGS Kampar Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "dgs-sungai-long",
        name: "Department of General Services (Sungai Long Campus)",
        shortLabel: "DGS Sungai Long",
        type: "department",
        campus: "Sungai Long",
        aliases: ["dgs", "dgs sungai long", "general services", "room booking", "teaching room", "venue booking", "general services sungai long"],
        fileStoreDisplayName: "UTAR DGS Sungai Long Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },

    // More admin / technical support units
    {
        id: "dhr",
        name: "Division of Human Resource",
        shortLabel: "DHR",
        type: "division",
        aliases: ["dhr", "human resource", "human resources", "hr", "staff matters", "employment"],
        fileStoreDisplayName: "UTAR DHR Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "dssm",
        name: "Division of Sustainability and Strategic Management",
        shortLabel: "DSSM",
        type: "division",
        aliases: ["dssm", "sustainability and strategic management", "sustainability", "strategic management"],
        fileStoreDisplayName: "UTAR DSSM Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "itisc",
        name: "IT Infrastructure and Support Centre",
        shortLabel: "ITISC",
        type: "centre",
        aliases: ["itisc", "it support", "wifi", "network", "internet", "utar portal", "wble"],
        fileStoreDisplayName: "UTAR ITISC Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "csds",
        name: "Centre for Software Development and Support",
        shortLabel: "CSDS",
        type: "centre",
        aliases: ["csds", "software support", "system support", "application support"],
        fileStoreDisplayName: "UTAR CSDS Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "cmps",
        name: "Centre for Multimedia Production and Services",
        shortLabel: "CMPS",
        type: "centre",
        aliases: ["cmps", "multimedia production", "video production", "media service"],
        fileStoreDisplayName: "UTAR CMPS Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },

    // Faculties / institutes / centres
    {
        id: "fmhs",
        name: "M. Kandiah Faculty of Medicine and Health Sciences",
        shortLabel: "FMHS",
        type: "faculty",
        campus: "Sungai Long",
        aliases: ["fmhs", "medicine", "health sciences", "m kandiah faculty"],
        fileStoreDisplayName: "UTAR FMHS Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "lkcfes",
        name: "Lee Kong Chian Faculty of Engineering and Science",
        shortLabel: "LKC FES",
        type: "faculty",
        aliases: ["lkc fes", "lkcfes", "lee kong chian", "engineering and science"],
        fileStoreDisplayName: "UTAR LKC FES Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fegt",
        name: "Faculty of Engineering and Green Technology",
        shortLabel: "FEGT",
        type: "faculty",
        aliases: ["fegt", "engineering and green technology", "green technology"],
        fileStoreDisplayName: "UTAR FEGT Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fict",
        name: "Faculty of Information and Communication Technology",
        shortLabel: "FICT",
        type: "faculty",
        aliases: ["fict", "ict", "information and communication technology", "computer science", "software engineering"],
        fileStoreDisplayName: "UTAR FICT Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fsc",
        name: "Faculty of Science",
        shortLabel: "FSc",
        type: "faculty",
        aliases: ["fsc", "faculty of science", "science faculty"],
        fileStoreDisplayName: "UTAR FSc Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fam",
        name: "Faculty of Accountancy and Management",
        shortLabel: "FAM",
        type: "faculty",
        campus: "Sungai Long",
        aliases: ["fam", "accountancy and management", "accounting faculty", "management faculty"],
        fileStoreDisplayName: "UTAR FAM Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fbf",
        name: "Teh Hong Piow Faculty of Business and Finance",
        shortLabel: "THP FBF",
        type: "faculty",
        campus: "Kampar",
        aliases: ["fbf", "thp fbf", "thpfbf", "business and finance", "teh hong piow", "business faculty", "finance faculty"],
        fileStoreDisplayName: "UTAR FBF Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fass",
        name: "Faculty of Arts and Social Science",
        shortLabel: "FAS",
        type: "faculty",
        campus: "Kampar",
        aliases: ["fas", "fass", "arts and social science", "social science"],
        fileStoreDisplayName: "UTAR FAS Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fci",
        name: "Faculty of Creative Industries",
        shortLabel: "FCI",
        type: "faculty",
        aliases: ["fci", "creative industries", "creative industry"],
        fileStoreDisplayName: "UTAR FCI Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fcs",
        name: "Faculty of Chinese Studies",
        shortLabel: "FCS",
        type: "faculty",
        aliases: ["fcs", "chinese studies", "faculty of chinese studies"],
        fileStoreDisplayName: "UTAR FCS Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "fed",
        name: "Faculty of Education",
        shortLabel: "FED",
        type: "faculty",
        aliases: ["fed", "education faculty", "faculty of education"],
        fileStoreDisplayName: "UTAR FED Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "ipsr",
        name: "Institute of Postgraduate Studies & Research",
        shortLabel: "IPSR",
        type: "institute",
        aliases: ["ipsr", "postgraduate", "postgraduate studies", "research", "thesis", "grant", "publication support"],
        fileStoreDisplayName: "UTAR IPSR Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "imd",
        name: "Institute of Management and Leadership Development",
        shortLabel: "IMLD",
        type: "institute",
        aliases: ["imld", "management and leadership development", "leadership development"],
        fileStoreDisplayName: "UTAR IMLD Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "cfs-kampar",
        name: "Centre for Foundation Studies (Kampar Campus)",
        shortLabel: "CFS Kampar",
        type: "centre",
        campus: "Kampar",
        aliases: ["cfs kampar", "foundation kampar", "centre for foundation studies kampar"],
        fileStoreDisplayName: "UTAR CFS Kampar Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "cfs-sungai-long",
        name: "Centre for Foundation Studies (Sungai Long Campus)",
        shortLabel: "CFS Sungai Long",
        type: "centre",
        campus: "Sungai Long",
        aliases: ["cfs sungai long", "foundation sungai long", "centre for foundation studies sungai long"],
        fileStoreDisplayName: "UTAR CFS Sungai Long Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "iie",
        name: "Institute of International Education",
        shortLabel: "IIE",
        type: "institute",
        aliases: ["iie", "international education", "institute of international education"],
        fileStoreDisplayName: "UTAR IIE Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
    {
        id: "cccd",
        name: "Centre for Corporate and Community Development",
        shortLabel: "CCCD",
        type: "centre",
        aliases: ["cccd", "corporate and community development", "community development"],
        fileStoreDisplayName: "UTAR CCCD Knowledge Base",
        enabledForChat: false,
        enabledForUpload: true,
        studentFacing: false,
    },
    {
        id: "confucius",
        name: "Confucius Institute",
        shortLabel: "Confucius Institute",
        type: "institute",
        aliases: ["confucius", "confucius institute", "chinese language"],
        fileStoreDisplayName: "UTAR Confucius Institute Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },

    {
        id: "darp",
        name: "Department of Alumni Relations and Placement",
        shortLabel: "DARP",
        type: "department",
        aliases: [
            "darp",
            "alumni relations",
            "placement",
            "career placement",
            "internship",
            "industrial training",
            "job placement",
            "career",
            "employability",
            "job search"
        ],
        fileStoreDisplayName: "UTAR DARP Knowledge Base",
        enabledForChat: true,
        enabledForUpload: true,
        studentFacing: true,
    },
];

export function getOrgUnitById(id?: string): OrgUnit {
    return ORG_UNITS.find((unit) => unit.id === id) || ORG_UNITS[0];
}

export function getChatEnabledOrgUnits(): OrgUnit[] {
    return ORG_UNITS.filter((unit) => unit.enabledForChat);
}

export function getUploadEnabledOrgUnits(): OrgUnit[] {
    return ORG_UNITS.filter((unit) => unit.enabledForUpload);
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findOrgUnitByAlias(text: string): OrgUnit | null {
    const lower = text.toLowerCase().trim();

    return (
        ORG_UNITS.find((unit) =>
            unit.aliases.some((alias) => {
                const aliasLower = alias.toLowerCase().trim();

                if (!aliasLower) return false;

                // Exact match is always allowed.
                if (lower === aliasLower) return true;

                // Short aliases such as DEA, DFN, FBF, FICT must match as whole words only.
                // This prevents "dean" from matching "dea".
                if (aliasLower.length <= 4) {
                    const wordRegex = new RegExp(`\\b${escapeRegex(aliasLower)}\\b`, "i");
                    return wordRegex.test(lower);
                }

                // Longer aliases can match as phrases, but still on word boundaries.
                const phraseRegex = new RegExp(`\\b${escapeRegex(aliasLower)}\\b`, "i");
                return phraseRegex.test(lower);
            })
        ) || null
    );
}