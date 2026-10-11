import { CHOKE_TARGETS } from '../../model/tracks';
import type { TrackId } from '../../model/types';

export const CHOKE_FADE = 0.015;

interface ChokeVoice {
  gain: AudioParam;
  start: number;
  end: number;
}

/** Tracks ringing voices and fades them out when a choking track plays. */
export class Choker {
  private voices = new Map<TrackId, ChokeVoice[]>();

  /** `gain` must belong to a dedicated gain node (value 1) that nothing else automates. */
  register(track: TrackId, gain: AudioParam, start: number, end: number): void {
    const list = this.voices.get(track) ?? [];
    list.push({ gain, start, end });
    this.voices.set(track, list);
  }

  trigger(track: TrackId, time: number): void {
    for (const target of CHOKE_TARGETS[track] ?? []) {
      const list = this.voices.get(target);
      if (!list) continue;
      const keep: ChokeVoice[] = [];
      for (const v of list) {
        if (v.start < time && v.end > time) {
          v.gain.setValueAtTime(1, time);
          v.gain.linearRampToValueAtTime(0, time + CHOKE_FADE);
        } else if (v.end > time) {
          keep.push(v);
        }
      }
      this.voices.set(target, keep);
    }
  }
}
