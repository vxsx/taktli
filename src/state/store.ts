import { createStore, useStore } from 'zustand';
import { createProject } from '../model/factory';
import type { PlayMode } from '../model/timeline';
import type { Bar, Pattern, Project, TrackId } from '../model/types';

export type View = 'grid' | 'song' | 'notation';
export type EditMode = 'notes' | 'volume';

export interface UiState {
  patternId: string;
  barIndex: number;
  view: View;
  editMode: EditMode;
  playMode: PlayMode;
  loopBar: boolean;
  follow: boolean;
  playing: boolean;
  /** Soloed tracks, for listening only: not saved and not undoable. */
  solo: readonly TrackId[];
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export type Edit = (p: Project) => Project;

export interface AppState {
  project: Project;
  past: Project[];
  future: Project[];
  /** Project snapshot taken when the current gesture began; null when no gesture is active. */
  gestureBase: Project | null;
  ui: UiState;
  toasts: Toast[];
  apply(edit: Edit): void;
  beginGesture(): void;
  applyTransient(edit: Edit): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  loadProject(p: Project): void;
  setUi(patch: Partial<UiState>): void;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

export const HISTORY_LIMIT = 200;

export function initialUi(p: Project): UiState {
  return {
    patternId: p.patterns[0].id,
    barIndex: 0,
    view: 'grid',
    editMode: 'notes',
    playMode: 'pattern',
    loopBar: false,
    follow: true,
    playing: false,
    solo: [],
  };
}

/** Repairs UI references after the project changed underneath them. Returns `ui` itself if already valid. */
function validUi(p: Project, ui: UiState): UiState {
  const pat = p.patterns.find((x) => x.id === ui.patternId) ?? p.patterns[0];
  const barIndex = Math.min(Math.max(0, ui.barIndex), pat.bars.length - 1);
  const playMode: PlayMode = ui.playMode === 'song' && p.song.length === 0 ? 'pattern' : ui.playMode;
  if (pat.id === ui.patternId && barIndex === ui.barIndex && playMode === ui.playMode) return ui;
  return { ...ui, patternId: pat.id, barIndex, playMode };
}

let toastSeq = 0;

export function createAppStore(initial: Project, now: () => number = Date.now) {
  return createStore<AppState>()((set, get) => {
    const commit = (next: Project, base: Project) => {
      const stamped: Project = { ...next, updatedAt: now() };
      set((s) => ({
        project: stamped,
        past: [...s.past, base].slice(-HISTORY_LIMIT),
        future: [],
        ui: validUi(stamped, s.ui),
      }));
    };

    return {
      project: initial,
      past: [],
      future: [],
      gestureBase: null,
      ui: initialUi(initial),
      toasts: [],

      apply(edit) {
        if (get().gestureBase) get().endGesture();
        const current = get().project;
        const next = edit(current);
        if (next !== current) commit(next, current);
      },

      beginGesture() {
        if (!get().gestureBase) set({ gestureBase: get().project });
      },

      applyTransient(edit) {
        get().beginGesture();
        const current = get().project;
        const next = edit(current);
        if (next !== current) set((s) => ({ project: next, ui: validUi(next, s.ui) }));
      },

      endGesture() {
        const { gestureBase: base, project } = get();
        if (!base) return;
        set({ gestureBase: null });
        if (project !== base) commit(project, base);
      },

      undo() {
        get().endGesture();
        const s = get();
        const prev = s.past[s.past.length - 1];
        if (!prev) return;
        set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], ui: validUi(prev, s.ui) });
      },

      redo() {
        get().endGesture();
        const s = get();
        const next = s.future[0];
        if (!next) return;
        set({ project: next, past: [...s.past, s.project], future: s.future.slice(1), ui: validUi(next, s.ui) });
      },

      loadProject(p) {
        set({ project: p, past: [], future: [], gestureBase: null, ui: initialUi(p) });
      },

      setUi(patch) {
        set((s) => ({ ui: validUi(s.project, { ...s.ui, ...patch }) }));
      },

      toast(message, kind = 'info') {
        const id = ++toastSeq;
        set((s) => ({ toasts: [...s.toasts, { id, message, kind }].slice(-3) }));
      },

      dismissToast(id) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      },
    };
  });
}

export type AppStore = ReturnType<typeof createAppStore>;

/** App-wide singleton. bootstrap() replaces the placeholder project on startup. */
export const appStore: AppStore = createAppStore(createProject());

/** Selectors must return stored references or primitives (never fresh objects). */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(appStore, selector);
}

export function currentPattern(s: Pick<AppState, 'project' | 'ui'>): Pattern {
  return s.project.patterns.find((p) => p.id === s.ui.patternId) ?? s.project.patterns[0];
}

export function currentBar(s: Pick<AppState, 'project' | 'ui'>): Bar {
  const pat = currentPattern(s);
  return pat.bars[Math.min(s.ui.barIndex, pat.bars.length - 1)];
}
