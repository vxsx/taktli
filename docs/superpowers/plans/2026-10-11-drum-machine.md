# Drum Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a landscape-only, phone-first web drum machine with patterns, a song chain, per-beat triplets, in-place velocity editing, two kits, share links, MIDI export and a notation view.

**Architecture:** A pure TypeScript core (`src/model`) holds types, timing math and immutable edit operations. Around it sit four layers:
- **Store:** a Zustand store wraps the core with undo history and UI state.
- **Audio:** a Web Audio lookahead scheduler reads the store directly and drives two kits behind one `Kit` interface.
- **UI:** a React UI renders the grid. The hot paths (playhead highlight, drag gestures) bypass React re-renders by touching the DOM directly or committing transient store updates.
- **IO:** separate modules handle localStorage, the share-link codec and the MIDI writer, all over plain `Project` objects.

**Tech Stack:**
- React 19.3, TypeScript 6.0, Vite 8.3.
- Zustand 5, Immer 11, VexFlow 5 (lazy-loaded).
- Vitest 5 + jsdom + Testing Library, Playwright 1.64.
- pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-drum-machine-design.md`

## Global Constraints

- Landscape only. Portrait phones (`(orientation: portrait) and (max-width: 600px)`) show a full-screen "Rotate your phone" overlay.
- 4/4 only, 4 beats per bar. Per-beat subdivision is `4 | 3 | 6` cells. `TICKS_PER_BEAT = 12`, `TICKS_PER_BAR = 48`.
- Velocity is an integer 0..127, where 0 = no note. New notes = 100. Accent if ≥ 110, ghost if ≤ 45. `gain = (v/127)^1.6`.
- BPM is an integer 40..240. Swing is an integer 0..100 per pattern. It delays 16th off-beats (cells 1 and 3 of `div 4` beats only) by `1.5 * swing/100` ticks.
- Track order (top→bottom, also the notation order): `crash, ride, hhOpen, hhClosed, hhPedal, snare, crossStick, tom1, tom2, floorTom, kick`.
- GM notes: crash 49, ride 51, hhOpen 46, hhClosed 42, hhPedal 44, snare 38, crossStick 37, tom1 48, tom2 45, floorTom 43, kick 36.
- `hhClosed` and `hhPedal` choke a ringing `hhOpen`.
- Every edit to the project goes through pure functions in `src/model/ops.ts` and the store (`apply` or the transient gesture API), so it is undoable. A gesture is one undo entry. History is capped at 200.
- localStorage keys: `dm:index`, `dm:project:<id>`, `dm:last`, `dm:clipboard`. Autosave is debounced 500 ms.
- Share links look like `#p=<base64url(deflate-raw(JSON compact v1))>`. They always import as a **new** project.
- MIDI: SMF format 0, 480 PPQ, channel 10, swing baked in, muted tracks excluded. Exports the song if it has steps, otherwise the current pattern.
- No runtime dependencies beyond `react`, `react-dom`, `zustand`, `immer`, `vexflow`. No UI kit. Styling uses CSS modules plus CSS variables. Dark theme.
- Never use `crypto.randomUUID` (it's unavailable over plain-HTTP LAN dev). Use `newId()` from `src/model/factory.ts`.
- Zustand selectors must return existing references or primitives, never fresh objects or arrays. Otherwise React 19's `useSyncExternalStore` loops.
- Vite `base: './'`, so the build works under any static-hosting subpath.
- Acoustic samples: "Big Rusty Drums" by Karoryfer Samples, CC0 1.0, served from `public/kits/acoustic/`.

## Review Focus

1. **Structural edits while playing.** Deleting the playing bar, pattern or song step mid-playback must not crash or stall. Playback continues from a valid bar. *(Task 9 test: "survives deleting the playing bar")*
2. **Stalled timers** (backgrounded tab, phone lock, debugger pause). The scheduler must not burst-play every missed note when timers resume. It resyncs to "now". *(Task 9 test: "resyncs after a stall instead of bursting")*
3. **A second finger touching the grid during a drag.** It must be ignored. The active gesture stays coherent and yields exactly one undo entry. *(Task 11 test: "ignores a second pointer while a gesture is active")*
4. **Corrupt or partial localStorage data** (manual edits, an interrupted write, an old format). The app must still boot: it skips the broken project and falls back to the next one or the demo. *(Task 5 tests: "skips corrupt projects in the index", "returns null for corrupt JSON")*
5. **Large projects in share links** (many patterns × many full bars). The link must still round-trip exactly, and the URL must stay a sane length. *(Task 6 test: "round-trips a large project and stays compact")*

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, index.html
public/
  manifest.webmanifest, icon-192.png, icon-512.png
  kits/acoustic/*.mp3, kits/acoustic/LICENSE-samples.md
scripts/samples/{mix.sh,render.sh}        (reproducible sample pipeline, reference only)
src/
  main.tsx                                 React entry; calls bootstrap()
  App.tsx, App.module.css                  shell layout + view switch
  styles/global.css                        theme variables, resets
  model/
    types.ts         Project/Pattern/Bar/Beat/… types
    tracks.ts        TRACKS table, TRACK_IDS, TRACK_BY_ID, CHOKE_TARGETS
    timing.ts        tick math, swing, velocity helpers, convertCells
    factory.ts       newId, create*, cloneBar, nextPatternName, createDemoProject
    invariants.ts    projectProblems(p) → string[]
    ops.ts           all pure edit operations
    timeline.ts      buildTimeline, startRef, nextRef, notesAtTick, barNotes
    validate.ts      parseProject, parseBar (unknown JSON → valid model)
  io/
    storage.ts       ProjectStorage (KeyValueStore-backed), createAutosaver
    share.ts         toCompact/fromCompact, encodeShare/decodeShare, hash helpers
    midi.ts          exportMidi, vlq
    download.ts      downloadBytes, safeFilename
  state/
    store.ts         createAppStore, appStore, useApp, selectors
    persistence.ts   storage singleton, safeSave, bootstrap()
    actions.ts       bar clipboard + project/pattern/share/export actions
  audio/
    context.ts       getAudio, unlockAudio
    scheduler.ts     Scheduler (lookahead), PlayheadEvent
    transport.ts     transport singleton (play/stop/audition/playhead/kit loading)
    kits/types.ts    Kit interface
    kits/choke.ts    Choker
    kits/electronic.ts  synthesized kit
    kits/sample.ts   sample (acoustic) kit
  notation/
    toNotation.ts    Bar → voice/beat/event descriptors
    NotationView.tsx, NotationView.module.css, renderNotation.ts
  ui/
    gestures.ts            pure gesture math
    tapTempo.ts            pure tap-tempo math
    Grid.tsx, Grid.module.css, Cell.tsx, TrackLabel.tsx, BeatHeader.tsx
    useGridGestures.ts, usePlayheadHighlight.ts, VolumeBubble.tsx
    Popover.tsx, Menu.tsx, Popover.module.css
    modal.tsx, Modal.module.css (ModalHost, showModal, promptText, confirmAction)
    TopBar.tsx, TopBar.module.css, PatternMenu.tsx, BpmPopover.tsx
    BarStrip.tsx, BarStrip.module.css, useReorder.ts
    SongView.tsx, SongView.module.css
    ProjectsSheet.tsx, TracksSheet.tsx, SwingSheet.tsx, Sheet.module.css
    Toasts.tsx, Toasts.module.css, RotateOverlay.tsx, RotateOverlay.module.css
    usePlaybackFollow.ts, useKeyboardShortcuts.ts
e2e/app.spec.ts
```

Tests sit next to sources as `*.test.ts(x)`. Component tests start with `// @vitest-environment jsdom`.

---

### Task 1: Project scaffold, core types and track table

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/styles/global.css`
- Create: `src/model/types.ts`, `src/model/tracks.ts`
- Test: `src/model/tracks.test.ts`

**Interfaces:**
- Produces: all types in `types.ts` (`TrackId`, `Subdivision`, `Velocity`, `Beat`, `Bar`, `Pattern`, `SongStep`, `TrackSettings`, `KitName`, `Project`); `TRACKS: readonly TrackDef[]`, `TRACK_IDS: readonly TrackId[]`, `TRACK_BY_ID: Record<TrackId, TrackDef>`, `CHOKE_TARGETS: Partial<Record<TrackId, readonly TrackId[]>>`, `CHOKEABLE: ReadonlySet<TrackId>`; `TrackDef = { id, label, short, color, midi, notation: { key: string; voice: 'hands'|'feet'; open?: boolean } }`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "drum-machine",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 2: Install pinned dependencies**

Run:
```bash
pnpm add react@19.3.0 react-dom@19.3.0 zustand@5.0.15 immer@11.1.21 vexflow@5.0.0
pnpm add -D vite@8.3.4 @vitejs/plugin-react@6.1.2 typescript@6.0.3 vitest@5.0.3 jsdom@30.1.2 @testing-library/react@16.3.3 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.2 @playwright/test@1.64.0
```
Expected: installs without errors. `pnpm-lock.yaml` is created.

- [ ] **Step 3: Create `tsconfig.json`, `vite.config.ts`, `index.html`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#16161a" />
    <title>Drum Machine</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/styles/global.css`:
```css
:root {
  --bg: #16161a;
  --panel: #1f1f25;
  --panel-2: #2c2c36;
  --border: #2a2a33;
  --text: #e8e8ee;
  --text-dim: #9a9aa6;
  --accent: #ff6a3d;
  --cell: #2a2a33;
  --cell-alt: #33333e;
  --playhead: rgba(255, 255, 255, 0.85);
  --danger: #ff4d5e;
  --label-w: 76px;
  color-scheme: dark;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior: none;
}
body { overflow: hidden; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
button {
  font: inherit; color: inherit; background: var(--panel-2); border: 0; border-radius: 8px;
  padding: 0 10px; min-height: 30px; cursor: pointer; touch-action: manipulation; white-space: nowrap;
}
button:disabled { opacity: 0.4; cursor: default; }
button[aria-pressed='true'] { background: var(--accent); color: #fff; }
input { font: inherit; font-size: 16px; }
```

`src/main.tsx` (temporary until Task 12):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p style={{ padding: 16 }}>Drum Machine</p>
  </StrictMode>,
);
```

- [ ] **Step 4: Write the failing test `src/model/tracks.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CHOKEABLE, CHOKE_TARGETS, TRACKS, TRACK_BY_ID, TRACK_IDS } from './tracks';

describe('tracks', () => {
  it('lists the 11 tracks in notation order', () => {
    expect(TRACK_IDS).toEqual([
      'crash', 'ride', 'hhOpen', 'hhClosed', 'hhPedal', 'snare',
      'crossStick', 'tom1', 'tom2', 'floorTom', 'kick',
    ]);
  });

  it('uses the GM drum notes from the spec', () => {
    expect(Object.fromEntries(TRACKS.map((t) => [t.id, t.midi]))).toEqual({
      crash: 49, ride: 51, hhOpen: 46, hhClosed: 42, hhPedal: 44, snare: 38,
      crossStick: 37, tom1: 48, tom2: 45, floorTom: 43, kick: 36,
    });
  });

  it('indexes every track by id', () => {
    for (const t of TRACKS) expect(TRACK_BY_ID[t.id]).toBe(t);
  });

  it('puts only pedal hi-hat and kick in the feet voice', () => {
    expect(TRACKS.filter((t) => t.notation.voice === 'feet').map((t) => t.id)).toEqual(['hhPedal', 'kick']);
  });

  it('lets closed and pedal hi-hat choke the open hi-hat', () => {
    expect(CHOKE_TARGETS.hhClosed).toEqual(['hhOpen']);
    expect(CHOKE_TARGETS.hhPedal).toEqual(['hhOpen']);
    expect([...CHOKEABLE]).toEqual(['hhOpen']);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test src/model/tracks.test.ts`
Expected: FAIL. Cannot find module `./tracks`.

- [ ] **Step 6: Implement `src/model/types.ts` and `src/model/tracks.ts`**

`src/model/types.ts`:
```ts
export type TrackId =
  | 'crash' | 'ride' | 'hhOpen' | 'hhClosed' | 'hhPedal' | 'snare'
  | 'crossStick' | 'tom1' | 'tom2' | 'floorTom' | 'kick';

/** Cells per beat: 16ths | 8th triplets | 16th triplets. */
export type Subdivision = 4 | 3 | 6;

/** Integer 0..127; 0 means "no note". */
export type Velocity = number;

export interface Beat {
  div: Subdivision;
  /** Every array has length === div. */
  cells: Record<TrackId, Velocity[]>;
}

export interface Bar {
  id: string;
  beats: [Beat, Beat, Beat, Beat];
}

export interface Pattern {
  id: string;
  name: string;
  /** 0..100 */
  swing: number;
  /** length >= 1 */
  bars: Bar[];
}

export interface SongStep {
  id: string;
  patternId: string;
}

export interface TrackSettings {
  muted: boolean;
  hidden: boolean;
}

export type KitName = 'acoustic' | 'electronic';

export interface Project {
  version: 1;
  id: string;
  name: string;
  /** integer 40..240 */
  bpm: number;
  kit: KitName;
  /** length >= 1 */
  patterns: Pattern[];
  song: SongStep[];
  tracks: Record<TrackId, TrackSettings>;
  createdAt: number;
  updatedAt: number;
}
```

`src/model/tracks.ts`:
```ts
import type { TrackId } from './types';

export interface TrackDef {
  id: TrackId;
  label: string;
  short: string;
  color: string;
  midi: number;
  /** VexFlow key on a percussion staff, e.g. 'g/5/x2' (x notehead) or 'c/5/x3' (circle-x). */
  notation: { key: string; voice: 'hands' | 'feet'; open?: boolean };
}

export const TRACKS: readonly TrackDef[] = [
  { id: 'crash', label: 'Crash', short: 'CR', color: '#f5c542', midi: 49, notation: { key: 'a/5/x2', voice: 'hands' } },
  { id: 'ride', label: 'Ride', short: 'RD', color: '#e0b04a', midi: 51, notation: { key: 'f/5/x2', voice: 'hands' } },
  { id: 'hhOpen', label: 'Open HH', short: 'OH', color: '#7ad3f0', midi: 46, notation: { key: 'g/5/x2', voice: 'hands', open: true } },
  { id: 'hhClosed', label: 'Closed HH', short: 'HH', color: '#4fb8e8', midi: 42, notation: { key: 'g/5/x2', voice: 'hands' } },
  { id: 'hhPedal', label: 'Pedal HH', short: 'PH', color: '#3a8fc0', midi: 44, notation: { key: 'd/4/x2', voice: 'feet' } },
  { id: 'snare', label: 'Snare', short: 'SN', color: '#ff6a3d', midi: 38, notation: { key: 'c/5', voice: 'hands' } },
  { id: 'crossStick', label: 'Cross-stick', short: 'XS', color: '#ff9a6b', midi: 37, notation: { key: 'c/5/x3', voice: 'hands' } },
  { id: 'tom1', label: 'Tom 1', short: 'T1', color: '#b48cff', midi: 48, notation: { key: 'e/5', voice: 'hands' } },
  { id: 'tom2', label: 'Tom 2', short: 'T2', color: '#9a70f0', midi: 45, notation: { key: 'd/5', voice: 'hands' } },
  { id: 'floorTom', label: 'Floor Tom', short: 'FT', color: '#7d55d6', midi: 43, notation: { key: 'a/4', voice: 'hands' } },
  { id: 'kick', label: 'Kick', short: 'KK', color: '#ff3d6e', midi: 36, notation: { key: 'f/4', voice: 'feet' } },
];

export const TRACK_IDS: readonly TrackId[] = TRACKS.map((t) => t.id);

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<TrackId, TrackDef>;

/** Playing the key track cuts off any ringing voices of the listed tracks. */
export const CHOKE_TARGETS: Partial<Record<TrackId, readonly TrackId[]>> = {
  hhClosed: ['hhOpen'],
  hhPedal: ['hhOpen'],
};

export const CHOKEABLE: ReadonlySet<TrackId> = new Set(Object.values(CHOKE_TARGETS).flat());
```

- [ ] **Step 7: Run tests, typecheck and build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 5 tests PASS. Typecheck is clean and `dist/` is produced.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts index.html src
git commit -m "feat: scaffold vite react app with core model types and track table"
```

---

### Task 2: Timing math, factories and invariants

**Files:**
- Create: `src/model/timing.ts`, `src/model/factory.ts`, `src/model/invariants.ts`
- Test: `src/model/timing.test.ts`, `src/model/factory.test.ts`

**Interfaces:**
- Consumes: types and `TRACK_IDS` from Task 1.
- Produces:
  - `timing.ts`:
    - constants `TICKS_PER_BEAT=12, BEATS_PER_BAR=4, TICKS_PER_BAR=48, SUBDIVISIONS, DEFAULT_VELOCITY=100, ACCENT_MIN=110, GHOST_MAX=45, MAX_SWING_TICKS=1.5`
    - `clamp(v,min,max)`, `ticksPerCell(div)`, `cellTick(beatIndex, div, cell)`, `cellAtTick(div, tickInBeat) → number|-1`, `cellContainingTick(div, tickInBeat)`, `swingOffset(div, cell, swing) → ticks`
    - `clampVelocity(v)`, `velocityToGain(v)`, `convertCells(values, from, to)`
  - `factory.ts`:
    - `newId()`, `emptyCells(div)`, `createBeat(div=4)`, `createBar(id?)`, `cloneBar(bar, id?)`, `createPattern(name, id?)`, `defaultTrackSettings()`
    - `DEFAULT_BPM=100`, `createProject(name?, now?)`, `nextPatternName(existing)`, `createDemoProject(now?)`
  - `invariants.ts`: `projectProblems(p: Project): string[]` (empty when valid).

- [ ] **Step 1: Write the failing tests**

`src/model/timing.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  cellAtTick, cellContainingTick, cellTick, clampVelocity, convertCells,
  swingOffset, velocityToGain,
} from './timing';

describe('tick math', () => {
  it('places cells on the 12-tick beat grid', () => {
    expect(cellTick(0, 4, 0)).toBe(0);
    expect(cellTick(1, 4, 3)).toBe(21);
    expect(cellTick(3, 3, 2)).toBe(44);
    expect(cellTick(2, 6, 5)).toBe(34);
  });

  it('finds the cell exactly at a tick, or -1', () => {
    expect(cellAtTick(4, 6)).toBe(2);
    expect(cellAtTick(4, 4)).toBe(-1);
    expect(cellAtTick(3, 4)).toBe(1);
    expect(cellAtTick(6, 10)).toBe(5);
  });

  it('finds the cell containing a tick', () => {
    expect(cellContainingTick(4, 5)).toBe(1);
    expect(cellContainingTick(3, 11)).toBe(2);
  });
});

describe('swing', () => {
  it('delays only 16th off-beats', () => {
    expect(swingOffset(4, 0, 100)).toBe(0);
    expect(swingOffset(4, 1, 100)).toBe(1.5);
    expect(swingOffset(4, 3, 50)).toBe(0.75);
    expect(swingOffset(3, 1, 100)).toBe(0);
    expect(swingOffset(6, 1, 100)).toBe(0);
  });

  it('clamps swing to 0..100', () => {
    expect(swingOffset(4, 1, 250)).toBe(1.5);
    expect(swingOffset(4, 1, -5)).toBe(0);
  });
});

describe('velocity', () => {
  it('clamps and rounds', () => {
    expect(clampVelocity(-3)).toBe(0);
    expect(clampVelocity(130)).toBe(127);
    expect(clampVelocity(99.6)).toBe(100);
  });

  it('maps to gain with a 1.6 curve', () => {
    expect(velocityToGain(0)).toBe(0);
    expect(velocityToGain(127)).toBe(1);
    expect(velocityToGain(64)).toBeCloseTo(Math.pow(64 / 127, 1.6), 6);
  });
});

describe('convertCells', () => {
  it('returns a copy when the subdivision is unchanged', () => {
    const src = [1, 0, 3, 0];
    const out = convertCells(src, 4, 4);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });

  it('maps 16ths to 8th triplets by nearest tick', () => {
    // ticks 0,3,6,9 → triplet ticks 0,4,8: 0→0, 3→1 (4), 6→2 (8 is nearer than 4? 6/4=1.5 → rounds to 2), 9→2
    expect(convertCells([100, 0, 0, 0], 4, 3)).toEqual([100, 0, 0]);
    expect(convertCells([0, 90, 0, 0], 4, 3)).toEqual([0, 90, 0]);
    expect(convertCells([0, 0, 0, 80], 4, 3)).toEqual([0, 0, 80]);
  });

  it('keeps the louder note when two collide', () => {
    expect(convertCells([0, 0, 50, 120], 4, 3)).toEqual([0, 0, 120]);
  });

  it('never maps past the last cell', () => {
    expect(convertCells([0, 0, 0, 0, 0, 70], 6, 3)).toEqual([0, 0, 70]);
  });

  it('round-trips 8th triplets through 16th triplets exactly', () => {
    expect(convertCells(convertCells([10, 20, 30], 3, 6), 6, 3)).toEqual([10, 20, 30]);
  });
});
```

`src/model/factory.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  cloneBar, createBar, createDemoProject, createPattern, createProject, nextPatternName,
} from './factory';
import { projectProblems } from './invariants';
import { TRACK_IDS } from './tracks';

describe('factory', () => {
  it('creates an empty 4-beat bar of 16ths', () => {
    const bar = createBar();
    expect(bar.beats).toHaveLength(4);
    for (const beat of bar.beats) {
      expect(beat.div).toBe(4);
      for (const t of TRACK_IDS) expect(beat.cells[t]).toEqual([0, 0, 0, 0]);
    }
  });

  it('clones bars deeply with a new id', () => {
    const bar = createBar();
    bar.beats[0].cells.kick[0] = 100;
    const copy = cloneBar(bar);
    expect(copy.id).not.toBe(bar.id);
    expect(copy.beats).toEqual(bar.beats);
    copy.beats[0].cells.kick[0] = 1;
    expect(bar.beats[0].cells.kick[0]).toBe(100);
  });

  it('creates a valid empty project', () => {
    const p = createProject('Test', 1000);
    expect(p.name).toBe('Test');
    expect(p.bpm).toBe(100);
    expect(p.kit).toBe('acoustic');
    expect(p.patterns.map((x) => x.name)).toEqual(['A']);
    expect(p.song).toEqual([]);
    expect(p.createdAt).toBe(1000);
    expect(projectProblems(p)).toEqual([]);
  });

  it('names patterns A..Z then AA, AB', () => {
    expect(nextPatternName([])).toBe('A');
    expect(nextPatternName(['A', 'B'])).toBe('C');
    expect(nextPatternName(['B'])).toBe('A');
    const az = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    expect(nextPatternName(az)).toBe('AA');
    expect(nextPatternName([...az, 'AA'])).toBe('AB');
  });

  it('builds a valid demo project with a triplet fill and a song', () => {
    const p = createDemoProject(5);
    expect(projectProblems(p)).toEqual([]);
    expect(p.bpm).toBe(96);
    expect(p.patterns.map((x) => [x.name, x.bars.length])).toEqual([['A', 2], ['B', 2]]);
    expect(p.song.map((s) => p.patterns.find((x) => x.id === s.patternId)!.name)).toEqual(['A', 'B']);
    expect(p.patterns[1].bars[1].beats[3].div).toBe(3);
  });

  it('gives every id in a project a unique value', () => {
    const p = createDemoProject();
    const ids = [p.id, ...p.patterns.map((x) => x.id), ...p.patterns.flatMap((x) => x.bars.map((b) => b.id)), ...p.song.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates patterns with one bar and no swing', () => {
    const pat = createPattern('Q');
    expect(pat.bars).toHaveLength(1);
    expect(pat.swing).toBe(0);
  });
});

describe('projectProblems', () => {
  it('reports wrong cell lengths, bad velocities, dangling song steps and bad bpm', () => {
    const p = createProject();
    p.patterns[0].bars[0].beats[0].cells.kick = [0, 0, 0];
    p.patterns[0].bars[0].beats[1].cells.snare[0] = 300;
    p.song.push({ id: 'x', patternId: 'missing' });
    p.bpm = 10;
    const problems = projectProblems(p);
    expect(problems).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/model`
Expected: FAIL. The modules `./timing`, `./factory` and `./invariants` aren't found.

- [ ] **Step 3: Implement `src/model/timing.ts`**

```ts
import type { Subdivision, Velocity } from './types';

export const TICKS_PER_BEAT = 12;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const SUBDIVISIONS: readonly Subdivision[] = [4, 3, 6];
export const DEFAULT_VELOCITY = 100;
export const ACCENT_MIN = 110;
export const GHOST_MAX = 45;
/** Swing 100% delays a 16th off-beat by this many ticks (MPC "75%"). */
export const MAX_SWING_TICKS = 1.5;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function ticksPerCell(div: Subdivision): number {
  return TICKS_PER_BEAT / div;
}

export function cellTick(beatIndex: number, div: Subdivision, cell: number): number {
  return beatIndex * TICKS_PER_BEAT + cell * ticksPerCell(div);
}

/** Index of the cell starting exactly at `tickInBeat`, or -1. */
export function cellAtTick(div: Subdivision, tickInBeat: number): number {
  const t = ticksPerCell(div);
  return tickInBeat % t === 0 ? tickInBeat / t : -1;
}

/** Index of the cell whose span contains `tickInBeat` (used for the playhead). */
export function cellContainingTick(div: Subdivision, tickInBeat: number): number {
  return Math.floor(tickInBeat / ticksPerCell(div));
}

/** Swing delay in ticks for a cell. Only 16th off-beats (cells 1 and 3) swing. */
export function swingOffset(div: Subdivision, cell: number, swing: number): number {
  if (div !== 4 || cell % 2 === 0) return 0;
  return (MAX_SWING_TICKS * clamp(swing, 0, 100)) / 100;
}

export function clampVelocity(v: number): Velocity {
  return clamp(Math.round(v), 0, 127);
}

export function velocityToGain(v: Velocity): number {
  return Math.pow(clampVelocity(v) / 127, 1.6);
}

/** Re-grid one track's cells of a beat; each note moves to the nearest new cell, louder wins collisions. */
export function convertCells(values: readonly Velocity[], from: Subdivision, to: Subdivision): Velocity[] {
  if (from === to) return values.slice();
  const out = new Array<Velocity>(to).fill(0);
  const fromStep = ticksPerCell(from);
  const toStep = ticksPerCell(to);
  values.forEach((v, i) => {
    if (v <= 0) return;
    const target = Math.min(to - 1, Math.round((i * fromStep) / toStep));
    out[target] = Math.max(out[target], v);
  });
  return out;
}
```

- [ ] **Step 4: Implement `src/model/factory.ts`**

```ts
import { TRACK_IDS } from './tracks';
import type { Bar, Beat, Pattern, Project, Subdivision, TrackId, TrackSettings, Velocity } from './types';

export const DEFAULT_BPM = 100;

/** Short unique id. Works without a secure context (unlike crypto.randomUUID). */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyCells(div: Subdivision): Record<TrackId, Velocity[]> {
  const cells = {} as Record<TrackId, Velocity[]>;
  for (const id of TRACK_IDS) cells[id] = new Array<Velocity>(div).fill(0);
  return cells;
}

export function createBeat(div: Subdivision = 4): Beat {
  return { div, cells: emptyCells(div) };
}

export function createBar(id: string = newId()): Bar {
  return { id, beats: [createBeat(), createBeat(), createBeat(), createBeat()] };
}

export function cloneBar(bar: Bar, id: string = newId()): Bar {
  const beats = bar.beats.map((b) => {
    const cells = {} as Record<TrackId, Velocity[]>;
    for (const t of TRACK_IDS) cells[t] = [...b.cells[t]];
    return { div: b.div, cells };
  }) as Bar['beats'];
  return { id, beats };
}

export function createPattern(name: string, id: string = newId()): Pattern {
  return { id, name, swing: 0, bars: [createBar()] };
}

export function defaultTrackSettings(): Record<TrackId, TrackSettings> {
  const s = {} as Record<TrackId, TrackSettings>;
  for (const id of TRACK_IDS) s[id] = { muted: false, hidden: false };
  return s;
}

export function createProject(name = 'Untitled beat', now = Date.now()): Project {
  return {
    version: 1,
    id: newId(),
    name,
    bpm: DEFAULT_BPM,
    kit: 'acoustic',
    patterns: [createPattern('A')],
    song: [],
    tracks: defaultTrackSettings(),
    createdAt: now,
    updatedAt: now,
  };
}

function indexToLetters(n: number): string {
  let s = '';
  let k = n + 1;
  while (k > 0) {
    const r = (k - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    k = Math.floor((k - 1) / 26);
  }
  return s;
}

/** First unused name in A..Z, AA, AB, … */
export function nextPatternName(existing: readonly string[]): string {
  const taken = new Set(existing);
  for (let n = 0; ; n++) {
    const name = indexToLetters(n);
    if (!taken.has(name)) return name;
  }
}

function hit(bar: Bar, beat: number, track: TrackId, cell: number, v: Velocity): void {
  bar.beats[beat].cells[track][cell] = v;
}

function rockBar(withCrash: boolean): Bar {
  const bar = createBar();
  for (let b = 0; b < 4; b++) {
    if (!(withCrash && b === 0)) hit(bar, b, 'hhClosed', 0, 105);
    hit(bar, b, 'hhClosed', 2, 75);
  }
  if (withCrash) hit(bar, 0, 'crash', 0, 115);
  hit(bar, 1, 'snare', 0, 118);
  hit(bar, 3, 'snare', 0, 118);
  hit(bar, 2, 'snare', 3, 35);
  hit(bar, 0, 'kick', 0, 112);
  hit(bar, 1, 'kick', 2, 92);
  hit(bar, 2, 'kick', 0, 110);
  hit(bar, 2, 'kick', 2, 88);
  return bar;
}

export function createDemoProject(now = Date.now()): Project {
  const p = createProject('Demo groove', now);
  p.bpm = 96;
  const a = p.patterns[0];
  a.bars = [rockBar(true), rockBar(false)];

  const fill = rockBar(false);
  const triplet = createBeat(3);
  triplet.cells.snare = [105, 0, 0];
  triplet.cells.tom1 = [0, 100, 0];
  triplet.cells.floorTom = [0, 0, 112];
  fill.beats[3] = triplet;
  const b = createPattern('B');
  b.bars = [rockBar(false), fill];
  p.patterns.push(b);

  p.song = [
    { id: newId(), patternId: a.id },
    { id: newId(), patternId: b.id },
  ];
  return p;
}
```

- [ ] **Step 5: Implement `src/model/invariants.ts`**

```ts
import { SUBDIVISIONS } from './timing';
import { TRACK_IDS } from './tracks';
import type { Project } from './types';

/** Human-readable list of violated model invariants; empty means valid. */
export function projectProblems(p: Project): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(p.bpm) || p.bpm < 40 || p.bpm > 240) problems.push(`bpm ${p.bpm} out of range`);
  if (p.patterns.length === 0) problems.push('project has no patterns');

  const patternIds = new Set<string>();
  const barIds = new Set<string>();
  for (const pat of p.patterns) {
    if (patternIds.has(pat.id)) problems.push(`duplicate pattern id ${pat.id}`);
    patternIds.add(pat.id);
    if (!Number.isInteger(pat.swing) || pat.swing < 0 || pat.swing > 100) problems.push(`pattern ${pat.name}: swing out of range`);
    if (pat.bars.length === 0) problems.push(`pattern ${pat.name}: no bars`);
    pat.bars.forEach((bar, bi) => {
      if (barIds.has(bar.id)) problems.push(`duplicate bar id ${bar.id}`);
      barIds.add(bar.id);
      if (bar.beats.length !== 4) problems.push(`pattern ${pat.name} bar ${bi + 1}: expected 4 beats`);
      bar.beats.forEach((beat, k) => {
        const where = `pattern ${pat.name} bar ${bi + 1} beat ${k + 1}`;
        if (!SUBDIVISIONS.includes(beat.div)) problems.push(`${where}: bad subdivision ${beat.div}`);
        for (const t of TRACK_IDS) {
          const cells = beat.cells[t];
          if (!Array.isArray(cells) || cells.length !== beat.div) {
            problems.push(`${where} ${t}: expected ${beat.div} cells`);
          } else if (cells.some((v) => !Number.isInteger(v) || v < 0 || v > 127)) {
            problems.push(`${where} ${t}: velocity out of range`);
          }
        }
      });
    });
  }

  const stepIds = new Set<string>();
  for (const step of p.song) {
    if (stepIds.has(step.id)) problems.push(`duplicate song step id ${step.id}`);
    stepIds.add(step.id);
    if (!patternIds.has(step.patternId)) problems.push(`song step ${step.id} references a missing pattern`);
  }
  return problems;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test src/model && pnpm typecheck`
Expected: all PASS, and typecheck is clean.

- [ ] **Step 7: Commit**

```bash
git add src/model
git commit -m "feat(model): timing math, factories, demo project and invariants"
```

---

### Task 3: Pure edit operations

**Files:**
- Create: `src/model/ops.ts`
- Test: `src/model/ops.test.ts`

**Interfaces:**
- Consumes: `clampVelocity, convertCells, clamp` (timing), `cloneBar, createBar, createPattern, newId, nextPatternName` (factory), `projectProblems` (invariants, tests only).
- Produces: every function returns a new `Project` (or the same reference when nothing changed). It never touches `updatedAt`.
  - Notes: `setVelocity(p, patternId, barIndex, beat, track, cell, velocity)`, `setBeatDiv(p, patternId, barIndex, beat, div)`, `clearRow(p, patternId, barIndex, track)`.
  - Bars: `clearBar(p, patternId, barIndex)`, `addBar(p, patternId, bar?)`, `insertBarAfter(p, patternId, barIndex, bar?)`, `duplicateBar(p, patternId, barIndex, id?)`, `deleteBar(p, patternId, barIndex)`, `moveBar(p, patternId, from, to)`, `replaceBarContents(p, patternId, barIndex, source)`.
  - Patterns: `addPattern(p, id)`, `duplicatePattern(p, patternId, id)`, `renamePattern(p, patternId, name)`, `deletePattern(p, patternId)`, `setSwing(p, patternId, swing)`.
  - Song: `appendSongStep(p, patternId, id?)`, `insertSongStep(p, index, patternId, id?)`, `duplicateSongStep(p, stepId, id?)`, `removeSongStep(p, stepId)`, `moveSongStep(p, from, to)`, `setSongStepPattern(p, stepId, patternId)`.
  - Project settings: `setBpm(p, bpm)`, `setProjectName(p, name)`, `setKit(p, kit)`, `setTrackMuted(p, track, muted)`, `setTrackHidden(p, track, hidden)`.
  - Constants: `MIN_BPM=40`, `MAX_BPM=240`.

- [ ] **Step 1: Write the failing test `src/model/ops.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createBar, createBeat, createDemoProject, createProject } from './factory';
import { projectProblems } from './invariants';
import * as ops from './ops';
import type { Project } from './types';

function setup(): { p: Project; pid: string } {
  const p = createProject();
  return { p, pid: p.patterns[0].id };
}
const valid = (p: Project) => expect(projectProblems(p)).toEqual([]);

describe('note ops', () => {
  it('sets, clamps and clears velocities immutably', () => {
    const { p, pid } = setup();
    const a = ops.setVelocity(p, pid, 0, 1, 'snare', 0, 200);
    expect(a.patterns[0].bars[0].beats[1].cells.snare[0]).toBe(127);
    expect(p.patterns[0].bars[0].beats[1].cells.snare[0]).toBe(0);
    const b = ops.setVelocity(a, pid, 0, 1, 'snare', 0, 0);
    expect(b.patterns[0].bars[0].beats[1].cells.snare[0]).toBe(0);
    valid(b);
  });

  it('returns the same reference for no-op edits and bad coordinates', () => {
    const { p, pid } = setup();
    expect(ops.setVelocity(p, pid, 0, 0, 'kick', 0, 0)).toBe(p);
    expect(ops.setVelocity(p, pid, 5, 0, 'kick', 0, 100)).toBe(p);
    expect(ops.setVelocity(p, pid, 0, 0, 'kick', 9, 100)).toBe(p);
    expect(ops.setVelocity(p, 'nope', 0, 0, 'kick', 0, 100)).toBe(p);
  });

  it('changes a beat subdivision and remaps notes', () => {
    const { p, pid } = setup();
    const a = ops.setVelocity(p, pid, 0, 3, 'snare', 3, 90);
    const b = ops.setBeatDiv(a, pid, 0, 3, 3);
    expect(b.patterns[0].bars[0].beats[3].div).toBe(3);
    expect(b.patterns[0].bars[0].beats[3].cells.snare).toEqual([0, 0, 90]);
    expect(b.patterns[0].bars[0].beats[3].cells.kick).toEqual([0, 0, 0]);
    valid(b);
    expect(ops.setBeatDiv(b, pid, 0, 3, 3)).toBe(b);
  });

  it('clears a row across all beats', () => {
    const { p, pid } = setup();
    let a = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    a = ops.setVelocity(a, pid, 0, 2, 'kick', 2, 100);
    a = ops.setVelocity(a, pid, 0, 2, 'snare', 2, 100);
    const b = ops.clearRow(a, pid, 0, 'kick');
    expect(b.patterns[0].bars[0].beats.every((bt) => bt.cells.kick.every((v) => v === 0))).toBe(true);
    expect(b.patterns[0].bars[0].beats[2].cells.snare[2]).toBe(100);
  });
});

describe('bar ops', () => {
  it('adds, inserts, duplicates, moves and deletes bars', () => {
    const { p, pid } = setup();
    const first = p.patterns[0].bars[0].id;
    let a = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    a = ops.addBar(a, pid);
    expect(a.patterns[0].bars).toHaveLength(2);
    a = ops.duplicateBar(a, pid, 0, 'dup');
    expect(a.patterns[0].bars.map((b) => b.id)[1]).toBe('dup');
    expect(a.patterns[0].bars[1].beats[0].cells.kick[0]).toBe(100);
    a = ops.insertBarAfter(a, pid, 0, createBar('ins'));
    expect(a.patterns[0].bars.map((b) => b.id).slice(0, 3)).toEqual([first, 'ins', 'dup']);
    a = ops.moveBar(a, pid, 0, 3);
    expect(a.patterns[0].bars[3].id).toBe(first);
    a = ops.deleteBar(a, pid, 3);
    expect(a.patterns[0].bars.map((b) => b.id)).not.toContain(first);
    valid(a);
  });

  it('never deletes the last bar', () => {
    const { p, pid } = setup();
    expect(ops.deleteBar(p, pid, 0)).toBe(p);
  });

  it('ignores out-of-range moves', () => {
    const { p, pid } = setup();
    expect(ops.moveBar(p, pid, 0, 4)).toBe(p);
  });

  it('pastes bar contents but keeps the target bar id', () => {
    const { p, pid } = setup();
    const source = createBar('src');
    source.beats[1] = createBeat(3);
    source.beats[1].cells.tom1[1] = 77;
    const target = p.patterns[0].bars[0].id;
    const a = ops.replaceBarContents(p, pid, 0, source);
    expect(a.patterns[0].bars[0].id).toBe(target);
    expect(a.patterns[0].bars[0].beats[1].div).toBe(3);
    expect(a.patterns[0].bars[0].beats[1].cells.tom1[1]).toBe(77);
    source.beats[1].cells.tom1[1] = 1;
    expect(a.patterns[0].bars[0].beats[1].cells.tom1[1]).toBe(77);
    valid(a);
  });

  it('clears notes but keeps subdivisions', () => {
    const { p, pid } = setup();
    let a = ops.setBeatDiv(p, pid, 0, 2, 6);
    a = ops.setVelocity(a, pid, 0, 2, 'ride', 4, 60);
    a = ops.clearBar(a, pid, 0);
    expect(a.patterns[0].bars[0].beats[2].div).toBe(6);
    expect(a.patterns[0].bars[0].beats[2].cells.ride).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('pattern ops', () => {
  it('adds patterns with the next free name', () => {
    const { p } = setup();
    const a = ops.addPattern(p, 'b');
    expect(a.patterns.map((x) => [x.id, x.name])[1]).toEqual(['b', 'B']);
  });

  it('duplicates a pattern after the source with fresh bar ids', () => {
    const p = createDemoProject();
    const src = p.patterns[0];
    const a = ops.duplicatePattern(p, src.id, 'copy');
    expect(a.patterns[1].id).toBe('copy');
    expect(a.patterns[1].name).toBe('C');
    expect(a.patterns[1].bars.map((b) => b.beats)).toEqual(src.bars.map((b) => b.beats));
    expect(a.patterns[1].bars[0].id).not.toBe(src.bars[0].id);
    valid(a);
  });

  it('renames with trimming and ignores empty names', () => {
    const { p, pid } = setup();
    expect(ops.renamePattern(p, pid, '  Verse  ').patterns[0].name).toBe('Verse');
    expect(ops.renamePattern(p, pid, '   ')).toBe(p);
    expect(ops.renamePattern(p, pid, 'x'.repeat(40)).patterns[0].name).toHaveLength(24);
  });

  it('deletes a pattern and its song steps, but never the last pattern', () => {
    const p = createDemoProject();
    const b = p.patterns[1];
    const a = ops.deletePattern(p, b.id);
    expect(a.patterns.map((x) => x.name)).toEqual(['A']);
    expect(a.song.every((s) => s.patternId !== b.id)).toBe(true);
    expect(ops.deletePattern(a, a.patterns[0].id)).toBe(a);
    valid(a);
  });

  it('clamps swing', () => {
    const { p, pid } = setup();
    expect(ops.setSwing(p, pid, 140).patterns[0].swing).toBe(100);
    expect(ops.setSwing(p, pid, 33.4).patterns[0].swing).toBe(33);
  });
});

describe('song ops', () => {
  it('appends, inserts, duplicates, moves, retargets and removes steps', () => {
    const p = createDemoProject();
    const [a, b] = p.patterns;
    let s = ops.appendSongStep(p, a.id, 's3');
    expect(s.song.map((x) => x.id).at(-1)).toBe('s3');
    s = ops.insertSongStep(s, 0, b.id, 's0');
    expect(s.song[0].id).toBe('s0');
    s = ops.duplicateSongStep(s, 's0', 's0b');
    expect(s.song.map((x) => x.id).slice(0, 2)).toEqual(['s0', 's0b']);
    s = ops.moveSongStep(s, 0, s.song.length - 1);
    expect(s.song.at(-1)!.id).toBe('s0');
    s = ops.setSongStepPattern(s, 's0', a.id);
    expect(s.song.at(-1)!.patternId).toBe(a.id);
    s = ops.removeSongStep(s, 's0');
    expect(s.song.map((x) => x.id)).not.toContain('s0');
    valid(s);
  });

  it('refuses steps for unknown patterns', () => {
    const p = createDemoProject();
    expect(ops.appendSongStep(p, 'nope')).toBe(p);
    expect(ops.setSongStepPattern(p, p.song[0].id, 'nope')).toBe(p);
  });
});

describe('project settings', () => {
  it('clamps and rounds bpm', () => {
    const { p } = setup();
    expect(ops.setBpm(p, 10).bpm).toBe(40);
    expect(ops.setBpm(p, 999).bpm).toBe(240);
    expect(ops.setBpm(p, 120.6).bpm).toBe(121);
  });

  it('sets name, kit, mute and hide', () => {
    const { p } = setup();
    expect(ops.setProjectName(p, ' Song ').name).toBe('Song');
    expect(ops.setProjectName(p, '')).toBe(p);
    expect(ops.setKit(p, 'electronic').kit).toBe('electronic');
    expect(ops.setTrackMuted(p, 'kick', true).tracks.kick.muted).toBe(true);
    expect(ops.setTrackHidden(p, 'tom2', true).tracks.tom2.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/model/ops.test.ts`
Expected: FAIL. Cannot find module `./ops`.

- [ ] **Step 3: Implement `src/model/ops.ts`**

```ts
import { produce, type Draft } from 'immer';
import { cloneBar, createBar, createPattern, newId, nextPatternName } from './factory';
import { clamp, clampVelocity, convertCells } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, KitName, Pattern, Project, Subdivision, TrackId, Velocity } from './types';

export const MIN_BPM = 40;
export const MAX_BPM = 240;
const MAX_PATTERN_NAME = 24;
const MAX_PROJECT_NAME = 60;

function editPattern(p: Project, patternId: string, fn: (pat: Draft<Pattern>) => void): Project {
  return produce(p, (d) => {
    const pat = d.patterns.find((x) => x.id === patternId);
    if (pat) fn(pat);
  });
}

function editBar(p: Project, patternId: string, barIndex: number, fn: (bar: Draft<Bar>) => void): Project {
  return editPattern(p, patternId, (pat) => {
    const bar = pat.bars[barIndex];
    if (bar) fn(bar);
  });
}

function moveItem<T>(arr: T[], from: number, to: number): void {
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
}

// ---- notes ----

export function setVelocity(
  p: Project, patternId: string, barIndex: number, beat: number, track: TrackId, cell: number, velocity: Velocity,
): Project {
  const v = clampVelocity(velocity);
  return editBar(p, patternId, barIndex, (bar) => {
    const cells = bar.beats[beat]?.cells[track];
    if (cells && cell >= 0 && cell < cells.length && cells[cell] !== v) cells[cell] = v;
  });
}

export function setBeatDiv(p: Project, patternId: string, barIndex: number, beat: number, div: Subdivision): Project {
  return editBar(p, patternId, barIndex, (bar) => {
    const b = bar.beats[beat];
    if (!b || b.div === div) return;
    for (const t of TRACK_IDS) b.cells[t] = convertCells(b.cells[t], b.div, div);
    b.div = div;
  });
}

export function clearRow(p: Project, patternId: string, barIndex: number, track: TrackId): Project {
  return editBar(p, patternId, barIndex, (bar) => {
    for (const b of bar.beats) {
      if (b.cells[track].some((v) => v !== 0)) b.cells[track] = new Array<Velocity>(b.div).fill(0);
    }
  });
}

// ---- bars ----

export function clearBar(p: Project, patternId: string, barIndex: number): Project {
  return editBar(p, patternId, barIndex, (bar) => {
    for (const b of bar.beats) {
      for (const t of TRACK_IDS) {
        if (b.cells[t].some((v) => v !== 0)) b.cells[t] = new Array<Velocity>(b.div).fill(0);
      }
    }
  });
}

export function addBar(p: Project, patternId: string, bar: Bar = createBar()): Project {
  return editPattern(p, patternId, (pat) => {
    pat.bars.push(bar);
  });
}

export function insertBarAfter(p: Project, patternId: string, barIndex: number, bar: Bar = createBar()): Project {
  return editPattern(p, patternId, (pat) => {
    if (barIndex < 0 || barIndex >= pat.bars.length) return;
    pat.bars.splice(barIndex + 1, 0, bar);
  });
}

export function duplicateBar(p: Project, patternId: string, barIndex: number, id: string = newId()): Project {
  const pat = p.patterns.find((x) => x.id === patternId);
  const src = pat?.bars[barIndex];
  if (!src) return p;
  return insertBarAfter(p, patternId, barIndex, cloneBar(src, id));
}

export function deleteBar(p: Project, patternId: string, barIndex: number): Project {
  return editPattern(p, patternId, (pat) => {
    if (pat.bars.length <= 1 || barIndex < 0 || barIndex >= pat.bars.length) return;
    pat.bars.splice(barIndex, 1);
  });
}

export function moveBar(p: Project, patternId: string, from: number, to: number): Project {
  return editPattern(p, patternId, (pat) => {
    const n = pat.bars.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    moveItem(pat.bars, from, to);
  });
}

/** Paste: copies `source`'s beats into the target bar, keeping the target's id. */
export function replaceBarContents(p: Project, patternId: string, barIndex: number, source: Bar): Project {
  const copy = cloneBar(source);
  return editBar(p, patternId, barIndex, (bar) => {
    bar.beats = copy.beats;
  });
}

// ---- patterns ----

export function addPattern(p: Project, id: string): Project {
  return produce(p, (d) => {
    d.patterns.push(createPattern(nextPatternName(d.patterns.map((x) => x.name)), id));
  });
}

export function duplicatePattern(p: Project, patternId: string, id: string): Project {
  const index = p.patterns.findIndex((x) => x.id === patternId);
  if (index < 0) return p;
  const src = p.patterns[index];
  const copy: Pattern = {
    id,
    name: nextPatternName(p.patterns.map((x) => x.name)),
    swing: src.swing,
    bars: src.bars.map((b) => cloneBar(b)),
  };
  return produce(p, (d) => {
    d.patterns.splice(index + 1, 0, copy);
  });
}

export function renamePattern(p: Project, patternId: string, name: string): Project {
  const clean = name.trim().slice(0, MAX_PATTERN_NAME);
  if (!clean) return p;
  return editPattern(p, patternId, (pat) => {
    if (pat.name !== clean) pat.name = clean;
  });
}

export function deletePattern(p: Project, patternId: string): Project {
  if (p.patterns.length <= 1 || !p.patterns.some((x) => x.id === patternId)) return p;
  return produce(p, (d) => {
    d.patterns = d.patterns.filter((x) => x.id !== patternId);
    d.song = d.song.filter((s) => s.patternId !== patternId);
  });
}

export function setSwing(p: Project, patternId: string, swing: number): Project {
  const s = clamp(Math.round(swing), 0, 100);
  return editPattern(p, patternId, (pat) => {
    if (pat.swing !== s) pat.swing = s;
  });
}

// ---- song ----

const hasPattern = (p: Project, patternId: string) => p.patterns.some((x) => x.id === patternId);

export function appendSongStep(p: Project, patternId: string, id: string = newId()): Project {
  if (!hasPattern(p, patternId)) return p;
  return produce(p, (d) => {
    d.song.push({ id, patternId });
  });
}

export function insertSongStep(p: Project, index: number, patternId: string, id: string = newId()): Project {
  if (!hasPattern(p, patternId)) return p;
  return produce(p, (d) => {
    d.song.splice(clamp(index, 0, d.song.length), 0, { id, patternId });
  });
}

export function duplicateSongStep(p: Project, stepId: string, id: string = newId()): Project {
  const index = p.song.findIndex((s) => s.id === stepId);
  if (index < 0) return p;
  return insertSongStep(p, index + 1, p.song[index].patternId, id);
}

export function removeSongStep(p: Project, stepId: string): Project {
  if (!p.song.some((s) => s.id === stepId)) return p;
  return produce(p, (d) => {
    d.song = d.song.filter((s) => s.id !== stepId);
  });
}

export function moveSongStep(p: Project, from: number, to: number): Project {
  const n = p.song.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return p;
  return produce(p, (d) => {
    moveItem(d.song, from, to);
  });
}

export function setSongStepPattern(p: Project, stepId: string, patternId: string): Project {
  if (!hasPattern(p, patternId)) return p;
  return produce(p, (d) => {
    const step = d.song.find((s) => s.id === stepId);
    if (step && step.patternId !== patternId) step.patternId = patternId;
  });
}

// ---- project settings ----

export function setBpm(p: Project, bpm: number): Project {
  const v = clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
  return v === p.bpm ? p : produce(p, (d) => { d.bpm = v; });
}

export function setProjectName(p: Project, name: string): Project {
  const clean = name.trim().slice(0, MAX_PROJECT_NAME);
  if (!clean || clean === p.name) return p;
  return produce(p, (d) => { d.name = clean; });
}

export function setKit(p: Project, kit: KitName): Project {
  return kit === p.kit ? p : produce(p, (d) => { d.kit = kit; });
}

export function setTrackMuted(p: Project, track: TrackId, muted: boolean): Project {
  return produce(p, (d) => { d.tracks[track].muted = muted; });
}

export function setTrackHidden(p: Project, track: TrackId, hidden: boolean): Project {
  return produce(p, (d) => { d.tracks[track].hidden = hidden; });
}
```

Note: Immer returns the original reference when a recipe assigns a value equal to the current one, so no-op edits keep identity. The store relies on that to skip history entries.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/model && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/ops.ts src/model/ops.test.ts
git commit -m "feat(model): pure undoable edit operations"
```

---

### Task 4: Playback timeline and note lookup

**Files:**
- Create: `src/model/timeline.ts`
- Test: `src/model/timeline.test.ts`

**Interfaces:**
- Consumes: `Project`, `TrackId`, `Velocity`, `Bar`; `TICKS_PER_BEAT`, `TICKS_PER_BAR`, `cellAtTick`, `swingOffset` (timing); `TRACK_IDS`.
- Produces:
  - Types:
    - `type PlayMode = 'pattern' | 'song'`
    - `interface BarRef { patternId: string; barIndex: number; stepIndex: number }`. `stepIndex` is -1 in pattern mode.
    - `interface TimelineOptions { mode: PlayMode; patternId: string; barIndex: number; loopBar: boolean }`
    - `interface ScheduledNote { track: TrackId; tick: number; offset: number; velocity: Velocity }`. `tick` is the integer bar tick 0..47, `offset` is the swing delay in ticks.
  - Functions:
    - `buildTimeline(p, o): BarRef[]`, which is never empty
    - `findPosition(tl, ref): number`, which returns -1 if not found
    - `nextRef(tl, ref): BarRef`
    - `startRef(p, o): BarRef`
    - `getBar(p, ref): Bar | undefined`
    - `notesAtTick(p, ref, tick): ScheduledNote[]`, which skips muted tracks
    - `barNotes(p, ref): ScheduledNote[]`, sorted by tick

- [ ] **Step 1: Write the failing test `src/model/timeline.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createDemoProject, createProject } from './factory';
import * as ops from './ops';
import {
  barNotes, buildTimeline, findPosition, nextRef, notesAtTick, startRef, type TimelineOptions,
} from './timeline';

