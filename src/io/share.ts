import { CELLS_PER_BEAT } from '../model/timing';
import { TRACK_IDS } from '../model/tracks';
import type { Beat, Project } from '../model/types';
import { parseProject, type ParseReport } from '../model/validate';

export class ShareError extends Error {
  constructor(message = 'This link is invalid or damaged') {
    super(message);
    this.name = 'ShareError';
  }
}

type CompactPattern = [name: string, swing: number, bars: string[][]];

interface CompactFields {
  n: string;
  b: number;
  k: 'a' | 'e';
  m: number;
  h: number;
  p: CompactPattern[];
  s: number[];
}

/** Links made before 32nds: each beat is a subdivision digit (4, 3 or 6) and then hex velocities. */
export interface CompactV1 extends CompactFields {
  v: 1;
}

/** Each beat, per track: 4 cells as 2 hex digits, then 4 splits as 2 hex digits or `--` for a whole cell. */
export interface CompactV2 extends CompactFields {
  v: 2;
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');
const BEAT_V2_LENGTH = TRACK_IDS.length * CELLS_PER_BEAT * 2 * 2;

function encodeBeat(beat: Beat): string {
  let s = '';
  for (const t of TRACK_IDS) {
    for (const v of beat.cells[t]) s += hex2(v);
    for (const v of beat.splits[t]) s += v === null ? '--' : hex2(v);
  }
  return s;
}

function decodeBeatV2(s: unknown): { cells: Record<string, number[]>; splits: Record<string, (number | null)[]> } {
  if (typeof s !== 'string' || s.length !== BEAT_V2_LENGTH || !/^([0-9a-f]{2}|--)*$/.test(s)) throw new ShareError();
  const cells: Record<string, number[]> = {};
  const splits: Record<string, (number | null)[]> = {};
  let pos = 0;
  const next = () => s.slice(pos, (pos += 2));
  for (const t of TRACK_IDS) {
    cells[t] = Array.from({ length: CELLS_PER_BEAT }, () => {
      const c = next();
      if (c === '--') throw new ShareError();
      return parseInt(c, 16);
    });
    splits[t] = Array.from({ length: CELLS_PER_BEAT }, () => {
      const c = next();
      return c === '--' ? null : parseInt(c, 16);
    });
  }
  return { cells, splits };
}

function decodeBeatV1(s: unknown): { div: number; cells: Record<string, number[]> } {
  if (typeof s !== 'string') throw new ShareError();
  const div = Number(s[0]);
  if (![4, 3, 6].includes(div) || s.length !== 1 + TRACK_IDS.length * div * 2 || !/^[0-9a-f]*$/.test(s.slice(1))) {
    throw new ShareError();
  }
  const cells: Record<string, number[]> = {};
  let pos = 1;
  for (const t of TRACK_IDS) {
    const arr: number[] = [];
    for (let i = 0; i < div; i++, pos += 2) arr.push(parseInt(s.slice(pos, pos + 2), 16));
    cells[t] = arr;
  }
  return { div, cells };
}

const mask = (p: Project, key: 'muted' | 'hidden') =>
  TRACK_IDS.reduce((m, t, i) => (p.tracks[t][key] ? m | (1 << i) : m), 0);

export function toCompact(p: Project): CompactV2 {
  return {
    v: 2,
    n: p.name,
    b: p.bpm,
    k: p.kit === 'electronic' ? 'e' : 'a',
    m: mask(p, 'muted'),
    h: mask(p, 'hidden'),
    p: p.patterns.map((pat) => [pat.name, pat.swing, pat.bars.map((bar) => bar.beats.map(encodeBeat))]),
    s: p.song.map((step) => p.patterns.findIndex((x) => x.id === step.patternId)).filter((i) => i >= 0),
  };
}

export function fromCompact(c: unknown, report?: ParseReport): Project {
  if (typeof c !== 'object' || c === null) throw new ShareError();
  const o = c as Partial<CompactV1 | CompactV2>;
  if ((o.v !== 1 && o.v !== 2) || !Array.isArray(o.p) || !Array.isArray(o.s)) throw new ShareError();
  const decodeBeat: (s: unknown) => object = o.v === 1 ? decodeBeatV1 : decodeBeatV2;
  const patterns = o.p.map((entry, i) => {
    if (!Array.isArray(entry) || !Array.isArray(entry[2])) throw new ShareError();
    const [name, swing, bars] = entry;
    return {
      id: `p${i}`,
      name,
      swing,
      bars: bars.map((beats) => {
        if (!Array.isArray(beats) || beats.length !== 4) throw new ShareError();
        return { beats: beats.map(decodeBeat) };
      }),
    };
  });
  const tracks = Object.fromEntries(
    TRACK_IDS.map((t, i) => [t, { muted: ((o.m ?? 0) >> i) & 1 ? true : false, hidden: ((o.h ?? 0) >> i) & 1 ? true : false }]),
  );
  const project = parseProject({
    name: o.n,
    bpm: o.b,
    kit: o.k === 'e' ? 'electronic' : 'acoustic',
    tracks,
    patterns,
    song: o.s.map((i) => ({ patternId: `p${i}` })),
  }, Date.now(), report);
  if (!project) throw new ShareError();
  return project;
}

export function compressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeShare(p: Project): Promise<string> {
  const json = JSON.stringify(toCompact(p));
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeShare(payload: string, report?: ParseReport): Promise<Project> {
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw')));
    return fromCompact(JSON.parse(json), report);
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError();
  }
}

export const SHARE_PARAM = 'p';

export function shareUrl(payload: string, base: string): string {
  return `${base}#${SHARE_PARAM}=${payload}`;
}

export function payloadFromHash(hash: string): string | null {
  const m = /^#?p=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1] : null;
}
