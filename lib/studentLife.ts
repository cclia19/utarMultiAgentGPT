/**
 * Student-life and general-advice questions: food, places and things to do
 * near the campuses, getting around, renting off campus, laptops and study
 * tips. They are answered from the general web (one search) instead of "not
 * available from official UTAR sources", which turned students away.
 *
 * UTAR rules about the same topics ("can I bring food into the library?",
 * hostel applications) stay with the knowledge base.
 *
 * Pure functions, unit tested.
 */

const FOOD = /\b(food|foods|eat|eating|makan|makanan|cafe|cafes|caf[eé]|restaurant|restaurants|hawker|mamak|kopitiam|supper|breakfast|brunch|lunch|dinner|bubble tea|boba|coffee shop|halal food|vegetarian food|where to eat|what to eat|hungry|lapar)\b|吃|美食|餐厅|好吃|宵夜|早餐|午餐|晚餐|奶茶|咖啡/i;
const PLACES = /\b(things to do|what to do|where to go|hang ?out|hangout|places to visit|place to visit|attractions?|sightseeing|shopping|mall|malls|cinema|gym|gyms|hiking|hike|park|parks|weekend|jalan[- ]jalan|tempat menarik|lepak|nightlife|karaoke|study spots?|cafe to study)\b|好玩|去哪|景点|逛街|周末/i;
const GETTING_AROUND = /\b(grab|taxi|ktm|ets|train|lrt|mrt|express bus|bus to (kl|kuala lumpur|ipoh|penang|singapore)|how to get to (kampar|sungai long|utar)|get to (kampar|sungai long)|from (kl|kuala lumpur|ipoh|klia|tbs) to (kampar|sungai long|utar))\b|怎么去|坐车/i;
const RENTING = /\b(rent|rental|renting|room for rent|rooms? near|condo|apartment|house to rent|rumah sewa|bilik sewa|off[- ]campus (housing|accommodation|living)|cost of living|living cost|budget per month)\b|租房|租屋|房租|生活费/i;
const ADVICE = /\b(laptop|laptops|macbook|notebook|pc spec|specs?|which (laptop|computer|tablet|ipad)|what (laptop|computer|tablet|ipad)|ipad|tablet for (study|notes)|study tips?|how to study|exam tips?|revision tips?|time management|productivity|stay motivated|cv tips?|resume tips?|interview tips?|make friends|homesick)\b|笔记本电脑|电脑配置|学习方法|读书技巧/i;
const NEAR_UTAR = /\b(near|nearby|around|close to|walking distance|in|at)\b.{0,25}\b(utar|campus|kampar|sungai long|bandar sungai long|kajang|cheras|ipoh)\b|\b(kampar|sungai long|bandar sungai long)\b/i;

// UTAR's own rules on these topics are knowledge-base questions, not advice.
const UTAR_RULE = /\b(allowed|allow|permitted|can i bring|may i bring|bring (food|drinks?)|rules?|regulations?|policy|policies|fine|penalt(y|ies)|boleh bawa|dibenarkan)\b|可以带|规定/i;
// UTAR services with the same words (hostel, UTAR bus) belong to their office.
const UTAR_SERVICE = /\b(hostel|utar bus|shuttle|buggy|car sticker|parking (pass|sticker)|cafeteria (operator|tender)|vendor|venue|hall booking|room booking|book (a )?(room|hall|venue))\b/i;

export function isStudentLifeQuestion(message: string): boolean {
    const q = String(message || "");
    if (!q.trim() || UTAR_RULE.test(q) || UTAR_SERVICE.test(q)) return false;
    if (ADVICE.test(q)) return true;
    if (FOOD.test(q) || PLACES.test(q)) return true;
    if (GETTING_AROUND.test(q)) return true;
    // Renting only counts near UTAR / the campus towns (not "rent a venue at UTAR").
    if (RENTING.test(q) && (NEAR_UTAR.test(q) || /\b(student|students)\b/i.test(q))) return true;
    return false;
}

/** On-campus facts the answer can start with (from the old fixed food reply). */
export const CAMPUS_FOOD_FACTS = `
Known on-campus food at Kampar: Student Pavilion I (Block C, near FICT), Student Pavilion II (Block K), Heritage Hall (Block A) and Olive Places (FICT side).
`;
