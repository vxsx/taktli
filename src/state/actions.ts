import { transport } from '../audio/transport';
import { downloadBytes, safeFilename } from '../io/download';
import { exportMidi } from '../io/midi';
import { compressionSupported, encodeShare, shareUrl } from '../io/share';
import { cloneBar, createProject, newId } from '../model/factory';
import * as ops from '../model/ops';
import type { Project, TrackId } from '../model/types';
import { promptText } from '../ui/modal';
import { flushAutosave, safeSave, storage } from './persistence';
import { appStore, currentBar, currentPattern, type UiState } from './store';

const s = () => appStore.getState();

/** Moves the editor somewhere. While playing, this turns Follow off so playback can't snap the view back. */
function navigate(patch: Partial<UiState>): void {
  const { ui } = s();
  s().setUi({ ...patch, follow: ui.playing ? false : ui.follow });
}

// ---- bars ----

export function selectBar(index: number): void {
  navigate({ barIndex: index });
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
  navigate({ barIndex: ui.barIndex + 1 });
}

export function addBarAtEnd(): void {
  const { ui } = s();
  s().apply((p) => ops.addBar(p, ui.patternId));
  navigate({ barIndex: currentPattern(s()).bars.length - 1 });
}

export function duplicateCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.duplicateBar(p, ui.patternId, ui.barIndex));
  navigate({ barIndex: ui.barIndex + 1 });
}

export function clearCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.clearBar(p, ui.patternId, ui.barIndex));
}

export function randomizeCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.randomizeBars(p, ui.patternId, [ui.barIndex]));
}

export function randomizePattern(): void {
  const { ui } = s();
  const count = currentPattern(s()).bars.length;
  const before = s().project;
  s().apply((p) => ops.randomizeBars(p, ui.patternId, Array.from({ length: count }, (_, i) => i)));
  if (s().project !== before) s().toast(count === 1 ? 'New groove' : `New groove in all ${count} bars`);
}

export function deleteCurrentBar(): void {
  const { ui } = s();
  s().apply((p) => ops.deleteBar(p, ui.patternId, ui.barIndex));
}

export function moveBar(from: number, to: number): void {
  const { ui } = s();
  s().apply((p) => ops.moveBar(p, ui.patternId, from, to));
  navigate({ barIndex: to });
}

// ---- tracks ----

/** Adds `track` to the soloed set, or takes it out if it's already there. */
export function toggleSolo(track: TrackId): void {
  const { solo } = s().ui;
  s().setUi({ solo: solo.includes(track) ? solo.filter((t) => t !== track) : [...solo, track] });
}

export function clearSolo(): void {
  s().setUi({ solo: [] });
}

// ---- patterns ----

export function selectPattern(id: string): void {
  navigate({ patternId: id, barIndex: 0 });
}

export function addPattern(): void {
  const id = newId();
  s().apply((p) => ops.addPattern(p, id));
  navigate({ patternId: id, barIndex: 0 });
}

export function duplicatePattern(): void {
  const id = newId();
  const { ui } = s();
  s().apply((p) => ops.duplicatePattern(p, ui.patternId, id));
  navigate({ patternId: id, barIndex: 0 });
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

// ---- share & export ----

export async function shareProject(): Promise<void> {
  if (!compressionSupported()) return void s().toast('This browser is too old to create share links', 'error');
  const p = s().project;
  const url = shareUrl(await encodeShare(p), location.origin + location.pathname);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: p.name, url });
      return;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    s().toast('Link copied');
  } catch {
    await promptText({ title: 'Share link', initial: url, readOnly: true });
  }
}

export function exportMidiFile(): void {
  const { project, ui } = s();
  downloadBytes(exportMidi(project, { patternId: ui.patternId }), `${safeFilename(project.name)}.mid`, 'audio/midi');
}
