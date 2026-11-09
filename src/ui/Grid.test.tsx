// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { audition: vi.fn(), playhead: () => null, toggle: vi.fn(), stop: vi.fn() },
}));

import { createProject } from '../model/factory';
import * as ops from '../model/ops';
import type { TrackId } from '../model/types';
import * as actions from '../state/actions';
import { appStore, currentBar } from '../state/store';
import { Grid } from './Grid';
import { LONG_PRESS_MS } from './gestures';

const cellEl = (root: HTMLElement, track: TrackId, beat: number, cell: number) =>
  root.querySelector<HTMLElement>(`[data-track="${track}"][data-beat="${beat}"][data-cell="${cell}"]`)!;
const vel = (track: TrackId, beat: number, cell: number) => currentBar(appStore.getState()).beats[beat].cells[track][cell];
const down = (el: HTMLElement, x: number, y: number, pointerId = 1) => fireEvent.pointerDown(el, { pointerId, clientX: x, clientY: y, button: 0 });
const move = (el: HTMLElement, x: number, y: number, pointerId = 1) => fireEvent.pointerMove(el, { pointerId, clientX: x, clientY: y });
const up = (el: HTMLElement, x: number, y: number, pointerId = 1) => fireEvent.pointerUp(el, { pointerId, clientX: x, clientY: y });
const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, left: 0, right: 40, width: 40, height, x: 0, y: top, toJSON() {} }) as DOMRect;

