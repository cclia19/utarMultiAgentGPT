/**
 * UTAR rules quoted word for word, added as evidence when a question needs
 * them. File Search does not always retrieve the Code of Conduct: on 29 Oct
 * 2026 "can utar full time student get a full time job" fell through to the
 * web, which answered "no explicit official UTAR policy".
 *
 * Pure functions, unit tested.
 */

const WORK = /\b(jobs?|employment|employed|occupation|part[- ]?timer?|full[- ]?time (work|working)|work(ing)? (part[- ]?time|full[- ]?time|while (studying|study))|freelanc\w*|side (hustle|income|business)|(own|start|run|open)( a| my)? business|kerja( sambilan)?|bekerja)\b|兼职|打工|上班/i;
const ASKS_IF_ALLOWED = /\b(can|could|may|allowed|permitted|permission|is it ok(ay)?|boleh|dibenarkan|students?)\b|可以|能不能|能否/i;

/** "Can I work part-time?", "can a full time student get a full time job" (not "job fair dates"). */
export function isStudentWorkQuestion(message: string): boolean {
    const q = String(message || "");
    return WORK.test(q) && ASKS_IF_ALLOWED.test(q);
}

export const STUDENT_WORK_RULE_EVIDENCE = `
OFFICIAL UTAR RULE (evidence; authoritative): Rule XX – Student Code of Conduct (RGO823104, amended 18 Sep 2025), Section 15 "Students engaging in occupation, etc.":
"No student shall, within or outside the Campus, engage in any occupation, employment, business, trade or other activity, whether full-time or part-time, which conflicts with his vocation or position as a student or in the opinion of the University is deemed undesirable."
Source: https://portal.utar.edu.my/stuIntranet/regulations/RGO823104.pdf
How to apply it: a full-time job while studying full-time conflicts with the student's position, so the verdict is **No**. Part-time work is allowed only if it does not conflict with studies and the University does not deem it undesirable, so the verdict is **It depends**; suggest checking with the Department of Student Affairs (DSA). Industrial training is part of the programme, not covered by this answer.
This rule counts as a retrieved UTAR document: answer from it even when File Search returns nothing else, and never reply NO_KB_ANSWER to a question about students working.
`;
