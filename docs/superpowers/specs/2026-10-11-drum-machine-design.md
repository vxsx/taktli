# Drum Machine — Design Spec

Date: 2026-10-11
Status: Approved in conversation (sections 1–2 explicitly; sections 3–4 delegated: "if any questions arise do what you would recommend")

## 1. Intent

A small web-based step-sequencer drum machine in the spirit of Little Drum Machine and drumbit.app, with **phone usability as the primary focus**.

- **Primary use:** sketching beat ideas on the go.
- **Secondary use:** learning drums. A read-only sheet-music notation view is a plus.
- **Success looks like:** on a phone held in landscape, you can quickly enter a groove with nuanced dynamics (accents, ghost notes), arrange patterns into a song, and come back to it later or send it to someone.

### Decisions made with the user

| Topic | Decision |
|---|---|
| Orientation | **Landscape only.** Portrait shows a "rotate your phone" prompt. |
| Grid | All 16 steps (one bar) visible, cells stretch to use the **full horizontal space**. |
| Volume editing | Default: **tap toggles, press + vertical slide sets volume**. Plus a **Volume mode** where touch height sets volume and dragging across a row draws a curve. |
| Sounds | **Two switchable kits** sharing the same tracks: acoustic (samples from "Big Rusty Drums" by Karoryfer Samples, CC0 1.0) and electronic (synthesized). |
| Structure | **Patterns + song chain.** Each pattern has 1..N bars, and the song is an ordered list of pattern references. |
| Time | 4/4, 4 beats per bar. **Each beat** can be 16ths (4 cells), 8th triplets (3) or 16th triplets (6). Per-pattern swing. |
| Save/share | Autosave on device, **share via link**, **export MIDI**. No PWA/offline, no audio export. |
| Stack | **React + TypeScript + Vite.** |

### Decisions made by Claude under delegation (review welcome)

- Fixed set of 11 tracks in notation order. Tracks can be muted or hidden per project.
- Horizontal drag paints or erases notes along a row (direction lock picks paint vs. volume slide).
- Undo/redo for all project edits.
- Web app manifest for full-screen "Add to Home Screen" (no service worker).
- Zustand + Immer for state; VexFlow for notation (lazy-loaded).
- A demo project on first launch.
- Screen wake lock while playing; iOS silent-switch workaround.

### Out of scope for v1

Time signatures other than 4/4, custom/user samples, per-track mixer, audio (WAV) export, offline mode/service worker, accounts or cloud sync, editable notation, MIDI input.

## 2. Features and data model

### 2.1 Tracks (fixed, notation order top→bottom)

| id | Label | GM note | Notation (percussion clef) | Voice |
|---|---|---|---|---|
| `crash` | Crash | 49 | A5, x notehead | hands |
| `ride` | Ride | 51 | F5, x notehead | hands |
| `hhOpen` | Open HH | 46 | G5, x notehead + "o" above | hands |
| `hhClosed` | Closed HH | 42 | G5, x notehead | hands |
| `hhPedal` | Pedal HH | 44 | D4, x notehead | feet |
| `snare` | Snare | 38 | C5, normal | hands |
| `crossStick` | Cross-stick | 37 | C5, circled-x (or x) notehead | hands |
| `tom1` | Tom 1 | 48 | E5, normal | hands |
| `tom2` | Tom 2 | 45 | D5, normal | hands |
| `floorTom` | Floor Tom | 43 | A4, normal | hands |
| `kick` | Kick | 36 | F4, normal | feet |

- **Choke group:** `hhClosed` and `hhPedal` cut off a ringing `hhOpen`.
- Each track also defines a display color and a short label for compact UIs.

### 2.2 Types

