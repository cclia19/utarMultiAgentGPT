import { routeWithLLM } from './lib/intentRouter.js';
import fs from 'fs';

async function main() {
    const res = await routeWithLLM({
        message: "what is the policy for taking examination in special venue",
        currentAgentId: "general"
    });
    console.log("routeWithLLM result:", JSON.stringify(res, null, 2));
}

main();
