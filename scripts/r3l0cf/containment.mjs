/**
 * R3-L0C-F §11 — THE TOPOLOGY-DERIVED CONTAINMENT GATE.
 *
 * §11 requires the containment topology to be DERIVED from the frozen schedule and requires each per-unit
 * property to be proven: the unit's own World reachable, every sibling World inaccessible, sibling and own
 * durable state protected, oracle/reference inaccessible, control/evidence/runner artifacts inaccessible,
 * liveness canaries succeed, and the protected roots actually exist.
 *
 * IT REUSES R3-L0B's AND R3-L0C-R's REPAIRS RATHER THAN RE-DERIVING THEM, which §11 asks for explicitly. The
 * layout is `ISOLATED_LAYOUT`, the manifest is `buildTopologyManifest`, the canaries are `runCanarySuite`, and
 * the liveness control is `canaryLivenessControl`. A second containment implementation would be a second thing
 * to keep in step, and the one that drifted would be the one nobody measured.
 *
 * TWO SHORTCUTS §11 FORBIDS, AND HOW THIS MODULE AVOIDS THEM:
 *
 *   · "Do not treat a canary in a different directory layout as proof for the actual matrix topology." So the
 *     topology is built from the ACTUAL schedule's unit ids — the four trajectories the 16-session matrix will
 *     run — and the canaries are run against THAT root, not a synthetic two-unit fixture.
 *   · "No distributed-security claim." So the profile facts are recorded as they are, and the single-active
 *     confidential profile is asserted UNCHANGED rather than strengthened.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { CONTAINMENT_LAW, CONTAINMENT_REQUIREMENTS, REPO_ROOT } from './contract.mjs';
import { buildTopologyManifest, canaryPlan, manifestPathsExist } from '../r3l0cr/topology.mjs';
import { ISOLATED_LAYOUT } from '../r3l0b/containment.mjs';
import { runCanarySuite } from '../r3l0b/canaries.mjs';
import { canaryLivenessControl } from '../r3l0b/mutations.mjs';
import { prepareRunLayout } from '../r3l0c/trajectory.mjs';

const NL = String.fromCharCode(10);

/**
 * §11: THE UNIT IDS FOR THE ACTUAL MATRIX.
 *
 * Derived from the frozen schedule's trajectory ids, so the topology covers exactly the units the 16-session
 * matrix will run. A hand-written list would be complete for the schedule it was written against and silently
 * incomplete for any other.
 */
export async function scheduleUnitIds() {
  const plan = await import('../r3l0c/plan.mjs');
  return Object.freeze([...new Set(plan.schedule().map((session) => session.trajectoryId))].sort());
}

/**
 * §11: RUN THE CONTAINMENT GATE OVER THE ACTUAL MATRIX TOPOLOGY.
 *
 * The root is a fresh isolated layout for the schedule's unit ids. The canaries run against it with the shipped
 * fence, and the liveness control runs the same probe with NO fence so an UNREACHABLE result is a measurement
 * rather than an empty probe.
 */
