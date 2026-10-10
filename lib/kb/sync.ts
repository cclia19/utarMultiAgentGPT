import { createHash } from "node:crypto";
import type { KbDraft, KbPublisher, KbRunItem, KbVersionStore } from "./types.ts";

/**
 * Publishes drafts to the knowledge base with versioning and safeguards.
 *
 * - Unchanged text (ignoring the "retrieved <date>" line) is skipped.
 * - Crawled pages that look broken are held for review instead of
 *   replacing a good version: almost empty, or less than half the size of
 *   the live version. Manual uploads and `force` skip this check.
 * - The new version is uploaded first; the previous Gemini document is
 *   removed only after that succeeds, so the store is never left without it.
 */

const MIN_CHARS = 200;
const MAX_SHRINK = 0.5;

/** Hash of the content that matters (the retrieval date changes every run). */
export function contentHash(text: string, file?: { data: Uint8Array }): string {
    if (file) return createHash("sha256").update(file.data).digest("hex");
    const stable = String(text || "")
        .replace(/retrieved \d{4}-\d{2}-\d{2}/gi, "retrieved")
        .replace(/[ \t]+$/gm, "")
        .trim();
    return createHash("sha256").update(stable).digest("hex");
}

export type PublishOptions = { dryRun?: boolean; force?: boolean };

export async function publishDraft(
    draft: KbDraft,
    deps: { store: KbVersionStore; publisher: KbPublisher },
    options: PublishOptions = {}
): Promise<KbRunItem> {
    const base = { key: draft.key, title: draft.title, unitId: draft.unitId };
    const hash = contentHash(draft.text, draft.file);
    const size = draft.file ? draft.file.data.length : draft.text.length;
    const doc = await deps.store.getDocument(draft.key);
    const live = doc?.liveVersion ? await deps.store.getVersion(draft.key, doc.liveVersion) : null;

    if (live && live.contentHash === hash && doc?.storeName === draft.storeName) {
        return { ...base, outcome: "unchanged", version: live.version };
    }

    const guarded = draft.origin !== "manual" && !options.force;
    if (guarded && size < MIN_CHARS) {
        return { ...base, outcome: "held", detail: `page looks empty (${size} chars); kept the live version` };
    }
    if (guarded && live && size < live.chars * MAX_SHRINK) {
        return {
            ...base,
            outcome: "held",
            detail: `shrank from ${live.chars} to ${size} chars; kept v${live.version}. Check the page, then sync with --force`,
        };
    }

    if (options.dryRun) {
        const what = live ? `would replace v${live.version} (${live.chars} → ${size} chars)` : `new (${size} chars)`;
        return { ...base, outcome: "dry-run", detail: what };
    }

    const version = await deps.store.addVersion(draft, hash);
    try {
        const geminiDocument = await deps.publisher.upload({
            storeName: draft.storeName,
            displayName: `${draft.title} (v${version})`.slice(0, 500),
            data: draft.file ? draft.file.data : draft.text,
            mimeType: draft.file ? draft.file.mimeType : "text/plain",
            metadata: {
                kb_key: draft.key.slice(0, 250),
                kb_version: version,
                kb_origin: draft.origin,
                kb_unit: draft.unitId,
                kb_author: draft.author.slice(0, 100),
                kb_updated: new Date().toISOString().slice(0, 10),
                ...(draft.sourceUrl ? { kb_source: draft.sourceUrl.slice(0, 250) } : {}),
            },
        });
        await deps.store.setLive(draft.key, version, geminiDocument);
        if (doc?.geminiDocument && doc.geminiDocument !== geminiDocument) {
            try {
                await deps.publisher.remove(doc.geminiDocument);
            } catch (error: any) {
                return { ...base, outcome: "published", version, detail: `old v${doc.liveVersion} not removed: ${error?.message || error}` };
            }
        }
        return { ...base, outcome: "published", version, detail: live ? `replaced v${live.version}` : "new" };
    } catch (error: any) {
        return { ...base, outcome: "failed", version, detail: `upload failed, live version unchanged: ${error?.message || error}` };
    }
}

/** Publishes many drafts, a few at a time. */
export async function publishAll(
    drafts: KbDraft[],
    deps: { store: KbVersionStore; publisher: KbPublisher },
    options: PublishOptions & { concurrency?: number; onItem?: (item: KbRunItem) => void } = {}
): Promise<KbRunItem[]> {
    const queue = [...drafts];
    const items: KbRunItem[] = [];
    const worker = async () => {
        for (let draft = queue.shift(); draft; draft = queue.shift()) {
            const item = await publishDraft(draft, deps, options);
            items.push(item);
            options.onItem?.(item);
        }
    };
    await Promise.all(Array.from({ length: options.concurrency ?? 3 }, worker));
    return items;
}

/**
 * Takes a document out of the store (e.g. an announcement past its window).
 * Its versions stay in the history; publishing it again later works as usual.
 */
export async function retireDocument(
    key: string,
    reason: string,
    deps: { store: KbVersionStore; publisher: KbPublisher },
    options: { dryRun?: boolean } = {}
): Promise<KbRunItem | null> {
    const doc = await deps.store.getDocument(key);
    if (!doc || !doc.liveVersion) return null;
    const base = { key, title: doc.title, unitId: doc.unitId, version: doc.liveVersion };
    if (options.dryRun) return { ...base, outcome: "dry-run", detail: `would retire: ${reason}` };
    try {
        if (doc.geminiDocument) await deps.publisher.remove(doc.geminiDocument);
        await deps.store.setLive(key, 0, "");
        return { ...base, outcome: "retired", detail: reason };
    } catch (error: any) {
        return { ...base, outcome: "failed", detail: `could not retire: ${error?.message || error}` };
    }
}

/** Publishes an earlier version's text again as the newest version. */
export async function rollback(
    key: string,
    toVersion: number,
    author: string,
    deps: { store: KbVersionStore; publisher: KbPublisher }
): Promise<KbRunItem> {
    const doc = await deps.store.getDocument(key);
    const old = await deps.store.getVersion(key, toVersion);
    if (!doc || !old) return { key, title: key, unitId: doc?.unitId ?? "", outcome: "failed", detail: `v${toVersion} not found` };
    return publishDraft(
        {
            key,
            unitId: doc.unitId,
            storeName: doc.storeName,
            title: old.title,
            origin: doc.origin,
            sourceUrl: doc.sourceUrl,
            text: old.text,
            file: old.file,
            author,
            note: `rollback to v${toVersion}`,
        },
        deps,
        { force: true }
    );
}
