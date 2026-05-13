#!/usr/bin/env node
// Read pages.json and find data-framer-name regions whose serialised innerHTML
// is byte-identical (or near-identical, ignoring active-link state) across
// 2+ pages. Those are candidates for hoisting into Astro components.
//
// Output: <astro-dir>/.framer-extract/shared-components.json
//
// Conservative by design: we only flag a region as shared if it appears on at
// least 2 pages with matching content. False negatives (failed to extract) are
// safer than false positives (extracted, but pages actually differed).
//
// Usage: node 03-detect-shared-components.mjs <astro-dir>

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

const [, , AST] = process.argv;
if (!AST) {
  console.error('usage: node 03-detect-shared-components.mjs <astro-dir>');
  process.exit(2);
}
const astAbs = path.resolve(AST);
const pagesPath = path.join(astAbs, '.framer-extract', 'pages.json');
const outPath = path.join(astAbs, '.framer-extract', 'shared-components.json');

function hash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

// Framer default/auto-generated names that aren't meaningful component
// boundaries. Extracting these produces noise like "Variant1", "text",
// "Frame32" — names that mean nothing to a future maintainer.
const GENERIC_NAME_RE = /^(text|heading|image|frame|container|group|stack|component|element|layer|rectangle|ellipse|line|path|svg|button|link|wrapper|content|inner|outer|root|main|item|cell|node|variant\d*|copy(\s*\d*)?)$/i;

function isGenericName(name) {
  if (!name) return true;
  if (GENERIC_NAME_RE.test(name.trim())) return true;
  // "Frame 32", "Frame_32", "Variant 13" — same idea with separators
  const collapsed = name.replace(/[\s_-]+/g, '');
  if (/^(Frame|Variant|Group|Stack|Rectangle|Ellipse)\d+$/i.test(collapsed)) return true;
  return false;
}

// "Normalise" HTML to ignore non-structural differences:
// - active-state class differences (`framer-current`, `is-active`)
// - whitespace runs collapsed
// We do NOT normalise data-* attributes or element order — those changing
// means the regions are genuinely different and shouldn't be merged.
function normalise(html) {
  return html
    .replace(/\s+(class|className)="[^"]*(?:framer-current|is-active|active)[^"]*"/gi, ' class="__active__"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const pages = JSON.parse(await fs.readFile(pagesPath, 'utf8'));
  if (!Array.isArray(pages) || pages.length === 0) {
    console.error('[detect] pages.json is empty or invalid');
    process.exit(1);
  }

  // For each page, walk its hydrateMain DOM and collect every element
  // with a data-framer-name attribute. Index by name.
  // shape: Map<frameName, Array<{ route, raw, normalised, hash }>>
  const byName = new Map();

  for (const page of pages) {
    if (!page.hydrateMain) continue;
    const $ = cheerio.load(page.hydrateMain, { decodeEntities: false });
    $('[data-framer-name]').each((_, el) => {
      const name = $(el).attr('data-framer-name');
      if (!name) return;
      if (isGenericName(name)) return; // skip Framer-default names
      // Skip nested data-framer-name regions — only consider top-level
      // boundaries. This filters out "Title", "Date", "Post" inside a
      // larger card/section that itself has a data-framer-name.
      if ($(el).parents('[data-framer-name]').length > 0) return;
      const raw = $.html(el);
      // Skip small regions — not worth a component file. Layout-level
      // pieces (Header, Footer, Nav) are typically several KB.
      if (raw.length < 1000) return;
      const norm = normalise(raw);
      const h = hash(norm);
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ route: page.route, raw, normalised: norm, hash: h });
    });
  }

  const shared = [];
  for (const [name, occurrences] of byName) {
    if (occurrences.length < 2) continue;

    // Group by hash. A name is "shared" if at least one hash group has 2+ pages.
    const groups = new Map();
    for (const occ of occurrences) {
      if (!groups.has(occ.hash)) groups.set(occ.hash, []);
      groups.get(occ.hash).push(occ);
    }

    for (const [h, group] of groups) {
      if (group.length < 2) continue;
      // Dedupe by route — 6 identical "Post" cards inside one blog listing
      // page must NOT count as 6 pages. We only care about cross-page reuse.
      const distinctRoutes = new Set(group.map((g) => g.route));
      if (distinctRoutes.size < 2) continue;

      // Tightened thresholds:
      //   - Must appear on at least 4 distinct routes OR
      //   - Must appear on at least 60% of all routes.
      const ratio = distinctRoutes.size / pages.length;
      if (distinctRoutes.size < 4 && ratio < 0.6) continue;

      shared.push({
        suggestedComponentName: toComponentName(name),
        framerName: name,
        hash: h,
        occursOnRoutes: [...distinctRoutes],
        occurrenceCount: distinctRoutes.size,
        sampleHtml: group[0].raw,
      });
    }
  }

  // Sort: most-shared first
  shared.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  await fs.writeFile(outPath, JSON.stringify(shared, null, 2));
  console.log(`[detect] found ${shared.length} shared component candidate(s):`);
  for (const s of shared) {
    console.log(`  ${s.suggestedComponentName.padEnd(30)} (${s.occurrenceCount} pages)  data-framer-name="${s.framerName}"`);
  }
  console.log(`[detect] wrote ${outPath}`);
}

// "Header / Footer" → "Header"; "Top Nav" → "TopNav"; spaces/punctuation stripped, PascalCase
function toComponentName(framerName) {
  return framerName
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || 'SharedRegion';
}

main().catch((err) => {
  console.error('[detect] fatal:', err);
  process.exit(1);
});
