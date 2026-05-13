# Component extraction

How `03-detect-shared-components.mjs` decides what becomes an Astro component,
and how to override its decisions.

## The heuristic

For each page, walk the `#main` body DOM and collect every element that has a
`data-framer-name="…"` attribute. Apply these filters to each candidate:

1. **Skip generic Framer-default names** (`text`, `heading`, `image`, `frame`,
   `container`, `Variant1`, `Frame32`, etc. — full denylist in
   `GENERIC_NAME_RE` at the top of `03-detect-shared-components.mjs`).
2. **Skip nested regions** — if the element has an ancestor with
   `data-framer-name`, it's part of a larger component, not a layout-level
   boundary. We only consider top-level candidates.
3. **Skip small regions** — under 1000 chars of serialised HTML is typically
   a single icon or word, not worth a component file.

For surviving candidates, compute a hash of their serialised innerHTML (after
light normalisation — see below) and group by `data-framer-name`. A name is
flagged as a **shared component candidate** if:

1. The hash group appears on **2+ distinct routes** (multiple occurrences
   within ONE page do NOT count — that's a list, not shared layout), AND
2. The hash group appears on either:
   - **4+ distinct routes**, OR
   - At least **60%** of all routes.

The conservative threshold is intentional: false negatives (a clear repeat
that we missed) just leave HTML inline — visually identical, slightly
duplicated. False positives (extracting something that should differ per
page) cause silent visual drift. Better to miss than to hallucinate.

## Normalisation

Two pages' "Header" can differ in trivial ways:
- The active nav link has `class="… framer-current"` on the current page only.
- Whitespace inside attributes occasionally varies.

Before hashing we apply two replacements:

```js
html
  .replace(/\s+(class|className)="[^"]*(?:framer-current|is-active|active)[^"]*"/gi, ' class="__active__"')
  .replace(/\s+/g, ' ')
  .trim();
```

We do NOT normalise:
- `data-*` attributes — different data values mean genuinely different components
- Element order — order changing is a structural difference
- Image `src` / `srcset` — different images mean different components

## Tuning

The detection script is conservative. Adjust the thresholds in
`scripts/03-detect-shared-components.mjs` (search for the comment "Heuristic:"):

```js
// Current — 4+ distinct routes OR >=60% of all routes:
if (distinctRoutes.size < 4 && ratio < 0.6) continue;

// More aggressive — extract anything on 2+ distinct routes:
if (distinctRoutes.size < 2) continue;

// Less aggressive — only big-impact shared regions:
if (distinctRoutes.size < 6 && ratio < 0.8) continue;
```

You can also widen / narrow:
- The minimum HTML size (`if (raw.length < 1000)` — raise to skip more small regions)
- The generic-name denylist (`GENERIC_NAME_RE` — add patterns like `Section\d+`, `Block\d+` etc. that you don't want extracted)

## Manual overrides

Sometimes the heuristic misses an obvious component (e.g. a footer that has
trivially-different copyright years per page) or extracts something that
shouldn't be shared (a hero card that happens to be byte-identical between
two pages but is conceptually unique).

The `.framer-extract/shared-components.json` file is the source of truth for
`05-emit-astro.mjs`. Edit it by hand, then re-run step 6:

```bash
# Open and edit
$EDITOR <site>-astro/.framer-extract/shared-components.json

# Re-emit
node <skill>/scripts/05-emit-astro.mjs <site>-astro
```

To **add** a missed component:
1. Open one of the source HTMLs and find the region.
2. Add an entry with `suggestedComponentName`, `framerName`, the verbatim
   `sampleHtml`, and `occursOnRoutes`. The `hash` field is metadata only —
   anything goes.

To **remove** a wrongly-extracted component:
1. Delete its entry from the array.
2. Re-emit. The pages will inline the HTML again.

## Why shared regions matter

Even though we keep the JS bundle and inline CSS (so the savings from
extraction are zero for cold loads), there are two reasons to extract:

1. **Future maintainability.** If you eventually want to edit the header
   text or swap the logo, having one `Header.astro` to change beats
   editing 20 page files.
2. **Visual diffing.** Once a region is in a component, parity across pages
   is enforced — you can't accidentally drift them apart in a future edit.

If neither reason applies and you'd rather keep every page self-contained,
delete `.framer-extract/shared-components.json` (or write `[]` to it) before
running `05-emit-astro.mjs`.

## Limitations

- **Repeating cards inside a list**: e.g. blog post cards on the index page.
  These all have `data-framer-name="Card"` but different content. The
  extractor will see N occurrences with N different hashes — none shared
  across pages. Correct behaviour: leave them inline. To templatise these
  into `<Card title=… image=… />`, you need a CMS-style refactor that's
  out of scope for this skill.
- **Components that reorder children between pages**: the extractor matches
  byte-identical innerHTML. If the same `data-framer-name="Footer"` has its
  social-links region above the copyright on one page and below on another,
  detection will miss it. Lower the threshold and inspect manually.
- **Components nested inside other components**: the extractor doesn't model
  containment, only `data-framer-name`. If a `Card` is shared between pages
  but lives inside an unshared `Section`, only the `Card` is extracted.
