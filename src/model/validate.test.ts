import { describe, expect, it } from 'vitest';
import { createDemoProject } from './factory';
import { projectProblems } from './invariants';
import { parseBar, parseProject, type ParseReport } from './validate';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('parseProject', () => {
  it('accepts a valid project unchanged', () => {
    const p = createDemoProject(123);
    expect(parseProject(clone(p))).toEqual(p);
  });

  it('rejects input without usable patterns', () => {
    for (const bad of [null, 42, 'x', [], {}, { patterns: [] }, { patterns: [1, 'x', null] }]) {
      expect(parseProject(bad)).toBeNull();
    }
  });

  it('repairs cells and velocities, and reads an unknown subdivision as 16ths', () => {
    const raw = clone(createDemoProject());
    (raw.patterns[0].bars[0].beats[0].cells as Record<string, unknown>).kick = [500, -4, 'x'];
    (raw.patterns[0].bars[0].beats[1] as unknown as { div: number }).div = 5;
    const p = parseProject(raw)!;
    expect(p.patterns[0].bars[0].beats[0].cells.kick).toEqual([127, 0, 0, 0]);
    expect(p.patterns[0].bars[0].beats[1].cells.snare).toEqual(createDemoProject().patterns[0].bars[0].beats[1].cells.snare);
    expect(projectProblems(p)).toEqual([]);
  });

  it('repairs malformed splits', () => {
    const raw = clone(createDemoProject());
    const splits = raw.patterns[0].bars[0].beats[0].splits as Record<string, unknown>;
    splits.snare = ['x', 300, null, -1, 5];
    splits.kick = 'nope';
    const p = parseProject(raw)!;
    expect(p.patterns[0].bars[0].beats[0].splits.snare).toEqual([null, 127, null, 0]);
    expect(p.patterns[0].bars[0].beats[0].splits.kick).toEqual([null, null, null, null]);
    expect(projectProblems(p)).toEqual([]);
  });

  it('writes version 2 and reads a beat without a subdivision as 16ths', () => {
    const p = parseProject({ version: 1, patterns: [{ bars: [{ beats: [{ cells: { kick: [100, 0, 90, 0] } }] }] }] })!;
    expect(p.version).toBe(2);
    expect(p.patterns[0].bars[0].beats[0].cells.kick).toEqual([100, 0, 90, 0]);
    expect(p.patterns[0].bars[0].beats[0].splits.kick).toEqual([null, null, null, null]);
  });

  it('fills defaults for missing fields', () => {
    const p = parseProject({ patterns: [{}] }, 7)!;
    expect(p.name).toBe('Untitled beat');
    expect(p.bpm).toBe(100);
    expect(p.kit).toBe('acoustic');
    expect(p.patterns[0].name).toBe('A');
    expect(p.patterns[0].bars).toHaveLength(1);
    expect(p.createdAt).toBe(7);
    expect(projectProblems(p)).toEqual([]);
  });

  it('drops song steps that reference unknown patterns', () => {
    const raw = clone(createDemoProject());
    raw.song.push({ id: 'zz', patternId: 'nope' });
    expect(parseProject(raw)!.song).toHaveLength(2);
  });

  it('regenerates duplicate ids and keeps song references on the first pattern', () => {
    const raw = clone(createDemoProject());
    raw.patterns[1].id = raw.patterns[0].id;
    raw.patterns[1].bars[0].id = raw.patterns[0].bars[0].id;
    const p = parseProject(raw)!;
    expect(p.patterns[1].id).not.toBe(p.patterns[0].id);
    expect(p.song.every((s) => s.patternId === p.patterns[0].id)).toBe(true);
    expect(projectProblems(p)).toEqual([]);
  });

  it('never returns an invalid project for randomly damaged input', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const junk: unknown[] = [null, -1, 'x', [], {}, 1e9, true, 3.7];
    for (let i = 0; i < 300; i++) {
      const raw = clone(createDemoProject()) as unknown as Record<string, unknown>;
      const paths: { obj: Record<string, unknown> | unknown[]; key: string | number }[] = [];
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach((v, k) => { paths.push({ obj: o, key: k }); walk(v); });
        else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { paths.push({ obj: o as Record<string, unknown>, key: k }); walk(v); }
      };
      walk(raw);
      for (let n = 0; n < 3; n++) {
        const { obj, key } = paths[Math.floor(rand() * paths.length)];
        (obj as Record<string | number, unknown>)[key] = junk[Math.floor(rand() * junk.length)];
      }
      const p = parseProject(raw);
      if (p) expect(projectProblems(p)).toEqual([]);
    }
  });
});

describe('parseBar', () => {
  it('builds a full bar from partial data', () => {
    const bar = parseBar({ id: 'b1', beats: [{ cells: { snare: [0, 90, 0, 0] }, splits: { snare: [null, 40, null, null] } }] });
    expect(bar.id).toBe('b1');
    expect(bar.beats[0].cells.snare).toEqual([0, 90, 0, 0]);
    expect(bar.beats[0].splits.snare).toEqual([null, 40, null, null]);
    expect(bar.beats[3].cells.kick).toEqual([0, 0, 0, 0]);
    expect(bar.beats[3].splits.kick).toEqual([null, null, null, null]);
  });

  it('converts triplet beats to 32nds and reports it', () => {
    const report: ParseReport = { tripletsConverted: false };
    const bar = parseBar({ id: 'b1', beats: [{ div: 3, cells: { snare: [90, 80, 70] } }] }, undefined, report);
    expect(bar.beats[0].cells.snare).toEqual([90, 0, 0, 0]);
    expect(bar.beats[0].splits.snare).toEqual([null, 80, 70, null]);
    expect(bar.beats[0].splits.kick).toEqual([null, null, null, null]);
    expect(report.tripletsConverted).toBe(true);
  });

  it('does not report empty triplet beats', () => {
    const report: ParseReport = { tripletsConverted: false };
    const bar = parseBar({ id: 'b1', beats: [{ div: 6, cells: { snare: [0, 0, 0, 0, 0, 0] } }] }, undefined, report);
    expect(bar.beats[0].cells.snare).toEqual([0, 0, 0, 0]);
    expect(report.tripletsConverted).toBe(false);
  });
});
