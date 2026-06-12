# Asset Goblin — Goblin-Themed Content Extractor + Brand Hoard

A simple static GitHub Pages app that extracts webpage assets and brand-kit style information.

## Features

- URL scan, when the target site allows CORS
- Paste HTML fallback for blocked sites
- Extracts images, videos/iframes, fonts/stylesheets, colors, links, and readable page text
- Brand kit summary with title, description, top colors, fonts, and likely logo/icon assets
- Downloads JSON, CSV, text, and URL lists
- No backend and no data upload

## GitHub Pages setup

1. Create a new GitHub repo.
2. Upload `index.html`, `styles.css`, `app.js`, and this `README.md` to the repo root.
3. Go to **Settings → Pages**.
4. Set **Source** to `Deploy from a branch`.
5. Select your main branch and `/root`.
6. Save.

## Browser limitation

A static browser app cannot fetch every website because many sites block cross-origin browser requests with CORS or bot protection. When that happens, use **Paste HTML** mode:

1. Open the target webpage.
2. View page source.
3. Copy all HTML.
4. Paste it into the app.
5. Add the page URL as the optional base URL so relative assets resolve correctly.

For full unrestricted URL scanning, you would need a small backend/proxy, Cloudflare Worker, or GitHub Action.
