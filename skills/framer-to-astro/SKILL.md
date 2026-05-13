---
name: framer-to-astro
description: Convert a Framer-exported or Framer-cloned static site (folder with index.html + /js/ /images/ /fonts/ /assets/) into a working Astro 5 project with 100% visual parity. Backs up the source, scaffolds an Astro project in a sibling folder, copies all assets to /public/, extracts shared regions (Header/Footer/Nav) into Astro components by reading data-framer-name attributes, emits one .astro page per route with the original head meta and body HTML preserved, and keeps the Framer hydration script tag intact so animations/forms keep working. Use when user says any of: "convert/migrate/rebuild/export Framer site to Astro", "framer to astro", "Framer dump to Astro", "eject from Framer", "de-framer", or points at a folder containing index.html with a data-framer-hydrate-v2 attribute.
---

# framer-to-astro

Convert the output of [FramerExport](https://letaiworkforme.com/) (a folder of `*.html` files plus `/js/`, `/images/`, `/fonts/`, `/assets/`) into a working Astro project that renders pixel-identical to the original.

## CRITICAL rules — never skip

1. **Backup first.** Before touching anything, run `scripts/00-backup.sh <source-dir>`. The skill refuses to proceed without a backup.
2. **Never edit the source folder in place.** All output goes into a NEW sibling folder named `<source-name>-astro/`. The source clone is read-only from here on.
3. **Preserve the Framer hydration contract.** Every page MUST keep its `<div id="main" data-framer-hydrate-v2="...">` wrapper AND its `<script type="module" src="/js/script_main.HASH.mjs">` tag, byte-identical. Stripping these breaks every animation and form.
4. **Preserve the inline `<style data-framer-css-ssr-minified>` per page, byte-identical.** Do not dedupe, do not minify further, do not move to global. (See `references/extraction-model.md` for why.)
5. **Asset URLs stay at root paths** (`/js/...`, `/images/...`, `/fonts/...`, `/assets/...`). Astro serves `public/` at root, so URLs do not need rewriting.

## Inputs and outputs

**Input:** A folder produced by FramerExport. Recognised by:
- Top-level `index.html` (always present)
- One or more sibling `*.html` files at root (e.g. `blog.html`, `coaching.html`)
- Optional nested route folders containing `*.html` (e.g. `blog/post-slug.html`)
- Asset directories: `/js/` (with `script_main.*.mjs`), `/images/`, `/fonts/`, `/assets/`
- Tooling artefacts to ignore: `manifest.json`, `serve.py`, `.htaccess`

**Output:** A sibling folder `<source-name>-astro/` containing a complete Astro 5 project:
```
<source-name>-astro/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── public/                 # ALL asset folders moved here as-is
│   ├── js/                 # Framer JS bundles (untouched)
│   ├── images/
│   ├── fonts/
│   └── assets/
└── src/
    ├── layouts/
    │   └── Base.astro      # Shared <head> + <body> shell
    ├── components/
    │   ├── Header.astro    # If detected as repeated
    │   ├── Footer.astro    # If detected as repeated
    │   └── ...             # Other repeats
    └── pages/
        ├── index.astro
        ├── blog.astro
        ├── blog/
        │   └── [slug].astro  # OR concrete slug files; see component-extraction.md
        └── ...
```

## Process

Run the steps in order. Each step is a separate script so you can re-run any step independently.

### Step 0: Install script dependencies (one-time)

The extraction scripts use `cheerio` (HTML parser) and `fast-glob`. Install once:

```bash
cd <skill-dir>/scripts
npm install
```

If the user is running the skill the very first time and `node_modules/` is missing, do this before Step 1.

### Step 1: Backup the source

```bash
bash <skill-dir>/scripts/00-backup.sh "<source-dir>"
```

This creates `<source-dir>.backup-<YYYYMMDD-HHMMSS>/` as a complete copy. The script aborts if the source dir doesn't look like a FramerExport output (no `index.html`).

### Step 2: Scaffold the Astro project

```bash
bash <skill-dir>/scripts/01-scaffold-astro.sh "<source-dir>"
```

Creates `<source-dir>-astro/` (sibling to source) with `package.json`, `astro.config.mjs`, `tsconfig.json`, and the empty `src/` + `public/` skeleton. Uses the templates in `<skill-dir>/assets/`. Runs `npm install` in the new project.

### Step 3: Extract page manifest

```bash
node <skill-dir>/scripts/02-extract-pages.mjs "<source-dir>" "<source-dir>-astro"
```

Walks every `*.html` in the source (recursively, skipping `.backup-*` dirs), parses with cheerio, and writes `<source-dir>-astro/.framer-extract/pages.json` containing one entry per page:
```json
{
  "route": "/blog/some-post",
  "sourceFile": "blog/some-post.html",
  "title": "...",
  "metaTags": [{ "name": "description", "content": "..." }, ...],
  "linkTags": [{ "rel": "icon", "href": "/assets/favicon.svg" }, ...],
  "scriptTags": [{ "src": "/js/script_main.<HASH>.mjs", "type": "module", ...attrs }],
  "inlineStyles": [{ "attrs": { "data-framer-css-ssr-minified": "" }, "css": "...the entire <style> block..." }],
  "hydrateMain": "<div id=\"main\" data-framer-hydrate-v2=\"...\">...</div>",
  "htmlAttrs": { "lang": "en" },
  "bodyAttrs": { "class": "framer-body-XXX" }
}
```

Read `references/extraction-model.md` if you need to understand WHY each field is captured this way.

### Step 4: Detect shared components (repeated regions)

```bash
node <skill-dir>/scripts/03-detect-shared-components.mjs "<source-dir>-astro"
```

Reads `pages.json`, finds **top-level** `data-framer-name="…"` regions (those not nested inside another `data-framer-name`) whose serialised innerHTML matches across **4+ distinct routes OR ≥60% of all routes**, and writes `<source-dir>-astro/.framer-extract/shared-components.json`. Conservative by design: generic Framer-default names (`text`, `Frame32`, `Variant1`, etc.) are denylisted; tiny regions (<1 KB) are skipped; multiple occurrences within a single page are deduped to one route. Typical output: 3–15 components per site.

See `references/component-extraction.md` for the heuristic and how to tune the thresholds (which live at the top of `scripts/03-detect-shared-components.mjs`).

### Step 5: Copy assets

```bash
node <skill-dir>/scripts/04-copy-assets.mjs "<source-dir>" "<source-dir>-astro"
```

Copies `/js/`, `/images/`, `/fonts/`, `/assets/` from source into `<source-dir>-astro/public/` verbatim. Uses hardlinks where possible (cheap, fast). Skips if already copied (idempotent).

### Step 6: Emit Astro files

```bash
node <skill-dir>/scripts/05-emit-astro.mjs "<source-dir>-astro"
```

Reads `pages.json` and `shared-components.json`, then emits:
- `src/layouts/Base.astro` — wraps `<html>`/`<head>`/`<body>` with slots for per-page `<title>`, meta, inline `<style>`, and the `<div id="main">` hydration root.
- `src/components/<Name>.astro` — one per detected shared component.
- `src/pages/<route>.astro` — one per page. Uses `Base.astro`, fills the meta slot from `pages.json`, embeds the page's own inline `<style>` block, and either references shared components OR pastes the body HTML inline.

Templates live in `<skill-dir>/assets/`. Read `references/seo-and-meta.md` for the per-page frontmatter convention.

### Step 7: Verify parity

```bash
bash <skill-dir>/scripts/06-verify.sh "<source-dir>-astro"
```

Starts `astro dev` in the new project, curls every route, and diffs the served HTML against the original source HTML (whitespace-normalised). Reports:
- Routes with byte-identical body content (perfect)
- Routes with diffs (lists hunks)
- Missing routes (404 in Astro but present in source)
- Asset 404s (anything the page references that's not in `public/`)

For visual parity (pixels, not bytes), use the `gstack` browse skill if available — see `references/verify-parity.md`. Without that, open both versions in a browser and diff manually.

## End-to-end one-liner

For convenience, after Step 0 (deps installed):

```bash
SRC="<source-dir>" && \
  bash <skill-dir>/scripts/00-backup.sh "$SRC" && \
  bash <skill-dir>/scripts/01-scaffold-astro.sh "$SRC" && \
  node <skill-dir>/scripts/02-extract-pages.mjs "$SRC" "${SRC}-astro" && \
  node <skill-dir>/scripts/03-detect-shared-components.mjs "${SRC}-astro" && \
  node <skill-dir>/scripts/04-copy-assets.mjs "$SRC" "${SRC}-astro" && \
  node <skill-dir>/scripts/05-emit-astro.mjs "${SRC}-astro" && \
  bash <skill-dir>/scripts/06-verify.sh "${SRC}-astro"
```

## When to load which reference

| Situation | Read |
| --- | --- |
| Need to understand what cloner.js produces and why each field maps to what in Astro | `references/extraction-model.md` |
| Component extraction missed a clear repeat, or extracted something that shouldn't be shared | `references/component-extraction.md` |
| Per-page meta (OG, Twitter, canonical) doesn't match the original | `references/seo-and-meta.md` |
| Fonts not loading, images broken after move | `references/fonts-and-assets.md` |
| Animations broken / forms broken / hydration failing | `references/hydration-and-animations.md` |
| Verifying the cloned site looks identical | `references/verify-parity.md` |
| Deploying to Vercel / Cloudflare Pages / Netlify | `references/deploying.md` |
| Anything else not listed above | `references/troubleshooting.md` |

## Important — known limitations

- **Framer search index** (`/<site>/search.json` referenced via `<meta name="framer-search-index">`) is preserved as a static file but the meta tag may point at the original Framer CDN URL. The skill leaves this alone — search will fall back to client-side filtering inside the JS bundle.
- **Forms posting to Framer endpoints** continue to post to Framer's API. If you want forms to post elsewhere, you must re-implement them as Astro server endpoints — out of scope for this skill.
- **Dynamic routes**: if your Framer site has CMS collections (`/blog/[slug]`), the skill emits one concrete page per slug. Converting to Astro Content Collections is a follow-up — this skill produces a static 1:1 clone.
- **The Framer JS bundle is opaque.** Keeping it means you're still shipping ~8.8 MB of minified Framer runtime. If the goal is to eventually leave Framer entirely, plan a follow-up pass to rewrite components and remove their `.mjs` chunks.

## Do NOT use this skill for

- Sites NOT produced by FramerExport. The script signatures (`data-framer-hydrate-v2`, `data-framer-css-ssr-minified`, `script_main.HASH.mjs`) are how detection works. A different static dump won't match.
- Building a Framer site from scratch in Astro. This skill is reverse-engineering, not green-field.
- Converting Webflow / WordPress / Next.js exports. Use a different tool.

## Examples of when to invoke

- "I have a folder at `~/Downloads/<site>/` from FramerExport, convert it to Astro"
- "Migrate the `<site>` clone to Astro"
- "Turn this Framer dump into an Astro project I can edit"
- "Rebuild my Framer site in Astro"
- "Eject from Framer"
- "framer to astro for `<path>`"

The skill is **site-agnostic** — it works on any output of the FramerExport
tool, regardless of which Framer site was cloned. It detects the structure
generically (data-framer-hydrate-vN attribute, /js/script_main.HASH.mjs
loader, /images/ /fonts/ /assets/ dirs) — no per-site configuration needed.
