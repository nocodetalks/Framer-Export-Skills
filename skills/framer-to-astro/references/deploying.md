# Deploying

The skill emits `output: 'static'` Astro projects. After `npm run build`,
`dist/` contains plain HTML + assets — host anywhere that serves static files.

## Pre-deploy checklist

1. `npm run build` succeeds without errors.
2. `npm run preview` serves every route (run `bash scripts/06-verify.sh` if
   you want it automated).
3. `dist/` does NOT contain:
   - `manifest.json` from the cloner (the asset-copier filters it out, but
     check anyway: `cat dist/manifest.json` should fail or be a real PWA
     manifest, not the cloner metadata)
   - Any `/Users/...` or `localhost:4321` references (`grep -rl '/Users/' dist/`)
4. Set `site:` in `astro.config.mjs` to your production URL (commented by
   default). Required for canonical URLs.
5. If your source has a `robots.txt` or `sitemap.xml`, confirm it copied to
   `public/` and that the sitemap's URLs match your new domain.

## Vercel

```bash
# At repo root (where package.json is):
vercel --prod
```

Vercel auto-detects Astro and runs `npm run build` → `dist/`. The defaults work.

Settings to verify in the Vercel dashboard:
- **Framework preset**: Astro
- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Trailing slash**: Off (matches our `build.format: 'directory'` config —
  `/blog/index.html` serves at `/blog`, not `/blog/`).

If your Framer site had a `_redirects` file (Framer doesn't typically emit one,
but if you wrote any custom Vercel rewrites): create `vercel.json` at repo root:

```json
{
  "rewrites": [
    { "source": "/old-path", "destination": "/new-path" }
  ]
}
```

## Cloudflare Pages

Two ways:

**Direct upload (no Git):**
```bash
npm run build
npx wrangler pages deploy dist --project-name=my-site
```

**Git integration:**
- Connect your repo in the Cloudflare dashboard
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 20+ (set via `NODE_VERSION` env var or `.node-version` file)

CF Pages serves `.mjs` with `Content-Type: text/javascript` automatically — no
config needed for the Framer JS bundle to load.

If you need custom headers or redirects, add `public/_headers` and
`public/_redirects` (Cloudflare's static-host conventions — they get copied
into `dist/` by Astro).

```
# public/_headers — example: longer cache for Framer JS chunks
/js/*
  Cache-Control: public, max-age=31536000, immutable

/images/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

```
# public/_redirects — example: redirect old Framer slugs
/old-slug  /new-slug  301
```

## Netlify

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

Or via Git: build command `npm run build`, publish directory `dist`,
Node version 20.

Netlify uses the same `_headers` and `_redirects` conventions as CF Pages.

## Static hosts in general (S3, GCS, Nginx)

`dist/` is plain HTML + a few asset directories. Upload it. Two host-level
settings to mind:

- **MIME for `.mjs`**: must be `application/javascript` or `text/javascript`.
  S3 by default serves unknown extensions as `application/octet-stream` — set
  per-file metadata or a bucket policy.
- **Index document**: configure `index.html` as the directory index so
  `/blog/` serves `/blog/index.html`. Otherwise visiting `/blog` 404s.

For Nginx:
```nginx
location / {
  try_files $uri $uri/ $uri.html =404;
}
location ~ \.mjs$ {
  add_header Content-Type application/javascript;
}
```

## Common deploy failures

### "404 on every nested route"

Trailing-slash mismatch. Astro builds `/blog/index.html` (directory format).
Hosts that don't serve directory indexes need either:
- `try_files $uri $uri/ $uri.html` (Nginx)
- `cleanUrls: true` in `vercel.json`
- Default for Vercel/Netlify/CF Pages — already works

### "JS loads but `MIME type ('application/octet-stream') not allowed`"

The host isn't sending `Content-Type: application/javascript` for `.mjs`.
See the per-host notes above.

### "OG images 404"

If your `<meta property="og:image">` points at `/assets/HASH.png` and the
file is in `public/assets/`, this should just work. If it's pointing at
`https://framerusercontent.com/...` the cloner missed downloading it; see
`references/seo-and-meta.md`.

### "Site loads but no animations/fonts"

JS bundle isn't loading. Open the Network tab. Look for 404s on `/js/...`
or `/fonts/...`. If 404, files didn't make it into `dist/` — check `public/`
exists and has them, then rebuild.

## Performance note

Default config emits ~37 MB of `dist/` for a 20-page Framer site (mostly
images and the JS bundle). Most static hosts cap individual files at 25 MB
(Vercel) or have soft limits — none of our outputs hit that. Total deploy
size is fine for free tiers of Vercel, CF Pages, and Netlify.
