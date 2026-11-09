import { barNotes, buildTimeline } from '../model/timeline';
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../model/timing';
import { TRACK_BY_ID } from '../model/tracks';
import type { Project } from '../model/types';

export const PPQ = 480;
const MIDI_PER_GRID_TICK = PPQ / TICKS_PER_BEAT; // 60, a 32nd
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

  const hits: { time: number; note: number; velocity: number }[] = [];
  refs.forEach((ref, k) => {
    for (const n of barNotes(p, ref)) {
      const time = k * BAR_LENGTH + Math.round((n.tick + n.offset) * MIDI_PER_GRID_TICK);
      hits.push({ time, note: TRACK_BY_ID[n.track].midi, velocity: Math.max(1, n.velocity) });
    }
  });
  hits.sort((a, b) => a.time - b.time);

  // A note ends after NOTE_LENGTH, or earlier when the same drum plays again (a 32nd later, say), so it never overlaps itself.
  const events: TimedEvent[] = [];
  const nextOn = new Map<number, number>(); // note → time it plays next, walking backwards
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    const next = nextOn.get(h.note);
    const end = Math.min(h.time + NOTE_LENGTH, next !== undefined && next > h.time ? next : Infinity);
    events.push({ time: h.time, order: 1, bytes: [0x99, h.note, h.velocity] });
    events.push({ time: end, order: 0, bytes: [0x89, h.note, 0x40] });
    nextOn.set(h.note, h.time);
  }
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
