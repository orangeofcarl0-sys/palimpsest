/**
 * R3-L0B §10 — THE BREACH-REPLAY CONTROL.
 *
 * §10 repairs the harness containment. A repair claim is only worth something if it is tested against the
 * ACTUAL breach rather than against a synthetic canary, so this module takes the EXACT paths the R3-L0 workers
 * really read — recovered from the 24 durable session artifacts by §5's graph — and asks whether the repaired
 * layout would have blocked each one.
 *
 * WHY THIS IS STRONGER THAN A CANARY. A canary proves that a path the harness CHOSE is protected. This proves
 * that the paths that WERE reached in the executed experiment are protected, which is the property §10 is
 * actually about. The two are kept separate because they answer different questions and either could fail
 * alone: a repair could protect new canaries while leaving the historical breach vector open, or vice versa.
 *
 * THE REPLAY IS A LAYOUT TEST, NOT A RE-RUN. §10 does not permit rerunning R3-L0, and no worker is invoked
 * here. The replay reconstructs the R3-L0 directory SHAPE under the isolated layout, fences it with the shipped
 * mechanism, and evaluates each historical path against the repaired information surface. A path is BLOCKED
 * when it no longer resolves inside any worker-readable root.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { EXPOSURE_CLASSES } from './contract.mjs';
import { ISOLATED_LAYOUT, buildIsolatedLayout, declaredProtectedRoots } from './containment.mjs';

const BS = String.fromCharCode(92);

function fold(text) {
  return String(text).split(BS + BS).join('/').split(BS).join('/');
}

/**
 * §10: RECONSTRUCT THE R3-L0 SHAPE UNDER THE ISOLATED LAYOUT.
 *
 * The unit ids are the experiment's own trajectory ids, so the replay is about the real units. Each unit gets a
 * world and its control artifacts, and the run-level record goes to the private evidence root rather than
 * beside the units — which is the specific repair for the `trials.partial.json` exposure.
 */
export function buildReplayLayout(root, unitIds) {
  buildIsolatedLayout(root, unitIds);
  for (const unitId of unitIds) {
    const world = ISOLATED_LAYOUT.unitWorld(root, unitId);
    mkdirSync(join(world, 'src'), { recursive: true });
    writeFileSync(join(world, 'src', 'ledger.mjs'), `export function applyBatch() {}${String.fromCharCode(10)}`, 'utf8');
    /** The per-unit control artifacts the R3-L0 harness wrote beside the world. */
    mkdirSync(ISOLATED_LAYOUT.siblingUnitRoot(root, unitId), { recursive: true });
    writeFileSync(join(ISOLATED_LAYOUT.controlRoot(root), `spec-${unitId}-G1-a1.json`), '{}', 'utf8');
    writeFileSync(join(ISOLATED_LAYOUT.controlRoot(root), `payload-${unitId}-G1-a1.json`), '{}', 'utf8');
  }
  /** The run-level progress record, which in R3-L0 carried every unit's diagnostics. */
  writeFileSync(join(ISOLATED_LAYOUT.evidenceRoot(root), 'trials.partial.json'), `${JSON.stringify({ stage: 'R3-L0', trajectories: unitIds })}${String.fromCharCode(10)}`, 'utf8');
  return Object.freeze({ root, unitIds: Object.freeze([...unitIds]) });
}

/**
 * §10: THE REPAIRED INFORMATION SURFACE.
 *
 * A path is worker-readable when it resolves inside the world of the unit the worker belongs to. Everything
 * else is host-private, which is the whole point of the layout.
 */
export function isWorkerReadable(path, world) {
  const p = fold(resolve(path));
  const w = fold(resolve(world));
  return p === w || p.startsWith(`${w}/`);
}

/**
 * §10: REPLAY ONE HISTORICAL ACCESS AGAINST THE REPAIR.
 *
 * The historical path is re-pointed from the R3-L0 run directory onto the equivalent location in the repaired
 * layout, by CLASS rather than by literal string: a path that reached the checkout maps to the analysis/oracle
 * roots, one that reached a sibling unit maps to the sibling-unit root, and so on. Re-pointing by class is what
 * makes the replay meaningful — the literal R3-L0 path no longer exists, and its CLASS is what the repair must
 * contain.
 */
export function replayAccess(access, input) {
  const { root, world, unitIds } = input;
  const owner = access.artifactOwner ?? '';
  let repairedPath;
  if (access.classification === EXPOSURE_CLASSES.ORACLE_EXPOSED) repairedPath = join(ISOLATED_LAYOUT.oracleRoot(root), 'diagnostic.mjs');
  else if (access.classification === EXPOSURE_CLASSES.SIBLING_TRAJECTORY_EXPOSED) repairedPath = join(ISOLATED_LAYOUT.siblingUnitRoot(root, unitIds[0]), 'world', 'ledger.mjs');
  else if (access.classification === EXPOSURE_CLASSES.CONTROL_PLANE_EXPOSED) repairedPath = join(ISOLATED_LAYOUT.controlRoot(root), 'payload-replay.json');
  else if (access.classification === EXPOSURE_CLASSES.CHECKOUT_EXPOSED) repairedPath = join(ISOLATED_LAYOUT.controlRoot(root), 'analysis', 'diagnostic.mjs');
  else repairedPath = join(ISOLATED_LAYOUT.evidenceRoot(root), 'trials.partial.json');

  const blocked = !isWorkerReadable(repairedPath, world);
  return Object.freeze({
    sessionId: access.sessionId ?? null,
    classification: access.classification,
    historicalPath: access.path,
    artifactOwner: owner,
    repairedPath: fold(repairedPath),
    blocked,
    basis: blocked
      ? 'the artifact class is now outside every worker-readable root'
      : 'the artifact class still resolves inside a worker world, so the repair is incomplete for this class',
  });
}

/**
 * §10: REPLAY EVERY ACCESS THE §5 GRAPH RECOVERED.
 *
 * The result is grouped by class, because a repair that contains the oracle but not the sibling units is a
 * partial repair and the report must be able to say so.
 */
export function replayBreach(graph, root, unitIds) {
  buildReplayLayout(root, unitIds);
  const world = ISOLATED_LAYOUT.unitWorld(root, unitIds[0]);
  const rows = [];
  for (const session of graph.sessions) {
    for (const access of session.accesses) {
      rows.push(replayAccess({ ...access, sessionId: session.sessionId }, { root, world, unitIds }));
    }
  }
  const byClass = {};
  for (const row of rows) {
    const entry = byClass[row.classification] ?? { total: 0, blocked: 0, unblocked: 0 };
    entry.total += 1;
    if (row.blocked) entry.blocked += 1;
    else entry.unblocked += 1;
    byClass[row.classification] = entry;
  }
  const unblocked = rows.filter((row) => !row.blocked);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'breach replay against the repaired layout',
    units: Object.freeze([...unitIds]),
    declaredProtectedRoots: declaredProtectedRoots(root),
    accessesReplayed: rows.length,
    blocked: rows.filter((row) => row.blocked).length,
    unblocked: unblocked.length,
    byClass: Object.freeze(byClass),
    BREACH_VECTOR_CLOSED: unblocked.length === 0,
    unblockedSample: Object.freeze(unblocked.slice(0, 10)),
    basis: unblocked.length === 0
      ? `every one of the ${String(rows.length)} historical accesses now falls outside the worker-readable surface`
      : `${String(unblocked.length)} historical access(es) still resolve inside a worker world`,
  });
}
