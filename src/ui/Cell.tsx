import { memo } from 'react';
import type { Beat, TrackId } from '../model/types';
import styles from './Grid.module.css';

interface CellProps {
  track: TrackId;
  beat: number;
  cell: number;
  velocity: number;
  color: string;
  showValue: boolean;
}

export const Cell = memo(function Cell({ track, beat, cell, velocity, color, showValue }: CellProps) {
  return (
    <div
      className={styles.cell}
      data-track={track}
      data-beat={beat}
      data-cell={cell}
      data-on={velocity > 0 ? '' : undefined}
      aria-label={`${track} beat ${beat + 1} step ${cell + 1}${velocity > 0 ? ` volume ${velocity}` : ''}`}
    >
      {velocity > 0 && <div className={styles.fill} style={{ height: `${(velocity / 127) * 100}%`, background: color }} />}
      {showValue && velocity > 0 && <span className={styles.value}>{velocity}</span>}
    </div>
  );
});

interface BeatGroupProps {
  track: TrackId;
  beatIndex: number;
  beat: Beat;
  color: string;
  showValues: boolean;
}

export const BeatGroup = memo(function BeatGroup({ track, beatIndex, beat, color, showValues }: BeatGroupProps) {
  return (
    <div className={`${styles.beat} ${beatIndex % 2 === 1 ? styles.beatAlt : ''}`}>
      {beat.cells[track].map((v, i) => (
        <Cell key={i} track={track} beat={beatIndex} cell={i} velocity={v} color={color} showValue={showValues} />
      ))}
    </div>
  );
});
