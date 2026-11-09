import styles from './Grid.module.css';

/** Beat numbers above the grid, each spanning its beat group. */
export function BeatHeader() {
  return (
    <div className={styles.header} aria-hidden>
      <div className={styles.headerSpacer} />
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className={styles.beatNumber}>
          {n}
        </div>
      ))}
    </div>
  );
}
