/**
 * R3-L0B §12/§13 — THE CONTAINMENT MUTATIONS AND THEIR POSITIVE CONTROLS.
 *
 * §12 and §13 each require THREE things, and the third is the one that is usually skipped:
 *
 *   the defect is reintroduced deliberately;
 *   the corresponding gate MUST fail;
 *   the corrected layout MUST then pass.
 *
 * A gate that fails with the defect present proves nothing unless it also passes without it — otherwise a gate
 * that always fails would look like the strongest possible check. And a gate that passes without the defect
 * proves nothing unless it also fails with it — otherwise a gate that always passes would look like a repair.
 * Both halves are therefore recorded, and the recorded verdict is `MUTATION_ESCAPED` unless BOTH hold.
 *
 * §12 also carries a second, independent control that is not the mutation: THE CANARY-LIVENESS CONTROL. The
 * containment gate decides from canary probes, so if the probes themselves could never report REACHABLE the
 * gate would be vacuous. The liveness control runs the SAME probe with the fence deliberately absent and
 * REQUIRES it to report REACHABLE — which is what makes the UNREACHABLE result meaningful rather than empty.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTAINMENT_MUTATIONS } from './contract.mjs';
import {
  ISOLATED_LAYOUT,
  buildIsolatedLayout,
  buildSharedParentLayout,
  mutationVerdict,
  runContainmentGate,
  runOutcomeBlindnessGate,
  writeCanaries,
} from './containment.mjs';
import { canaryTargets, nonApplicableSubstitutes, probeSource, relativeFrom, resolveSandbox, runConfined } from './canaries.mjs';

const NL = String.fromCharCode(10);

/**
 * §11/§12: RUN THE CANARY PROBES AGAINST AN ARBITRARY TARGET SET.
 *
 * Extracted from the suite so the mutations can drive the SAME probe machinery against a mutated layout without
 * a second implementation. `applyFence` is what the liveness control turns off.
 */
