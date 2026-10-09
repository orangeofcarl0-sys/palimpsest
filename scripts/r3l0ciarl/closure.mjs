/**
 * R3-L0C-I-A-R-L §4 — THE STAGE-OWNED EXECUTION CLOSURE.
 *
 * WHAT THIS EXTENDS. The prior stage's closure covers the frozen R3-L0C-F parts plus a stage-harness part and the
 * dynamically loaded runtime manifest. This stage adds its OWN harness part — the four gate modules — and, more
 * importantly, binds the PRIOR STAGE'S REUSED MODULES into a part of its own.
 *
 * WHY THE REUSED MODULES NEED THEIR OWN PART. This stage's pipeline imports the prior stage's `activation`,
 * `primary-adapter`, `confinement`, `admission`, `validity`, `preflight`, `closure`, `host-bundle` and
 * `instrumentation` modules DIRECTLY, because the four gates do not live in them and re-exporting them through
 * shims would add ten files that say nothing. That reuse is safe ONLY if the closure covers those bytes — a change
 * to the prior stage's admission gate would otherwise move nothing in this stage's digest, which is precisely the
 * defect the runtime manifest was introduced to close. So they are a named part, and a mutation to one of them
 * must move the aggregate.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §4: this stage's own harness modules, which execute the experiment and are therefore load-bearing. */
export const STAGE_HARNESS_MODULES = Object.freeze([
  `${STAGE_CODE_PATH}/contract.mjs`,
  `${STAGE_CODE_PATH}/modes.mjs`,
  `${STAGE_CODE_PATH}/pipeline.mjs`,
  `${STAGE_CODE_PATH}/live-evidence.mjs`,
  `${STAGE_CODE_PATH}/postflight.mjs`,
  `${STAGE_CODE_PATH}/primary-binding.mjs`,
  `${STAGE_CODE_PATH}/attestation.mjs`,
  `${STAGE_CODE_PATH}/closure.mjs`,
  `${STAGE_CODE_PATH}/qualification.mjs`,
  `${STAGE_CODE_PATH}/prospective-plan.mjs`,
  `${STAGE_CODE_PATH}/regression.mjs`,
  `${STAGE_CODE_PATH}/acceptance.mjs`,
  `${STAGE_CODE_PATH}/baseline/legacy-controls.mjs`,
]);

/**
 * §4: THE PRIOR STAGE'S MODULES THIS STAGE REUSES DIRECTLY.
 *
 * Named as data so the reuse is visible and covered rather than implicit. A change to any of these moves this
 * stage's closure, which is what makes direct reuse safe.
 */
export const REUSED_MODULES = Object.freeze([
  'scripts/r3l0ciar/activation.mjs',
  'scripts/r3l0ciar/primary-adapter.mjs',
  'scripts/r3l0ciar/confinement.mjs',
  'scripts/r3l0ciar/admission.mjs',
  'scripts/r3l0ciar/validity.mjs',
  'scripts/r3l0ciar/preflight.mjs',
  'scripts/r3l0ciar/closure.mjs',
  'scripts/r3l0ciar/host-bundle.mjs',
  'scripts/r3l0ciar/instrumentation.mjs',
  'scripts/r3l0ciar/treatment.mjs',
  'scripts/r3l0ciar/scripted-worker.mjs',
  'scripts/r3l0ciar/contract.mjs',
  'scripts/r3l0ciar/runtime-manifest.mjs',
]);

/** §4: the digest of one file's bytes, or a marker. */
export function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return 'MISSING';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** §4: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * §4: COMPUTE THE FULL EXECUTION CLOSURE.
 *
 * The frozen parts and the prior stage's two extensions are taken UNCHANGED from `scripts/r3l0ciar/closure.mjs`,
 * and this stage adds its harness part and the reused-modules part. The aggregate folds everything in, so a change
 * anywhere in the live path moves the digest.
 */