const opts = (o: Partial<TimelineOptions> & { patternId: string }): TimelineOptions => ({
  mode: 'pattern', barIndex: 0, loopBar: false, ...o,
});

describe('buildTimeline', () => {
  const p = createDemoProject();
  const [a, b] = p.patterns;

  it('lists all bars of the current pattern in pattern mode', () => {
    expect(buildTimeline(p, opts({ patternId: b.id }))).toEqual([
      { patternId: b.id, barIndex: 0, stepIndex: -1 },
      { patternId: b.id, barIndex: 1, stepIndex: -1 },
    ]);
  });

  it('lists only the edited bar when looping a bar, clamping the index', () => {
    expect(buildTimeline(p, opts({ patternId: a.id, barIndex: 1, loopBar: true }))).toEqual([
      { patternId: a.id, barIndex: 1, stepIndex: -1 },
    ]);
    expect(buildTimeline(p, opts({ patternId: a.id, barIndex: 9, loopBar: true }))[0].barIndex).toBe(1);
  });

  it('concatenates song steps in song mode', () => {
    expect(buildTimeline(p, opts({ patternId: b.id, mode: 'song' }))).toEqual([
      { patternId: a.id, barIndex: 0, stepIndex: 0 },
      { patternId: a.id, barIndex: 1, stepIndex: 0 },
      { patternId: b.id, barIndex: 0, stepIndex: 1 },
      { patternId: b.id, barIndex: 1, stepIndex: 1 },
    ]);
  });

  it('falls back to the pattern when the song is empty', () => {
    const empty = createProject();
    const pid = empty.patterns[0].id;
    expect(buildTimeline(empty, opts({ patternId: pid, mode: 'song' }))).toEqual([{ patternId: pid, barIndex: 0, stepIndex: -1 }]);
  });

  it('falls back to the first pattern when the pattern id is unknown', () => {
    expect(buildTimeline(p, opts({ patternId: 'gone' }))[0].patternId).toBe(a.id);
  });
});

describe('cursor', () => {
  const p = createDemoProject();
  const [a, b] = p.patterns;

  it('starts at the edited bar in pattern mode and at the top in song mode', () => {
    expect(startRef(p, opts({ patternId: a.id, barIndex: 1 }))).toEqual({ patternId: a.id, barIndex: 1, stepIndex: -1 });
    expect(startRef(p, opts({ patternId: b.id, barIndex: 1, mode: 'song' }))).toEqual({ patternId: a.id, barIndex: 0, stepIndex: 0 });
  });

  it('advances and wraps around', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id, mode: 'song' }));
    expect(nextRef(tl, tl[1])).toEqual(tl[2]);
    expect(nextRef(tl, tl[3])).toEqual(tl[0]);
  });

  it('jumps to the first bar when the current bar vanished', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id }));
    expect(findPosition(tl, { patternId: a.id, barIndex: 7, stepIndex: -1 })).toBe(-1);
    expect(nextRef(tl, { patternId: a.id, barIndex: 7, stepIndex: -1 })).toEqual(tl[0]);
  });

  it('matches a bar ignoring stepIndex when the mode changed', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id, mode: 'song' }));
    expect(findPosition(tl, { patternId: b.id, barIndex: 0, stepIndex: -1 })).toBe(2);
  });

  it('moves to the newly selected bar when looping a bar', () => {
    const tl = buildTimeline(p, opts({ patternId: a.id, barIndex: 1, loopBar: true }));
    expect(nextRef(tl, { patternId: a.id, barIndex: 0, stepIndex: -1 })).toEqual({ patternId: a.id, barIndex: 1, stepIndex: -1 });
  });
});

describe('notes', () => {
  it('returns notes at exact cell ticks in track order', () => {
    const p = createDemoProject();
    const ref = { patternId: p.patterns[0].id, barIndex: 0, stepIndex: -1 };
    expect(notesAtTick(p, ref, 0)).toEqual([
      { track: 'crash', tick: 0, offset: 0, velocity: 115 },
      { track: 'kick', tick: 0, offset: 0, velocity: 112 },
    ]);
    expect(notesAtTick(p, ref, 1)).toEqual([]);
  });

  it('applies swing offsets to 16th off-beats', () => {
    let p = createProject();
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'hhClosed', 1, 80);
    p = ops.setSwing(p, pid, 100);
    expect(notesAtTick(p, { patternId: pid, barIndex: 0, stepIndex: -1 }, 3)).toEqual([
      { track: 'hhClosed', tick: 3, offset: 1.5, velocity: 80 },
    ]);
  });

  it('reads triplet beats on their own ticks', () => {
    const p = createDemoProject();
    const ref = { patternId: p.patterns[1].id, barIndex: 1, stepIndex: -1 };
    expect(notesAtTick(p, ref, 40)).toEqual([{ track: 'tom1', tick: 40, offset: 0, velocity: 100 }]);
    expect(notesAtTick(p, ref, 39)).toEqual([]);
  });

  it('skips muted tracks', () => {
    const p = ops.setTrackMuted(createDemoProject(), 'kick', true);
    const ref = { patternId: p.patterns[0].id, barIndex: 0, stepIndex: -1 };
    expect(notesAtTick(p, ref, 0).map((n) => n.track)).toEqual(['crash']);
  });

  it('returns nothing for missing bars or patterns', () => {
    const p = createDemoProject();
    expect(notesAtTick(p, { patternId: p.patterns[0].id, barIndex: 9, stepIndex: -1 }, 0)).toEqual([]);
    expect(notesAtTick(p, { patternId: 'gone', barIndex: 0, stepIndex: -1 }, 0)).toEqual([]);
  });

  it('collects a whole bar sorted by tick', () => {
    const p = createDemoProject();
    const notes = barNotes(p, { patternId: p.patterns[0].id, barIndex: 1, stepIndex: -1 });
    expect(notes).toHaveLength(15);
    expect(notes.map((n) => n.tick)).toEqual([...notes.map((n) => n.tick)].sort((x, y) => x - y));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/model/timeline.test.ts`
Expected: FAIL. Cannot find module `./timeline`.

- [ ] **Step 3: Implement `src/model/timeline.ts`**

```ts
import { cellAtTick, swingOffset, TICKS_PER_BAR, TICKS_PER_BEAT } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, Project, TrackId, Velocity } from './types';

export type PlayMode = 'pattern' | 'song';

export interface BarRef {
  patternId: string;
  barIndex: number;
  /** Index into project.song, or -1 in pattern mode. */
  stepIndex: number;
}

export interface TimelineOptions {
  mode: PlayMode;
  patternId: string;
  barIndex: number;
  loopBar: boolean;
}

export interface ScheduledNote {
  track: TrackId;
  /** Integer tick within the bar, 0..47. */
  tick: number;
  /** Swing delay in ticks (fractional). */
  offset: number;
  velocity: Velocity;
}

/** The ordered list of bars to play. Never empty. */
export function buildTimeline(p: Project, o: TimelineOptions): BarRef[] {
  if (o.mode === 'song' && p.song.length > 0) {
    const out: BarRef[] = [];
    p.song.forEach((step, stepIndex) => {
      const pat = p.patterns.find((x) => x.id === step.patternId);
      pat?.bars.forEach((_, barIndex) => out.push({ patternId: pat.id, barIndex, stepIndex }));
    });
    if (out.length > 0) return out;
  }
  const pat = p.patterns.find((x) => x.id === o.patternId) ?? p.patterns[0];
  if (o.loopBar) {
    const barIndex = Math.min(Math.max(o.barIndex, 0), pat.bars.length - 1);
    return [{ patternId: pat.id, barIndex, stepIndex: -1 }];
  }
  return pat.bars.map((_, barIndex) => ({ patternId: pat.id, barIndex, stepIndex: -1 }));
}

export function findPosition(tl: readonly BarRef[], ref: BarRef): number {
  const exact = tl.findIndex(
    (r) => r.patternId === ref.patternId && r.barIndex === ref.barIndex && r.stepIndex === ref.stepIndex,
  );
  if (exact >= 0) return exact;
  return tl.findIndex((r) => r.patternId === ref.patternId && r.barIndex === ref.barIndex);
}

/** The bar after `ref`; the first bar if `ref` is no longer in the timeline. */
export function nextRef(tl: readonly BarRef[], ref: BarRef): BarRef {
  return tl[(findPosition(tl, ref) + 1) % tl.length];
}

export function startRef(p: Project, o: TimelineOptions): BarRef {
  const tl = buildTimeline(p, o);
  if (o.mode === 'pattern' || p.song.length === 0) {
    const i = findPosition(tl, { patternId: o.patternId, barIndex: o.barIndex, stepIndex: -1 });
    return tl[Math.max(i, 0)];
  }
  return tl[0];
}

export function getBar(p: Project, ref: BarRef): Bar | undefined {
  return p.patterns.find((x) => x.id === ref.patternId)?.bars[ref.barIndex];
}

export function notesAtTick(p: Project, ref: BarRef, tick: number): ScheduledNote[] {
  const pat = p.patterns.find((x) => x.id === ref.patternId);
  const bar = pat?.bars[ref.barIndex];
  if (!pat || !bar) return [];
  const beat = bar.beats[Math.floor(tick / TICKS_PER_BEAT)];
  if (!beat) return [];
  const cell = cellAtTick(beat.div, tick % TICKS_PER_BEAT);
  if (cell < 0) return [];
  const offset = swingOffset(beat.div, cell, pat.swing);
  const out: ScheduledNote[] = [];
  for (const track of TRACK_IDS) {
    if (p.tracks[track].muted) continue;
    const velocity = beat.cells[track][cell];
    if (velocity > 0) out.push({ track, tick, offset, velocity });
  }
  return out;
}

export function barNotes(p: Project, ref: BarRef): ScheduledNote[] {
  const out: ScheduledNote[] = [];
  for (let t = 0; t < TICKS_PER_BAR; t++) out.push(...notesAtTick(p, ref, t));
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/model && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/timeline.ts src/model/timeline.test.ts
git commit -m "feat(model): playback timeline, cursor and per-tick note lookup"
```

---

### Task 5: Validation and local storage

**Files:**
- Create: `src/model/validate.ts`, `src/io/storage.ts`
- Test: `src/model/validate.test.ts`, `src/io/storage.test.ts`

**Interfaces:**
- Consumes: factory (`createBar`, `defaultTrackSettings`, `emptyCells`, `newId`, `nextPatternName`, `DEFAULT_BPM`), `MIN_BPM`/`MAX_BPM` (ops), timing (`clamp`, `clampVelocity`, `SUBDIVISIONS`), `projectProblems` (tests).
- Produces:
  - `parseProject(data: unknown, now?: number): Project | null`. It repairs anything fixable and returns null when there is no usable pattern.
  - `parseBar(data: unknown, used?: Set<string>): Bar`
  - `KeyValueStore` (`getItem`, `setItem`, `removeItem`)
  - `StorageUnavailableError`
  - `ProjectMeta { id; name; updatedAt }`
  - `KEYS`
  - `browserStore(): KeyValueStore | null`
  - `class ProjectStorage(kv: KeyValueStore | null)`:
    - `available`
    - `listProjects(): ProjectMeta[]`, newest first, skipping corrupt entries
    - `loadProject(id)`
    - `saveProject(p)`, which throws `StorageUnavailableError`
    - `deleteProject(id)`
    - `getLastProjectId()`, `setLastProjectId(id)`
    - `loadMostRecent(): Project | null`
    - `countCorrupt(): number`
    - `loadClipboard(): Bar | null`, `saveClipboard(bar)`
  - `createAutosaver(save, delayMs = 500): { schedule(p); flush() }`

- [ ] **Step 1: Write the failing tests**

`src/model/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createDemoProject } from './factory';
import { projectProblems } from './invariants';
import { parseBar, parseProject } from './validate';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('parseProject', () => {
  it('accepts a valid project unchanged', () => {
    const p = createDemoProject(123);
    expect(parseProject(clone(p))).toEqual(p);
  });

  it('rejects input without usable patterns', () => {
    for (const bad of [null, 42, 'x', [], {}, { patterns: [] }, { patterns: [1, 'x', null] }]) {
      expect(parseProject(bad)).toBeNull();
    }
  });

  it('repairs cells, subdivisions and velocities', () => {
    const raw = clone(createDemoProject());
    (raw.patterns[0].bars[0].beats[0].cells as Record<string, unknown>).kick = [500, -4, 'x'];
    (raw.patterns[0].bars[0].beats[1] as { div: number }).div = 5;
    const p = parseProject(raw)!;
    expect(p.patterns[0].bars[0].beats[0].cells.kick).toEqual([127, 0, 0, 0]);
    expect(p.patterns[0].bars[0].beats[1].div).toBe(4);
    expect(projectProblems(p)).toEqual([]);
  });

  it('fills defaults for missing fields', () => {
    const p = parseProject({ patterns: [{}] }, 7)!;
    expect(p.name).toBe('Untitled beat');
    expect(p.bpm).toBe(100);
    expect(p.kit).toBe('acoustic');
    expect(p.patterns[0].name).toBe('A');
    expect(p.patterns[0].bars).toHaveLength(1);
    expect(p.createdAt).toBe(7);
    expect(projectProblems(p)).toEqual([]);
  });

  it('drops song steps that reference unknown patterns', () => {
    const raw = clone(createDemoProject());
    raw.song.push({ id: 'zz', patternId: 'nope' });
    expect(parseProject(raw)!.song).toHaveLength(2);
  });

  it('regenerates duplicate ids and keeps song references on the first pattern', () => {
    const raw = clone(createDemoProject());
    raw.patterns[1].id = raw.patterns[0].id;
    raw.patterns[1].bars[0].id = raw.patterns[0].bars[0].id;
    const p = parseProject(raw)!;
    expect(p.patterns[1].id).not.toBe(p.patterns[0].id);
    expect(p.song.every((s) => s.patternId === p.patterns[0].id)).toBe(true);
    expect(projectProblems(p)).toEqual([]);
  });

  it('never returns an invalid project for randomly damaged input', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const junk: unknown[] = [null, -1, 'x', [], {}, 1e9, true, 3.7];
    for (let i = 0; i < 300; i++) {
      const raw = clone(createDemoProject()) as unknown as Record<string, unknown>;
      const paths: { obj: Record<string, unknown> | unknown[]; key: string | number }[] = [];
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach((v, k) => { paths.push({ obj: o, key: k }); walk(v); });
        else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { paths.push({ obj: o as Record<string, unknown>, key: k }); walk(v); }
      };
      walk(raw);
      for (let n = 0; n < 3; n++) {
        const { obj, key } = paths[Math.floor(rand() * paths.length)];
        (obj as Record<string | number, unknown>)[key] = junk[Math.floor(rand() * junk.length)];
      }
      const p = parseProject(raw);
      if (p) expect(projectProblems(p)).toEqual([]);
    }
  });
});

