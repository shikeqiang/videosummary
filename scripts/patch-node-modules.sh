#!/usr/bin/env bash
# =====================================================================
# scripts/patch-node-modules.sh
#
# Re-applies workarounds for Plasmo 0.86 + Parcel bugs and missing native
# modules. Run AFTER every `npm install` / `pnpm install` in extension/.
#
# Idempotent — safe to run multiple times.
#
# Patches applied:
#   1. sharp (no-op stub)                  — replaces native binary dep
#   2. @plasmo-static-common               — package not in npm but Plasmo imports it
#   3. @plasmohq/parcel-resolver           — add .css to ext list for ~/ aliases
#   4. @plasmohq/parcel-resolver-post      — x() must try path AS-IS
#
# Usage:
#   bash scripts/patch-node-modules.sh            # apply all
#   bash scripts/patch-node-modules.sh --verify   # just check
#   bash scripts/patch-node-modules.sh --reset    # remove patches
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

EXT_DIR="$ROOT/extension"
NM="$EXT_DIR/node_modules"
PATCH_DIR="$ROOT/scripts/patches"

MODE="apply"
for arg in "$@"; do
  case "$arg" in
    --verify) MODE="verify" ;;
    p5)       MODE="p5" ;;
    --reset|--revert) MODE="reset" ;;
    --help|-h) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg"; exit 1 ;;
  esac
done

if [ ! -d "$NM" ]; then
  echo "✗ $NM not found. Run 'npm install' in $EXT_DIR/ first."
  exit 1
fi

PASS=0; FAIL=0
ok()  { echo "  ✓ $*"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $*"; FAIL=$((FAIL+1)); }
note(){ echo "  · $*"; }
PATCHES_TOTAL=5

# Marker used to verify stub patches
MARKER="// === PATCHED-BY-scripts-patch-node-modules.sh ==="

# --------------------------------------------------------------------
# Helper: file-copy patch (idempotent)
# --------------------------------------------------------------------
copy_stub() {
  local src_file="$1"
  local dst_file="$2"
  if [ -f "$dst_file" ] && grep -qF "$MARKER" "$dst_file" 2>/dev/null; then
    ok "$(basename "$dst_file") stub already applied"
  else
    mkdir -p "$(dirname "$dst_file")"
    cp "$src_file" "$dst_file"
    ok "$(basename "$dst_file") stub installed"
  fi
}

# Helper: text-replace patch via python (handles all bash escaping)
text_replace() {
  local file="$1"
  local old="$2"
  local new="$3"
  python3 -c '
import sys
f, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(f).read()
if new in src:
  print("already", file=sys.stderr)
  sys.exit(0)
if old not in src:
  print("not_found", file=sys.stderr)
  sys.exit(1)
open(f, "w").write(src.replace(old, new, 1))
' "$file" "$old" "$new"
}

# ====================================================================
# Patch 1: sharp stub
# ====================================================================
P5_MANIFEST="$EXT_DIR/build/chrome-mv3-prod/manifest.json"
P5_PKG="$EXT_DIR/package.json"
patch_p5() {
  python3 - <<PYEOF
import json, os, sys
manifest = "$P5_MANIFEST"
pkg = "$P5_PKG"
if not (os.path.exists(manifest) and os.path.exists(pkg)):
    print("  ok manifest not yet built (skip)")
    sys.exit(0)
m = json.load(open(manifest))
p = json.load(open(pkg))
if not m.get("name"):
    new_name = p.get("display") or p.get("name") or "YouTube AI Summary"
    m["name"] = new_name
    json.dump(m, open(manifest, "w"), indent=2)
    print(f"  ok manifest name patched: \"{new_name}\"")
else:
    print(f"  ok manifest name already set (=\"{m['name']}\"), skip")
PYEOF
}

case "$MODE" in
  p5)
    # post-build only: manifest name patch
    patch_p5
    exit 0
    ;;
  apply)
    copy_stub "$PATCH_DIR/sharp/lib/index.js" "$NM/sharp/lib/index.js"
    cat > "$NM/sharp/package.json" <<JSON
{
  "name": "sharp",
  "version": "0.33.5-stub",
  "main": "lib/index.js",
  "description": "STUB — see scripts/patches/sharp/lib/index.js"
}
JSON
    ok "sharp package.json written"
    ;;
  verify)
    if [ -f "$NM/sharp/lib/index.js" ] && grep -qF "$MARKER" "$NM/sharp/lib/index.js" 2>/dev/null; then
      ok "sharp stub present"
    else
      bad "sharp stub MISSING"
    fi
    ;;
  reset)
    note "sharp: stub is a complete replacement; removing means re-running 'npm install sharp --include=optional'"
    note "  rm -rf $NM/sharp && cd $EXT_DIR && npm install sharp --include=optional"
    ;;
