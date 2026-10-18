import { setTrackHidden, setTrackMuted } from '../model/ops';
import { TRACKS } from '../model/tracks';
import { toggleSolo } from '../state/actions';
import { appStore, currentPattern, useApp } from '../state/store';
import { closeModal, Sheet, showModal } from './modal';
import styles from './Sheet.module.css';

function TracksSheet() {
  const tracks = useApp((s) => s.project.tracks);
  const pattern = useApp(currentPattern);
  const solo = useApp((s) => s.ui.solo);
  const apply = appStore.getState().apply;
  return (
    <Sheet title="Tracks" onClose={closeModal}>
      {TRACKS.map((t) => {
        const s = tracks[t.id];
        const hasNotes = pattern.bars.some((b) => b.beats.some((beat) => beat.cells[t.id].some((v) => v > 0)));
        return (
          <div key={t.id} className={styles.row}>
            <span className={styles.swatch} style={{ background: t.color }} />
            <span className={styles.name}>
              {t.label}
              {s.hidden && hasNotes && <em className={styles.badge}>has notes</em>}
            </span>
            <button aria-pressed={!s.hidden} aria-label={`Show ${t.label}`} onClick={() => apply((p) => setTrackHidden(p, t.id, !s.hidden))}>
              {s.hidden ? 'Hidden' : 'Shown'}
            </button>
            <button aria-pressed={s.muted} aria-label={`Mute ${t.label}`} onClick={() => apply((p) => setTrackMuted(p, t.id, !s.muted))}>
              {s.muted ? 'Muted' : 'Mute'}
            </button>
            <button aria-pressed={solo.includes(t.id)} aria-label={`Solo ${t.label}`} onClick={() => toggleSolo(t.id)}>
              Solo
            </button>
          </div>
        );
      })}
    </Sheet>
  );
}

export function openTracksSheet(): void {
  showModal(<TracksSheet />);
}