describe('parseBar', () => {
  it('builds a full bar from partial data', () => {
    const bar = parseBar({ id: 'b1', beats: [{ div: 3, cells: { snare: [0, 90, 0] } }] });
    expect(bar.id).toBe('b1');
    expect(bar.beats[0].div).toBe(3);
    expect(bar.beats[0].cells.snare).toEqual([0, 90, 0]);
    expect(bar.beats[3].cells.kick).toEqual([0, 0, 0, 0]);
  });
});
```

`src/io/storage.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBar, createDemoProject, createProject } from '../model/factory';
import { createAutosaver, KEYS, ProjectStorage, StorageUnavailableError, type KeyValueStore } from './storage';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('ProjectStorage', () => {
  it('saves, loads and lists projects newest first', () => {
    const s = new ProjectStorage(new MemoryStore());
    const a = { ...createProject('A'), updatedAt: 1 };
    const b = { ...createDemoProject(), updatedAt: 2 };
    s.saveProject(a);
    s.saveProject(b);
    expect(s.loadProject(a.id)).toEqual(a);
    expect(s.listProjects().map((m) => m.name)).toEqual(['Demo groove', 'A']);
    s.saveProject({ ...a, updatedAt: 3, name: 'A2' });
    expect(s.listProjects().map((m) => m.name)).toEqual(['A2', 'Demo groove']);
  });

  it('returns null for corrupt JSON', () => {
    const kv = new MemoryStore();
    kv.setItem(KEYS.project('x'), '{not json');
    expect(new ProjectStorage(kv).loadProject('x')).toBeNull();
  });

  it('skips corrupt projects in the index', () => {
    const kv = new MemoryStore();
    const s = new ProjectStorage(kv);
    const good = createProject('Good');
    s.saveProject(good);
    kv.setItem(KEYS.index, JSON.stringify([
      { id: good.id, name: 'Good', updatedAt: 1 },
      { id: 'broken', name: 'Broken', updatedAt: 2 },
      { id: 'empty', name: 'Empty', updatedAt: 3 },
      'garbage',
    ]));
    kv.setItem(KEYS.project('broken'), '{oops');
    kv.setItem(KEYS.project('empty'), JSON.stringify({ patterns: [] }));
    expect(s.listProjects().map((m) => m.id)).toEqual([good.id]);
    expect(s.countCorrupt()).toBe(2);
  });

  it('deletes projects and forgets the last-opened id', () => {
    const s = new ProjectStorage(new MemoryStore());
    const p = createProject();
    s.saveProject(p);
    s.setLastProjectId(p.id);
    s.deleteProject(p.id);
    expect(s.loadProject(p.id)).toBeNull();
    expect(s.listProjects()).toEqual([]);
    expect(s.getLastProjectId()).toBeNull();
  });

  it('wraps quota errors in StorageUnavailableError', () => {
    const kv = new MemoryStore();
    kv.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => new ProjectStorage(kv).saveProject(createProject())).toThrow(StorageUnavailableError);
  });

  it('degrades gracefully without storage', () => {
    const s = new ProjectStorage(null);
    expect(s.available).toBe(false);
    expect(() => s.saveProject(createProject())).toThrow(StorageUnavailableError);
    expect(s.listProjects()).toEqual([]);
    const bar = createBar('mem');
    s.saveClipboard(bar);
    expect(s.loadClipboard()?.id).toBe('mem');
  });

  it('boots from the last project, falling back to the newest loadable one', () => {
    const kv = new MemoryStore();
    const s = new ProjectStorage(kv);
    expect(s.loadMostRecent()).toBeNull();
    const older = { ...createProject('Older'), updatedAt: 1 };
    const newer = { ...createProject('Newer'), updatedAt: 2 };
    s.saveProject(older);
    s.saveProject(newer);
    s.setLastProjectId(older.id);
    expect(s.loadMostRecent()?.name).toBe('Older');
    kv.setItem(KEYS.project(older.id), '{broken');
    expect(s.loadMostRecent()?.name).toBe('Newer');
  });

  it('round-trips the bar clipboard', () => {
    const kv = new MemoryStore();
    const bar = createBar('c1');
    bar.beats[2].cells.snare[0] = 99;
    new ProjectStorage(kv).saveClipboard(bar);
    expect(new ProjectStorage(kv).loadClipboard()).toEqual(bar);
  });
});

describe('createAutosaver', () => {
  afterEach(() => vi.useRealTimers());

  it('saves only the latest project after the delay', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const a = createAutosaver(save, 500);
    const p1 = createProject('1');
    const p2 = createProject('2');
    a.schedule(p1);
    vi.advanceTimersByTime(300);
    a.schedule(p2);
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(p2);
  });

  it('flushes immediately on demand and only once', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const a = createAutosaver(save, 500);
    a.schedule(createProject());
    a.flush();
    a.flush();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/model/validate.test.ts src/io/storage.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement `src/model/validate.ts`**

```ts
import { createBar, DEFAULT_BPM, defaultTrackSettings, emptyCells, newId, nextPatternName } from './factory';
import { MAX_BPM, MIN_BPM } from './ops';
import { clamp, clampVelocity, SUBDIVISIONS } from './timing';
import { TRACK_IDS } from './tracks';
import type { Bar, Beat, Pattern, Project, SongStep, Subdivision } from './types';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

function uniqueId(raw: unknown, used: Set<string>): string {
  let id = str(raw);
  while (!id || used.has(id)) id = newId();
  used.add(id);
  return id;
}

function parseBeat(x: unknown): Beat {
  const rawDiv = isObj(x) ? x.div : undefined;
  const div: Subdivision = SUBDIVISIONS.includes(rawDiv as Subdivision) ? (rawDiv as Subdivision) : 4;
  const cells = emptyCells(div);
  const rawCells = isObj(x) && isObj(x.cells) ? x.cells : {};
  for (const t of TRACK_IDS) {
    const arr = rawCells[t];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < div; i++) cells[t][i] = clampVelocity(num(arr[i], 0));
  }
  return { div, cells };
}

export function parseBar(x: unknown, used: Set<string> = new Set()): Bar {
  const beats: unknown[] = isObj(x) && Array.isArray(x.beats) ? x.beats : [];
  return {
    id: uniqueId(isObj(x) ? x.id : undefined, used),
    beats: [parseBeat(beats[0]), parseBeat(beats[1]), parseBeat(beats[2]), parseBeat(beats[3])],
  };
}

/** Turns untrusted JSON into a valid Project, repairing what it can. Null if nothing usable. */
export function parseProject(data: unknown, now: number = Date.now()): Project | null {
  if (!isObj(data) || !Array.isArray(data.patterns)) return null;
  const used = new Set<string>();
  const patternIdMap = new Map<string, string>();
  const patterns: Pattern[] = [];

  for (const raw of data.patterns) {
    if (!isObj(raw)) continue;
    const originalId = str(raw.id);
    const id = uniqueId(raw.id, used);
    if (originalId && !patternIdMap.has(originalId)) patternIdMap.set(originalId, id);
    const bars = Array.isArray(raw.bars) ? raw.bars.map((b) => parseBar(b, used)) : [];
    if (bars.length === 0) bars.push(createBar(uniqueId(undefined, used)));
    const name = str(raw.name).slice(0, 24) || nextPatternName(patterns.map((p) => p.name));
    patterns.push({ id, name, swing: clamp(Math.round(num(raw.swing, 0)), 0, 100), bars });
  }
  if (patterns.length === 0) return null;

  const song: SongStep[] = [];
  if (Array.isArray(data.song)) {
    for (const raw of data.song) {
      if (!isObj(raw)) continue;
      const patternId = patternIdMap.get(str(raw.patternId));
      if (patternId) song.push({ id: uniqueId(raw.id, used), patternId });
    }
  }

  const tracks = defaultTrackSettings();
  if (isObj(data.tracks)) {
    for (const t of TRACK_IDS) {
      const s = data.tracks[t];
      if (isObj(s)) tracks[t] = { muted: s.muted === true, hidden: s.hidden === true };
    }
  }

  return {
    version: 1,
    id: str(data.id) || newId(),
    name: str(data.name).slice(0, 60) || 'Untitled beat',
    bpm: clamp(Math.round(num(data.bpm, DEFAULT_BPM)), MIN_BPM, MAX_BPM),
    kit: data.kit === 'electronic' ? 'electronic' : 'acoustic',
    patterns,
    song,
    tracks,
    createdAt: num(data.createdAt, now),
    updatedAt: num(data.updatedAt, now),
  };
}
```

- [ ] **Step 4: Implement `src/io/storage.ts`**

```ts
import { parseBar, parseProject } from '../model/validate';
import type { Bar, Project } from '../model/types';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class StorageUnavailableError extends Error {
  constructor(message = 'Storage unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export const KEYS = {
  index: 'dm:index',
  last: 'dm:last',
  clipboard: 'dm:clipboard',
  project: (id: string) => `dm:project:${id}`,
};

/** localStorage if it is usable (it throws in some private modes), else null. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.setItem('dm:probe', '1');
    s.removeItem('dm:probe');
    return s;
  } catch {
    return null;
  }
}

const isMeta = (m: unknown): m is ProjectMeta =>
  typeof m === 'object' && m !== null &&
  typeof (m as ProjectMeta).id === 'string' &&
  typeof (m as ProjectMeta).name === 'string' &&
  typeof (m as ProjectMeta).updatedAt === 'number';

export class ProjectStorage {
  private memoryClipboard: Bar | null = null;

  constructor(private readonly kv: KeyValueStore | null) {}

  get available(): boolean {
    return this.kv !== null;
  }

  private read(key: string): unknown {
    if (!this.kv) return null;
    try {
      const raw = this.kv.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    if (!this.kv) throw new StorageUnavailableError();
    try {
      this.kv.setItem(key, JSON.stringify(value));
    } catch (e) {
      throw new StorageUnavailableError(e instanceof Error ? e.message : String(e));
    }
  }

  private readIndex(): ProjectMeta[] {
    const raw = this.read(KEYS.index);
    return Array.isArray(raw) ? raw.filter(isMeta) : [];
  }

  listProjects(): ProjectMeta[] {
    return this.readIndex()
      .filter((m) => this.loadProject(m.id) !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  loadProject(id: string): Project | null {
    const raw = this.read(KEYS.project(id));
    if (raw === null) return null;
    const p = parseProject(raw);
    if (!p) {
      console.warn(`Skipping corrupt project ${id}`);
      return null;
    }
    return { ...p, id };
  }

  saveProject(p: Project): void {
    this.write(KEYS.project(p.id), p);
    const index = this.readIndex().filter((m) => m.id !== p.id);
    index.push({ id: p.id, name: p.name, updatedAt: p.updatedAt });
    this.write(KEYS.index, index);
  }

  deleteProject(id: string): void {
    if (!this.kv) return;
    try {
      this.kv.removeItem(KEYS.project(id));
      this.write(KEYS.index, this.readIndex().filter((m) => m.id !== id));
      if (this.getLastProjectId() === id) this.kv.removeItem(KEYS.last);
    } catch {
      // best effort
    }
  }

  getLastProjectId(): string | null {
    if (!this.kv) return null;
    try {
      return this.kv.getItem(KEYS.last);
    } catch {
      return null;
    }
  }

  setLastProjectId(id: string): void {
    if (!this.kv) return;
    try {
      this.kv.setItem(KEYS.last, id);
    } catch {
      // ignore
    }
  }

  /** Number of index entries whose stored project is missing or unreadable. */
  countCorrupt(): number {
    return this.readIndex().filter((m) => this.loadProject(m.id) === null).length;
  }

  /** The last-opened project if loadable, else the newest loadable one, else null. */
  loadMostRecent(): Project | null {
    const last = this.getLastProjectId();
    const fromLast = last ? this.loadProject(last) : null;
    if (fromLast) return fromLast;
    for (const meta of this.listProjects()) {
      const p = this.loadProject(meta.id);
      if (p) return p;
    }
    return null;
  }

  loadClipboard(): Bar | null {
    const raw = this.read(KEYS.clipboard);
    return raw ? parseBar(raw) : this.memoryClipboard;
  }

  saveClipboard(bar: Bar): void {
    this.memoryClipboard = bar;
    try {
      this.write(KEYS.clipboard, bar);
    } catch {
      // the in-memory copy still works for this session
    }
  }
}

export interface Autosaver {
  schedule(p: Project): void;
  flush(): void;
}

export function createAutosaver(save: (p: Project) => void, delayMs = 500): Autosaver {
  let pending: Project | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending) {
      const p = pending;
      pending = null;
      save(p);
    }
  };
  return {
    schedule(p) {
      pending = p;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS. The corrupt-project test prints a `console.warn`, which is expected.

- [ ] **Step 6: Commit**

```bash
git add src/model/validate.ts src/model/validate.test.ts src/io
git commit -m "feat: project validation and localStorage persistence"
```

---

### Task 6: Share-link codec

**Files:**
- Create: `src/io/share.ts`
- Test: `src/io/share.test.ts`

**Interfaces:**
- Consumes: `parseProject` (validate), `TRACK_IDS`, `Project`, `Beat`.
- Produces:
  - `class ShareError extends Error`
  - `toCompact(p): CompactV1`
  - `fromCompact(c: unknown): Project`, which throws `ShareError`
  - `encodeShare(p): Promise<string>`, which returns a URL-safe payload
  - `decodeShare(payload): Promise<Project>`, which throws `ShareError`
  - `shareUrl(payload, base): string`, in the form `base#p=payload`
  - `payloadFromHash(hash): string | null`
  - `compressionSupported(): boolean`

**Format:** the compact JSON looks like `{ v: 1, n, b, k: 'a'|'e', m, h, p: [[name, swing, bars]], s: [patternIndex…] }`.
- `m` and `h` are bitmasks over `TRACK_IDS` order, for muted and hidden.
- Each bar is an array of 4 beat strings.
- A beat string is `String(div)` followed by, for each track in `TRACK_IDS` order, `div` velocities as two lowercase hex digits each.

The JSON is UTF-8 encoded, then deflate-raw compressed, then base64url-encoded without padding.

- [ ] **Step 1: Write the failing test `src/io/share.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../model/factory';
import { projectProblems } from '../model/invariants';
import * as ops from '../model/ops';
import type { Project } from '../model/types';
import { decodeShare, encodeShare, fromCompact, payloadFromHash, ShareError, shareUrl, toCompact } from './share';

/** Strip ids and timestamps, which are intentionally not preserved. */
function shape(p: Project) {
  const nameOf = (id: string) => p.patterns.find((x) => x.id === id)!.name;
  return {
    name: p.name, bpm: p.bpm, kit: p.kit, tracks: p.tracks,
    patterns: p.patterns.map((x) => ({ name: x.name, swing: x.swing, bars: x.bars.map((b) => b.beats) })),
    song: p.song.map((s) => nameOf(s.patternId)),
  };
}

function richProject(): Project {
  let p = createDemoProject();
  p = ops.setTrackMuted(p, 'ride', true);
  p = ops.setTrackHidden(p, 'tom2', true);
  p = ops.setSwing(p, p.patterns[0].id, 57);
  p = ops.setKit(p, 'electronic');
  p = ops.setBpm(p, 133);
  p = ops.setBeatDiv(p, p.patterns[0].id, 1, 2, 6);
  p = ops.setVelocity(p, p.patterns[0].id, 1, 2, 'snare', 5, 127);
  return p;
}

describe('share codec', () => {
  it('round-trips a project through the compact form', () => {
    const p = richProject();
    expect(shape(fromCompact(JSON.parse(JSON.stringify(toCompact(p)))))).toEqual(shape(p));
  });

  it('round-trips through an encoded payload with a URL-safe alphabet', async () => {
    const p = richProject();
    const payload = await encodeShare(p);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(payload);
    expect(shape(back)).toEqual(shape(p));
    expect(projectProblems(back)).toEqual([]);
    expect(back.id).not.toBe(p.id);
  });

  it('round-trips a large project and stays compact', async () => {
    let p = createDemoProject();
    for (let i = 0; i < 8; i++) p = ops.duplicatePattern(p, p.patterns[0].id, `dup${i}`);
    for (const [i, pat] of p.patterns.entries()) {
      for (let b = 0; b < 14; b++) p = ops.duplicateBar(p, pat.id, 0, `${pat.id}-${b}`);
      p = ops.setVelocity(p, pat.id, 3, 1, 'tom1', 2, 64 + i);
    }
    const payload = await encodeShare(p);
    expect(payload.length).toBeLessThan(8000);
    expect(shape(await decodeShare(payload))).toEqual(shape(p));
  });

  it('rejects garbage, truncated and tampered payloads with ShareError', async () => {
    const payload = await encodeShare(createDemoProject());
    await expect(decodeShare('!!!')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeShare('aGVsbG8')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeShare(payload.slice(0, payload.length / 2))).rejects.toBeInstanceOf(ShareError);
    const compact = toCompact(createDemoProject());
    compact.p[0][2][0][0] = '4abc';
    expect(() => fromCompact(compact)).toThrow(ShareError);
    expect(() => fromCompact({ v: 2 })).toThrow(ShareError);
  });

  it('builds and parses share URLs', () => {
    expect(shareUrl('abc_-1', 'https://x.dev/dm/')).toBe('https://x.dev/dm/#p=abc_-1');
    expect(payloadFromHash('#p=abc_-1')).toBe('abc_-1');
    expect(payloadFromHash('p=abc')).toBe('abc');
    expect(payloadFromHash('#x=abc')).toBeNull();
    expect(payloadFromHash('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/io/share.test.ts`
Expected: FAIL. Cannot find module `./share`.

- [ ] **Step 3: Implement `src/io/share.ts`**

```ts
import { TRACK_IDS } from '../model/tracks';
import type { Beat, Project } from '../model/types';
import { parseProject } from '../model/validate';

export class ShareError extends Error {
  constructor(message = 'This link is invalid or damaged') {
    super(message);
    this.name = 'ShareError';
  }
}

type CompactPattern = [name: string, swing: number, bars: string[][]];

export interface CompactV1 {
  v: 1;
  n: string;
  b: number;
  k: 'a' | 'e';
  m: number;
  h: number;
  p: CompactPattern[];
  s: number[];
}

function encodeBeat(beat: Beat): string {
  let s = String(beat.div);
  for (const t of TRACK_IDS) for (const v of beat.cells[t]) s += v.toString(16).padStart(2, '0');
  return s;
}

function decodeBeat(s: unknown): { div: number; cells: Record<string, number[]> } {
  if (typeof s !== 'string') throw new ShareError();
  const div = Number(s[0]);
  if (![4, 3, 6].includes(div) || s.length !== 1 + TRACK_IDS.length * div * 2 || !/^[0-9a-f]*$/.test(s.slice(1))) {
    throw new ShareError();
  }
  const cells: Record<string, number[]> = {};
  let pos = 1;
  for (const t of TRACK_IDS) {
    const arr: number[] = [];
    for (let i = 0; i < div; i++, pos += 2) arr.push(parseInt(s.slice(pos, pos + 2), 16));
    cells[t] = arr;
  }
  return { div, cells };
}

const mask = (p: Project, key: 'muted' | 'hidden') =>
  TRACK_IDS.reduce((m, t, i) => (p.tracks[t][key] ? m | (1 << i) : m), 0);

export function toCompact(p: Project): CompactV1 {
  return {
    v: 1,
    n: p.name,
    b: p.bpm,
    k: p.kit === 'electronic' ? 'e' : 'a',
    m: mask(p, 'muted'),
    h: mask(p, 'hidden'),
    p: p.patterns.map((pat) => [pat.name, pat.swing, pat.bars.map((bar) => bar.beats.map(encodeBeat))]),
    s: p.song.map((step) => p.patterns.findIndex((x) => x.id === step.patternId)).filter((i) => i >= 0),
  };
}

export function fromCompact(c: unknown): Project {
  if (typeof c !== 'object' || c === null) throw new ShareError();
  const o = c as Partial<CompactV1>;
  if (o.v !== 1 || !Array.isArray(o.p) || !Array.isArray(o.s)) throw new ShareError();
  const patterns = o.p.map((entry, i) => {
    if (!Array.isArray(entry) || !Array.isArray(entry[2])) throw new ShareError();
    const [name, swing, bars] = entry;
    return {
      id: `p${i}`,
      name,
      swing,
      bars: bars.map((beats) => {
        if (!Array.isArray(beats) || beats.length !== 4) throw new ShareError();
        return { beats: beats.map(decodeBeat) };
      }),
    };
  });
  const tracks = Object.fromEntries(
    TRACK_IDS.map((t, i) => [t, { muted: ((o.m ?? 0) >> i) & 1 ? true : false, hidden: ((o.h ?? 0) >> i) & 1 ? true : false }]),
  );
  const project = parseProject({
    name: o.n,
    bpm: o.b,
    kit: o.k === 'e' ? 'electronic' : 'acoustic',
    tracks,
    patterns,
    song: o.s.map((i) => ({ patternId: `p${i}` })),
  });
  if (!project) throw new ShareError();
  return project;
}

export function compressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeShare(p: Project): Promise<string> {
  const json = JSON.stringify(toCompact(p));
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeShare(payload: string): Promise<Project> {
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw')));
    return fromCompact(JSON.parse(json));
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError();
  }
}

export const SHARE_PARAM = 'p';

export function shareUrl(payload: string, base: string): string {
  return `${base}#${SHARE_PARAM}=${payload}`;
}

export function payloadFromHash(hash: string): string | null {
  const m = /^#?p=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1] : null;
}
```

If TypeScript complains about the `Uint8Array<ArrayBuffer>` generic, the installed `lib.dom` predates typed-array generics. In that case drop the generic arguments and pass `bytes` to `Blob` as `bytes as BlobPart`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/io/share.test.ts && pnpm typecheck`
Expected: all PASS. Node 24 provides `CompressionStream` with `deflate-raw`. If the "stays compact" bound fails, print the actual length and investigate before you raise the bound. Raise it only if the content really is less repetitive than intended.

- [ ] **Step 5: Commit**

```bash
git add src/io/share.ts src/io/share.test.ts
git commit -m "feat(io): compact share-link codec with deflate-raw + base64url"
```

---

### Task 7: MIDI export and file download

**Files:**
- Create: `src/io/midi.ts`, `src/io/download.ts`
- Test: `src/io/midi.test.ts`

**Interfaces:**
- Consumes: `buildTimeline`, `barNotes` (timeline); `TRACK_BY_ID`; `TICKS_PER_BAR`, `TICKS_PER_BEAT` (timing).
- Produces:
  - `midi.ts`:
    - `PPQ = 480`
    - `vlq(n): number[]`
    - `exportMidi(p: Project, o: { patternId: string }): Uint8Array<ArrayBuffer>`
  - `download.ts`:
    - `downloadBytes(bytes, filename, mimeType): void`
    - `safeFilename(name): string`

- [ ] **Step 1: Write the failing test `src/io/midi.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createDemoProject, createProject } from '../model/factory';
import * as ops from '../model/ops';
import { exportMidi, PPQ, vlq } from './midi';
import { safeFilename } from './download';

interface Ev { time: number; status: number; data: number[] }

/** Minimal SMF format-0 reader for assertions. */
function readMidi(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  expect(text(0, 4)).toBe('MThd');
  const header = { length: dv.getUint32(4), format: dv.getUint16(8), tracks: dv.getUint16(10), division: dv.getUint16(12) };
  expect(text(14, 4)).toBe('MTrk');
  const end = 22 + dv.getUint32(18);
  let pos = 22;
  let time = 0;
  const events: Ev[] = [];
  const metas: { time: number; type: number; data: number[] }[] = [];
  const readVlq = () => { let v = 0; for (;;) { const b = bytes[pos++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v; } };
  while (pos < end) {
    time += readVlq();
    const status = bytes[pos++];
    if (status === 0xff) {
      const type = bytes[pos++];
      const len = readVlq();
      metas.push({ time, type, data: [...bytes.subarray(pos, pos + len)] });
      pos += len;
    } else {
      events.push({ time, status, data: [bytes[pos], bytes[pos + 1]] });
      pos += 2;
    }
  }
  return { header, events, metas, endPos: pos, totalLength: bytes.length };
}

describe('vlq', () => {
  it('encodes variable-length quantities', () => {
    expect(vlq(0)).toEqual([0x00]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
    expect(vlq(0x200000)).toEqual([0x81, 0x80, 0x80, 0x00]);
  });
});

describe('exportMidi', () => {
  function simple() {
    let p = createProject('Beat');
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    p = ops.setVelocity(p, pid, 0, 1, 'snare', 0, 90);
    p = ops.setBpm(p, 120);
    return { p, pid };
  }

  it('writes a format-0 header with 480 PPQ and tempo/time-signature metas', () => {
    const { p, pid } = simple();
    const m = readMidi(exportMidi(p, { patternId: pid }));
    expect(m.header).toEqual({ length: 6, format: 0, tracks: 1, division: PPQ });
    expect(m.endPos).toBe(m.totalLength);
    const tempo = m.metas.find((x) => x.type === 0x51)!;
    expect((tempo.data[0] << 16) | (tempo.data[1] << 8) | tempo.data[2]).toBe(500000);
    expect(m.metas.find((x) => x.type === 0x58)!.data).toEqual([4, 2, 24, 8]);
    expect(m.metas.at(-1)).toEqual({ time: 1920, type: 0x2f, data: [] });
  });

  it('writes note on/off pairs on channel 10 with GM notes', () => {
    const { p, pid } = simple();
    const { events } = readMidi(exportMidi(p, { patternId: pid }));
    expect(events).toEqual([
      { time: 0, status: 0x99, data: [36, 100] },
      { time: 120, status: 0x89, data: [36, 64] },
      { time: 480, status: 0x99, data: [38, 90] },
      { time: 600, status: 0x89, data: [38, 64] },
    ]);
  });

  it('bakes swing into note times', () => {
    let p = createProject();
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'hhClosed', 1, 80);
    p = ops.setSwing(p, pid, 100);
    const { events } = readMidi(exportMidi(p, { patternId: pid }));
    expect(events[0]).toEqual({ time: 180, status: 0x99, data: [42, 80] });
  });

  it('excludes muted tracks', () => {
    const { p, pid } = simple();
    const { events } = readMidi(exportMidi(ops.setTrackMuted(p, 'kick', true), { patternId: pid }));
    expect(events.map((e) => e.data[0])).toEqual([38, 38]);
  });

  it('exports the whole song when it has steps', () => {
    const p = createDemoProject();
    const m = readMidi(exportMidi(p, { patternId: p.patterns[0].id }));
    expect(m.metas.at(-1)!.time).toBe(4 * 1920);
    const firstBarB = m.events.filter((e) => e.time >= 2 * 1920 && e.time < 3 * 1920 && e.status === 0x99);
    expect(firstBarB.length).toBeGreaterThan(0);
  });

  it('exports the current pattern when the song is empty', () => {
    let p = createDemoProject();
    p = { ...p, song: [] };
    const m = readMidi(exportMidi(p, { patternId: p.patterns[1].id }));
    expect(m.metas.at(-1)!.time).toBe(2 * 1920);
  });
});

describe('safeFilename', () => {
  it('keeps letters, digits, dashes and spaces as dashes', () => {
    expect(safeFilename('My  Beat #1!')).toBe('My-Beat-1');
    expect(safeFilename('***')).toBe('beat');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/io/midi.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Implement `src/io/midi.ts` and `src/io/download.ts`**

`src/io/midi.ts`:
```ts
import { barNotes, buildTimeline } from '../model/timeline';
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../model/timing';
import { TRACK_BY_ID } from '../model/tracks';
import type { Project } from '../model/types';

export const PPQ = 480;
const MIDI_PER_GRID_TICK = PPQ / TICKS_PER_BEAT; // 40
const BAR_LENGTH = TICKS_PER_BAR * MIDI_PER_GRID_TICK; // 1920
const NOTE_LENGTH = PPQ / 4;

export function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  let v = Math.floor(n / 128);
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  return bytes;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

interface TimedEvent { time: number; order: number; bytes: number[] }

/** Standard MIDI file (format 0, channel 10) of the song, or of the pattern when the song is empty. */
export function exportMidi(p: Project, o: { patternId: string }): Uint8Array<ArrayBuffer> {
  const refs = buildTimeline(p, {
    mode: p.song.length > 0 ? 'song' : 'pattern',
    patternId: o.patternId,
    barIndex: 0,
    loopBar: false,
  });

  const events: TimedEvent[] = [];
  refs.forEach((ref, k) => {
    for (const n of barNotes(p, ref)) {
      const time = k * BAR_LENGTH + Math.round((n.tick + n.offset) * MIDI_PER_GRID_TICK);
      const note = TRACK_BY_ID[n.track].midi;
      events.push({ time, order: 1, bytes: [0x99, note, Math.max(1, n.velocity)] });
      events.push({ time: time + NOTE_LENGTH, order: 0, bytes: [0x89, note, 0x40] });
    }
  });
  events.sort((a, b) => a.time - b.time || a.order - b.order);

  const name = Array.from(new TextEncoder().encode(p.name));
  const mpq = Math.round(60_000_000 / p.bpm);
  const track: number[] = [
    0x00, 0xff, 0x03, ...vlq(name.length), ...name,
    0x00, 0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff,
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
  ];
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.time - last), ...e.bytes);
    last = e.time;
  }
  const end = refs.length * BAR_LENGTH;
  track.push(...vlq(Math.max(0, end - last)), 0xff, 0x2f, 0x00);

  return new Uint8Array([
    ...ascii('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ),
    ...ascii('MTrk'), ...u32(track.length), ...track,
  ]);
}
```

`src/io/download.ts`:
```ts
export function safeFilename(name: string): string {
  const clean = name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean.slice(0, 60) || 'beat';
}

