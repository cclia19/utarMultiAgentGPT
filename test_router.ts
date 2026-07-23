import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const match = envText.match(/GEMINI_API_KEY=(.+)/);
if (match) {
    process.env.GEMINI_API_KEY = match[1].trim();
}

async function main() {
    // We want to test resolveConversationContext logic
    const { ai, MODEL_NAME } = await import('./lib/gemini');
    
    const latestMessage = "what is the policy for taking examination in special venue";
    const resolverPrompt = `
You are the conversation context resolver for UTARGPT.

You DO NOT answer the user.
You only decide how the latest user message relates to the previous conversation.

Latest user message:
${latestMessage}

Pending unresolved question:
None

Existing context summary:
None

Recent conversation:
None

Your task:
1. Decide whether the latest message is:
   - "new_standalone_question"
   - "clarification_for_pending"
   - "follow_up_same_topic"
   - "casual_no_retrieval"

2. Produce a fully resolved user question for routing/retrieval.

3. Update the context summary in natural language.

Return ONLY valid JSON:
{
  "relation": "new_standalone_question" | "clarification_for_pending" | "follow_up_same_topic" | "casual_no_retrieval",
  "needsRetrieval": true | false,
  "resolvedQuestion": "string",
  "updatedContextSummary": "string"
}
`;

    const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: resolverPrompt }] }],
        config: { responseMimeType: "application/json", temperature: 0.1 }
    });

    console.log("resolveConversationContext raw output:\n", response.text);
}

main();
