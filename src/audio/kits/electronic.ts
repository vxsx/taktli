import { velocityToGain } from '../../model/timing';
import type { TrackId, Velocity } from '../../model/types';
import { Choker } from './choke';
import type { Kit } from './types';

/** 808/909-flavoured synthesized kit. No assets. */
export function createElectronicKit(ctx: BaseAudioContext, out: AudioNode): Kit {
  const choker = new Choker();
  let noise: AudioBuffer | null = null;

  function noiseBuffer(): AudioBuffer {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  function env(t: number, peak: number, decay: number, attack = 0.001): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer();
    s.start(t);
    s.stop(t + dur);
    return s;
  }

  function osc(type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  function filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Six detuned squares: the classic 808 metallic source. */
  function metal(t: number, dur: number): AudioNode {
    const sum = ctx.createGain();
    sum.gain.value = 0.3;
    for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) osc('square', 40 * ratio, t, dur).connect(sum);
    return sum;
  }

  function tom(freq: number, decay: number) {
    return (t: number, g: number) => {
      const o = osc('sine', freq * 1.6, t, decay + 0.1);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      o.connect(env(t, g * 0.9, decay)).connect(out);
    };
  }

  const voices: Record<TrackId, (t: number, g: number) => void> = {
    kick: (t, g) => {
      const o = osc('sine', 150, t, 0.6);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(env(t, g, 0.45)).connect(out);
      osc('triangle', 1200, t, 0.02).connect(env(t, g * 0.3, 0.012)).connect(out);
    },
    snare: (t, g) => {
      noiseSource(t, 0.3).connect(filter('highpass', 1200)).connect(env(t, g * 0.8, 0.18)).connect(out);
      const o = osc('triangle', 220, t, 0.2);
      o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
      o.connect(env(t, g * 0.6, 0.1)).connect(out);
    },
    crossStick: (t, g) => {
      osc('square', 1650, t, 0.05).connect(filter('bandpass', 1700, 4)).connect(env(t, g * 0.9, 0.035)).connect(out);
      noiseSource(t, 0.04).connect(filter('bandpass', 3000, 2)).connect(env(t, g * 0.4, 0.02)).connect(out);
    },
    hhClosed: (t, g) => {
      metal(t, 0.12).connect(filter('highpass', 7000)).connect(env(t, g * 0.7, 0.05)).connect(out);
    },
    hhPedal: (t, g) => {
      metal(t, 0.1).connect(filter('highpass', 6000)).connect(env(t, g * 0.5, 0.04)).connect(out);
    },
    hhOpen: (t, g) => {
      const choke = ctx.createGain();
      choke.connect(out);
      metal(t, 0.6).connect(filter('highpass', 7000)).connect(env(t, g * 0.6, 0.45)).connect(choke);
      choker.register('hhOpen', choke.gain, t, t + 0.6);
    },
    tom1: tom(200, 0.35),
    tom2: tom(150, 0.42),
    floorTom: tom(105, 0.5),
    crash: (t, g) => {
      noiseSource(t, 2).connect(filter('highpass', 4000)).connect(env(t, g * 0.5, 1.6, 0.002)).connect(out);
      metal(t, 2).connect(filter('highpass', 5000)).connect(env(t, g * 0.3, 1.4, 0.002)).connect(out);
    },
    ride: (t, g) => {
      metal(t, 1.4).connect(filter('bandpass', 8000, 1.5)).connect(env(t, g * 0.6, 1.1)).connect(out);
      osc('sine', 3200, t, 0.5).connect(env(t, g * 0.08, 0.4)).connect(out);
    },
  };

  return {
    name: 'electronic',
    async load() {
      noiseBuffer();
    },
    play(track, time, velocity: Velocity) {
      if (velocity <= 0) return;
      const t = Math.max(time, ctx.currentTime);
      choker.trigger(track, t);
      voices[track](t, velocityToGain(velocity));
    },
  };
}
