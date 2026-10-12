import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { transport } from '../audio/transport';
import * as ops from '../model/ops';
import { arrangeSong, MAX_REPEAT, moveRun, removeRun, setRunPattern, setRunRepeat } from '../model/songRuns';
import { clamp, TICKS_PER_BAR } from '../model/timing';
import * as actions from '../state/actions';
import { appStore, useApp } from '../state/store';
import { Menu, type MenuItem } from './Menu';
import { Popover } from './Popover';
import styles from './SongView.module.css';
import { useReorder } from './useReorder';

const PATTERN_COLORS = ['#ff6b3d', '#4fb6e8', '#a77bf3', '#f5c542', '#3ddc97', '#ff4f7b', '#7d8cff', '#e88f4f'];
const MIN_BAR_PX = 48;
/** Gap between neighbouring blocks. */
const GAP = 3;

type Open = { run: number; rect: DOMRect } | null;
interface Stretch {
  run: number;
  count: number;
  pointerId: number;
  x: number;
  base: number;
  /** Pixels per bar, frozen while dragging so the edge stays under the finger. */
  barPx: number;
}

const duration = (bars: number, bpm: number) => {
  const s = Math.round((bars * 4 * 60) / bpm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function SongView() {
  const project = useApp((s) => s.project);
  const scroller = useRef<HTMLDivElement>(null);
  const playheadEl = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open>(null);
  const [width, setWidth] = useState(0);
  const [stretch, setStretch] = useState<Stretch | null>(null);
  const apply = appStore.getState().apply;

  // While an edge is dragged, lay out the song as it would be after the drop.
  const shown = stretch ? setRunRepeat(project, stretch.run, stretch.count) : project;
  const { runs, totalBars, stepStartBar } = arrangeSong(shown);
  const barPx = stretch?.barPx ?? Math.max(MIN_BAR_PX, totalBars > 0 ? width / totalBars : 0);
  const patternOf = (id: string) => project.patterns.find((p) => p.id === id);
  const colorOf = (id: string) => PATTERN_COLORS[Math.max(0, project.patterns.findIndex((p) => p.id === id)) % PATTERN_COLORS.length];

  useEffect(() => {
    const sc = scroller.current;
    if (!sc || typeof ResizeObserver === 'undefined') return;
    const measure = () => setWidth(sc.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sc);
    return () => observer.disconnect();
  }, []);

  const openRunMenu = (run: number) => {
    const el = scroller.current?.querySelector(`[data-index="${run}"]`);
    if (el) setOpen({ run, rect: el.getBoundingClientRect() });
  };
  const { dragIndex, itemProps } = useReorder({
    scroller,
    onTap: openRunMenu,
    onMove: (from, to) => apply((p) => moveRun(p, from, to)),
  });

  // Playhead line, moved directly in the DOM every frame.
  const layoutRef = useRef({ stepStartBar, barPx });
  layoutRef.current = { stepStartBar, barPx };
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = playheadEl.current;
      if (!el) return;
      const ph = transport.playhead();
      const { stepStartBar: starts, barPx: px } = layoutRef.current;
      const start = ph && ph.ref.stepIndex >= 0 ? starts[ph.ref.stepIndex] : undefined;
      if (!ph || start === undefined) {
        el.style.display = 'none';
        return;
      }
      const x = (start + ph.ref.barIndex + ph.tick / TICKS_PER_BAR) * px;
      el.style.display = 'block';
      el.style.transform = `translateX(${x}px)`;
      const sc = scroller.current;
      if (sc && appStore.getState().ui.follow && (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 20)) {
        sc.scrollLeft = x - 40;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleProps = (run: number, count: number) => ({
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      e.stopPropagation();
      if (stretch || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setStretch({ run, count, pointerId: e.pointerId, x: e.clientX, base: count, barPx });
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      e.stopPropagation();
      if (!stretch || e.pointerId !== stretch.pointerId) return;
      const perRepeat = (patternOf(project.song[runs[stretch.run].start].patternId)?.bars.length ?? 1) * stretch.barPx;
      const next = clamp(stretch.base + Math.round((e.clientX - stretch.x) / perRepeat), 1, MAX_REPEAT);
      if (next !== stretch.count) setStretch({ ...stretch, count: next });
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      e.stopPropagation();
      if (!stretch || e.pointerId !== stretch.pointerId) return;
      setStretch(null);
      apply((p) => setRunRepeat(p, stretch.run, stretch.count));
    },
    onPointerCancel() {
      setStretch(null);
    },
  });

  const playFrom = (bar: number) => {
    appStore.getState().setUi({ playMode: 'song' });
    transport.playFrom(bar);
  };

  let menuItems: (MenuItem | 'separator')[] = [];
  const openRun = open ? runs[open.run] : undefined;
  const openPattern = openRun && patternOf(openRun.patternId);
  if (open && openRun && openPattern) {
    const counts = [...new Set([1, 2, 3, 4, openRun.count])].sort((a, b) => a - b);
    menuItems = [
      {
        label: `Edit pattern ${openPattern.name}`,
        onSelect: () => {
          actions.selectPattern(openPattern.id);
          appStore.getState().setUi({ view: 'grid', playMode: 'pattern' });
        },
      },
      'separator',
      ...counts.map((n) => ({
        label: `Repeat ×${n}`,
        checked: n === openRun.count,
        onSelect: () => apply((p) => setRunRepeat(p, open.run, n)),
      })),
      'separator',
      ...project.patterns.map((p) => ({
        label: `Use pattern ${p.name}`,
        checked: p.id === openRun.patternId,
        onSelect: () => apply((x) => setRunPattern(x, open.run, p.id)),
      })),
      'separator',
      { label: 'Remove', danger: true, onSelect: () => apply((p) => removeRun(p, open.run)) },
    ];
  }

  return (
    <div className={styles.song}>
      <div className={styles.header}>
        <h2>Song</h2>
        <span className={styles.hint}>
          {totalBars === 0
            ? 'Tap a pattern below to start the song.'
            : `${totalBars} bars · ${duration(totalBars, project.bpm)} · tap a block for options, hold to move it, drag its edge to repeat`}
        </span>
        <button onClick={() => appStore.getState().setUi({ view: 'grid' })}>Back to grid</button>
      </div>
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.timeline} style={{ width: totalBars * barPx }}>
          <div className={styles.ruler}>
            {Array.from({ length: totalBars }, (_, i) => (
              <button key={i} aria-label={`Play from bar ${i + 1}`} style={{ left: i * barPx, width: barPx }} onClick={() => playFrom(i)}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className={styles.lane}>
            {runs.map((run, i) => {
              const pat = patternOf(run.patternId);
              if (!pat || run.bars === 0) return null;
              const label = `Block ${i + 1}: pattern ${pat.name}${run.count > 1 ? ` ×${run.count}` : ''}, bars ${run.startBar + 1}–${run.startBar + run.bars}`;
              return (
                <button
                  key={shown.song[run.start].id}
                  className={`${styles.block} ${dragIndex === i ? styles.dragging : ''}`}
                  style={{ left: run.startBar * barPx, width: run.bars * barPx - GAP, '--c': colorOf(run.patternId) } as CSSProperties}
                  aria-label={label}
                  {...itemProps(i)}
                >
                  {Array.from({ length: run.bars - 1 }, (_, k) => (
                    <i
                      key={k}
                      className={(k + 1) % run.patternBars === 0 ? styles.repeatLine : styles.barLine}
                      style={{ left: (k + 1) * barPx - 2 }}
                    />
                  ))}
                  <span className={styles.blockName}>{pat.name}</span>
                  {run.count > 1 && <span className={styles.repeat}>×{run.count}</span>}
                  <span className={styles.handle} aria-hidden {...handleProps(i, run.count)} />
                </button>
              );
            })}
          </div>
          <div ref={playheadEl} className={styles.playhead} />
        </div>
      </div>
      <div className={styles.palette}>
        <span className={styles.paletteLabel}>Add:</span>
        {project.patterns.map((p) => (
          <button
            key={p.id}
            aria-label={`Add pattern ${p.name}`}
            style={{ '--c': colorOf(p.id) } as CSSProperties}
            onClick={() => apply((x) => ops.appendSongStep(x, p.id))}
          >
            <b>{p.name}</b> {p.bars.length} bar{p.bars.length === 1 ? '' : 's'}
          </button>
        ))}
      </div>
      {open && menuItems.length > 0 && (
        <Popover anchor={open.rect} onClose={() => setOpen(null)}>
          <Menu items={menuItems} onClose={() => setOpen(null)} />
        </Popover>
      )}
    </div>
  );
}
