import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../model/factory';
import { projectProblems } from '../model/invariants';
import * as ops from '../model/ops';
import type { Project } from '../model/types';
import { decodeShare, encodeShare, fromCompact, payloadFromHash, ShareError, shareUrl, toCompact } from './share';

/** Strip ids and timestamps, which are intentionally not preserved. */
function shape(p: Project) {
  const nameOf = (id: string) => p.patterns.find((x) => x.id === id)!.name;
  return {
    name: p.name, bpm: p.bpm, kit: p.kit, tracks: p.tracks,
    patterns: p.patterns.map((x) => ({ name: x.name, swing: x.swing, bars: x.bars.map((b) => b.beats) })),
    song: p.song.map((s) => nameOf(s.patternId)),
  };
}

function richProject(): Project {
  let p = createDemoProject();
  p = ops.setTrackMuted(p, 'ride', true);
  p = ops.setTrackHidden(p, 'tom2', true);
  p = ops.setSwing(p, p.patterns[0].id, 57);
  p = ops.setKit(p, 'electronic');
  p = ops.setBpm(p, 133);
  p = ops.setBeatDiv(p, p.patterns[0].id, 1, 2, 6);
  p = ops.setVelocity(p, p.patterns[0].id, 1, 2, 'snare', 5, 127);
  return p;
}

describe('share codec', () => {
  it('round-trips a project through the compact form', () => {
    const p = richProject();
    expect(shape(fromCompact(JSON.parse(JSON.stringify(toCompact(p)))))).toEqual(shape(p));
  });

  it('round-trips through an encoded payload with a URL-safe alphabet', async () => {
    const p = richProject();
    const payload = await encodeShare(p);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(payload);
    expect(shape(back)).toEqual(shape(p));
    expect(projectProblems(back)).toEqual([]);
    expect(back.id).not.toBe(p.id);
  });

  it('round-trips a large project and stays compact', async () => {
    let p = createDemoProject();
    for (let i = 0; i < 8; i++) p = ops.duplicatePattern(p, p.patterns[0].id, `dup${i}`);
    for (const [i, pat] of p.patterns.entries()) {
      for (let b = 0; b < 14; b++) p = ops.duplicateBar(p, pat.id, 0, `${pat.id}-${b}`);
      p = ops.setVelocity(p, pat.id, 3, 1, 'tom1', 2, 64 + i);
    }
    const payload = await encodeShare(p);
    expect(payload.length).toBeLessThan(8000);
    expect(shape(await decodeShare(payload))).toEqual(shape(p));
  });

  it('rejects garbage, truncated and tampered payloads with ShareError', async () => {
    const payload = await encodeShare(createDemoProject());
    await expect(decodeShare('!!!')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeShare('aGVsbG8')).rejects.toBeInstanceOf(ShareError);
    await expect(decodeShare(payload.slice(0, payload.length / 2))).rejects.toBeInstanceOf(ShareError);
    const compact = toCompact(createDemoProject());
    compact.p[0][2][0][0] = '4abc';
    expect(() => fromCompact(compact)).toThrow(ShareError);
    expect(() => fromCompact({ v: 2 })).toThrow(ShareError);
  });

  it('builds and parses share URLs', () => {
    expect(shareUrl('abc_-1', 'https://x.dev/dm/')).toBe('https://x.dev/dm/#p=abc_-1');
    expect(payloadFromHash('#p=abc_-1')).toBe('abc_-1');
    expect(payloadFromHash('p=abc')).toBe('abc');
    expect(payloadFromHash('#x=abc')).toBeNull();
    expect(payloadFromHash('')).toBeNull();
  });
});
