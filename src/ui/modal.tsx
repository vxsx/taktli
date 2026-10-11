import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createStore, useStore } from 'zustand';
import styles from './Modal.module.css';
import { useOverlayRegistration } from './Popover';

const modalStore = createStore<{ node: ReactNode | null }>()(() => ({ node: null }));

export function showModal(node: ReactNode): void {
  modalStore.setState({ node });
}

export function closeModal(): void {
  modalStore.setState({ node: null });
}

export function ModalHost() {
  const node = useStore(modalStore, (s) => s.node);
  useOverlayRegistration(node !== null);
  if (!node) return null;
  return createPortal(<div className={styles.backdrop}>{node}</div>, document.body);
}

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  return (
    <div className={styles.sheet} role="dialog" aria-label={title}>
      <header className={styles.header}>
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}

interface PromptOptions {
  title: string;
  initial?: string;
  maxLength?: number;
  confirmLabel?: string;
  /** Shows a selectable read-only value with a single Close button. */
  readOnly?: boolean;
}

function PromptDialog({ title, initial = '', maxLength = 60, confirmLabel = 'OK', readOnly = false, onDone }: PromptOptions & { onDone(v: string | null): void }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <form
      className={styles.dialog}
      role="dialog"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
    >
      <h2>{title}</h2>
      <input ref={input} value={value} maxLength={maxLength} readOnly={readOnly} onChange={(e) => setValue(e.target.value)} />
      <div className={styles.actions}>
        <button type="button" onClick={() => onDone(null)}>{readOnly ? 'Close' : 'Cancel'}</button>
        {!readOnly && <button type="submit" className={styles.primary}>{confirmLabel}</button>}
      </div>
    </form>
  );
}

export function promptText(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    showModal(
      <PromptDialog
        {...options}
        onDone={(v) => {
          closeModal();
          resolve(v);
        }}
      />,
    );
  });
}

export function confirmAction({ title, message, confirmLabel = 'Delete' }: { title: string; message?: string; confirmLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      closeModal();
      resolve(v);
    };
    showModal(
      <div className={styles.dialog} role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        <div className={styles.actions}>
          <button onClick={() => done(false)}>Cancel</button>
          <button className={styles.dangerButton} onClick={() => done(true)}>{confirmLabel}</button>
        </div>
      </div>,
    );
  });
}
