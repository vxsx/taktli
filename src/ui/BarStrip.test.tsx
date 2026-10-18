// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { setTrackHidden, setVelocity } from '../model/ops';
import { TRACK_IDS } from '../model/tracks';
import { toggleSolo } from '../state/actions';
import { appStore, currentBar, currentPattern } from '../state/store';
import { BarStrip } from './BarStrip';
import { LONG_PRESS_MS } from './gestures';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
};

describe('BarStrip', () => {
  it('shows one chip per bar and selects bars by tap', () => {
    render(<BarStrip />);
    expect(screen.getAllByRole('button', { name: /^Bar \d+$/ })).toHaveLength(2);
    tap(screen.getByRole('button', { name: 'Bar 2' }));
    expect(appStore.getState().ui.barIndex).toBe(1);
  });

  it('draws each chip as a miniature of its bar instead of a number', () => {
    render(<BarStrip />);
    const chip = screen.getByRole('button', { name: 'Bar 1' });
    expect(chip.textContent).toBe('');
    const bar = currentPattern(appStore.getState()).bars[0];
    const visible = TRACK_IDS.filter((t) => !appStore.getState().project.tracks[t].hidden);
    const expected = bar.beats.reduce((n, b) => n + visible.reduce((m, t) => m + b.cells[t].filter((v) => v > 0).length, 0), 0);
    expect(chip.querySelectorAll('[data-note]')).toHaveLength(expected);
  });

  it('leaves hidden tracks out of the miniatures and redraws after edits', () => {
    render(<BarStrip />);
    const chip = () => screen.getByRole('button', { name: 'Bar 1' });
    const kicks = () => chip().querySelectorAll('[data-note="kick"]').length;
    expect(kicks()).toBeGreaterThan(0);
    act(() => appStore.getState().apply((p) => setTrackHidden(p, 'kick', true)));
    expect(kicks()).toBe(0);
    act(() => appStore.getState().apply((p) => setTrackHidden(p, 'kick', false)));
    const before = kicks();
    act(() => appStore.getState().apply((p) => setVelocity(p, p.patterns[0].id, 0, 3, 'kick', 3, 100)));
    expect(kicks()).toBe(before + 1);
  });

  it('dims the notes of tracks that will not play in the miniatures', () => {
    render(<BarStrip />);
    const chip = screen.getByRole('button', { name: 'Bar 1' });
    const opacity = (t: string) => Number(chip.querySelector(`[data-note="${t}"]`)!.getAttribute('opacity'));
    const snareBefore = opacity('snare');
    act(() => toggleSolo('kick'));
    expect(opacity('snare')).toBeLessThan(snareBefore);
    expect(opacity('kick')).toBeGreaterThan(opacity('snare'));
  });

  it('adds a bar and selects it', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Add bar' }));
    expect(currentPattern(appStore.getState()).bars).toHaveLength(3);
    expect(appStore.getState().ui.barIndex).toBe(2);
  });

  it('toggles loop bar', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Loop bar' }));
    expect(appStore.getState().ui.loopBar).toBe(true);
  });

  it('reorders bars with long-press and drag', () => {
    vi.useFakeTimers();
    render(<BarStrip />);
    const first = currentPattern(appStore.getState()).bars[0].id;
    const chip1 = screen.getByRole('button', { name: 'Bar 1' });
    const chip2 = screen.getByRole('button', { name: 'Bar 2' });
    document.elementFromPoint = vi.fn(() => chip2);
    fireEvent.pointerDown(chip1, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 10));
    fireEvent.pointerUp(chip1, { pointerId: 1, clientX: 60, clientY: 5 });
    expect(currentPattern(appStore.getState()).bars[1].id).toBe(first);
    expect(appStore.getState().ui.barIndex).toBe(1);
  });

  it('rolls a groove into the current bar', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    const other = currentPattern(appStore.getState()).bars[1];
    fireEvent.click(screen.getByRole('button', { name: 'Random' }));
    expect(currentBar(appStore.getState()).beats[0].cells.kick[0]).toBeGreaterThan(0);
    expect(currentPattern(appStore.getState()).bars[1]).toBe(other);
  });

  it('rolls every bar of the pattern on a long press', () => {
    vi.useFakeTimers();
    render(<BarStrip />);
    const before = currentPattern(appStore.getState()).bars;
    const random = screen.getByRole('button', { name: 'Random' });
    fireEvent.pointerDown(random, { pointerId: 1, button: 0 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS + 10));
    fireEvent.pointerUp(random, { pointerId: 1 });
    fireEvent.click(random);
    const after = currentPattern(appStore.getState()).bars;
    expect(after.every((bar, i) => bar !== before[i])).toBe(true);
    expect(appStore.getState().past).toHaveLength(1);
  });

  it('disables delete for the last remaining bar', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
  });
});
