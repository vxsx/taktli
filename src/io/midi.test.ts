import { describe, expect, it } from 'vitest';
import { createDemoProject, createProject } from '../model/factory';
import * as ops from '../model/ops';
import { exportMidi, PPQ, vlq } from './midi';
import { safeFilename } from './download';

interface Ev { time: number; status: number; data: number[] }

/** Minimal SMF format-0 reader for assertions. */
function readMidi(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  expect(text(0, 4)).toBe('MThd');
  const header = { length: dv.getUint32(4), format: dv.getUint16(8), tracks: dv.getUint16(10), division: dv.getUint16(12) };
  expect(text(14, 4)).toBe('MTrk');
  const end = 22 + dv.getUint32(18);
  let pos = 22;
  let time = 0;
  const events: Ev[] = [];
  const metas: { time: number; type: number; data: number[] }[] = [];
  const readVlq = () => { let v = 0; for (;;) { const b = bytes[pos++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v; } };
  while (pos < end) {
    time += readVlq();
    const status = bytes[pos++];
    if (status === 0xff) {
      const type = bytes[pos++];
      const len = readVlq();
      metas.push({ time, type, data: [...bytes.subarray(pos, pos + len)] });
      pos += len;
    } else {
      events.push({ time, status, data: [bytes[pos], bytes[pos + 1]] });
      pos += 2;
    }
  }
  return { header, events, metas, endPos: pos, totalLength: bytes.length };
}

describe('vlq', () => {
  it('encodes variable-length quantities', () => {
    expect(vlq(0)).toEqual([0x00]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
    expect(vlq(0x200000)).toEqual([0x81, 0x80, 0x80, 0x00]);
  });
});

describe('exportMidi', () => {
  function simple() {
    let p = createProject('Beat');
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'kick', 0, 100);
    p = ops.setVelocity(p, pid, 0, 1, 'snare', 0, 90);
    p = ops.setBpm(p, 120);
    return { p, pid };
  }

  it('writes a format-0 header with 480 PPQ and tempo/time-signature metas', () => {
    const { p, pid } = simple();
    const m = readMidi(exportMidi(p, { patternId: pid }));
    expect(m.header).toEqual({ length: 6, format: 0, tracks: 1, division: PPQ });
    expect(m.endPos).toBe(m.totalLength);
    const tempo = m.metas.find((x) => x.type === 0x51)!;
    expect((tempo.data[0] << 16) | (tempo.data[1] << 8) | tempo.data[2]).toBe(500000);
    expect(m.metas.find((x) => x.type === 0x58)!.data).toEqual([4, 2, 24, 8]);
    expect(m.metas.at(-1)).toEqual({ time: 1920, type: 0x2f, data: [] });
  });

  it('writes note on/off pairs on channel 10 with GM notes', () => {
    const { p, pid } = simple();
    const { events } = readMidi(exportMidi(p, { patternId: pid }));
    expect(events).toEqual([
      { time: 0, status: 0x99, data: [36, 100] },
      { time: 120, status: 0x89, data: [36, 64] },
      { time: 480, status: 0x99, data: [38, 90] },
      { time: 600, status: 0x89, data: [38, 64] },
    ]);
  });

  it('bakes swing into note times', () => {
    let p = createProject();
    const pid = p.patterns[0].id;
    p = ops.setVelocity(p, pid, 0, 0, 'hhClosed', 1, 80);
    p = ops.setSwing(p, pid, 100);
    const { events } = readMidi(exportMidi(p, { patternId: pid }));
    expect(events[0]).toEqual({ time: 180, status: 0x99, data: [42, 80] });
  });

  it('excludes muted tracks', () => {
    const { p, pid } = simple();
    const { events } = readMidi(exportMidi(ops.setTrackMuted(p, 'kick', true), { patternId: pid }));
    expect(events.map((e) => e.data[0])).toEqual([38, 38]);
  });

  it('exports the whole song when it has steps', () => {
    const p = createDemoProject();
    const m = readMidi(exportMidi(p, { patternId: p.patterns[0].id }));
    expect(m.metas.at(-1)!.time).toBe(4 * 1920);
    const firstBarB = m.events.filter((e) => e.time >= 2 * 1920 && e.time < 3 * 1920 && e.status === 0x99);
    expect(firstBarB.length).toBeGreaterThan(0);
  });

  it('exports the current pattern when the song is empty', () => {
    let p = createDemoProject();
    p = { ...p, song: [] };
    const m = readMidi(exportMidi(p, { patternId: p.patterns[1].id }));
    expect(m.metas.at(-1)!.time).toBe(2 * 1920);
  });
});

describe('safeFilename', () => {
  it('keeps letters, digits, dashes and spaces as dashes', () => {
    expect(safeFilename('My  Beat #1!')).toBe('My-Beat-1');
    expect(safeFilename('***')).toBe('beat');
  });
});
