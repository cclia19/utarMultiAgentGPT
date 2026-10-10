#!/usr/bin/env bash
# One-time setup of the monthly UTAR portal sync on a Mac (e.g. the Mac mini).
# Run from the repository folder:   bash scripts/setup-portal-mac.sh
#
# Installs what is missing (Homebrew Node, pnpm, project packages, the
# Playwright browser), asks for the two secrets (typed by you, hidden, saved
# only to .env.local on this Mac), runs a short dry run (a browser window
# opens: sign in to the portal), then installs the monthly schedule.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
say() { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }

say "1/6 Node.js"
if ! command -v node >/dev/null 2>&1; then
  command -v brew >/dev/null 2>&1 || { echo "Install Homebrew first: https://brew.sh (then re-run)"; exit 1; }
  brew install node@24 && brew link --overwrite --force node@24
fi
node -v

say "2/6 pnpm and project packages"
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@10
pnpm install --frozen-lockfile

say "3/6 Browser for the portal sign-in (Playwright Chromium)"
npx playwright install chromium

say "4/6 Secrets in .env.local (only on this Mac, never committed)"
touch .env.local
ask() { # name, hint
  if grep -q "^$1=." .env.local; then echo "$1 already set"; return; fi
  printf "%s (%s): " "$1" "$2"; read -rs value; echo
  [ -n "$value" ] || { echo "skipped $1"; return; }
  grep -v "^$1=" .env.local > .env.local.tmp || true; mv .env.local.tmp .env.local
  printf '%s=%s\n' "$1" "$value" >> .env.local
}
ask GEMINI_API_KEY "aistudio.google.com/apikey, same as the GitHub secret"
ask DATABASE_URL "postgresql://… from Vercel → Storage → Neon → .env.local tab"
grep -q '^GOOGLE_SHEETS_WEBHOOK_URL=' .env.local || echo 'GOOGLE_SHEETS_WEBHOOK_URL=off' >> .env.local
chmod 600 .env.local

say "5/6 Dry run (a browser window opens: sign in to the UTAR portal; nothing is published)"
node scripts/kb-portal-sync.mjs --only "regulations" || true
echo "Report: $(dirname "$REPO")/kb-portal-sync-report.md"

say "6/6 Monthly schedule (1st of each month, 10:00)"
bash scripts/install-portal-schedule.sh

cat <<'NOTE'

Done. Keep this Mac signed in to your user account (the sign-in window needs
a desktop session). If it is asleep at 10:00 on the 1st, the sync starts when
it wakes. To publish the first full load now:  node scripts/kb-portal-sync.mjs --apply
NOTE
