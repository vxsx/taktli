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
