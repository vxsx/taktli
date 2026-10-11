import { useRef, type ButtonHTMLAttributes } from 'react';
import { LONG_PRESS_MS } from './gestures';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick(): void; onLongPress(): void };

/** Click for the main action; press and hold (or right-click) for the alternative. */
export function LongPressButton({ onClick, onLongPress, children, ...rest }: Props) {
  const timer = useRef(0);
  const long = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <button
      {...rest}
      onPointerDown={() => {
        long.current = false;
        timer.current = window.setTimeout(() => {
          long.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        long.current = true;
        onLongPress();
      }}
      onClick={() => {
        if (!long.current) onClick();
      }}
    >
      {children}
    </button>
  );
}
