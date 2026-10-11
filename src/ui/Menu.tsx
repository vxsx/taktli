import styles from './Popover.module.css';

export interface MenuItem {
  label: string;
  onSelect(): void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
}

export function Menu({ items, onClose }: { items: (MenuItem | 'separator')[]; onClose(): void }) {
  return (
    <div className={styles.menu} role="menu">
      {items.map((item, i) =>
        item === 'separator' ? (
          <hr key={i} className={styles.sep} />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={item.danger ? styles.danger : undefined}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.checked ? '✓ ' : ''}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