```ts
type TrackId = 'crash' | 'ride' | 'hhOpen' | 'hhClosed' | 'hhPedal' | 'snare'
             | 'crossStick' | 'tom1' | 'tom2' | 'floorTom' | 'kick';
type Subdivision = 4 | 3 | 6;           // 16ths | 8th triplets | 16th triplets
type Velocity = number;                  // integer 0..127, 0 = no note

interface Beat {
  div: Subdivision;
  cells: Record<TrackId, Velocity[]>;   // every array has length === div
}
interface Bar { id: string; beats: [Beat, Beat, Beat, Beat]; }
interface Pattern { id: string; name: string; swing: number /* 0..100 */; bars: Bar[] /* length >= 1 */; }
interface SongStep { id: string; patternId: string; }
interface TrackSettings { muted: boolean; hidden: boolean; }
interface Project {
  version: 1;
  id: string;
  name: string;
  bpm: number;                           // integer 40..240
  kit: 'acoustic' | 'electronic';
  patterns: Pattern[];                   // length >= 1
  song: SongStep[];                      // may be empty
  tracks: Record<TrackId, TrackSettings>;
  createdAt: number; updatedAt: number;
}
```

### 2.3 Timing

- **Tick grid:** `TICKS_PER_BEAT = 12` (LCM of 4, 3, 6), so 48 ticks per bar.
  - Cell `i` of a beat with subdivision `div` sits at tick `beatIndex*12 + i*(12/div)`.
  - Playback, MIDI export and notation all derive from this.
- **Changing a beat's subdivision** maps each existing note to the nearest new cell by tick. If two notes land on the same cell, the louder one wins. Undo restores the original.
- **Swing** (per pattern, 0–100%) applies only to beats with `div === 4`.
  - The off-beat 16ths (cells 1 and 3, ticks 3 and 9) are delayed by `1.5 * swing/100` ticks.
  - So 0 is straight, about 67% is a triplet shuffle, and 100% is a hard swing (MPC "75%").
- **Velocity → gain:** `gain = (v/127)^1.6`.
  - New notes default to 100.
  - Notation shows `v >= 110` as an **accent** and `v <= 45` as a **ghost note**.

### 2.4 Operations (all pure functions over `Project`, all undoable)

- **Notes:**
  - set the velocity of a cell
  - clear a row in a bar
  - set a beat's subdivision
