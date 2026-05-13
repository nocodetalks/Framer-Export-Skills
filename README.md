# Framer-Export-Skills

A [Claude Code](https://claude.com/claude-code) skill that converts a [FramerExport](https://letaiworkforme.com/) static-site dump into a working **Astro 5** project with 100% visual parity — keeping every animation, font, and pixel exactly as Framer rendered them.

## Install

```bash
npx skills add nocodetalks/Framer-Export-Skills
```

Then install the script dependencies (one-time, ~5 seconds):

```bash
cd ~/.claude/skills/framer-to-astro/scripts && npm install
```

The skill ships two small dev dependencies (`cheerio` for HTML parsing, `fast-glob` for file discovery). They are not bundled into your repo — they only run on your machine when the skill executes.

## Available skills

| Skill | Command | What it does |
|-------|---------|--------------|
| **Framer to Astro** | `/framer-to-astro` | Converts a folder produced by FramerExport into a working Astro 5 project in a sibling `*-astro/` folder, preserving all animations, fonts, OG meta, and inline CSS byte-for-byte. |

## How it works

Point Claude at a folder produced by FramerExport (a folder with `index.html`, sibling `*.html` pages, and `/js/ /images/ /fonts/ /assets/` directories). The skill produces a sibling `*-astro/` folder containing:

- `package.json`, `astro.config.mjs`, `tsconfig.json` — minimal Astro 5 setup
- `public/` — every JS chunk, image, font, and asset moved verbatim
- `src/layouts/Base.astro` — the shared `<head>` + `<body>` shell
- `src/components/*.astro` — auto-extracted shared regions (Header, Footer, Nav, etc.) detected from `data-framer-name` attributes
- `src/pages/<route>.astro` — one page per route, with the original head meta and body HTML preserved

The Framer JS bundle (`script_main.HASH.mjs` + chunks) ships unchanged in `public/js/`, so animations and forms keep working without any re-implementation.

## Usage

After install, in any Claude Code session:

```
> convert ~/Downloads/my-framer-export to astro
```

Or explicitly:

```
> /framer-to-astro
```

Claude runs the seven-step pipeline:

| Step | Script | Output |
|------|--------|--------|
| 1 | `00-backup.sh` | `<source>.backup-<timestamp>/` (full APFS-CoW copy) |
| 2 | `01-scaffold-astro.sh` | `<source>-astro/` Astro project skeleton + `npm install` |
| 3 | `02-extract-pages.mjs` | `.framer-extract/pages.json` (per-page metadata via cheerio) |
| 4 | `03-detect-shared-components.mjs` | `.framer-extract/shared-components.json` |
| 5 | `04-copy-assets.mjs` | `public/js`, `public/images`, `public/fonts`, `public/assets` |
| 6 | `05-emit-astro.mjs` | `src/layouts/Base.astro` + `src/components/*.astro` + `src/pages/*.astro` |
| 7 | `06-verify.sh` | boots `astro dev`, pings every route, byte-diffs vs source |

Then build and deploy:

```bash
cd <source>-astro
npm run build           # → dist/
npm run preview         # local production preview
```

Deploy `dist/` to Vercel / Cloudflare Pages / Netlify / any static host. See [`skills/framer-to-astro/references/deploying.md`](./skills/framer-to-astro/references/deploying.md) for host-specific gotchas.

## What gets preserved (guaranteed)

- The `<div id="main" data-framer-hydrate-vN="…">` hydration root, byte-identical
- The `<script type="module" src="/js/script_main.HASH.mjs">` loader tag
- The full ~200 KB inline `<style data-framer-css-ssr-minified>` per page
- Every `<meta>`, `<link>`, OG/Twitter tag, canonical URL
- `<body>` and `<html>` attributes (including the `framer-body-XXX` class)
- All asset URLs at root paths (`/js/...`, `/images/...`, `/fonts/...`)

## What you trade off

This skill is **fidelity-first**, not clean-code-first. Tradeoffs:

- The Framer JS bundle (~8 MB across 90 chunks) ships unchanged. You're still on Framer's runtime — animations work, but the bundle is opaque.
- The 200 KB inline CSS is duplicated per page. No deduplication.
- Component extraction is conservative (top-level `data-framer-name` regions appearing on 4+ routes). Most page content stays inline.

If your goal is to *eventually* leave Framer's runtime entirely, see [`skills/framer-to-astro/references/hydration-and-animations.md`](./skills/framer-to-astro/references/hydration-and-animations.md) for the incremental escape path.

## Repo layout

```
.
├── README.md
└── skills/
    └── framer-to-astro/
        ├── SKILL.md                          # main instructions Claude loads
        ├── scripts/
        │   ├── 00-backup.sh                  # always-first safety step
        │   ├── 01-scaffold-astro.sh          # creates Astro project
        │   ├── 02-extract-pages.mjs          # cheerio-based HTML parsing
        │   ├── 03-detect-shared-components.mjs
        │   ├── 04-copy-assets.mjs            # /js /images /fonts /assets → public/
        │   ├── 05-emit-astro.mjs             # writes Layout + components + pages
        │   ├── 06-verify.sh                  # boot dev server + byte-diff
        │   └── package.json                  # cheerio, fast-glob (dev deps for the script)
        ├── references/                       # progressive-disclosure docs
        │   ├── extraction-model.md
        │   ├── component-extraction.md
        │   ├── seo-and-meta.md
        │   ├── fonts-and-assets.md
        │   ├── hydration-and-animations.md
        │   ├── deploying.md
        │   ├── verify-parity.md
        │   └── troubleshooting.md
        └── assets/                           # Astro project file templates
            ├── package.json.template
            ├── astro.config.mjs.template
            ├── tsconfig.json.template
            └── gitignore.template
```

## Requirements

- Node.js 20+
- Claude Code CLI ([install](https://claude.com/claude-code))
- macOS, Linux, or WSL (the shell scripts use POSIX tools — Windows-native untested)
- A FramerExport output folder to convert ([get FramerExport](https://letaiworkforme.com/))

## Related

- [FramerExport](https://letaiworkforme.com/) — the upstream tool that produces the input folder this skill consumes
- [Astro](https://astro.build) — the target framework
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — the open agent-skill installer this repo follows
- [Claude Code skills documentation](https://docs.claude.com/en/docs/agents-and-tools/claude-code/skills)

## License

MIT — feel free to fork, modify, and use commercially.
