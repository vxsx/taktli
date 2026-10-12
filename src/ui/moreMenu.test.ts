import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject, createProject } from '../model/factory';
import { appStore } from '../state/store';
import type { MenuItem } from './Menu';
import { moreMenuItems } from './moreMenu';

const item = (label: string) =>
  moreMenuItems(appStore.getState().ui.view).find((i): i is MenuItem => i !== 'separator' && i.label === label)!;

beforeEach(() => appStore.getState().loadProject(createDemoProject()));

describe('more menu', () => {
  it('switches play mode to song when opening the song view', () => {
    item('Song').onSelect();
    expect(appStore.getState().ui).toMatchObject({ view: 'song', playMode: 'song' });
  });

  it('keeps pattern play mode when the song is empty', () => {
    appStore.getState().loadProject(createProject());
    item('Song').onSelect();
    expect(appStore.getState().ui).toMatchObject({ view: 'song', playMode: 'pattern' });
  });

  it('shows the current kit and switches it as an undoable edit', () => {
    expect(item('Acoustic kit').checked).toBe(true);
    expect(item('Electronic kit').checked).toBe(false);
    item('Electronic kit').onSelect();
    expect(appStore.getState().project.kit).toBe('electronic');
    expect(item('Electronic kit').checked).toBe(true);
    appStore.getState().undo();
    expect(appStore.getState().project.kit).toBe('acoustic');
  });

  it('leaves play mode alone when returning to the grid', () => {
    item('Song').onSelect();
    item('Grid').onSelect();
    expect(appStore.getState().ui).toMatchObject({ view: 'grid', playMode: 'song' });
  });
});
