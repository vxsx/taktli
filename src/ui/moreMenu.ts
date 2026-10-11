import type { View } from '../state/store';
import type { MenuItem } from './Menu';
import { openSwingSheet } from './SwingSheet';
import { openTracksSheet } from './TracksSheet';

export function moreMenuItems(_view: View): (MenuItem | 'separator')[] {
  return [
    { label: 'Swing…', onSelect: openSwingSheet },
    { label: 'Tracks…', onSelect: openTracksSheet },
  ];
}
