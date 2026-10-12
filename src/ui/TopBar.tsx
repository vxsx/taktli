import { useState, type MouseEvent } from 'react';
import { transport } from '../audio/transport';
import { appStore, currentPattern, useApp } from '../state/store';
import { BpmPopover } from './BpmPopover';
import { Menu } from './Menu';
import { moreMenuItems } from './moreMenu';
import { PatternMenu } from './PatternMenu';
import { Popover } from './Popover';
import { Segmented } from './Segmented';
import styles from './TopBar.module.css';

type Open = { kind: 'bpm' | 'pattern' | 'more'; rect: DOMRect } | null;

export function TopBar() {
  const playing = useApp((s) => s.ui.playing);
  const bpm = useApp((s) => s.project.bpm);
  const patternName = useApp((s) => currentPattern(s).name);
  const playMode = useApp((s) => s.ui.playMode);
  const songEmpty = useApp((s) => s.project.song.length === 0);
  const editMode = useApp((s) => s.ui.editMode);
  const view = useApp((s) => s.ui.view);
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const [open, setOpen] = useState<Open>(null);
  const st = appStore.getState;
  const opener = (kind: NonNullable<Open>['kind']) => (e: MouseEvent<HTMLElement>) => setOpen({ kind, rect: e.currentTarget.getBoundingClientRect() });
  const close = () => setOpen(null);

  return (
    <header className={styles.bar}>
      <button className={styles.play} aria-label={playing ? 'Stop' : 'Play'} aria-pressed={playing} onClick={() => transport.toggle()}>
        {playing ? '■' : '▶'}
      </button>
      <button aria-label="Tempo" onClick={opener('bpm')}>♩ {bpm}</button>
      <button aria-label="Pattern" onClick={opener('pattern')}>{patternName} ▾</button>
      <Segmented
        label="Play mode"
        value={playMode}
        options={[
          { value: 'pattern', label: 'Pattern' },
          { value: 'song', label: 'Song', disabled: songEmpty, title: songEmpty ? 'Add steps in the Song view first' : undefined },
        ]}
        onChange={(v) => st().setUi({ playMode: v })}
      />
      {view === 'grid' && (
        <Segmented
          label="Edit mode"
          value={editMode}
          options={[{ value: 'notes', label: 'Notes' }, { value: 'volume', label: 'Volume' }]}
          onChange={(v) => st().setUi({ editMode: v })}
        />
      )}
      <div className={styles.spacer} />
      <button aria-label="Undo" disabled={!canUndo} onClick={() => st().undo()}>↶</button>
      <button aria-label="Redo" disabled={!canRedo} onClick={() => st().redo()}>↷</button>
      <button aria-label="More" onClick={opener('more')}>⋯</button>

      {open?.kind === 'bpm' && <BpmPopover anchor={open.rect} onClose={close} />}
      {open?.kind === 'pattern' && (
        <Popover anchor={open.rect} onClose={close}>
          <PatternMenu onClose={close} />
        </Popover>
      )}
      {open?.kind === 'more' && (
        <Popover anchor={open.rect} onClose={close}>
          <Menu items={moreMenuItems(view)} onClose={close} />
        </Popover>
      )}
    </header>
  );
}
