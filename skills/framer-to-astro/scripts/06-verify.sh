#!/usr/bin/env bash
# Verify the converted Astro site against the original FramerExport output.
# Boots `astro dev`, fetches every route, and compares body content (whitespace-
# normalised) against the source HTML. Reports diffs and missing routes.
#
# Usage: bash 06-verify.sh <astro-dir>
set -euo pipefail

AST="${1:-}"
if [ -z "$AST" ]; then
  echo "usage: $0 <astro-dir>" >&2
  exit 2
fi
if [ ! -f "$AST/.framer-extract/pages.json" ]; then
  echo "error: $AST/.framer-extract/pages.json not found. Did you run 02-extract-pages.mjs?" >&2
  exit 2
fi

# Source dir is the sibling without the -astro suffix
SRC="${AST%-astro}"
if [ ! -d "$SRC" ]; then
  echo "error: source dir '$SRC' not found (expected sibling of '$AST')" >&2
  exit 2
fi

# Pick a free port (4321 is Astro's default; bump if taken)
PORT=4321
while lsof -i ":$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

# Pick a digest tool that exists on this OS (BSD `md5`, GNU `md5sum`).
if command -v md5sum >/dev/null 2>&1; then
  DIGEST() { md5sum | awk '{print $1}'; }
elif command -v md5 >/dev/null 2>&1; then
  DIGEST() { md5 -q; }
else
  echo "error: no md5 tool found (need md5 or md5sum)" >&2
  exit 2
fi

echo "[verify] starting astro dev on :$PORT in $AST"
cd "$AST"
# Run dev in background, capture pid for cleanup
npx astro dev --port "$PORT" --host 127.0.0.1 >/tmp/astro-dev-$$.log 2>&1 &
DEV_PID=$!
trap "kill $DEV_PID 2>/dev/null || true; rm -f /tmp/astro-dev-$$.log /tmp/astro-served-$$.html" EXIT

# Wait for server to come up (max 30s)
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
if ! curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  echo "error: astro dev did not come up. log:" >&2
  cat /tmp/astro-dev-$$.log >&2
  exit 1
fi

# Read each route from pages.json (path passed via env var, NOT string-interpolated
# into JS — this avoids breaking on spaces, parens, or quotes in the path).
ROUTES=$(AST_PATH="$AST" node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.AST_PATH+'/.framer-extract/pages.json')).map(p => p.route).join('\n'))")

OK=0; DIFF=0; FAIL=0
echo "[verify] checking routes…"
while IFS= read -r route; do
  [ -z "$route" ] && continue
  url="http://127.0.0.1:$PORT$route"
  if ! curl -fsS "$url" -o "/tmp/astro-served-$$.html"; then
    echo "  ✗ $route  (404 / server error)"
    FAIL=$((FAIL + 1))
    continue
  fi
  # Find the source file for this route — same env-var trick
  src_file=$(AST_PATH="$AST" ROUTE="$route" node -e "const p=JSON.parse(require('fs').readFileSync(process.env.AST_PATH+'/.framer-extract/pages.json')).find(p=>p.route===process.env.ROUTE); process.stdout.write(p?p.sourceFile:'')")
  if [ -z "$src_file" ] || [ ! -f "$SRC/$src_file" ]; then
    echo "  ? $route  (no source file recorded)"
    FAIL=$((FAIL + 1))
    continue
  fi
  # Whitespace-normalise both, compare
  served_hash=$(tr -s '[:space:]' ' ' < "/tmp/astro-served-$$.html" | DIGEST)
  source_hash=$(tr -s '[:space:]' ' ' < "$SRC/$src_file" | DIGEST)
  if [ "$served_hash" = "$source_hash" ]; then
    echo "  ✓ $route"
    OK=$((OK + 1))
  else
    echo "  ≈ $route  (content differs — check diff)"
    DIFF=$((DIFF + 1))
  fi
done <<EOF
$ROUTES
EOF

echo
echo "[verify] $OK identical, $DIFF differ, $FAIL failed/missing"
echo "[verify] dev server log: /tmp/astro-dev-$$.log (cleaned on exit)"
echo "[verify] for visual diff, open both http://127.0.0.1:$PORT/ and the original side-by-side"
