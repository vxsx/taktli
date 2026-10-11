import { velocityToGain } from '../../model/timing';
import { CHOKEABLE, TRACK_IDS } from '../../model/tracks';
import type { TrackId } from '../../model/types';
import { Choker } from './choke';
import type { Kit } from './types';

export const ACOUSTIC_FILES: Record<TrackId, string> = {
  crash: 'crash.mp3',
  ride: 'ride.mp3',
  hhOpen: 'hihat-open.mp3',
  hhClosed: 'hihat-closed.mp3',
  hhPedal: 'hihat-pedal.mp3',
  snare: 'snare.mp3',
  crossStick: 'cross-stick.mp3',
  tom1: 'tom-1.mp3',
  tom2: 'tom-2.mp3',
  floorTom: 'floor-tom.mp3',
  kick: 'kick.mp3',
};

/** The two rack toms are close in pitch; nudge tom 1 up for clearer fills. */
const PLAYBACK_RATE: Partial<Record<TrackId, number>> = { tom1: 1.2 };

export function createSampleKit(ctx: BaseAudioContext, out: AudioNode, baseUrl: string, fetchFn: typeof fetch = fetch): Kit {
  const buffers = new Map<TrackId, AudioBuffer>();
  const choker = new Choker();
  let loading: Promise<void> | null = null;

  async function loadOne(track: TrackId): Promise<void> {
    const res = await fetchFn(baseUrl + ACOUSTIC_FILES[track]);
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${ACOUSTIC_FILES[track]}`);
    buffers.set(track, await ctx.decodeAudioData(await res.arrayBuffer()));
  }

  return {
    name: 'acoustic',
    load() {
      if (loading) return loading;
      const attempt = Promise.all(TRACK_IDS.map(loadOne)).then(() => undefined);
      attempt.catch(() => {
        loading = null; // allow a retry later
      });
      loading = attempt;
      return attempt;
    },
    play(track, time, velocity) {
      const buffer = buffers.get(track);
      if (!buffer || velocity <= 0) return;
      const t = Math.max(time, ctx.currentTime);
      choker.trigger(track, t);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = PLAYBACK_RATE[track] ?? 1;
      const gain = ctx.createGain();
      gain.gain.value = velocityToGain(velocity);
      src.connect(gain);
      if (CHOKEABLE.has(track)) {
        const choke = ctx.createGain();
        gain.connect(choke).connect(out);
        choker.register(track, choke.gain, t, t + buffer.duration / src.playbackRate.value);
      } else {
        gain.connect(out);
      }
      src.start(t);
    },
  };
}
