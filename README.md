# Framer-Export-Skills

Move your Framer site to **Astro** in one command — keeping your design exactly as it is.

Built for [FramerExport](https://letaiworkforme.com/) users who want to leave Framer hosting and own their code, without losing a single pixel of their design.

## Why use this

- **Own your code.** Get a clean Astro project you can edit in any code editor.
- **Keep every pixel.** Your fonts, animations, hover effects, and layout stay identical to the Framer original.
- **Host anywhere.** Deploy to Vercel, Cloudflare Pages, Netlify, or any web host — most are free.
- **No coding needed.** One command runs the whole conversion. Claude does the rest.

## Install (one time)

```bash
npx skills add nocodetalks/Framer-Export-Skills
```

That's it. The skill is now available in [Claude Code](https://claude.com/claude-code).

## Use it

1. Export your Framer site using [FramerExport](https://letaiworkforme.com/) — you'll get a folder on your computer.
2. Open Claude Code and tell it to convert the folder:

   ```
   convert ~/Downloads/my-framer-site to astro
   ```

3. Claude creates a new folder next to it called `my-framer-site-astro/` — that's your Astro project, ready to deploy.

## Deploy

Inside the new folder, run:

```bash
npm run build
```

This produces a `dist/` folder — drop it on any web host:

- **Vercel**: `vercel --prod`
- **Cloudflare Pages**: `npx wrangler pages deploy dist`
- **Netlify**: `netlify deploy --prod --dir=dist`

Done. Your site is live, no longer paying Framer.

## What you need

- A Mac or Linux computer (Windows via WSL also works)
- [Claude Code](https://claude.com/claude-code) installed (free for individual use)
- A site exported via [FramerExport](https://letaiworkforme.com/)

## Questions

- **Will my forms still work?** Yes — they continue posting wherever they did before.
- **Will my animations still work?** Yes — every Framer animation, hover, and scroll effect is preserved.
- **Can I edit the Astro code afterward?** Yes — that's the whole point. You own it.
- **What if something looks off?** Open an issue and include a screenshot.

## License

MIT — use it for anything, including commercial projects.
