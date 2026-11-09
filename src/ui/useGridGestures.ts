import { useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { transport } from '../audio/transport';
import { setVelocity, toggleSplit } from '../model/ops';
import { velocityAt } from '../model/timing';
import type { Half, Project, TrackId } from '../model/types';
import { appStore } from '../state/store';
import { classifyDrag, defaultVelocity, LONG_PRESS_MS, paintValue, slideVelocity, volumeFromY } from './gestures';
import type { BubbleHandle } from './VolumeBubble';

interface CellHit {
  el: HTMLElement;
  track: TrackId;
  beat: number;
  cell: number;
  /** 1 for the right half of a split cell; 0 for a whole cell or a left half. */
  half: Half;
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
  /** Last cell a paint/volume drag reached, so fast moves can fill the cells in between. */
  last: CellHit | null;
  lastValue: number;
  holdTimer?: ReturnType<typeof setTimeout>;
  /** The cell (or split pair) showing the hold ring. */
  holdEl?: Element;
}

export function cellFromElement(el: Element | null | undefined): CellHit | null {
  const c = el?.closest?.<HTMLElement>('[data-cell]');
  if (!c || !c.dataset.track) return null;
  return {
    el: c, track: c.dataset.track as TrackId, beat: Number(c.dataset.beat), cell: Number(c.dataset.cell),
    half: c.dataset.half === '1' ? 1 : 0,
  };
}

export function useGridGestures(bubble: RefObject<BubbleHandle | null>) {
  const active = useRef<Active | null>(null);

  return useMemo(() => {
    const store = appStore;
    const velocityOf = (a: Pick<Active, 'patternId' | 'barIndex'>, h: CellHit) => {
      const pat = store.getState().project.patterns.find((p) => p.id === a.patternId);
      const beat = pat?.bars[a.barIndex]?.beats[h.beat];
      return beat ? (velocityAt(beat, h.track, h.cell, h.half) ?? 0) : 0;
    };
    const edit = (a: Active, h: CellHit, v: number) => (p: Project) =>
      setVelocity(p, a.patternId, a.barIndex, h.beat, h.track, h.cell, v, h.half);
    const endHold = (a: Active) => {
      clearTimeout(a.holdTimer);
      a.holdEl?.removeAttribute('data-holding');
      a.holdEl = undefined;
    };
    /**
     * A press that stays put for LONG_PRESS_MS splits the cell, or merges a split one (in the bar it started in).
     * That ends the gesture: the pressed element is replaced by the new layout, so lifting the finger does nothing.
     */
    const startHold = (a: Active) => {
      a.holdEl = a.hit.el.closest('[data-pair]') ?? a.hit.el;
      a.holdEl.setAttribute('data-holding', '');
      a.holdTimer = setTimeout(() => {
        endHold(a);
        if (active.current !== a || a.kind !== 'pending') return;
        active.current = null;
        const { beat, track, cell } = a.hit;
        store.getState().apply((p) => toggleSplit(p, a.patternId, a.barIndex, beat, track, cell));
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    };
    const hitAt = (x: number, y: number) => cellFromElement(document.elementFromPoint?.(x, y));
    const applyMany = (a: Active, updates: [CellHit, number][]) => {
      if (updates.length === 0) return;
      store.getState().applyTransient((p) => updates.reduce((acc, [h, v]) => edit(a, h, v)(acc), p));
    };
    /** Cells of the gesture's row from `from` to `to`, inclusive, in drag order. */
    const rowSpan = (a: Active, from: CellHit, to: CellHit): CellHit[] => {
      const row = a.hit.el.closest('[data-row]');
      const cells = Array.from(row?.querySelectorAll<HTMLElement>('[data-cell]') ?? []);
      const i0 = cells.indexOf(from.el);
      const i1 = cells.indexOf(to.el);
      if (i0 < 0 || i1 < 0) return [from, to];
      const step = i1 >= i0 ? 1 : -1;
      const out: CellHit[] = [];
      for (let i = i0; i !== i1 + step; i += step) {
        const h = cellFromElement(cells[i]);
        if (h) out.push(h);
      }
      return out;
    };
    const paintTo = (a: Active, h: CellHit) => {
      // Adding notes puts ghost volume into right halves; erasing clears everything passed.
      applyMany(a, rowSpan(a, a.last ?? a.hit, h).map((c): [CellHit, number] => [c, a.value > 0 ? defaultVelocity(c.half) : 0]));
      a.last = h;
    };
    /** Volume mode: sets the touched note and interpolates the notes skipped since the last move. */
    const volumeTo = (a: Active, h: CellHit, clientY: number) => {
      const r = h.el.getBoundingClientRect();
      const v = volumeFromY(r.height > 0 ? (clientY - r.top) / r.height : 0.5);
      const from = a.last;
      const span = from ? rowSpan(a, from, h) : [h];
      const n = span.length - 1;
      const updates = span
        .map((c, k): [CellHit, number] => [c, from && n > 0 ? Math.round(a.lastValue + ((v - a.lastValue) * k) / n) : v])
        .filter(([c], k) => (!from || k > 0) && velocityOf(a, c) > 0);
      applyMany(a, updates);
      a.last = h;
      a.lastValue = v;
      a.value = v;
      if (velocityOf(a, h) > 0) bubble.current?.show(r, v);
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
          kind: ui.editMode === 'volume' ? 'volume' : 'pending', value: 0, last: null, lastValue: 0,
        };
        a.startVelocity = velocityOf(a, hit);
        a.value = a.startVelocity;
        active.current = a;
        if (a.kind === 'volume') {
          store.getState().beginGesture();
          volumeTo(a, hit, e.clientY);
        } else {
          startHold(a);
        }
      },

      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        if (a.kind === 'volume') {
          const h = hitAt(e.clientX, e.clientY);
          if (h && h.track === a.hit.track) volumeTo(a, h, e.clientY);
          return;
        }
        if (a.kind === 'pending') {
          const kind = classifyDrag(e.clientX - a.startX, e.clientY - a.startY);
          if (kind === 'pending') return;
          endHold(a);
          a.kind = kind;
          store.getState().beginGesture();
          if (kind === 'paint') {
            a.value = paintValue(a.startVelocity);
            paintTo(a, a.hit);
          }
        }
        if (a.kind === 'slide') {
          const v = slideVelocity(a.startVelocity, a.startY - e.clientY, defaultVelocity(a.hit.half));
          a.value = v;
          store.getState().applyTransient(edit(a, a.hit, v));
          bubble.current?.show(a.hit.el.getBoundingClientRect(), v);
        } else if (a.kind === 'paint') {
          const h = hitAt(e.clientX, e.clientY);
          if (h && h.track === a.hit.track) paintTo(a, h);
        }
      },

      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        active.current = null;
        endHold(a);
        bubble.current?.hide();
        const s = store.getState();
        if (a.kind === 'pending') {
          const next = a.startVelocity > 0 ? 0 : defaultVelocity(a.hit.half);
          s.apply(edit(a, a.hit, next));
          if (next > 0 && !s.ui.playing) void transport.audition(a.hit.track, next);
          return;
        }
        s.endGesture();
        if (a.kind === 'slide' && !s.ui.playing) void transport.audition(a.hit.track, a.value);
      },

      /** A long press on a cell is ours (it splits the cell); the browser's own long-press menu would cut it short. */
      onContextMenu(e: ReactMouseEvent<HTMLElement>) {
        if (cellFromElement(e.target as Element)) e.preventDefault();
      },

      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        const a = active.current;
        if (!a || e.pointerId !== a.pointerId) return;
        active.current = null;
        endHold(a);
        bubble.current?.hide();
        store.getState().endGesture();
      },
    };
  }, [bubble]);
}
