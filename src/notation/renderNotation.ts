import type { Pattern } from '../model/types';
import { LINE_HEIGHT, layoutNotation } from './layout';
import { notationMarks, toNotation, type NotationBeat, type NotationEvent } from './toNotation';

type VF = typeof import('vexflow/bravura');
type StaveNote = InstanceType<VF['StaveNote']>;
type Beam = InstanceType<VF['Beam']>;
type Tuplet = InstanceType<VF['Tuplet']>;
type Voice = InstanceType<VF['Voice']>;

/** Where one bar landed, in CSS pixels relative to the notation element. */
export interface BarLayout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  noteStart: number;
  noteEnd: number;
  cursorTop: number;
  cursorHeight: number;
}

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

/** Draws all bars of `pattern` as sheet music sized to a `width`×`height` CSS-pixel area; returns where each bar went. */
export function renderNotation(el: HTMLDivElement, pattern: Pattern, VF: VF, width: number, height: number): BarLayout[] {
  el.innerHTML = '';
  const area = layoutNotation(pattern.bars.length, width, height);
  const s = area.scale;
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(area.width * s, area.height * s);
  const ctx = renderer.getContext();
  ctx.scale(s, s);
  if (pattern.swing > 0) {
    ctx.setFont('Arial', 12);
    ctx.fillText(`Swing ${pattern.swing}%`, 8, 16);
  }

  return pattern.bars.map((bar, i) => {
    const box = area.bars[i];
    const lineTop = box.line * LINE_HEIGHT;
    const stave = new VF.Stave(box.x, lineTop + STAVE_Y, box.width);
    if (box.lineStart) stave.addClef('percussion');
    if (i === 0) stave.addTimeSignature('4/4');
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
    return {
      left: box.x * s,
      right: (box.x + box.width) * s,
      top: lineTop * s,
      bottom: (lineTop + LINE_HEIGHT) * s,
      noteStart: stave.getNoteStartX() * s,
      noteEnd: stave.getNoteEndX() * s,
      cursorTop: (lineTop + 14) * s,
      cursorHeight: 110 * s,
    };
  });
}
