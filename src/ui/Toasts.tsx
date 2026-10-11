import { useEffect } from 'react';
import { appStore, useApp, type Toast } from '../state/store';
import styles from './Toasts.module.css';

function ToastItem({ toast }: { toast: Toast }) {
  useEffect(() => {
    const h = setTimeout(() => appStore.getState().dismissToast(toast.id), toast.kind === 'error' ? 5000 : 2500);
    return () => clearTimeout(h);
  }, [toast]);
  return (
    <button className={`${styles.toast} ${toast.kind === 'error' ? styles.error : ''}`} onClick={() => appStore.getState().dismissToast(toast.id)}>
      {toast.message}
    </button>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
