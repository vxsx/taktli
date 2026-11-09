import { describe, expect, it } from 'vitest';
import { createBar } from '../model/factory';
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

});

describe('32nd notes', () => {
  /** Puts a note on each 32nd slot of one beat: even slots are cells, odd slots right halves (the cell gets split). */
  function beatWith(track: TrackId, slots: Record<number, number>): Bar {
    const b = createBar();
    for (const [slot, v] of Object.entries(slots).map(([k, v]) => [Number(k), v])) {
      const cell = slot >> 1;
      if (slot & 1) b.beats[0].splits[track][cell] = v;
      else b.beats[0].cells[track][cell] = v;
    }
    return b;
  }
  const SIZE: Record<string, number> = { '32': 1, '16': 2, '16d': 3, '8': 4, '8d': 6, q: 8 };

  it('writes a ghost pickup on the last 32nd', () => {
    const b = createBar();
    b.beats[0].cells.hhClosed[0] = 100;
    b.beats[0].cells.hhClosed[2] = 80;
    b.beats[0].splits.snare[3] = 38;
    const n = toNotation(b);
    expect(durs(n.hands[0])).toEqual(['8', '16d', '32']);
    expect(n.hands[0].events[2].hits).toEqual([{ track: 'snare', velocity: 38 }]);
  });

  it('writes a split cell with only its left half like a plain 16th', () => {
    const b = bar([[0, 'snare', 1]]);
    b.beats[0].splits.snare[1] = 0;
    expect(durs(toNotation(b).hands[0])).toEqual(durs(toNotation(bar([[0, 'snare', 1]])).hands[0]));
  });

  it('splits a 5-32nd note at the half beat', () => {
    expect(durs(toNotation(beatWith('snare', { 3: 90 })).hands[0])).toEqual(['16dr', '32', '8r']);
  });

  it('splits a leading 7-32nd rest at the half beat', () => {
    expect(durs(toNotation(beatWith('snare', { 7: 90 })).hands[0])).toEqual(['8r', '16dr', '32']);
  });

  it('every beat adds up to one quarter for any mix of cells and halves', () => {
    for (let mask = 0; mask < 256; mask++) {
      const slots: Record<number, number> = {};
      for (let s = 0; s < 8; s++) if (mask & (1 << s)) slots[s] = 90;
      const events = toNotation(beatWith('snare', slots)).hands[0].events;
      const total = events.reduce((n, e) => n + SIZE[e.duration], 0);
      expect(total, `mask ${mask.toString(2)}`).toBe(8);
      expect(events.filter((e) => !e.rest).length, `mask ${mask.toString(2)}`).toBe(Object.keys(slots).length);
    }
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
