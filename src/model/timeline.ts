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
