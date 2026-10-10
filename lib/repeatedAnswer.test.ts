import { test } from "node:test";
import assert from "node:assert/strict";

const { dropRepeatedAnswer } = await import("./repeatedAnswer.ts");

// The answer a tester saw (UTARCHAT, Oct 2026): two copies glued together.
const FIRST = `The Bachelor of Computer Science (Honours) programme at UTAR aims to equip students with a suitable mathematical background for analyzing, modeling, and evaluating computing solutions. While the provided information highlights the importance of mathematics in the general Computer Science curriculum, it does not specify the exact number of mathematics courses.

For admission, candidates must have a credit in Mathematics at SPM level or equivalent. If a candidate only has a pass in Mathematics at SPM level, they are required to take and pass a Mathematics Enhancement Course (MEC) as a prerequisite.

**Next step:** Contact the Faculty of Information and Communication Technology (FICT) directly.`;
const SECOND = `The Bachelor of Computer Science (Honours) programme at UTAR emphasizes providing students with a suitable mathematical background to analyze, model, and evaluate computing solutions. While the programme aims to equip students with strong analytical skills, the provided information does not detail the specific mathematics courses.

Admission to the programme requires a credit in Mathematics at SPM level or its equivalent. Candidates who have only a pass in Mathematics at SPM level are required to complete a Mathematics Enhancement Course (MEC) as a prerequisite.`;

test("a second, reworded copy of the answer is dropped", () => {
    assert.equal(dropRepeatedAnswer(`${FIRST}${SECOND}`), FIRST);
    assert.equal(dropRepeatedAnswer(`${FIRST}\n\n${SECOND}`), FIRST);
});

test("a repeat in the middle (a paragraph said again later) is cut there", () => {
    const intro = "The Computer Science programme gives students a strong mathematical background for analysing, modelling and evaluating computing solutions across many areas.";
    const admission = "For admission, candidates must have a credit in Mathematics at SPM level or equivalent, or pass a Mathematics Enhancement Course before joining the programme.";
    const careers = "Graduates can work as Artificial Intelligence software engineers, data scientists, software developers and system analysts in many different industries.";
    const admissionAgain = "For admission, a credit in Mathematics at the SPM level or its equivalent is required, or candidates must pass a Mathematics Enhancement Course before joining.";
    assert.equal(dropRepeatedAnswer([intro, admission, careers, admissionAgain].join("\n\n")), [intro, admission, careers].join("\n\n"));
});

test("normal answers are untouched", () => {
    const answer = `You can get counselling through the Department of Student Affairs. Sessions are free and confidential for all registered students.

### Kampar campus

Book an appointment with the counselling unit by phone or email, or walk in to the Department of Student Affairs office during office hours on weekdays.

### Sungai Long campus

Book an appointment with the counselling unit by phone or email, or walk in to the Department of Student Affairs office during office hours on weekdays.

* **Phone:** 05-468 8888
* **Phone:** 03-9086 0288`;
    assert.equal(dropRepeatedAnswer(answer), answer);
    const steps = "1. Log in to the Student Portal and open the Examination tab to find the registration page.\n\n2. Log in to the Student Portal and open the Billing tab to pay the fee for the registration.";
    assert.equal(dropRepeatedAnswer(steps), steps);
    assert.equal(dropRepeatedAnswer("Short answer."), "Short answer.");
});
