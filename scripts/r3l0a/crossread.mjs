/**
 * R3-L0A — THE CROSS-TRAJECTORY READ PROBE.
 *
 * The information-path audit found that several workers walked out of their world. This probe answers a sharper
 * question: did any worker read ANOTHER trajectory's promoted source, or the oracle, or a diagnostic scratch?
 * Those would be worse than reading its own harness files, because they cross the experiment's own unit
 * boundaries.
 *
 * It reads only durable session artifacts and reports counts. It re-runs nothing. Path matching is done on
 * NORMALIZED text (backslashes folded to slashes), so no regex literal has to escape a backslash.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { join } from 'node:path';

import { sessionArtifacts, decompressFrames } from './path-audit.mjs';

const NL = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);

/** The trajectory ids, so a reference can be attributed to the trajectory it names. */
export const TRAJECTORY_IDS = Object.freeze(['b0-C', 'b0-H', 'b1-C', 'b1-H', 'b2-C', 'b2-H', 'b3-C', 'b3-H']);

/** Fold Windows separators to POSIX, so one spelling matches every path. */
function normalize(text) {
  return text.split(BACKSLASH + BACKSLASH).join('/').split(BACKSLASH).join('/');
}

/** Count occurrences of a plain substring. */
function countOf(text, needle) {
  let total = 0;
  let index = text.indexOf(needle);
  while (index !== -1) { total += 1; index = text.indexOf(needle, index + 1); }
  return total;
}

/** Probe one trajectory's artifacts for cross-unit reads. */
export function probeTrajectory(home, ownTrajectoryId) {
  const rows = [];
  for (const artifact of sessionArtifacts(home)) {
    const text = normalize(decompressFrames(artifact.path));
    /** Which OTHER trajectories does this session's text name, as a path segment? */
    const others = TRAJECTORY_IDS.filter((id) => id !== ownTrajectoryId && text.includes(`/${id}/`));
    rows.push(Object.freeze({
      attemptId: artifact.attemptId,
      ownTrajectoryId,
      otherTrajectoriesReferenced: Object.freeze(others),
      oracleReferences: countOf(text, 'r3l0/diagnostic.mjs'),
      projectModuleReferences: countOf(text, 'r3l0/project.mjs'),
      capitalModuleReferences: countOf(text, 'r3l0/capital.mjs'),
      diagnosticScratchReferences: countOf(text, 'diagnostic/ledger.mjs'),
      checkoutRootReferences: countOf(text, 'Codex_Work_Space/Palimpsest'),
      otherTrajectorySourceReads: countOf(text, 'diagnostic/ledger.mjs') + TRAJECTORY_IDS.filter((id) => id !== ownTrajectoryId).reduce((total, id) => total + countOf(text, `/${id}/repo`), 0),
    }));
  }
  return Object.freeze(rows);
}

/** Probe every trajectory. */
export function probeAll(runDir) {
  const out = {};
  for (const id of TRAJECTORY_IDS) out[id] = probeTrajectory(join(runDir, id, 'home'), id);
  return Object.freeze(out);
}

/** Summarise the probe: which sessions crossed a boundary, and how. */
export function summarize(probes) {
  const sessions = Object.values(probes).flat();
  return Object.freeze({
    sessions: sessions.length,
    referencingAnotherTrajectory: sessions.filter((row) => row.otherTrajectoriesReferenced.length > 0).length,
    referencingTheOracle: sessions.filter((row) => row.oracleReferences > 0).length,
    referencingTheProjectModule: sessions.filter((row) => row.projectModuleReferences > 0).length,
    referencingTheCapitalModule: sessions.filter((row) => row.capitalModuleReferences > 0).length,
    referencingADiagnosticScratch: sessions.filter((row) => row.diagnosticScratchReferences > 0).length,
    referencingTheCheckoutRoot: sessions.filter((row) => row.checkoutRootReferences > 0).length,
    detail: Object.freeze(sessions.filter((row) => row.otherTrajectoriesReferenced.length > 0 || row.oracleReferences > 0 || row.checkoutRootReferences > 0)),
  });
}

function main() {
  const runDir = process.argv[2] ?? '';
  const summary = summarize(probeAll(runDir));
  process.stdout.write(`cross-unit probe over ${String(summary.sessions)} sessions${NL}`);
  process.stdout.write(`  referencing ANOTHER trajectory:   ${String(summary.referencingAnotherTrajectory)}${NL}`);
  process.stdout.write(`  referencing the ORACLE:           ${String(summary.referencingTheOracle)}${NL}`);
  process.stdout.write(`  referencing project.mjs:          ${String(summary.referencingTheProjectModule)}${NL}`);
  process.stdout.write(`  referencing capital.mjs:          ${String(summary.referencingTheCapitalModule)}${NL}`);
  process.stdout.write(`  referencing a diagnostic scratch: ${String(summary.referencingADiagnosticScratch)}${NL}`);
  process.stdout.write(`  referencing the checkout root:    ${String(summary.referencingTheCheckoutRoot)}${NL}`);
  for (const row of summary.detail) process.stdout.write(`    ${row.ownTrajectoryId} ${String(row.attemptId).slice(0, 12)} others=[${row.otherTrajectoriesReferenced.join(',')}] oracle=${String(row.oracleReferences)} checkout=${String(row.checkoutRootReferences)}${NL}`);
  return summary;
}

if (process.argv[1] !== undefined) main();
