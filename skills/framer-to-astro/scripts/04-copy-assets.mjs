#!/usr/bin/env node
// Copy the four asset directories from the source clone into the Astro project's
// public/ directory, preserving structure. Uses hardlinks where possible (cheap
// & fast) and falls back to copy on cross-device.
//
// Usage: node 04-copy-assets.mjs <source-dir> <astro-dir>

import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

const [, , SRC, AST] = process.argv;
if (!SRC || !AST) {
  console.error('usage: node 04-copy-assets.mjs <source-dir> <astro-dir>');
  process.exit(2);
}
const srcAbs = path.resolve(SRC);
const publicAbs = path.join(path.resolve(AST), 'public');

const ASSET_DIRS = ['js', 'images', 'fonts', 'assets'];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function copyOrLink(srcFile, destFile) {
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  if (await exists(destFile)) return 'skip';
  try {
    await fs.link(srcFile, destFile);
    return 'link';
  } catch {
    await fs.copyFile(srcFile, destFile);
    return 'copy';
  }
}

async function main() {
  await fs.mkdir(publicAbs, { recursive: true });
  let totalLink = 0, totalCopy = 0, totalSkip = 0;

  for (const dir of ASSET_DIRS) {
    const srcDir = path.join(srcAbs, dir);
    if (!await exists(srcDir)) {
      console.log(`[copy-assets] (skip) source has no /${dir}`);
      continue;
    }
    const files = await fg(['**/*'], { cwd: srcDir, dot: false, onlyFiles: true });
    let linked = 0, copied = 0, skipped = 0;
    for (const rel of files) {
      const r = await copyOrLink(path.join(srcDir, rel), path.join(publicAbs, dir, rel));
      if (r === 'link') linked++;
      else if (r === 'copy') copied++;
      else skipped++;
    }
    console.log(`[copy-assets] /${dir}: ${linked} linked, ${copied} copied, ${skipped} already-present`);
    totalLink += linked; totalCopy += copied; totalSkip += skipped;
  }

  // Also copy favicon-y root files if present.
  // NOTE: manifest.json from FramerExport is its OWN metadata file (not a
  // PWA manifest) — never ship it to production. If the source site genuinely
  // had a PWA manifest with a different name (e.g. site.webmanifest), include
  // it here.
  const ROOT_FILES = ['favicon.ico', 'favicon.svg', 'favicon.png', 'robots.txt', 'sitemap.xml', 'site.webmanifest'];
  for (const f of ROOT_FILES) {
    const src = path.join(srcAbs, f);
    if (await exists(src)) {
      const r = await copyOrLink(src, path.join(publicAbs, f));
      console.log(`[copy-assets] /${f}: ${r}`);
    }
  }
  // If the source has a manifest.json that is NOT the cloner's metadata
  // (heuristic: it doesn't contain "FramerClone" as the tool field), copy it.
  const manifestSrc = path.join(srcAbs, 'manifest.json');
  if (await exists(manifestSrc)) {
    const content = await fs.readFile(manifestSrc, 'utf8');
    if (!content.includes('"FramerClone"')) {
      await copyOrLink(manifestSrc, path.join(publicAbs, 'manifest.json'));
      console.log('[copy-assets] /manifest.json: copied (real PWA manifest)');
    } else {
      console.log('[copy-assets] /manifest.json: skipped (cloner metadata, not a PWA manifest)');
    }
  }

  console.log(`[copy-assets] total: ${totalLink + totalCopy} new (${totalLink} linked, ${totalCopy} copied), ${totalSkip} pre-existing`);
}

main().catch((err) => { console.error('[copy-assets] fatal:', err); process.exit(1); });
