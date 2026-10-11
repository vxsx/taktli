import styles from './App.module.css';
import { useApp } from './state/store';
import { Grid } from './ui/Grid';
import { ModalHost } from './ui/modal';
import { RotateOverlay } from './ui/RotateOverlay';
import { Toasts } from './ui/Toasts';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';
import { usePlaybackFollow } from './ui/usePlaybackFollow';

export function App() {
  const view = useApp((s) => s.ui.view);
  useKeyboardShortcuts();
  usePlaybackFollow();
  return (
    <div className={styles.app}>
      <main className={styles.main}>{view === 'grid' && <Grid />}</main>
      <Toasts />
      <ModalHost />
      <RotateOverlay />
    </div>
  );
}
