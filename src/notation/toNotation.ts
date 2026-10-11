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
