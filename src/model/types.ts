export type TrackId =
  | 'crash' | 'ride' | 'hhOpen' | 'hhClosed' | 'hhPedal' | 'snare'
  | 'crossStick' | 'tom1' | 'tom2' | 'floorTom' | 'kick';

/** Cells per beat: 16ths | 8th triplets | 16th triplets. */
export type Subdivision = 4 | 3 | 6;

/** Integer 0..127; 0 means "no note". */
export type Velocity = number;

export interface Beat {
  div: Subdivision;
  /** Every array has length === div. */
  cells: Record<TrackId, Velocity[]>;
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
  version: 1;
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
