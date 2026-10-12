// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toggle = vi.fn();
vi.mock('../audio/transport', () => ({
  transport: { toggle: () => toggle(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject, createProject } from '../model/factory';
import * as ops from '../model/ops';
import { appStore } from '../state/store';
import { TopBar } from './TopBar';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(() => {
  cleanup();
  toggle.mockReset();
});

describe('TopBar', () => {
  it('toggles playback', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('shows tempo and pattern, with the kit left to the ⋯ menu', () => {
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Tempo' }).textContent).toContain('96');
    expect(screen.getByRole('button', { name: 'Pattern' }).textContent).toContain('A');
    expect(screen.queryByRole('button', { name: 'Kit' })).toBeNull();
  });

  it('switches edit mode', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('radio', { name: 'Volume' }));
    expect(appStore.getState().ui.editMode).toBe('volume');
  });

  it('opens the song arrange view from Song, and goes back to the grid from Pattern', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('radio', { name: 'Song' }));
    expect(appStore.getState().ui).toMatchObject({ view: 'song', playMode: 'song' });
    fireEvent.click(screen.getByRole('radio', { name: 'Pattern' }));
    expect(appStore.getState().ui).toMatchObject({ view: 'grid', playMode: 'pattern' });
  });

  it('offers Song before the song has any steps, so it can be built there', () => {
    appStore.getState().loadProject(createProject());
    render(<TopBar />);
    const song = screen.getByRole('radio', { name: 'Song' });
    expect(song).toHaveProperty('disabled', false);
    fireEvent.click(song);
    expect(appStore.getState().ui.view).toBe('song');
    expect(song.getAttribute('aria-checked')).toBe('true');
  });

  it('stays in notation when switching it to pattern play', () => {
    appStore.getState().setUi({ view: 'notation', playMode: 'song' });
    render(<TopBar />);
    fireEvent.click(screen.getByRole('radio', { name: 'Pattern' }));
    expect(appStore.getState().ui).toMatchObject({ view: 'notation', playMode: 'pattern' });
  });

  it('changes tempo from the popover', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Tempo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Faster' }));
    expect(appStore.getState().project.bpm).toBe(97);
  });

  it('switches pattern from the pattern menu', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Pattern' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^B · 2 bars/ }));
    expect(appStore.getState().ui.patternId).toBe(appStore.getState().project.patterns[1].id);
  });

  it('disables undo with no history', () => {
    appStore.getState().apply((p) => ops.setBpm(p, p.bpm));
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true);
  });
});
