import { buildTimeline, nextRef, notesAtTick, startRef, type BarRef, type TimelineOptions } from '../model/timeline';
import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../model/timing';
import type { Project, TrackId, Velocity } from '../model/types';

export interface PlayheadEvent {
  /** Audio-clock time at which this tick sounds. */
  time: number;
  ref: BarRef;
  tick: number;
}

export interface SchedulerDeps {
  now(): number;
  getProject(): Project;
  getOptions(): TimelineOptions;
  play(track: TrackId, time: number, velocity: Velocity): void;
  onPlayhead(e: PlayheadEvent): void;
  /** Seconds scheduled ahead of now. */
  lookahead?: number;
  intervalMs?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/** Delay between pressing play and the first note, so the first tick isn't late. */
export const START_DELAY = 0.06;
/** If the timer fell this far behind (background tab, sleep), skip ahead instead of bursting. */
export const STALL_LIMIT = 0.25;

/** Classic Web Audio lookahead scheduler ("A Tale of Two Clocks"). */
export class Scheduler {
  private handle: unknown = null;
  private ref: BarRef | null = null;
  private tick = 0;
  private nextTime = 0;

  constructor(private readonly deps: SchedulerDeps) {}

  get running(): boolean {
    return this.handle !== null;
  }

  /** `fromBar` is a position in the timeline (in song mode: the song's bar ruler, 0-based). */
  start(fromBar?: number): void {
    if (this.running) return;
    const [p, o] = [this.deps.getProject(), this.deps.getOptions()];
    this.ref = (fromBar !== undefined ? buildTimeline(p, o)[fromBar] : undefined) ?? startRef(p, o);
    this.tick = 0;
    this.nextTime = this.deps.now() + START_DELAY;
    const setI = this.deps.setInterval ?? ((fn: () => void, ms: number) => globalThis.setInterval(fn, ms));
    this.handle = setI(() => this.pump(), this.deps.intervalMs ?? 25);
    this.pump();
  }

  stop(): void {
    if (!this.running) return;
    const clearI = this.deps.clearInterval ?? ((h: unknown) => globalThis.clearInterval(h as number));
    clearI(this.handle);
    this.handle = null;
    this.ref = null;
  }

  pump(): void {
    if (!this.ref) return;
    const now = this.deps.now();
    if (this.nextTime < now - STALL_LIMIT) this.nextTime = now + 0.02;
    const horizon = now + (this.deps.lookahead ?? 0.12);
    while (this.ref && this.nextTime < horizon) {
      const p = this.deps.getProject();
      const secondsPerTick = 60 / p.bpm / TICKS_PER_BEAT;
      for (const n of notesAtTick(p, this.ref, this.tick)) {
        this.deps.play(n.track, this.nextTime + n.offset * secondsPerTick, n.velocity);
      }
      this.deps.onPlayhead({ time: this.nextTime, ref: this.ref, tick: this.tick });
      this.nextTime += secondsPerTick;
      this.tick += 1;
      if (this.tick >= TICKS_PER_BAR) {
        this.tick = 0;
        this.ref = nextRef(buildTimeline(p, this.deps.getOptions()), this.ref);
      }
    }
  }
}
