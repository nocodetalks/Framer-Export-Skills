# Extraction model

How FramerExport output maps onto Astro primitives, and **why** every field
captured by `02-extract-pages.mjs` is necessary for parity.

## What FramerExport produces

`FramerExport` (see `cloner.js` in the upstream repo) downloads a Framer site
and writes it to a directory like:

```
<site>/
├── index.html               # 500+ KB, fully SSR'd
├── blog.html
├── coaching.html
├── blog/<slug>.html         # nested CMS routes
├── projects/<slug>.html
├── /js/
│   ├── script_main.HASH.mjs # the only <script> tag in HTML; ~1 KB loader
│   └── chunk-*.mjs          # 50–90 lazy chunks (~8 MB total)
├── /images/                 # hashed image variants (responsive srcset)
├── /fonts/                  # local woff2, Google-Fonts subsetted
├── /assets/                 # everything else
├── manifest.json            # cloner metadata, ignored
├── serve.py                 # dev server, ignored
└── .htaccess                # Apache rewrite, ignored
```

Each HTML page is **already a complete document** — Framer SSRs everything to
HTML, and the JS bundle hydrates into the existing DOM. There is no
`<div id="root"></div>` placeholder.

## Anatomy of a Framer page

Every Framer-cloned page follows this shape. The hash values shown
(`<BODYHASH>`, `<ROOTHASH>`, `<PAGEHASH>`, `<SCRIPTHASH>`) are illustrative —
your site will have its own. The structure is what matters.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <meta name="generator" content="Framer <buildId>">
    <title>Page Title - Site Name</title>
    <meta name="description" content="…">
    <meta property="og:title" content="…">
    <meta property="og:image" content="/assets/<HASH>.png">
    <!-- twitter:* tags, canonical, framer-search-index -->
    <link rel="icon" href="/assets/favicon.svg">
    <style data-framer-css-ssr-minified>
      /* ~200 KB of @font-face + framer-XXXX scoped utility classes */
    </style>
  </head>
  <body class="framer-body-<BODYHASH>">
    <div id="main" data-framer-hydrate-v2='{"routeId":"…","localeId":"default","breakpoints":[…]}'>
      <!--$-->
      <div data-framer-root="" class="framer-<ROOTHASH> framer-<PAGEHASH> framer-<VARIANTHASH>">
        <!-- entire visible page DOM, deeply nested, with data-framer-name attrs -->
      </div>
    </div>
    <script type="module" async data-framer-bundle="main"
            fetchpriority="low" src="/js/script_main.<SCRIPTHASH>.mjs"></script>
  </body>
</html>
```

The `data-framer-hydrate-v2` attribute may become `v3` (or higher) in future
Framer versions. The extractor matches `data-framer-hydrate-v\d+` so version
bumps don't break extraction; the backup script's safety check is also
version-agnostic.

## How each part maps to Astro

| Source field                                 | Astro destination                              | Why preserved verbatim |
| -------------------------------------------- | ---------------------------------------------- | ---------------------- |
| `<title>`                                    | Page prop → `<title>` in Base.astro            | Per-page unique. SEO-critical. |
| `<meta>` tags                                | Page prop → `<meta>`s in Base.astro            | OG/Twitter tags differ per page. |
| `<link rel="icon"/canonical/preload/...>`    | Page prop → `<link>`s in Base.astro            | Some shared (favicon), some per-page (canonical). Preserve all and re-emit. |
| `<style data-framer-css-ssr-minified>`       | Inline `<style is:inline>` per page            | DO NOT dedupe. Class hashes are page-scoped; moving rules between pages can break selector specificity. The 200 KB cost is the price of fidelity. |
| `<script type="module" src="/js/script_main.HASH.mjs">` | Re-emitted as inline `<script>` in Base.astro | This is the Framer hydration loader. Drop it → animations/forms break. |
| `<body class="framer-body-XXX">` attrs       | Page prop → `<body {...attrs}>`               | The body class participates in scoping. |
| `<html lang>` attrs                          | Page prop → `<html {...attrs}>`               | Locale routing depends on this. |
| `<div id="main" data-framer-hydrate-v2="…">…</div>` | Slotted into `<Base>` verbatim          | This is the Framer hydration root. The JSON inside `data-framer-hydrate-v2` is read by `script_main.mjs` to know which route to hydrate. Removing or modifying it breaks hydration. |
| `/js/` `/images/` `/fonts/` `/assets/`       | `public/js/` `public/images/` etc.             | Astro serves `public/` at site root → URLs do not need rewriting. |

## Why we use `set:html` for the body content

Astro's templating system treats raw HTML strings as text by default. To
inject the multi-megabyte body HTML as literal markup, we use Astro's
`<Fragment set:html={…}>`. This bypasses Astro's parser, which is essential
because:

1. The body contains `data-framer-hydrate-v2` with JSON that includes
   characters Astro might re-encode.
2. The body contains opaque comment markers (`<!--$-->`, `<!--/$-->`) that
   React uses for hydration boundary detection. If Astro normalises them away,
   hydration fails silently.
3. Class hashes use `:` and other characters Astro might escape inside
   attribute values.

The trade-off: `set:html` content cannot include other Astro components.
That's why shared-component extraction works by splitting the body into
segments (`html`, `component`, `html`, `component`, …) and rendering each
either through `set:html` or through the imported Astro component.

## What we deliberately drop

Nothing visible. We do not:
- Strip attributes from any element
- Modify class names
- Re-format whitespace (would break framer-css-ssr's selector specificity)
- Convert images to `<Image>` (Framer's responsive srcset is already optimal)
- Move CSS to global

We do skip these tooling files: `manifest.json`, `serve.py`, `.htaccess`.
They're cloner-internal and don't belong in an Astro project.

## When the model breaks down

The mapping above assumes a "vanilla" Framer-cloner output. Departures:

- **Multiple `<script>` tags**: rare, but if a page has additional scripts
  (analytics, custom code injected via Framer's site settings), they're
  captured and re-emitted in order.
- **Framer code components with side effects on import**: these are
  loaded from `/js/chunk-*.mjs` lazily — they keep working as long as the
  `script_main.mjs` loader runs.
- **`<noscript>` fallbacks**: captured as part of the body HTML.
- **A page with no `#main`**: the extractor falls back to capturing the entire
  `<body>` content. This may include Framer's hydration boundary comments
  outside `#main`. Visual parity should still hold.
