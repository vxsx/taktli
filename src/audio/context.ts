interface AudioGraph {
  ctx: AudioContext;
  /** Connect voices here. */
  out: AudioNode;
}

let graph: AudioGraph | null = null;
let silentAudio: HTMLAudioElement | null = null;

export function getAudio(): AudioGraph {
  if (!graph) {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(limiter).connect(ctx.destination);
    graph = { ctx, out: master };
  }
  return graph;
}

function silentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Makes Web Audio audible with the iOS ring/silent switch on:
 * iOS 17+: navigator.audioSession.type = 'playback'; older: a looping silent <audio> element.
 */
function enablePlaybackSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      // ignore
    }
    return;
  }
  if (silentAudio || navigator.maxTouchPoints === 0) return;
  silentAudio = document.createElement('audio');
  silentAudio.src = silentWavUrl();
  silentAudio.loop = true;
  silentAudio.setAttribute('playsinline', '');
  void silentAudio.play().catch(() => undefined);
}

/** Call from a user gesture (pointerup/click/keydown). */
export async function unlockAudio(): Promise<AudioContext> {
  enablePlaybackSession();
  const { ctx } = getAudio();
  if (ctx.state !== 'running') await ctx.resume();
  return ctx;
}
