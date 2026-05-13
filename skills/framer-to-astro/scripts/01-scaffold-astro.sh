#!/usr/bin/env bash
# Scaffold a sibling Astro project at <source-dir>-astro/
# Uses templates from ../assets/ for package.json, astro.config.mjs, tsconfig.json.
set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ]; then
  echo "usage: $0 <source-dir>" >&2
  exit 2
fi
if [ ! -d "$SRC" ]; then
  echo "error: '$SRC' is not a directory" >&2
  exit 2
fi

DEST="${SRC%/}-astro"
TEMPLATES="$(cd "$(dirname "$0")/../assets" && pwd)"

if [ -e "$DEST" ]; then
  echo "[scaffold] '$DEST' already exists; skipping create. (templates not re-applied.)"
else
  echo "[scaffold] creating '$DEST'"
  mkdir -p "$DEST/src/layouts" "$DEST/src/components" "$DEST/src/pages" "$DEST/public" "$DEST/.framer-extract"
fi

# Write project files from templates only if missing (idempotent)
write_if_missing() {
  local tmpl="$1" out="$2"
  if [ ! -f "$out" ]; then
    if [ ! -f "$tmpl" ]; then
      echo "error: template '$tmpl' not found" >&2
      exit 2
    fi
    cp "$tmpl" "$out"
    echo "[scaffold] wrote $out"
  else
    echo "[scaffold] keeping existing $out"
  fi
}

write_if_missing "$TEMPLATES/package.json.template" "$DEST/package.json"
write_if_missing "$TEMPLATES/astro.config.mjs.template" "$DEST/astro.config.mjs"
write_if_missing "$TEMPLATES/tsconfig.json.template" "$DEST/tsconfig.json"
write_if_missing "$TEMPLATES/gitignore.template" "$DEST/.gitignore"

# Substitute the project name in package.json (derive from source basename)
SITE_NAME="$(basename "${SRC%/}")"
SITE_SLUG="$(echo "$SITE_NAME" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-')"
[ -z "$SITE_SLUG" ] && SITE_SLUG="framer-astro-site"
# macOS-friendly sed -i ''
sed -i.bak "s/__SITE_SLUG__/$SITE_SLUG/g" "$DEST/package.json" && rm -f "$DEST/package.json.bak"

if [ ! -d "$DEST/node_modules" ]; then
  echo "[scaffold] running 'npm install' in $DEST (this may take a minute)"
  (cd "$DEST" && npm install --silent)
else
  echo "[scaffold] node_modules present; skipping install"
fi

echo "[scaffold] done. project root: $DEST"
