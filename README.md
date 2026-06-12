# Asset Goblin

A simple GitHub Pages app for extracting images and videos from a public webpage.

## What it does

- Paste one URL
- Extract images and videos from the page HTML/CSS
- Show everything in a simple grid
- Select some or all
- Download individual files or a ZIP

## Important browser limitation

This is a static browser-only app. Some sites block browser fetches with CORS, and JavaScript-rendered media may not appear in the raw HTML. Asset Goblin tries direct fetch first, then a public CORS fallback. A production-grade extractor would need a backend/worker that fetches pages server-side.

## Deploy with GitHub Actions

This repo includes `.github/workflows/deploy.yml` for GitHub Pages.

In GitHub:

Settings → Pages → Build and deployment → Source → GitHub Actions

Then push updates:

```bash
git add .
git commit -m "Update Asset Goblin"
git push origin master
```
