import * as actions from '../state/actions';
import { appStore, currentPattern, useApp } from '../state/store';
import { Menu, type MenuItem } from './Menu';
import { confirmAction, promptText } from './modal';

export function PatternMenu({ onClose }: { onClose(): void }) {
  const patterns = useApp((s) => s.project.patterns);
  const currentId = useApp((s) => s.ui.patternId);
  const items: (MenuItem | 'separator')[] = [
    ...patterns.map((p) => ({
      label: `${p.name} · ${p.bars.length} bar${p.bars.length === 1 ? '' : 's'}`,
      checked: p.id === currentId,
      onSelect: () => actions.selectPattern(p.id),
    })),
    'separator',
    { label: 'New pattern', onSelect: actions.addPattern },
    { label: 'Duplicate pattern', onSelect: actions.duplicatePattern },
    {
      label: 'Rename pattern…',
      onSelect: async () => {
        const pat = currentPattern(appStore.getState());
        const name = await promptText({ title: 'Rename pattern', initial: pat.name, maxLength: 24, confirmLabel: 'Rename' });
        if (name) actions.renamePattern(pat.id, name);
      },
    },
    {
      label: 'Delete pattern',
      danger: true,
      disabled: patterns.length <= 1,
      onSelect: async () => {
        const { project } = appStore.getState();
        const pat = currentPattern(appStore.getState());
        const uses = project.song.filter((s) => s.patternId === pat.id).length;
        const ok = await confirmAction({
          title: `Delete pattern ${pat.name}?`,
          message: uses > 0 ? `It is used ${uses}× in the song; those steps are removed too. Undo restores everything.` : 'Undo restores it.',
        });
        if (ok) actions.deletePattern(pat.id);
      },
    },
  ];
  return <Menu items={items} onClose={onClose} />;
}
