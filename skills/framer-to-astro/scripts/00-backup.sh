#!/usr/bin/env bash
# Backup the source FramerExport output before any conversion touches it.
# Aborts if the source dir doesn't look like a FramerExport output.
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
if [ ! -f "$SRC/index.html" ]; then
  echo "error: '$SRC/index.html' not found — does not look like a FramerExport output" >&2
  exit 2
fi

# Detect: must contain a Framer hydration marker in index.html.
# Skill is invoked from non-interactive contexts (Claude Code, CI), so no prompt —
# require an explicit --force flag to override the warning.
FORCE=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
  esac
done
# Match data-framer-hydrate-v2, -v3, etc. — version-agnostic so future
# Framer bumps don't break detection.
if ! grep -qE 'data-framer-hydrate-v[0-9]+' "$SRC/index.html"; then
  if [ "$FORCE" = "0" ]; then
    echo "error: '$SRC/index.html' has no 'data-framer-hydrate-vN' marker." >&2
    echo "       This may not be a Framer-generated site. Re-run with --force to override." >&2
    exit 2
  fi
  echo "warning: --force used; backing up despite missing Framer marker" >&2
fi

TS="$(date +%Y%m%d-%H%M%S)"
DEST="${SRC%/}.backup-${TS}"

if [ -e "$DEST" ]; then
  echo "error: backup destination '$DEST' already exists" >&2
  exit 2
fi

echo "[backup] copying '$SRC' → '$DEST'"
# Prefer rsync (portable), fall back to cp. macOS BSD `cp` accepts -a but
# minimal Linux/BusyBox images (some CI containers) do not.
if command -v rsync >/dev/null 2>&1; then
  rsync -a "$SRC/" "$DEST/"
else
  # -RP works on both BSD and GNU cp: recursive, preserve symlinks.
  cp -RP "$SRC" "$DEST"
fi
echo "[backup] done. size:"
du -sh "$DEST" | awk '{print "         " $0}'
