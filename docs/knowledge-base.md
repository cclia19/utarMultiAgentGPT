# Knowledge base: sources, sync and versions

Source of truth, in order: **UTAR portal** → **staff uploads** → **web search** (kept for news and anything recent).

## Where documents come from

| Source | How it updates | Code |
| --- | --- | --- |
| Public UTAR sites (study.utar.edu.my programmes: overview + programme structure, filed in the faculty's store) | Automatically, 1st of each month (GitHub Actions) | `lib/kb/sources/`, `scripts/kb-sync.mjs`, `.github/workflows/kb-sync.yml` |
| Public pages the portal links to (DACE intakes and academic calendar) | Monthly with the public sync | `lib/kb/sources/publicPages.ts` |
| UTAR student intranet (login required): rules and regulations, academic handbook, examination notices, postgraduate, UTAR guidelines, clubs and societies forms (as an index), programme structures (recent intakes), announcements (last 90 days) | 1st of each month, 10:00, on the admin's Mac: a browser window opens, you sign in, the sync continues | `lib/kb/sources/portal.ts`, `scripts/kb-portal-sync.mjs`, `scripts/install-portal-schedule.sh` |
| Staff uploads (PDF, Word, Markdown, text, HTML) | `/admin/upload` | `app/admin/upload`, `app/api/admin/kb` |
| Older documents from the intranet uploader | Not changed by any of the above; listed as "older uploads" | – |

Every document is versioned in Postgres (`kb_documents`, `kb_versions`, `kb_runs`, same database as the usage analytics). Each Gemini document carries metadata: `kb_key`, `kb_version`, `kb_origin`, `kb_unit`, `kb_author`, `kb_updated`, `kb_source`.

## What the portal sync never collects

Anything personal or interactive: results, student feedback, applications, Microsoft/Google forms, past year papers, exam timetables (per-student; may be added near exam time), programme structures made for one student (a name or student ID in the description), and the signed-in person's name on announcement pages. Your password is never read or stored; the sync's browser keeps its own profile in `~/.utarchat-kb/portal-profile`.

## Safeguards

- Unchanged pages are skipped (the "retrieved on" date is ignored).
- A crawled page that is almost empty or shrank by more than half is **held**: the live version stays and the run report says so. Publish it anyway with `node scripts/kb-sync.mjs --force --only <page>`.
- The new version is uploaded before the old one is removed, so a department never loses a document mid-sync.
- Announcements older than 90 days are retired (removed from the store, history kept). Nothing else is removed automatically.
- Any version can be made live again from `/admin/upload` (History → Make live again).
- **Remove** (staff uploads): takes a document out of the chatbot's knowledge; its versions stay, so History → Make live again brings it back. Web and portal documents cannot be removed there (the monthly sync re-adds them).
- **Older uploads** (previous intranet uploader): **Replace with new version** uploads the newer file with versioning and removes the old one only once the new one is live; **Remove** deletes it for good (that uploader kept no copy).

## One-time setup

1. GitHub → repository → Settings → Secrets and variables → Actions: add `GEMINI_API_KEY` and `DATABASE_URL` (same values as in Vercel).
2. First load: Actions → "Knowledge-base sync" → Run workflow, first with *apply* off (dry run, read the report), then with *apply* on.
3. Ask UTAR IT to point `chat.utar.edu.my/admin/upload` at `https://utar-multi-agent-gpt.vercel.app/admin/upload` with a **redirect or link, not an iframe**: the sign-in cookie is not sent inside a frame from another site.

## Portal sync on the admin's Mac

- Install the monthly schedule: `bash scripts/install-portal-schedule.sh` (needs `DATABASE_URL` in `.env.local`). Remove: `--uninstall`. Run now: `--run-now`.
- Or by hand: `node scripts/kb-portal-sync.mjs` (dry run) · `--apply` · `--only regulations|structures|announcements`.
- Report: `kb-portal-sync-report.md` next to the repo folder, and `/admin/upload` → "Sync & upload history". Log: `~/.utarchat-kb/portal-sync.log`.

## Setting up the portal sync on a new Mac (e.g. the Mac mini)

1. Sign in to macOS with the account that will run the sync, and install Homebrew (https://brew.sh) and the Xcode command line tools (`xcode-select --install`).
2. Get the code: `git clone https://github.com/cclia19/utarMultiAgentGPT.git && cd utarMultiAgentGPT` (until PR #10 is merged: `git checkout feat/kb-portal-sync`).
3. Run `bash scripts/setup-portal-mac.sh`: installs Node, pnpm, packages and the Playwright browser; asks for `GEMINI_API_KEY` and `DATABASE_URL` (hidden input, saved only to `.env.local`); does a short dry run (sign in to the portal in the window that opens); installs the monthly schedule.
4. System Settings: keep the account signed in; Energy → "Prevent automatic sleeping" (or accept that the sync starts on wake); allow notifications for Script Editor so the "please sign in" reminder shows.
5. First full load: `node scripts/kb-portal-sync.mjs --apply` (sign in when the window opens).
6. On the old Mac, remove its schedule if it was installed: `bash scripts/install-portal-schedule.sh --uninstall`.

## Day to day

- Monthly report: Actions → latest "Knowledge-base sync" run (summary page), or `/admin/upload` → "Sync & upload history". Look at *held* and *failed* items.
- Run it now: Actions → Run workflow (optionally *only* = a page name or URL part).
- Locally: `node scripts/kb-sync.mjs` (dry run) · `--apply` · `--only computer-science` · `--force`.
- `node scripts/kb-selftest.mjs` checks upload → replace → retrieval → cleanup against Gemini in a temporary store.
- `pnpm dev` without `DATABASE_URL` runs `/admin/upload` in **local test mode**: versions go to `../kb-admin-local-state.json` and uploads are only recorded; the live stores are not changed.

## Limits

- PDFs over 4 MB (Vercel request limit): save as Word and upload that (Word, HTML and text are converted to Markdown in the browser, so size is not an issue).
- Bus timetables are not taken from the knowledge base: `lib/busSchedule.ts` holds them as data (update each schedule period).
