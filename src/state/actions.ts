import { transport } from '../audio/transport';
import { cloneBar, createProject, newId } from '../model/factory';
import * as ops from '../model/ops';
import type { Project } from '../model/types';
import { flushAutosave, safeSave, storage } from './persistence';
import { appStore, currentBar, currentPattern } from './store';

const s = () => appStore.getState();

// ---- bars ----

export function selectBar(index: number): void {
  const { ui } = s();
  s().setUi({ barIndex: index, follow: ui.playing ? false : ui.follow });
}

export function copyBar(): void {
  storage.saveClipboard(currentBar(s()));
  s().toast('Bar copied');
}

export function pasteBar(): void {
  const bar = storage.loadClipboard();
  if (!bar) return s().toast('Nothing to paste — copy a bar first');
  const { ui } = s();
  s().apply((p) => ops.replaceBarContents(p, ui.patternId, ui.barIndex, bar));
}

export function pasteBarAsNew(): void {
  const bar = storage.loadClipboard();
  if (!bar) return s().toast('Nothing to paste — copy a bar first');
  const { ui } = s();
  s().apply((p) => ops.insertBarAfter(p, ui.patternId, ui.barIndex, cloneBar(bar)));
  s().setUi({ barIndex: ui.barIndex + 1 });
}

export function addBarAtEnd(): void {
  const { ui } = s();
  s().apply((p) => ops.addBar(p, ui.patternId));
  s().setUi({ barIndex: currentPattern(s()).bars.length - 1 });
}

export function duplicateCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.duplicateBar(p, ui.patternId, ui.barIndex));
  s().setUi({ barIndex: ui.barIndex + 1 });
}

export function clearCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.clearBar(p, ui.patternId, ui.barIndex));
}

export function deleteCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.deleteBar(p, ui.patternId, ui.barIndex));
}

export function moveBar(from: number, to: number): void {
  const { ui } = s();
  s().apply((p) => ops.moveBar(p, ui.patternId, from, to));
  s().setUi({ barIndex: to });
}

// ---- patterns ----

export function selectPattern(id: string): void {
  const { ui } = s();
  s().setUi({ patternId: id, barIndex: 0, follow: ui.playing ? false : ui.follow });
}

export function addPattern(): void {
  const id = newId();
  s().apply((p) => ops.addPattern(p, id));
  s().setUi({ patternId: id, barIndex: 0 });
}

export function duplicatePattern(): void {
  const id = newId();
  const { ui } = s();
  s().apply((p) => ops.duplicatePattern(p, ui.patternId, id));
  s().setUi({ patternId: id, barIndex: 0 });
}

export function renamePattern(id: string, name: string): void {
  s().apply((p) => ops.renamePattern(p, id, name));
}

export function deletePattern(id: string): void {
  s().apply((p) => ops.deletePattern(p, id));
}

// ---- projects ----

export function switchToProject(p: Project): void {
  transport.stop();
  flushAutosave();
  s().loadProject(p);
  storage.setLastProjectId(p.id);
}

export function openProject(id: string): void {
  if (id === s().project.id) return;
  const p = storage.loadProject(id);
  if (!p) return s().toast("This project is damaged and can't be opened", 'error');
  switchToProject(p);
}

export function newProject(): void {
  const p = createProject();
  safeSave(p);
  switchToProject(p);
}

export function duplicateProject(id: string): void {
  flushAutosave();
  const src = id === s().project.id ? s().project : storage.loadProject(id);
  if (!src) return;
  const now = Date.now();
  const copy: Project = { ...structuredClone(src), id: newId(), name: `${src.name} copy`.slice(0, 60), createdAt: now, updatedAt: now };
  safeSave(copy);
  s().toast(`Created “${copy.name}”`);
}

export function renameProject(id: string, name: string): void {
  if (id === s().project.id) {
    s().apply((p) => ops.setProjectName(p, name));
    return;
  }
  const p = storage.loadProject(id);
  if (!p) return;
  const renamed = ops.setProjectName(p, name);
  if (renamed !== p) safeSave({ ...renamed, updatedAt: Date.now() });
}

export function deleteProject(id: string): void {
  storage.deleteProject(id);
  if (id !== s().project.id) return;
  const next = storage.loadMostRecent();
  if (next) switchToProject(next);
  else newProject();
}