esac

# ====================================================================
# Patch 2: @plasmo-static-common stub
# ====================================================================

case "$MODE" in
  p5)
    # post-build only: manifest name patch
    patch_p5
    exit 0
    ;;
  apply)
    copy_stub "$PATCH_DIR/@plasmo-static-common/package.json" "$NM/@plasmo-static-common/package.json"
    copy_stub "$PATCH_DIR/@plasmo-static-common/react/package.json" "$NM/@plasmo-static-common/react/package.json"
    copy_stub "$PATCH_DIR/@plasmo-static-common/react/index.js" "$NM/@plasmo-static-common/react/index.js"
    ;;
  verify)
    if [ -f "$NM/@plasmo-static-common/react/index.js" ] && grep -qF "$MARKER" "$NM/@plasmo-static-common/react/index.js" 2>/dev/null; then
      ok "@plasmo-static-common stub present"
    else
      bad "@plasmo-static-common stub MISSING"
    fi
    ;;
  reset)
    rm -rf "$NM/@plasmo-static-common"
    ok "@plasmo-static-common stub removed"
    ;;
esac

# ====================================================================
# Patch 3: @plasmohq/parcel-resolver (add .css to ext list)
# ====================================================================
P3_FILE="$NM/@plasmohq/parcel-resolver/dist/index.js"
# Bundled file has unescaped quotes: var l=[".ts",...]
P3_OLD='var l=[".ts",".tsx",".svelte",".vue",".json"]'
P3_NEW='var l=[".ts",".tsx",".svelte",".vue",".json",".css"]'


case "$MODE" in
  p5)
    # post-build only: manifest name patch
    patch_p5
    exit 0
    ;;
  apply)
    if [ ! -f "$P3_FILE" ]; then
      bad "@plasmohq/parcel-resolver/dist/index.js missing (npm not installed?)"
    else
      # Already patched?
      if grep -qF "$P3_NEW" "$P3_FILE" 2>/dev/null; then
        ok "parcel-resolver .css patch already applied"
      elif grep -qF "$P3_OLD" "$P3_FILE" 2>/dev/null; then
        # Use python helper (handles quoting safely)
        if text_replace "$P3_FILE" "$P3_OLD" "$P3_NEW"; then
          ok "parcel-resolver: added .css to ext list"
        else
          bad "parcel-resolver: text_replace failed"
        fi
      else
        bad "parcel-resolver: original pattern not found — Plasmo version may differ"
      fi
    fi
    ;;
  verify)
    if [ -f "$P3_FILE" ] && grep -qF "$P3_NEW" "$P3_FILE" 2>/dev/null; then
      ok "parcel-resolver .css patch present"
    else
      bad "parcel-resolver .css patch MISSING"
    fi
    ;;
  reset)
    if grep -qF "$P3_NEW" "$P3_FILE" 2>/dev/null; then
      text_replace "$P3_FILE" "$P3_NEW" "$P3_OLD" >/dev/null
      ok "parcel-resolver .css patch reverted"
    fi
    ;;
