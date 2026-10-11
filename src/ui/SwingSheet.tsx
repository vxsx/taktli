import { setSwing } from '../model/ops';
import { appStore, currentPattern, useApp } from '../state/store';
import { closeModal, Sheet, showModal } from './modal';
import styles from './Sheet.module.css';

function SwingSheet() {
  const pattern = useApp(currentPattern);
  const st = appStore.getState;
  const close = () => {
    st().endGesture();
    closeModal();
  };
  return (
    <Sheet title={`Swing — pattern ${pattern.name}`} onClose={close}>
      <label className={styles.sliderRow}>
        <input
          type="range"
          min={0}
          max={100}
          value={pattern.swing}
          aria-label="Swing amount"
          onChange={(e) => st().applyTransient((p) => setSwing(p, pattern.id, Number(e.target.value)))}
          onPointerUp={() => st().endGesture()}
          onBlur={() => st().endGesture()}
        />
        <output>{pattern.swing}%</output>
      </label>
      <p className={styles.hint}>Delays the off-beat 16ths. About 67% is a triplet shuffle. Triplet beats are not affected.</p>
    </Sheet>
  );
}

export function openSwingSheet(): void {
  showModal(<SwingSheet />);
}