export async function runMatrixContainmentGate(input) {
  const { runRoot } = input;
  const unitIds = input.unitIds ?? await scheduleUnitIds();
  const root = join(runRoot, 'containment');
  prepareRunLayout(root, unitIds);
  /**
   * §11: the RUNNER/ANALYSIS root is created here, and that is a requirement rather than tidiness.
   *
   * `HOST_PRIVATE_KINDS` derives a `RUNNER_ANALYSIS` root at `<root>/preflight`, and `manifestPathsExist`
   * reports a root that does not exist as a GAP rather than a pass — because "a protected root that does not
   * exist cannot be probed, so its absence is a gap rather than a pass". Measured: without this, the gate
   * reported 8 missing roots and correctly refused to call the topology proven.
   */
  mkdirSync(join(root, 'preflight'), { recursive: true });
  const topology = buildTopologyManifest({ runRoot: root, units: unitIds });
  const existence = manifestPathsExist(topology);
  const suite = await runCanarySuite({ root, unitIds });
  const liveness = await canaryLivenessControl({ root: join(runRoot, 'containment-liveness'), unitIds });
  const plan = canaryPlan(topology);

  /** §11: the per-unit properties, each measured rather than asserted. */
  const perUnit = topology.perUnit.map((unit) => {
    const ownWorldReachable = existsSync(unit.workerReadable[0]);
    const siblingWorldsInaccessible = unit.siblingWorlds.every((sibling) => {
      const reachable = (suite.probes ?? []).some((probe) => probe.rootId === 'SIBLING_TRAJECTORY' && probe.verdict === 'REACHABLE');
      return !reachable;
    });
    const ownStateProtected = (suite.probes ?? []).every((probe) => !(probe.rootId === 'PRIMARY_EVIDENCE' && probe.verdict === 'REACHABLE'));
    const oracleInaccessible = (suite.probes ?? []).every((probe) => !(probe.rootId === 'DIAGNOSTIC_ORACLE' && probe.verdict === 'REACHABLE'));
    const referenceInaccessible = (suite.probes ?? []).every((probe) => !(probe.rootId === 'REFERENCE_SOLUTION' && probe.verdict === 'REACHABLE'));
    const controlInaccessible = (suite.probes ?? []).every((probe) => !(probe.rootId === 'CONTROL_PLANE' && probe.verdict === 'REACHABLE'));
    return Object.freeze({
      unitId: unit.unitId,
      ownWorld: unit.workerReadable[0],
      ownWorldReachable,
      siblingWorldsInaccessible,
      ownStateProtected,
      oracleInaccessible,
      referenceInaccessible,
      controlInaccessible,
      /** §11: every root the unit must not read, with the count, so a missing root is visible. */
      protectedRootCount: unit.protectedRoots.length,
    });
  });

  const reachable = (suite.probes ?? []).filter((probe) => probe.verdict === 'REACHABLE');
  const allPropertiesHold = perUnit.every((unit) => unit.ownWorldReachable
    && unit.siblingWorldsInaccessible
    && unit.ownStateProtected
    && unit.oracleInaccessible
    && unit.referenceInaccessible
    && unit.controlInaccessible)
    && existence.allExist
    && reachable.length === 0
    && liveness.LIVE === true;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'topology-derived matrix containment gate',
    runRoot: root,
    unitIds: topology.unitIds,
    unitCount: topology.unitIds.length,
    topologyDigest: topology.topologyDigest,
    /** §11: the derivation rule, carried so a reader sees the manifest is derived and not listed. */
    derivedFromSchedule: topology.derivedFromSchedule,
    manuallyEnumerated: topology.manuallyEnumerated,
    /** §11: the roots exist, so a canary cannot pass by absence. */
    protectedRootsExist: existence.allExist,
    missingRoots: existence.missing,
    perUnit: Object.freeze(perUnit),
    canaryPlanUnits: plan.length,
    probes: (suite.probes ?? []).length,
    reachable: Object.freeze(reachable.map((probe) => `${probe.rootId}/${probe.attemptId}`)),
    livenessLive: liveness.LIVE,
    livenessDirectReads: `${String(liveness.directReadsReachable)}/${String(liveness.directReads)}`,
    fence: suite.fence,
    sandbox: suite.sandbox,
    /** §11: the supported profile is unchanged, asserted rather than strengthened. */
    confidentialProfileUnchanged: CONTAINMENT_LAW.confidentialProfileUnchanged,
    confidentialMaxActiveWorkers: CONTAINMENT_LAW.confidentialMaxActiveWorkers,
    distributedSecurityClaim: false,
    /** §11: the requirements, each mapped to its measurement. */
    requirements: CONTAINMENT_REQUIREMENTS,
    EXPERIMENT_CONTAINMENT: allPropertiesHold ? 'PASS' : 'FAIL',
    law: 'the topology is derived from the frozen schedule, and a canary in a different layout is not proof for the actual matrix topology',
  });
}

export { CONTAINMENT_REQUIREMENTS, ISOLATED_LAYOUT, REPO_ROOT, NL };
