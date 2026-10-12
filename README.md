# Taktli

A little drum machine for your phone. Play it at https://vadim.sikora.name/taktli/

Phone-first and landscape-only, it has:
- Patterns of 16-step bars with per-beat triplets, arranged into a song on a timeline.
- In-place volume editing: tap to toggle a note, slide up or down to set its volume, drag sideways to paint, or use Volume mode to draw curves.
- Acoustic and electronic kits, swing, undo/redo.
- Share links, MIDI export and drum notation.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:5173 (also on your LAN for testing on a phone)
pnpm test         # unit + component tests
pnpm e2e          # Playwright (WebKit iPhone + Chromium Android, landscape)
pnpm build        # static site in dist/ — host anywhere (relative base path)
```

Pushing to `main` deploys to GitHub Pages after the unit tests and build pass (`.github/workflows/pages.yml`).

## Credits

Acoustic samples: "Big Rusty Drums" by Karoryfer Samples, CC0 1.0. See `public/kits/acoustic/LICENSE-samples.md`.