beforeEach(() => {
  appStore.getState().loadProject(createProject());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Grid', () => {
  it('renders one cell per visible track and step', () => {
    const { container } = render(<Grid />);
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(9 * 16);
    expect(container.querySelector('[data-track="crossStick"]')).toBeNull();
  });

  it('toggles a note with a tap', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'snare', 1, 0);
    down(c, 10, 10);
    up(c, 10, 10);
    expect(vel('snare', 1, 0)).toBe(100);
    expect(c.dataset.on).toBeDefined();
    down(c, 10, 10);
    up(c, 10, 10);
    expect(vel('snare', 1, 0)).toBe(0);
  });

  it('sets volume with a vertical slide as one undo step', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'kick', 0, 0);
    down(c, 10, 100);
    move(c, 10, 90);
    move(c, 10, 70);
    up(c, 10, 70);
    expect(vel('kick', 0, 0)).toBe(125);
    expect(appStore.getState().past).toHaveLength(1);
    appStore.getState().undo();
    expect(vel('kick', 0, 0)).toBe(0);
  });

  it('paints along a row with a horizontal drag, ignoring other rows', () => {
    const { container } = render(<Grid />);
    const targets: Record<number, HTMLElement> = {
      20: cellEl(container, 'kick', 0, 1),
      40: cellEl(container, 'kick', 0, 2),
      60: cellEl(container, 'snare', 0, 3),
    };
    document.elementFromPoint = vi.fn((x: number) => targets[x] ?? null);
    const start = cellEl(container, 'kick', 0, 0);
    down(start, 0, 10);
    move(start, 20, 10);
    move(start, 40, 10);
    move(start, 60, 10);
    up(start, 60, 10);
    expect([0, 1, 2, 3].map((i) => vel('kick', 0, i))).toEqual([100, 100, 100, 0]);
    expect(vel('snare', 0, 3)).toBe(0);
    expect(appStore.getState().past).toHaveLength(1);
  });

  it('paints every cell passed even when pointer moves are sparse', () => {
    const { container } = render(<Grid />);
    document.elementFromPoint = vi.fn((x: number) => (x === 200 ? cellEl(container, 'kick', 1, 2) : null));
    const start = cellEl(container, 'kick', 0, 1);
    down(start, 0, 10);
    move(start, 200, 10); // one fast move lands six cells further along the row
    up(start, 200, 10);
    const row = [0, 1].flatMap((beat) => [0, 1, 2, 3].map((i) => vel('kick', beat, i)));
    expect(row).toEqual([0, 100, 100, 100, 100, 100, 100, 0]);
    expect(appStore.getState().past).toHaveLength(1);
  });

  it('interpolates volume across skipped notes in volume mode', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => [0, 1, 2, 3].reduce((acc, i) => ops.setVelocity(acc, pid, 0, 0, 'hhClosed', i, 100), p));
    appStore.getState().setUi({ editMode: 'volume' });
    const { container } = render(<Grid />);
    const first = cellEl(container, 'hhClosed', 0, 0);
    const last = cellEl(container, 'hhClosed', 0, 3);
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    vi.spyOn(last, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    document.elementFromPoint = vi.fn(() => last);
    down(first, 5, 90); // 1 + round(0.1 * 126) = 14
    move(first, 120, 10); // jumps straight to cell 3: 1 + round(0.9 * 126) = 114
    up(first, 120, 10);
    expect([0, 1, 2, 3].map((i) => vel('hhClosed', 0, i))).toEqual([14, 47, 81, 114]);
  });

  it('erases along a row when the drag starts on a note', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => ops.setVelocity(ops.setVelocity(p, pid, 0, 0, 'ride', 0, 90), pid, 0, 0, 'ride', 1, 90));
    const { container } = render(<Grid />);
    document.elementFromPoint = vi.fn(() => cellEl(container, 'ride', 0, 1));
    const start = cellEl(container, 'ride', 0, 0);
    down(start, 0, 10);
    move(start, 20, 10);
    up(start, 20, 10);
    expect([vel('ride', 0, 0), vel('ride', 0, 1)]).toEqual([0, 0]);
  });

  it('ignores a second pointer while a gesture is active', () => {
    const { container } = render(<Grid />);
    const a = cellEl(container, 'tom1', 2, 0);
    const b = cellEl(container, 'tom2', 2, 1);
    down(a, 10, 100, 1);
    down(b, 50, 100, 2);
    up(b, 50, 100, 2);
    move(a, 10, 70, 1);
    up(a, 10, 70, 1);
    expect(vel('tom1', 2, 0)).toBe(125);
    expect(vel('tom2', 2, 1)).toBe(0);
    expect(appStore.getState().past).toHaveLength(1);
  });

  it('shapes existing notes by touch height in volume mode', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => ops.setVelocity(p, pid, 0, 3, 'hhClosed', 2, 100));
    appStore.getState().setUi({ editMode: 'volume' });
    const { container } = render(<Grid />);
    const c = cellEl(container, 'hhClosed', 3, 2);
    vi.spyOn(c, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    down(c, 5, 25);
    up(c, 5, 25);
    expect(vel('hhClosed', 3, 2)).toBe(96);
    const empty = cellEl(container, 'hhClosed', 3, 3);
    vi.spyOn(empty, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    down(empty, 5, 10);
    up(empty, 5, 10);
    expect(vel('hhClosed', 3, 3)).toBe(0);
  });

  it('hides hidden tracks', () => {
    appStore.getState().apply((p) => ops.setTrackHidden(p, 'tom2', true));
    const { container } = render(<Grid />);
    expect(container.querySelector('[data-track="tom2"]')).toBeNull();
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(8 * 16);
  });

  it('solos tracks from the row menu, adding each to the set', () => {
    render(<Grid />);
    const solo = (label: string) => {
      fireEvent.contextMenu(screen.getByRole('button', { name: label }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Solo' }));
    };
    solo('Kick');
    solo('Snare');
    expect(appStore.getState().ui.solo).toEqual(['kick', 'snare']);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Kick (solo)' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unsolo' }));
    expect(appStore.getState().ui.solo).toEqual(['snare']);
  });

  it('dims the rows that will not play while tracks are soloed', () => {
    actions.toggleSolo('kick');
    appStore.getState().apply((p) => ops.setTrackMuted(p, 'snare', true));
    const { container } = render(<Grid />);
    const silent = [...container.querySelectorAll('[data-silent]')].map((row) => row.querySelector('[data-track]')!.getAttribute('data-track'));
    expect(silent).toEqual(['crash', 'ride', 'hhOpen', 'hhClosed', 'snare', 'tom1', 'tom2', 'floorTom']);
  });

  it('offers to unsolo everything from any row while other tracks are soloed', () => {
    actions.toggleSolo('kick');
    actions.toggleSolo('snare');
    render(<Grid />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Crash' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unsolo all' }));
    expect(appStore.getState().ui.solo).toEqual([]);
  });
});

