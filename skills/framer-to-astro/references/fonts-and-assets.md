# Fonts and assets

## How Framer ships fonts

Framer pre-downloads Google Fonts as woff2 subsets and stores them at
`framerusercontent.com/sites/<id>/...`. `FramerExport` then downloads them
again and writes them to `<site>/fonts/<hash>_<name>.woff2` (and sometimes
`<site>/assets/...woff2`). Each face is split by Unicode range to keep the
download small.

`@font-face` declarations live inline in the page's `<style data-framer-css-ssr-minified>`
block, with `src: url(/fonts/HASH.woff2)`. Once `04-copy-assets.mjs` copies
the `/fonts/` and `/assets/` directories into `public/`, those URLs resolve
unchanged.

## Why no `@fontsource` migration

A "clean" approach would be to install `@fontsource/dm-sans` and pull
`<style>` references out of the inline blob. We deliberately don't, because:

1. The inline `@font-face` rules use Framer's specific Unicode-range subsets.
   `@fontsource` uses different splits — switching causes subtle
   reflow on uncommon glyphs.
2. The inline CSS references `font-family: DM Sans` (with literal name).
   Replacing the font source without changing the name works, but if
   the woff2 metrics differ even slightly, layout shifts.
3. Visual parity is the goal. Stay with what Framer shipped.

If you eventually want to standardise fonts: do it as a follow-up after
parity is verified, one font family at a time.

## Image strategy

Framer generates responsive `srcset` variants and references them from inline
`<img>` tags in the page body. The cloner downloads every variant; the body
HTML keeps absolute `/images/HASH.png` paths.

After `04-copy-assets.mjs`, the files live at `public/images/...` — same URL,
no rewrite needed.

### Don't convert to Astro `<Image>`

Astro's `<Image>` component is great for new sites, but for parity you should
NOT replace `<img>` with `<Image>` because:

- Astro `<Image>` rewrites paths through `_astro/...` hashed URLs.
- It re-encodes images, changing bytes (and thus visual diffs at high zoom).
- Framer's existing `srcset` is already optimal for the layout.

If you decide to migrate later: do it after parity verification, page by
page, and re-verify.

## When assets are missing

If the verify step (06) reports image 404s:

1. Check `public/images/` — is the file there?
2. If not, check the original source dir's `images/` — was it there?
3. If yes, re-run `04-copy-assets.mjs` (idempotent — it'll add anything missing).
4. If still missing, the cloner failed to download it. Look at the original
   source HTML for the image's URL. If it points at
   `framerusercontent.com/...`, manually download it.

## .htaccess and serve.py

The cloner emits `.htaccess` and `serve.py` to support local clean-URL
serving (so `/blog` serves `blog.html`). Astro doesn't need either:

- Astro's dev server (`astro dev`) handles routing natively.
- Astro's build (`astro build`) generates clean URLs by default for
  static output.

Both files are skipped by `04-copy-assets.mjs`.
