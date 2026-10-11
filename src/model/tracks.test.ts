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