export async function probeTargets(input) {
  const { root, world, targets, applyFence } = input;
  const sandbox = resolveSandbox();
  const probePath = join(root, `probe-${applyFence === false ? 'unfenced' : 'fenced'}.mjs`);
  const text = probeSource(targets, world).replace('__NON_APPLICABLE_SUBSTITUTES__', nonApplicableSubstitutes(targets));
  writeFileSync(probePath, text, 'utf8');

  let fence = Object.freeze({ applied: false, rootsVerified: false, treesVerified: false, supported: true, roots: 0, fencedRoots: Object.freeze([]), detail: 'the fence was deliberately not applied' });
  if (applyFence !== false) {
    process.env.PALIMPSEST_DSH_ROOT = sandbox.root;
    try {
      const { pathToFileURL } = await import('node:url');
      const RUNTIME = join(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1'), 'host', 'deployment', 'runtime');
      const fenceModule = await import(pathToFileURL(join(RUNTIME, 'read_fence.js')).href);
      const roots = [...new Set(Object.values(targets).map((entry) => entry.dir))];
      const applied = fenceModule.ensureReadFence({ roots, world });
      fence = Object.freeze({
        applied: applied.rootsVerified === true && applied.treesVerified === true,
        rootsVerified: applied.rootsVerified === true,
        treesVerified: applied.treesVerified === true,
        supported: applied.result?.supported === true,
        roots: roots.length,
        fencedRoots: Object.freeze(roots),
        detail: applied.result?.supported === true ? null : String(applied.result?.error ?? 'the kernel label layer is unsupported on this host'),
      });
    } catch (error) {
      fence = Object.freeze({ applied: false, rootsVerified: false, treesVerified: false, supported: false, roots: 0, fencedRoots: Object.freeze([]), detail: String(error?.message ?? error).slice(0, 200) });
    }
  }

  const report = runConfined({ sandbox, world, probePath, root });
  const observations = report.observations ?? {};
  const probes = [];
  for (const [rootId, target] of Object.entries(targets)) {
    for (const attemptId of ATTEMPT_IDS) {
      const observed = observations[`${rootId}/${attemptId}`];
      probes.push(Object.freeze({ rootId, attemptId, verdict: observed === undefined ? 'NOT_APPLICABLE' : observed.verdict === 'REACHABLE' ? 'REACHABLE' : 'UNREACHABLE', detail: observed ?? null }));
    }
  }
  return Object.freeze({ probeRan: report.ran, probeError: report.error ?? null, fence, probes });
}

/** §11: the attempt ids, in the order §11 lists them. */
export const ATTEMPT_IDS = Object.freeze(['PARENT_TRAVERSAL', 'ABSOLUTE_PATH_READ', 'DIRECTORY_ENUMERATION', 'GLOB_SEARCH', 'NODE_SUBPROCESS', 'POWERSHELL', 'SIBLING_WORLD_LOOKUP', 'ORACLE_IMPORT_EXECUTE']);

/**
 * §11: THE CANARY-LIVENESS CONTROL.
 *
 * The same probe, the same canary files, the fence deliberately absent. Every attempt that should be able to
 * read MUST report REACHABLE, or the containment gate is measuring an empty probe rather than a boundary.
 */
export async function canaryLivenessControl(input) {
  const { root, unitIds } = input;
  /**
   * The layout is built HERE rather than assumed: the control's whole point is that it runs the SAME probe
   * against the SAME canary files as the real suite, and a missing world would make every attempt fail for a
   * reason that has nothing to do with the fence.
   */
  buildIsolatedLayout(root, unitIds);
  const world = ISOLATED_LAYOUT.unitWorld(root, unitIds[0]);
  const { nonces } = writeCanaries(root, unitIds);
  const targets = canaryTargets(root, unitIds);
  for (const [rootId, target] of Object.entries(targets)) target.nonce = nonces[rootId] ?? nonces.DIAGNOSTIC_ORACLE;

  const result = await probeTargets({ root, world, targets, applyFence: false });
  const reachable = result.probes.filter((probe) => probe.verdict === 'REACHABLE');
  /**
   * The control is satisfied when the reads that CAN succeed unfenced DO succeed. `PARENT_TRAVERSAL` and
   * `ABSOLUTE_PATH_READ` are the two direct reads, and they are the ones a boundary must block; if they are
   * not reachable with no fence at all, the probe is broken rather than the layout being safe.
   */
  const direct = result.probes.filter((probe) => probe.attemptId === 'PARENT_TRAVERSAL' || probe.attemptId === 'ABSOLUTE_PATH_READ');
  const directReachable = direct.filter((probe) => probe.verdict === 'REACHABLE').length;
  return Object.freeze({
    kind: 'canary liveness control',
    fenceApplied: false,
    probeRan: result.probeRan,
    probeError: result.probeError,
    reachable: reachable.length,
    reachableCells: Object.freeze(reachable.map((probe) => `${probe.rootId}/${probe.attemptId}`)),
    directReadsReachable: directReachable,
    directReads: direct.length,
    LIVE: directReachable > 0,
    basis: directReachable > 0
      ? 'with no fence, the direct reads returned the canary nonce, so an UNREACHABLE result under the fence is a measurement rather than an empty probe'
      : 'with no fence the direct reads STILL failed, so the probe cannot discriminate and the containment gate would be vacuous',
  });
}

/**
 * §12: THE SHARED-PARENT MUTATION.
 *
 * Restores the R3-L0 layout: every unit under one shared parent, each holding its repository AND its
 * host-private control files beside it, with the harness progress record at the shared parent level. The
 * containment gate must fail, and the isolated layout must pass.
 */
export async function sharedParentMutation(input) {
  const { mutatedRoot, positiveRoot, unitIds } = input;
  const mutation = CONTAINMENT_MUTATIONS.find((entry) => entry.id === 'SHARED_PARENT_MUTATION');

  /** The mutation: the R3-L0 shape. The control payload becomes a SIBLING of every unit's repository. */
  buildSharedParentLayout(mutatedRoot, unitIds);
  const mutatedWorld = join(mutatedRoot, unitIds[0], 'repo');
  mkdirSync(mutatedWorld, { recursive: true });
  const controlNonce = 'CANARY-CONTROL-MUTATION';
  writeFileSync(join(mutatedRoot, unitIds[0], 'payload-spec.json'), `${JSON.stringify({ compiledHandleCount: 0, canary: controlNonce })}${NL}`, 'utf8');
  const mutatedTargets = {
    CONTROL_PLANE: { path: join(mutatedRoot, unitIds[0], 'payload-spec.json'), dir: join(mutatedRoot, unitIds[0]), nonce: controlNonce, relativeFromWorld: relativeFrom(mutatedWorld, join(mutatedRoot, unitIds[0], 'payload-spec.json')) },
  };
  const mutatedProbe = await probeTargets({ root: mutatedRoot, world: mutatedWorld, targets: mutatedTargets, applyFence: false });
  /**
   * The mutated gate deliberately runs WITHOUT the fence, because that is the R3-L0 condition: the harness
   * never declared its roots, so nothing was labelled. A gate that only failed because of a fence would not be
   * testing the layout at all.
   */
  const mutatedGate = runContainmentGate({
    root: mutatedRoot,
    unitIds,
    probes: mutatedProbe.probes.map((probe) => ({ rootId: probe.rootId, attemptId: probe.attemptId, verdict: probe.verdict })),
  });
  /** The layout check, independent of the fence: in the shared-parent shape a control file is a world sibling. */
  const mutatedLayoutDetected = layoutSharesParent(mutatedRoot, unitIds);

  /** The positive control: the corrected isolated layout, with the same declaration of a control payload. */
  buildIsolatedLayout(positiveRoot, unitIds);
  const positiveWorld = ISOLATED_LAYOUT.unitWorld(positiveRoot, unitIds[0]);
  const positiveTargets = { CONTROL_PLANE: { path: join(ISOLATED_LAYOUT.controlRoot(positiveRoot), 'payload.json'), dir: ISOLATED_LAYOUT.controlRoot(positiveRoot), nonce: 'CANARY-CONTROL-POSITIVE', relativeFromWorld: relativeFrom(positiveWorld, join(ISOLATED_LAYOUT.controlRoot(positiveRoot), 'payload.json')) } };
  writeFileSync(join(ISOLATED_LAYOUT.controlRoot(positiveRoot), 'payload.json'), `${JSON.stringify({ compiledHandleCount: 0, canary: positiveTargets.CONTROL_PLANE.nonce })}${NL}`, 'utf8');
  const positiveProbe = await probeTargets({ root: positiveRoot, world: positiveWorld, targets: positiveTargets, applyFence: true });
  const positiveGate = runContainmentGate({ root: positiveRoot, unitIds, probes: positiveProbe.probes });

  const verdict = mutationVerdict({
    id: mutation.id,
    gateName: 'CONTAINMENT',
    mutatedVerdict: mutatedLayoutDetected || mutatedGate.CONTAINMENT === 'FAIL' ? 'FAIL' : 'PASS',
    positiveVerdict: positiveGate.CONTAINMENT === 'PASS' && !layoutSharesParent(positiveRoot, unitIds) ? 'PASS' : 'FAIL',
    recordedVerdict: mutation.recordedVerdict,
  });
  return Object.freeze({
    ...verdict,
    restores: mutation.restores,
    mutatedLayoutSharesParent: mutatedLayoutDetected,
    mutatedGate,
    positiveGate,
    mutatedProbeRan: mutatedProbe.probeRan,
    positiveProbeRan: positiveProbe.probeRan,
  });
}

/**
 * §12: WHETHER A LAYOUT PUTS A HOST-PRIVATE CONTROL FILE BESIDE A UNIT REPOSITORY.
 *
 * This is the structural form of the R3-L0 defect and it is checked directly, so the mutation is detected even
 * on a host where the canary probes cannot run. A gate that depended only on a probe would be silent on such a
 * host, and §12 requires the mutation to be DETECTED.
 */
export function layoutSharesParent(root, unitIds) {
  for (const unitId of unitIds) {
    const unitDir = join(root, unitId);
    if (!existsSync(unitDir)) continue;
    const entries = readdirSync(unitDir);
    const hasRepo = entries.includes('repo');
    const hasControl = entries.some((entry) => entry.startsWith('payload-') || entry.startsWith('spec-') || entry.startsWith('transcript-') || entry === 'diagnostic');
    if (hasRepo && hasControl) return true;
  }
  /** The shared progress record at the shared parent level is the other half of the defect. */
  return existsSync(join(root, 'trials.partial.json'));
}

/**
 * §13: THE ORACLE-EXPOSURE MUTATION.
 *
 * Deliberately places a diagnostic oracle BENEATH the worker-readable root. The outcome-blindness gate must
 * fail, and the corrected layout, with the oracle outside and protected, must pass.
 */
export async function oracleExposureMutation(input) {
  const { mutatedRoot, positiveRoot, unitIds } = input;
  const mutation = CONTAINMENT_MUTATIONS.find((entry) => entry.id === 'ORACLE_EXPOSURE_MUTATION');

  /** The mutation: the oracle sits INSIDE the world, exactly where a worker would find it. */
  buildIsolatedLayout(mutatedRoot, unitIds);
  const mutatedWorld = ISOLATED_LAYOUT.unitWorld(mutatedRoot, unitIds[0]);
  const exposedOracleDir = join(mutatedWorld, 'diagnostic');
  mkdirSync(exposedOracleDir, { recursive: true });
  const exposedNonce = 'CANARY-ORACLE-EXPOSED';
  writeFileSync(join(exposedOracleDir, 'diagnostic.mjs'), `// ${exposedNonce}${NL}export function diagnosticVector() { return { classPass: {} }; }${NL}`, 'utf8');
  /** The oracle root the gate inspects is the world-local one in the mutated shape. */
  const mutatedProbe = await probeTargets({
    root: mutatedRoot,
    world: mutatedWorld,
    targets: { DIAGNOSTIC_ORACLE: { path: join(exposedOracleDir, 'diagnostic.mjs'), dir: exposedOracleDir, nonce: exposedNonce, relativeFromWorld: 'diagnostic/diagnostic.mjs' } },
    applyFence: false,
  });
  const mutatedGate = runOutcomeBlindnessGate({
    root: mutatedRoot,
    unitIds,
    probes: mutatedProbe.probes,
    oracleRootOverride: exposedOracleDir,
  });
  /** The structural check, so the mutation is detected even where probes cannot run. */
  const mutatedExposed = oracleInsideWorld(mutatedRoot, unitIds, exposedOracleDir);

  /** The positive control: the corrected layout, oracle outside and protected. */
  buildIsolatedLayout(positiveRoot, unitIds);
  const positiveWorld = ISOLATED_LAYOUT.unitWorld(positiveRoot, unitIds[0]);
  const positiveNonce = 'CANARY-ORACLE-POSITIVE';
  mkdirSync(ISOLATED_LAYOUT.oracleRoot(positiveRoot), { recursive: true });
  writeFileSync(join(ISOLATED_LAYOUT.oracleRoot(positiveRoot), 'diagnostic.mjs'), `// ${positiveNonce}${NL}export function diagnosticVector() { return { classPass: {} }; }${NL}`, 'utf8');
  const positiveProbe = await probeTargets({
    root: positiveRoot,
    world: positiveWorld,
    targets: { DIAGNOSTIC_ORACLE: { path: join(ISOLATED_LAYOUT.oracleRoot(positiveRoot), 'diagnostic.mjs'), dir: ISOLATED_LAYOUT.oracleRoot(positiveRoot), nonce: positiveNonce, relativeFromWorld: relativeFrom(positiveWorld, join(ISOLATED_LAYOUT.oracleRoot(positiveRoot), 'diagnostic.mjs')) } },
    applyFence: true,
  });
  const positiveGate = runOutcomeBlindnessGate({ root: positiveRoot, unitIds, probes: positiveProbe.probes });

  const verdict = mutationVerdict({
    id: mutation.id,
    gateName: 'OUTCOME_BLINDNESS',
    mutatedVerdict: mutatedExposed || mutatedGate.OUTCOME_BLINDNESS === 'FAIL' ? 'FAIL' : 'PASS',
    positiveVerdict: positiveGate.OUTCOME_BLINDNESS === 'PASS' && !oracleInsideWorld(positiveRoot, unitIds, ISOLATED_LAYOUT.oracleRoot(positiveRoot)) ? 'PASS' : 'FAIL',
    recordedVerdict: mutation.recordedVerdict,
  });
  return Object.freeze({
    ...verdict,
    restores: mutation.restores,
    mutatedOracleInsideWorld: mutatedExposed,
    mutatedGate,
    positiveGate,
    mutatedProbeRan: mutatedProbe.probeRan,
    positiveProbeRan: positiveProbe.probeRan,
  });
}

/** §13: whether a given oracle root sits inside any worker world. */
export function oracleInsideWorld(root, unitIds, oracleRoot) {
  const fold = (text) => String(text).replace(/\\/gu, '/');
  const oracle = fold(oracleRoot);
  return unitIds.some((unitId) => {
    const world = fold(ISOLATED_LAYOUT.unitWorld(root, unitId));
    return oracle === world || oracle.startsWith(`${world}/`);
  });
}

export { buildIsolatedLayout, buildSharedParentLayout, runContainmentGate, runOutcomeBlindnessGate, writeCanaries, canaryTargets, ISOLATED_LAYOUT };
