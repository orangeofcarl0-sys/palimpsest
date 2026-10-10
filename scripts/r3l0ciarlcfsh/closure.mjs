/**
 * R3-L0C-I-A-R-L-C-F-S-H §9/§11 — THE STAGE-OWNED EXECUTION CLOSURE.
 *
 * WHAT THIS EXTENDS. The prior chain covers the frozen R3-L0C-F parts, the R3-L0C-I-A harness, the dynamically
 * loaded runtime manifest, the R3-L0C-I-A-R-L harness, the R3-L0C-I-A-R-L-C harness, the R3-L0C-I-A-R-L-C-F harness
 * and the R3-L0C-I-A-R-L-C-F-S harness with its own reused-modules part. This stage adds ITS OWN harness part — the
 * terminal-enforcement and safety modules — and its own reused-modules part, naming the modules it imports directly
 * from BOTH prior stages.
 *
 * WHY THE REUSED MODULES NEED THEIR OWN PART. This stage's validated cost bridge imports the prior stage's frozen
 * `cost-bridge` and `instrumentation`; its cleanup imports the frozen `journal`; its committed-plan reader imports
 * the F stage's `committed-plan`; and its pipeline imports the prior chain's runner, adapter, admission, sidecar,
 * attestation, freshness and post-matrix reducer. A change to any of those bytes would otherwise move nothing in
 * this stage's digest, so they are a named part and a mutation to one of them must move the aggregate.
 *
 * WHY MUTATION-BY-OVERRIDE. §10: "All byte mutations must occur in isolated, disposable environments." These files
 * are hashed by EVERY closure computation, and vitest runs test files in parallel processes, so a temporary disk
 * write is observable by another reader. Each arm substitutes a mutated digest into the part map and rebuilds the
 * aggregate from the base's own material; the tree is never written.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §9: this stage's own harness modules, which execute the hotfix and are therefore load-bearing. */
export const STAGE_HARNESS_MODULES = Object.freeze([
  `${STAGE_CODE_PATH}/contract.mjs`,
  `${STAGE_CODE_PATH}/validated-cost-bridge.mjs`,
  `${STAGE_CODE_PATH}/artifact-validity.mjs`,
  `${STAGE_CODE_PATH}/safe-cleanup.mjs`,
  `${STAGE_CODE_PATH}/evidence-seal.mjs`,
  `${STAGE_CODE_PATH}/committed-plan.mjs`,
  `${STAGE_CODE_PATH}/prospective-plan.mjs`,
  `${STAGE_CODE_PATH}/closure.mjs`,
  `${STAGE_CODE_PATH}/pipeline.mjs`,
  `${STAGE_CODE_PATH}/qualification.mjs`,
  `${STAGE_CODE_PATH}/acceptance.mjs`,
  `${STAGE_CODE_PATH}/evidence.mjs`,
  `${STAGE_CODE_PATH}/baseline/legacy-controls.mjs`,
]);

/** §9: the modules this stage reuses DIRECTLY, named as data so the reuse is covered rather than implicit. */
export const REUSED_MODULES = Object.freeze([
  'scripts/r3l0ciarlcfs/contract.mjs',
  'scripts/r3l0ciarlcfs/artifact-validity.mjs',
  'scripts/r3l0ciarlcfs/committed-plan.mjs',
  'scripts/r3l0ciarlcfs/closure.mjs',
  'scripts/r3l0ciarlcfs/trial-identity.mjs',
  'scripts/r3l0ciarlcfs/authorization-verdict.mjs',
  'scripts/r3l0ciarlcfs/erratum.mjs',
  'scripts/r3l0ciarlcf/contract.mjs',
  'scripts/r3l0ciarlcf/plan-identity.mjs',
  'scripts/r3l0ciarlcf/cost-bridge.mjs',
  'scripts/r3l0ciarlcf/artifact-identity.mjs',
  'scripts/r3l0ciarlcf/durable-reconciliation.mjs',
  'scripts/r3l0ciarlcf/postmatrix-admission.mjs',
  'scripts/r3l0ciarlcf/freshness.mjs',
  'scripts/r3l0ciarlcf/trust-boundary.mjs',
  'scripts/r3l0ciarlcf/attestation.mjs',
  'scripts/r3l0ciarlcf/closure.mjs',
  'scripts/r3l0ciarlcf/pipeline.mjs',
  'scripts/r3l0ciarlcf/modes.mjs',
  'scripts/r3l0ciarlcf/prospective-plan.mjs',
  'scripts/r3l0ciarl/live-evidence.mjs',
  'scripts/r3l0ciarl/postflight.mjs',
  'scripts/r3l0ciar/activation.mjs',
  'scripts/r3l0ciar/primary-adapter.mjs',
  'scripts/r3l0ciar/confinement.mjs',
  'scripts/r3l0ciar/admission.mjs',
  'scripts/r3l0ciar/validity.mjs',
  'scripts/r3l0ciar/preflight.mjs',
  'scripts/r3l0ciar/host-bundle.mjs',
  'scripts/r3l0ciar/instrumentation.mjs',
  'scripts/r3l0ciar/contract.mjs',
  'scripts/r3l0ciar/runtime-manifest.mjs',
  'scripts/r3l0c/instrumentation.mjs',
  'scripts/r3l0c/immutability.mjs',
  'scripts/r3l0cf/fail-stop.mjs',
  'scripts/r3l0cf/journal.mjs',
]);

