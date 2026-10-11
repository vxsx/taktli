import type { Pattern } from '../model/types';
import { notationMarks, toNotation, type NotationBeat, type NotationEvent } from './toNotation';

type VF = typeof import('vexflow/bravura');
type StaveNote = InstanceType<VF['StaveNote']>;
type Beam = InstanceType<VF['Beam']>;
type Tuplet = InstanceType<VF['Tuplet']>;
type Voice = InstanceType<VF['Voice']>;

export interface BarLayout {
  left: number;
  right: number;
  noteStart: number;
  noteEnd: number;
}

export const BAR_WIDTH = 280;
const FIRST_BAR_EXTRA = 70;
export const NOTATION_HEIGHT = 150;
const STAVE_Y = 28;

function makeNote(VF: VF, ev: NotationEvent, voice: 'hands' | 'feet'): StaveNote {
  const stemDirection = voice === 'hands' ? VF.Stem.UP : VF.Stem.DOWN;
  const dotted = ev.duration === '8d';
  if (ev.rest) {
    const rest = new VF.StaveNote({ keys: [voice === 'hands' ? 'b/4' : 'e/4'], duration: `${ev.duration}r`, stemDirection });
    if (dotted) VF.Dot.buildAndAttach([rest], { all: true });
    return rest;
  }
  const marks = notationMarks(ev.hits);
  const note = new VF.StaveNote({ keys: marks.keys.map((k) => k.key), duration: ev.duration, stemDirection, autoStem: false });
  if (dotted) VF.Dot.buildAndAttach([note], { all: true });
  marks.keys.forEach((k, i) => {
    if (!k.ghost) return;
    note.addModifier(new VF.Parenthesis(VF.Modifier.Position.LEFT), i);
    note.addModifier(new VF.Parenthesis(VF.Modifier.Position.RIGHT), i);
  });
  if (marks.accent) {
    note.addModifier(
      new VF.Articulation('a>').setPosition(voice === 'hands' ? VF.Modifier.Position.ABOVE : VF.Modifier.Position.BELOW),
      0,
    );
  }
  if (marks.open) note.addModifier(new VF.Annotation('o').setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0);
  return note;
}

function buildVoice(VF: VF, beats: NotationBeat[], voice: 'hands' | 'feet') {
  const notes: StaveNote[] = [];
  const beams: Beam[] = [];
  const tuplets: Tuplet[] = [];
  for (const beat of beats) {
    const beatNotes = beat.events.map((ev) => makeNote(VF, ev, voice));
    notes.push(...beatNotes);
    if (beat.tuplet) {
      tuplets.push(new VF.Tuplet(beatNotes, {
        numNotes: beat.tuplet.numNotes,
        notesOccupied: beat.tuplet.notesOccupied,
        bracketed: true,
        location: voice === 'hands' ? 1 : -1,
      }));
    }
    const beamable = beatNotes.filter((_, i) => !beat.events[i].rest && beat.events[i].duration !== 'q');
    if (beamable.length >= 2) beams.push(new VF.Beam(beamable));
  }
  const v: Voice = new VF.Voice({ numBeats: 4, beatValue: 4 }).setMode(VF.Voice.Mode.SOFT);
  v.addTickables(notes);
  return { voice: v, beams, tuplets };
}

/** Draws all bars of `pattern` on one percussion staff into `el`; returns per-bar x ranges for the cursor. */
export function renderNotation(el: HTMLDivElement, pattern: Pattern, VF: VF): BarLayout[] {
  el.innerHTML = '';
  const width = 8 + FIRST_BAR_EXTRA + BAR_WIDTH * pattern.bars.length;
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, NOTATION_HEIGHT);
  const ctx = renderer.getContext();
  if (pattern.swing > 0) {
    ctx.setFont('Arial', 12);
    ctx.fillText(`Swing ${pattern.swing}%`, 8, 16);
  }

  const layout: BarLayout[] = [];
  let x = 4;
  pattern.bars.forEach((bar, i) => {
    const w = BAR_WIDTH + (i === 0 ? FIRST_BAR_EXTRA : 0);
    const stave = new VF.Stave(x, STAVE_Y, w);
    if (i === 0) stave.addClef('percussion').addTimeSignature('4/4');
    stave.setContext(ctx).draw();

    const n = toNotation(bar);
    const hands = buildVoice(VF, n.hands, 'hands');
    const parts = [hands];
    if (!n.feetEmpty) parts.push(buildVoice(VF, n.feet, 'feet'));
    const voices = parts.map((p) => p.voice);
    // Notes need their stave before formatting, or modifiers such as Parenthesis measure from x=0.
    for (const v of voices) v.setStave(stave);
    new VF.Formatter().joinVoices(voices).formatToStave(voices, stave);
    for (const v of voices) v.draw(ctx, stave);
    for (const p of parts) {
      for (const b of p.beams) b.setContext(ctx).draw();
      for (const t of p.tuplets) t.setContext(ctx).draw();
    }
    layout.push({ left: x, right: x + w, noteStart: stave.getNoteStartX(), noteEnd: stave.getNoteEndX() });
    x += w;
  });
  return layout;
}
