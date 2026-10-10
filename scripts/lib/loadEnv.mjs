import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Loads .env.local (local runs); real environment variables win. */
export function loadEnv() {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}