export function downloadBytes(bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/io && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/io/midi.ts src/io/download.ts src/io/midi.test.ts
git commit -m "feat(io): standard MIDI file export with swing and muting"
```

---

### Task 8: App store with undo history, gestures and UI state

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Consumes: `Project`, `Pattern`, `Bar`, `PlayMode`, `createProject`.
- Produces:
  - Types:
    - `type View = 'grid' | 'song' | 'notation'`
    - `type EditMode = 'notes' | 'volume'`
    - `interface UiState { patternId; barIndex; view; editMode; playMode; loopBar; follow; playing }`
    - `interface Toast { id: number; message: string; kind: 'info' | 'error' }`
    - `interface AppState`, which holds the state plus these actions:
      - `apply(edit)`
      - `beginGesture()`, `applyTransient(edit)`, `endGesture()`
      - `undo()`, `redo()`
      - `loadProject(p)`
      - `setUi(patch)`
      - `toast(message, kind?)`, `dismissToast(id)`
  - Constants and store:
    - `HISTORY_LIMIT = 200`
    - `createAppStore(initial, now?)`
    - `appStore`, the singleton
    - `useApp(selector)`
  - Selectors:
    - `currentPattern(s): Pattern`
    - `currentBar(s): Bar`
    - `initialUi(p): UiState`

- [ ] **Step 1: Write the failing test `src/state/store.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createDemoProject, createProject } from '../model/factory';
import * as ops from '../model/ops';
import { createAppStore, currentBar, currentPattern, HISTORY_LIMIT } from './store';

function setup() {
  let t = 1000;
  return createAppStore(createDemoProject(0), () => ++t);
}

describe('history', () => {
  it('commits edits with a fresh updatedAt and supports undo/redo', () => {
    const store = setup();
    const s = store.getState();
    const before = s.project;
    s.apply((p) => ops.setBpm(p, 150));
    expect(store.getState().project.bpm).toBe(150);
    expect(store.getState().project.updatedAt).toBe(1001);
    store.getState().undo();
    expect(store.getState().project).toBe(before);
    store.getState().redo();
    expect(store.getState().project.bpm).toBe(150);
  });

  it('ignores no-op edits', () => {
    const store = setup();
    store.getState().apply((p) => p);
    store.getState().apply((p) => ops.setBpm(p, p.bpm));
    expect(store.getState().past).toHaveLength(0);
  });

  it('clears redo after a new edit', () => {
    const store = setup();
    store.getState().apply((p) => ops.setBpm(p, 150));
    store.getState().undo();
    store.getState().apply((p) => ops.setBpm(p, 90));
    expect(store.getState().future).toHaveLength(0);
  });

  it('coalesces a gesture into one undo entry', () => {
    const store = setup();
    const before = store.getState().project;
    const pid = before.patterns[0].id;
    store.getState().beginGesture();
    for (const v of [20, 40, 60, 80]) store.getState().applyTransient((p) => ops.setVelocity(p, pid, 0, 0, 'tom1', 0, v));
    expect(store.getState().past).toHaveLength(0);
    store.getState().endGesture();
    expect(store.getState().past).toHaveLength(1);
    expect(currentBar(store.getState()).beats[0].cells.tom1[0]).toBe(80);
    store.getState().undo();
    expect(store.getState().project).toBe(before);
  });

  it('adds nothing for a gesture without changes', () => {
    const store = setup();
    store.getState().beginGesture();
    store.getState().endGesture();
    expect(store.getState().past).toHaveLength(0);
  });

  it('ends an open gesture before applying a normal edit', () => {
    const store = setup();
    const pid = store.getState().project.patterns[0].id;
    store.getState().applyTransient((p) => ops.setVelocity(p, pid, 0, 0, 'tom1', 0, 50));
    store.getState().apply((p) => ops.setBpm(p, 77));
    expect(store.getState().past).toHaveLength(2);
    expect(store.getState().gestureBase).toBeNull();
  });

  it('caps history', () => {
    const store = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.getState().apply((p) => ops.setBpm(p, 40 + (i % 150)));
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it('undoes a subdivision change exactly', () => {
    const store = setup();
    const pid = store.getState().project.patterns[0].id;
    const before = currentBar(store.getState()).beats[2];
    store.getState().apply((p) => ops.setBeatDiv(p, pid, 0, 2, 3));
    store.getState().apply((p) => ops.setBeatDiv(p, pid, 0, 2, 4));
    store.getState().undo();
    store.getState().undo();
    expect(currentBar(store.getState()).beats[2]).toEqual(before);
  });
});

describe('ui state', () => {
  it('starts on the first pattern, first bar, grid view, notes mode', () => {
    const store = setup();
    const { ui, project } = store.getState();
    expect(ui).toMatchObject({ patternId: project.patterns[0].id, barIndex: 0, view: 'grid', editMode: 'notes', playMode: 'pattern', loopBar: false, follow: true, playing: false });
  });

  it('moves off a deleted pattern and clamps the bar index', () => {
    const store = setup();
    const [a, b] = store.getState().project.patterns;
    store.getState().setUi({ patternId: b.id, barIndex: 1 });
    store.getState().apply((p) => ops.deletePattern(p, b.id));
    expect(store.getState().ui.patternId).toBe(a.id);
    store.getState().setUi({ barIndex: 1 });
    store.getState().apply((p) => ops.deleteBar(p, a.id, 1));
    expect(store.getState().ui.barIndex).toBe(0);
    store.getState().setUi({ barIndex: 99 });
    expect(store.getState().ui.barIndex).toBe(0);
  });

  it('falls back to pattern play mode when the song is empty', () => {
    const store = createAppStore(createProject());
    store.getState().setUi({ playMode: 'song' });
    expect(store.getState().ui.playMode).toBe('pattern');
  });

  it('resets history and ui when loading a project', () => {
    const store = setup();
    store.getState().apply((p) => ops.setBpm(p, 150));
    store.getState().setUi({ view: 'song' });
    const other = createProject('Other');
    store.getState().loadProject(other);
    const s = store.getState();
    expect(s.project).toBe(other);
    expect(s.past).toHaveLength(0);
    expect(s.ui.view).toBe('grid');
    expect(s.ui.patternId).toBe(other.patterns[0].id);
  });

  it('keeps at most three toasts and dismisses by id', () => {
    const store = setup();
    for (const m of ['a', 'b', 'c', 'd']) store.getState().toast(m);
    expect(store.getState().toasts.map((t) => t.message)).toEqual(['b', 'c', 'd']);
    store.getState().dismissToast(store.getState().toasts[0].id);
    expect(store.getState().toasts.map((t) => t.message)).toEqual(['c', 'd']);
  });

  it('exposes current pattern and bar selectors', () => {
    const store = setup();
    const b = store.getState().project.patterns[1];
    store.getState().setUi({ patternId: b.id, barIndex: 1 });
    expect(currentPattern(store.getState())).toBe(b);
    expect(currentBar(store.getState())).toBe(b.bars[1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/state/store.test.ts`
Expected: FAIL. Cannot find module `./store`.

- [ ] **Step 3: Implement `src/state/store.ts`**

```ts
import { createStore, useStore } from 'zustand';
import { createProject } from '../model/factory';
import type { PlayMode } from '../model/timeline';
import type { Bar, Pattern, Project } from '../model/types';

export type View = 'grid' | 'song' | 'notation';
export type EditMode = 'notes' | 'volume';

export interface UiState {
  patternId: string;
  barIndex: number;
  view: View;
  editMode: EditMode;
  playMode: PlayMode;
  loopBar: boolean;
  follow: boolean;
  playing: boolean;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export type Edit = (p: Project) => Project;

export interface AppState {
  project: Project;
  past: Project[];
  future: Project[];
  /** Project snapshot taken when the current gesture began; null when no gesture is active. */
  gestureBase: Project | null;
  ui: UiState;
  toasts: Toast[];
  apply(edit: Edit): void;
  beginGesture(): void;
  applyTransient(edit: Edit): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  loadProject(p: Project): void;
  setUi(patch: Partial<UiState>): void;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

export const HISTORY_LIMIT = 200;

export function initialUi(p: Project): UiState {
  return {
    patternId: p.patterns[0].id,
    barIndex: 0,
    view: 'grid',
    editMode: 'notes',
    playMode: 'pattern',
    loopBar: false,
    follow: true,
    playing: false,
  };
}

/** Repairs UI references after the project changed underneath them. Returns `ui` itself if already valid. */
function validUi(p: Project, ui: UiState): UiState {
  const pat = p.patterns.find((x) => x.id === ui.patternId) ?? p.patterns[0];
  const barIndex = Math.min(Math.max(0, ui.barIndex), pat.bars.length - 1);
  const playMode: PlayMode = ui.playMode === 'song' && p.song.length === 0 ? 'pattern' : ui.playMode;
  if (pat.id === ui.patternId && barIndex === ui.barIndex && playMode === ui.playMode) return ui;
  return { ...ui, patternId: pat.id, barIndex, playMode };
}

let toastSeq = 0;

export function createAppStore(initial: Project, now: () => number = Date.now) {
  return createStore<AppState>()((set, get) => {
    const commit = (next: Project, base: Project) => {
      const stamped: Project = { ...next, updatedAt: now() };
      set((s) => ({
        project: stamped,
        past: [...s.past, base].slice(-HISTORY_LIMIT),
        future: [],
        ui: validUi(stamped, s.ui),
      }));
    };

    return {
      project: initial,
      past: [],
      future: [],
      gestureBase: null,
      ui: initialUi(initial),
      toasts: [],

      apply(edit) {
        if (get().gestureBase) get().endGesture();
        const current = get().project;
        const next = edit(current);
        if (next !== current) commit(next, current);
      },

      beginGesture() {
        if (!get().gestureBase) set({ gestureBase: get().project });
      },

      applyTransient(edit) {
        get().beginGesture();
        const current = get().project;
        const next = edit(current);
        if (next !== current) set((s) => ({ project: next, ui: validUi(next, s.ui) }));
      },

      endGesture() {
        const { gestureBase: base, project } = get();
        if (!base) return;
        set({ gestureBase: null });
        if (project !== base) commit(project, base);
      },

      undo() {
        get().endGesture();
        const s = get();
        const prev = s.past[s.past.length - 1];
        if (!prev) return;
        set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], ui: validUi(prev, s.ui) });
      },

      redo() {
        get().endGesture();
        const s = get();
        const next = s.future[0];
        if (!next) return;
        set({ project: next, past: [...s.past, s.project], future: s.future.slice(1), ui: validUi(next, s.ui) });
      },

      loadProject(p) {
        set({ project: p, past: [], future: [], gestureBase: null, ui: initialUi(p) });
      },

      setUi(patch) {
        set((s) => ({ ui: validUi(s.project, { ...s.ui, ...patch }) }));
      },

      toast(message, kind = 'info') {
        const id = ++toastSeq;
        set((s) => ({ toasts: [...s.toasts, { id, message, kind }].slice(-3) }));
      },

      dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },
    };
  });
}

export type AppStore = ReturnType<typeof createAppStore>;

/** App-wide singleton. bootstrap() replaces the placeholder project on startup. */
export const appStore: AppStore = createAppStore(createProject());

/** Selectors must return stored references or primitives (never fresh objects). */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}

export function currentPattern(s: Pick<AppState, 'project' | 'ui'>): Pattern {
  return s.project.patterns.find((p) => p.id === s.ui.patternId) ?? s.project.patterns[0];
}

export function currentBar(s: Pick<AppState, 'project' | 'ui'>): Bar {
  const pat = currentPattern(s);
  return pat.bars[Math.min(s.ui.barIndex, pat.bars.length - 1)];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/state && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state
git commit -m "feat(state): zustand store with undo history, gesture coalescing and ui state"
```

---

### Task 9: Lookahead scheduler

**Files:**
- Create: `src/audio/scheduler.ts`
- Test: `src/audio/scheduler.test.ts`

**Interfaces:**
- Consumes: `buildTimeline`, `nextRef`, `notesAtTick`, `startRef`, `BarRef`, `TimelineOptions` (timeline); `TICKS_PER_BAR`, `TICKS_PER_BEAT`.
- Produces:
  - `interface PlayheadEvent { time: number; ref: BarRef; tick: number }`
  - `interface SchedulerDeps { now; getProject; getOptions; play(track, time, velocity); onPlayhead(e); lookahead?; intervalMs?; setInterval?; clearInterval? }`
  - `class Scheduler`, with `start()`, `stop()`, `pump()` and `running`
  - `START_DELAY = 0.06`
  - `STALL_LIMIT = 0.25`

- [ ] **Step 1: Write the failing test `src/audio/scheduler.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import * as ops from '../model/ops';
import type { TimelineOptions } from '../model/timeline';
import type { Project, TrackId } from '../model/types';
import { Scheduler, type PlayheadEvent } from './scheduler';

const TICK_120 = 0.5 / 12;

function harness(project: Project, options: Partial<TimelineOptions> = {}) {
  const state = {
    project,
    options: { mode: 'pattern', patternId: project.patterns[0].id, barIndex: 0, loopBar: false, ...options } as TimelineOptions,
  };
  let now = 0;
  const played: [TrackId, number, number][] = [];
  const heads: PlayheadEvent[] = [];
  const s = new Scheduler({
    now: () => now,
    getProject: () => state.project,
    getOptions: () => state.options,
    play: (track, time, velocity) => played.push([track, Number(time.toFixed(4)), velocity]),
    onPlayhead: (e) => heads.push(e),
    lookahead: 0.1,
    setInterval: () => 1,
    clearInterval: () => {},
  });
  /** Simulates the 25 ms timer up to `t`. */
  const runTo = (t: number) => {
    while (now < t) {
      now = Math.min(t, now + 0.025);
      s.pump();
    }
  };
  return { state, played, heads, s, runTo, setNow: (t: number) => (now = t) };
}

function beatProject(): Project {
  let p = ops.setBpm(createProject(), 120);
  const pid = p.patterns[0].id;
  p = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
  p = ops.setVelocity(p, pid, 0, 1, 'snare', 0, 90);
  return p;
}

describe('Scheduler', () => {
  it('schedules the first bar on time', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(1.0);
    expect(h.played).toEqual([['kick', 0.06, 100], ['snare', 0.56, 90]]);
  });

  it('applies swing to 16th off-beats', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'hhClosed', 1, 80);
    p = ops.setSwing(p, pid, 100);
    const h = harness(p);
    h.s.start();
    h.runTo(0.5);
    expect(h.played).toEqual([['hhClosed', Number((0.06 + 4.5 * TICK_120).toFixed(4)), 80]]);
  });

  it('loops a one-bar pattern', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(2.2);
    expect(h.played.filter(([t]) => t === 'kick').map(([, time]) => time)).toEqual([0.06, 2.06]);
  });

  it('starts from the edited bar in pattern mode', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    p = ops.addBar(p, pid);
    p = ops.setVelocity(p, pid, 1, 0, 'crash', 0, 100);
    const h = harness(p, { barIndex: 1 });
    h.s.start();
    h.runTo(4.2);
    expect(h.played).toEqual([['crash', 0.06, 100], ['crash', 4.06, 100]]);
  });

  it('follows the song order', () => {
    let p = ops.setBpm(createProject(), 120);
    const a = p.patterns[0].id;
    p = ops.addPattern(p, 'b');
    p = ops.setVelocity(p, a, 0, 0, 'kick', 0, 100);
    p = ops.setVelocity(p, 'b', 0, 0, 'snare', 0, 100);
    p = ops.appendSongStep(p, 'b');
    p = ops.appendSongStep(p, a);
    const h = harness(p, { mode: 'song' });
    h.s.start();
    h.runTo(4.2);
    expect(h.played.map(([t, time]) => [t, time])).toEqual([['snare', 0.06], ['kick', 2.06], ['snare', 4.06]]);
  });

  it('skips muted tracks', () => {
    const h = harness(ops.setTrackMuted(beatProject(), 'snare', true));
    h.s.start();
    h.runTo(1.0);
    expect(h.played.map(([t]) => t)).toEqual(['kick']);
  });

  it('picks up live edits', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(0.1);
    h.state.project = ops.setVelocity(h.state.project, h.state.project.patterns[0].id, 0, 2, 'tom1', 0, 70);
    h.runTo(1.2);
    expect(h.played.map(([t, time]) => [t, time])).toEqual([['kick', 0.06], ['snare', 0.56], ['tom1', 1.06]]);
  });

  it('applies tempo changes from the next tick', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    for (const beat of [0, 1, 2, 3]) p = ops.setVelocity(p, pid, 0, beat, 'kick', 0, 100);
    const h = harness(p);
    h.s.start();
    h.runTo(0.4);
    h.state.project = ops.setBpm(h.state.project, 60);
    h.runTo(3.0);
    const times = h.played.map(([, time]) => time);
    const t11 = 0.06 + 11 * TICK_120;
    expect(times.slice(0, 4)).toEqual([0.06, Number((t11 + 1 / 12).toFixed(4)), Number((t11 + 13 / 12).toFixed(4)), Number((t11 + 25 / 12).toFixed(4))]);
  });

  it('emits a playhead event per tick', () => {
    const h = harness(beatProject());
    h.s.start();
    h.runTo(1.0);
    expect(h.heads[0]).toEqual({ time: 0.06, ref: { patternId: h.state.project.patterns[0].id, barIndex: 0, stepIndex: -1 }, tick: 0 });
    expect(h.heads.map((e) => e.tick).slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('survives deleting the playing bar', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    p = ops.addBar(p, pid);
    p = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    p = ops.setVelocity(p, pid, 1, 0, 'crash', 0, 100);
    const h = harness(p, { barIndex: 1 });
    h.s.start();
    h.runTo(0.5);
    h.state.project = ops.deleteBar(h.state.project, pid, 1);
    expect(() => h.runTo(4.5)).not.toThrow();
    expect(h.played.map(([t, time]) => [t, time])).toEqual([['crash', 0.06], ['kick', 2.06], ['kick', 4.06]]);
  });

  it('resyncs after a stall instead of bursting', () => {
    let p = ops.setBpm(createProject(), 120);
    const pid = p.patterns[0].id;
    for (const beat of [0, 1, 2, 3]) p = ops.setVelocity(p, pid, 0, beat, 'kick', 0, 100);
    const h = harness(p);
    h.s.start();
    h.runTo(0.3);
    const before = h.played.length;
    h.setNow(10);
    h.s.pump();
    const burst = h.played.slice(before);
    expect(burst.every(([, time]) => time >= 10)).toBe(true);
    expect(burst.length).toBeLessThanOrEqual(1);
    expect(h.heads.at(-1)!.time).toBeGreaterThanOrEqual(10);
    expect(h.heads.filter((e) => e.time >= 0.4 && e.time < 10)).toEqual([]);
  });

  it('stops cleanly', () => {
    const h = harness(beatProject());
    h.s.start();
    expect(h.s.running).toBe(true);
    h.s.stop();
    expect(h.s.running).toBe(false);
    const n = h.played.length;
    h.runTo(3);
    expect(h.played.length).toBe(n);
  });

  it('plays nothing but keeps time for an empty project', () => {
    const h = harness(createProject());
    h.s.start();
    h.runTo(1);
    expect(h.played).toEqual([]);
    expect(h.heads.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/audio/scheduler.test.ts`
Expected: FAIL. Cannot find module `./scheduler`.

- [ ] **Step 3: Implement `src/audio/scheduler.ts`**

```ts
import { buildTimeline, nextRef, notesAtTick, startRef, type BarRef, type TimelineOptions } from '../model/timeline';
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../model/timing';
import type { Project, TrackId, Velocity } from '../model/types';

export interface PlayheadEvent {
  /** Audio-clock time at which this tick sounds. */
  time: number;
  ref: BarRef;
  tick: number;
}

export interface SchedulerDeps {
  now(): number;
  getProject(): Project;
  getOptions(): TimelineOptions;
  play(track: TrackId, time: number, velocity: Velocity): void;
  onPlayhead(e: PlayheadEvent): void;
  /** Seconds scheduled ahead of now. */
  lookahead?: number;
  intervalMs?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/** Delay between pressing play and the first note, so the first tick isn't late. */
export const START_DELAY = 0.06;
/** If the timer fell this far behind (background tab, sleep), skip ahead instead of bursting. */
export const STALL_LIMIT = 0.25;

/** Classic Web Audio lookahead scheduler ("A Tale of Two Clocks"). */
export class Scheduler {
  private handle: unknown = null;
  private ref: BarRef | null = null;
  private tick = 0;
  private nextTime = 0;

  constructor(private readonly deps: SchedulerDeps) {}

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.running) return;
    this.ref = startRef(this.deps.getProject(), this.deps.getOptions());
    this.tick = 0;
    this.nextTime = this.deps.now() + START_DELAY;
    const setI = this.deps.setInterval ?? ((fn: () => void, ms: number) => globalThis.setInterval(fn, ms));
    this.handle = setI(() => this.pump(), this.deps.intervalMs ?? 25);
    this.pump();
  }

  stop(): void {
    if (!this.running) return;
    const clearI = this.deps.clearInterval ?? ((h: unknown) => globalThis.clearInterval(h as number));
    clearI(this.handle);
    this.handle = null;
    this.ref = null;
  }

  pump(): void {
    if (!this.ref) return;
    const now = this.deps.now();
    if (this.nextTime < now - STALL_LIMIT) this.nextTime = now + 0.02;
    const horizon = now + (this.deps.lookahead ?? 0.12);
    while (this.ref && this.nextTime < horizon) {
      const p = this.deps.getProject();
      const secondsPerTick = 60 / p.bpm / TICKS_PER_BEAT;
      for (const n of notesAtTick(p, this.ref, this.tick)) {
        this.deps.play(n.track, this.nextTime + n.offset * secondsPerTick, n.velocity);
      }
      this.deps.onPlayhead({ time: this.nextTime, ref: this.ref, tick: this.tick });
      this.nextTime += secondsPerTick;
      this.tick += 1;
      if (this.tick >= TICKS_PER_BAR) {
        this.tick = 0;
        this.ref = nextRef(buildTimeline(p, this.deps.getOptions()), this.ref);
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/audio && pnpm typecheck`
Expected: all PASS. Check the tempo-change test's arithmetic if it fails. Ticks 0..10 are scheduled before 0.4 + lookahead 0.1 (tick 11 sits at 0.518 > 0.5). From tick 11 on, ticks are 1/12 s apart.

- [ ] **Step 5: Commit**

```bash
git add src/audio/scheduler.ts src/audio/scheduler.test.ts
git commit -m "feat(audio): lookahead scheduler with swing, live edits and stall resync"
```

---

### Task 10: Audio runtime: context, kits and transport

**Files:**
- Create: `src/audio/context.ts`, `src/audio/kits/types.ts`, `src/audio/kits/choke.ts`, `src/audio/kits/electronic.ts`, `src/audio/kits/sample.ts`, `src/audio/transport.ts`
- Create: `public/kits/acoustic/*.mp3`, `public/kits/acoustic/LICENSE-samples.md`, `scripts/samples/mix.sh`, `scripts/samples/render.sh`
- Test: `src/audio/kits/choke.test.ts`

**Interfaces:**
- Consumes: `appStore` (store); `Scheduler`, `PlayheadEvent`; `velocityToGain`; `TRACK_IDS`, `CHOKE_TARGETS`, `CHOKEABLE`.
- Produces:
  - `context.ts`: `getAudio(): { ctx: AudioContext; out: AudioNode }` and `unlockAudio(): Promise<AudioContext>`. `unlockAudio` must be called from a user gesture.
  - `kits/types.ts`: `interface Kit { readonly name: KitName; load(): Promise<void>; play(track, time, velocity): void }`
  - `kits/choke.ts`: `class Choker { register(track, gain: AudioParam, start, end); trigger(track, time) }`, `CHOKE_FADE = 0.015`
  - `kits/electronic.ts`: `createElectronicKit(ctx: BaseAudioContext, out: AudioNode): Kit`
  - `kits/sample.ts`: `ACOUSTIC_FILES: Record<TrackId, string>`, `createSampleKit(ctx, out, baseUrl, fetchFn = fetch): Kit`
  - `transport.ts`: `transport`, with these members:
    - `play()`, `stop()`, `toggle()`
    - `playing`
    - `playhead(): PlayheadEvent | null`
    - `audition(track, velocity)`
    - `preload(kit)`, `ensureKit(kit?)`

- [ ] **Step 1: Write the failing test `src/audio/kits/choke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CHOKE_FADE, Choker } from './choke';

class FakeParam {
  calls: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) { this.calls.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push(['ramp', v, t]); return this; }
}
const param = () => new FakeParam();
const asParam = (p: FakeParam) => p as unknown as AudioParam;

describe('Choker', () => {
  it('fades out a ringing open hi-hat when a closed hi-hat plays', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('hhClosed', 1);
    expect(p.calls).toEqual([['set', 1, 1], ['ramp', 0, 1 + CHOKE_FADE]]);
  });

  it('also chokes from the pedal hi-hat', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('hhPedal', 0.5);
    expect(p.calls).toHaveLength(2);
  });

  it('ignores voices that start later or have already ended', () => {
    const c = new Choker();
    const later = param();
    const ended = param();
    c.register('hhOpen', asParam(later), 2, 3);
    c.register('hhOpen', asParam(ended), 0, 0.5);
    c.trigger('hhClosed', 1);
    expect(later.calls).toEqual([]);
    expect(ended.calls).toEqual([]);
    c.trigger('hhClosed', 2.5);
    expect(later.calls).toHaveLength(2);
  });

  it('chokes each voice only once', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('hhClosed', 1);
    c.trigger('hhClosed', 1.5);
    expect(p.calls).toHaveLength(2);
  });

  it('ignores tracks that choke nothing', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('snare', 1);
    expect(p.calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/audio/kits/choke.test.ts`
Expected: FAIL. Cannot find module `./choke`.

- [ ] **Step 3: Implement `src/audio/kits/types.ts` and `src/audio/kits/choke.ts`**

`src/audio/kits/types.ts`:
```ts
import type { KitName, TrackId, Velocity } from '../../model/types';

export interface Kit {
  readonly name: KitName;
  /** Idempotent; resolves when every voice can play. */
  load(): Promise<void>;
  /** Schedules one hit at audio-clock `time`. Must be cheap and never throw. */
  play(track: TrackId, time: number, velocity: Velocity): void;
}
```

`src/audio/kits/choke.ts`:
```ts
import { CHOKE_TARGETS } from '../../model/tracks';
import type { TrackId } from '../../model/types';

export const CHOKE_FADE = 0.015;

interface ChokeVoice {
  gain: AudioParam;
  start: number;
  end: number;
}

/** Tracks ringing voices and fades them out when a choking track plays. */
export class Choker {
  private voices = new Map<TrackId, ChokeVoice[]>();

  /** `gain` must belong to a dedicated gain node (value 1) that nothing else automates. */
  register(track: TrackId, gain: AudioParam, start: number, end: number): void {
    const list = this.voices.get(track) ?? [];
    list.push({ gain, start, end });
    this.voices.set(track, list);
  }

  trigger(track: TrackId, time: number): void {
    for (const target of CHOKE_TARGETS[track] ?? []) {
      const list = this.voices.get(target);
      if (!list) continue;
      const keep: ChokeVoice[] = [];
      for (const v of list) {
        if (v.start < time && v.end > time) {
          v.gain.setValueAtTime(1, time);
          v.gain.linearRampToValueAtTime(0, time + CHOKE_FADE);
        } else if (v.end > time) {
          keep.push(v);
        }
      }
      this.voices.set(target, keep);
    }
  }
}
```

- [ ] **Step 4: Run the choke test to verify it passes**

Run: `pnpm test src/audio/kits/choke.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Implement `src/audio/context.ts`**

```ts
interface AudioGraph {
  ctx: AudioContext;
  /** Connect voices here. */
  out: AudioNode;
}

let graph: AudioGraph | null = null;
let silentAudio: HTMLAudioElement | null = null;

export function getAudio(): AudioGraph {
  if (!graph) {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(limiter).connect(ctx.destination);
    graph = { ctx, out: master };
  }
  return graph;
}

function silentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Makes Web Audio audible with the iOS ring/silent switch on:
 * iOS 17+: navigator.audioSession.type = 'playback'; older: a looping silent <audio> element.
 */
function enablePlaybackSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      // ignore
    }
    return;
  }
  if (silentAudio || navigator.maxTouchPoints === 0) return;
  silentAudio = document.createElement('audio');
  silentAudio.src = silentWavUrl();
  silentAudio.loop = true;
  silentAudio.setAttribute('playsinline', '');
  void silentAudio.play().catch(() => undefined);
}

/** Call from a user gesture (pointerup/click/keydown). */
export async function unlockAudio(): Promise<AudioContext> {
  enablePlaybackSession();
  const { ctx } = getAudio();
  if (ctx.state !== 'running') await ctx.resume();
  return ctx;
}
```

- [ ] **Step 6: Implement `src/audio/kits/electronic.ts`**

```ts
import { velocityToGain } from '../../model/timing';
import type { TrackId, Velocity } from '../../model/types';
import { Choker } from './choke';
import type { Kit } from './types';

/** 808/909-flavoured synthesized kit. No assets. */
export function createElectronicKit(ctx: BaseAudioContext, out: AudioNode): Kit {
  const choker = new Choker();
  let noise: AudioBuffer | null = null;

  function noiseBuffer(): AudioBuffer {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  function env(t: number, peak: number, decay: number, attack = 0.001): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer();
    s.start(t);
    s.stop(t + dur);
    return s;
  }

  function osc(type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  function filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Six detuned squares: the classic 808 metallic source. */
  function metal(t: number, dur: number): AudioNode {
    const sum = ctx.createGain();
    sum.gain.value = 0.3;
    for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) osc('square', 40 * ratio, t, dur).connect(sum);
    return sum;
  }

  function tom(freq: number, decay: number) {
    return (t: number, g: number) => {
      const o = osc('sine', freq * 1.6, t, decay + 0.1);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      o.connect(env(t, g * 0.9, decay)).connect(out);
    };
  }

  const voices: Record<TrackId, (t: number, g: number) => void> = {
    kick: (t, g) => {
      const o = osc('sine', 150, t, 0.6);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(env(t, g, 0.45)).connect(out);
      osc('triangle', 1200, t, 0.02).connect(env(t, g * 0.3, 0.012)).connect(out);
    },
    snare: (t, g) => {
      noiseSource(t, 0.3).connect(filter('highpass', 1200)).connect(env(t, g * 0.8, 0.18)).connect(out);
      const o = osc('triangle', 220, t, 0.2);
      o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
      o.connect(env(t, g * 0.6, 0.1)).connect(out);
    },
    crossStick: (t, g) => {
      osc('square', 1650, t, 0.05).connect(filter('bandpass', 1700, 4)).connect(env(t, g * 0.9, 0.035)).connect(out);
      noiseSource(t, 0.04).connect(filter('bandpass', 3000, 2)).connect(env(t, g * 0.4, 0.02)).connect(out);
    },
    hhClosed: (t, g) => {
      metal(t, 0.12).connect(filter('highpass', 7000)).connect(env(t, g * 0.7, 0.05)).connect(out);
    },
    hhPedal: (t, g) => {
      metal(t, 0.1).connect(filter('highpass', 6000)).connect(env(t, g * 0.5, 0.04)).connect(out);
    },
    hhOpen: (t, g) => {
      const choke = ctx.createGain();
      choke.connect(out);
      metal(t, 0.6).connect(filter('highpass', 7000)).connect(env(t, g * 0.6, 0.45)).connect(choke);
      choker.register('hhOpen', choke.gain, t, t + 0.6);
    },
    tom1: tom(200, 0.35),
    tom2: tom(150, 0.42),
    floorTom: tom(105, 0.5),
    crash: (t, g) => {
      noiseSource(t, 2).connect(filter('highpass', 4000)).connect(env(t, g * 0.5, 1.6, 0.002)).connect(out);
      metal(t, 2).connect(filter('highpass', 5000)).connect(env(t, g * 0.3, 1.4, 0.002)).connect(out);
    },
    ride: (t, g) => {
      metal(t, 1.4).connect(filter('bandpass', 8000, 1.5)).connect(env(t, g * 0.6, 1.1)).connect(out);
      osc('sine', 3200, t, 0.5).connect(env(t, g * 0.08, 0.4)).connect(out);
    },
  };

  return {
    name: 'electronic',
    async load() {
      noiseBuffer();
    },
    play(track, time, velocity: Velocity) {
      if (velocity <= 0) return;
      const t = Math.max(time, ctx.currentTime);
      choker.trigger(track, t);
      voices[track](t, velocityToGain(velocity));
    },
  };
}
```

- [ ] **Step 7: Implement `src/audio/kits/sample.ts`**

```ts
import { velocityToGain } from '../../model/timing';
import { CHOKEABLE, TRACK_IDS } from '../../model/tracks';
import type { TrackId } from '../../model/types';
import { Choker } from './choke';
import type { Kit } from './types';

export const ACOUSTIC_FILES: Record<TrackId, string> = {
  crash: 'crash.mp3',
  ride: 'ride.mp3',
  hhOpen: 'hihat-open.mp3',
  hhClosed: 'hihat-closed.mp3',
  hhPedal: 'hihat-pedal.mp3',
  snare: 'snare.mp3',
  crossStick: 'cross-stick.mp3',
  tom1: 'tom-1.mp3',
  tom2: 'tom-2.mp3',
  floorTom: 'floor-tom.mp3',
  kick: 'kick.mp3',
};

/** The two rack toms are close in pitch; nudge tom 1 up for clearer fills. */
const PLAYBACK_RATE: Partial<Record<TrackId, number>> = { tom1: 1.2 };

export function createSampleKit(ctx: BaseAudioContext, out: AudioNode, baseUrl: string, fetchFn: typeof fetch = fetch): Kit {
  const buffers = new Map<TrackId, AudioBuffer>();
  const choker = new Choker();
  let loading: Promise<void> | null = null;

  async function loadOne(track: TrackId): Promise<void> {
    const res = await fetchFn(baseUrl + ACOUSTIC_FILES[track]);
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${ACOUSTIC_FILES[track]}`);
    buffers.set(track, await ctx.decodeAudioData(await res.arrayBuffer()));
  }

  return {
    name: 'acoustic',
    load() {
      if (loading) return loading;
      const attempt = Promise.all(TRACK_IDS.map(loadOne)).then(() => undefined);
      attempt.catch(() => {
        loading = null; // allow a retry later
      });
      loading = attempt;
      return attempt;
    },
    play(track, time, velocity) {
      const buffer = buffers.get(track);
      if (!buffer || velocity <= 0) return;
      const t = Math.max(time, ctx.currentTime);
      choker.trigger(track, t);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = PLAYBACK_RATE[track] ?? 1;
      const gain = ctx.createGain();
      gain.gain.value = velocityToGain(velocity);
      src.connect(gain);
      if (CHOKEABLE.has(track)) {
        const choke = ctx.createGain();
        gain.connect(choke).connect(out);
        choker.register(track, choke.gain, t, t + buffer.duration / src.playbackRate.value);
      } else {
        gain.connect(out);
      }
      src.start(t);
    },
  };
}
```

- [ ] **Step 8: Implement `src/audio/transport.ts`**

```ts
import type { KitName, TrackId, Velocity } from '../model/types';
import { appStore } from '../state/store';
import { getAudio, unlockAudio } from './context';
import { createElectronicKit } from './kits/electronic';
import { createSampleKit } from './kits/sample';
import type { Kit } from './kits/types';
import { Scheduler, type PlayheadEvent } from './scheduler';

interface WakeLockHandle {
  release(): Promise<void>;
}

class Transport {
  private kits = new Map<KitName, Kit>();
  private acousticFailed = false;
  private scheduler: Scheduler | null = null;
  private queue: PlayheadEvent[] = [];
  private current: PlayheadEvent | null = null;
  private wakeLock: WakeLockHandle | null = null;

  get playing(): boolean {
    return this.scheduler !== null;
  }

  /** The kit actually used: acoustic falls back to electronic for the session if it failed to load. */
  private effectiveKit(): KitName {
    const k = appStore.getState().project.kit;
    return k === 'acoustic' && this.acousticFailed ? 'electronic' : k;
  }

  private kit(name: KitName): Kit {
    let kit = this.kits.get(name);
    if (!kit) {
      const { ctx, out } = getAudio();
      kit = name === 'acoustic'
        ? createSampleKit(ctx, out, `${import.meta.env.BASE_URL}kits/acoustic/`)
        : createElectronicKit(ctx, out);
      this.kits.set(name, kit);
    }
    return kit;
  }

  async ensureKit(name: KitName = this.effectiveKit()): Promise<Kit> {
    try {
      const kit = this.kit(name);
      await kit.load();
      return kit;
    } catch (e) {
      if (name !== 'acoustic') throw e;
      console.warn('Acoustic kit failed to load', e);
      if (!this.acousticFailed) {
        this.acousticFailed = true;
        appStore.getState().toast("Couldn't load acoustic kit — using electronic", 'error');
      }
      const fallback = this.kit('electronic');
      await fallback.load();
      return fallback;
    }
  }

  preload(name: KitName): void {
    void this.ensureKit(name).catch(() => undefined);
  }

  async play(): Promise<void> {
    if (this.scheduler) return;
    try {
      await unlockAudio();
    } catch {
      appStore.getState().toast('Audio could not start — tap Play again', 'error');
      return;
    }
    await this.ensureKit().catch(() => undefined);
    if (this.scheduler) return;
    const { ctx } = getAudio();
    this.queue = [];
    this.current = null;
    this.scheduler = new Scheduler({
      now: () => ctx.currentTime,
      getProject: () => appStore.getState().project,
      getOptions: () => {
        const { ui } = appStore.getState();
        return { mode: ui.playMode, patternId: ui.patternId, barIndex: ui.barIndex, loopBar: ui.loopBar };
      },
      play: (track, time, velocity) => this.kits.get(this.effectiveKit())?.play(track, time, velocity),
      onPlayhead: (e) => this.queue.push(e),
    });
    this.scheduler.start();
    appStore.getState().setUi({ playing: true });
    void this.acquireWakeLock();
  }

  stop(): void {
    if (!this.scheduler) return;
    this.scheduler.stop();
    this.scheduler = null;
    this.queue = [];
    this.current = null;
    appStore.getState().setUi({ playing: false });
    void this.releaseWakeLock();
  }

  toggle(): void {
    if (this.scheduler) this.stop();
    else void this.play();
  }

  /** The tick currently audible; call once per animation frame. */
  playhead(): PlayheadEvent | null {
    if (!this.scheduler) return null;
    const now = getAudio().ctx.currentTime;
    while (this.queue.length > 0 && this.queue[0].time <= now) this.current = this.queue.shift()!;
    return this.current;
  }

  async audition(track: TrackId, velocity: Velocity): Promise<void> {
    try {
      await unlockAudio();
      const kit = await this.ensureKit();
      kit.play(track, getAudio().ctx.currentTime, velocity);
    } catch {
      // auditioning is best effort
    }
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock?.release();
    } catch {
      // ignore
    }
  }
}

export const transport = new Transport();
```

- [ ] **Step 9: Add the samples and their license**

Run:
```bash
SCRATCH=/private/tmp/claude-501/-Users-vadim-work-drum-machine/3f582e3e-89c4-4092-9e9e-296437054f47/scratchpad
mkdir -p public/kits/acoustic scripts/samples
cp "$SCRATCH"/samples-out/*.mp3 "$SCRATCH"/samples-out/LICENSE-samples.md public/kits/acoustic/
cp "$SCRATCH"/scripts/mix.sh "$SCRATCH"/scripts/render.sh scripts/samples/
ls public/kits/acoustic | wc -l
```
Expected: `12`, which is 11 mp3 files plus the license. Read both shell scripts before committing, and make sure they contain only the ffmpeg pipeline.

- [ ] **Step 10: Run all tests, typecheck and build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all PASS, and `dist/kits/acoustic/kick.mp3` exists.

- [ ] **Step 11: Commit**

```bash
git add src/audio public/kits scripts/samples
git commit -m "feat(audio): web audio context, synthesized and sampled kits, transport"
```

---

### Task 11: Step grid with gestures, beat header and track labels

**Files:**
- Create: `src/ui/gestures.ts`, `src/ui/Popover.tsx`, `src/ui/Menu.tsx`, `src/ui/Popover.module.css`
- Create: `src/ui/VolumeBubble.tsx`, `src/ui/Cell.tsx`, `src/ui/TrackLabel.tsx`, `src/ui/BeatHeader.tsx`
- Create: `src/ui/useGridGestures.ts`, `src/ui/usePlayheadMarker.ts`, `src/ui/Grid.tsx`, `src/ui/Grid.module.css`
- Test: `src/ui/gestures.test.ts`, `src/ui/Grid.test.tsx`

**Interfaces:**
- Consumes: `appStore`, `useApp`, `currentBar` (store); `setVelocity`, `setBeatDiv`, `clearRow`, `setTrackMuted`, `setTrackHidden` (ops); `transport.audition`, `transport.playhead` (Task 10); `TRACKS`, `TRACK_BY_ID`; timing constants.
- Produces:
  - `gestures.ts`:
    - `DRAG_THRESHOLD = 8`, `SLIDE_RANGE_PX = 150`, `LONG_PRESS_MS = 450`
    - `classifyDrag(dx, dy): 'pending' | 'slide' | 'paint'`
    - `slideVelocity(start, dyUp)`, `volumeFromY(yFraction)`, `paintValue(startVelocity)`
  - Popover and menu:
    - `<Popover anchor onClose>`
    - `<Menu items onClose>`, with `MenuItem { label; onSelect; disabled?; danger?; checked? }`
  - `<VolumeBubble ref>`, whose handle is `BubbleHandle { show(rect, velocity); hide() }`
  - `usePlayheadMarker(containerRef, className, select: (ph, state) => string | null)`. The selector returns a CSS selector for the elements to mark.
  - `<Grid />`. It renders `data-testid="grid-rows"`, and every cell carries `data-track`, `data-beat`, `data-cell`, and `data-on` when a note is set.

- [ ] **Step 1: Write the failing gesture-math test `src/ui/gestures.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { classifyDrag, paintValue, slideVelocity, volumeFromY } from './gestures';

describe('gestures', () => {
  it('stays pending until the pointer moves 8px', () => {
    expect(classifyDrag(3, 4)).toBe('pending');
    expect(classifyDrag(0, -8)).toBe('slide');
    expect(classifyDrag(8, 2)).toBe('paint');
    expect(classifyDrag(6, -6)).toBe('paint');
  });

  it('slides from the note velocity, or from 100 on an empty cell', () => {
    expect(slideVelocity(60, 0)).toBe(60);
    expect(slideVelocity(0, 30)).toBe(125);
    expect(slideVelocity(60, -75)).toBe(1);
    expect(slideVelocity(100, 500)).toBe(127);
  });

  it('maps touch height to volume', () => {
    expect(volumeFromY(0)).toBe(127);
    expect(volumeFromY(1)).toBe(1);
    expect(volumeFromY(0.5)).toBe(64);
    expect(volumeFromY(-2)).toBe(127);
    expect(volumeFromY(3)).toBe(1);
  });

  it('paints notes from an empty cell and erases from a note', () => {
    expect(paintValue(0)).toBe(100);
    expect(paintValue(40)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement `src/ui/gestures.ts`**

Run: `pnpm test src/ui/gestures.test.ts`
Expected: FAIL. Cannot find module `./gestures`.

```ts
import { clamp, DEFAULT_VELOCITY } from '../model/timing';

export const DRAG_THRESHOLD = 8;
/** Vertical drag distance that sweeps the full velocity range. */
export const SLIDE_RANGE_PX = 150;
export const LONG_PRESS_MS = 450;

export type DragKind = 'pending' | 'slide' | 'paint';

export function classifyDrag(dx: number, dy: number): DragKind {
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return 'pending';
  return Math.abs(dy) > Math.abs(dx) ? 'slide' : 'paint';
}

/** `dyUp` is positive when the finger moved up. */
export function slideVelocity(start: number, dyUp: number): number {
  const base = start > 0 ? start : DEFAULT_VELOCITY;
  return clamp(Math.round(base + (dyUp * 127) / SLIDE_RANGE_PX), 1, 127);
}

/** `yFraction` 0 = top of the cell (loudest), 1 = bottom (softest). */
export function volumeFromY(yFraction: number): number {
  return 1 + Math.round((1 - clamp(yFraction, 0, 1)) * 126);
}

export function paintValue(startVelocity: number): number {
  return startVelocity > 0 ? 0 : DEFAULT_VELOCITY;
}
```

Run: `pnpm test src/ui/gestures.test.ts`
Expected: 4 PASS.

- [ ] **Step 3: Implement Popover, Menu, VolumeBubble and usePlayheadMarker**

`src/ui/Popover.module.css`:
```css
.backdrop { position: fixed; inset: 0; z-index: 50; }
.panel {
  position: fixed; background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  padding: 6px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); max-height: calc(100dvh - 16px); overflow-y: auto;
}
.menu { display: flex; flex-direction: column; gap: 2px; min-width: 170px; }
.menu button { background: transparent; text-align: left; min-height: 36px; border-radius: 8px; }
.menu button:active { background: var(--panel-2); }
.danger { color: var(--danger); }
.sep { border: 0; border-top: 1px solid var(--border); margin: 4px 0; }
.bubble {
  position: fixed; left: 0; top: 0; width: 48px; height: 92px; z-index: 60; pointer-events: none;
  display: none; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; padding: 6px 0;
  background: rgba(0, 0, 0, 0.85); border: 1px solid #555; border-radius: 10px;
}
.meter { width: 12px; height: 56px; background: #333; border-radius: 6px; position: relative; overflow: hidden; }
.meterFill { position: absolute; left: 0; right: 0; bottom: 0; background: var(--accent); }
.bubbleValue { font-size: 12px; font-weight: 700; color: #fff; }
```

`src/ui/Popover.tsx`:
```tsx
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export interface PopoverProps {
  anchor: DOMRect;
  onClose(): void;
  children: ReactNode;
}

/** Floating panel next to `anchor`; closes on outside tap or Escape. */
export function Popover({ anchor, onClose, children }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - w / 2, window.innerWidth - w - 8));
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} className={styles.panel} style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

`src/ui/Menu.tsx`:
```tsx
import styles from './Popover.module.css';

export interface MenuItem {
  label: string;
  onSelect(): void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
}

export function Menu({ items, onClose }: { items: (MenuItem | 'separator')[]; onClose(): void }) {
  return (
    <div className={styles.menu} role="menu">
      {items.map((item, i) =>
        item === 'separator' ? (
          <hr key={i} className={styles.sep} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={item.danger ? styles.danger : undefined}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.checked ? '✓ ' : ''}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
```

`src/ui/VolumeBubble.tsx`:
```tsx
import { useImperativeHandle, useRef, type Ref } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export interface BubbleHandle {
  show(rect: DOMRect, velocity: number): void;
  hide(): void;
}

/** Value readout shown above the finger while a volume gesture is active. Updated imperatively. */
export function VolumeBubble({ ref }: { ref: Ref<BubbleHandle> }) {
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useImperativeHandle(ref, () => ({
    show(rect, velocity) {
      const el = box.current;
      if (!el || !fill.current || !label.current) return;
      const w = 48;
      const h = 92;
      let top = rect.top - h - 10;
      if (top < 4) top = rect.bottom + 10;
      const left = Math.max(4, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 4));
      el.style.transform = `translate(${left}px, ${top}px)`;
      el.style.display = 'flex';
      fill.current.style.height = `${(velocity / 127) * 100}%`;
      label.current.textContent = String(velocity);
    },
    hide() {
      if (box.current) box.current.style.display = 'none';
    },
  }), []);

  return createPortal(
    <div ref={box} className={styles.bubble} data-testid="volume-bubble">
      <div className={styles.meter}>
        <div ref={fill} className={styles.meterFill} />
      </div>
      <span ref={label} className={styles.bubbleValue} />
    </div>,
    document.body,
  );
}
```

`src/ui/usePlayheadMarker.ts`:
```ts
import { useEffect, type RefObject } from 'react';
import { transport } from '../audio/transport';
import type { PlayheadEvent } from '../audio/scheduler';
import { appStore, type AppState } from '../state/store';

/**
 * Every animation frame, adds `className` to the elements inside `container` matched by the CSS selector
 * that `select` returns for the audible tick (or clears marks when it returns null). Bypasses React renders.
 */
export function usePlayheadMarker(
  container: RefObject<HTMLElement | null>,
  className: string,
  select: (ph: PlayheadEvent, s: AppState) => string | null,
): void {
  useEffect(() => {
    let raf = 0;
    let marked: Element[] = [];
    let markedSelector: string | null = null;
    const clear = () => {
      for (const el of marked) el.classList.remove(className);
      marked = [];
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const root = container.current;
      if (!root) return;
      const ph = transport.playhead();
      const selector = ph ? select(ph, appStore.getState()) : null;
      const intact = marked.every((el) => el.isConnected && el.classList.contains(className));
      if (selector === markedSelector && intact) return;
      clear();
      markedSelector = selector;
      if (!selector) return;
      marked = Array.from(root.querySelectorAll(selector));
      for (const el of marked) el.classList.add(className);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [container, className, select]);
}
```

- [ ] **Step 4: Write the failing Grid component test `src/ui/Grid.test.tsx`**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { audition: vi.fn(), playhead: () => null, toggle: vi.fn(), stop: vi.fn() },
}));

