// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { toggle: vi.fn(), audition: vi.fn(), playhead: () => null, stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore } from '../state/store';
import { SongView } from './SongView';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(cleanup);

const steps = () => screen.getAllByRole('button', { name: /^Step \d+: pattern/ });
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 5, clientY: 5 });
};

describe('SongView', () => {
  it('lists song steps with pattern names', () => {
    render(<SongView />);
    expect(steps().map((b) => b.getAttribute('aria-label'))).toEqual(['Step 1: pattern A', 'Step 2: pattern B']);
  });

  it('appends a step from the add menu', () => {
    render(<SongView />);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pattern A' }));
    expect(steps()).toHaveLength(3);
  });

  it('removes, duplicates and retargets steps from the step menu', () => {
    render(<SongView />);
    tap(steps()[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate step' }));
    expect(steps()).toHaveLength(3);
    tap(steps()[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use pattern B' }));
    expect(steps()[0].getAttribute('aria-label')).toBe('Step 1: pattern B');
    tap(steps()[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove step' }));
    expect(steps()).toHaveLength(2);
  });

  it('opens the grid on a step pattern', () => {
    render(<SongView />);
    tap(steps()[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit pattern B' }));
    const s = appStore.getState();
    expect(s.ui.view).toBe('grid');
    expect(s.ui.patternId).toBe(s.project.patterns[1].id);
  });
});
