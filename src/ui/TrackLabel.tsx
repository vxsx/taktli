import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { transport } from '../audio/transport';
import { clearRow, setTrackHidden, setTrackMuted } from '../model/ops';
import { DEFAULT_VELOCITY } from '../model/timing';
import { TRACK_BY_ID } from '../model/tracks';
import type { TrackId } from '../model/types';
import { appStore, useApp } from '../state/store';
import { DRAG_THRESHOLD, LONG_PRESS_MS } from './gestures';
import styles from './Grid.module.css';
import { Menu } from './Menu';
import { Popover } from './Popover';

export function TrackLabel({ track }: { track: TrackId }) {
  const def = TRACK_BY_ID[track];
  const muted = useApp((s) => s.project.tracks[track].muted);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; timer: number; long: boolean } | null>(null);

  const openMenu = () => button.current && setMenu(button.current.getBoundingClientRect());
  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    const p = { x: e.clientX, y: e.clientY, long: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.long = true;
      openMenu();
    }, LONG_PRESS_MS);
    press.current = p;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) cancel();
  };

  const st = appStore.getState;
  return (
    <>
      <button
        ref={button}
        className={styles.label}
        style={{ borderLeftColor: def.color }}
        aria-label={`${def.label}${muted ? ' (muted)' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          cancel();
          openMenu();
        }}
        onClick={() => {
          if (press.current?.long) return;
          void transport.audition(track, DEFAULT_VELOCITY);
        }}
      >
        {def.label}
      </button>
      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              { label: muted ? 'Unmute' : 'Mute', onSelect: () => st().apply((p) => setTrackMuted(p, track, !muted)) },
              { label: 'Hide track', onSelect: () => st().apply((p) => setTrackHidden(p, track, true)) },
              {
                label: 'Clear row in this bar',
                onSelect: () => {
                  const { ui } = st();
                  st().apply((p) => clearRow(p, ui.patternId, ui.barIndex, track));
                },
              },
            ]}
          />
        </Popover>
      )}
    </>
  );
}
