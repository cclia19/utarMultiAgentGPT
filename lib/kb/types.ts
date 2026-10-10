/**
 * Knowledge-base documents managed by the sync pipeline and the admin uploader.
 *
 * A document has a stable key ("web:study.utar.edu.my/computer-science.php",
 * "manual:fict:fict-handbook-2026"). Every change creates a new version; the
 * text of every version is kept so any of them can be published again.
 * Documents in the Gemini stores that this system did not create (the old
 * intranet uploader) are never touched.
 */

/** Where a document comes from. Sync never touches "manual" documents. */
export type KbOrigin = "web" | "portal" | "manual";

/** A document as produced by a source (crawler or uploader), before versioning. */
export type KbDraft = {
    key: string;
    /** Org unit id (lib/orgUnits.ts) whose store receives it. */
    unitId: string;
    /** Gemini File Search store resource name. */
    storeName: string;
    title: string;
    origin: KbOrigin;
    sourceUrl?: string;
    /** Markdown / plain text sent to File Search (a short description when `file` is set). */
    text: string;
    /** An uploaded file sent as-is (PDF): kept with the version for rollback. */
    file?: KbFile;
    /** Who made the change: "sync:public", "sync:portal", an admin's name. */
    author: string;
    note?: string;
};

export type KbFile = { data: Uint8Array; mimeType: string; name: string };

export type KbVersion = {
    key: string;
    version: number;
    contentHash: string;
    text: string;
    file?: KbFile;
    chars: number;
    title: string;
    author: string;
    note?: string;
    createdAt: string;
    /** Gemini document resource name while this version is live. */
    geminiDocument?: string;
};

export type KbDocument = {
    key: string;
    unitId: string;
    storeName: string;
    title: string;
    origin: KbOrigin;
    sourceUrl?: string;
    /** Version currently in the store (0 = never published). */
    liveVersion: number;
    geminiDocument?: string;
    updatedAt: string;
};

export type KbRunItem = {
    key: string;
    title: string;
    unitId: string;
    outcome: "published" | "unchanged" | "held" | "failed" | "dry-run" | "note";
    detail?: string;
    version?: number;
};

export type KbRun = {
    id?: number;
    kind: string;
    startedAt: string;
    finishedAt?: string;
    items: KbRunItem[];
};

/** Persistence for documents, versions and run reports. */
export interface KbVersionStore {
    getDocument(key: string): Promise<KbDocument | null>;
    getVersion(key: string, version: number): Promise<KbVersion | null>;
    listDocuments(unitId?: string): Promise<KbDocument[]>;
    listVersions(key: string): Promise<Omit<KbVersion, "text" | "file">[]>;
    /** Adds the next version of a document (creating the document if new). Returns its number. */
    addVersion(draft: KbDraft, contentHash: string): Promise<number>;
    /** Marks a version as the one in the store. */
    setLive(key: string, version: number, geminiDocument: string): Promise<void>;
    saveRun(run: KbRun): Promise<number>;
    listRuns(limit?: number): Promise<KbRun[]>;
}

/** Writes documents to Gemini File Search stores. */
export interface KbPublisher {
    /** Uploads text as a new document and returns its resource name. */
    upload(params: { storeName: string; displayName: string; data: string | Uint8Array; mimeType: string; metadata: Record<string, string | number> }): Promise<string>;
    /** Removes a document this system published earlier. */
    remove(documentName: string): Promise<void>;
}
