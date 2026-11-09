import { ACCENT_MIN, GHOST_MAX, TICKS_PER_BEAT, velocityAt } from '../model/timing';
import { TRACK_BY_ID, TRACK_IDS } from '../model/tracks';
import type { Bar, Beat, TrackId, Velocity } from '../model/types';

export type NoteDur = 'q' | '8d' | '8' | '16d' | '16' | '32';

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
  events: NotationEvent[];
}

export interface NotationBar {
  hands: NotationBeat[];
  feet: NotationBeat[];
  feetEmpty: boolean;
}

type Voice = 'hands' | 'feet';

/** Lengths in 32nds that one note value can show. */
const DUR: Record<number, NoteDur> = { 1: '32', 2: '16', 3: '16d', 4: '8', 6: '8d', 8: 'q' };
const HALF_BEAT = TICKS_PER_BEAT / 2;

/** A span of 5 or 7 32nds has no single note value, so it is cut at the half beat; others stay whole. */
function pieces(start: number, end: number): number[] {
  const len = end - start;
  return len === 5 || len === 7 ? [HALF_BEAT - start, end - HALF_BEAT] : [len];
}
const QUARTER_REST: NotationBeat = { events: [{ duration: 'q', rest: true, hits: [] }] };

/** Hits on one 32nd of a beat: even slots are cells (or left halves), odd slots right halves. */
function hitsAt(beat: Beat, slot: number, voice: Voice): NotationHit[] {
  const cell = slot >> 1;
  const half = (slot & 1) as 0 | 1;
  return TRACK_IDS.filter((t) => TRACK_BY_ID[t].notation.voice === voice && velocityAt(beat, t, cell, half) > 0).map((t) => ({
    track: t,
    velocity: velocityAt(beat, t, cell, half),
  }));
}

function beatEvents(beat: Beat, voice: Voice): NotationBeat {
  const slots = Array.from({ length: TICKS_PER_BEAT }, (_, i) => hitsAt(beat, i, voice));
  if (slots.every((s) => s.length === 0)) return { events: [...QUARTER_REST.events] };

  // Each note lasts until the next one in its voice, or the end of the beat.
  const onsets = slots.flatMap((hits, i) => (hits.length > 0 ? [i] : []));
  const events: NotationEvent[] = [];
  const rest = (len: number) => events.push({ duration: DUR[len], rest: true, hits: [] });
  if (onsets[0] > 0) pieces(0, onsets[0]).forEach(rest);
  onsets.forEach((start, k) => {
    const [note, after] = pieces(start, onsets[k + 1] ?? TICKS_PER_BEAT);
    events.push({ duration: DUR[note], rest: false, hits: slots[start] });
    if (after) rest(after);
  });
  return { events };
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
