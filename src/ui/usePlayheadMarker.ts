import { useEffect, type RefObject } from 'react';
import { transport } from '../audio/transport';
import type { PlayheadEvent } from '../audio/scheduler';
import { appStore, type AppState } from '../state/store';

/**
 * Every animation frame, adds `className` to the elements inside `container` matched by the CSS selector
 * that `select` returns for the audible tick (or clears marks when it returns null). Bypasses React renders.
 */
export function usePlayheadMarker(
  container: RefObject<HTMLElement | null>,
  className: string,
  select: (ph: PlayheadEvent, s: AppState) => string | null,
): void {
  useEffect(() => {
    let raf = 0;
    let marked: Element[] = [];
    let markedSelector: string | null = null;
    const clear = () => {
      for (const el of marked) el.classList.remove(className);
      marked = [];
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const root = container.current;
      if (!root) return;
      const ph = transport.playhead();
      const selector = ph ? select(ph, appStore.getState()) : null;
      const intact = marked.every((el) => el.isConnected && el.classList.contains(className));
      if (selector === markedSelector && intact) return;
      clear();
      markedSelector = selector;
      if (!selector) return;
      marked = Array.from(root.querySelectorAll(selector));
      for (const el of marked) el.classList.add(className);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [container, className, select]);
}
