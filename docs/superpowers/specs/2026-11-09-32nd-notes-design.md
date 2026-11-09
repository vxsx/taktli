# 32nd notes by splitting cells; triplets removed

Date: 2026-11-09. Status: design, approved in conversation. It replaces the per-beat triplet parts of `2026-10-11-drum-machine-design.md`.

## Why

The user wants to write the quick soft notes drummers play around a groove:

- **Pickup** (the main case): a ghost snare one 32nd before the backbeat.
- **Double:** two quick hits inside one 16th.

Today the only workaround is halving the groove and doubling the BPM. That doubles the bars and breaks the notation.

Per-beat triplets also annoy the user. Switching a beat to triplets moves every track's notes in that beat, so the hi-hat gets dragged along when only the snare should change. The user decided to **remove triplets entirely for now**.

## Goals

- Any 16th cell on any track can be **split into two 32nd halves**. Each half works like a normal cell.
- Only the split cell changes. Other tracks, and other cells of the same track, keep their size and position.
- Playback, MIDI export, share links, notation, bar thumbnails, copy/paste and undo all handle the halves.
- Triplets are removed from the app. Old projects and links that contain triplets still open.

## Non-goals

- Triplets on a single track, or 32nd triplets. The user may want to come back to per-track triplets later.
- Splitting a cell into more than two parts, flams or grace notes.
- The Random button writing 32nds (it keeps writing plain 16ths).
- An in-app hint that teaches the hold gesture.

## Anti-goals (a failure even if it works)

- A 16th groove sounds, looks or reads in notation any different after this change. Only beats that had triplets may change.
- Splitting or editing one track moves or resizes anything on another track.
- Holding interferes with tap, slide or paint. A finger that moves before the hold fires must behave exactly as today.

## Constraints

- Phone first, in landscape. All default rows must still fit at about 750×340 in Safari, and rows stay at least 24px tall. Desktop must also work, including mouse input.
- Existing test layers stay green: Vitest unit and component tests, and the Playwright e2e suite (including the `@desktop` project).
- Saved projects live in localStorage as `Project` `version: 1`. They must still load after the change, with no data loss outside triplet beats.

## Decided by the user

1. **Splitting happens per cell**, and **holding a cell splits it**. This is option A from the mockup; the alternative was a global "32nds" switch.
   - Press and hold a cell for about half a second (reuse `LONG_PRESS_MS` = 450) without moving past the drag threshold, and it splits into two halves.
   - The existing note stays in the left half and the right half starts empty.
   - Holding a split cell merges it back. The left half's note stays and the right half's note is removed.
   - The hold fires while the finger is still down, and lifting the finger afterwards does nothing.
   - A cell that is being held shows an accent-colored outline (`--accent`) that fades in over the hold time.
   - A split cell is drawn as two equal halves with a 2px gap between them. Each half has its own volume fill in the track color, like a normal cell.
2. **A split cell stays split until it is merged**, even when its right half is empty, so the user can split a cell and then tap the right half.
3. **New notes in a right half start at ghost volume.** All other new notes start at 100 as today.
4. **Triplets are removed:** the subdivision picker in the beat header goes away, and so does every triplet code path.

## Decided by Claude (review welcome)

- **Split state is part of the project.** It is saved, undoable (a split or merge is one undo step), copied with bars and duplicated patterns, and included in share links.
- **Ghost volume for new right-half notes is 40.** The ghost threshold `GHOST_MAX` is 45, so notation marks the note as a ghost.
- **Gestures on a split cell:**
  - Tap or slide acts on the half under the finger. A slide that starts on an empty right half starts from 40.
  - Paint and Volume mode treat each half as its own cell. Painting never splits or merges a cell.
  - A paint that adds notes writes 100 into whole cells and left halves, and 40 into right halves. A paint that erases clears everything it passes.
  - In Volume mode, holding does not split, because a press there already edits volume straight away.
- **Clear bar and Clear row merge every split cell they clear**, so a cleared bar is the same as a new one.
- **Swing:** a right half plays midway between its own cell's swung start and the next cell's swung start.
  - Only off-beat 16ths swing. Cells 1 and 3 move later by `s`, and the next beat's cell 0 never moves.
  - So every right half ends up exactly `s/2` later than its straight position.
  - Left halves and unsplit cells swing exactly as today.
- **Old triplet beats convert to 32nds** wherever a project is read (localStorage, old share links). Each triplet note moves to the nearest 32nd position:
  - 8th triplets (3 cells) land on 32nds 0, 3 and 5 of the beat.
  - 16th triplets (6 cells) land on 32nds 0, 1, 3, 4, 5 and 7.
  - No two notes collide, so nothing is lost. Cells that get a note in their right half become split.
  - When a converted project or link opens, show a toast once: "Triplets were replaced by the nearest 32nds".
- **The previous version must still be able to read saved projects, as plain 16ths.**
  - Why: the app has no service worker, so a tab or home-screen app left open keeps running old code. Today's `parseBeat` repairs anything it reads and would scramble a different layout. If that tab then saved, it would overwrite a good project.
  - How: keep each track's 4 cell values in `Beat.cells` as they are now (they mean whole cells and left halves). Store the split state and the right-half volumes in a new field that the old parser ignores. Either drop `div` or always write `4`, because the old parser treats a missing `div` as 4.
  - With this, an old tab shows the groove without its 32nds. It only loses them if it saves.
- **Share links get a new compact format version (v2).** v1 links must still decode, with triplet beats converted as above. Old code rejecting a v2 link as damaged is acceptable.
- **Notation:**
  - Tuplets are removed, and durations and rests work at 32nd resolution within a beat.
  - As today, a note lasts until the next note in its voice or the end of the beat. A span of 1, 2, 3, 4, 6 or 8 32nds is written as one value: 32nd, 16th, dotted 16th, 8th, dotted 8th or quarter.
  - A span of 5 or 7 32nds is split at the half beat: the note runs up to the half beat (or starts there), and a rest fills the remainder. Leading rests of 5 or 7 split the same way. For example:
    - A note on 32nd 3 with nothing after it becomes a 32nd note and an 8th rest.
    - A first note on 32nd 7 gets an 8th rest and a dotted 16th rest before it.
  - Beaming stays per beat, and accents and ghosts work as today.
  - A split cell with only its left half on reads exactly like today's 16th note.
- **MIDI export:** notes go at their 32nd times with the swing rule above. Note length stays as today, and for right halves it is capped so it doesn't run past the next 32nd.
- **Bar thumbnails** draw right-half notes at their 32nd position and half the width.
- **The playhead** highlights the cell that contains the current time, as today. In a split cell it highlights the half that is playing.
- **The Random button** writes plain 16ths and leaves every cell it writes unsplit.
- **The demo project** loses its triplet fill.
  - Bar 2 of pattern B gets a 16th snare and tom fill on beat 4 that uses at least one 32nd double.
  - Pattern B's groove bar gets a ghost pickup into the backbeat on beat 2.
  - The exact notes are up to the builder.
- **Text that mentions triplets** is updated: the Swing sheet hint (`src/ui/SwingSheet.tsx`), the README feature list and the beat header. The beat numbers stay, but they are no longer buttons.

## Left to the builder

- **The exact data shape**, within the storage rule under "Decided by Claude".
- **Timing constants.** Moving the tick grid from 12 to 8 ticks per beat is expected, but not required.
- Vibration on hold (`navigator.vibrate` where it is supported), and other small polish.
- How to split the work into commits, and which tests to add, following the existing test layout.
