import type { KitName, TrackId, Velocity } from '../../model/types';

export interface Kit {
  readonly name: KitName;
  /** Idempotent; resolves when every voice can play. */
  load(): Promise<void>;
  /** Schedules one hit at audio-clock `time`. Must be cheap and never throw. */
  play(track: TrackId, time: number, velocity: Velocity): void;
}
