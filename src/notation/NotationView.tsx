import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { transport } from '../audio/transport';
import { TICKS_PER_BAR } from '../model/timing';
import * as actions from '../state/actions';
import { appStore, currentPattern, useApp } from '../state/store';
import styles from './NotationView.module.css';
import { renderNotation, type BarLayout } from './renderNotation';

type VF = typeof import('vexflow/bravura');
let vexflow: Promise<VF> | null = null;

function loadVexFlow(): Promise<VF> {
  if (!vexflow) {
    // The bundle starts loading its fonts without waiting for them; measuring glyphs before they arrive
    // uses a fallback font's widths and pushes notes past their bar line.
    vexflow = import('vexflow/bravura').then(async (VF) => {
      await Promise.all(['30px Bravura', '12px Academico'].map((font) => document.fonts.load(font)));
      return VF;
    });
    vexflow.catch(() => {
      vexflow = null;
    });
  }
  return vexflow;
}

export function NotationView() {
  const pattern = useApp(currentPattern);
  const holder = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const layout = useRef<BarLayout[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    // The paper's padding (8px sides, 4px top and bottom) is not drawing area.
    const measure = () => setArea((prev) => {
      const next = { width: Math.floor(sc.clientWidth - 16), height: Math.floor(sc.clientHeight - 8) };
      return prev && prev.width === next.width && prev.height === next.height ? prev : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sc);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!area) return;
    let cancelled = false;
    loadVexFlow()
      .then((VF) => {
        if (cancelled || !holder.current) return;
        layout.current = renderNotation(holder.current, pattern, VF, area.width, area.height);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pattern, attempt, area]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = cursor.current;
      if (!el) return;
      const ph = transport.playhead();
      const s = appStore.getState();
      const bar = ph && ph.ref.patternId === currentPattern(s).id ? layout.current[ph.ref.barIndex] : undefined;
      if (!ph || !bar) {
        el.style.display = 'none';
        return;
      }
      const x = bar.noteStart + (ph.tick / TICKS_PER_BAR) * (bar.noteEnd - bar.noteStart);
      el.style.display = 'block';
      el.style.height = `${bar.cursorHeight}px`;
      el.style.transform = `translate(${x}px, ${bar.cursorTop}px)`;
      const sc = scroller.current;
      if (sc && s.ui.follow && (bar.top < sc.scrollTop || bar.bottom > sc.scrollTop + sc.clientHeight)) sc.scrollTop = bar.top;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const openBar = (e: MouseEvent<HTMLDivElement>) => {
    const holderEl = holder.current;
    if (!holderEl) return;
    const rect = holderEl.getBoundingClientRect();
    const [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
    const index = layout.current.findIndex((b) => x >= b.left && x < b.right && y >= b.top && y < b.bottom);
    if (index < 0) return;
    actions.selectBar(index);
    appStore.getState().setUi({ view: 'grid' });
  };

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <h2>Pattern {pattern.name} — notation</h2>
        <span className={styles.hint}>Tap a bar to edit it</span>
        <button onClick={() => appStore.getState().setUi({ view: 'grid' })}>Back to grid</button>
      </div>
      {/* Status lines live inside the scroller so they don't resize it (a resize redraws the notation). */}
      <div ref={scroller} className={styles.scroller}>
        {status === 'loading' && <p className={styles.status}>Loading notation…</p>}
        {status === 'error' && (
          <p className={styles.status}>
            Couldn't load notation. <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
          </p>
        )}
        <div className={styles.paper} onClick={openBar}>
          <div ref={holder} data-testid="notation" />
          <div ref={cursor} className={styles.cursor} />
        </div>
      </div>
    </div>
  );
}
