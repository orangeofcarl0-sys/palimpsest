/**
 * R3-L0C-R §8 — THE TOPOLOGY-DERIVED EXPERIMENT CONTAINMENT.
 *
 * §8 says: do not manually enumerate sibling roots. The manifest must be DERIVED from the actual schedule and
 * layout, so a unit that the schedule adds is protected because it is IN the schedule rather than because
 * somebody remembered to list it.
 *
 * WHY DERIVATION IS THE REQUIREMENT AND NOT A CONVENIENCE. R3-L0C declared its sibling worlds by hand, and the
 * declaration was correct only because a human read the schedule and wrote the right loop. A hand-written list
 * has the failure mode of being complete for the schedule it was written against and silently incomplete for any
 * other — and the failure is invisible, because an undeclared sibling is simply readable.
 *
 * THE DERIVATION RULE, stated once:
 *
 *   for every unit Ui:  worker-readable = Ui's own world
 *                       protected       = every Uj world (j != i)
 *                                       ∪ oracle ∪ control ∪ evidence ∪ reference ∪ runner ∪ analysis
 *                                       ∪ Ui's own durable state
 *
 * Ui's own state is included because the isolated layout puts it BESIDE the world rather than inside it, so the
 * shipped derivation (which protects `<repository>/.palimpsest`) does not reach it.
 *
 * The manifest is a VALUE with a digest, so the plan can bind it (§9) and the canaries can be run against the
 * ACTUAL topology rather than a canary topology.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ISOLATED_LAYOUT } from '../r3l0b/containment.mjs';

const NL = String.fromCharCode(10);

/**
 * §8: THE HOST-PRIVATE ROOT KINDS, derived per unit.
 *
 * Each entry names a KIND and how its path is derived. The derivation is code rather than a list, which is what
 * makes a new unit automatically covered.
 */
export const HOST_PRIVATE_KINDS = Object.freeze([
  Object.freeze({ id: 'DIAGNOSTIC_ORACLE', derive: (root) => ISOLATED_LAYOUT.oracleRoot(root) }),
  Object.freeze({ id: 'CONTROL_PLANE', derive: (root) => ISOLATED_LAYOUT.controlRoot(root) }),
  Object.freeze({ id: 'PRIMARY_EVIDENCE', derive: (root) => ISOLATED_LAYOUT.evidenceRoot(root) }),
  Object.freeze({ id: 'REFERENCE_SOLUTION', derive: (root) => ISOLATED_LAYOUT.referenceRoot(root) }),
  Object.freeze({ id: 'SIBLING_UNIT_ROOT', derive: (root) => join(ISOLATED_LAYOUT.privateRoot(root), 'units') }),
  Object.freeze({ id: 'RUNNER_ANALYSIS', derive: (root) => join(root, 'preflight') }),
]);

/**
 * §8: BUILD THE TOPOLOGY MANIFEST FROM THE ACTUAL SCHEDULE.
 *
 * `units` is the set of unit ids the schedule will run. Everything else is derived, so the manifest cannot
 * disagree with the schedule.
 */
export function buildTopologyManifest(input) {
  const { runRoot, units } = input;
  const unitIds = Object.freeze([...new Set(units)].sort());
  const hostPrivate = HOST_PRIVATE_KINDS.map((kind) => Object.freeze({ id: kind.id, path: kind.derive(runRoot) }));

  const perUnit = unitIds.map((unitId) => {
    const ownWorld = ISOLATED_LAYOUT.unitWorld(runRoot, unitId);
    /** §8: every OTHER unit's world, derived rather than listed. */
    const siblingWorlds = unitIds.filter((other) => other !== unitId).map((other) => Object.freeze({ unitId: other, path: ISOLATED_LAYOUT.unitWorld(runRoot, other) }));
    return Object.freeze({
      unitId,
      workerReadable: Object.freeze([ownWorld]),
      /** §8: the unit's OWN durable state, which sits beside the world and must be protected. */
      ownStateProtected: ISOLATED_LAYOUT.unitState(runRoot, unitId),
      siblingWorlds: Object.freeze(siblingWorlds),
      protectedRoots: Object.freeze([
        ...siblingWorlds.map((entry) => entry.path),
        ...hostPrivate.map((entry) => entry.path),
        ISOLATED_LAYOUT.unitState(runRoot, unitId),
      ]),
      /** §8: the units root itself is NOT protected, because it is an ancestor of the worker's own world. */
      unitsRootExcluded: join(runRoot, 'units'),
    });
  });

  const manifest = Object.freeze({
    schemaVersion: 1,
    kind: 'ExperimentTopologyManifest',
    runRoot,
    unitIds,
    hostPrivate,
    perUnit: Object.freeze(perUnit),
    /** §8: the derivation rule, carried so the manifest explains itself. */
    derivationRule: 'for every unit Ui: worker-readable = Ui world; protected = every Uj world (j!=i) + oracle + control + evidence + reference + sibling-unit root + runner/analysis + Ui own state',
    unitsRootNeverProtected: 'the units root is an ancestor of every world, so labelling it kills the worker',
    derivedFromSchedule: true,
    manuallyEnumerated: false,
  });
  return Object.freeze({ ...manifest, topologyDigest: topologyDigest(manifest) });
}

/** §8: the digest of the topology, so the plan can bind it. */
export function topologyDigest(manifest) {
  const material = [
    manifest.unitIds.join(','),
    ...manifest.hostPrivate.map((entry) => `${entry.id}:${entry.path}`),
    ...manifest.perUnit.map((entry) => `${entry.unitId}|${entry.workerReadable.join(',')}|${entry.protectedRoots.join(',')}`),
  ].join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * §8: THE PAIRWISE CANARY PLAN.
 *
 * §8 requires canaries against the ACTUAL topology: for each unit, a probe that attempts to read every forbidden
 * root. The plan is derived from the manifest, so it covers exactly the units the schedule has.
 */
export function canaryPlan(manifest) {
  return Object.freeze(manifest.perUnit.map((unit) => Object.freeze({
    unitId: unit.unitId,
    ownWorld: unit.workerReadable[0],
    forbidden: Object.freeze([
      ...unit.siblingWorlds.map((entry) => Object.freeze({ kind: 'SIBLING_WORLD', unitId: entry.unitId, path: entry.path })),
      ...manifest.hostPrivate.map((entry) => Object.freeze({ kind: entry.id, path: entry.path })),
      Object.freeze({ kind: 'OWN_STATE', path: unit.ownStateProtected }),
    ]),
  })));
}

/** §8: whether every derived protected root actually exists, so a canary cannot pass by absence. */
export function manifestPathsExist(manifest) {
  const missing = [];
  for (const unit of manifest.perUnit) {
    for (const path of unit.protectedRoots) {
      if (!existsSync(path)) missing.push(`${unit.unitId}:${path}`);
    }
  }
  return Object.freeze({
    allExist: missing.length === 0,
    missing: Object.freeze(missing),
    note: 'a protected root that does not exist cannot be probed, so its absence is a gap rather than a pass',
  });
}

export { NL };
