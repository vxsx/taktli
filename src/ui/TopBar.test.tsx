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

  it('shows tempo, kit and pattern', () => {
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Tempo' }).textContent).toContain('96');
    expect(screen.getByRole('button', { name: 'Kit' }).textContent).toBe('Acoustic');
    expect(screen.getByRole('button', { name: 'Pattern' }).textContent).toContain('A');
  });

  it('switches kit as an undoable edit', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Kit' }));
    expect(appStore.getState().project.kit).toBe('electronic');
    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(appStore.getState().project.kit).toBe('acoustic');
  });

  it('switches edit and play modes', () => {
    render(<TopBar />);
    fireEvent.click(screen.getByRole('radio', { name: 'Volume' }));
    expect(appStore.getState().ui.editMode).toBe('volume');
    fireEvent.click(screen.getByRole('radio', { name: 'Song' }));
    expect(appStore.getState().ui.playMode).toBe('song');
  });

  it('disables song play mode when the song is empty', () => {
    appStore.getState().loadProject(createProject());
    render(<TopBar />);
    expect(screen.getByRole('radio', { name: 'Song' })).toHaveProperty('disabled', true);
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