esac

# ====================================================================
# Patch 4: @plasmohq/parcel-resolver-post (x() tries path AS-IS)
# ====================================================================
P4_FILE="$NM/@plasmohq/parcel-resolver-post/dist/index.js"
# Both patterns contain backticks and ${} — use python for safe substitution
P4_OLD='function x(t,e=y){return e.flatMap(r=>[(0,d.resolve)(`${t}${r}`),(0,d.resolve)(t,`index${r}`)]).find(B)}'
P4_NEW='function x(t,e=y){const c=[t,...e.flatMap(r=>[(0,d.resolve)(`${t}${r}`),(0,d.resolve)(t,`index${r}`)])];return c.find(B)}'


case "$MODE" in
  p5)
    # post-build only: manifest name patch
    patch_p5
    exit 0
    ;;
  apply)
    if [ ! -f "$P4_FILE" ]; then
      bad "@plasmohq/parcel-resolver-post/dist/index.js missing (npm not installed?)"
    else
      if grep -qF 'const c=[t,...e.flatMap' "$P4_FILE" 2>/dev/null; then
        ok "parcel-resolver-post x() patch already applied"
      elif grep -qF "$P4_OLD" "$P4_FILE" 2>/dev/null; then
        if text_replace "$P4_FILE" "$P4_OLD" "$P4_NEW"; then
          ok "parcel-resolver-post x() patched"
        else
          bad "parcel-resolver-post: text_replace failed"
        fi
      else
        bad "parcel-resolver-post: original pattern not found — Plasmo version may differ"
      fi
    fi
    ;;
  verify)
    if [ -f "$P4_FILE" ] && grep -qF 'const c=[t,...e.flatMap' "$P4_FILE" 2>/dev/null; then
      ok "parcel-resolver-post x() patch present"
    patch_p5 || FAIL=$((FAIL+1))
    if grep -qF '"name": "YouTube AI Summary"' "$EXT_DIR/build/chrome-mv3-prod/manifest.json" 2>/dev/null; then
      ok "manifest name patched"
    else
      bad "manifest name still empty"
    fi
    else
      bad "parcel-resolver-post x() patch MISSING"
    fi
    ;;
  reset)
    if grep -qF 'const c=[t,...e.flatMap' "$P4_FILE" 2>/dev/null; then
      text_replace "$P4_FILE" "$P4_NEW" "$P4_OLD" >/dev/null
      ok "parcel-resolver-post x() patch reverted"
    fi
    ;;
esac

# ----- summary -----
echo
echo "============================================="

case "$MODE" in
  p5)
    # post-build only: manifest name patch
    patch_p5
    exit 0
    ;;
  apply)
    echo "  Patches applied: $PASS  ·  Failed: $FAIL"
    if [ "$FAIL" -gt 0 ]; then
      echo "  ⚠ Some patches failed — most likely cause: Plasmo version changed"
      echo "  Open an issue: https://github.com/PlasmoHQ/plasmo/issues"
      exit 1
    fi
    ;;
  verify)
    echo "  Status: $PASS / $PATCHES_TOTAL applied  ·  $FAIL missing"
    if [ "$FAIL" -gt 0 ]; then
      echo "  → Run 'bash scripts/patch-node-modules.sh' (no flag) to fix"
      exit 1
    fi
    ;;
  reset)
    echo "  Reset complete: $PASS  ·  $FAIL"
    ;;
esac
echo "============================================="

# ----- 5. (post-build) manifest name patch -----
# Plasmo 0.86 生成的 chrome-mv3.plasmo.manifest.json 里 name 字段为空
# build 完后在 build/chrome-mv3-prod/manifest.json 把空 name 替换为 package.json 的 display 字段
P5_MANIFEST="$EXT_DIR/build/chrome-mv3-prod/manifest.json"
P5_PKG="$EXT_DIR/package.json"