- **Bars** (within a pattern):
  - add at end, insert after, duplicate, delete (not the last one)
  - move (reorder), clear
  - paste from the bar clipboard (replaces the target bar's contents)
- **Bar clipboard:**
  - Copy a bar to a clipboard kept in localStorage, so it works across patterns and projects.
  - Paste replaces the current bar's contents. "Paste as new bar" inserts it after the current bar instead.
- **Patterns:**
  - add (empty, 1 bar, next free name in the sequence A…Z, AA, AB, …)
  - duplicate, rename, delete (not the last one; also removes its song steps)
  - set swing
- **Song:**
  - append, insert, remove and move steps
  - change a step's pattern
- **Project settings:**
  - set BPM, name, kit
  - toggle track mute or hide

### 2.5 Playback

- **Pattern mode** loops the current pattern's bars. **Loop bar** (toggle) loops only the bar being edited.
- **Song mode** plays the song steps in order (each step = all bars of that pattern), then loops. It's disabled with a hint when the song is empty.
- **Edits during playback** apply live. The scheduler reads the latest project state on every lookahead tick.
- **Structural edits during playback** (bars or steps removed) clamp the play cursor to a valid position.
- **Muted tracks** are skipped by the scheduler. **Hidden** tracks still play — hiding only frees grid space; the Show/hide menu marks hidden tracks that contain notes in the current pattern.

### 2.6 Persistence and sharing

- **Autosave:**
  - Saved to localStorage, debounced about 500ms after every change.
  - Keys:
    - `dm:index` lists `{id, name, updatedAt}`.
    - `dm:project:<id>` holds the project JSON.
    - `dm:last` holds the last opened project id.
    - `dm:clipboard` holds the copied bar.
- **Projects sheet:** new, open, rename, duplicate, delete.
  - The first launch creates a **demo project** at 96 BPM: pattern A (2-bar rock groove, crash on bar 1), pattern B (a groove bar, then a bar with a triplet fill on beat 4), and song `A B`.
- **Share link:**
  - Format: `…/#p=<payload>`. The payload is compact JSON, compressed with `CompressionStream('deflate-raw')` and base64url-encoded.
  - Opening such a link validates it, imports it as a **new project** (it never overwrites one), opens it, and clears the hash.
  - A Web Share API sheet is used where available; otherwise the link is copied to the clipboard.
- **MIDI export:**
  - Standard MIDI file, format 0, 480 PPQ, channel 10, GM notes as in 2.1. Includes tempo and 4/4 time-signature meta events.
  - Swing is baked into note times so it sounds like the app.
  - Exports the song if it isn't empty, otherwise the current pattern. Muted tracks are excluded.
  - Downloaded as `<project-name>.mid`.

## 3. Screens and interactions (landscape)

### 3.1 Global

- `viewport-fit=cover`, and the layout pads with `env(safe-area-inset-*)`.
- A full-height layout using `100dvh`, with a dark theme.
- **Portrait** (`orientation: portrait` media query) shows a full-screen "Rotate your phone" overlay.
- Desktop browsers work too: mouse uses the same pointer events. Space toggles play/stop, and Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z undo/redo.
- The audio context is created and resumed on the first user gesture.
  - On iOS, it sets `navigator.audioSession.type = 'playback'` where supported, so sound plays with the silent switch on. Older iOS falls back to looping a silent `<audio>` element.
- The screen **wake lock** is held while playing (where supported).
- **Toasts** show non-blocking errors and confirmations.

### 3.2 Editor (main screen)

- **Top bar (about 40px):**
  - Play/Stop.
  - **BPM** opens a popover with a slider, ±1 buttons and **tap tempo** (average of the last 4 taps, reset after 2s idle).
  - **Kit** toggle (Acoustic/Electronic).
  - **Pattern picker** `A ▾`: switches pattern, plus add / duplicate / rename / delete.
  - **Pattern/Song** playback toggle.
  - **Notes/Volume** mode toggle.
  - **Undo/Redo.**
  - **`⋯` menu:** Projects, Swing (slider for the current pattern), Song view, Notation view, Show/hide tracks, Share link, Export MIDI.
- **Beat header:** beat numbers 1–4 above the grid, each spanning its beat group. Tapping one opens a picker: 16ths / 8th triplets / 16th triplets.
- **Grid:**
  - **Layout:** each visible track is a row: a label column (about 64px) and 4 beat groups of equal width with a small gap between them. Cells inside a group flex to fill it (4, 3 or 6 per beat).
    - Rows share the available height; the minimum row height is 28px.
    - When the rows don't fit, the track area scrolls vertically. The **label column is the scroll handle**: it has `touch-action: pan-y`, while the cells use `touch-action: none` so gestures stay unambiguous.
  - **Cell rendering:** volume shows as a colored fill whose height is the velocity. Alternate beat groups get a slightly different background. The playing column gets a highlight.
  - **Track label:** tap to audition the sound. Long-press opens a menu: Mute, Hide, Clear row (in this bar). Muted rows are dimmed.
- **Bottom strip (about 32px):**
  - Bar chips `1 … N` that scroll horizontally. The current bar is outlined and the playing bar is marked.
  - `+` adds a bar. Long-press and drag a chip to reorder.
  - Actions: **Loop bar** toggle, **Copy**, **Paste** (long-press: "Paste as new bar"), **Duplicate**, **Clear**, **Delete**.
  - **Follow** (default on): during playback the editor shows the playing bar, and in Song mode the playing pattern too. Tapping a bar chip during playback turns Follow off. A Follow button turns it back on.

### 3.3 Grid gestures

All pointer-event based. These work identically for touch and mouse.

**Notes mode (default):**
- **Tap** (released before moving 8px): toggles the note. A new note gets velocity 100.
- **Vertical drag** (moves past 8px, mostly vertical):
  - Volume slide on the starting cell: `v = clamp(start + dy * 127/150px, 1, 127)`. On an empty cell it starts at 100 and creates the note.
  - A **bubble** above the finger shows a meter and the value.
- **Horizontal drag** (moves past 8px, mostly horizontal): paints along the starting row. Starting on an empty cell adds notes (v=100) to every cell passed; starting on a note erases every cell passed.
- **Audition:** while stopped, any note that's turned on plays its sound once at its velocity.

**Volume mode:**
- Touching or dragging over an existing note sets `v = 1 + round((1 - yFraction) * 126)`, where `yFraction` is the touch height inside the cell. Empty cells are ignored.
- Dragging is limited to the starting row. The bubble shows the value.

**Gestures and history:** one gesture = one undo entry. Intermediate values during a drag are applied as transient state and committed once on pointer up.

### 3.4 Song view

- Replaces the grid. Song steps appear as a horizontally scrollable row of chips (pattern name + bar count).
- `+` appends a step through a pattern picker. Tapping a chip opens a menu: change pattern, duplicate, remove. Long-press and drag reorders.
- During song playback the playing chip is highlighted with a progress indicator.
- An "Edit pattern" shortcut on a chip opens the editor on that pattern.

### 3.5 Notation view

- Replaces the grid. It shows the current pattern's bars as **one horizontally scrollable staff line**: percussion clef, 4/4, two voices (hands stems up, feet stems down).
- **Beams** group notes per beat. Triplet beats get tuplet brackets ("3" for 8th triplets, "6" for 16th triplets).
- Accent and ghost markings come from velocity; ghost notes are drawn in parentheses. The open hi-hat gets an "o".
- A cursor follows playback and auto-scrolls. Tapping a bar opens the grid on that bar.
- The view is read-only. VexFlow is loaded lazily the first time the view opens.
- Notation is written straight; swing is not notated. When the pattern's swing is above 0, a "Swing NN%" text marking appears above the staff.
- Hidden tracks still appear in notation, since hiding only affects the grid. Muted tracks appear too, since mute is a playback setting.

### 3.6 Projects sheet

- A list sorted by last updated, showing name and date.
- Actions: New (empty project: pattern A with 1 empty bar, 100 BPM, acoustic), Open, Rename, Duplicate, Delete (with confirmation).
- The current project is marked.

## 4. Architecture

```
src/
  model/            pure TypeScript, no React/DOM — the testable core
    tracks.ts         TRACKS table (2.1), track order, choke groups
    types.ts          types from 2.2
    timing.ts         tick math, subdivision conversion, swing offsets
    factory.ts        createProject/Pattern/Bar/Beat, demo project, ids
    ops.ts            all edit operations (2.4), Immer-based, pure
    timeline.ts       playback sequence building + cursor clamping (2.5)
    validate.ts       unknown JSON → Project (clamps, defaults, rejects garbage)
  audio/
    context.ts        AudioContext lifecycle, unlock, iOS audio session, master chain
    scheduler.ts      lookahead scheduler (25ms timer, ~120ms lookahead) → kit.play();
                      publishes the playhead (pattern, bar, tick) to a tiny observable
    kits/types.ts     interface Kit { load(); play(track, time, velocity); choke(track, time) }
    kits/acoustic.ts  sample kit: fetch + decodeAudioData from /kits/acoustic/*.mp3
    kits/electronic.ts synthesized voices (oscillators + noise + filters + envelopes)
  io/
    storage.ts        localStorage projects/index/clipboard, debounced autosave, quota errors
    share.ts          Project ↔ URL payload (compact form + deflate-raw + base64url)
    midi.ts           SMF writer
  notation/
    toNotation.ts     pure: Bar → per-voice note/rest/tuplet/beam descriptors
    NotationView.tsx  React + VexFlow rendering (lazy chunk)
  state/
    store.ts          Zustand store: project, undo/redo history, transient gesture state,
                      UI state (current pattern/bar, view, edit mode, play mode, loop, follow)
  ui/
    App.tsx, TopBar, BeatHeader, Grid, Cell, TrackLabel, BarStrip, SongView,
    ProjectsSheet, BpmPopover, Menu, Toasts, RotateOverlay, VolumeBubble
    gestures.ts       pure gesture classifier/state machine (3.3) used by Grid
public/
  kits/acoustic/*.mp3 + LICENSE-samples.md
  manifest.webmanifest, icons
```

**Key boundaries**
- **`model/`** knows nothing about React, audio or the DOM. Everything else depends on it.
- **The store** wraps `model/ops` and adds history:
  - `past`/`future` stacks of Project snapshots (Immer gives structural sharing), capped at 200 entries.
  - `beginTransient()` / `updateTransient()` / `commitTransient()` coalesce a gesture into one entry.
  - Switching projects clears the history.
- **The scheduler** reads `store.getState().project` on each tick. It doesn't subscribe to React.
  - It publishes the playhead to an observable.
  - The **Grid and NotationView update the playhead highlight from a `requestAnimationFrame` loop, writing to the DOM directly** (toggling a class on the current column) without React re-renders.
- **Grid cells** are memoized components that select only their own velocity. A drag re-renders only the cells it touches.
- **Kits** share one interface. Switching kit swaps the instance; the acoustic kit loads lazily the first time it's selected and stays cached.

**Dependencies:**
- Runtime: `react`, `react-dom`, `zustand`, `immer`, `vexflow` (lazy).
- Dev: `vite`, `typescript`, `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`.
- No UI kit; styling is plain CSS modules with CSS variables.

## 5. Error handling

| Situation | Behavior |
|---|---|
| Acoustic sample fails to load/decode | Toast "Couldn't load acoustic kit — using electronic". Switch the kit to electronic for this session. |
| Audio context can't start | The play button shows an error toast with a hint to tap again; the app stays usable for editing. |
| localStorage unavailable / quota exceeded | Toast "Can't save on this device — changes are kept until you close the page". The app keeps working in memory. |
| Corrupt stored project | Skip it in the index, log a console warning, and show a toast once. |
| Invalid/corrupt share link | Toast "This link is invalid or damaged". The current project is unchanged and the hash is cleared. |
| `CompressionStream` unsupported | The Share action shows a toast that the browser is too old. Opening links shows the same message. |
| Notation chunk fails to load | An inline message in the notation view with a Retry button. |
| Delete last bar / last pattern | Disabled in the UI and a no-op in the ops (guarded twice). |

## 6. Testing

- **Unit (Vitest):**
  - `timing` (tick math, subdivision conversion with collisions, swing offsets)
  - `ops` (every operation plus invariants: array lengths match `div`, ≥1 bar, ≥1 pattern, song references valid)
  - `timeline` (pattern/song/loop-bar sequences, cursor clamping)
  - `validate` (garbage in → rejection; partial → defaults)
  - `share` (round trip, tamper detection)
  - `midi` (header bytes, event timing incl. swing, channel 10, note numbers)
  - `toNotation` (durations/rests for every 16th combination, triplet beats, accents/ghosts, voice split)
  - `gestures` (classifier: tap vs. vertical vs. horizontal, thresholds)
  - store history (gesture coalescing, undo/redo, cap)
- **Scheduler:** unit-tested with a fake clock and a fake kit that records `(track, time, velocity)` to check timing, swing and mute.
- **Component tests** (Testing Library + jsdom) for the Grid's tap/drag behavior driven by pointer events.
- **E2E (Playwright)** with an iPhone 14 landscape viewport, on WebKit and Chromium:
  - load the demo project, tap cells, volume slide, paint, add/copy/paste a bar
  - switch pattern, build a song, open notation (it renders an SVG)
  - share link round trip in a new page, MIDI download, rotate overlay in portrait
  - Audio output is not asserted. The tests only check that play starts and the playhead advances.
- **Manual check** on a real iPhone (Safari) before calling v1 done: timing feel, gestures, the silent switch, and Add to Home Screen.