import { createProject } from '../model/factory';
import * as ops from '../model/ops';
import type { TrackId } from '../model/types';
import { appStore, currentBar } from '../state/store';
import { Grid } from './Grid';

const cellEl = (root: HTMLElement, track: TrackId, beat: number, cell: number) =>
  root.querySelector<HTMLElement>(`[data-track="${track}"][data-beat="${beat}"][data-cell="${cell}"]`)!;
const vel = (track: TrackId, beat: number, cell: number) => currentBar(appStore.getState()).beats[beat].cells[track][cell];
const down = (el: HTMLElement, x: number, y: number, pointerId = 1) => fireEvent.pointerDown(el, { pointerId, clientX: x, clientY: y, button: 0 });
const move = (el: HTMLElement, x: number, y: number, pointerId = 1) => fireEvent.pointerMove(el, { pointerId, clientX: x, clientY: y });
const up = (el: HTMLElement, x: number, y: number, pointerId = 1) => fireEvent.pointerUp(el, { pointerId, clientX: x, clientY: y });
const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, left: 0, right: 40, width: 40, height, x: 0, y: top, toJSON() {} }) as DOMRect;

beforeEach(() => {
  appStore.getState().loadProject(createProject());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Grid', () => {
  it('renders one cell per track and step', () => {
    const { container } = render(<Grid />);
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(11 * 16);
  });

  it('toggles a note with a tap', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'snare', 1, 0);
    down(c, 10, 10);
    up(c, 10, 10);
    expect(vel('snare', 1, 0)).toBe(100);
    expect(c.dataset.on).toBeDefined();
    down(c, 10, 10);
    up(c, 10, 10);
    expect(vel('snare', 1, 0)).toBe(0);
  });

  it('sets volume with a vertical slide as one undo step', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'kick', 0, 0);
    down(c, 10, 100);
    move(c, 10, 90);
    move(c, 10, 70);
    up(c, 10, 70);
    expect(vel('kick', 0, 0)).toBe(125);
    expect(appStore.getState().past).toHaveLength(1);
    appStore.getState().undo();
    expect(vel('kick', 0, 0)).toBe(0);
  });

  it('paints along a row with a horizontal drag, ignoring other rows', () => {
    const { container } = render(<Grid />);
    const targets: Record<number, HTMLElement> = {
      20: cellEl(container, 'kick', 0, 1),
      40: cellEl(container, 'kick', 0, 2),
      60: cellEl(container, 'snare', 0, 3),
    };
    document.elementFromPoint = vi.fn((x: number) => targets[x] ?? null);
    const start = cellEl(container, 'kick', 0, 0);
    down(start, 0, 10);
    move(start, 20, 10);
    move(start, 40, 10);
    move(start, 60, 10);
    up(start, 60, 10);
    expect([0, 1, 2, 3].map((i) => vel('kick', 0, i))).toEqual([100, 100, 100, 0]);
    expect(vel('snare', 0, 3)).toBe(0);
    expect(appStore.getState().past).toHaveLength(1);
  });

  it('erases along a row when the drag starts on a note', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => ops.setVelocity(ops.setVelocity(p, pid, 0, 0, 'ride', 0, 90), pid, 0, 0, 'ride', 1, 90));
    const { container } = render(<Grid />);
    document.elementFromPoint = vi.fn(() => cellEl(container, 'ride', 0, 1));
    const start = cellEl(container, 'ride', 0, 0);
    down(start, 0, 10);
    move(start, 20, 10);
    up(start, 20, 10);
    expect([vel('ride', 0, 0), vel('ride', 0, 1)]).toEqual([0, 0]);
  });

  it('ignores a second pointer while a gesture is active', () => {
    const { container } = render(<Grid />);
    const a = cellEl(container, 'tom1', 2, 0);
    const b = cellEl(container, 'tom2', 2, 1);
    down(a, 10, 100, 1);
    down(b, 50, 100, 2);
    up(b, 50, 100, 2);
    move(a, 10, 70, 1);
    up(a, 10, 70, 1);
    expect(vel('tom1', 2, 0)).toBe(125);
    expect(vel('tom2', 2, 1)).toBe(0);
    expect(appStore.getState().past).toHaveLength(1);
  });

  it('shapes existing notes by touch height in volume mode', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => ops.setVelocity(p, pid, 0, 3, 'hhClosed', 2, 100));
    appStore.getState().setUi({ editMode: 'volume' });
    const { container } = render(<Grid />);
    const c = cellEl(container, 'hhClosed', 3, 2);
    vi.spyOn(c, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    down(c, 5, 25);
    up(c, 5, 25);
    expect(vel('hhClosed', 3, 2)).toBe(96);
    const empty = cellEl(container, 'hhClosed', 3, 3);
    vi.spyOn(empty, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    down(empty, 5, 10);
    up(empty, 5, 10);
    expect(vel('hhClosed', 3, 3)).toBe(0);
  });

  it('hides hidden tracks', () => {
    appStore.getState().apply((p) => ops.setTrackHidden(p, 'tom2', true));
    const { container } = render(<Grid />);
    expect(container.querySelector('[data-track="tom2"]')).toBeNull();
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(10 * 16);
  });

  it('renders triplet beats with three cells', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => ops.setBeatDiv(p, pid, 0, 3, 3));
    const { container } = render(<Grid />);
    expect(container.querySelectorAll('[data-track="kick"][data-beat="3"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm test src/ui/Grid.test.tsx`
Expected: FAIL. Cannot find module `./Grid`.

- [ ] **Step 6: Implement the grid components**

`src/ui/Grid.module.css`:
```css
.grid { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.header { display: flex; gap: 4px; height: 22px; flex-shrink: 0; margin-bottom: 3px; }
.headerSpacer { width: var(--label-w); flex-shrink: 0; }
.beatButton {
  flex: 1; min-height: 22px; font-size: 11px; color: var(--text-dim); background: transparent;
  border-radius: 0; border-bottom: 2px solid var(--border);
}
.beatButton sup { color: var(--accent); margin-left: 2px; }
.rows {
  flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 3px;
  overflow-y: auto; overscroll-behavior: contain;
}
.row { display: flex; gap: 4px; flex: 1 0 28px; min-height: 28px; }
.mutedRow { opacity: 0.35; }
.label {
  width: var(--label-w); flex-shrink: 0; min-height: 0; padding: 0 6px; text-align: left;
  font-size: 11px; font-weight: 600; color: var(--text-dim); background: var(--panel);
  border-left: 3px solid; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; touch-action: pan-y;
}
.beat { flex: 1; min-width: 0; display: flex; gap: 2px; }
.cell {
  flex: 1; min-width: 0; position: relative; overflow: hidden; border-radius: 4px;
  background: var(--cell); touch-action: none; cursor: pointer;
}
.beatAlt .cell { background: var(--cell-alt); }
.fill { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 3px; pointer-events: none; }
.value {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #fff; text-shadow: 0 0 3px #000; pointer-events: none;
}
.grid[data-mode='volume'] .cell[data-on] { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35); }
.playing { outline: 2px solid var(--playhead); outline-offset: -2px; }
.empty { color: var(--text-dim); padding: 16px; text-align: center; }
```

`src/ui/Cell.tsx`:
```tsx
import { memo } from 'react';
import type { Beat, TrackId } from '../model/types';
import styles from './Grid.module.css';

interface CellProps {
  track: TrackId;
  beat: number;
  cell: number;
  velocity: number;
  color: string;
  showValue: boolean;
}

export const Cell = memo(function Cell({ track, beat, cell, velocity, color, showValue }: CellProps) {
  return (
    <div
      className={styles.cell}
      data-track={track}
      data-beat={beat}
      data-cell={cell}
      data-on={velocity > 0 ? '' : undefined}
      aria-label={`${track} beat ${beat + 1} step ${cell + 1}${velocity > 0 ? ` volume ${velocity}` : ''}`}
    >
      {velocity > 0 && <div className={styles.fill} style={{ height: `${(velocity / 127) * 100}%`, background: color }} />}
      {showValue && velocity > 0 && <span className={styles.value}>{velocity}</span>}
    </div>
  );
});

interface BeatGroupProps {
  track: TrackId;
  beatIndex: number;
  beat: Beat;
  color: string;
  showValues: boolean;
}

export const BeatGroup = memo(function BeatGroup({ track, beatIndex, beat, color, showValues }: BeatGroupProps) {
  return (
    <div className={`${styles.beat} ${beatIndex % 2 === 1 ? styles.beatAlt : ''}`}>
      {beat.cells[track].map((v, i) => (
        <Cell key={i} track={track} beat={beatIndex} cell={i} velocity={v} color={color} showValue={showValues} />
      ))}
    </div>
  );
});
```

`src/ui/TrackLabel.tsx`:
```tsx
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { transport } from '../audio/transport';
import { clearRow, setTrackHidden, setTrackMuted } from '../model/ops';
import { DEFAULT_VELOCITY } from '../model/timing';
import { TRACK_BY_ID } from '../model/tracks';
import type { TrackId } from '../model/types';
import { appStore, useApp } from '../state/store';
import { DRAG_THRESHOLD, LONG_PRESS_MS } from './gestures';
import styles from './Grid.module.css';
import { Menu } from './Menu';
import { Popover } from './Popover';

export function TrackLabel({ track }: { track: TrackId }) {
  const def = TRACK_BY_ID[track];
  const muted = useApp((s) => s.project.tracks[track].muted);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; timer: number; long: boolean } | null>(null);

  const openMenu = () => button.current && setMenu(button.current.getBoundingClientRect());
  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    const p = { x: e.clientX, y: e.clientY, long: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.long = true;
      openMenu();
    }, LONG_PRESS_MS);
    press.current = p;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) cancel();
  };

  const st = appStore.getState;
  return (
    <>
      <button
        ref={button}
        className={styles.label}
        style={{ borderLeftColor: def.color }}
        aria-label={`${def.label}${muted ? ' (muted)' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          cancel();
          openMenu();
        }}
        onClick={() => {
          if (press.current?.long) return;
          void transport.audition(track, DEFAULT_VELOCITY);
        }}
      >
        {def.label}
      </button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              { label: muted ? 'Unmute' : 'Mute', onSelect: () => st().apply((p) => setTrackMuted(p, track, !muted)) },
              { label: 'Hide track', onSelect: () => st().apply((p) => setTrackHidden(p, track, true)) },
              {
                label: 'Clear row in this bar',
                onSelect: () => {
                  const { ui } = st();
                  st().apply((p) => clearRow(p, ui.patternId, ui.barIndex, track));
                },
              },
            ]}
          />
        </Popover>
      )}
    </>
  );
}
```

`src/ui/BeatHeader.tsx`:
```tsx
import { useState } from 'react';
import { setBeatDiv } from '../model/ops';
import { SUBDIVISIONS } from '../model/timing';
import type { Subdivision } from '../model/types';
import { appStore, currentBar, useApp } from '../state/store';
import styles from './Grid.module.css';
import { Menu } from './Menu';
import { Popover } from './Popover';

const LABELS: Record<Subdivision, string> = { 4: '16ths', 3: '8th triplets', 6: '16th triplets' };
const MARK: Record<Subdivision, string> = { 4: '', 3: '3', 6: '6' };

