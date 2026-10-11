// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { audition: vi.fn(), playhead: () => null, toggle: vi.fn(), stop: vi.fn() },
}));

import { createProject } from '../model/factory';
import * as ops from '../model/ops';
import type { TrackId } from '../model/types';
import { appStore, currentBar } from '../state/store';
import { Grid } from './Grid';

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
  it('renders one cell per track and step', () => {
    const { container } = render(<Grid />);
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(11 * 16);
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
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(10 * 16);
  });

  it('renders triplet beats with three cells', () => {
    const pid = appStore.getState().ui.patternId;
    appStore.getState().apply((p) => ops.setBeatDiv(p, pid, 0, 3, 3));
    const { container } = render(<Grid />);
    expect(container.querySelectorAll('[data-track="kick"][data-beat="3"]')).toHaveLength(3);
  });
});