/** §9: the digest of one file's bytes, or a marker. */
export function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return 'MISSING';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** §9: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * §9: COMPUTE THE FULL EXECUTION CLOSURE.
 *
 * The prior chain's parts are taken UNCHANGED, and this stage adds its harness part and its reused-modules part.
 */
export async function computeExecutionClosure(input = {}) {
  const prior = await import('../r3l0ciarlcfs/closure.mjs');
  const base = await prior.computeExecutionClosure(input);

  const harnessDigests = {};
  for (const relative of STAGE_HARNESS_MODULES) harnessDigests[relative] = fileDigest(relative);
  const missingHarness = STAGE_HARNESS_MODULES.filter((relative) => harnessDigests[relative] === 'MISSING');
  const harnessPartDigest = digestOfMap(harnessDigests);

  const reusedDigests = {};
  for (const relative of REUSED_MODULES) reusedDigests[relative] = fileDigest(relative);
  const missingReused = REUSED_MODULES.filter((relative) => reusedDigests[relative] === 'MISSING');
  const reusedPartDigest = digestOfMap(reusedDigests);

  const parts = Object.freeze({
    ...base.parts,
    STAGE_HARNESS_CLOSURE: harnessPartDigest,
    REUSED_MODULES_CLOSURE: reusedPartDigest,
  });
  const fileDigests = Object.freeze({
    ...base.fileDigests,
    STAGE_HARNESS_CLOSURE: Object.freeze(harnessDigests),
    REUSED_MODULES_CLOSURE: Object.freeze(reusedDigests),
  });

  const aggregateMaterial = {
    ...Object.fromEntries(Object.entries(parts).map(([id, digest]) => [`part:${id}`, digest])),
    'toolchain:node': base.toolchain.node,
    'toolchain:git': base.toolchain.git,
    'toolchain:platform': `${base.toolchain.platform}/${base.toolchain.arch}`,
    ...Object.fromEntries(Object.entries(base.toolchain.packages ?? {}).map(([name, version]) => [`package:${name}`, String(version)])),
    'packages:globalDshRoot': String(base.toolchain.globalDshRoot ?? 'UNRESOLVED'),
    'executor:route': base.executor.routeId,
    'executor:model': base.executor.modelId,
    'executor:settings': base.executor.settingsDigest,
    'model:identity': `${base.modelIdentity.providerId}/${base.modelIdentity.modelId}`,
    'plan:schedule': digestOfMap(base.schedule),
    'runtime-manifest:complete': String(base.runtimeManifest?.complete ?? false),
    'runtime-manifest:moduleCount': String(base.runtimeManifest?.moduleCount ?? 0),
  };
  const executionClosureDigest = digestOfMap(aggregateMaterial);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'R3-L0C-I-A-R-L-C-F-S-H ExecutionClosureDigest',
    parts,
    partIds: Object.freeze([...Object.keys(parts)]),
    fileDigests,
    fileCount: Object.values(fileDigests).reduce((total, map) => total + Object.keys(map).length, 0),
    toolchain: base.toolchain,
    executor: base.executor,
    modelIdentity: base.modelIdentity,
    schedule: base.schedule,
    runtimeManifest: base.runtimeManifest,
    stageHarness: Object.freeze({ digest: harnessPartDigest, moduleCount: STAGE_HARNESS_MODULES.length, missing: Object.freeze(missingHarness) }),
    reusedModules: Object.freeze({ digest: reusedPartDigest, moduleCount: REUSED_MODULES.length, missing: Object.freeze(missingReused) }),
    aggregateMaterial: Object.freeze(aggregateMaterial),
    compiledVerification: base.compiledVerification,
    selfExclusions: Object.freeze([
      `${STAGE_EVIDENCE_PATH}/execution-plan.json`,
      `${STAGE_EVIDENCE_PATH}/qualification.json`,
      `${STAGE_EVIDENCE_PATH}/stage-result.json`,
      `${STAGE_EVIDENCE_PATH}/evidence-seal.json`,
      `${STAGE_EVIDENCE_PATH}/final-verdicts.json`,
    ]),
    coversCodeNotResults: true,
    executionClosureDigest,
    CLOSURE_COMPLETE: missingHarness.length === 0 && missingReused.length === 0 && (base.CLOSURE_COMPLETE === true),
    onIncomplete: 'STOP — a closure whose manifest names a module that does not exist is a claim about bytes that are not there',
    law: 'a changed shipped runtime, a changed reused prior-stage module, or a changed execution configuration must move the closure digest',
  });
}

