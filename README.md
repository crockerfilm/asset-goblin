# Asset Goblin

A goblin-themed static GitHub Pages tool that extracts page assets and brand clues from a URL or pasted HTML.

## What it grabs

- Images
- Videos and embeds
- Fonts and stylesheets
- Colors
- Links
- Page text
- Basic brand-kit clues

## Loot Locker

The Loot Locker lets you:

- Search discovered files
- Filter by images, videos, or fonts/stylesheets
- Sort by size, name, type, or URL
- Attempt to check remote file sizes
- Download one asset
- Download visible or selected assets as a ZIP
- Download all available assets as a ZIP

ZIP downloads use JSZip from jsDelivr. Actual file downloads are still controlled by the asset host's browser/CORS rules. If a host blocks browser fetching, Asset Goblin will skip that file in the ZIP and write it into `asset-goblin-download-log.txt`.

## GitHub Pages

This is static HTML/CSS/JS. It can deploy through GitHub Actions or Pages branch deploy.