export function BeatHeader() {
  const bar = useApp(currentBar);
  const [open, setOpen] = useState<{ beat: number; rect: DOMRect } | null>(null);
  const close = () => setOpen(null);
  return (
    <div className={styles.header}>
      <div className={styles.headerSpacer} />
      {bar.beats.map((b, i) => (
        <button
          key={i}
          className={styles.beatButton}
          aria-label={`Beat ${i + 1}: ${LABELS[b.div]}`}
          onClick={(e) => setOpen({ beat: i, rect: e.currentTarget.getBoundingClientRect() })}
        >
          {i + 1}
          {b.div !== 4 && <sup>{MARK[b.div]}</sup>}
        </button>
      ))}
      {open && (
        <Popover anchor={open.rect} onClose={close}>
          <Menu
            onClose={close}
            items={SUBDIVISIONS.map((d) => ({
              label: LABELS[d],
              checked: bar.beats[open.beat].div === d,
              onSelect: () => {
                const { ui } = appStore.getState();
                appStore.getState().apply((p) => setBeatDiv(p, ui.patternId, ui.barIndex, open.beat, d));
              },
            }))}
          />
        </Popover>
      )}
    </div>
  );
}
```

`src/ui/useGridGestures.ts`:
```ts
import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { transport } from '../audio/transport';
import { setVelocity } from '../model/ops';
import { DEFAULT_VELOCITY } from '../model/timing';
import type { Project, TrackId } from '../model/types';
import { appStore } from '../state/store';
import { classifyDrag, paintValue, slideVelocity, volumeFromY } from './gestures';
import type { BubbleHandle } from './VolumeBubble';

interface CellHit {
  el: HTMLElement;
  track: TrackId;
  beat: number;
  cell: number;
}

interface Active {
  pointerId: number;
  hit: CellHit;
  /** The bar being edited is captured at pointer-down so follow-mode bar switches can't redirect edits. */
  patternId: string;
  barIndex: number;
  startX: number;
  startY: number;
  startVelocity: number;
  kind: 'pending' | 'slide' | 'paint' | 'volume';
  value: number;
}

export function cellFromElement(el: Element | null | undefined): CellHit | null {
  const c = el?.closest?.<HTMLElement>('[data-cell]');
  if (!c || !c.dataset.track) return null;
  return { el: c, track: c.dataset.track as TrackId, beat: Number(c.dataset.beat), cell: Number(c.dataset.cell) };
}

export function useGridGestures(bubble: RefObject<BubbleHandle | null>) {
  const active = useRef<Active | null>(null);

  return useMemo(() => {
    const store = appStore;
    const velocityOf = (a: Pick<Active, 'patternId' | 'barIndex'>, h: CellHit) => {
      const pat = store.getState().project.patterns.find((p) => p.id === a.patternId);
      return pat?.bars[a.barIndex]?.beats[h.beat]?.cells[h.track]?.[h.cell] ?? 0;
    };
    const edit = (a: Active, h: CellHit, v: number) => (p: Project) =>
      setVelocity(p, a.patternId, a.barIndex, h.beat, h.track, h.cell, v);
    const hitAt = (x: number, y: number) => cellFromElement(document.elementFromPoint?.(x, y));
    const applyVolume = (a: Active, h: CellHit, clientY: number) => {
      if (velocityOf(a, h) <= 0) return;
      const r = h.el.getBoundingClientRect();
      const v = volumeFromY(r.height > 0 ? (clientY - r.top) / r.height : 0.5);
      a.value = v;
      store.getState().applyTransient(edit(a, h, v));
      bubble.current?.show(r, v);
    };

    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (active.current) return; // a second finger is ignored
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const hit = cellFromElement(e.target as Element);
        if (!hit) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const { ui } = store.getState();
        const a: Active = {
          pointerId: e.pointerId, hit, patternId: ui.patternId, barIndex: ui.barIndex,
          startX: e.clientX, startY: e.clientY, startVelocity: 0,
          kind: ui.editMode === 'volume' ? 'volume' : 'pending', value: 0,
        };
        a.startVelocity = velocityOf(a, hit);
        a.value = a.startVelocity;
        active.current = a;
        if (a.kind === 'volume') {
          store.getState().beginGesture();
          applyVolume(a, hit, e.clientY);
        }
      },

      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        if (a.kind === 'volume') {
          const h = hitAt(e.clientX, e.clientY);
          if (h && h.track === a.hit.track) applyVolume(a, h, e.clientY);
          return;
        }
        if (a.kind === 'pending') {
          const kind = classifyDrag(e.clientX - a.startX, e.clientY - a.startY);
          if (kind === 'pending') return;
          a.kind = kind;
          store.getState().beginGesture();
          if (kind === 'paint') {
            a.value = paintValue(a.startVelocity);
            store.getState().applyTransient(edit(a, a.hit, a.value));
          }
        }
        if (a.kind === 'slide') {
          const v = slideVelocity(a.startVelocity, a.startY - e.clientY);
          a.value = v;
          store.getState().applyTransient(edit(a, a.hit, v));
          bubble.current?.show(a.hit.el.getBoundingClientRect(), v);
        } else if (a.kind === 'paint') {
          const h = hitAt(e.clientX, e.clientY);
          if (h && h.track === a.hit.track) store.getState().applyTransient(edit(a, h, a.value));
        }
      },

      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        active.current = null;
        bubble.current?.hide();
        const s = store.getState();
        if (a.kind === 'pending') {
          const next = a.startVelocity > 0 ? 0 : DEFAULT_VELOCITY;
          s.apply(edit(a, a.hit, next));
          if (next > 0 && !s.ui.playing) void transport.audition(a.hit.track, next);
          return;
        }
        s.endGesture();
        if (a.kind === 'slide' && !s.ui.playing) void transport.audition(a.hit.track, a.value);
      },

      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        active.current = null;
        bubble.current?.hide();
        store.getState().endGesture();
      },
    };
  }, [bubble]);
}
```

`src/ui/Grid.tsx`:
```tsx
import { useCallback, useRef } from 'react';
import type { PlayheadEvent } from '../audio/scheduler';
import { cellContainingTick, TICKS_PER_BEAT } from '../model/timing';
import { TRACKS } from '../model/tracks';
import { currentBar, useApp, type AppState } from '../state/store';
import { BeatHeader } from './BeatHeader';
import { BeatGroup } from './Cell';
import styles from './Grid.module.css';
import { TrackLabel } from './TrackLabel';
import { useGridGestures } from './useGridGestures';
import { usePlayheadMarker } from './usePlayheadMarker';
import { VolumeBubble, type BubbleHandle } from './VolumeBubble';

export function Grid() {
  const bar = useApp(currentBar);
  const tracks = useApp((s) => s.project.tracks);
  const editMode = useApp((s) => s.ui.editMode);
  const bubble = useRef<BubbleHandle>(null);
  const rows = useRef<HTMLDivElement>(null);
  const handlers = useGridGestures(bubble);

  const selectPlaying = useCallback((ph: PlayheadEvent, s: AppState) => {
    if (ph.ref.patternId !== s.ui.patternId || ph.ref.barIndex !== s.ui.barIndex) return null;
    const beat = Math.floor(ph.tick / TICKS_PER_BEAT);
    const div = currentBar(s).beats[beat].div;
    return `[data-beat="${beat}"][data-cell="${cellContainingTick(div, ph.tick % TICKS_PER_BEAT)}"]`;
  }, []);
  usePlayheadMarker(rows, styles.playing, selectPlaying);

  const visible = TRACKS.filter((t) => !tracks[t.id].hidden);
  return (
    <div className={styles.grid} data-mode={editMode}>
      <BeatHeader />
      <div ref={rows} className={styles.rows} data-testid="grid-rows" {...handlers}>
        {visible.map((t) => (
          <div key={t.id} className={`${styles.row} ${tracks[t.id].muted ? styles.mutedRow : ''}`}>
            <TrackLabel track={t.id} />
            {bar.beats.map((beat, i) => (
              <BeatGroup key={i} track={t.id} beatIndex={i} beat={beat} color={t.color} showValues={editMode === 'volume'} />
            ))}
          </div>
        ))}
        {visible.length === 0 && <p className={styles.empty}>All tracks are hidden. Use ⋯ → Tracks to show some.</p>}
      </div>
      <VolumeBubble ref={bubble} />
    </div>
  );
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS. If jsdom is missing `PointerEvent`, Testing Library falls back to a generic `Event`, and `clientX`/`pointerId` would then be undefined. In that case add `src/test/pointer-polyfill.ts`, which defines `class PointerEvent extends MouseEvent { pointerId; pointerType; constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'mouse'; } }` on `window`. Import it at the top of `Grid.test.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/ui
git commit -m "feat(ui): step grid with tap/slide/paint/volume gestures, beat subdivisions and track menus"
```

---

### Task 12: App shell, persistence bootstrap and actions

**Files:**
- Create: `src/state/persistence.ts`, `src/state/actions.ts`
- Create: `src/ui/modal.tsx`, `src/ui/Modal.module.css`, `src/ui/Toasts.tsx`, `src/ui/Toasts.module.css`
- Create: `src/ui/RotateOverlay.tsx`, `src/ui/RotateOverlay.module.css`
- Create: `src/ui/usePlaybackFollow.ts`, `src/ui/useKeyboardShortcuts.ts`
- Create: `src/App.tsx`, `src/App.module.css`
- Modify: `src/main.tsx` (replace the placeholder entirely)
- Test: `src/state/actions.test.ts`

**Interfaces:**
- Consumes: `ProjectStorage`, `browserStore`, `createAutosaver` (Task 5); `decodeShare`, `payloadFromHash`, `compressionSupported` (Task 6); `transport` (Task 10); `appStore` (Task 8); `Grid` (Task 11).
- Produces:
  - `persistence.ts`:
    - `storage`
    - `safeSave(p)`, `flushAutosave()`
    - `importSharedProject(hash): Promise<void>`
    - `bootstrap(): Promise<void>`
  - `actions.ts`:
    - Bars: `copyBar()`, `pasteBar()`, `pasteBarAsNew()`, `addBarAtEnd()`, `duplicateCurrentBar()`, `clearCurrentBar()`, `deleteCurrentBar()`, `moveBar(from, to)`, `selectBar(index)`
    - Patterns: `selectPattern(id)`, `addPattern()`, `duplicatePattern()`, `renamePattern(id, name)`, `deletePattern(id)`
    - Projects: `switchToProject(p)`, `openProject(id)`, `newProject()`, `duplicateProject(id)`, `renameProject(id, name)`, `deleteProject(id)`
  - `modal.tsx`:
    - `<ModalHost/>`
    - `showModal(node)`, `closeModal()`
    - `<Sheet title onClose>`
    - `promptText({ title, initial?, maxLength?, confirmLabel?, readOnly? }): Promise<string | null>`
    - `confirmAction({ title, message?, confirmLabel? }): Promise<boolean>`
  - Components: `<Toasts/>`, `<RotateOverlay/>`, `<App/>`
  - Hooks: `usePlaybackFollow()`, `useKeyboardShortcuts()`

- [ ] **Step 1: Write the failing test `src/state/actions.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoProject } from '../model/factory';
import * as actions from './actions';
import { storage } from './persistence';
import { appStore, currentBar, currentPattern } from './store';

beforeEach(() => {
  appStore.getState().loadProject(createDemoProject());
});

const s = () => appStore.getState();

describe('bar actions', () => {
  it('copies and pastes a bar into the current bar', () => {
    s().setUi({ barIndex: 0 });
    actions.copyBar();
    const copied = currentBar(s()).beats;
    s().setUi({ barIndex: 1 });
    actions.pasteBar();
    expect(currentBar(s()).beats).toEqual(copied);
    expect(storage.loadClipboard()?.beats).toEqual(copied);
  });

  it('pastes as a new bar after the current one and selects it', () => {
    actions.copyBar();
    actions.pasteBarAsNew();
    expect(currentPattern(s()).bars).toHaveLength(3);
    expect(s().ui.barIndex).toBe(1);
  });

  it('adds, duplicates, clears and deletes bars, keeping the selection sensible', () => {
    actions.addBarAtEnd();
    expect(s().ui.barIndex).toBe(2);
    expect(currentPattern(s()).bars).toHaveLength(3);
    s().setUi({ barIndex: 0 });
    actions.duplicateCurrentBar();
    expect(s().ui.barIndex).toBe(1);
    actions.clearCurrentBar();
    expect(currentBar(s()).beats.every((b) => Object.values(b.cells).every((c) => c.every((v) => v === 0)))).toBe(true);
    actions.deleteCurrentBar();
    expect(currentPattern(s()).bars).toHaveLength(3);
  });

  it('moves a bar and keeps it selected', () => {
    const id = currentPattern(s()).bars[0].id;
    actions.moveBar(0, 1);
    expect(currentPattern(s()).bars[1].id).toBe(id);
    expect(s().ui.barIndex).toBe(1);
  });

  it('turns off follow when selecting a bar during playback', () => {
    s().setUi({ playing: true, follow: true });
    actions.selectBar(1);
    expect(s().ui).toMatchObject({ barIndex: 1, follow: false });
  });
});

describe('pattern actions', () => {
  it('adds and duplicates patterns and selects the new one', () => {
    actions.addPattern();
    expect(currentPattern(s()).name).toBe('C');
    actions.duplicatePattern();
    expect(currentPattern(s()).name).toBe('D');
    expect(s().project.patterns.map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('renames and deletes patterns', () => {
    const b = s().project.patterns[1];
    actions.renamePattern(b.id, 'Fill');
    expect(s().project.patterns[1].name).toBe('Fill');
    actions.deletePattern(b.id);
    expect(s().project.patterns).toHaveLength(1);
    expect(s().project.song.every((x) => x.patternId !== b.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/state/actions.test.ts`
Expected: FAIL. Cannot find module `./actions`.

- [ ] **Step 3: Implement `src/state/persistence.ts`**

```ts
import { transport } from '../audio/transport';
import { compressionSupported, decodeShare, payloadFromHash } from '../io/share';
import { browserStore, createAutosaver, ProjectStorage } from '../io/storage';
import { createDemoProject } from '../model/factory';
import type { Project } from '../model/types';
import { appStore } from './store';

export const storage = new ProjectStorage(browserStore());

const SAVE_FAILED = "Can't save on this device — changes are kept until you close the page";
let warnedSaveFailure = false;

export function safeSave(p: Project): void {
  try {
    storage.saveProject(p);
  } catch {
    if (!warnedSaveFailure) {
      warnedSaveFailure = true;
      appStore.getState().toast(SAVE_FAILED, 'error');
    }
  }
}

const autosaver = createAutosaver(safeSave, 500);

export function flushAutosave(): void {
  autosaver.flush();
}

/** Imports `#p=…` as a new project and opens it. Clears the hash either way. */
export async function importSharedProject(hash: string): Promise<void> {
  const payload = payloadFromHash(hash);
  if (!payload) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (!compressionSupported()) {
    appStore.getState().toast('This browser is too old to open shared links', 'error');
    return;
  }
  try {
    const p = await decodeShare(payload);
    transport.stop();
    flushAutosave();
    safeSave(p);
    appStore.getState().loadProject(p);
    storage.setLastProjectId(p.id);
    appStore.getState().toast(`Opened shared beat “${p.name}”`);
  } catch {
    appStore.getState().toast('This link is invalid or damaged', 'error');
  }
}

let started = false;

/** Loads the initial project and wires autosave, kit preloading, lifecycle and share links. */
export async function bootstrap(): Promise<void> {
  if (started) return;
  started = true;

  if (!storage.available) {
    warnedSaveFailure = true;
    appStore.getState().toast(SAVE_FAILED, 'error');
  }

  if (storage.countCorrupt() > 0) {
    appStore.getState().toast('Some saved projects were damaged and are hidden', 'error');
  }

  let project = storage.loadMostRecent();
  if (!project) {
    project = createDemoProject();
    safeSave(project);
  }
  appStore.getState().loadProject(project);
  storage.setLastProjectId(project.id);

  appStore.subscribe((st, prev) => {
    if (st.project !== prev.project) {
      autosaver.schedule(st.project);
      if (st.project.id !== prev.project.id) storage.setLastProjectId(st.project.id);
    }
    if (st.project.kit !== prev.project.kit) transport.preload(st.project.kit);
  });

  window.addEventListener('pagehide', flushAutosave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushAutosave();
      transport.stop();
    }
  });
  window.addEventListener('hashchange', () => void importSharedProject(location.hash));

  transport.preload(project.kit);
  await importSharedProject(location.hash);
}
```

- [ ] **Step 4: Implement `src/state/actions.ts`**

```ts
import { transport } from '../audio/transport';
import { cloneBar, createProject, newId } from '../model/factory';
import * as ops from '../model/ops';
import type { Project } from '../model/types';
import { flushAutosave, safeSave, storage } from './persistence';
import { appStore, currentBar, currentPattern } from './store';

const s = () => appStore.getState();

// ---- bars ----

export function selectBar(index: number): void {
  const { ui } = s();
  s().setUi({ barIndex: index, follow: ui.playing ? false : ui.follow });
}

export function copyBar(): void {
  storage.saveClipboard(currentBar(s()));
  s().toast('Bar copied');
}

export function pasteBar(): void {
  const bar = storage.loadClipboard();
  if (!bar) return s().toast('Nothing to paste — copy a bar first');
  const { ui } = s();
  s().apply((p) => ops.replaceBarContents(p, ui.patternId, ui.barIndex, bar));
}

export function pasteBarAsNew(): void {
  const bar = storage.loadClipboard();
  if (!bar) return s().toast('Nothing to paste — copy a bar first');
  const { ui } = s();
  s().apply((p) => ops.insertBarAfter(p, ui.patternId, ui.barIndex, cloneBar(bar)));
  s().setUi({ barIndex: ui.barIndex + 1 });
}

export function addBarAtEnd(): void {
  const { ui } = s();
  s().apply((p) => ops.addBar(p, ui.patternId));
  s().setUi({ barIndex: currentPattern(s()).bars.length - 1 });
}

export function duplicateCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.duplicateBar(p, ui.patternId, ui.barIndex));
  s().setUi({ barIndex: ui.barIndex + 1 });
}

export function clearCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.clearBar(p, ui.patternId, ui.barIndex));
}

export function deleteCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.deleteBar(p, ui.patternId, ui.barIndex));
}

export function moveBar(from: number, to: number): void {
  const { ui } = s();
  s().apply((p) => ops.moveBar(p, ui.patternId, from, to));
  s().setUi({ barIndex: to });
}

// ---- patterns ----

export function selectPattern(id: string): void {
  const { ui } = s();
  s().setUi({ patternId: id, barIndex: 0, follow: ui.playing ? false : ui.follow });
}

export function addPattern(): void {
  const id = newId();
  s().apply((p) => ops.addPattern(p, id));
  s().setUi({ patternId: id, barIndex: 0 });
}

export function duplicatePattern(): void {
  const id = newId();
  const { ui } = s();
  s().apply((p) => ops.duplicatePattern(p, ui.patternId, id));
  s().setUi({ patternId: id, barIndex: 0 });
}

export function renamePattern(id: string, name: string): void {
  s().apply((p) => ops.renamePattern(p, id, name));
}

export function deletePattern(id: string): void {
  s().apply((p) => ops.deletePattern(p, id));
}

// ---- projects ----

export function switchToProject(p: Project): void {
  transport.stop();
  flushAutosave();
  s().loadProject(p);
  storage.setLastProjectId(p.id);
}

export function openProject(id: string): void {
  if (id === s().project.id) return;
  const p = storage.loadProject(id);
  if (!p) return s().toast("This project is damaged and can't be opened", 'error');
  switchToProject(p);
}

export function newProject(): void {
  const p = createProject();
  safeSave(p);
  switchToProject(p);
}

export function duplicateProject(id: string): void {
  flushAutosave();
  const src = id === s().project.id ? s().project : storage.loadProject(id);
  if (!src) return;
  const now = Date.now();
  const copy: Project = { ...structuredClone(src), id: newId(), name: `${src.name} copy`.slice(0, 60), createdAt: now, updatedAt: now };
  safeSave(copy);
  s().toast(`Created “${copy.name}”`);
}

export function renameProject(id: string, name: string): void {
  if (id === s().project.id) {
    s().apply((p) => ops.setProjectName(p, name));
    return;
  }
  const p = storage.loadProject(id);
  if (!p) return;
  const renamed = ops.setProjectName(p, name);
  if (renamed !== p) safeSave({ ...renamed, updatedAt: Date.now() });
}

export function deleteProject(id: string): void {
  storage.deleteProject(id);
  if (id !== s().project.id) return;
  const next = storage.loadMostRecent();
  if (next) switchToProject(next);
  else newProject();
}
```

- [ ] **Step 5: Run the action tests**

Run: `pnpm test src/state && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 6: Implement modal, toasts, rotate overlay and hooks**

`src/ui/Modal.module.css`:
```css
.backdrop {
  position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 12px;
}
.dialog, .sheet {
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6); max-height: calc(100dvh - 24px);
}
.dialog { width: min(420px, 100%); padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.dialog h2, .sheet h2 { font-size: 15px; font-weight: 600; }
.dialog p { color: var(--text-dim); }
.dialog input {
  width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); user-select: text; -webkit-user-select: text;
}
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.primary { background: var(--accent); color: #fff; }
.dangerButton { background: var(--danger); color: #fff; }
.sheet { width: min(560px, 100%); display: flex; flex-direction: column; overflow: hidden; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.body { overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
```

`src/ui/modal.tsx`:
```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createStore, useStore } from 'zustand';
import styles from './Modal.module.css';

const modalStore = createStore<{ node: ReactNode | null }>()(() => ({ node: null }));

export function showModal(node: ReactNode): void {
  modalStore.setState({ node });
}

export function closeModal(): void {
  modalStore.setState({ node: null });
}

export function ModalHost() {
  const node = useStore(modalStore, (s) => s.node);
  if (!node) return null;
  return createPortal(<div className={styles.backdrop}>{node}</div>, document.body);
}

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  return (
    <div className={styles.sheet} role="dialog" aria-label={title}>
      <header className={styles.header}>
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

interface PromptOptions {
  title: string;
  initial?: string;
  maxLength?: number;
  confirmLabel?: string;
  /** Shows a selectable read-only value with a single Close button. */
  readOnly?: boolean;
}

function PromptDialog({ title, initial = '', maxLength = 60, confirmLabel = 'OK', readOnly = false, onDone }: PromptOptions & { onDone(v: string | null): void }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      className={styles.dialog}
      role="dialog"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
    >
      <h2>{title}</h2>
      <input ref={input} value={value} maxLength={maxLength} readOnly={readOnly} onChange={(e) => setValue(e.target.value)} />
      <div className={styles.actions}>
        <button type="button" onClick={() => onDone(null)}>{readOnly ? 'Close' : 'Cancel'}</button>
        {!readOnly && <button type="submit" className={styles.primary}>{confirmLabel}</button>}
      </div>
    </form>
  );
}

export function promptText(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    showModal(
      <PromptDialog
        {...options}
        onDone={(v) => {
          closeModal();
          resolve(v);
        }}
      />,
    );
  });
}

export function confirmAction({ title, message, confirmLabel = 'Delete' }: { title: string; message?: string; confirmLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      closeModal();
      resolve(v);
    };
    showModal(
      <div className={styles.dialog} role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        <div className={styles.actions}>
          <button onClick={() => done(false)}>Cancel</button>
          <button className={styles.dangerButton} onClick={() => done(true)}>{confirmLabel}</button>
        </div>
      </div>,
    );
  });
}
```

`src/ui/Toasts.module.css`:
```css
.toasts {
  position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 44px); transform: translateX(-50%);
  z-index: 80; display: flex; flex-direction: column; gap: 6px; align-items: center; pointer-events: none;
}
.toast {
  pointer-events: auto; background: #2f2f3a; color: var(--text); border-radius: 10px; padding: 8px 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); max-width: 80vw; white-space: normal; text-align: center;
}
.error { background: #4a1f26; color: #ffd7dc; }
```

`src/ui/Toasts.tsx`:
```tsx
import { useEffect } from 'react';
import { appStore, useApp, type Toast } from '../state/store';
import styles from './Toasts.module.css';

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const h = setTimeout(() => appStore.getState().dismissToast(toast.id), toast.kind === 'error' ? 5000 : 2500);
    return () => clearTimeout(h);
  }, [toast]);
  return (
    <button className={`${styles.toast} ${toast.kind === 'error' ? styles.error : ''}`} onClick={() => appStore.getState().dismissToast(toast.id)}>
      {toast.message}
    </button>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
```

`src/ui/RotateOverlay.module.css`:
```css
.overlay {
  display: none; position: fixed; inset: 0; z-index: 100; background: var(--bg);
  flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; padding: 24px;
}
@media (orientation: portrait) and (max-width: 600px) {
  .overlay { display: flex; }
}
.phone { font-size: 52px; animation: turn 2.4s ease-in-out infinite; }
.title { font-size: 18px; font-weight: 600; }
.hint { color: var(--text-dim); }
@keyframes turn {
  0%, 35% { transform: rotate(0deg); }
  65%, 100% { transform: rotate(-90deg); }
}
```

`src/ui/RotateOverlay.tsx`:
```tsx
import styles from './RotateOverlay.module.css';

export function RotateOverlay() {
  return (
    <div className={styles.overlay} data-testid="rotate-overlay">
      <div className={styles.phone} aria-hidden>📱</div>
      <p className={styles.title}>Rotate your phone</p>
      <p className={styles.hint}>The drum machine works in landscape.</p>
    </div>
  );
}
```

`src/ui/usePlaybackFollow.ts`:
```ts
import { useEffect } from 'react';
import { transport } from '../audio/transport';
import { appStore } from '../state/store';

/** While playing with Follow on, keeps the editor on the audible pattern and bar. */
export function usePlaybackFollow(): void {
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ph = transport.playhead();
      if (!ph) return;
      const s = appStore.getState();
      if (!s.ui.playing || !s.ui.follow || s.gestureBase) return;
      if (ph.ref.patternId !== s.ui.patternId || ph.ref.barIndex !== s.ui.barIndex) {
        s.setUi({ patternId: ph.ref.patternId, barIndex: ph.ref.barIndex });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
```

`src/ui/useKeyboardShortcuts.ts`:
```ts
import { useEffect } from 'react';
import { transport } from '../audio/transport';
import { appStore } from '../state/store';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space' && !mod) {
        e.preventDefault();
        transport.toggle();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) appStore.getState().redo();
        else appStore.getState().undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        appStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

- [ ] **Step 7: Implement `src/App.tsx`, `src/App.module.css`, and replace `src/main.tsx`**

`src/App.module.css`:
```css
.app {
  height: 100dvh; display: flex; flex-direction: column; gap: 4px;
  padding: max(env(safe-area-inset-top), 4px) max(env(safe-area-inset-right), 8px)
    max(env(safe-area-inset-bottom), 4px) max(env(safe-area-inset-left), 8px);
}
.main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
```

`src/App.tsx`:
```tsx
import styles from './App.module.css';
import { useApp } from './state/store';
import { Grid } from './ui/Grid';
import { ModalHost } from './ui/modal';
import { RotateOverlay } from './ui/RotateOverlay';
import { Toasts } from './ui/Toasts';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';
import { usePlaybackFollow } from './ui/usePlaybackFollow';

export function App() {
  const view = useApp((s) => s.ui.view);
  useKeyboardShortcuts();
  usePlaybackFollow();
  return (
    <div className={styles.app}>
      <main className={styles.main}>{view === 'grid' && <Grid />}</main>
      <Toasts />
      <ModalHost />
      <RotateOverlay />
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootstrap } from './state/persistence';
import './styles/global.css';

void bootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Verify in the browser**

Run: `pnpm test && pnpm typecheck && pnpm build`, then `pnpm dev`.
In a browser with an 844×390 viewport, check:
- The demo groove's grid fills the screen.
- Tapping a cell toggles it and plays its sound.
- Dragging vertically shows the bubble.
- Space starts and stops playback, and the playhead outline moves.
- A reload keeps the edits.

Expected: all of the above. There's no top bar yet; that comes in Task 13.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat: app shell with persistence bootstrap, actions, dialogs, toasts and rotate overlay"
```

---

### Task 13: Top bar, tempo, pattern menu, bar strip, swing and tracks sheets

**Files:**
- Create: `src/ui/tapTempo.ts`, `src/ui/Segmented.tsx`, `src/ui/TopBar.tsx`, `src/ui/TopBar.module.css`
- Create: `src/ui/BpmPopover.tsx`, `src/ui/PatternMenu.tsx`, `src/ui/LongPressButton.tsx`
- Create: `src/ui/useReorder.ts`, `src/ui/BarStrip.tsx`, `src/ui/BarStrip.module.css`
- Create: `src/ui/SwingSheet.tsx`, `src/ui/TracksSheet.tsx`, `src/ui/Sheet.module.css`, `src/ui/moreMenu.ts`
- Modify: `src/App.tsx`, which renders `<TopBar/>` above `<main>` and `<BarStrip/>` below it in grid view
- Test: `src/ui/tapTempo.test.ts`, `src/ui/TopBar.test.tsx`, `src/ui/BarStrip.test.tsx`

**Interfaces:**
- Consumes:
  - `actions.*` (Task 12)
  - `promptText`, `confirmAction`, `showModal`, `closeModal`, `Sheet` (Task 12)
  - `Popover`, `Menu`, `usePlayheadMarker`, `LONG_PRESS_MS`, `DRAG_THRESHOLD` (Task 11)
  - `transport.toggle` (Task 10)
  - ops `setBpm`, `setKit`, `setSwing`, `setTrackHidden`, `setTrackMuted`, `MIN_BPM`, `MAX_BPM`
- Produces:
  - `tapTempo.ts`: `registerTap(taps, now): number[]`, `tempoFromTaps(taps): number | null`, `TAP_RESET_MS = 2000`
  - `<Segmented label value options onChange/>`
  - `<TopBar/>`, with these accessible button names:
    - `Play`/`Stop`, `Tempo`, `Kit`, `Pattern`, `Undo`, `Redo`, `More`
    - radio groups `Play mode` and `Edit mode`
  - `<BarStrip/>`. The bar chips are `data-index` buttons named `Bar N`. The other buttons are `Add bar`, `Loop bar`, `Follow`, `Copy`, `Paste`, `Duplicate`, `Clear`, `Delete`.
  - `useReorder({ scroller, onTap, onMove }) → { dragIndex, itemProps(index) }`
  - `openSwingSheet()`, `openTracksSheet()`
  - `moreMenuItems(view: View): (MenuItem | 'separator')[]`

- [ ] **Step 1: Write the failing test `src/ui/tapTempo.test.ts`, then implement `src/ui/tapTempo.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { registerTap, tempoFromTaps } from './tapTempo';

describe('tap tempo', () => {
  it('needs two taps', () => {
    expect(tempoFromTaps(registerTap([], 0))).toBeNull();
  });

  it('averages the last four taps', () => {
    let taps: number[] = [];
    for (const t of [0, 500, 1000, 1500, 2000]) taps = registerTap(taps, t);
    expect(taps).toEqual([500, 1000, 1500, 2000]);
    expect(tempoFromTaps(taps)).toBe(120);
  });

  it('starts over after a 2 s pause', () => {
    let taps = registerTap(registerTap([], 0), 600);
    taps = registerTap(taps, 3000);
    expect(taps).toEqual([3000]);
  });

  it('clamps to the BPM range', () => {
    expect(tempoFromTaps([0, 100])).toBe(240);
    expect(tempoFromTaps([0, 1900])).toBe(40);
  });
});
```

Run: `pnpm test src/ui/tapTempo.test.ts`. Expected: FAIL with the module not found.

```ts
import { MAX_BPM, MIN_BPM } from '../model/ops';
import { clamp } from '../model/timing';

export const TAP_RESET_MS = 2000;

/** Keeps the last 4 taps; a pause longer than TAP_RESET_MS starts a new series. */
export function registerTap(taps: readonly number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const kept = last !== undefined && now - last > TAP_RESET_MS ? [] : taps.slice(-3);
  return [...kept, now];
}

export function tempoFromTaps(taps: readonly number[]): number | null {
  if (taps.length < 2) return null;
  const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  return clamp(Math.round(60_000 / avg), MIN_BPM, MAX_BPM);
}
```

Run: `pnpm test src/ui/tapTempo.test.ts`. Expected: 4 PASS.

- [ ] **Step 2: Write the failing component tests `src/ui/TopBar.test.tsx` and `src/ui/BarStrip.test.tsx`**

`src/ui/TopBar.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toggle = vi.fn();
vi.mock('../audio/transport', () => ({
  transport: { toggle: () => toggle(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject, createProject } from '../model/factory';
import * as ops from '../model/ops';
import { appStore } from '../state/store';
import { TopBar } from './TopBar';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(() => {
  cleanup();
  toggle.mockReset();
});

describe('TopBar', () => {
  it('toggles playback', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('shows tempo, kit and pattern', () => {
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Tempo' }).textContent).toContain('96');
    expect(screen.getByRole('button', { name: 'Kit' }).textContent).toBe('Acoustic');
    expect(screen.getByRole('button', { name: 'Pattern' }).textContent).toContain('A');
  });

  it('switches kit as an undoable edit', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Kit' }));
    expect(appStore.getState().project.kit).toBe('electronic');
    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(appStore.getState().project.kit).toBe('acoustic');
  });

  it('switches edit and play modes', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('radio', { name: 'Volume' }));
    expect(appStore.getState().ui.editMode).toBe('volume');
    fireEvent.click(screen.getByRole('radio', { name: 'Song' }));
    expect(appStore.getState().ui.playMode).toBe('song');
  });

  it('disables song play mode when the song is empty', () => {
    appStore.getState().loadProject(createProject());
    render(<TopBar />);
    expect(screen.getByRole('radio', { name: 'Song' })).toHaveProperty('disabled', true);
  });

  it('changes tempo from the popover', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Tempo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Faster' }));
    expect(appStore.getState().project.bpm).toBe(97);
  });

  it('switches pattern from the pattern menu', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Pattern' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^B · 2 bars/ }));
    expect(appStore.getState().ui.patternId).toBe(appStore.getState().project.patterns[1].id);
  });

  it('disables undo with no history', () => {
    appStore.getState().apply((p) => ops.setBpm(p, p.bpm));
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true);
  });
});
```

`src/ui/BarStrip.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore, currentPattern } from '../state/store';
import { BarStrip } from './BarStrip';
import { LONG_PRESS_MS } from './gestures';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
};

