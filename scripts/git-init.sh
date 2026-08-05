#!/usr/bin/env bash
# =====================================================================
# scripts/git-init.sh — initial git setup + push to GitHub
#
# Run this ONCE after creating the empty repo on GitHub.
# Idempotent — safe to re-run (it skips already-done steps).
#
# Prereqs:
#   - Empty repo created at https://github.com/shikeqiang/videosummary
#   - SSH key added to your GitHub account (or use HTTPS + PAT)
#
# Usage:
#   bash scripts/git-init.sh                              # SSH (default)
#   bash scripts/git-init.sh --https                     # HTTPS + PAT prompt
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

REMOTE_URL="git@github.com:shikeqiang/videosummary.git"
USE_HTTPS=0

for arg in "$@"; do
  case "$arg" in
    --https) USE_HTTPS=1; REMOTE_URL="https://github.com/shikeqiang/videosummary.git" ;;
    --ssh) USE_HTTPS=0; REMOTE_URL="git@github.com:shikeqiang/videosummary.git" ;;
    --help|-h) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg"; exit 1 ;;
  esac
done

# ----- 1. ensure git is installed -----
if ! command -v git >/dev/null 2>&1; then
  echo "✗ git not found. Install it first:"
  echo "  sudo apt install git     # Debian/Ubuntu"
  echo "  brew install git          # macOS"
  exit 1
fi

# ----- 2. ensure git user is configured -----
if ! git config user.name >/dev/null; then
  echo "→ no git user.name set. Setting to 'shikeqiang' / 005shike@163.com"
  git config user.name "shikeqiang"
  git config user.email "005shike@163.com"
fi
echo "  user.name  = $(git config user.name)"
echo "  user.email = $(git config user.email)"

# ----- 3. init .git if missing -----
if [ ! -d ".git" ]; then
  echo "→ git init"
  rm -rf .git 2>/dev/null || true
  git init -b main
else
  echo "✓ .git already initialized"
fi

# ----- 4. ensure remote -----
if git remote get-url origin >/dev/null 2>&1; then
  EXISTING=$(git remote get-url origin)
  if [ "$EXISTING" != "$REMOTE_URL" ]; then
    echo "→ updating remote origin: $EXISTING → $REMOTE_URL"
    git remote set-url origin "$REMOTE_URL"
  else
    echo "✓ remote origin already correct"
  fi
else
  echo "→ adding remote origin: $REMOTE_URL"
  git remote add origin "$REMOTE_URL"
fi

# ----- 5. show what's about to be committed + safety scan -----
echo
echo "===== about to commit ====="

# Use ls-files (read-only) to get a list
git ls-files --others --exclude-standard > /tmp/.git-files 2>/dev/null ||   find . -type f -not -path './.git/*' -not -path '*/node_modules/*' \
    -not -path '*/.next/*' -not -path '*/.plasmo/*' -not -path '*/build/*' \
    -not -path '*/dist/*' > /tmp/.git-files

TOTAL=$(wc -l < /tmp/.git-files)
echo "  files to be committed: $TOTAL"
echo "  by directory:"
awk -F/ '
  NF >= 2 { print $1 "/" $2; next }
  { print $1 }
' /tmp/.git-files | sort | uniq -c | sort -rn | head -15 | sed 's/^/    /' 

echo
echo "===== safety scan ====="
SCAN_HITS=$(grep -E "(^|/)(api/\\.env\\.local|extension/\\.env\\.production|api/\\.env\\.production|\\.pem$|id_rsa$|credentials\\.json$|service-account\\.json$)" /tmp/.git-files 2>/dev/null || true)
if [ -n "$SCAN_HITS" ]; then
  echo "  ⚠ sensitive files detected:"
  echo "$SCAN_HITS" | sed 's/^/    /'
  echo
  read -r -p "Continue anyway? (these will be committed!) [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "Aborted. Add the files to .gitignore and re-run."
    exit 1
  fi
else
  echo "  ✓ no .env.local / .pem / credentials.json detected"
fi
# ----- 6. stage + commit -----
echo
echo "→ staging all files..."
if ! git add -A; then
  echo "✗ git add failed (lock file? permissions?)"
  echo "  Try: rm -f .git/index.lock && re-run"
  exit 1
fi

# Skip if nothing to commit
if git diff --cached --quiet; then
  echo "✓ nothing to commit (working tree clean)"
else
  echo "→ creating initial commit..."
  if git commit -m "Initial commit: Chrome extension + Next.js API for YouTube AI summaries

- Chrome extension (Plasmo MV3) with content script, popup, options, background SW
- Next.js 14 API with /api/{me, usage, summary, checkout, webhooks/lemonsqueezy}
- Supabase schema (profiles, subscriptions, videos, usage_logs)
- Lemon Squeezy payment integration (MoR, no Stripe)
- CORS middleware + local JWT verification (HS256)
- Assets: 6 logo sizes + 5 store screenshots + 2 promo tiles
- Build pipeline: scripts/build-extension.sh → dist/latest/
- Patch system: scripts/patch-node-modules.sh for Plasmo 0.86 workarounds
- CWS listing copy: docs/STORE_LISTING.md (EN + ZH)"; then
    echo "✓ committed: $(git rev-parse --short HEAD)"
  else
    echo "✗ git commit failed"
    echo "  Check: git status, git log --oneline -1"
    exit 1
  fi
fi

# ----- 7. push -----
echo
echo "===== push to GitHub ====="
echo "Remote: $REMOTE_URL"
echo

if [ "$USE_HTTPS" = "1" ]; then
  echo "HTTPS push requires a Personal Access Token (PAT)."
  echo "Create one at: https://github.com/settings/tokens (scope: repo)"
  echo "When prompted, paste your PAT as the password."
  echo
fi

# Confirm
read -r -p "Push to $REMOTE_URL ? [y/N] " REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  echo "Aborted. Run 'git push -u origin main' manually when ready."
  exit 0
fi

# Push
if git push -u origin main 2>&1 | tee /tmp/.git-push-log; then
  echo
  echo "============================================="
  echo "  ✓ Pushed successfully!"
  echo "  View at: https://github.com/shikeqiang/videosummary"
  echo "============================================="
else
  echo
  echo "============================================="
  echo "  ✗ Push failed. See /tmp/.git-push-log for details."
  echo
  echo "  Common causes:"
  echo "    1. SSH key not added to GitHub → https://github.com/settings/keys"
  echo "    2. Wrong remote URL → check with 'git remote -v'"
  echo "    3. Auth required → re-run with --https and use a PAT"
  echo "    4. Repo not empty (e.g., default README on GitHub) →"
  echo "       go to GitHub repo → Settings → General →"
  echo "       'Delete this repository' then recreate empty"
  echo "============================================="
  exit 1
fi
