import { describe, expect, it } from 'vitest';
import { CHOKE_FADE, Choker } from './choke';

class FakeParam {
  calls: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) { this.calls.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push(['ramp', v, t]); return this; }
}
const param = () => new FakeParam();
const asParam = (p: FakeParam) => p as unknown as AudioParam;

describe('Choker', () => {
  it('fades out a ringing open hi-hat when a closed hi-hat plays', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('hhClosed', 1);
    expect(p.calls).toEqual([['set', 1, 1], ['ramp', 0, 1 + CHOKE_FADE]]);
  });

  it('also chokes from the pedal hi-hat', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('hhPedal', 0.5);
    expect(p.calls).toHaveLength(2);
  });

  it('ignores voices that start later or have already ended', () => {
    const c = new Choker();
    const later = param();
    const ended = param();
    c.register('hhOpen', asParam(later), 2, 3);
    c.register('hhOpen', asParam(ended), 0, 0.5);
    c.trigger('hhClosed', 1);
    expect(later.calls).toEqual([]);
    expect(ended.calls).toEqual([]);
    c.trigger('hhClosed', 2.5);
    expect(later.calls).toHaveLength(2);
  });

  it('chokes each voice only once', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('hhClosed', 1);
    c.trigger('hhClosed', 1.5);
    expect(p.calls).toHaveLength(2);
  });

  it('ignores tracks that choke nothing', () => {
    const c = new Choker();
    const p = param();
    c.register('hhOpen', asParam(p), 0, 2);
    c.trigger('snare', 1);
    expect(p.calls).toEqual([]);
  });
});