describe('BarStrip', () => {
  it('shows one chip per bar and selects bars by tap', () => {
    render(<BarStrip />);
    expect(screen.getAllByRole('button', { name: /^Bar \d+$/ })).toHaveLength(2);
    tap(screen.getByRole('button', { name: 'Bar 2' }));
    expect(appStore.getState().ui.barIndex).toBe(1);
  });

  it('adds a bar and selects it', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(currentPattern(appStore.getState()).bars).toHaveLength(3);
    expect(appStore.getState().ui.barIndex).toBe(2);
  });

  it('toggles loop bar', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Loop bar' }));
    expect(appStore.getState().ui.loopBar).toBe(true);
  });

  it('reorders bars with long-press and drag', () => {
    vi.useFakeTimers();
    render(<BarStrip />);
    const first = currentPattern(appStore.getState()).bars[0].id;
    const chip1 = screen.getByRole('button', { name: 'Bar 1' });
    const chip2 = screen.getByRole('button', { name: 'Bar 2' });
    document.elementFromPoint = vi.fn(() => chip2);
    fireEvent.pointerDown(chip1, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 10));
    fireEvent.pointerUp(chip1, { pointerId: 1, clientX: 60, clientY: 5 });
    expect(currentPattern(appStore.getState()).bars[1].id).toBe(first);
    expect(appStore.getState().ui.barIndex).toBe(1);
  });

  it('disables delete for the last remaining bar', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
  });
});
```

Run: `pnpm test src/ui/TopBar.test.tsx src/ui/BarStrip.test.tsx`. Expected: FAIL with the modules not found.

- [ ] **Step 3: Implement shared pieces: `Segmented`, `LongPressButton`, `useReorder`, `Sheet.module.css`**

`src/ui/Segmented.tsx`:
```tsx
import styles from './TopBar.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Tooltip, e.g. why an option is disabled. */
  title?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange(v: T): void }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/LongPressButton.tsx`:
```tsx
import { useRef, type ButtonHTMLAttributes } from 'react';
import { LONG_PRESS_MS } from './gestures';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick(): void; onLongPress(): void };