export async function computeExecutionClosure(input = {}) {
  const prior = await import('../r3l0ciar/closure.mjs');
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
    kind: 'R3-L0C-I-A-R-L ExecutionClosureDigest',
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
      `${STAGE_EVIDENCE_PATH}/stage-result.json`,
      `${STAGE_EVIDENCE_PATH}/qualification.json`,
    ]),
    coversCodeNotResults: true,
    executionClosureDigest,
    CLOSURE_COMPLETE: missingHarness.length === 0 && missingReused.length === 0 && (base.CLOSURE_COMPLETE === true),
    onIncomplete: 'STOP — a closure whose manifest names a module that does not exist is a claim about bytes that are not there',
    law: 'a changed shipped runtime or a changed reused harness module must move the closure digest',
  });
}

/**
 * §4: THE FOUR MUTATION ARMS.
 *
 * Each is computed BY OVERRIDE — a mutated digest substituted into the part map — so the tree is never written and
 * no parallel reader can observe a window. The arms are: a dynamically loaded product module the static walker
 * cannot see, this stage's own harness, a REUSED prior-stage module (the reuse is only safe if this moves), and a
 * toolchain version.
 */
export async function proveClosureMutations() {
  const arms = [];
  const baseline = await computeExecutionClosure({ verifyCompiled: false });

  const { measureWalkerBlindSpot } = await import('../r3l0ciar/runtime-manifest.mjs');
  const blindSpot = await measureWalkerBlindSpot();
  const dynamicTarget = blindSpot.manifestModulesNotReachableByWalker[0] ?? 'dist/src/project_workspace/index.js';

  arms.push(mutateByOverride({ id: 'RUNTIME_MANIFEST_DYNAMIC_MODULE', target: dynamicTarget, partId: 'RUNTIME_MANIFEST_CLOSURE', baseline, targetReachableByStaticWalker: false }));
  arms.push(mutateByOverride({ id: 'STAGE_HARNESS_MODULE', target: `${STAGE_CODE_PATH}/pipeline.mjs`, partId: 'STAGE_HARNESS_CLOSURE', baseline, targetReachableByStaticWalker: true }));
  /** §4: a REUSED prior-stage module, which is the arm that makes direct reuse safe. */
  arms.push(mutateByOverride({ id: 'REUSED_PRIOR_MODULE', target: 'scripts/r3l0ciar/admission.mjs', partId: 'REUSED_MODULES_CLOSURE', baseline, targetReachableByStaticWalker: true }));
  arms.push(proveToolchainMutation(baseline));

  const failing = arms.filter((arm) => arm.PROPERTY_PROVEN !== true);
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'execution closure mutations',
    arms: Object.freeze(arms), blindSpot,
    ALL_MUTATIONS_PROVEN: failing.length === 0,
    failing: Object.freeze(failing.map((arm) => arm.id)),
    computedByOverride: true,
    treeMutated: false,
    law: 'a mutation is computed by substituting a mutated file digest into the part map, so no reader can observe a mutation window',
  });
}

/** §4: compute one mutation arm by override, never touching the tree. */
function mutateByOverride(input) {
  const { id, target, partId, baseline, targetReachableByStaticWalker } = input;
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
    computedByOverride: true,
  });
}

/** §4: a toolchain version change moves the aggregate, because the versions are folded in as named entries. */
function proveToolchainMutation(baseline) {
  const aggregateMaterial = { ...baseline.aggregateMaterial, 'package:vitest': '0.0.0-mutation-probe' };
  const mutatedDigest = digestOfMap(aggregateMaterial);
  return Object.freeze({
    id: 'TOOLCHAIN_VERSION',
    target: 'package:vitest',
    digestBefore: baseline.executionClosureDigest,
    digestMutated: mutatedDigest,
    PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedDigest && baseline.aggregateMaterial['package:vitest'] !== '0.0.0-mutation-probe',
    computedByOverride: true,
  });
}

export { NL };
