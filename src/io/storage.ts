import { parseBar, parseProject } from '../model/validate';
import type { Bar, Project } from '../model/types';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class StorageUnavailableError extends Error {
  constructor(message = 'Storage unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export const KEYS = {
  index: 'dm:index',
  last: 'dm:last',
  clipboard: 'dm:clipboard',
  project: (id: string) => `dm:project:${id}`,
};

/** localStorage if it is usable (it throws in some private modes), else null. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.setItem('dm:probe', '1');
    s.removeItem('dm:probe');
    return s;
  } catch {
    return null;
  }
}

const isMeta = (m: unknown): m is ProjectMeta =>
  typeof m === 'object' && m !== null &&
  typeof (m as ProjectMeta).id === 'string' &&
  typeof (m as ProjectMeta).name === 'string' &&
  typeof (m as ProjectMeta).updatedAt === 'number';

export class ProjectStorage {
  private memoryClipboard: Bar | null = null;

  constructor(private readonly kv: KeyValueStore | null) {}

  get available(): boolean {
    return this.kv !== null;
  }

  private read(key: string): unknown {
    if (!this.kv) return null;
    try {
      const raw = this.kv.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    if (!this.kv) throw new StorageUnavailableError();
    try {
      this.kv.setItem(key, JSON.stringify(value));
    } catch (e) {
      throw new StorageUnavailableError(e instanceof Error ? e.message : String(e));
    }
  }

  private readIndex(): ProjectMeta[] {
    const raw = this.read(KEYS.index);
    return Array.isArray(raw) ? raw.filter(isMeta) : [];
  }

  listProjects(): ProjectMeta[] {
    return this.readIndex()
      .filter((m) => this.loadProject(m.id) !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  loadProject(id: string): Project | null {
    const raw = this.read(KEYS.project(id));
    if (raw === null) return null;
    const p = parseProject(raw);
    if (!p) {
      console.warn(`Skipping corrupt project ${id}`);
      return null;
    }
    return { ...p, id };
  }

  saveProject(p: Project): void {
    this.write(KEYS.project(p.id), p);
    const index = this.readIndex().filter((m) => m.id !== p.id);
    index.push({ id: p.id, name: p.name, updatedAt: p.updatedAt });
    this.write(KEYS.index, index);
  }

  deleteProject(id: string): void {
    if (!this.kv) return;
    try {
      this.kv.removeItem(KEYS.project(id));
      this.write(KEYS.index, this.readIndex().filter((m) => m.id !== id));
      if (this.getLastProjectId() === id) this.kv.removeItem(KEYS.last);
    } catch {
      // best effort
    }
  }

  getLastProjectId(): string | null {
    if (!this.kv) return null;
    try {
      return this.kv.getItem(KEYS.last);
    } catch {
      return null;
    }
  }

  setLastProjectId(id: string): void {
    if (!this.kv) return;
    try {
      this.kv.setItem(KEYS.last, id);
    } catch {
      // ignore
    }
  }

  /** Number of index entries whose stored project is missing or unreadable. */
  countCorrupt(): number {
    return this.readIndex().filter((m) => this.loadProject(m.id) === null).length;
  }

  /**
   * Removes index entries whose project can't be loaded and returns how many were removed.
   * The raw `dm:project:<id>` data is left in place for manual recovery.
   */
  forgetCorrupt(): number {
    const index = this.readIndex();
    const healthy = index.filter((m) => this.loadProject(m.id) !== null);
    const removed = index.length - healthy.length;
    if (removed > 0) {
      try {
        this.write(KEYS.index, healthy);
      } catch {
        // can't persist the cleanup; the warning may repeat next launch
      }
    }
    return removed;
  }

  /** The last-opened project if loadable, else the newest loadable one, else null. */
  loadMostRecent(): Project | null {
    const last = this.getLastProjectId();
    const fromLast = last ? this.loadProject(last) : null;
    if (fromLast) return fromLast;
    for (const meta of this.listProjects()) {
      const p = this.loadProject(meta.id);
      if (p) return p;
    }
    return null;
  }

  loadClipboard(): Bar | null {
    const raw = this.read(KEYS.clipboard);
    return raw ? parseBar(raw) : this.memoryClipboard;
  }

  saveClipboard(bar: Bar): void {
    this.memoryClipboard = bar;
    try {
      this.write(KEYS.clipboard, bar);
    } catch {
      // the in-memory copy still works for this session
    }
  }
}

export interface Autosaver {
  schedule(p: Project): void;
  flush(): void;
}

export function createAutosaver(save: (p: Project) => void, delayMs = 500): Autosaver {
  let pending: Project | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending) {
      const p = pending;
      pending = null;
      save(p);
    }
  };
  return {
    schedule(p) {
      pending = p;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
