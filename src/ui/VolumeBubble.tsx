import { useImperativeHandle, useRef, type Ref } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export interface BubbleHandle {
  show(rect: DOMRect, velocity: number): void;
  hide(): void;
}

/** Value readout shown above the finger while a volume gesture is active. Updated imperatively. */
export function VolumeBubble({ ref }: { ref: Ref<BubbleHandle> }) {
  const box = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useImperativeHandle(ref, () => ({
    show(rect, velocity) {
      const el = box.current;
      if (!el || !fill.current || !label.current) return;
      const w = 48;
      const h = 92;
      let top = rect.top - h - 10;
      if (top < 4) top = rect.bottom + 10;
      const left = Math.max(4, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 4));
      el.style.transform = `translate(${left}px, ${top}px)`;
      el.style.display = 'flex';
      fill.current.style.height = `${(velocity / 127) * 100}%`;
      label.current.textContent = String(velocity);
    },
    hide() {
      if (box.current) box.current.style.display = 'none';
    },
  }), []);

  return createPortal(
    <div ref={box} className={styles.bubble} data-testid="volume-bubble">
      <div className={styles.meter}>
        <div ref={fill} className={styles.meterFill} />
      </div>
      <span ref={label} className={styles.bubbleValue} />
    </div>,
    document.body,
  );
}
