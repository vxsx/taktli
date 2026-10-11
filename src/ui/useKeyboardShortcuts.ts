import { useEffect } from 'react';
import { transport } from '../audio/transport';
import { appStore } from '../state/store';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space' && !mod) {
        e.preventDefault();
        transport.toggle();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) appStore.getState().redo();
        else appStore.getState().undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        appStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
