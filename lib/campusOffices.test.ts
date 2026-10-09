import { test } from "node:test";
import assert from "node:assert/strict";

const { bothCampusOffices, campusFamily } = await import("./campusOffices.ts");

const ASK_CAMPUS = "Could you please specify which campus you are referring to (Kampar or Sungai Long)?";

test("a 'which campus?' question for a campus office answers from both campuses", () => {
    assert.deepEqual(
        bothCampusOffices({ agentId: "cfs-kampar", needsClarification: true, clarificationQuestion: ASK_CAMPUS, message: "How long is the Foundation programme?" }),
        ["cfs-kampar", "cfs-sungai-long"]
    );
    assert.deepEqual(
        bothCampusOffices({ agentId: "dsa-sungai-long", needsClarification: true, clarificationQuestion: ASK_CAMPUS, message: "How do I join a student society?" }),
        ["dsa-kampar", "dsa-sungai-long"]
    );
});

test("when the router left it on General, the office comes from the question", () => {
    for (const [message, family] of [
        ["Where can I get counselling at UTAR?", "dsa"],
        ["When is the SRC election?", "dsa"],
        ["How do I report a broken air conditioner in my classroom?", "def"],
        ["How do I apply for a car sticker?", "dgs"],
        ["How do I buy a monthly bus pass?", "dgs"],
        ["Where is the lost and found?", "dss"],
        ["What subjects are in Foundation in Arts?", "cfs"],
        ["What does DSS do?", "dss"],
        ["DSA office hours", "dsa"],
    ]) {
        assert.deepEqual(
            bothCampusOffices({ agentId: "general", needsClarification: true, clarificationQuestion: ASK_CAMPUS, message }),
            [`${family}-kampar`, `${family}-sungai-long`],
            message
        );
    }
});

test("other follow-up questions are left alone", () => {
    // Not about the campus.
    assert.equal(
        bothCampusOffices({ agentId: "general", needsClarification: true, clarificationQuestion: "Which faculty or centre do you belong to?", message: "Can I take more than 20 credit hours?" }),
        null
    );
    // No follow-up question at all.
    assert.equal(bothCampusOffices({ agentId: "dsa-kampar", needsClarification: false, message: "counselling" }), null);
    // General question with no campus office behind it.
    assert.equal(
        bothCampusOffices({ agentId: "general", needsClarification: true, clarificationQuestion: ASK_CAMPUS, message: "Where is the main entrance?" }),
        null
    );
    // A faculty is not a campus office.
    assert.equal(
        bothCampusOffices({ agentId: "fict", needsClarification: true, clarificationQuestion: ASK_CAMPUS, message: "FICT office hours" }),
        null
    );
});

test("campus family of an office id", () => {
    assert.equal(campusFamily("dgs-kampar"), "dgs");
    assert.equal(campusFamily("def-sungai-long"), "def");
    assert.equal(campusFamily("dace"), null);
});
