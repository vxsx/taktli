# Drum Machine

A phone-first, landscape-only step sequencer:
- Patterns of 16-step bars with per-beat triplets, chained into a song.
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

## Credits

Acoustic samples: "Big Rusty Drums" by Karoryfer Samples, CC0 1.0. See `public/kits/acoustic/LICENSE-samples.md`.
