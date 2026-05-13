# SEO and meta tags

Per-page meta tag extraction and emission rules.

## What the extractor captures

For every page, `02-extract-pages.mjs` records:

- `title`: text of `<head><title>`
- `metaTags`: array of every `<meta>` element's attributes (as objects). This
  includes `<meta charset>`, `<meta name="description">`, `<meta property="og:*">`,
  `<meta name="twitter:*">`, `<meta name="generator">`, `<meta name="viewport">`,
  and `<meta name="framer-search-index">` (Framer-specific).
- `linkTags`: every `<link>` (`canonical`, `icon`, `apple-touch-icon`, `preload`,
  `modulepreload`, `manifest`).

These are passed verbatim into `Base.astro`, which spreads each object into a
new `<meta>` or `<link>` tag. No transformation, no filtering.

## Why no filtering

- `<meta name="generator" content="Framer e942a9a">` could be stripped, but
  doing so without a clear policy creates surprises (e.g. analytics tools
  that key off it).
- `<meta name="framer-search-index" content="...">` references the original
  Framer CDN. The skill leaves it alone — search functionality continues to
  work via the JS bundle, which falls back to client-side filtering.
- `<link rel="modulepreload">` for `/js/chunk-*.mjs` is preserved so the
  browser can warm those connections; the chunks themselves are in `public/`.

If you want to strip Framer-specific tags, edit the page's `metaTags` array
in `.framer-extract/pages.json` before re-running `05-emit-astro.mjs`.

## Per-page differences (typical)

Diffing two pages' meta sets, the per-page-unique entries are:

- `<title>`
- `<meta name="description">`
- `<meta property="og:title">`, `og:description`, `og:image`, `og:url`
- `<meta name="twitter:title">`, `twitter:description`, `twitter:image`
- `<link rel="canonical" href="…">`
- The hydration JSON's `routeId` (in `<div id="main" data-framer-hydrate-v2>`)

The shared entries (charset, viewport, font preloads, base favicon, generator,
search-index) appear identically on every page.

The skill **does not** dedupe shared meta into the layout — every page passes
its full meta array in. This is wasteful in source code but produces
byte-identical output, which the verify step expects. If you want to refactor
to layout-shared + page-unique, do it manually after the parity verification
passes.

## sitemap.xml and robots.txt

If `sitemap.xml` or `robots.txt` exist at the source root, `04-copy-assets.mjs`
copies them into `public/` so they continue to be served at the same URLs.

If you want Astro to **regenerate** the sitemap (e.g. because you added new
pages), install `@astrojs/sitemap` and add it to `astro.config.mjs`:

```js
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://your-domain.com',
  integrations: [sitemap()],
  // …
});
```

Then delete the copied `public/sitemap.xml` so Astro's generated one wins.

## Open Graph image paths

Framer often references OG images as `https://framerusercontent.com/...` or
relative `/assets/...` paths. After `04-copy-assets.mjs`, the `/assets/...`
references continue to work because the file exists in `public/assets/`.

If a meta tag still points at `framerusercontent.com`, the cloner downloaded
a local copy — see the URL map in cloner.js. The original meta tag was
rewritten in the source HTML during cloner's `rewriteAll` pass, so by the
time we see it, paths are already local.

If a meta image 404s after conversion:
1. Check the source HTML — is the path `/assets/HASH.png` or
   `https://framerusercontent.com/...`?
2. If the latter, the cloner missed it. Manually download the file into
   `public/assets/` and update the meta tag in
   `.framer-extract/pages.json`.
