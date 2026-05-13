# Hydration and animations

## What "keeping the JS bundle" means

Per the chosen strategy, every page in the converted Astro project keeps:

1. The `<div id="main" data-framer-hydrate-v2='{"routeId": "...", ...}'>...</div>`
   wrapper around the body content.
2. The `<script type="module" src="/js/script_main.HASH.mjs">` tag (re-emitted
   by `Base.astro` from the page's `scriptTags` prop).
3. The 90-ish `chunk-*.mjs` files in `public/js/`, served at the same URL the
   loader expects.

Together, these reproduce the runtime contract: when a page loads, Framer's
loader reads the `data-framer-hydrate-v2` JSON, looks up the `routeId`,
imports the matching chunk, and hydrates React into the existing DOM. All
animations, hover states, scroll triggers, and form handlers continue to work.

## What hydration provides

The visible HTML is already complete — without JS, the page renders as a
static document and looks correct. The JS bundle adds:

- Framer Motion animations (entrance fades, hover scale, scroll-triggered
  reveals, marquee loops)
- Form submission handlers (forms post to Framer's API by default)
- Client-side route transitions (when navigating via Framer's `<Link>`
  components — though full page loads still work)
- Code components (custom React shipped by site author)
- Variant transitions (hover/active state morphing)

If the JS fails to load, none of this works, but the page still renders.

## Common reasons hydration breaks after conversion

### 1. The `<div id="main">` wrapper got modified

Something stripped attributes, re-encoded the JSON, or wrapped it in another
element. Check the served HTML at `view-source:` and compare against the
original. The `data-framer-hydrate-v2` attribute value must be byte-identical.

Fix: re-run `02-extract-pages.mjs` and `05-emit-astro.mjs`. The extractor uses
`decodeEntities: false` and the emitter uses `set:html` precisely to avoid
this kind of re-encoding.

### 2. The script tag is missing or has wrong attributes

`Base.astro` re-emits scripts from `page.scriptTags`. If that array is empty,
the loader never runs.

Check: open `.framer-extract/pages.json`, find the page, look at `scriptTags`.
You should see at least one entry with `src: "/js/script_main.HASH.mjs"` and
`type: "module"`.

If missing: the source HTML didn't have it. Re-clone the source; the original
must have been broken.

### 3. A chunk 404s

Open the browser console. Look for `Failed to load module script:` or
404s on `/js/chunk-*.mjs`. If a chunk is missing, copy it from the source
`/js/` to `public/js/`, or re-run `04-copy-assets.mjs`.

### 4. CORS / MIME errors on .mjs files

If serving from a CDN that doesn't set `Content-Type: application/javascript`
on `.mjs` files, the module loader will refuse to execute them. Astro's dev
server handles this correctly. For production:
- Cloudflare Pages / Workers: handled automatically.
- Vercel / Netlify: handled automatically.
- Custom server: ensure `.mjs` is mapped to `application/javascript`.

## When animations look subtly wrong

If hydration succeeds but an animation runs differently than the original:

- **Compare the inline `<style>` block byte-for-byte.** Framer scopes
  animations using class hashes. If even one rule got dropped, animations
  fail silently.
- **Check the page's `data-framer-hydrate-v2` JSON.** It contains
  `breakpoints` data; if a breakpoint is missing, responsive animations
  may misfire.
- **Check the `<body class>`.** Framer scopes some root-level animation
  classes here. If `bodyAttrs.class` was dropped, see step 02 extraction.

## Future: removing the bundle entirely

If you eventually want to leave Framer's runtime entirely:

1. **Pick one component** — start with something simple like a Header.
2. **Replace `<Fragment set:html={SAMPLE} />` in `Header.astro` with
   hand-written Astro markup** that produces the same DOM.
3. **Remove the corresponding `data-framer-name` attributes from the page
   bodies.** Without them, the Framer runtime won't try to attach to the
   replaced region.
4. **Test.** Animations on that region won't work yet — re-add what you need
   with vanilla CSS or an Astro island.
5. **Repeat for the next component.** Eventually the JS bundle becomes
   irrelevant and you can delete it.

This is a path to escape Framer; it's intentionally NOT what this skill
automates. The skill produces a 1:1 clone you can ship today.
