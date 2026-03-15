import { type KMeansState, step } from './kmeans';
import { type DistanceFn } from './distance';

export interface LoopHandle {
  stop(): void;
  isRunning(): boolean;
}

export function startLoop(
  getState: () => KMeansState,
  setState: (s: KMeansState) => void,
  onFrame: (s: KMeansState) => void,
  iterationMs: () => number,
  getDistanceFn: () => DistanceFn,
): LoopHandle {
  let running = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function tick() {
    if (!running) return;

    const current = getState();
    if (current.converged) {
      running = false;
      return;
    }

    const t0 = performance.now();
    const next = step(current, getDistanceFn());
    const elapsed = performance.now() - t0;

    setState(next);
    onFrame(next);

    if (next.converged) {
      running = false;
      return;
    }

    const wait = Math.max(0, iterationMs() - elapsed);
    timeoutId = setTimeout(tick, wait);
  }

  timeoutId = setTimeout(tick, iterationMs());

  return {
    stop() {
      running = false;
      if (timeoutId !== null) clearTimeout(timeoutId);
    },
    isRunning() {
      return running;
    },
  };
}
