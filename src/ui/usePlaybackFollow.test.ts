import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio/transport', () => ({ transport: { playhead: () => null } }));

import type { PlayheadEvent } from '../audio/scheduler';
import { createDemoProject } from '../model/factory';
import { appStore } from '../state/store';
import { followPatch } from './usePlaybackFollow';

const ph = (barIndex: number, patternIndex = 0): PlayheadEvent => ({
  time: 0,
  tick: 0,
  ref: { patternId: appStore.getState().project.patterns[patternIndex].id, barIndex, stepIndex: -1 },
});

beforeEach(() => {
  appStore.getState().loadProject(createDemoProject());
  appStore.getState().setUi({ playing: true, follow: true });
});

describe('followPatch', () => {
  it('moves the editor to the audible bar and pattern', () => {
    expect(followPatch(ph(1, 1), appStore.getState(), false)).toEqual({ patternId: appStore.getState().project.patterns[1].id, barIndex: 1 });
  });

  it('does nothing when already there, when stopped, or with follow off', () => {
    expect(followPatch(ph(0), appStore.getState(), false)).toBeNull();
    expect(followPatch(null, appStore.getState(), false)).toBeNull();
    appStore.getState().setUi({ follow: false });
    expect(followPatch(ph(1), appStore.getState(), false)).toBeNull();
    appStore.getState().setUi({ follow: true, playing: false });
    expect(followPatch(ph(1), appStore.getState(), false)).toBeNull();
  });

  it('pauses during a gesture or while a menu or dialog is open', () => {
    expect(followPatch(ph(1), appStore.getState(), true)).toBeNull();
    appStore.getState().beginGesture();
    expect(followPatch(ph(1), appStore.getState(), false)).toBeNull();
  });
});
