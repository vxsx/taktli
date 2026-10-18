// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({
  transport: { audition: vi.fn(), playhead: () => null, toggle: vi.fn(), stop: vi.fn(), preload: vi.fn() },
}));

import { createDemoProject } from '../model/factory';
import { appStore } from '../state/store';
import { closeModal, ModalHost } from './modal';
import { openTracksSheet } from './TracksSheet';

beforeEach(() => appStore.getState().loadProject(createDemoProject()));
afterEach(() => {
  act(closeModal);
  cleanup();
});

describe('Tracks sheet', () => {
  it('solos several tracks and shows which are soloed', () => {
    render(<ModalHost />);
    act(openTracksSheet);
    fireEvent.click(screen.getByRole('button', { name: 'Solo Kick' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solo Snare' }));
    expect(appStore.getState().ui.solo).toEqual(['kick', 'snare']);
    expect(screen.getByRole('button', { name: 'Solo Kick' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Solo Kick' }));
    expect(appStore.getState().ui.solo).toEqual(['snare']);
  });
});
