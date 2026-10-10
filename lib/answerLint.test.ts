import { test } from "node:test";
import assert from "node:assert/strict";

const { lintAnswer } = await import("./answerLint.ts");

const codes = (text: string) => lintAnswer(text).map((f: any) => f.code);

test("a clean answer has no flags", () => {
    const clean = `The October 2026 trimester starts on different dates by level.

### October 2026 trimester

* **Postgraduate:** 5 October 2026
* **Undergraduate:** 26 October 2026 (Kampar) / 27 October 2026 (Sungai Long)

**Next step:** Check your offer letter for your reporting day.

### 🔗 Official Links
- [DACE](https://admission.utar.edu.my/)`;
    assert.deepEqual(codes(clean), []);
});

test("the failures seen in testing are flagged", () => {
    assert.ok(codes("tool_code\nprint(file_search.query(query=\"x\"))\nthought\nThe user is asking...").includes("leaked-reasoning"));
    assert.ok(codes("No response generated.").includes("empty"));
    assert.ok(codes("NO_KB_ANSWER").includes("sentinel"));
    assert.ok(codes("I'm having trouble retrieving the exact details from the UTAR portal right now.").includes("retrieval-failed"));
    assert.ok(codes("* **June Intake Undergraduate Programme*:** 26 October 2026").includes("footnote-marker"));
    assert.ok(codes("* October Intake Undergraduate Programme^ begins on 26 October").includes("footnote-marker"));
    assert.ok(codes("Here is the specific trip timetable for Route 1.").includes("preamble"));
    assert.ok(codes("Based on the information provided, the fee is RM100.").includes("preamble"));
    assert.ok(codes("That's a great question for clarification!").includes("preamble"));
    assert.ok(codes("# Fees\nRM100").includes("big-heading"));
    assert.ok(codes("The knowledge base does not say.").includes("internal-jargon"));
    assert.ok(codes("I couldn't find the deadline for this.").includes("no-answer"));
    assert.ok(codes(Array(320).fill("word").join(" ")).includes("too-long"));
});

test("Markdown bold, bullets and the links section are not mistaken for problems", () => {
    assert.deepEqual(codes("**Undergraduate:** 26 October 2026\n* **Foundation:** 12 October 2026"), []);
    // Words in the links section do not count towards length or preamble.
    const longLinks = "Short answer.\n\n### 🔗 Official Links\n" + Array(400).fill("- [x](https://utar.edu.my)").join("\n");
    assert.deepEqual(codes(longLinks), []);
    // A long timetable is not a long answer.
    const table = "Bus times:\n\n| Trip | Leaves |\n| --- | --- |\n" + Array(120).fill("| 1 | 7:15 am (D only) |").join("\n");
    assert.deepEqual(codes(table), []);
});