/** Click for the main action; press and hold (or right-click) for the alternative. */
export function LongPressButton({ onClick, onLongPress, children, ...rest }: Props) {
  const timer = useRef(0);
  const long = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <button
      {...rest}
      onPointerDown={() => {
        long.current = false;
        timer.current = window.setTimeout(() => {
          long.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        long.current = true;
        onLongPress();
      }}
      onClick={() => {
        if (!long.current) onClick();
      }}
    >
      {children}
    </button>
  );
}
```

`src/ui/useReorder.ts`:
```ts
import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { DRAG_THRESHOLD, LONG_PRESS_MS } from './gestures';

interface Press {
  index: number;
  pointerId: number;
  x: number;
  y: number;
  lastX: number;
  timer: number;
  mode: 'press' | 'scroll' | 'drag';
}

/**
 * Tap / long-press-drag reordering for a horizontal chip list. Chips use `touch-action: none`,
 * so horizontal swipes are turned into manual scrolling of `scroller`.
 */
export function useReorder({ scroller, onTap, onMove }: {
  scroller: RefObject<HTMLElement | null>;
  onTap(index: number): void;
  onMove(from: number, to: number): void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const press = useRef<Press | null>(null);

  const end = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setDragIndex(null);
  };
  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint?.(x, y)?.closest?.<HTMLElement>('[data-index]');
    return el ? Number(el.dataset.index) : null;
  };

  const itemProps = (index: number) => ({
    'data-index': index,
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (press.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const p: Press = { index, pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, timer: 0, mode: 'press' };
      p.timer = window.setTimeout(() => {
        if (press.current === p && p.mode === 'press') {
          p.mode = 'drag';
          setDragIndex(index);
        }
      }, LONG_PRESS_MS);
      press.current = p;
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (p.mode === 'press' && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) {
        p.mode = 'scroll';
        window.clearTimeout(p.timer);
      }
      if (p.mode === 'scroll' && scroller.current) scroller.current.scrollLeft -= e.clientX - p.lastX;
      p.lastX = e.clientX;
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const { mode, index: from } = p;
      end();
      if (mode === 'press') onTap(from);
      else if (mode === 'drag') {
        const to = indexAt(e.clientX, e.clientY);
        if (to !== null && to !== from) onMove(from, to);
      }
    },
    onPointerCancel() {
      end();
    },
    onContextMenu(e: ReactMouseEvent) {
      e.preventDefault();
    },
  });

  return { dragIndex, itemProps };
}
```

`src/ui/Sheet.module.css`:
```css
.row { display: flex; align-items: center; gap: 8px; min-height: 40px; }
.swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
.name { flex: 1; display: flex; align-items: center; gap: 6px; }
.badge { font-style: normal; font-size: 10px; color: var(--accent); border: 1px solid var(--accent); border-radius: 6px; padding: 1px 5px; }
.sliderRow { display: flex; align-items: center; gap: 12px; }
.sliderRow input { flex: 1; }
.sliderRow output { min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.hint { color: var(--text-dim); font-size: 12px; }
.primary { background: var(--accent); color: #fff; align-self: flex-start; }
.list { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.projectOpen { flex: 1; display: flex; justify-content: space-between; gap: 8px; text-align: left; min-height: 40px; }
.projectOpen[aria-current='true'] { outline: 2px solid var(--accent); outline-offset: -2px; }
.projectOpen small { color: var(--text-dim); }
```

- [ ] **Step 4: Implement `BpmPopover`, `PatternMenu`, `SwingSheet`, `TracksSheet`, `moreMenu`**

`src/ui/BpmPopover.tsx`:
```tsx
import { useRef } from 'react';
import { MAX_BPM, MIN_BPM, setBpm } from '../model/ops';
import { appStore, useApp } from '../state/store';
import { Popover } from './Popover';
import { registerTap, tempoFromTaps } from './tapTempo';
import styles from './TopBar.module.css';

export function BpmPopover({ anchor, onClose }: { anchor: DOMRect; onClose(): void }) {
  const bpm = useApp((s) => s.project.bpm);
  const taps = useRef<number[]>([]);
  const st = appStore.getState;
  const set = (v: number) => st().apply((p) => setBpm(p, v));
  return (
    <Popover
      anchor={anchor}
      onClose={() => {
        st().endGesture();
        onClose();
      }}
    >
      <div className={styles.bpm}>
        <div className={styles.bpmRow}>
          <button aria-label="Slower" onClick={() => set(bpm - 1)}>−</button>
          <output className={styles.bpmValue} aria-label="BPM">{bpm}</output>
          <button aria-label="Faster" onClick={() => set(bpm + 1)}>+</button>
        </div>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          aria-label="Tempo slider"
          onChange={(e) => st().applyTransient((p) => setBpm(p, Number(e.target.value)))}
          onPointerUp={() => st().endGesture()}
          onBlur={() => st().endGesture()}
        />
        <button
          className={styles.tap}
          onPointerDown={() => {
            taps.current = registerTap(taps.current, performance.now());
            const t = tempoFromTaps(taps.current);
            if (t) set(t);
          }}
        >
          Tap tempo
        </button>
      </div>
    </Popover>
  );
}
```

`src/ui/PatternMenu.tsx`:
```tsx
import * as actions from '../state/actions';
import { appStore, currentPattern, useApp } from '../state/store';
import { Menu, type MenuItem } from './Menu';
import { confirmAction, promptText } from './modal';

export function PatternMenu({ onClose }: { onClose(): void }) {
  const patterns = useApp((s) => s.project.patterns);
  const currentId = useApp((s) => s.ui.patternId);
  const items: (MenuItem | 'separator')[] = [
    ...patterns.map((p) => ({
      label: `${p.name} · ${p.bars.length} bar${p.bars.length === 1 ? '' : 's'}`,
      checked: p.id === currentId,
      onSelect: () => actions.selectPattern(p.id),
    })),
    'separator',
    { label: 'New pattern', onSelect: actions.addPattern },
    { label: 'Duplicate pattern', onSelect: actions.duplicatePattern },
    {
      label: 'Rename pattern…',
      onSelect: async () => {
        const pat = currentPattern(appStore.getState());
        const name = await promptText({ title: 'Rename pattern', initial: pat.name, maxLength: 24, confirmLabel: 'Rename' });
        if (name) actions.renamePattern(pat.id, name);
      },
    },
    {
      label: 'Delete pattern',
      danger: true,
      disabled: patterns.length <= 1,
      onSelect: async () => {
        const { project } = appStore.getState();
        const pat = currentPattern(appStore.getState());
        const uses = project.song.filter((s) => s.patternId === pat.id).length;
        const ok = await confirmAction({
          title: `Delete pattern ${pat.name}?`,
          message: uses > 0 ? `It is used ${uses}× in the song; those steps are removed too. Undo restores everything.` : 'Undo restores it.',
        });
        if (ok) actions.deletePattern(pat.id);
      },
    },
  ];
  return <Menu items={items} onClose={onClose} />;
}
```

`src/ui/SwingSheet.tsx`:
```tsx
import { setSwing } from '../model/ops';
import { appStore, currentPattern, useApp } from '../state/store';
import { closeModal, Sheet, showModal } from './modal';
import styles from './Sheet.module.css';

function SwingSheet() {
  const pattern = useApp(currentPattern);
  const st = appStore.getState;
  const close = () => {
    st().endGesture();
    closeModal();
  };
  return (
    <Sheet title={`Swing — pattern ${pattern.name}`} onClose={close}>
      <label className={styles.sliderRow}>
        <input
          type="range"
          min={0}
          max={100}
          value={pattern.swing}
          aria-label="Swing amount"
          onChange={(e) => st().applyTransient((p) => setSwing(p, pattern.id, Number(e.target.value)))}
          onPointerUp={() => st().endGesture()}
          onBlur={() => st().endGesture()}
        />
        <output>{pattern.swing}%</output>
      </label>
      <p className={styles.hint}>Delays the off-beat 16ths. About 67% is a triplet shuffle. Triplet beats are not affected.</p>
    </Sheet>
  );
}

export function openSwingSheet(): void {
  showModal(<SwingSheet />);
}
```

`src/ui/TracksSheet.tsx`:
```tsx
import { setTrackHidden, setTrackMuted } from '../model/ops';
import { TRACKS } from '../model/tracks';
import { appStore, currentPattern, useApp } from '../state/store';
import { closeModal, Sheet, showModal } from './modal';
import styles from './Sheet.module.css';

function TracksSheet() {
  const tracks = useApp((s) => s.project.tracks);
  const pattern = useApp(currentPattern);
  const apply = appStore.getState().apply;
  return (
    <Sheet title="Tracks" onClose={closeModal}>
      {TRACKS.map((t) => {
        const s = tracks[t.id];
        const hasNotes = pattern.bars.some((b) => b.beats.some((beat) => beat.cells[t.id].some((v) => v > 0)));
        return (
          <div key={t.id} className={styles.row}>
            <span className={styles.swatch} style={{ background: t.color }} />
            <span className={styles.name}>
              {t.label}
              {s.hidden && hasNotes && <em className={styles.badge}>has notes</em>}
            </span>
            <button aria-pressed={!s.hidden} aria-label={`Show ${t.label}`} onClick={() => apply((p) => setTrackHidden(p, t.id, !s.hidden))}>
              {s.hidden ? 'Hidden' : 'Shown'}
            </button>
            <button aria-pressed={s.muted} aria-label={`Mute ${t.label}`} onClick={() => apply((p) => setTrackMuted(p, t.id, !s.muted))}>
              {s.muted ? 'Muted' : 'Mute'}
            </button>
          </div>
        );
      })}
    </Sheet>
  );
}

export function openTracksSheet(): void {
  showModal(<TracksSheet />);
}
```

`src/ui/moreMenu.ts`:
```ts
import type { View } from '../state/store';
import type { MenuItem } from './Menu';
import { openSwingSheet } from './SwingSheet';
import { openTracksSheet } from './TracksSheet';

export function moreMenuItems(_view: View): (MenuItem | 'separator')[] {
  return [
    { label: 'Swing…', onSelect: openSwingSheet },
    { label: 'Tracks…', onSelect: openTracksSheet },
  ];
}
```

- [ ] **Step 5: Implement `TopBar` and `BarStrip`**

`src/ui/TopBar.module.css`:
```css
.bar { display: flex; align-items: center; gap: 6px; height: 38px; flex-shrink: 0; }
.play { width: 38px; min-width: 38px; padding: 0; border-radius: 50%; background: var(--accent); color: #fff; font-size: 14px; }
.play[aria-pressed='true'] { background: #fff; color: var(--bg); }
.spacer { flex: 1; }
.segmented { display: flex; background: var(--panel-2); border-radius: 10px; padding: 2px; gap: 2px; }
.segmented button { min-height: 26px; background: transparent; padding: 0 9px; }
.segmented button[aria-checked='true'] { background: var(--accent); color: #fff; }
.bpm { display: flex; flex-direction: column; gap: 10px; width: 220px; padding: 4px; }
.bpmRow { display: flex; align-items: center; justify-content: space-between; }
.bpmRow button { width: 44px; min-height: 40px; font-size: 18px; }
.bpmValue { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tap { min-height: 44px; }
```

`src/ui/TopBar.tsx`:
```tsx
import { useState, type MouseEvent } from 'react';
import { transport } from '../audio/transport';
import { setKit } from '../model/ops';
import { appStore, currentPattern, useApp } from '../state/store';
import { BpmPopover } from './BpmPopover';
import { Menu } from './Menu';
import { moreMenuItems } from './moreMenu';
import { PatternMenu } from './PatternMenu';
import { Popover } from './Popover';
import { Segmented } from './Segmented';
import styles from './TopBar.module.css';

type Open = { kind: 'bpm' | 'pattern' | 'more'; rect: DOMRect } | null;

export function TopBar() {
  const playing = useApp((s) => s.ui.playing);
  const bpm = useApp((s) => s.project.bpm);
  const kit = useApp((s) => s.project.kit);
  const patternName = useApp((s) => currentPattern(s).name);
  const playMode = useApp((s) => s.ui.playMode);
  const songEmpty = useApp((s) => s.project.song.length === 0);
  const editMode = useApp((s) => s.ui.editMode);
  const view = useApp((s) => s.ui.view);
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const [open, setOpen] = useState<Open>(null);
  const st = appStore.getState;
  const opener = (kind: NonNullable<Open>['kind']) => (e: MouseEvent<HTMLElement>) => setOpen({ kind, rect: e.currentTarget.getBoundingClientRect() });
  const close = () => setOpen(null);

  return (
    <header className={styles.bar}>
      <button className={styles.play} aria-label={playing ? 'Stop' : 'Play'} aria-pressed={playing} onClick={() => transport.toggle()}>
        {playing ? '■' : '▶'}
      </button>
      <button aria-label="Tempo" onClick={opener('bpm')}>♩ {bpm}</button>
      <button aria-label="Kit" onClick={() => st().apply((p) => setKit(p, kit === 'acoustic' ? 'electronic' : 'acoustic'))}>
        {kit === 'acoustic' ? 'Acoustic' : 'Electronic'}
      </button>
      <button aria-label="Pattern" onClick={opener('pattern')}>{patternName} ▾</button>
      <Segmented
        label="Play mode"
        value={playMode}
        options={[
          { value: 'pattern', label: 'Pattern' },
          { value: 'song', label: 'Song', disabled: songEmpty, title: songEmpty ? 'Add steps in the Song view first' : undefined },
        ]}
        onChange={(v) => st().setUi({ playMode: v })}
      />
      {view === 'grid' && (
        <Segmented
          label="Edit mode"
          value={editMode}
          options={[{ value: 'notes', label: 'Notes' }, { value: 'volume', label: 'Volume' }]}
          onChange={(v) => st().setUi({ editMode: v })}
        />
      )}
      <div className={styles.spacer} />
      <button aria-label="Undo" disabled={!canUndo} onClick={() => st().undo()}>↶</button>
      <button aria-label="Redo" disabled={!canRedo} onClick={() => st().redo()}>↷</button>
      <button aria-label="More" onClick={opener('more')}>⋯</button>

      {open?.kind === 'bpm' && <BpmPopover anchor={open.rect} onClose={close} />}
      {open?.kind === 'pattern' && (
        <Popover anchor={open.rect} onClose={close}>
          <PatternMenu onClose={close} />
        </Popover>
      )}
      {open?.kind === 'more' && (
        <Popover anchor={open.rect} onClose={close}>
          <Menu items={moreMenuItems(view)} onClose={close} />
        </Popover>
      )}
    </header>
  );
}
```

`src/ui/BarStrip.module.css`:
```css
.strip { display: flex; align-items: center; gap: 6px; height: 34px; flex-shrink: 0; }
.chips { flex: 1; min-width: 0; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip { min-width: 34px; flex-shrink: 0; touch-action: none; font-variant-numeric: tabular-nums; }
.current { background: #444456; outline: 2px solid var(--accent); outline-offset: -2px; }
.playingChip { box-shadow: inset 0 -3px 0 var(--playhead); }
.dragging { opacity: 0.55; transform: scale(1.08); }
.actions { display: flex; gap: 4px; flex-shrink: 0; }
```

`src/ui/BarStrip.tsx`:
```tsx
import { useCallback, useRef } from 'react';
import type { PlayheadEvent } from '../audio/scheduler';
import * as actions from '../state/actions';
import { appStore, currentPattern, useApp, type AppState } from '../state/store';
import styles from './BarStrip.module.css';
import { LongPressButton } from './LongPressButton';
import { usePlayheadMarker } from './usePlayheadMarker';
import { useReorder } from './useReorder';

export function BarStrip() {
  const pattern = useApp(currentPattern);
  const barIndex = useApp((s) => s.ui.barIndex);
  const loopBar = useApp((s) => s.ui.loopBar);
  const follow = useApp((s) => s.ui.follow);
  const playing = useApp((s) => s.ui.playing);
  const chips = useRef<HTMLDivElement>(null);
  const { dragIndex, itemProps } = useReorder({ scroller: chips, onTap: actions.selectBar, onMove: actions.moveBar });

  const selectPlaying = useCallback(
    (ph: PlayheadEvent, s: AppState) => (ph.ref.patternId === s.ui.patternId ? `[data-index="${ph.ref.barIndex}"]` : null),
    [],
  );
  usePlayheadMarker(chips, styles.playingChip, selectPlaying);

  const st = appStore.getState;
  return (
    <footer className={styles.strip}>
      <div ref={chips} className={styles.chips}>
        {pattern.bars.map((bar, i) => (
          <button
            key={bar.id}
            className={`${styles.chip} ${i === barIndex ? styles.current : ''} ${dragIndex === i ? styles.dragging : ''}`}
            aria-label={`Bar ${i + 1}`}
            aria-current={i === barIndex}
            {...itemProps(i)}
          >
            {i + 1}
          </button>
        ))}
        <button className={styles.chip} aria-label="Add bar" onClick={actions.addBarAtEnd}>+</button>
      </div>
      <div className={styles.actions}>
        <button aria-pressed={loopBar} onClick={() => st().setUi({ loopBar: !loopBar })}>Loop bar</button>
        {playing && !follow && <button onClick={() => st().setUi({ follow: true })}>Follow</button>}
        <button onClick={actions.copyBar}>Copy</button>
        <LongPressButton title="Hold to paste as a new bar" onClick={actions.pasteBar} onLongPress={actions.pasteBarAsNew}>Paste</LongPressButton>
        <button onClick={actions.duplicateCurrentBar}>Duplicate</button>
        <button onClick={actions.clearCurrentBar}>Clear</button>
        <button onClick={actions.deleteCurrentBar} disabled={pattern.bars.length <= 1}>Delete</button>
      </div>
    </footer>
  );
}
```

Modify `src/App.tsx`. Import `TopBar` and `BarStrip`, and replace the returned JSX with:
```tsx
    <div className={styles.app}>
      <TopBar />
      <main className={styles.main}>{view === 'grid' && <Grid />}</main>
      {view === 'grid' && <BarStrip />}
      <Toasts />
      <ModalHost />
      <RotateOverlay />
    </div>
```

- [ ] **Step 6: Run tests, typecheck, build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(ui): top bar with tempo/kit/pattern/modes, bar strip with reorder and clipboard, swing and tracks sheets"
```

---

### Task 14: Song view, projects sheet, share link and MIDI export

**Files:**
- Create: `src/ui/SongView.tsx`, `src/ui/SongView.module.css`, `src/ui/ProjectsSheet.tsx`
- Modify: `src/state/actions.ts`, which gains `shareProject()` and `exportMidiFile()`
- Modify: `src/ui/moreMenu.ts`, which becomes the full menu
- Modify: `src/App.tsx`, which renders `<SongView/>` when `view === 'song'`
- Test: `src/ui/SongView.test.tsx`, `src/state/share-export.test.ts`

**Interfaces:**
- Consumes: ops `appendSongStep`, `moveSongStep`, `removeSongStep`, `duplicateSongStep`, `setSongStepPattern`; `encodeShare`, `shareUrl`, `compressionSupported`; `exportMidi`, `downloadBytes`, `safeFilename`; `storage`, `flushAutosave`; actions from Task 12.
- Produces:
  - `<SongView/>`. Steps are buttons named `Step N: pattern X`, and there is an `Add step` button.
  - `openProjectsSheet()`
  - `actions.shareProject(): Promise<void>`
  - `actions.exportMidiFile(): void`
  - The final `moreMenuItems(view)`

- [ ] **Step 1: Write the failing tests**

`src/ui/SongView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore } from '../state/store';
import { SongView } from './SongView';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(cleanup);

const steps = () => screen.getAllByRole('button', { name: /^Step \d+: pattern/ });
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
};

describe('SongView', () => {
  it('lists song steps with pattern names', () => {
    render(<SongView />);
    expect(steps().map((b) => b.getAttribute('aria-label'))).toEqual(['Step 1: pattern A', 'Step 2: pattern B']);
  });

  it('appends a step from the add menu', () => {
    render(<SongView />);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pattern A' }));
    expect(steps()).toHaveLength(3);
  });

  it('removes, duplicates and retargets steps from the step menu', () => {
    render(<SongView />);
    tap(steps()[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate step' }));
    expect(steps()).toHaveLength(3);
    tap(steps()[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use pattern B' }));
    expect(steps()[0].getAttribute('aria-label')).toBe('Step 1: pattern B');
    tap(steps()[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove step' }));
    expect(steps()).toHaveLength(2);
  });

  it('opens the grid on a step pattern', () => {
    render(<SongView />);
    tap(steps()[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit pattern B' }));
    const s = appStore.getState();
    expect(s.ui.view).toBe('grid');
    expect(s.ui.patternId).toBe(s.project.patterns[1].id);
  });
});
```

`src/state/share-export.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const downloads: { name: string; type: string; size: number }[] = [];
vi.mock('../io/download', async (orig) => ({
  ...(await orig<typeof import('../io/download')>()),
  downloadBytes: (bytes: Uint8Array, name: string, type: string) => downloads.push({ name, type, size: bytes.length }),
}));

import { decodeShare, payloadFromHash } from '../io/share';
import { createDemoProject } from '../model/factory';
import * as actions from './actions';
import { appStore } from './store';

beforeEach(() => {
  downloads.length = 0;
  appStore.getState().loadProject(createDemoProject());
  vi.stubGlobal('location', { origin: 'https://dm.test', pathname: '/app/' });
});
afterEach(() => vi.unstubAllGlobals());

describe('exportMidiFile', () => {
  it('downloads a .mid named after the project', () => {
    actions.exportMidiFile();
    expect(downloads).toEqual([{ name: 'Demo-groove.mid', type: 'audio/midi', size: expect.any(Number) }]);
    expect(downloads[0].size).toBeGreaterThan(100);
  });
});

describe('shareProject', () => {
  it('uses the Web Share API when available', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal('navigator', { share });
    await actions.shareProject();
    const url = share.mock.calls[0][0].url!;
    expect(url.startsWith('https://dm.test/app/#p=')).toBe(true);
    const p = await decodeShare(payloadFromHash(new URL(url).hash)!);
    expect(p.name).toBe('Demo groove');
  });

  it('falls back to the clipboard', async () => {
    const writeText = vi.fn(async (_t: string) => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await actions.shareProject();
    expect(writeText.mock.calls[0][0]).toMatch(/#p=/);
    expect(appStore.getState().toasts.at(-1)?.message).toBe('Link copied');
  });

  it('stays quiet when the user cancels the share sheet', async () => {
    const share = vi.fn(async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); });
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    await actions.shareProject();
    expect(writeText).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm test src/ui/SongView.test.tsx src/state/share-export.test.ts`. Expected: FAIL. `SongView` is missing, and `actions.exportMidiFile` / `actions.shareProject` are not functions.

- [ ] **Step 2: Add the share and export actions to `src/state/actions.ts`**

Add these imports at the top:
```ts
import { downloadBytes, safeFilename } from '../io/download';
import { exportMidi } from '../io/midi';
import { compressionSupported, encodeShare, shareUrl } from '../io/share';
import { promptText } from '../ui/modal';
```

Append:
```ts
// ---- share & export ----

export async function shareProject(): Promise<void> {
  if (!compressionSupported()) return void s().toast('This browser is too old to create share links', 'error');
  const p = s().project;
  const url = shareUrl(await encodeShare(p), location.origin + location.pathname);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: p.name, url });
      return;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    s().toast('Link copied');
  } catch {
    await promptText({ title: 'Share link', initial: url, readOnly: true });
  }
}

export function exportMidiFile(): void {
  const { project, ui } = s();
  downloadBytes(exportMidi(project, { patternId: ui.patternId }), `${safeFilename(project.name)}.mid`, 'audio/midi');
}
```

- [ ] **Step 3: Implement `SongView` and `ProjectsSheet`**

`src/ui/SongView.module.css`:
```css
.song { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
.header { display: flex; align-items: center; gap: 12px; }
.header h2 { font-size: 15px; }
.hint { color: var(--text-dim); flex: 1; }
.steps { display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 10px; scrollbar-width: none; }
.steps::-webkit-scrollbar { display: none; }
.step {
  position: relative; flex-shrink: 0; width: 76px; height: 76px; border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; touch-action: none;
}
.stepName { font-size: 22px; font-weight: 700; }
.stepBars { font-size: 11px; color: var(--text-dim); }
.step::after {
  content: ''; position: absolute; left: 0; bottom: 0; height: 4px; width: var(--progress, 0%); background: var(--accent);
}
.playingStep { outline: 2px solid var(--accent); outline-offset: -2px; }
.dragging { opacity: 0.55; transform: scale(1.06); }
.add { flex-shrink: 0; width: 76px; height: 76px; border-radius: 12px; font-size: 28px; }
```

`src/ui/SongView.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { transport } from '../audio/transport';
import * as ops from '../model/ops';
import { TICKS_PER_BAR } from '../model/timing';
import * as actions from '../state/actions';
import { appStore, useApp } from '../state/store';
import { Menu, type MenuItem } from './Menu';
import { Popover } from './Popover';
import styles from './SongView.module.css';
import { useReorder } from './useReorder';

type Open = { kind: 'add'; rect: DOMRect } | { kind: 'step'; index: number; rect: DOMRect } | null;

export function SongView() {
  const song = useApp((s) => s.project.song);
  const patterns = useApp((s) => s.project.patterns);
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const apply = appStore.getState().apply;

  const openStepMenu = (index: number) => {
    const el = scroller.current?.querySelector(`[data-index="${index}"]`);
    if (el) setOpen({ kind: 'step', index, rect: el.getBoundingClientRect() });
  };
  const { dragIndex, itemProps } = useReorder({
    scroller,
    onTap: openStepMenu,
    onMove: (from, to) => apply((p) => ops.moveSongStep(p, from, to)),
  });

  // Highlight the playing step and show progress through it, without React renders.
  useEffect(() => {
    let raf = 0;
    let lit: HTMLElement | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ph = transport.playhead();
      const root = scroller.current;
      const next = ph && ph.ref.stepIndex >= 0 ? root?.querySelector<HTMLElement>(`[data-index="${ph.ref.stepIndex}"]`) ?? null : null;
      if (lit && lit !== next) {
        lit.classList.remove(styles.playingStep);
        lit.style.removeProperty('--progress');
      }
      lit = next;
      if (!next || !ph) return;
      const pat = appStore.getState().project.patterns.find((p) => p.id === ph.ref.patternId);
      const total = (pat?.bars.length ?? 1) * TICKS_PER_BAR;
      next.classList.add(styles.playingStep);
      next.style.setProperty('--progress', `${((ph.ref.barIndex * TICKS_PER_BAR + ph.tick) / total) * 100}%`);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const totalBars = song.reduce((n, step) => n + (patterns.find((p) => p.id === step.patternId)?.bars.length ?? 0), 0);

  let menuItems: (MenuItem | 'separator')[] = [];
  if (open?.kind === 'add') {
    menuItems = patterns.map((p) => ({ label: `Pattern ${p.name}`, onSelect: () => apply((x) => ops.appendSongStep(x, p.id)) }));
  } else if (open?.kind === 'step') {
    const step = song[open.index];
    const pat = patterns.find((p) => p.id === step?.patternId);
    if (step && pat) {
      menuItems = [
        {
          label: `Edit pattern ${pat.name}`,
          onSelect: () => {
            actions.selectPattern(pat.id);
            appStore.getState().setUi({ view: 'grid' });
          },
        },
        'separator',
        ...patterns.map((p) => ({
          label: `Use pattern ${p.name}`,
          checked: p.id === step.patternId,
          onSelect: () => apply((x) => ops.setSongStepPattern(x, step.id, p.id)),
        })),
        'separator',
        { label: 'Duplicate step', onSelect: () => apply((x) => ops.duplicateSongStep(x, step.id)) },
        { label: 'Remove step', danger: true, onSelect: () => apply((x) => ops.removeSongStep(x, step.id)) },
      ];
    }
  }

  return (
    <div className={styles.song}>
      <div className={styles.header}>
        <h2>Song</h2>
        <span className={styles.hint}>
          {song.length === 0
            ? 'Add patterns to build a song.'
            : `${song.length} steps · ${totalBars} bars · tap a step for options, hold to drag`}
        </span>
        <button onClick={() => appStore.getState().setUi({ view: 'grid' })}>Back to grid</button>
      </div>
      <div ref={scroller} className={styles.steps}>
        {song.map((step, i) => {
          const pat = patterns.find((p) => p.id === step.patternId);
          if (!pat) return null;
          return (
            <button
              key={step.id}
              className={`${styles.step} ${dragIndex === i ? styles.dragging : ''}`}
              aria-label={`Step ${i + 1}: pattern ${pat.name}`}
              {...itemProps(i)}
            >
              <span className={styles.stepName}>{pat.name}</span>
              <span className={styles.stepBars}>{pat.bars.length} bar{pat.bars.length === 1 ? '' : 's'}</span>
            </button>
          );
        })}
        <button className={styles.add} aria-label="Add step" onClick={(e) => setOpen({ kind: 'add', rect: e.currentTarget.getBoundingClientRect() })}>+</button>
      </div>
      {open && menuItems.length > 0 && (
        <Popover anchor={open.rect} onClose={close}>
          <Menu items={menuItems} onClose={close} />
        </Popover>
      )}
    </div>
  );
}
```

`src/ui/ProjectsSheet.tsx`:
```tsx
import { useMemo, useState } from 'react';
import * as actions from '../state/actions';
import { flushAutosave, storage } from '../state/persistence';
import { useApp } from '../state/store';
import { Menu } from './Menu';
import { closeModal, confirmAction, promptText, Sheet, showModal } from './modal';
import { Popover } from './Popover';
import styles from './Sheet.module.css';

const formatDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function ProjectsSheet() {
  const currentId = useApp((s) => s.project.id);
  const currentName = useApp((s) => s.project.name);
  const [menu, setMenu] = useState<{ id: string; name: string; rect: DOMRect } | null>(null);
  const projects = useMemo(() => storage.listProjects(), [currentId, currentName]);

  return (
    <Sheet title="Projects" onClose={closeModal}>
      <button
        className={styles.primary}
        onClick={() => {
          actions.newProject();
          closeModal();
        }}
      >
        New project
      </button>
      {!storage.available && <p className={styles.hint}>Saving is unavailable in this browser mode.</p>}
      <ul className={styles.list}>
        {projects.map((m) => (
          <li key={m.id} className={styles.row}>
            <button
              className={styles.projectOpen}
              aria-current={m.id === currentId}
              onClick={() => {
                actions.openProject(m.id);
                closeModal();
              }}
            >
              <span>{m.name}</span>
              <small>{formatDate(m.updatedAt)}</small>
            </button>
            <button aria-label={`More for ${m.name}`} onClick={(e) => setMenu({ id: m.id, name: m.name, rect: e.currentTarget.getBoundingClientRect() })}>⋯</button>
          </li>
        ))}
      </ul>
      {menu && (
        <Popover anchor={menu.rect} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              {
                label: 'Rename…',
                onSelect: async () => {
                  const name = await promptText({ title: 'Rename project', initial: menu.name, confirmLabel: 'Rename' });
                  if (name) actions.renameProject(menu.id, name);
                  openProjectsSheet();
                },
              },
              {
                label: 'Duplicate',
                onSelect: () => {
                  actions.duplicateProject(menu.id);
                  openProjectsSheet();
                },
              },
              {
                label: 'Delete…',
                danger: true,
                onSelect: async () => {
                  const ok = await confirmAction({ title: `Delete “${menu.name}”?`, message: 'This cannot be undone.' });
                  if (ok) actions.deleteProject(menu.id);
                  openProjectsSheet();
                },
              },
            ]}
          />
        </Popover>
      )}
    </Sheet>
  );
}

export function openProjectsSheet(): void {
  flushAutosave();
  showModal(<ProjectsSheet key={Date.now()} />);
}
```

- [ ] **Step 4: Replace `src/ui/moreMenu.ts` with the full menu, and wire `SongView` into `App.tsx`**

```ts
import * as actions from '../state/actions';
import { appStore, type View } from '../state/store';
import type { MenuItem } from './Menu';
import { promptText } from './modal';
import { openProjectsSheet } from './ProjectsSheet';
import { openSwingSheet } from './SwingSheet';
import { openTracksSheet } from './TracksSheet';

export function moreMenuItems(view: View): (MenuItem | 'separator')[] {
  const setView = (v: View) => () => appStore.getState().setUi({ view: v });
  return [
    { label: 'Projects…', onSelect: openProjectsSheet },
    {
      label: 'Rename project…',
      onSelect: async () => {
        const p = appStore.getState().project;
        const name = await promptText({ title: 'Rename project', initial: p.name, confirmLabel: 'Rename' });
        if (name) actions.renameProject(p.id, name);
      },
    },
    'separator',
    { label: 'Grid', checked: view === 'grid', onSelect: setView('grid') },
    { label: 'Song', checked: view === 'song', onSelect: setView('song') },
    'separator',
    { label: 'Swing…', onSelect: openSwingSheet },
    { label: 'Tracks…', onSelect: openTracksSheet },
    'separator',
    { label: 'Share link', onSelect: () => void actions.shareProject() },
    { label: 'Export MIDI', onSelect: actions.exportMidiFile },
  ];
}
```

In `src/App.tsx`, import `SongView` and change the `<main>` line to:
```tsx
      <main className={styles.main}>
        {view === 'grid' && <Grid />}
        {view === 'song' && <SongView />}
      </main>
```

- [ ] **Step 5: Run tests, typecheck, build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: song chain view, projects sheet, share links and MIDI export"
```

---

### Task 15: Notation view

**Files:**
- Create: `src/notation/toNotation.ts`, `src/notation/renderNotation.ts`, `src/notation/NotationView.tsx`, `src/notation/NotationView.module.css`
- Modify: `src/ui/moreMenu.ts`, which adds a `Notation` item after `Song`
- Modify: `src/App.tsx`, which renders `<NotationView/>` when `view === 'notation'`
- Test: `src/notation/toNotation.test.ts`

**Interfaces:**
- Consumes: `Bar`, `Beat`, `Pattern`; `TRACK_IDS`, `TRACK_BY_ID`; `ACCENT_MIN`, `GHOST_MAX`, `TICKS_PER_BAR`; `transport.playhead`; `actions.selectBar`.
- Produces:
  - Types:
    - `NoteDur = 'q' | '8d' | '8' | '16'`
    - `NotationHit { track; velocity }`
    - `NotationEvent { duration; rest; hits }`
    - `NotationBeat { tuplet: { numNotes: 3 | 6; notesOccupied: 2 | 4 } | null; events }`
    - `NotationBar { hands: NotationBeat[]; feet: NotationBeat[]; feetEmpty: boolean }`
  - Functions:
    - `toNotation(bar): NotationBar`
    - `notationMarks(hits): { keys: { key: string; ghost: boolean }[]; accent: boolean; open: boolean }`
    - `renderNotation(el, pattern, VF): BarLayout[]`, where `BarLayout { left; right; noteStart; noteEnd }`
  - Component: `<NotationView/>`. Its SVG container is `data-testid="notation"`.

- [ ] **Step 1: Write the failing test `src/notation/toNotation.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createBar, createBeat } from '../model/factory';
import type { Bar, TrackId } from '../model/types';
import { notationMarks, toNotation } from './toNotation';

function bar(hits: [beat: number, track: TrackId, cell: number, v?: number][]): Bar {
  const b = createBar();
  for (const [beat, track, cell, v = 100] of hits) b.beats[beat].cells[track][cell] = v;
  return b;
}
const durs = (beat: { events: { duration: string; rest: boolean }[] }) => beat.events.map((e) => (e.rest ? `${e.duration}r` : e.duration));

describe('toNotation', () => {
  it('renders an empty bar as quarter rests with an empty feet voice', () => {
    const n = toNotation(createBar());
    expect(n.hands.map(durs)).toEqual([['qr'], ['qr'], ['qr'], ['qr']]);
    expect(n.feetEmpty).toBe(true);
  });

  it('splits hands and feet and merges 16ths into 8ths and quarters', () => {
    const n = toNotation(bar([
      [0, 'hhClosed', 0], [0, 'hhClosed', 2], [1, 'hhClosed', 0], [1, 'snare', 0], [1, 'hhClosed', 2],
      [0, 'kick', 0], [2, 'kick', 0], [2, 'hhPedal', 2],
    ]));
    expect(durs(n.hands[0])).toEqual(['8', '8']);
    expect(n.hands[1].events[0].hits.map((h) => h.track)).toEqual(['hhClosed', 'snare']);
    expect(durs(n.feet[0])).toEqual(['q']);
    expect(durs(n.feet[1])).toEqual(['qr']);
    expect(durs(n.feet[2])).toEqual(['8', '8']);
    expect(n.feetEmpty).toBe(false);
  });

  it('uses dotted 8ths and leading rests', () => {
    const n = toNotation(bar([[0, 'snare', 0], [0, 'snare', 3], [1, 'snare', 1], [2, 'snare', 3]]));
    expect(durs(n.hands[0])).toEqual(['8d', '16']);
    expect(durs(n.hands[1])).toEqual(['16r', '8d']);
    expect(durs(n.hands[2])).toEqual(['8dr', '16']);
  });

  it('writes 8th-triplet beats as a 3:2 tuplet', () => {
    const b = createBar();
    b.beats[3] = createBeat(3);
    b.beats[3].cells.snare = [100, 0, 90];
    const n = toNotation(b);
    expect(n.hands[3].tuplet).toEqual({ numNotes: 3, notesOccupied: 2 });
    expect(durs(n.hands[3])).toEqual(['8', '8r', '8']);
  });

  it('writes 16th-triplet beats as a 6:4 tuplet', () => {
    const b = createBar();
    b.beats[0] = createBeat(6);
    b.beats[0].cells.ride = [90, 90, 90, 90, 90, 90];
    const n = toNotation(b);
    expect(n.hands[0].tuplet).toEqual({ numNotes: 6, notesOccupied: 4 });
    expect(durs(n.hands[0])).toEqual(['16', '16', '16', '16', '16', '16']);
  });

  it('writes an empty triplet beat as a plain quarter rest', () => {
    const b = createBar();
    b.beats[2] = createBeat(3);
    expect(toNotation(b).hands[2]).toEqual({ tuplet: null, events: [{ duration: 'q', rest: true, hits: [] }] });
  });
});

describe('notationMarks', () => {
  it('flags accents and ghost notes from velocity', () => {
    expect(notationMarks([{ track: 'snare', velocity: 120 }])).toEqual({ keys: [{ key: 'c/5', ghost: false }], accent: true, open: false });
    expect(notationMarks([{ track: 'snare', velocity: 30 }])).toEqual({ keys: [{ key: 'c/5', ghost: true }], accent: false, open: false });
  });

  it('merges open and closed hi-hat on the same staff position, open wins', () => {
    const m = notationMarks([{ track: 'hhOpen', velocity: 90 }, { track: 'hhClosed', velocity: 90 }]);
    expect(m.keys).toEqual([{ key: 'g/5/x2', ghost: false }]);
    expect(m.open).toBe(true);
  });
});
```

Run: `pnpm test src/notation`. Expected: FAIL with the module not found.

- [ ] **Step 2: Implement `src/notation/toNotation.ts`**

```ts
import { ACCENT_MIN, GHOST_MAX } from '../model/timing';
import { TRACK_BY_ID, TRACK_IDS } from '../model/tracks';
import type { Bar, Beat, TrackId, Velocity } from '../model/types';

export type NoteDur = 'q' | '8d' | '8' | '16';

export interface NotationHit {
  track: TrackId;
  velocity: Velocity;
}

export interface NotationEvent {
  duration: NoteDur;
  rest: boolean;
  hits: NotationHit[];
}

export interface NotationBeat {
  tuplet: { numNotes: 3 | 6; notesOccupied: 2 | 4 } | null;
  events: NotationEvent[];
}

export interface NotationBar {
  hands: NotationBeat[];
  feet: NotationBeat[];
  feetEmpty: boolean;
}

type Voice = 'hands' | 'feet';

const SIXTEENTHS_TO_DUR: Record<number, NoteDur> = { 1: '16', 2: '8', 3: '8d', 4: 'q' };
const QUARTER_REST: NotationBeat = { tuplet: null, events: [{ duration: 'q', rest: true, hits: [] }] };

function hitsAt(beat: Beat, cell: number, voice: Voice): NotationHit[] {
  return TRACK_IDS.filter((t) => TRACK_BY_ID[t].notation.voice === voice && beat.cells[t][cell] > 0).map((t) => ({
    track: t,
    velocity: beat.cells[t][cell],
  }));
}

function beatEvents(beat: Beat, voice: Voice): NotationBeat {
  const slots = Array.from({ length: beat.div }, (_, i) => hitsAt(beat, i, voice));
  if (slots.every((s) => s.length === 0)) return { tuplet: null, events: [...QUARTER_REST.events] };

  if (beat.div === 3 || beat.div === 6) {
    const duration: NoteDur = beat.div === 3 ? '8' : '16';
    return {
      tuplet: beat.div === 3 ? { numNotes: 3, notesOccupied: 2 } : { numNotes: 6, notesOccupied: 4 },
      events: slots.map((hits) => ({ duration, rest: hits.length === 0, hits })),
    };
  }

  const onsets = slots.flatMap((hits, i) => (hits.length > 0 ? [i] : []));
  const events: NotationEvent[] = [];
  if (onsets[0] > 0) events.push({ duration: SIXTEENTHS_TO_DUR[onsets[0]], rest: true, hits: [] });
  onsets.forEach((start, k) => {
    const end = onsets[k + 1] ?? 4;
    events.push({ duration: SIXTEENTHS_TO_DUR[end - start], rest: false, hits: slots[start] });
  });
  return { tuplet: null, events };
}

export function toNotation(bar: Bar): NotationBar {
  const hands = bar.beats.map((b) => beatEvents(b, 'hands'));
  const feet = bar.beats.map((b) => beatEvents(b, 'feet'));
  const feetEmpty = feet.every((b) => b.events.length === 1 && b.events[0].rest);
  return { hands, feet, feetEmpty };
}

/** Staff keys (deduplicated), ghost flags per key, accent and open-hat flags for one chord. */
export function notationMarks(hits: readonly NotationHit[]) {
  const byKey = new Map<string, { velocity: number; open: boolean }>();
  for (const h of hits) {
    const def = TRACK_BY_ID[h.track].notation;
    const prev = byKey.get(def.key);
    byKey.set(def.key, { velocity: Math.max(prev?.velocity ?? 0, h.velocity), open: (prev?.open ?? false) || def.open === true });
  }
  const values = [...byKey.values()];
  return {
    keys: [...byKey.entries()].map(([key, v]) => ({ key, ghost: v.velocity <= GHOST_MAX })),
    accent: values.some((v) => v.velocity >= ACCENT_MIN),
    open: values.some((v) => v.open),
  };
}
```

Run: `pnpm test src/notation`. Expected: all PASS.

- [ ] **Step 3: Implement `src/notation/renderNotation.ts`**

```ts
import type { Pattern } from '../model/types';
import { notationMarks, toNotation, type NotationBeat, type NotationEvent } from './toNotation';

type VF = typeof import('vexflow/bravura');
type StaveNote = InstanceType<VF['StaveNote']>;
type Beam = InstanceType<VF['Beam']>;
type Tuplet = InstanceType<VF['Tuplet']>;
type Voice = InstanceType<VF['Voice']>;

export interface BarLayout {
  left: number;
  right: number;
  noteStart: number;
  noteEnd: number;
}

export const BAR_WIDTH = 280;
const FIRST_BAR_EXTRA = 70;
export const NOTATION_HEIGHT = 150;
const STAVE_Y = 28;

function makeNote(VF: VF, ev: NotationEvent, voice: 'hands' | 'feet'): StaveNote {
  const stemDirection = voice === 'hands' ? VF.Stem.UP : VF.Stem.DOWN;
  const dotted = ev.duration === '8d';
  if (ev.rest) {
    const rest = new VF.StaveNote({ keys: [voice === 'hands' ? 'b/4' : 'e/4'], duration: `${ev.duration}r`, stemDirection });
    if (dotted) VF.Dot.buildAndAttach([rest], { all: true });
    return rest;
  }
  const marks = notationMarks(ev.hits);
  const note = new VF.StaveNote({ keys: marks.keys.map((k) => k.key), duration: ev.duration, stemDirection, autoStem: false });
  if (dotted) VF.Dot.buildAndAttach([note], { all: true });
  marks.keys.forEach((k, i) => {
    if (!k.ghost) return;
    note.addModifier(new VF.Parenthesis(VF.Modifier.Position.LEFT), i);
    note.addModifier(new VF.Parenthesis(VF.Modifier.Position.RIGHT), i);
  });
  if (marks.accent) {
    note.addModifier(
      new VF.Articulation('a>').setPosition(voice === 'hands' ? VF.Modifier.Position.ABOVE : VF.Modifier.Position.BELOW),
      0,
    );
  }
  if (marks.open) note.addModifier(new VF.Annotation('o').setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0);
  return note;
}

function buildVoice(VF: VF, beats: NotationBeat[], voice: 'hands' | 'feet') {
  const notes: StaveNote[] = [];
  const beams: Beam[] = [];
  const tuplets: Tuplet[] = [];
  for (const beat of beats) {
    const beatNotes = beat.events.map((ev) => makeNote(VF, ev, voice));
    notes.push(...beatNotes);
    if (beat.tuplet) {
      tuplets.push(new VF.Tuplet(beatNotes, {
        numNotes: beat.tuplet.numNotes,
        notesOccupied: beat.tuplet.notesOccupied,
        bracketed: true,
        location: voice === 'hands' ? 1 : -1,
      }));
    }
    const beamable = beatNotes.filter((_, i) => !beat.events[i].rest && beat.events[i].duration !== 'q');
    if (beamable.length >= 2) beams.push(new VF.Beam(beamable));
  }
  const v: Voice = new VF.Voice({ numBeats: 4, beatValue: 4 }).setMode(VF.Voice.Mode.SOFT);
  v.addTickables(notes);
  return { voice: v, beams, tuplets };
}

/** Draws all bars of `pattern` on one percussion staff into `el`; returns per-bar x ranges for the cursor. */
export function renderNotation(el: HTMLDivElement, pattern: Pattern, VF: VF): BarLayout[] {
  el.innerHTML = '';
  const width = 8 + FIRST_BAR_EXTRA + BAR_WIDTH * pattern.bars.length;
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, NOTATION_HEIGHT);
  const ctx = renderer.getContext();
  if (pattern.swing > 0) {
    ctx.setFont('Arial', 12);
    ctx.fillText(`Swing ${pattern.swing}%`, 8, 16);
  }

  const layout: BarLayout[] = [];
  let x = 4;
  pattern.bars.forEach((bar, i) => {
    const w = BAR_WIDTH + (i === 0 ? FIRST_BAR_EXTRA : 0);
    const stave = new VF.Stave(x, STAVE_Y, w);
    if (i === 0) stave.addClef('percussion').addTimeSignature('4/4');
    stave.setContext(ctx).draw();

    const n = toNotation(bar);
    const hands = buildVoice(VF, n.hands, 'hands');
    const parts = [hands];
    if (!n.feetEmpty) parts.push(buildVoice(VF, n.feet, 'feet'));
    const voices = parts.map((p) => p.voice);
    new VF.Formatter().joinVoices(voices).formatToStave(voices, stave);
    for (const v of voices) v.draw(ctx, stave);
    for (const p of parts) {
      for (const b of p.beams) b.setContext(ctx).draw();
      for (const t of p.tuplets) t.setContext(ctx).draw();
    }
    layout.push({ left: x, right: x + w, noteStart: stave.getNoteStartX(), noteEnd: stave.getNoteEndX() });
    x += w;
  });
  return layout;
}
```

If `VF.Voice.Mode` isn't exposed in VexFlow 5's typings, use the numeric `2` (VoiceMode.SOFT) with a comment. If `VF.Modifier.Position` isn't exposed, use the exported `ModifierPosition` enum instead.

- [ ] **Step 4: Implement `NotationView` and wire it in**

`src/notation/NotationView.module.css`:
```css
.view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
.header { display: flex; align-items: center; gap: 12px; }
.header h2 { font-size: 15px; }
.hint { color: var(--text-dim); flex: 1; }
.scroller { overflow-x: auto; overflow-y: hidden; border-radius: 10px; }
.paper { position: relative; display: inline-block; background: #f4f1ea; border-radius: 10px; padding: 4px 8px; min-width: 100%; }
.cursor {
  position: absolute; top: 18px; left: 8px; width: 2px; height: 110px; background: var(--accent);
  display: none; pointer-events: none;
}
.status { color: var(--text-dim); }
```

`src/notation/NotationView.tsx`:
```tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { transport } from '../audio/transport';
import { TICKS_PER_BAR } from '../model/timing';
import * as actions from '../state/actions';
import { appStore, currentPattern, useApp } from '../state/store';
import styles from './NotationView.module.css';
import { renderNotation, type BarLayout } from './renderNotation';

type VF = typeof import('vexflow/bravura');
let vexflow: Promise<VF> | null = null;

function loadVexFlow(): Promise<VF> {
  if (!vexflow) {
    vexflow = import('vexflow/bravura');
    vexflow.catch(() => {
      vexflow = null;
    });
  }
  return vexflow;
}

export function NotationView() {
  const pattern = useApp(currentPattern);
  const holder = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const layout = useRef<BarLayout[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadVexFlow()
      .then((VF) => {
        if (cancelled || !holder.current) return;
        layout.current = renderNotation(holder.current, pattern, VF);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pattern, attempt]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = cursor.current;
      if (!el) return;
      const ph = transport.playhead();
      const s = appStore.getState();
      const bar = ph && ph.ref.patternId === currentPattern(s).id ? layout.current[ph.ref.barIndex] : undefined;
      if (!ph || !bar) {
        el.style.display = 'none';
        return;
      }
      const x = bar.noteStart + (ph.tick / TICKS_PER_BAR) * (bar.noteEnd - bar.noteStart);
      el.style.display = 'block';
      el.style.transform = `translateX(${x}px)`;
      const sc = scroller.current;
      if (sc && s.ui.follow && (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = x - 60;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const openBar = (e: MouseEvent<HTMLDivElement>) => {
    const holderEl = holder.current;
    if (!holderEl) return;
    const x = e.clientX - holderEl.getBoundingClientRect().left;
    const index = layout.current.findIndex((b) => x >= b.left && x < b.right);
    if (index < 0) return;
    actions.selectBar(index);
    appStore.getState().setUi({ view: 'grid' });
  };

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <h2>Pattern {pattern.name} — notation</h2>
        <span className={styles.hint}>Tap a bar to edit it</span>
        <button onClick={() => appStore.getState().setUi({ view: 'grid' })}>Back to grid</button>
      </div>
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.paper} onClick={openBar}>
          <div ref={holder} data-testid="notation" />
          <div ref={cursor} className={styles.cursor} />
        </div>
      </div>
      {status === 'loading' && <p className={styles.status}>Loading notation…</p>}
      {status === 'error' && (
        <p className={styles.status}>
          Couldn't load notation. <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
        </p>
      )}
    </div>
  );
}
```

In `src/ui/moreMenu.ts`, insert after the `Song` item:
```ts
    { label: 'Notation', checked: view === 'notation', onSelect: setView('notation') },
```

In `src/App.tsx`, import `{ NotationView } from './notation/NotationView'` and add inside `<main>`:
```tsx
        {view === 'notation' && <NotationView />}
```

- [ ] **Step 5: Verify rendering**

Run: `pnpm test && pnpm typecheck && pnpm build`. Then run `pnpm dev` and open ⋯ → Notation on the demo project.
Expected, for pattern B:
- 2 bars on a percussion staff, with hi-hat x noteheads, the snare on the middle line and the kick in the bottom space, stems down.
- Accents above the beat-2 and beat-4 snares, and the ghost snare in parentheses.
- A "3" tuplet over the beat-4 fill.
- In the build output, VexFlow is in its own chunk, separate from the main bundle.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(notation): lazy VexFlow drum notation with tuplets, accents, ghosts and playback cursor"
```

---

### Task 16: Home-screen manifest, icons, end-to-end tests, final verification

**Files:**
- Create: `public/manifest.webmanifest`, `scripts/make-icons.mjs`, `public/icon-192.png`, `public/icon-512.png` (generated)
- Modify: `index.html`, which gains the manifest and Apple meta tags
- Create: `playwright.config.ts`, `e2e/app.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: the whole app; the accessible names from Tasks 11–15.
- Produces: an installable full-screen web app, plus a Playwright suite that runs on WebKit (an iPhone 14 in landscape) and Chromium (a Pixel 7 in landscape).

- [ ] **Step 1: Manifest, meta tags and icons**

`public/manifest.webmanifest`:
```json
{
  "name": "Drum Machine",
  "short_name": "Drums",
  "start_url": "./",
  "scope": "./",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#16161a",
  "theme_color": "#16161a",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

In `index.html`, add inside `<head>`:
```html
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Drums" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./icon-192.png" />
```

`scripts/make-icons.mjs`:
```js
// Renders the app icon to PNGs with Playwright's Chromium: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';

const lit = { 0: '#ff3d6e', 2: '#4fb8e8', 5: '#ff6a3d', 6: '#4fb8e8', 8: '#ff3d6e', 10: '#4fb8e8', 13: '#ff6a3d', 14: '#4fb8e8' };
const cells = Array.from({ length: 16 }, (_, i) => {
  const x = 72 + (i % 4) * 96;
  const y = 72 + Math.floor(i / 4) * 96;
  return `<rect x="${x}" y="${y}" width="80" height="80" rx="16" fill="${lit[i] ?? '#2c2c36'}"/>`;
}).join('');
const svg = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#16161a"/>${cells}</svg>`;

const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg(size)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png` });
  await page.close();
}
await browser.close();
```

Run:
```bash
pnpm exec playwright install chromium webkit
node scripts/make-icons.mjs && file public/icon-192.png public/icon-512.png
```
Expected: the browsers install, and `file` reports two PNG images of the right sizes.

- [ ] **Step 2: Playwright config**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 14 landscape'] } },
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7 landscape'], launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } },
    },
  ],
});
```

If `devices['Pixel 7 landscape']` doesn't exist in this Playwright version, use `devices['Pixel 5 landscape']`.

- [ ] **Step 3: Write the end-to-end tests `e2e/app.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';

const cell = (page: Page, track: string, beat: number, c: number) =>
  page.locator(`[data-track="${track}"][data-beat="${beat}"][data-cell="${c}"]`);

async function openMore(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-cell]').first()).toBeVisible();
});

test('loads the demo groove in landscape', async ({ page }) => {
  await expect(page.locator('[data-cell]')).toHaveCount(11 * 16);
  await expect(page.getByRole('button', { name: 'Pattern' })).toHaveText(/A/);
  await expect(cell(page, 'kick', 0, 0)).toHaveAttribute('data-on', '');
  await expect(page.getByTestId('rotate-overlay')).toBeHidden();
});

test('a tap toggles a note and survives a reload', async ({ page }) => {
  const c = cell(page, 'tom1', 1, 1);
  await c.tap();
  await expect(c).toHaveAttribute('data-on', '');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(cell(page, 'tom1', 1, 1)).toHaveAttribute('data-on', '');
});

test('a vertical drag sets the volume', async ({ page }) => {
  const c = cell(page, 'tom2', 2, 0);
  const box = (await c.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 15, { steps: 3 });
  await page.mouse.move(x, y - 30, { steps: 3 });
  await page.mouse.up();
  await expect(c).toHaveAttribute('aria-label', /volume 125$/);
});

test('copies a bar and pastes it into a new bar', async ({ page }) => {
  await page.getByRole('button', { name: 'Copy' }).click();
  await page.getByRole('button', { name: 'Add bar' }).click();
  await expect(page.getByRole('button', { name: 'Bar 3' })).toHaveAttribute('aria-current', 'true');
  await expect(cell(page, 'crash', 0, 0)).not.toHaveAttribute('data-on', '');
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(cell(page, 'crash', 0, 0)).toHaveAttribute('data-on', '');
});

test('switches a beat to triplets', async ({ page }) => {
  await page.getByRole('button', { name: /^Beat 4:/ }).click();
  await page.getByRole('menuitem', { name: '8th triplets' }).click();
  await expect(page.locator('[data-track="snare"][data-beat="3"]')).toHaveCount(3);
});

test('builds a song', async ({ page }) => {
  await openMore(page, 'Song');
  const steps = page.getByRole('button', { name: /^Step \d+: pattern/ });
  await expect(steps).toHaveCount(2);
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('menuitem', { name: 'Pattern B' }).click();
  await expect(steps).toHaveCount(3);
});

test('renders notation', async ({ page }) => {
  await openMore(page, 'Notation');
  const svg = page.getByTestId('notation').locator('svg');
  await expect(svg).toBeVisible();
  expect(await svg.locator('.vf-stavenote').count()).toBeGreaterThan(10);
});

test('shares a link that opens as a new project', async ({ page, context }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true });
  });
  await openMore(page, 'Share link');
  const url = await page.getByRole('dialog', { name: 'Share link' }).locator('input').inputValue();
  expect(url).toMatch(/#p=[A-Za-z0-9_-]+$/);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByText(/Opened shared beat/)).toBeVisible();
  await expect(other.locator('[data-cell]')).toHaveCount(11 * 16);
  expect(new URL(other.url()).hash).toBe('');
});

test('exports MIDI', async ({ page }) => {
  const download = page.waitForEvent('download');
  await openMore(page, 'Export MIDI');
  expect((await download).suggestedFilename()).toBe('Demo-groove.mid');
});

test('plays and moves the playhead', async ({ page }) => {
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('[data-cell][class*="playing"]').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('asks to rotate', async ({ page }) => {
    await expect(page.getByTestId('rotate-overlay')).toBeVisible();
  });
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm e2e`
Expected: every test passes on both projects. If "plays and moves the playhead" fails only on headless WebKit because no audio device is available (the app shows "Audio could not start"), add `test.skip(browserName === 'webkit', 'headless WebKit has no audio output')` to that test. Record the reason in the commit message. Don't skip it for any other failure.

- [ ] **Step 5: README**

`README.md`:
````markdown
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
````

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm e2e`
Expected: all green.

Then a manual pass, in a browser at an 844×390 touch viewport and, if possible, on a real phone over the LAN via `pnpm dev`. Check:
1. Tap, slide, paint and Volume mode all work, and the bubble shows the value.
2. Play, Loop bar and Follow behave as described in the spec.
3. Switching the kit changes the sound.
4. A 16th-triplet beat plays evenly.
5. Undo and redo work after each kind of edit.
6. Rotating to portrait shows the overlay.
7. "Add to Home Screen" opens full-screen.

Record anything left unverified, such as the real-device check, in the final report.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: installable manifest and icons, Playwright e2e suite, README"
```
