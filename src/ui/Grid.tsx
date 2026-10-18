import { useCallback, useRef } from 'react';
import type { PlayheadEvent } from '../audio/scheduler';
import { isAudible } from '../model/timeline';
import { cellContainingTick, TICKS_PER_BEAT } from '../model/timing';
import { TRACKS } from '../model/tracks';
import { currentBar, useApp, type AppState } from '../state/store';
import { BeatHeader } from './BeatHeader';
import { BeatGroup } from './Cell';
import styles from './Grid.module.css';
import { TrackLabel } from './TrackLabel';
import { useGridGestures } from './useGridGestures';
import { usePlayheadMarker } from './usePlayheadMarker';
import { VolumeBubble, type BubbleHandle } from './VolumeBubble';

export function Grid() {
  const bar = useApp(currentBar);
  const tracks = useApp((s) => s.project.tracks);
  const solo = useApp((s) => s.ui.solo);
  const editMode = useApp((s) => s.ui.editMode);
  const bubble = useRef<BubbleHandle>(null);
  const rows = useRef<HTMLDivElement>(null);
  const handlers = useGridGestures(bubble);

  const selectPlaying = useCallback((ph: PlayheadEvent, s: AppState) => {
    if (ph.ref.patternId !== s.ui.patternId || ph.ref.barIndex !== s.ui.barIndex) return null;
    const beat = Math.floor(ph.tick / TICKS_PER_BEAT);
    const div = currentBar(s).beats[beat].div;
    return `[data-beat="${beat}"][data-cell="${cellContainingTick(div, ph.tick % TICKS_PER_BEAT)}"]`;
  }, []);
  usePlayheadMarker(rows, styles.playing, selectPlaying);

  const visible = TRACKS.filter((t) => !tracks[t.id].hidden);
  return (
    <div className={styles.grid} data-mode={editMode}>
      <BeatHeader />
      <div ref={rows} className={styles.rows} data-testid="grid-rows" {...handlers}>
        {visible.map((t) => (
          <div key={t.id} className={styles.row} data-silent={!isAudible(tracks, solo, t.id) || undefined}>
            <TrackLabel track={t.id} />
            {bar.beats.map((beat, i) => (
              <BeatGroup key={i} track={t.id} beatIndex={i} beat={beat} color={t.color} showValues={editMode === 'volume'} />
            ))}
          </div>
        ))}
        {visible.length === 0 && <p className={styles.empty}>All tracks are hidden. Use ⋯ → Tracks to show some.</p>}
      </div>
      <VolumeBubble ref={bubble} />
    </div>
  );
}
