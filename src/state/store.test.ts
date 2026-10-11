import { describe, expect, it } from 'vitest';
import { createDemoProject, createProject } from '../model/factory';
import * as ops from '../model/ops';
import { createAppStore, currentBar, currentPattern, HISTORY_LIMIT } from './store';

function setup() {
  let t = 1000;
  return createAppStore(createDemoProject(0), () => ++t);
}

describe('history', () => {
  it('commits edits with a fresh updatedAt and supports undo/redo', () => {
    const store = setup();
    const s = store.getState();
    const before = s.project;
    s.apply((p) => ops.setBpm(p, 150));
    expect(store.getState().project.bpm).toBe(150);
    expect(store.getState().project.updatedAt).toBe(1001);
    store.getState().undo();
    expect(store.getState().project).toBe(before);
    store.getState().redo();
    expect(store.getState().project.bpm).toBe(150);
  });

  it('ignores no-op edits', () => {
    const store = setup();
    store.getState().apply((p) => p);
    store.getState().apply((p) => ops.setBpm(p, p.bpm));
    expect(store.getState().past).toHaveLength(0);
  });

  it('clears redo after a new edit', () => {
    const store = setup();
    store.getState().apply((p) => ops.setBpm(p, 150));
    store.getState().undo();
    store.getState().apply((p) => ops.setBpm(p, 90));
    expect(store.getState().future).toHaveLength(0);
  });

  it('coalesces a gesture into one undo entry', () => {
    const store = setup();
    const before = store.getState().project;
    const pid = before.patterns[0].id;
    store.getState().beginGesture();
    for (const v of [20, 40, 60, 80]) store.getState().applyTransient((p) => ops.setVelocity(p, pid, 0, 0, 'tom1', 0, v));
    expect(store.getState().past).toHaveLength(0);
    store.getState().endGesture();
    expect(store.getState().past).toHaveLength(1);
    expect(currentBar(store.getState()).beats[0].cells.tom1[0]).toBe(80);
    store.getState().undo();
    expect(store.getState().project).toBe(before);
  });

  it('adds nothing for a gesture without changes', () => {
    const store = setup();
    store.getState().beginGesture();
    store.getState().endGesture();
    expect(store.getState().past).toHaveLength(0);
  });

  it('ends an open gesture before applying a normal edit', () => {
    const store = setup();
    const pid = store.getState().project.patterns[0].id;
    store.getState().applyTransient((p) => ops.setVelocity(p, pid, 0, 0, 'tom1', 0, 50));
    store.getState().apply((p) => ops.setBpm(p, 77));
    expect(store.getState().past).toHaveLength(2);
    expect(store.getState().gestureBase).toBeNull();
  });

  it('caps history', () => {
    const store = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.getState().apply((p) => ops.setBpm(p, 40 + (i % 150)));
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it('undoes a subdivision change exactly', () => {
    const store = setup();
    const pid = store.getState().project.patterns[0].id;
    const before = currentBar(store.getState()).beats[2];
    store.getState().apply((p) => ops.setBeatDiv(p, pid, 0, 2, 3));
    store.getState().apply((p) => ops.setBeatDiv(p, pid, 0, 2, 4));
    store.getState().undo();
    store.getState().undo();
    expect(currentBar(store.getState()).beats[2]).toEqual(before);
  });
});

describe('ui state', () => {
  it('starts on the first pattern, first bar, grid view, notes mode', () => {
    const store = setup();
    const { ui, project } = store.getState();
    expect(ui).toMatchObject({ patternId: project.patterns[0].id, barIndex: 0, view: 'grid', editMode: 'notes', playMode: 'pattern', loopBar: false, follow: true, playing: false });
  });

  it('moves off a deleted pattern and clamps the bar index', () => {
    const store = setup();
    const [a, b] = store.getState().project.patterns;
    store.getState().setUi({ patternId: b.id, barIndex: 1 });
    store.getState().apply((p) => ops.deletePattern(p, b.id));
    expect(store.getState().ui.patternId).toBe(a.id);
    store.getState().setUi({ barIndex: 1 });
    store.getState().apply((p) => ops.deleteBar(p, a.id, 1));
    expect(store.getState().ui.barIndex).toBe(0);
    store.getState().setUi({ barIndex: 99 });
    expect(store.getState().ui.barIndex).toBe(0);
  });

  it('falls back to pattern play mode when the song is empty', () => {
    const store = createAppStore(createProject());
    store.getState().setUi({ playMode: 'song' });
    expect(store.getState().ui.playMode).toBe('pattern');
  });

  it('resets history and ui when loading a project', () => {
    const store = setup();
    store.getState().apply((p) => ops.setBpm(p, 150));
    store.getState().setUi({ view: 'song' });
    const other = createProject('Other');
    store.getState().loadProject(other);
    const s = store.getState();
    expect(s.project).toBe(other);
    expect(s.past).toHaveLength(0);
    expect(s.ui.view).toBe('grid');
    expect(s.ui.patternId).toBe(other.patterns[0].id);
  });

  it('keeps at most three toasts and dismisses by id', () => {
    const store = setup();
    for (const m of ['a', 'b', 'c', 'd']) store.getState().toast(m);
    expect(store.getState().toasts.map((t) => t.message)).toEqual(['b', 'c', 'd']);
    store.getState().dismissToast(store.getState().toasts[0].id);
    expect(store.getState().toasts.map((t) => t.message)).toEqual(['c', 'd']);
  });

  it('exposes current pattern and bar selectors', () => {
    const store = setup();
    const b = store.getState().project.patterns[1];
    store.getState().setUi({ patternId: b.id, barIndex: 1 });
    expect(currentPattern(store.getState())).toBe(b);
    expect(currentBar(store.getState())).toBe(b.bars[1]);
  });
});
