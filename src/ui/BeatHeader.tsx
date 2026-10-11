import { useState } from 'react';
import { setBeatDiv } from '../model/ops';
import { SUBDIVISIONS } from '../model/timing';
import type { Subdivision } from '../model/types';
import { appStore, currentBar, useApp } from '../state/store';
import styles from './Grid.module.css';
import { Menu } from './Menu';
import { Popover } from './Popover';

const LABELS: Record<Subdivision, string> = { 4: '16ths', 3: '8th triplets', 6: '16th triplets' };
const MARK: Record<Subdivision, string> = { 4: '', 3: '3', 6: '6' };

export function BeatHeader() {
  const bar = useApp(currentBar);
  const [open, setOpen] = useState<{ beat: number; rect: DOMRect } | null>(null);
  const close = () => setOpen(null);
  return (
    <div className={styles.header}>
      <div className={styles.headerSpacer} />
      {bar.beats.map((b, i) => (
        <button
          key={i}
          className={styles.beatButton}
          aria-label={`Beat ${i + 1}: ${LABELS[b.div]}`}
          onClick={(e) => setOpen({ beat: i, rect: e.currentTarget.getBoundingClientRect() })}
        >
          {i + 1}
          {b.div !== 4 && <sup>{MARK[b.div]}</sup>}
        </button>
      ))}
      {open && (
        <Popover anchor={open.rect} onClose={close}>
          <Menu
            onClose={close}
            items={SUBDIVISIONS.map((d) => ({
              label: LABELS[d],
              checked: bar.beats[open.beat].div === d,
              onSelect: () => {
                const { ui } = appStore.getState();
                appStore.getState().apply((p) => setBeatDiv(p, ui.patternId, ui.barIndex, open.beat, d));
              },
            }))}
          />
        </Popover>
      )}
    </div>
  );
}
