import type { TrackId } from './types';

export interface TrackDef {
  id: TrackId;
  label: string;
  short: string;
  color: string;
  midi: number;
  /** VexFlow key on a percussion staff, e.g. 'g/5/x2' (x notehead) or 'c/5/x3' (circle-x). */
  notation: { key: string; voice: 'hands' | 'feet'; open?: boolean };
}

export const TRACKS: readonly TrackDef[] = [
  { id: 'crash', label: 'Crash', short: 'CR', color: '#f5c542', midi: 49, notation: { key: 'a/5/x2', voice: 'hands' } },
  { id: 'ride', label: 'Ride', short: 'RD', color: '#e0b04a', midi: 51, notation: { key: 'f/5/x2', voice: 'hands' } },
  { id: 'hhOpen', label: 'Open HH', short: 'OH', color: '#7ad3f0', midi: 46, notation: { key: 'g/5/x2', voice: 'hands', open: true } },
  { id: 'hhClosed', label: 'Closed HH', short: 'HH', color: '#4fb8e8', midi: 42, notation: { key: 'g/5/x2', voice: 'hands' } },
  { id: 'hhPedal', label: 'Pedal HH', short: 'PH', color: '#3a8fc0', midi: 44, notation: { key: 'd/4/x2', voice: 'feet' } },
  { id: 'snare', label: 'Snare', short: 'SN', color: '#ff6a3d', midi: 38, notation: { key: 'c/5', voice: 'hands' } },
  { id: 'crossStick', label: 'Cross-stick', short: 'XS', color: '#ff9a6b', midi: 37, notation: { key: 'c/5/x3', voice: 'hands' } },
  { id: 'tom1', label: 'Tom 1', short: 'T1', color: '#b48cff', midi: 48, notation: { key: 'e/5', voice: 'hands' } },
  { id: 'tom2', label: 'Tom 2', short: 'T2', color: '#9a70f0', midi: 45, notation: { key: 'd/5', voice: 'hands' } },
  { id: 'floorTom', label: 'Floor Tom', short: 'FT', color: '#7d55d6', midi: 43, notation: { key: 'a/4', voice: 'hands' } },
  { id: 'kick', label: 'Kick', short: 'KK', color: '#ff3d6e', midi: 36, notation: { key: 'f/4', voice: 'feet' } },
];

export const TRACK_IDS: readonly TrackId[] = TRACKS.map((t) => t.id);

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<TrackId, TrackDef>;

/** Playing the key track cuts off any ringing voices of the listed tracks. */
export const CHOKE_TARGETS: Partial<Record<TrackId, readonly TrackId[]>> = {
  hhClosed: ['hhOpen'],
  hhPedal: ['hhOpen'],
};

export const CHOKEABLE: ReadonlySet<TrackId> = new Set(Object.values(CHOKE_TARGETS).flat());
