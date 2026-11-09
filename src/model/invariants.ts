import { CELLS_PER_BEAT } from './timing';
import { TRACK_IDS } from './tracks';
import type { Project } from './types';

/** Human-readable list of violated model invariants; empty means valid. */
export function projectProblems(p: Project): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(p.bpm) || p.bpm < 40 || p.bpm > 240) problems.push(`bpm ${p.bpm} out of range`);
  if (p.patterns.length === 0) problems.push('project has no patterns');

  const patternIds = new Set<string>();
  const barIds = new Set<string>();
  for (const pat of p.patterns) {
    if (patternIds.has(pat.id)) problems.push(`duplicate pattern id ${pat.id}`);
    patternIds.add(pat.id);
    if (!Number.isInteger(pat.swing) || pat.swing < 0 || pat.swing > 100) problems.push(`pattern ${pat.name}: swing out of range`);
    if (pat.bars.length === 0) problems.push(`pattern ${pat.name}: no bars`);
    pat.bars.forEach((bar, bi) => {
      if (barIds.has(bar.id)) problems.push(`duplicate bar id ${bar.id}`);
      barIds.add(bar.id);
      if (bar.beats.length !== 4) problems.push(`pattern ${pat.name} bar ${bi + 1}: expected 4 beats`);
      bar.beats.forEach((beat, k) => {
        const where = `pattern ${pat.name} bar ${bi + 1} beat ${k + 1}`;
        const isVelocity = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 127;
        for (const t of TRACK_IDS) {
          const cells = beat.cells[t];
          if (!Array.isArray(cells) || cells.length !== CELLS_PER_BEAT) {
            problems.push(`${where} ${t}: expected ${CELLS_PER_BEAT} cells`);
          } else if (!cells.every(isVelocity)) {
            problems.push(`${where} ${t}: velocity out of range`);
          }
          const splits = beat.splits?.[t];
          if (!Array.isArray(splits) || splits.length !== CELLS_PER_BEAT) {
            problems.push(`${where} ${t}: expected ${CELLS_PER_BEAT} splits`);
          } else if (!splits.every((v) => v === null || isVelocity(v))) {
            problems.push(`${where} ${t}: split velocity out of range`);
          }
        }
      });
    });
  }

  const stepIds = new Set<string>();
  for (const step of p.song) {
    if (stepIds.has(step.id)) problems.push(`duplicate song step id ${step.id}`);
    stepIds.add(step.id);
    if (!patternIds.has(step.patternId)) problems.push(`song step ${step.id} references a missing pattern`);
  }
  return problems;
}
