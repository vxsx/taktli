import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoProject } from '../model/factory';
import * as actions from './actions';
import { storage } from './persistence';
import { appStore, currentBar, currentPattern } from './store';

beforeEach(() => {
  appStore.getState().loadProject(createDemoProject());
});

const s = () => appStore.getState();

describe('bar actions', () => {
  it('copies and pastes a bar into the current bar', () => {
    s().setUi({ barIndex: 0 });
    actions.copyBar();
    const copied = currentBar(s()).beats;
    s().setUi({ barIndex: 1 });
    actions.pasteBar();
    expect(currentBar(s()).beats).toEqual(copied);
    expect(storage.loadClipboard()?.beats).toEqual(copied);
  });

  it('pastes as a new bar after the current one and selects it', () => {
    actions.copyBar();
    actions.pasteBarAsNew();
    expect(currentPattern(s()).bars).toHaveLength(3);
    expect(s().ui.barIndex).toBe(1);
  });

  it('adds, duplicates, clears and deletes bars, keeping the selection sensible', () => {
    actions.addBarAtEnd();
    expect(s().ui.barIndex).toBe(2);
    expect(currentPattern(s()).bars).toHaveLength(3);
    s().setUi({ barIndex: 0 });
    actions.duplicateCurrentBar();
    expect(s().ui.barIndex).toBe(1);
    actions.clearCurrentBar();
    expect(currentBar(s()).beats.every((b) => Object.values(b.cells).every((c) => c.every((v) => v === 0)))).toBe(true);
    actions.deleteCurrentBar();
    expect(currentPattern(s()).bars).toHaveLength(3);
  });

  it('rolls a groove into the current bar only, and undo brings the old bar back', () => {
    actions.addBarAtEnd();
    const before = currentPattern(s()).bars;
    actions.randomizeCurrentBar();
    const after = currentPattern(s()).bars;
    expect(after[2].beats[0].cells.kick[0]).toBeGreaterThan(0);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    s().undo();
    expect(currentPattern(s()).bars).toBe(before);
  });

  it('rolls one groove into every bar of the pattern as one undo step', () => {
    actions.addBarAtEnd();
    const before = s().project;
    actions.randomizePattern();
    const bars = currentPattern(s()).bars;
    expect(bars.every((bar, i) => bar !== before.patterns[0].bars[i])).toBe(true);
    expect(bars.every((bar) => bar.beats[0].cells.kick[0] > 0)).toBe(true);
    expect(s().toasts.at(-1)?.message).toBe('New groove in all 3 bars');
    s().undo();
    expect(s().project).toBe(before);
  });

  it('moves a bar and keeps it selected', () => {
    const id = currentPattern(s()).bars[0].id;
    actions.moveBar(0, 1);
    expect(currentPattern(s()).bars[1].id).toBe(id);
    expect(s().ui.barIndex).toBe(1);
  });

  it('turns off follow when selecting a bar during playback', () => {
    s().setUi({ playing: true, follow: true });
    actions.selectBar(1);
    expect(s().ui).toMatchObject({ barIndex: 1, follow: false });
  });
});

describe('pattern actions', () => {
  it('adds and duplicates patterns and selects the new one', () => {
    actions.addPattern();
    expect(currentPattern(s()).name).toBe('C');
    actions.duplicatePattern();
    expect(currentPattern(s()).name).toBe('D');
    expect(s().project.patterns.map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('renames and deletes patterns', () => {
    const b = s().project.patterns[1];
    actions.renamePattern(b.id, 'Fill');
    expect(s().project.patterns[1].name).toBe('Fill');
    actions.deletePattern(b.id);
    expect(s().project.patterns).toHaveLength(1);
    expect(s().project.song.every((x) => x.patternId !== b.id)).toBe(true);
  });
});

describe('navigation during playback', () => {
  const navigations: [string, () => void][] = [
    ['addPattern', () => actions.addPattern()],
    ['duplicatePattern', () => actions.duplicatePattern()],
    ['addBarAtEnd', () => actions.addBarAtEnd()],
    ['duplicateCurrentBar', () => actions.duplicateCurrentBar()],
    ['moveBar', () => actions.moveBar(0, 1)],
    [
      'pasteBarAsNew',
      () => {
        actions.copyBar();
        actions.pasteBarAsNew();
      },
    ],
  ];

  for (const [name, run] of navigations) {
    it(`${name} turns follow off while playing so the new selection sticks`, () => {
      s().setUi({ playing: true, follow: true });
      run();
      expect(s().ui.follow).toBe(false);
    });
  }

  it('keeps follow as it was while stopped', () => {
    s().setUi({ playing: false, follow: true });
    actions.addPattern();
    expect(s().ui.follow).toBe(true);
  });
});
