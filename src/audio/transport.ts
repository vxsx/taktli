import type { KitName, TrackId, Velocity } from '../model/types';
import { appStore } from '../state/store';
import { getAudio, unlockAudio } from './context';
import { createElectronicKit } from './kits/electronic';
import { createSampleKit } from './kits/sample';
import type { Kit } from './kits/types';
import { Scheduler, type PlayheadEvent } from './scheduler';

interface WakeLockHandle {
  release(): Promise<void>;
}

class Transport {
  private kits = new Map<KitName, Kit>();
  private acousticFailed = false;
  private scheduler: Scheduler | null = null;
  private queue: PlayheadEvent[] = [];
  private current: PlayheadEvent | null = null;
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

  async play(): Promise<void> {
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
    this.queue = [];
    this.current = null;
    this.scheduler = new Scheduler({
      now: () => ctx.currentTime,
      getProject: () => appStore.getState().project,
      getOptions: () => {
        const { ui } = appStore.getState();
        return { mode: ui.playMode, patternId: ui.patternId, barIndex: ui.barIndex, loopBar: ui.loopBar };
      },
      play: (track, time, velocity) => this.kits.get(this.effectiveKit())?.play(track, time, velocity),
      onPlayhead: (e) => this.queue.push(e),
    });
    this.scheduler.start();
    appStore.getState().setUi({ playing: true });
    void this.acquireWakeLock();
  }

  stop(): void {
    if (!this.scheduler) return;
    this.scheduler.stop();
    this.scheduler = null;
    this.queue = [];
    this.current = null;
    appStore.getState().setUi({ playing: false });
    void this.releaseWakeLock();
  }

  toggle(): void {
    if (this.scheduler) this.stop();
    else void this.play();
  }

  /** The tick currently audible; call once per animation frame. */
  playhead(): PlayheadEvent | null {
    if (!this.scheduler) return null;
    const now = getAudio().ctx.currentTime;
    while (this.queue.length > 0 && this.queue[0].time <= now) this.current = this.queue.shift()!;
    return this.current;
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
