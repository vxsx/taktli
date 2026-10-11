import { useMemo, useState } from 'react';
import * as actions from '../state/actions';
import { flushAutosave, storage } from '../state/persistence';
import { useApp } from '../state/store';
import { Menu } from './Menu';
import { closeModal, confirmAction, promptText, Sheet, showModal } from './modal';
import { Popover } from './Popover';
import styles from './Sheet.module.css';

const formatDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function ProjectsSheet() {
  const currentId = useApp((s) => s.project.id);
  const currentName = useApp((s) => s.project.name);
  const [menu, setMenu] = useState<{ id: string; name: string; rect: DOMRect } | null>(null);
  const projects = useMemo(() => storage.listProjects(), [currentId, currentName]);

  return (
    <Sheet title="Projects" onClose={closeModal}>
      <button
        className={styles.primary}
        onClick={() => {
          actions.newProject();
          closeModal();
        }}
      >
        New project
      </button>
      {!storage.available && <p className={styles.hint}>Saving is unavailable in this browser mode.</p>}
      <ul className={styles.list}>
        {projects.map((m) => (
          <li key={m.id} className={styles.row}>
            <button
              className={styles.projectOpen}
              aria-current={m.id === currentId}
              onClick={() => {
                actions.openProject(m.id);
                closeModal();
              }}
            >
              <span>{m.name}</span>
              <small>{formatDate(m.updatedAt)}</small>
            </button>
            <button aria-label={`More for ${m.name}`} onClick={(e) => setMenu({ id: m.id, name: m.name, rect: e.currentTarget.getBoundingClientRect() })}>⋯</button>
          </li>
        ))}
      </ul>
      {menu && (
        <Popover anchor={menu.rect} onClose={() => setMenu(null)}>
          <Menu
            onClose={() => setMenu(null)}
            items={[
              {
                label: 'Rename…',
                onSelect: async () => {
                  const name = await promptText({ title: 'Rename project', initial: menu.name, confirmLabel: 'Rename' });
                  if (name) actions.renameProject(menu.id, name);
                  openProjectsSheet();
                },
              },
              {
                label: 'Duplicate',
                onSelect: () => {
                  actions.duplicateProject(menu.id);
                  openProjectsSheet();
                },
              },
              {
                label: 'Delete…',
                danger: true,
                onSelect: async () => {
                  const ok = await confirmAction({ title: `Delete “${menu.name}”?`, message: 'This cannot be undone.' });
                  if (ok) actions.deleteProject(menu.id);
                  openProjectsSheet();
                },
              },
            ]}
          />
        </Popover>
      )}
    </Sheet>
  );
}

export function openProjectsSheet(): void {
  flushAutosave();
  showModal(<ProjectsSheet key={Date.now()} />);
}
