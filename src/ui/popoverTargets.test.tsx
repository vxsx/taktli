// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { audition: vi.fn(), playhead: () => null, toggle: vi.fn(), stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore } from '../state/store';
import { BeatHeader } from './BeatHeader';
import { Popover, isOverlayOpen } from './Popover';
import { TrackLabel } from './TrackLabel';

const pattern = () => appStore.getState().project.patterns[0];

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(cleanup);

describe('popover edits target the bar they were opened on', () => {
  it('changes the subdivision of the bar shown when the beat picker opened', () => {
    render(<BeatHeader />);
    fireEvent.click(screen.getByRole('button', { name: /^Beat 4:/ }));
    act(() => appStore.getState().setUi({ barIndex: 1 })); // follow moved on while the picker was open
    fireEvent.click(screen.getByRole('menuitem', { name: '8th triplets' }));
    expect(pattern().bars[0].beats[3].div).toBe(3);
    expect(pattern().bars[1].beats[3].div).toBe(4);
  });

  it('clears the row in the bar shown when the track menu opened', () => {
    render(<TrackLabel track="kick" />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Kick' }));
    act(() => appStore.getState().setUi({ barIndex: 1 }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear row in this bar' }));
    expect(pattern().bars[0].beats.every((b) => b.cells.kick.every((v) => v === 0))).toBe(true);
    expect(pattern().bars[1].beats[0].cells.kick[0]).toBeGreaterThan(0);
  });
});

describe('overlay tracking', () => {
  it('reports an open overlay while a popover is mounted', () => {
    expect(isOverlayOpen()).toBe(false);
    const { unmount } = render(
      <Popover anchor={{ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, x: 0, y: 0, toJSON() {} } as DOMRect} onClose={() => {}}>
        <p>hi</p>
      </Popover>,
    );
    expect(isOverlayOpen()).toBe(true);
    unmount();
    expect(isOverlayOpen()).toBe(false);
  });
});
