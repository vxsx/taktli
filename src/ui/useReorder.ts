import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { DRAG_THRESHOLD, LONG_PRESS_MS } from './gestures';

interface Press {
  index: number;
  pointerId: number;
  x: number;
  y: number;
  lastX: number;
  timer: number;
  mode: 'press' | 'scroll' | 'drag';
}

/**
 * Tap / long-press-drag reordering for a horizontal chip list. Chips use `touch-action: none`,
 * so horizontal swipes are turned into manual scrolling of `scroller`.
 */
export function useReorder({ scroller, onTap, onMove }: {
  scroller: RefObject<HTMLElement | null>;
  onTap(index: number): void;
  onMove(from: number, to: number): void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const press = useRef<Press | null>(null);

  const end = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setDragIndex(null);
  };
  const indexAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint?.(x, y)?.closest?.<HTMLElement>('[data-index]');
    return el ? Number(el.dataset.index) : null;
  };

  const itemProps = (index: number) => ({
    'data-index': index,
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (press.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const p: Press = { index, pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, timer: 0, mode: 'press' };
      p.timer = window.setTimeout(() => {
        if (press.current === p && p.mode === 'press') {
          p.mode = 'drag';
          setDragIndex(index);
        }
      }, LONG_PRESS_MS);
      press.current = p;
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (p.mode === 'press' && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_THRESHOLD) {
        p.mode = 'scroll';
        window.clearTimeout(p.timer);
      }
      if (p.mode === 'scroll' && scroller.current) scroller.current.scrollLeft -= e.clientX - p.lastX;
      p.lastX = e.clientX;
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const { mode, index: from } = p;
      end();
      if (mode === 'press') onTap(from);
      else if (mode === 'drag') {
        const to = indexAt(e.clientX, e.clientY);
        if (to !== null && to !== from) onMove(from, to);
      }
    },
    onPointerCancel() {
      end();
    },
    onContextMenu(e: ReactMouseEvent) {
      e.preventDefault();
    },
  });

  return { dragIndex, itemProps };
}
