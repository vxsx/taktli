import { cloneBar } from './factory';
import { clamp, GHOST_MAX, TICKS_PER_BEAT } from './timing';
import type { Bar, Subdivision, TrackId, Velocity } from './types';

export type Rng = () => number;

export interface RandomizeOptions {
  /** Tracks the generator may write. Notes on every other track are kept. */
  tracks: ReadonlySet<TrackId>;
  rng?: Rng;
}

/** Where a cell sits in its beat: the beat itself, the "and" between beats, or a weaker step. */
type Slot = 'down' | 'and' | 'weak';

function slotOf(div: Subdivision, cell: number): Slot {
  if (cell === 0) return 'down';
  // In triplet beats the last step is the swung "and".
  if (cell * 2 === div || (div === 3 && cell === 2)) return 'and';
  return 'weak';
}

/** Musical choices shared by every bar of one roll, so the bars sound like one groove. */
interface Plan {
  rng: Rng;
  can(t: TrackId): boolean;
  keeper: TrackId | null;
  rate: 'quarter' | 'eighth' | 'sixteenth';
  openHat: 'none' | 'lastAnd' | 'offbeats';
  backbeat: TrackId | null;
  halfTime: boolean;
  ghostChance: number;
  pickup: boolean;
  /** Random numbers keyed by position, so bars with the same subdivisions get the same notes. */
  roll(key: string): number;
}

const pick = <T>(rng: Rng, weighted: [T, number][]): T => {
  let r = rng() * weighted.reduce((n, [, w]) => n + w, 0);
  for (const [v, w] of weighted) if ((r -= w) < 0) return v;
  return weighted[weighted.length - 1][0];
};

function makePlan(tracks: ReadonlySet<TrackId>, rng: Rng): Plan {
  const can = (t: TrackId) => tracks.has(t);
  const rolls = new Map<string, number>();
  const roll = (key: string) => {
    if (!rolls.has(key)) rolls.set(key, rng());
    return rolls.get(key)!;
  };

  let keeper: TrackId | null = null;
  if (can('hhClosed') && (!can('ride') || rng() < 0.72)) keeper = 'hhClosed';
  else if (can('ride')) keeper = 'ride';
  else if (can('hhOpen')) keeper = 'hhOpen';

  let rate: Plan['rate'] =
    keeper === 'ride'
      ? pick(rng, [['eighth', 7], ['quarter', 3]])
      : pick(rng, [['eighth', 55], ['sixteenth', 30], ['quarter', 15]]);
  const openHat: Plan['openHat'] =
    keeper === 'hhClosed' && can('hhOpen') ? pick(rng, [['none', 6], ['lastAnd', 3], ['offbeats', 1]]) : 'none';
  if (openHat === 'offbeats') rate = 'eighth';

  let backbeat: TrackId | null = null;
  if (can('snare')) backbeat = can('crossStick') && rng() < 0.15 ? 'crossStick' : 'snare';
  else if (can('crossStick')) backbeat = 'crossStick';

  return {
    rng,
    can,
    keeper,
    rate,
    openHat,
    backbeat,
    halfTime: rng() < 0.12,
    ghostChance: can('snare') ? pick(rng, [[0, 4], [0.1, 3.5], [0.22, 2.5]]) : 0,
    pickup: can('snare') && rng() < 0.12,
    roll,
  };
}

/** Kick likelihood at a position: always on one, often on three and the "and"s, rarely on weak steps. */
function kickChance(plan: Plan, beat: number, slot: Slot): number {
  const backbeatBeat = plan.halfTime ? beat === 2 : beat === 1 || beat === 3;
  if (slot === 'down') {
    if (beat === 0) return 1;
    if (backbeatBeat) return 0.03;
    return beat === 2 ? 0.7 : 0.15;
  }
  if (slot === 'and') return beat === 1 || beat === 2 ? 0.35 : 0.22;
  return 0.1;
}

const FILL_VOICES: readonly TrackId[] = ['snare', 'tom1', 'tom2', 'floorTom'];

