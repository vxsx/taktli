import { transport } from '../audio/transport';
import { compressionSupported, decodeShare, payloadFromHash } from '../io/share';
import { browserStore, createAutosaver, ProjectStorage } from '../io/storage';
import { createDemoProject } from '../model/factory';
import type { Project } from '../model/types';
import { appStore } from './store';

export const storage = new ProjectStorage(browserStore());

const SAVE_FAILED = "Can't save on this device — changes are kept until you close the page";
let warnedSaveFailure = false;

export function safeSave(p: Project): void {
  try {
    storage.saveProject(p);
  } catch {
    if (!warnedSaveFailure) {
      warnedSaveFailure = true;
      appStore.getState().toast(SAVE_FAILED, 'error');
    }
  }
}

const autosaver = createAutosaver(safeSave, 500);

export function flushAutosave(): void {
  autosaver.flush();
}

/** Imports `#p=…` as a new project and opens it. Clears the hash either way. */
export async function importSharedProject(hash: string): Promise<void> {
  const payload = payloadFromHash(hash);
  if (!payload) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (!compressionSupported()) {
    appStore.getState().toast('This browser is too old to open shared links', 'error');
    return;
  }
  try {
    const p = await decodeShare(payload);
    transport.stop();
    flushAutosave();
    safeSave(p);
    appStore.getState().loadProject(p);
    storage.setLastProjectId(p.id);
    appStore.getState().toast(`Opened shared beat “${p.name}”`);
  } catch {
    appStore.getState().toast('This link is invalid or damaged', 'error');
  }
}

let started = false;

/** Loads the initial project and wires autosave, kit preloading, lifecycle and share links. */
export async function bootstrap(): Promise<void> {
  if (started) return;
  started = true;

  if (!storage.available) {
    warnedSaveFailure = true;
    appStore.getState().toast(SAVE_FAILED, 'error');
  }

  if (storage.forgetCorrupt() > 0) {
    appStore.getState().toast('Some saved projects were damaged and have been removed from the list', 'error');
  }

  let project = storage.loadMostRecent();
  if (!project) {
    project = createDemoProject();
    safeSave(project);
  }
  appStore.getState().loadProject(project);
  storage.setLastProjectId(project.id);

  appStore.subscribe((st, prev) => {
    if (st.project !== prev.project) {
      autosaver.schedule(st.project);
      if (st.project.id !== prev.project.id) storage.setLastProjectId(st.project.id);
    }
    if (st.project.kit !== prev.project.kit) transport.preload(st.project.kit);
  });

  window.addEventListener('pagehide', flushAutosave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushAutosave();
      transport.stop();
    }
  });
  window.addEventListener('hashchange', () => void importSharedProject(location.hash));

  transport.preload(project.kit);
  await importSharedProject(location.hash);
}
