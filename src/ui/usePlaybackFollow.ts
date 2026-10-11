import { useEffect } from 'react';
import type { PlayheadEvent } from '../audio/scheduler';
import { transport } from '../audio/transport';
import { appStore, type AppState, type UiState } from '../state/store';
import { isOverlayOpen } from './Popover';

/** Where Follow should move the editor, or null to stay put. */
export function followPatch(ph: PlayheadEvent | null, s: AppState, overlayOpen: boolean): Partial<UiState> | null {
  if (!ph || !s.ui.playing || !s.ui.follow || s.gestureBase || overlayOpen) return null;
  if (ph.ref.patternId === s.ui.patternId && ph.ref.barIndex === s.ui.barIndex) return null;
  return { patternId: ph.ref.patternId, barIndex: ph.ref.barIndex };
}

/** While playing with Follow on, keeps the editor on the audible pattern and bar. */
export function usePlaybackFollow(): void {
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const s = appStore.getState();
      const patch = followPatch(transport.playhead(), s, isOverlayOpen());
      if (patch) s.setUi(patch);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
