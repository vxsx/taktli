import styles from './TopBar.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Tooltip, e.g. why an option is disabled. */
  title?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange(v: T): void }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
