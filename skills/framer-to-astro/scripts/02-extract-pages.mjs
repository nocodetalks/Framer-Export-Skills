#!/usr/bin/env node
// Walk every *.html in the source FramerExport output and extract:
//   - route (derived from file path)
//   - <title>, <meta>, <link rel> from <head>
//   - inline <style> blocks (preserved byte-for-byte)
//   - <script> tags (the Framer module loader)
//   - the <div id="main" data-framer-hydrate-v2="..."> wrapper + body class
// Writes the result to <astro-dir>/.framer-extract/pages.json.
//
// Usage: node 02-extract-pages.mjs <source-dir> <astro-dir>

import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import * as cheerio from 'cheerio';

const [, , SRC, AST] = process.argv;
if (!SRC || !AST) {
  console.error('usage: node 02-extract-pages.mjs <source-dir> <astro-dir>');
  process.exit(2);
}

const srcAbs = path.resolve(SRC);
const astAbs = path.resolve(AST);

// route derivation:
//   index.html              → /
//   blog.html               → /blog
//   blog/some-post.html     → /blog/some-post
//   courses/foo/index.html  → /courses/foo
function fileToRoute(rel) {
  let r = rel.replace(/\\/g, '/').replace(/\.html$/i, '');
  if (r === 'index') return '/';
  if (r.endsWith('/index')) r = r.slice(0, -'/index'.length);
  return '/' + r;
}

async function extractOne(absFile, relFile) {
  const html = await fs.readFile(absFile, 'utf8');
  // decodeEntities:false preserves raw &amp; in attributes — we want the original bytes
  const $ = cheerio.load(html, { decodeEntities: false });

  const title = ($('head > title').first().text() || '').trim();

  const metaTags = [];
  $('head > meta').each((_, el) => {
    const attrs = el.attribs || {};
    metaTags.push({ ...attrs });
  });

  const linkTags = [];
  $('head > link').each((_, el) => {
    linkTags.push({ ...(el.attribs || {}) });
  });

  // <script> tags from <head> AND <body>. We keep all of them.
  // The Framer module loader is `<script type="module" src="/js/script_main.HASH.mjs">`,
  // usually at the bottom of <body>.
  const scriptTags = [];
  $('script').each((_, el) => {
    const attrs = { ...(el.attribs || {}) };
    // Preserve inline content for non-src scripts (e.g. SEO JSON-LD)
    const inner = $(el).html() || '';
    scriptTags.push({ ...attrs, _inner: attrs.src ? '' : inner });
  });

  // Inline <style> blocks. Order matters — preserve as an array.
  const inlineStyles = [];
  $('head > style').each((_, el) => {
    const attrs = { ...(el.attribs || {}) };
    const css = $(el).html() || '';
    inlineStyles.push({ attrs, css });
  });

  // The Framer hydration root: <div id="main" data-framer-hydrate-v2="..."> ...</div>
  // We grab the OUTERHTML of #main verbatim — this is the body content.
  const mainEl = $('#main').first();
  let hydrateMain = '';
  if (mainEl.length) {
    hydrateMain = $.html(mainEl);
  } else {
    // Fallback: some pages may not use #main. Capture the entire <body> content.
    hydrateMain = $('body').html() || '';
  }

  // Body attributes (class, data-*) — we'll re-apply on the Astro <body>
  const bodyAttrs = $('body')[0]?.attribs || {};

  // <html> attributes (lang, etc.)
  const htmlAttrs = $('html')[0]?.attribs || {};

  return {
    route: fileToRoute(relFile),
    sourceFile: relFile,
    title,
    htmlAttrs,
    bodyAttrs,
    metaTags,
    linkTags,
    scriptTags,
    inlineStyles,
    hydrateMain,
  };
}

async function main() {
  // Find all HTML files. Skip backups, node_modules, and the astro-dir if it sits inside src.
  const files = await fg(['**/*.html'], {
    cwd: srcAbs,
    ignore: [
      '**/.backup-*/**',
      '**/node_modules/**',
      '**/.framer-extract/**',
    ],
    dot: false,
  });
  if (files.length === 0) {
    console.error(`[extract-pages] no *.html files found under ${srcAbs}`);
    process.exit(1);
  }
  console.log(`[extract-pages] scanning ${files.length} HTML files`);

  const pages = [];
  for (const rel of files.sort()) {
    try {
      const page = await extractOne(path.join(srcAbs, rel), rel);
      pages.push(page);
      console.log(`  ${rel.padEnd(50)} → ${page.route}`);
    } catch (err) {
      console.warn(`  ${rel}: extraction failed — ${err.message}`);
    }
  }

  const outDir = path.join(astAbs, '.framer-extract');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'pages.json');
  await fs.writeFile(outFile, JSON.stringify(pages, null, 2));
  console.log(`[extract-pages] wrote ${pages.length} pages to ${outFile}`);
}

main().catch((err) => {
  console.error('[extract-pages] fatal:', err);
  process.exit(1);
});
