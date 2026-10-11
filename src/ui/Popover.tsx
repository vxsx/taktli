import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export interface PopoverProps {
  anchor: DOMRect;
  onClose(): void;
  children: ReactNode;
}

/** Floating panel next to `anchor`; closes on outside tap or Escape. */
export function Popover({ anchor, onClose, children }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - w / 2, window.innerWidth - w - 8));
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} className={styles.panel} style={pos ?? { visibility: 'hidden', left: 0, top: 0 }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
