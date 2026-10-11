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