describe('split cells', () => {
  const halfEl = (root: HTMLElement, track: TrackId, beat: number, cell: number, h: 0 | 1) =>
    root.querySelector<HTMLElement>(`[data-track="${track}"][data-beat="${beat}"][data-cell="${cell}"][data-half="${h}"]`)!;
  const beatOf = (barIndex: number, beat: number) => appStore.getState().project.patterns[0].bars[barIndex].beats[beat];
  const pid = () => appStore.getState().ui.patternId;
  // The lift goes to the rows container: it holds pointer capture, and the pressed cell is gone after a split.
  const hold = (el: HTMLElement) => {
    down(el, 10, 10);
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    up(screen.getByTestId('grid-rows'), 10, 10);
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('splits a cell after a hold and merges it after another', () => {
    appStore.getState().apply((p) => ops.setVelocity(p, pid(), 0, 1, 'snare', 3, 90));
    const { container } = render(<Grid />);
    hold(cellEl(container, 'snare', 1, 3));
    expect(beatOf(0, 1).splits.snare[3]).toBe(0);
    expect(beatOf(0, 1).cells.snare[3]).toBe(90); // the release after a hold doesn't toggle the note
    expect(container.querySelectorAll('[data-track="snare"][data-beat="1"][data-cell="3"][data-half]')).toHaveLength(2);
    hold(halfEl(container, 'snare', 1, 3, 0));
    expect(beatOf(0, 1).splits.snare[3]).toBeNull();
    expect(container.querySelectorAll('[data-track="snare"][data-beat="1"][data-cell="3"]')).toHaveLength(1);
  });

  it("blocks the browser's long-press menu on cells so it can't interrupt a hold", () => {
    const { container } = render(<Grid />);
    expect(fireEvent.contextMenu(cellEl(container, 'snare', 0, 0))).toBe(false);
  });

  it('marks the cell while it is held', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'snare', 0, 0);
    down(c, 10, 10);
    expect(c.hasAttribute('data-holding')).toBe(true);
    up(c, 10, 10);
    expect(c.hasAttribute('data-holding')).toBe(false);
  });

  it('does not split when the finger moves before the hold fires', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'snare', 0, 2);
    down(c, 10, 100);
    move(c, 10, 80);
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    up(c, 10, 80);
    expect(beatOf(0, 0).splits.snare[2]).toBeNull();
    expect(beatOf(0, 0).cells.snare[2]).toBe(117);
  });

  it('does not split after pointercancel', () => {
    const { container } = render(<Grid />);
    const c = cellEl(container, 'snare', 0, 2);
    down(c, 10, 10);
    fireEvent.pointerCancel(c, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(beatOf(0, 0).splits.snare[2]).toBeNull();
    expect(c.hasAttribute('data-holding')).toBe(false);
  });

  it('splits the bar where the hold started even if Follow moved the view', () => {
    appStore.getState().apply((p) => ops.addBar(p, pid()));
    const { container } = render(<Grid />);
    const c = cellEl(container, 'kick', 2, 1);
    down(c, 10, 10);
    act(() => appStore.getState().setUi({ barIndex: 1 }));
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    up(c, 10, 10);
    expect(beatOf(0, 2).splits.kick[1]).toBe(0);
    expect(beatOf(1, 2).splits.kick[1]).toBeNull();
  });

  it('taps a ghost note into a right half', () => {
    appStore.getState().apply((p) => ops.toggleSplit(p, pid(), 0, 0, 'snare', 3));
    const { container } = render(<Grid />);
    const right = halfEl(container, 'snare', 0, 3, 1);
    down(right, 10, 10);
    up(right, 10, 10);
    expect(beatOf(0, 0).splits.snare[3]).toBe(40);
    expect(beatOf(0, 0).cells.snare[3]).toBe(0);
    expect(halfEl(container, 'snare', 0, 3, 1).dataset.on).toBeDefined();
  });

  it('paints ghost volume into right halves', () => {
    appStore.getState().apply((p) => ops.toggleSplit(p, pid(), 0, 0, 'snare', 1));
    const { container } = render(<Grid />);
    document.elementFromPoint = vi.fn((x: number) => (x === 200 ? cellEl(container, 'snare', 0, 2) : null));
    const start = cellEl(container, 'snare', 0, 0);
    down(start, 0, 10);
    move(start, 200, 10);
    up(start, 200, 10);
    expect([0, 1, 2, 3].map((i) => vel('snare', 0, i))).toEqual([100, 100, 100, 0]);
    expect(beatOf(0, 0).splits.snare[1]).toBe(40);
  });

  it('merging drops the right half and undo restores it', () => {
    appStore.getState().apply((p) => ops.setVelocity(ops.toggleSplit(p, pid(), 0, 2, 'snare', 0), pid(), 0, 2, 'snare', 0, 40, 1));
    const { container } = render(<Grid />);
    hold(halfEl(container, 'snare', 2, 0, 1));
    expect(beatOf(0, 2).splits.snare[0]).toBeNull();
    act(() => appStore.getState().undo());
    expect(beatOf(0, 2).splits.snare[0]).toBe(40);
  });

  it('does not split in Volume mode', () => {
    appStore.getState().setUi({ editMode: 'volume' });
    const { container } = render(<Grid />);
    const c = cellEl(container, 'snare', 0, 1);
    vi.spyOn(c, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
    down(c, 5, 10);
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    up(c, 5, 10);
    expect(beatOf(0, 0).splits.snare[1]).toBeNull();
  });
});
