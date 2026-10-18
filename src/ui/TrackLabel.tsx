import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { transport } from '../audio/transport';
import { clearRow, setTrackHidden, setTrackMuted } from '../model/ops';
import { DEFAULT_VELOCITY } from '../model/timing';
import { TRACK_BY_ID } from '../model/tracks';
import type { TrackId } from '../model/types';
import * as actions from '../state/actions';
import { appStore, useApp } from '../state/store';
import { DRAG_THRESHOLD, LONG_PRESS_MS } from './gestures';
import styles from './Grid.module.css';
import { Menu } from './Menu';
import { Popover } from './Popover';

export function TrackLabel({ track }: { track: TrackId }) {
  const def = TRACK_BY_ID[track];
  const muted = useApp((s) => s.project.tracks[track].muted);
  const soloed = useApp((s) => s.ui.solo.includes(track));
  const othersSoloed = useApp((s) => s.ui.solo.some((t) => t !== track));
  // The bar for "Clear row" is captured when the menu opens; Follow may move the view meanwhile.
  const [menu, setMenu] = useState<{ rect: DOMRect; patternId: string; barIndex: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const press = useRef<{ x: number; y: number; timer: number; long: boolean } | null>(null);

  const openMenu = () => {
    if (!button.current) return;
    const { ui } = appStore.getState();
    setMenu({ rect: button.current.getBoundingClientRect(), patternId: ui.patternId, barIndex: ui.barIndex });
  };
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
        data-solo={soloed || undefined}
        aria-label={`${def.label}${muted ? ' (muted)' : ''}${soloed ? ' (solo)' : ''}`}
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
        <Popover anchor={menu.rect} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              { label: muted ? 'Unmute' : 'Mute', onSelect: () => st().apply((p) => setTrackMuted(p, track, !muted)) },
              { label: soloed ? 'Unsolo' : 'Solo', onSelect: () => actions.toggleSolo(track) },
              ...(othersSoloed ? [{ label: 'Unsolo all', onSelect: actions.clearSolo }] : []),
              { label: 'Hide track', onSelect: () => st().apply((p) => setTrackHidden(p, track, true)) },
              {
                label: 'Clear row in this bar',
                onSelect: () => st().apply((p) => clearRow(p, menu.patternId, menu.barIndex, track)),
              },
            ]}
          />
        </Popover>
      )}
    </>
  );
}
