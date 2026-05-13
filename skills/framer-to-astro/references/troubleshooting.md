# Troubleshooting

## `00-backup.sh` aborts: "does not look like a FramerExport output"

**Cause:** Source dir has no `index.html`, or `index.html` doesn't contain
`data-framer-hydrate-v2`.

**Fix:** Confirm you pointed at the cloner's *output* directory (the one with
`index.html` at root, sibling `*.html` files, and `/js/`, `/images/` etc.),
not its parent zip dir.

If the source genuinely has no `data-framer-hydrate-v2` (maybe it was a
hand-written static site), the skill is the wrong tool — use a generic
HTML-to-Astro migration approach instead.

## `01-scaffold-astro.sh` fails on `npm install`

**Cause:** Network, npm registry config, or Node version mismatch.

**Fix:** Check `node --version` (must be ≥20). If still broken, manually
`cd <site>-astro && npm install` and read the error. Once installed, re-run
the scaffold script — it skips install if `node_modules/` exists.

## `02-extract-pages.mjs`: "no *.html files found"

**Cause:** Source path wrong, or all HTMLs are inside an ignored directory
(`.backup-*`, `node_modules`).

**Fix:** Run `find <source-dir> -name '*.html' -not -path '*node_modules*'`.
If output is empty, the source dir is wrong.

## `02-extract-pages.mjs`: a page is missing from `pages.json`

**Cause:** The HTML file failed to parse. Look at the script's stderr — it
prints `<rel>: extraction failed — <message>` for each failure.

**Fix:** Check the file manually. Common issues:
- File is empty (cloner failed to download).
- File is HTML5 but uses unusual constructs cheerio can't parse.

For the latter, you can hand-add an entry to `pages.json` matching the
schema other entries use.

## `03-detect-shared-components.mjs`: 0 components detected

**Cause:** The site is small (only 1–2 pages), or its components don't repeat
identically across pages, or the threshold is too strict.

**Fix:** This is fine — the emitter handles 0 shared components. Pages will
just have inline body HTML, which is the original behaviour. If you still
want to extract something, see `references/component-extraction.md` for
threshold tuning.

## `05-emit-astro.mjs`: Astro pages have stray `<!-- @@FRAMER_TO_ASTRO_COMPONENT@@ -->` markers

**Cause:** Bug — the marker insertion succeeded but the segmentation pass
missed one. Check the script output carefully and compare to the structure
in the failing page.

**Fix (workaround):** Open the offending `src/pages/*.astro`, find the marker,
replace with the correct `<ComponentName />` reference.

**Fix (permanent):** Investigate the regex `markerRe` in
`05-emit-astro.mjs` — file an issue/PR if reproducible.

## `astro dev` errors: "Cannot find module 'astro'"

**Cause:** `npm install` was skipped or failed silently.

**Fix:**
```bash
cd <site>-astro
rm -rf node_modules package-lock.json
npm install
```

## `astro dev` errors: "set:html cannot be a URL or non-string"

**Cause:** A page in `pages.json` has a non-string field where the emitter
expects a string (e.g. `inlineStyles[i].css` is `null` or `undefined`).

**Fix:** Open `pages.json`, find the offending page, ensure every
`inlineStyles[i].css` is a string (use `""` if empty). Re-run
`05-emit-astro.mjs`.

## Browser: page renders but no animations / forms broken

**Cause:** JS bundle isn't loading. Open the browser console.

- **404 on `/js/script_main.HASH.mjs`:** chunk not in `public/js/`. Re-run
  `04-copy-assets.mjs`.
- **404 on `/js/chunk-XXX.mjs`:** specific chunk missing. Same fix.
- **CORS / MIME error on .mjs:** see `references/hydration-and-animations.md`.
- **`Cannot find element with id "main"`:** the body HTML extraction missed
  `<div id="main">`. Re-run extract & emit.
- **`data-framer-hydrate-v2` JSON parse error:** the attribute value was
  re-encoded somewhere. Verify `compressHTML: false` is set in
  `astro.config.mjs`.

## Browser: page renders but layout is wrong / fonts missing

**Cause:** Inline `<style>` block didn't make it through, or fonts didn't
copy.

**Fix:**
- Open the served page's source. Find the `<style>` block. Compare its byte
  size to the source HTML's `<style>` block.
- If the served block is much smaller: emitter is dropping content. Check
  `pages.json` `inlineStyles` for the page; ensure the `css` field has
  the full content.
- If served block matches: check `public/fonts/` exists and is populated.
  Re-run `04-copy-assets.mjs`.

## `06-verify.sh`: "astro dev did not come up"

**Cause:** Port conflict, dependency error, or syntax error in an emitted
page.

**Fix:** Read `/tmp/astro-dev-<pid>.log` (the script prints the path). Common
causes:
- Astro syntax error in a generated `*.astro` file (check the line number).
- Port in use; the script tries to find a free one but if all 4321–4400 are
  taken it gives up.

## Re-running the pipeline from scratch

To wipe and re-do everything:

```bash
# Keep the source and the backup; nuke the Astro output
rm -rf <source-dir>-astro

# Re-run from step 1 (scaffold)
bash <skill>/scripts/01-scaffold-astro.sh <source-dir>
# … then steps 2–6
```

`00-backup.sh` will refuse to re-create a backup with the same timestamp,
which is fine — the original backup from your first run is still good.