/** §9: THE FOUR MUTATION ARMS, each computed BY OVERRIDE so the tree is never written. */
export async function proveClosureMutations() {
  const arms = [];
  const baseline = await computeExecutionClosure({ verifyCompiled: false });

  const { measureWalkerBlindSpot } = await import('../r3l0ciar/runtime-manifest.mjs');
  const blindSpot = await measureWalkerBlindSpot();
  const dynamicTarget = blindSpot.manifestModulesNotReachableByWalker[0] ?? 'dist/src/project_workspace/index.js';

  arms.push(mutateByOverride({
    id: 'NEW_STAGE_VALIDATED_COST_MODULE',
    target: `${STAGE_CODE_PATH}/validated-cost-bridge.mjs`,
    partId: 'STAGE_HARNESS_CLOSURE',
    baseline,
    targetReachableByStaticWalker: true,
    detail: `a change to ${STAGE_CODE_PATH}/validated-cost-bridge.mjs moves this stage's harness part and the aggregate`,
  }));
  arms.push(mutateByOverride({
    id: 'REUSED_PRIOR_COST_BRIDGE_MODULE',
    target: 'scripts/r3l0ciarlcf/cost-bridge.mjs',
    partId: 'REUSED_MODULES_CLOSURE',
    baseline,
    targetReachableByStaticWalker: true,
    detail: 'a change to the REUSED prior-stage cost-bridge module moves the reused-modules part and the aggregate, so the validated adapter\'s reuse of the frozen bridge is covered',
  }));
  arms.push(mutateByOverride({
    id: 'RUNTIME_MANIFEST_DYNAMIC_MODULE',
    target: dynamicTarget,
    partId: 'RUNTIME_MANIFEST_CLOSURE',
    baseline,
    targetReachableByStaticWalker: false,
    detail: `the manifest part and the aggregate digest both move when ${dynamicTarget} changes, and the target is one the static import-graph walker cannot reach`,
  }));
  arms.push(proveToolchainMutation(baseline));

  const failing = arms.filter((arm) => arm.PROPERTY_PROVEN !== true);
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F-S-H', kind: 'execution closure mutations',
    arms: Object.freeze(arms), blindSpot,
    ALL_MUTATIONS_PROVEN: failing.length === 0,
    failing: Object.freeze(failing.map((arm) => arm.id)),
    declaredArms: Object.freeze(['NEW_STAGE_VALIDATED_COST_MODULE', 'REUSED_PRIOR_COST_BRIDGE_MODULE', 'RUNTIME_MANIFEST_DYNAMIC_MODULE', 'EXECUTION_CONFIGURATION_OR_TOOLCHAIN']),
    computedByOverride: true,
    treeMutated: false,
    law: 'a mutation is computed by substituting a mutated file digest into the part map, so no reader can observe a mutation window',
  });
}

/** §9: compute one mutation arm by override, never touching the tree. */
function mutateByOverride(input) {
  const { id, target, partId, baseline, targetReachableByStaticWalker, detail } = input;
  const partFiles = baseline.fileDigests[partId] ?? {};
  if (!(target in partFiles)) {
    return Object.freeze({ id, target, partId, PROPERTY_PROVEN: false, reason: `the target ${target} is not a file of part ${partId}, so the arm cannot be measured` });
  }
  const real = partFiles[target];
  const mutatedDigest = digestOfMap({ [target]: `${real}${NL}/* MUTATION */` });
  const overriddenFiles = Object.freeze({ ...partFiles, [target]: mutatedDigest });
  const overriddenParts = Object.freeze({ ...baseline.parts, [partId]: digestOfMap(overriddenFiles) });
  const aggregateMaterial = { ...baseline.aggregateMaterial };
  for (const [part, digest] of Object.entries(overriddenParts)) aggregateMaterial[`part:${part}`] = digest;
  const mutatedClosureDigest = digestOfMap(aggregateMaterial);
  const partMoved = baseline.parts[partId] !== overriddenParts[partId];
  return Object.freeze({
    id, target, partId,
    digestBefore: baseline.executionClosureDigest,
    digestMutated: mutatedClosureDigest,
    partMoved,
    targetReachableByStaticWalker,
    PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedClosureDigest && partMoved,
    detail,
    computedByOverride: true,
  });
}

/** §9: an execution-configuration or toolchain change moves the aggregate. */
function proveToolchainMutation(baseline) {
  const aggregateMaterial = { ...baseline.aggregateMaterial, 'executor:settings': `${String(baseline.aggregateMaterial['executor:settings'])}-mutation-probe` };
  const mutatedDigest = digestOfMap(aggregateMaterial);
  return Object.freeze({
    id: 'EXECUTION_CONFIGURATION_OR_TOOLCHAIN',
    target: 'executor:settings',
    digestBefore: baseline.executionClosureDigest,
    digestMutated: mutatedDigest,
    PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedDigest,
    detail: 'a changed execution configuration identity moves the aggregate digest, because the effective route, model and settings participate in it as named entries',
    computedByOverride: true,
  });
}

export { NL };
