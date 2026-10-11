/**
 * Interval timers driven by a Web Worker. Browsers throttle main-thread timers in background tabs
 * (Chrome to about once a second), which would leave gaps in the music; worker timers keep their pace.
 * Falls back to a plain interval where workers can't be created.
 */

export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(ms: number): void;
  terminate(): void;
}

type Handle = { worker: WorkerLike } | { fallback: ReturnType<typeof setInterval> };

const SOURCE = 'onmessage = (e) => { setInterval(() => postMessage(0), e.data); };';
let sourceUrl: string | null = null;

function defaultWorker(): WorkerLike {
  sourceUrl ??= URL.createObjectURL(new Blob([SOURCE], { type: 'text/javascript' }));
  return new Worker(sourceUrl);
}

export function workerSetInterval(fn: () => void, ms: number, makeWorker: () => WorkerLike = defaultWorker): unknown {
  try {
    const worker = makeWorker();
    worker.onmessage = () => fn();
    worker.postMessage(ms);
    return { worker } satisfies Handle;
  } catch {
    return { fallback: setInterval(fn, ms) } satisfies Handle;
  }
}

export function workerClearInterval(handle: unknown): void {
  const h = handle as Handle;
  if ('worker' in h) h.worker.terminate();
  else clearInterval(h.fallback);
}