function renderBar(src: Bar, plan: Plan, role: { first: boolean; last: boolean; multi: boolean }): Bar {
  const { rng, can } = plan;
  const bar = cloneBar(src, src.id);
  for (const beat of bar.beats) {
    for (const t of Object.keys(beat.cells) as TrackId[]) if (can(t)) beat.cells[t] = new Array<Velocity>(beat.div).fill(0);
  }
  const vel = (base: number, spread = 6) => clamp(Math.round(base + (rng() * 2 - 1) * spread), 1, 127);
  const put = (beat: number, cell: number, t: TrackId | null, v: Velocity) => {
    if (t && can(t)) bar.beats[beat].cells[t][cell] = v;
  };

  // The last bar of a longer pattern hands over to what follows with a fill.
  const voices = FILL_VOICES.filter(can);
  const fillFrom = role.last && role.multi && voices.length > 0 ? (rng() < 0.4 ? 2 : 3) : 4;
  const crash = role.first && can('crash') && rng() < (role.multi ? 0.5 : 0.1);

  for (let b = 0; b < fillFrom; b++) {
    const div = bar.beats[b].div;
    for (let c = 0; c < div; c++) {
      const slot = slotOf(div, c);
      const key = `${b}:${(c * TICKS_PER_BEAT) / div}`;
      const isBackbeat = slot === 'down' && (plan.halfTime ? b === 2 : b === 1 || b === 3);

      const keeperOn = plan.rate === 'sixteenth' || slot === 'down' || (plan.rate === 'eighth' && slot === 'and');
      if (crash && b === 0 && c === 0) put(b, c, 'crash', vel(116, 6));
      else if (keeperOn && plan.keeper) {
        const open = slot === 'and' && (plan.openHat === 'offbeats' || (plan.openHat === 'lastAnd' && b === 3));
        const base = slot === 'down' ? 100 : slot === 'and' ? 82 : 64;
        put(b, c, open ? 'hhOpen' : plan.keeper, vel(base, 8));
      }

      if (isBackbeat) put(b, c, plan.backbeat, vel(117, 5));
      else if (slot === 'weak' && plan.roll(`ghost:${key}`) < plan.ghostChance) put(b, c, 'snare', vel(34, GHOST_MAX - 34));
      else if (plan.pickup && b === 3 && slot === 'and') put(b, c, 'snare', vel(105, 5));

      if (plan.roll(`kick:${key}`) < kickChance(plan, b, slot)) {
        put(b, c, 'kick', vel(slot === 'down' ? 114 : slot === 'and' ? 98 : 88, 6));
      }
    }
  }

  // Middle bars sometimes nudge one kick so a long pattern doesn't sound copy-pasted.
  if (role.multi && !role.first && !role.last && can('kick') && rng() < 0.35) {
    const b = 1 + Math.floor(rng() * (fillFrom - 1));
    const div = bar.beats[b].div;
    const c = 1 + Math.floor(rng() * (div - 1));
    const cells = bar.beats[b].cells.kick;
    cells[c] = cells[c] > 0 ? 0 : vel(92, 6);
  }

  if (fillFrom < 4) {
    const steps: [number, number][] = [];
    const eighths = voices.length > 1 && rng() < 0.5;
    for (let b = fillFrom; b < 4; b++) {
      const div = bar.beats[b].div;
      for (let c = 0; c < div; c++) if (!eighths || slotOf(div, c) !== 'weak') steps.push([b, c]);
      if (rng() < 0.5) put(b, 0, 'kick', vel(108, 6));
    }
    // Snare first, then down the toms, getting louder.
    steps.forEach(([b, c], k) => {
      const voice = voices[Math.floor((k * voices.length) / steps.length)];
      put(b, c, voice, vel(82 + (36 * k) / Math.max(1, steps.length - 1), 4));
    });
  }
  return bar;
}

/**
 * Rewrites the bars at `indices` with one generated groove: kick and snare backbeat, a hi-hat or ride
 * timekeeper, ghost notes, a crash at the start and a fill at the end of a longer pattern.
 * Keeps bar ids and subdivisions; returns `bars` itself when there is nothing to write.
 */
export function randomizeBars(bars: readonly Bar[], indices: readonly number[], opts: RandomizeOptions): Bar[] {
  const targets = new Set(indices.filter((i) => i >= 0 && i < bars.length));
  if (opts.tracks.size === 0 || targets.size === 0) return bars as Bar[];
  const plan = makePlan(opts.tracks, opts.rng ?? Math.random);
  const multi = bars.length > 1;
  return bars.map((bar, i) => (targets.has(i) ? renderBar(bar, plan, { first: i === 0, last: i === bars.length - 1, multi }) : bar));
}
