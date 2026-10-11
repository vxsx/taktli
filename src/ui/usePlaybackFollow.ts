import { useEffect } from 'react';
import { transport } from '../audio/transport';
import { appStore } from '../state/store';

/** While playing with Follow on, keeps the editor on the audible pattern and bar. */
export function usePlaybackFollow(): void {
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ph = transport.playhead();
      if (!ph) return;
      const s = appStore.getState();
      if (!s.ui.playing || !s.ui.follow || s.gestureBase) return;
      if (ph.ref.patternId !== s.ui.patternId || ph.ref.barIndex !== s.ui.barIndex) {
        s.setUi({ patternId: ph.ref.patternId, barIndex: ph.ref.barIndex });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}
