# Verifying parity

## What `06-verify.sh` checks

The verify script:

1. Boots `astro dev` in the converted project on a free port.
2. Reads every route from `.framer-extract/pages.json`.
3. For each route, fetches the served HTML, whitespace-normalises it, and
   compares MD5 against the whitespace-normalised source HTML.
4. Reports identical / differs / failed.

This is a **structural** check, not a visual one. Identical bytes (modulo
whitespace) is a strong signal but not sufficient — Astro may inject HMR
client scripts in dev mode that the source doesn't have.

## Reading the diff

If the verify script reports `≈ /some-route (content differs)`, manually
diff the two files:

```bash
PORT=4321  # whatever the script chose
curl -fsS "http://127.0.0.1:$PORT/some-route" -o /tmp/served.html
diff <(tr -s '[:space:]' ' ' < /path/to/source/some-route.html) \
     <(tr -s '[:space:]' ' ' < /tmp/served.html) | head -50
```

Common harmless diffs:

- Astro injects `<script type="module" src="/@vite/client">` in dev mode.
  Run `astro build && astro preview` for production-mode comparison.
- Astro reformats `<!doctype html>` casing.
- Astro normalises self-closing void elements (`<meta />` → `<meta>`).

Real diffs to investigate:

- Missing chunks of body HTML (a `<Fragment set:html>` boundary lost content)
- Re-encoded entities inside `data-framer-hydrate-v2` JSON
- Modified inline `<style>` content (Astro's HTML compressor — check
  `compressHTML: false` is set in `astro.config.mjs`)

## Visual parity (pixels)

Byte-identity isn't enough — you should also visually compare. Two options:

### Option 1: Browser side-by-side (manual)

Open the source served by `python serve.py` (or any static file server) on
one port, and the Astro dev server on another. Open both in Chrome. Use
the dev tools' device toolbar to test breakpoints. Cycle through every page.

### Option 2: Screenshot diffing (automated)

If the user has the `gstack` skill (this project lists it), it can take
annotated screenshots and diff them. Sketch:

```bash
# Source
python3 -m http.server -d <source-dir> 8001 &
# Astro
(cd <astro-dir> && npx astro dev --port 4321 &)

# Then use /browse to screenshot each route on both, diff visually
```

The skill itself doesn't bundle a screenshot diff tool — keep this as a
follow-up step.

## What to do when something differs

1. **Identify the route.** Verify reports the route name.
2. **Open both HTMLs in an editor with diff support.** Whitespace-normalise
   both first (`tr -s '[:space:]' ' '`) — Astro re-flows whitespace.
3. **Locate the diff in the page anatomy.**
   - Diff in `<head>`? → check `pages.json` `metaTags` / `linkTags` /
     `inlineStyles` arrays for the route.
   - Diff in `<body class>`? → `bodyAttrs` field.
   - Diff inside `#main`? → either the body HTML extraction
     (`hydrateMain` field) or a shared component replacement that
     swallowed too much / too little.
4. **Edit `.framer-extract/pages.json` directly** to fix the field, then
   re-run `05-emit-astro.mjs`.
5. **Re-verify.**

## Acceptance criteria (suggested)

For a "shipped" parity:

- 100% of routes resolve (`OK + DIFF == total`, no `FAIL`).
- 80%+ of routes byte-identical (whitespace-normalised).
- All visual diffs investigated; remaining diffs are HMR-injected dev
  scripts only.
- Production build (`astro build && astro preview`) renders without errors.
- No console errors in the browser on any route.
- One representative animated page tested in browser to confirm hydration
  attaches and animations play.
