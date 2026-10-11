import styles from './App.module.css';
import { useApp } from './state/store';
import { BarStrip } from './ui/BarStrip';
import { Grid } from './ui/Grid';
import { ModalHost } from './ui/modal';
import { RotateOverlay } from './ui/RotateOverlay';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';
import { useKeyboardShortcuts } from './ui/useKeyboardShortcuts';
import { usePlaybackFollow } from './ui/usePlaybackFollow';

export function App() {
  const view = useApp((s) => s.ui.view);
  useKeyboardShortcuts();
  usePlaybackFollow();
  return (
    <div className={styles.app}>
      <TopBar />
      <main className={styles.main}>{view === 'grid' && <Grid />}</main>
      {view === 'grid' && <BarStrip />}
      <Toasts />
      <ModalHost />
      <RotateOverlay />
    </div>
  );
}
