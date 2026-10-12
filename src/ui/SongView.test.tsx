// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { playFrom } = vi.hoisted(() => ({ playFrom: vi.fn() }));
vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), playFrom, audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore } from '../state/store';
import { SongView } from './SongView';

beforeEach(() => {
  appStore.getState().loadProject(createDemoProject());
  playFrom.mockClear();
});
afterEach(cleanup);

const blocks = () => screen.queryAllByRole('button', { name: /^Block \d+:/ }).map((b) => b.getAttribute('aria-label'));
const block = (n: number) => screen.getAllByRole('button', { name: /^Block \d+:/ })[n - 1];
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
};
const choose = (name: string) => fireEvent.click(screen.getByRole('menuitem', { name }));

describe('SongView', () => {
  it('lays the song out as blocks on a bar ruler', () => {
    render(<SongView />);
    expect(blocks()).toEqual(['Block 1: pattern A, bars 1–2', 'Block 2: pattern B, bars 3–4']);
    expect(screen.getAllByRole('button', { name: /^Play from bar/ })).toHaveLength(4);
    expect(screen.getByText(/4 bars/)).toBeTruthy();
  });

  it('adds patterns from the palette, merging repeats into one block', () => {
    render(<SongView />);
    fireEvent.click(screen.getByRole('button', { name: 'Add pattern B' }));
    expect(blocks()).toEqual(['Block 1: pattern A, bars 1–2', 'Block 2: pattern B ×2, bars 3–6']);
  });

  it('sets repeats, swaps the pattern and removes blocks from the block menu', () => {
    render(<SongView />);
    tap(block(1));
    choose('Repeat ×3');
    expect(blocks()[0]).toBe('Block 1: pattern A ×3, bars 1–6');
    tap(block(1));
    choose('Use pattern B');
    expect(blocks()).toEqual(['Block 1: pattern B ×4, bars 1–8']);
    tap(block(1));
    choose('Remove');
    expect(blocks()).toEqual([]);
    expect(screen.getByText(/Tap a pattern below/)).toBeTruthy();
  });

  it("opens the grid on a block's pattern, looping that pattern", () => {
    appStore.getState().setUi({ playMode: 'song' });
    render(<SongView />);
    tap(block(2));
    choose('Edit pattern B');
    const s = appStore.getState();
    expect(s.ui.view).toBe('grid');
    expect(s.ui.playMode).toBe('pattern');
    expect(s.ui.patternId).toBe(s.project.patterns[1].id);
  });

  it('plays the song from a bar tapped on the ruler', () => {
    appStore.getState().setUi({ playMode: 'pattern' });
    render(<SongView />);
    fireEvent.click(screen.getByRole('button', { name: 'Play from bar 3' }));
    expect(appStore.getState().ui.playMode).toBe('song');
    expect(playFrom).toHaveBeenCalledWith(2);
  });
});
