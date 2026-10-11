import { useRef } from 'react';
import { MAX_BPM, MIN_BPM, setBpm } from '../model/ops';
import { appStore, useApp } from '../state/store';
import { Popover } from './Popover';
import { registerTap, tempoFromTaps } from './tapTempo';
import styles from './TopBar.module.css';

export function BpmPopover({ anchor, onClose }: { anchor: DOMRect; onClose(): void }) {
  const bpm = useApp((s) => s.project.bpm);
  const taps = useRef<number[]>([]);
  const st = appStore.getState;
  const set = (v: number) => st().apply((p) => setBpm(p, v));
  return (
    <Popover
      anchor={anchor}
      onClose={() => {
        st().endGesture();
        onClose();
      }}
    >
      <div className={styles.bpm}>
        <div className={styles.bpmRow}>
          <button aria-label="Slower" onClick={() => set(bpm - 1)}>−</button>
          <output className={styles.bpmValue} aria-label="BPM">{bpm}</output>
          <button aria-label="Faster" onClick={() => set(bpm + 1)}>+</button>
        </div>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          aria-label="Tempo slider"
          onChange={(e) => st().applyTransient((p) => setBpm(p, Number(e.target.value)))}
          onPointerUp={() => st().endGesture()}
          onBlur={() => st().endGesture()}
        />
        <button
          className={styles.tap}
          onPointerDown={() => {
            taps.current = registerTap(taps.current, performance.now());
            const t = tempoFromTaps(taps.current);
            if (t) set(t);
          }}
        >
          Tap tempo
        </button>
      </div>
    </Popover>
  );
}
