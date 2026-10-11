import { useEffect, useRef, useState } from 'react';
import { transport } from '../audio/transport';
import * as ops from '../model/ops';
import { TICKS_PER_BAR } from '../model/timing';
import * as actions from '../state/actions';
import { appStore, useApp } from '../state/store';
import { Menu, type MenuItem } from './Menu';
import { Popover } from './Popover';
import styles from './SongView.module.css';
import { useReorder } from './useReorder';

type Open = { kind: 'add'; rect: DOMRect } | { kind: 'step'; index: number; rect: DOMRect } | null;

export function SongView() {
  const song = useApp((s) => s.project.song);
  const patterns = useApp((s) => s.project.patterns);
  const scroller = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const apply = appStore.getState().apply;

  const openStepMenu = (index: number) => {
    const el = scroller.current?.querySelector(`[data-index="${index}"]`);
    if (el) setOpen({ kind: 'step', index, rect: el.getBoundingClientRect() });
  };
  const { dragIndex, itemProps } = useReorder({
    scroller,
    onTap: openStepMenu,
    onMove: (from, to) => apply((p) => ops.moveSongStep(p, from, to)),
  });

  // Highlight the playing step and show progress through it, without React renders.
  useEffect(() => {
    let raf = 0;
    let lit: HTMLElement | null = null;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ph = transport.playhead();
      const root = scroller.current;
      const next = ph && ph.ref.stepIndex >= 0 ? root?.querySelector<HTMLElement>(`[data-index="${ph.ref.stepIndex}"]`) ?? null : null;
      if (lit && lit !== next) {
        lit.classList.remove(styles.playingStep);
        lit.style.removeProperty('--progress');
      }
      lit = next;
      if (!next || !ph) return;
      const pat = appStore.getState().project.patterns.find((p) => p.id === ph.ref.patternId);
      const total = (pat?.bars.length ?? 1) * TICKS_PER_BAR;
      next.classList.add(styles.playingStep);
      next.style.setProperty('--progress', `${((ph.ref.barIndex * TICKS_PER_BAR + ph.tick) / total) * 100}%`);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const totalBars = song.reduce((n, step) => n + (patterns.find((p) => p.id === step.patternId)?.bars.length ?? 0), 0);

  let menuItems: (MenuItem | 'separator')[] = [];
  if (open?.kind === 'add') {
    menuItems = patterns.map((p) => ({ label: `Pattern ${p.name}`, onSelect: () => apply((x) => ops.appendSongStep(x, p.id)) }));
  } else if (open?.kind === 'step') {
    const step = song[open.index];
    const pat = patterns.find((p) => p.id === step?.patternId);
    if (step && pat) {
      menuItems = [
        {
          label: `Edit pattern ${pat.name}`,
          onSelect: () => {
            actions.selectPattern(pat.id);
            appStore.getState().setUi({ view: 'grid' });
          },
        },
        'separator',
        ...patterns.map((p) => ({
          label: `Use pattern ${p.name}`,
          checked: p.id === step.patternId,
          onSelect: () => apply((x) => ops.setSongStepPattern(x, step.id, p.id)),
        })),
        'separator',
        { label: 'Duplicate step', onSelect: () => apply((x) => ops.duplicateSongStep(x, step.id)) },
        { label: 'Remove step', danger: true, onSelect: () => apply((x) => ops.removeSongStep(x, step.id)) },
      ];
    }
  }

  return (
    <div className={styles.song}>
      <div className={styles.header}>
        <h2>Song</h2>
        <span className={styles.hint}>
          {song.length === 0
            ? 'Add patterns to build a song.'
            : `${song.length} steps · ${totalBars} bars · tap a step for options, hold to drag`}
        </span>
        <button onClick={() => appStore.getState().setUi({ view: 'grid' })}>Back to grid</button>
      </div>
      <div ref={scroller} className={styles.steps}>
        {song.map((step, i) => {
          const pat = patterns.find((p) => p.id === step.patternId);
          if (!pat) return null;
          return (
            <button
              key={step.id}
              className={`${styles.step} ${dragIndex === i ? styles.dragging : ''}`}
              aria-label={`Step ${i + 1}: pattern ${pat.name}`}
              {...itemProps(i)}
            >
              <span className={styles.stepName}>{pat.name}</span>
              <span className={styles.stepBars}>{pat.bars.length} bar{pat.bars.length === 1 ? '' : 's'}</span>
            </button>
          );
        })}
        <button className={styles.add} aria-label="Add step" onClick={(e) => setOpen({ kind: 'add', rect: e.currentTarget.getBoundingClientRect() })}>+</button>
      </div>
      {open && menuItems.length > 0 && (
        <Popover anchor={open.rect} onClose={close}>
          <Menu items={menuItems} onClose={close} />
        </Popover>
      )}
    </div>
  );
}
