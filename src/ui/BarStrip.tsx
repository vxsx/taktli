import { useCallback, useMemo, useRef } from 'react';
import type { PlayheadEvent } from '../audio/scheduler';
import { isAudible } from '../model/timeline';
import { TICKS_PER_BEAT } from '../model/timing';
import { TRACKS } from '../model/tracks';
import * as actions from '../state/actions';
import { appStore, currentPattern, useApp, type AppState } from '../state/store';
import styles from './BarStrip.module.css';
import { LongPressButton } from './LongPressButton';
import { MiniBar } from './MiniBar';
import { usePlayheadMarker } from './usePlayheadMarker';
import { useReorder } from './useReorder';

export function BarStrip() {
  const pattern = useApp(currentPattern);
  const barIndex = useApp((s) => s.ui.barIndex);
  const loopBar = useApp((s) => s.ui.loopBar);
  const follow = useApp((s) => s.ui.follow);
  const playing = useApp((s) => s.ui.playing);
  const settings = useApp((s) => s.project.tracks);
  const solo = useApp((s) => s.ui.solo);
  // Thumbnails skip rows the pattern never plays, so the notes that are there draw larger.
  const rows = useMemo(
    () => TRACKS.filter((t) => !settings[t.id].hidden && pattern.bars.some((bar) => bar.beats.some((b) => b.cells[t.id].some((v) => v > 0)))),
    [settings, pattern.bars],
  );
  const silent = useMemo(() => new Set(TRACKS.filter((t) => !isAudible(settings, solo, t.id)).map((t) => t.id)), [settings, solo]);
  const chips = useRef<HTMLDivElement>(null);
  const { dragIndex, itemProps } = useReorder({ scroller: chips, onTap: actions.selectBar, onMove: actions.moveBar });

  const selectPlaying = useCallback(
    (ph: PlayheadEvent, s: AppState) => (ph.ref.patternId === s.ui.patternId ? `[data-index="${ph.ref.barIndex}"]` : null),
    [],
  );
  usePlayheadMarker(chips, styles.playingChip, selectPlaying);
  const selectPlayingBeat = useCallback(
    (ph: PlayheadEvent, s: AppState) =>
      ph.ref.patternId === s.ui.patternId ? `[data-index="${ph.ref.barIndex}"] [data-mini-beat="${Math.floor(ph.tick / TICKS_PER_BEAT)}"]` : null,
    [],
  );
  usePlayheadMarker(chips, styles.miniBeatPlaying, selectPlayingBeat);

  const st = appStore.getState;
  return (
    <footer className={styles.strip}>
      <div ref={chips} className={styles.chips}>
        {pattern.bars.map((bar, i) => (
          <button
            key={bar.id}
            className={`${styles.chip} ${styles.barChip} ${i === barIndex ? styles.current : ''} ${dragIndex === i ? styles.dragging : ''}`}
            aria-label={`Bar ${i + 1}`}
            aria-current={i === barIndex}
            {...itemProps(i)}
          >
            <MiniBar bar={bar} tracks={rows} silent={silent} />
          </button>
        ))}
        <button className={styles.chip} aria-label="Add bar" onClick={actions.addBarAtEnd}>+</button>
      </div>
      <div className={styles.actions}>
        <button aria-pressed={loopBar} onClick={() => st().setUi({ loopBar: !loopBar })}>Loop bar</button>
        {playing && !follow && <button onClick={() => st().setUi({ follow: true })}>Follow</button>}
        <button onClick={actions.copyBar}>Copy</button>
        <LongPressButton title="Hold to paste as a new bar" onClick={actions.pasteBar} onLongPress={actions.pasteBarAsNew}>Paste</LongPressButton>
        <button onClick={actions.duplicateCurrentBar}>Duplicate</button>
        <LongPressButton title="Hold to roll every bar of the pattern" onClick={actions.randomizeCurrentBar} onLongPress={actions.randomizePattern}>Random</LongPressButton>
        <button onClick={actions.clearCurrentBar}>Clear</button>
        <button onClick={actions.deleteCurrentBar} disabled={pattern.bars.length <= 1}>Delete</button>
      </div>
    </footer>
  );
}
