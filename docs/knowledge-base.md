# Knowledge base: sources, sync and versions

Source of truth, in order: **UTAR portal** → **staff uploads** → **web search** (kept for news and anything recent).

## Where documents come from

| Source | How it updates | Code |
| --- | --- | --- |
| Public UTAR sites (study.utar.edu.my programmes: overview + programme structure, filed in the faculty's store) | Automatically, 1st of each month (GitHub Actions) | `lib/kb/sources/`, `scripts/kb-sync.mjs`, `.github/workflows/kb-sync.yml` |
| UTAR portal (login required) | Once a month; you sign in, the sync continues | to be added once the portal sections are mapped |
| Staff uploads (PDF, Word, Markdown, text, HTML) | `/admin/upload` | `app/admin/upload`, `app/api/admin/kb` |
| Older documents from the intranet uploader | Not changed by any of the above; listed as "older uploads" | – |

Every document is versioned in Postgres (`kb_documents`, `kb_versions`, `kb_runs`, same database as the usage analytics). Each Gemini document carries metadata: `kb_key`, `kb_version`, `kb_origin`, `kb_unit`, `kb_author`, `kb_updated`, `kb_source`.

## Safeguards

- Unchanged pages are skipped (the "retrieved on" date is ignored).
- A crawled page that is almost empty or shrank by more than half is **held**: the live version stays and the run report says so. Publish it anyway with `node scripts/kb-sync.mjs --force --only <page>`.
- The new version is uploaded before the old one is removed, so a department never loses a document mid-sync.
- Any version can be made live again from `/admin/upload` (History → Make live again).

## One-time setup

1. GitHub → repository → Settings → Secrets and variables → Actions: add `GEMINI_API_KEY` and `DATABASE_URL` (same values as in Vercel).
2. First load: Actions → "Knowledge-base sync" → Run workflow, first with *apply* off (dry run, read the report), then with *apply* on.
3. Ask UTAR IT to point `chat.utar.edu.my/admin/upload` at `https://utar-multi-agent-gpt.vercel.app/admin/upload` with a **redirect or link, not an iframe**: the sign-in cookie is not sent inside a frame from another site.

## Day to day

- Monthly report: Actions → latest "Knowledge-base sync" run (summary page), or `/admin/upload` → "Sync & upload history". Look at *held* and *failed* items.
- Run it now: Actions → Run workflow (optionally *only* = a page name or URL part).
- Locally: `node scripts/kb-sync.mjs` (dry run) · `--apply` · `--only computer-science` · `--force`.
- `node scripts/kb-selftest.mjs` checks upload → replace → retrieval → cleanup against Gemini in a temporary store.
- `pnpm dev` without `DATABASE_URL` runs `/admin/upload` in **local test mode**: versions go to `../kb-admin-local-state.json` and uploads are only recorded; the live stores are not changed.

## Limits

- PDFs over 4 MB (Vercel request limit): save as Word and upload that (Word, HTML and text are converted to Markdown in the browser, so size is not an issue).
- Bus timetables are not taken from the knowledge base: `lib/busSchedule.ts` holds them as data (update each schedule period).
