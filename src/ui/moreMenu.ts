import * as actions from '../state/actions';
import { appStore, type View } from '../state/store';
import type { MenuItem } from './Menu';
import { promptText } from './modal';
import { openProjectsSheet } from './ProjectsSheet';
import { openSwingSheet } from './SwingSheet';
import { openTracksSheet } from './TracksSheet';

export function moreMenuItems(view: View): (MenuItem | 'separator')[] {
  const setView = (v: View) => () => appStore.getState().setUi({ view: v });
  return [
    { label: 'Projects…', onSelect: openProjectsSheet },
    {
      label: 'Rename project…',
      onSelect: async () => {
        const p = appStore.getState().project;
        const name = await promptText({ title: 'Rename project', initial: p.name, confirmLabel: 'Rename' });
        if (name) actions.renameProject(p.id, name);
      },
    },
    'separator',
    { label: 'Grid', checked: view === 'grid', onSelect: setView('grid') },
    {
      label: 'Song',
      checked: view === 'song',
      // Play in the song view plays the song (falls back to pattern mode while the song is empty).
      onSelect: () => appStore.getState().setUi({ view: 'song', playMode: 'song' }),
    },
    'separator',
    { label: 'Swing…', onSelect: openSwingSheet },
    { label: 'Tracks…', onSelect: openTracksSheet },
    'separator',
    { label: 'Share link', onSelect: () => void actions.shareProject() },
    { label: 'Export MIDI', onSelect: actions.exportMidiFile },
  ];
}
