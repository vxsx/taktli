import type { KitName, TrackId, Velocity } from '../model/types';
import { appStore } from '../state/store';
import { getAudio, unlockAudio } from './context';
import { createElectronicKit } from './kits/electronic';
import { createSampleKit } from './kits/sample';
import type { Kit } from './kits/types';
import { PlayheadQueue } from './playheadQueue';
import { Scheduler, type PlayheadEvent } from './scheduler';
import { workerClearInterval, workerSetInterval } from './workerTimer';

interface WakeLockHandle {
  readonly released?: boolean;
  release(): Promise<void>;
}

class Transport {
  private kits = new Map<KitName, Kit>();
  private acousticFailed = false;
  private scheduler: Scheduler | null = null;
  private queue = new PlayheadQueue();
  private wakeLock: WakeLockHandle | null = null;

  get playing(): boolean {
    return this.scheduler !== null;
  }

  /** The kit actually used: acoustic falls back to electronic for the session if it failed to load. */
  private effectiveKit(): KitName {
    const k = appStore.getState().project.kit;
    return k === 'acoustic' && this.acousticFailed ? 'electronic' : k;
  }

  private kit(name: KitName): Kit {
    let kit = this.kits.get(name);
    if (!kit) {
      const { ctx, out } = getAudio();
      kit = name === 'acoustic'
        ? createSampleKit(ctx, out, `${import.meta.env.BASE_URL}kits/acoustic/`)
        : createElectronicKit(ctx, out);
      this.kits.set(name, kit);
    }
    return kit;
  }

  async ensureKit(name: KitName = this.effectiveKit()): Promise<Kit> {
    try {
      const kit = this.kit(name);
      await kit.load();
      return kit;
    } catch (e) {
      if (name !== 'acoustic') throw e;
      console.warn('Acoustic kit failed to load', e);
      if (!this.acousticFailed) {
        this.acousticFailed = true;
        appStore.getState().toast("Couldn't load acoustic kit — using electronic", 'error');
      }
      const fallback = this.kit('electronic');
      await fallback.load();
      return fallback;
    }
  }

  preload(name: KitName): void {
    void this.ensureKit(name).catch(() => undefined);
  }

  /** `fromBar` is a timeline position (the song's bar ruler in song mode); omitted, play starts as usual. */
  async play(fromBar?: number): Promise<void> {
    if (this.scheduler) return;
    try {
      await unlockAudio();
    } catch {
      appStore.getState().toast('Audio could not start — tap Play again', 'error');
      return;
    }
    await this.ensureKit().catch(() => undefined);
    if (this.scheduler) return;
    const { ctx } = getAudio();
    this.queue.clear();
    this.scheduler = new Scheduler({
      now: () => ctx.currentTime,
      getProject: () => appStore.getState().project,
      getOptions: () => {
        const { ui } = appStore.getState();
        return { mode: ui.playMode, patternId: ui.patternId, barIndex: ui.barIndex, loopBar: ui.loopBar, solo: ui.solo };
      },
      play: (track, time, velocity) => this.kits.get(this.effectiveKit())?.play(track, time, velocity),
      onPlayhead: (e) => this.queue.push(e, ctx.currentTime),
      // Keeps time in background tabs, where browsers slow down ordinary timers.
      setInterval: workerSetInterval,
      clearInterval: workerClearInterval,
    });
    this.scheduler.start(fromBar);
    appStore.getState().setUi({ playing: true });
    void this.acquireWakeLock();
  }

  stop(): void {
    if (!this.scheduler) return;
    this.scheduler.stop();
    this.scheduler = null;
    this.queue.clear();
    appStore.getState().setUi({ playing: false });
    void this.releaseWakeLock();
  }

  /** Plays from `bar`, restarting if something is already playing. */
  playFrom(bar: number): void {
    this.stop();
    void this.play(bar);
  }

  toggle(): void {
    if (this.scheduler) this.stop();
    else void this.play();
  }

  /** The tick currently audible; call once per animation frame. */
  playhead(): PlayheadEvent | null {
    if (!this.scheduler) return null;
    return this.queue.at(getAudio().ctx.currentTime);
  }

  /** Browsers drop the screen wake lock while the tab is hidden; take it again on return if still playing. */
  keepAwake(): void {
    if (this.scheduler && (!this.wakeLock || this.wakeLock.released)) void this.acquireWakeLock();
  }

  async audition(track: TrackId, velocity: Velocity): Promise<void> {
    try {
      await unlockAudio();
      const kit = await this.ensureKit();
      kit.play(track, getAudio().ctx.currentTime, velocity);
    } catch {
      // auditioning is best effort
    }
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock?.release();
    } catch {
      // ignore
    }
  }
}

export const transport = new Transport();
