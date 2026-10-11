import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { transport } from '../audio/transport';
import { setVelocity } from '../model/ops';
import { DEFAULT_VELOCITY } from '../model/timing';
import type { Project, TrackId } from '../model/types';
import { appStore } from '../state/store';
import { classifyDrag, paintValue, slideVelocity, volumeFromY } from './gestures';
import type { BubbleHandle } from './VolumeBubble';

interface CellHit {
  el: HTMLElement;
  track: TrackId;
  beat: number;
  cell: number;
}

interface Active {
  pointerId: number;
  hit: CellHit;
  /** The bar being edited is captured at pointer-down so follow-mode bar switches can't redirect edits. */
  patternId: string;
  barIndex: number;
  startX: number;
  startY: number;
  startVelocity: number;
  kind: 'pending' | 'slide' | 'paint' | 'volume';
  value: number;
}

export function cellFromElement(el: Element | null | undefined): CellHit | null {
  const c = el?.closest?.<HTMLElement>('[data-cell]');
  if (!c || !c.dataset.track) return null;
  return { el: c, track: c.dataset.track as TrackId, beat: Number(c.dataset.beat), cell: Number(c.dataset.cell) };
}

export function useGridGestures(bubble: RefObject<BubbleHandle | null>) {
  const active = useRef<Active | null>(null);

  return useMemo(() => {
    const store = appStore;
    const velocityOf = (a: Pick<Active, 'patternId' | 'barIndex'>, h: CellHit) => {
      const pat = store.getState().project.patterns.find((p) => p.id === a.patternId);
      return pat?.bars[a.barIndex]?.beats[h.beat]?.cells[h.track]?.[h.cell] ?? 0;
    };
    const edit = (a: Active, h: CellHit, v: number) => (p: Project) =>
      setVelocity(p, a.patternId, a.barIndex, h.beat, h.track, h.cell, v);
    const hitAt = (x: number, y: number) => cellFromElement(document.elementFromPoint?.(x, y));
    const applyVolume = (a: Active, h: CellHit, clientY: number) => {
      if (velocityOf(a, h) <= 0) return;
      const r = h.el.getBoundingClientRect();
      const v = volumeFromY(r.height > 0 ? (clientY - r.top) / r.height : 0.5);
      a.value = v;
      store.getState().applyTransient(edit(a, h, v));
      bubble.current?.show(r, v);
    };

    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (active.current) return; // a second finger is ignored
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const hit = cellFromElement(e.target as Element);
        if (!hit) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const { ui } = store.getState();
        const a: Active = {
          pointerId: e.pointerId, hit, patternId: ui.patternId, barIndex: ui.barIndex,
          startX: e.clientX, startY: e.clientY, startVelocity: 0,
          kind: ui.editMode === 'volume' ? 'volume' : 'pending', value: 0,
        };
        a.startVelocity = velocityOf(a, hit);
        a.value = a.startVelocity;
        active.current = a;
        if (a.kind === 'volume') {
          store.getState().beginGesture();
          applyVolume(a, hit, e.clientY);
        }
      },

      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        if (a.kind === 'volume') {
          const h = hitAt(e.clientX, e.clientY);
          if (h && h.track === a.hit.track) applyVolume(a, h, e.clientY);
          return;
        }
        if (a.kind === 'pending') {
          const kind = classifyDrag(e.clientX - a.startX, e.clientY - a.startY);
          if (kind === 'pending') return;
          a.kind = kind;
          store.getState().beginGesture();
          if (kind === 'paint') {
            a.value = paintValue(a.startVelocity);
            store.getState().applyTransient(edit(a, a.hit, a.value));
          }
        }
        if (a.kind === 'slide') {
          const v = slideVelocity(a.startVelocity, a.startY - e.clientY);
          a.value = v;
          store.getState().applyTransient(edit(a, a.hit, v));
          bubble.current?.show(a.hit.el.getBoundingClientRect(), v);
        } else if (a.kind === 'paint') {
          const h = hitAt(e.clientX, e.clientY);
          if (h && h.track === a.hit.track) store.getState().applyTransient(edit(a, h, a.value));
        }
      },

      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        active.current = null;
        bubble.current?.hide();
        const s = store.getState();
        if (a.kind === 'pending') {
          const next = a.startVelocity > 0 ? 0 : DEFAULT_VELOCITY;
          s.apply(edit(a, a.hit, next));
          if (next > 0 && !s.ui.playing) void transport.audition(a.hit.track, next);
          return;
        }
        s.endGesture();
        if (a.kind === 'slide' && !s.ui.playing) void transport.audition(a.hit.track, a.value);
      },

      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        active.current = null;
        bubble.current?.hide();
        store.getState().endGesture();
      },
    };
  }, [bubble]);
}
