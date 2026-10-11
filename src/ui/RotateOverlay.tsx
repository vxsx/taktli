import styles from './RotateOverlay.module.css';

export function RotateOverlay() {
  return (
    <div className={styles.overlay} data-testid="rotate-overlay">
      <div className={styles.phone} aria-hidden>📱</div>
      <p className={styles.title}>Rotate your phone</p>
      <p className={styles.hint}>The drum machine works in landscape.</p>
    </div>
  );
}
