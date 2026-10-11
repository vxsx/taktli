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
    vexflow = import('vexflow/bravura');
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

  useEffect(() => {
    let cancelled = false;
    loadVexFlow()
      .then((VF) => {
        if (cancelled || !holder.current) return;
        layout.current = renderNotation(holder.current, pattern, VF);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pattern, attempt]);

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
      el.style.transform = `translateX(${x}px)`;
      const sc = scroller.current;
      if (sc && s.ui.follow && (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = x - 60;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const openBar = (e: MouseEvent<HTMLDivElement>) => {
    const holderEl = holder.current;
    if (!holderEl) return;
    const x = e.clientX - holderEl.getBoundingClientRect().left;
    const index = layout.current.findIndex((b) => x >= b.left && x < b.right);
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
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.paper} onClick={openBar}>
          <div ref={holder} data-testid="notation" />
          <div ref={cursor} className={styles.cursor} />
        </div>
      </div>
      {status === 'loading' && <p className={styles.status}>Loading notation…</p>}
      {status === 'error' && (
        <p className={styles.status}>
          Couldn't load notation. <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
        </p>
      )}
    </div>
  );
}
