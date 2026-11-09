export type TrackId =
  | 'crash' | 'ride' | 'hhOpen' | 'hhClosed' | 'hhPedal' | 'snare'
  | 'crossStick' | 'tom1' | 'tom2' | 'floorTom' | 'kick';

/** Integer 0..127; 0 means "no note". */
export type Velocity = number;

/** Which 32nd of a 16th cell: 0 is the cell itself (or its left half when split), 1 is the right half. */
export type Half = 0 | 1;

/** null: the cell is whole. A number: the cell is split into two 32nds and this is the right half (0 = empty). */
export type Split = Velocity | null;

export interface Beat {
  /** Four 16th cells per track; a split cell keeps its left half here. */
  cells: Record<TrackId, Velocity[]>;
  /** Per track, one entry per cell (length 4). Older app versions ignore this field and read `cells` as plain 16ths. */
  splits: Record<TrackId, Split[]>;
}

export interface Bar {
  id: string;
  beats: [Beat, Beat, Beat, Beat];
}

export interface Pattern {
  id: string;
  name: string;
  /** 0..100 */
  swing: number;
  /** length >= 1 */
  bars: Bar[];
}

export interface SongStep {
  id: string;
  patternId: string;
}

export interface TrackSettings {
  muted: boolean;
  hidden: boolean;
}

export type KitName = 'acoustic' | 'electronic';

export interface Project {
  version: 2;
  id: string;
  name: string;
  /** integer 40..240 */
  bpm: number;
  kit: KitName;
  /** length >= 1 */
  patterns: Pattern[];
  song: SongStep[];
  tracks: Record<TrackId, TrackSettings>;
  createdAt: number;
  updatedAt: number;
}
