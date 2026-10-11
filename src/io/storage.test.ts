import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBar, createDemoProject, createProject } from '../model/factory';
import { createAutosaver, KEYS, ProjectStorage, StorageUnavailableError, type KeyValueStore } from './storage';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('ProjectStorage', () => {
  it('saves, loads and lists projects newest first', () => {
    const s = new ProjectStorage(new MemoryStore());
    const a = { ...createProject('A'), updatedAt: 1 };
    const b = { ...createDemoProject(), updatedAt: 2 };
    s.saveProject(a);
    s.saveProject(b);
    expect(s.loadProject(a.id)).toEqual(a);
    expect(s.listProjects().map((m) => m.name)).toEqual(['Demo groove', 'A']);
    s.saveProject({ ...a, updatedAt: 3, name: 'A2' });
    expect(s.listProjects().map((m) => m.name)).toEqual(['A2', 'Demo groove']);
  });

  it('returns null for corrupt JSON', () => {
    const kv = new MemoryStore();
    kv.setItem(KEYS.project('x'), '{not json');
    expect(new ProjectStorage(kv).loadProject('x')).toBeNull();
  });

  it('skips corrupt projects in the index', () => {
    const kv = new MemoryStore();
    const s = new ProjectStorage(kv);
    const good = createProject('Good');
    s.saveProject(good);
    kv.setItem(KEYS.index, JSON.stringify([
      { id: good.id, name: 'Good', updatedAt: 1 },
      { id: 'broken', name: 'Broken', updatedAt: 2 },
      { id: 'empty', name: 'Empty', updatedAt: 3 },
      'garbage',
    ]));
    kv.setItem(KEYS.project('broken'), '{oops');
    kv.setItem(KEYS.project('empty'), JSON.stringify({ patterns: [] }));
    expect(s.listProjects().map((m) => m.id)).toEqual([good.id]);
    expect(s.countCorrupt()).toBe(2);
  });

  it('drops corrupt entries from the index once, keeping their raw data', () => {
    const kv = new MemoryStore();
    const s = new ProjectStorage(kv);
    const good = createProject('Good');
    s.saveProject(good);
    kv.setItem(KEYS.index, JSON.stringify([{ id: good.id, name: 'Good', updatedAt: 1 }, { id: 'broken', name: 'Broken', updatedAt: 2 }]));
    kv.setItem(KEYS.project('broken'), '{oops');
    expect(s.forgetCorrupt()).toBe(1);
    expect(s.forgetCorrupt()).toBe(0);
    expect(s.countCorrupt()).toBe(0);
    expect(s.listProjects().map((m) => m.id)).toEqual([good.id]);
    expect(kv.getItem(KEYS.project('broken'))).toBe('{oops');
  });

  it('deletes projects and forgets the last-opened id', () => {
    const s = new ProjectStorage(new MemoryStore());
    const p = createProject();
    s.saveProject(p);
    s.setLastProjectId(p.id);
    s.deleteProject(p.id);
    expect(s.loadProject(p.id)).toBeNull();
    expect(s.listProjects()).toEqual([]);
    expect(s.getLastProjectId()).toBeNull();
  });

  it('wraps quota errors in StorageUnavailableError', () => {
    const kv = new MemoryStore();
    kv.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => new ProjectStorage(kv).saveProject(createProject())).toThrow(StorageUnavailableError);
  });

  it('degrades gracefully without storage', () => {
    const s = new ProjectStorage(null);
    expect(s.available).toBe(false);
    expect(() => s.saveProject(createProject())).toThrow(StorageUnavailableError);
    expect(s.listProjects()).toEqual([]);
    const bar = createBar('mem');
    s.saveClipboard(bar);
    expect(s.loadClipboard()?.id).toBe('mem');
  });

  it('boots from the last project, falling back to the newest loadable one', () => {
    const kv = new MemoryStore();
    const s = new ProjectStorage(kv);
    expect(s.loadMostRecent()).toBeNull();
    const older = { ...createProject('Older'), updatedAt: 1 };
    const newer = { ...createProject('Newer'), updatedAt: 2 };
    s.saveProject(older);
    s.saveProject(newer);
    s.setLastProjectId(older.id);
    expect(s.loadMostRecent()?.name).toBe('Older');
    kv.setItem(KEYS.project(older.id), '{broken');
    expect(s.loadMostRecent()?.name).toBe('Newer');
  });

  it('round-trips the bar clipboard', () => {
    const kv = new MemoryStore();
    const bar = createBar('c1');
    bar.beats[2].cells.snare[0] = 99;
    new ProjectStorage(kv).saveClipboard(bar);
    expect(new ProjectStorage(kv).loadClipboard()).toEqual(bar);
  });
});

describe('createAutosaver', () => {
  afterEach(() => vi.useRealTimers());

  it('saves only the latest project after the delay', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const a = createAutosaver(save, 500);
    const p1 = createProject('1');
    const p2 = createProject('2');
    a.schedule(p1);
    vi.advanceTimersByTime(300);
    a.schedule(p2);
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(p2);
  });

  it('flushes immediately on demand and only once', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const a = createAutosaver(save, 500);
    a.schedule(createProject());
    a.flush();
    a.flush();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
