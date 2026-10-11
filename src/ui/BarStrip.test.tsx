// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore, currentPattern } from '../state/store';
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

  it('disables delete for the last remaining bar', () => {
    render(<BarStrip />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
  });
});
