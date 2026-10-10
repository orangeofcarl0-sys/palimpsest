/**
 * R3-L0C-I-A-R-L-C §7 — THE STAGE-OWNED EXECUTION CLOSURE.
 *
 * WHAT THIS EXTENDS. The prior chain covers the frozen R3-L0C-F parts, the R3-L0C-I-A harness, the dynamically
 * loaded runtime manifest, the R3-L0C-I-A-R-L harness and that stage's reused modules. This stage adds ITS OWN
 * harness part — the four gate modules — and its own reused-modules part, naming the R3-L0C-I-A-R-L modules it
 * imports directly.
 *
 * WHY THE REUSED MODULES NEED THEIR OWN PART. This stage's pipeline imports the prior stage's `activation`,
 * `primary-adapter`, `confinement`, `admission`, `validity`, `preflight`, `closure`, `host-bundle`,
 * `instrumentation`, `treatment` and `scripted-worker` modules DIRECTLY, because the four gates do not live in
 * them. That reuse is safe ONLY if the closure covers those bytes — a change to the prior stage's admission gate
 * would otherwise move nothing in this stage's digest, which is precisely the defect the runtime manifest was
 * introduced to close. So they are a named part, and a mutation to one of them must move the aggregate.
 *
 * §7 requires FOUR mutation arms, and each is one of them:
 *
 *   NEW_STAGE_PIPELINE_MODULE               a change to THIS stage's pipeline moves the harness part
 *   REUSED_PRIOR_ADMISSION_MODULE           a change to a REUSED prior-stage module moves the reused part
 *   RUNTIME_MANIFEST_DYNAMIC_MODULE         a change to a dynamically loaded module the static walker cannot see
 *   EXECUTION_CONFIGURATION_OR_TOOLCHAIN    a changed execution configuration or toolchain identity moves it
 *
 * WHY MUTATION-BY-OVERRIDE. §7 requires "Use mutation-by-override where possible. Never transiently mutate shared
 * repository files during tests." These files are hashed by EVERY closure computation, and vitest runs test files
 * in parallel processes, so a temporary disk write is observable by another reader. Each arm substitutes a mutated
 * digest into the part map and rebuilds the aggregate from the base's own material; the tree is never written.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §7: this stage's own harness modules, which execute the experiment and are therefore load-bearing. */
export const STAGE_HARNESS_MODULES = Object.freeze([
  `${STAGE_CODE_PATH}/contract.mjs`,
  `${STAGE_CODE_PATH}/modes.mjs`,
  `${STAGE_CODE_PATH}/pipeline.mjs`,
  `${STAGE_CODE_PATH}/cost-bridge.mjs`,
  `${STAGE_CODE_PATH}/postmatrix-admission.mjs`,
  `${STAGE_CODE_PATH}/trust-boundary.mjs`,
  `${STAGE_CODE_PATH}/attestation.mjs`,
  `${STAGE_CODE_PATH}/closure.mjs`,
  `${STAGE_CODE_PATH}/qualification.mjs`,
  `${STAGE_CODE_PATH}/prospective-plan.mjs`,
  `${STAGE_CODE_PATH}/regression.mjs`,
  `${STAGE_CODE_PATH}/acceptance.mjs`,
  `${STAGE_CODE_PATH}/falsifiers.mjs`,
  `${STAGE_CODE_PATH}/baseline/legacy-controls.mjs`,
]);

/**
 * §7: THE PRIOR STAGE'S MODULES THIS STAGE REUSES DIRECTLY.
 *
 * Named as data so the reuse is visible and covered rather than implicit. A change to any of these moves this
 * stage's closure, which is what makes direct reuse safe.
 */
export const REUSED_MODULES = Object.freeze([
  'scripts/r3l0ciarl/pipeline.mjs',
  'scripts/r3l0ciarl/live-evidence.mjs',
  'scripts/r3l0ciarl/postflight.mjs',
  'scripts/r3l0ciarl/primary-binding.mjs',
  'scripts/r3l0ciarl/attestation.mjs',
  'scripts/r3l0ciarl/closure.mjs',
  'scripts/r3l0ciarl/contract.mjs',
  'scripts/r3l0ciarl/modes.mjs',
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

/** §7: the digest of one file's bytes, or a marker. */
export function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return 'MISSING';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** §7: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * §7: COMPUTE THE FULL EXECUTION CLOSURE.
 *
 * The frozen parts and the prior stages' extensions are taken UNCHANGED from `scripts/r3l0ciarl/closure.mjs`, and
 * this stage adds its harness part and its reused-modules part. The aggregate folds everything in, so a change
 * anywhere in the live path moves the digest.
 */
export async function computeExecutionClosure(input = {}) {
  const prior = await import('../r3l0ciarl/closure.mjs');
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
    kind: 'R3-L0C-I-A-R-L-C ExecutionClosureDigest',
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
    law: 'a changed shipped runtime, a changed reused prior-stage module, or a changed execution configuration must move the closure digest',
  });
}

/**
 * §7: THE FOUR MUTATION ARMS.
 *
 * Each is computed BY OVERRIDE — a mutated digest substituted into the part map — so the tree is never written and
 * no parallel reader can observe a window. The arms are §7's own list.
 */
export async function proveClosureMutations() {
  const arms = [];
  const baseline = await computeExecutionClosure({ verifyCompiled: false });

  const { measureWalkerBlindSpot } = await import('../r3l0ciar/runtime-manifest.mjs');
  const blindSpot = await measureWalkerBlindSpot();
  const dynamicTarget = blindSpot.manifestModulesNotReachableByWalker[0] ?? 'dist/src/project_workspace/index.js';

  /** ARM 1: this stage's own pipeline module — the NEW_STAGE_PIPELINE_MODULE arm. */
  arms.push(mutateByOverride({
    id: 'NEW_STAGE_PIPELINE_MODULE',
    target: `${STAGE_CODE_PATH}/pipeline.mjs`,
    partId: 'STAGE_HARNESS_CLOSURE',
    baseline,
    targetReachableByStaticWalker: true,
    detail: `a change to ${STAGE_CODE_PATH}/pipeline.mjs moves this stage's harness part and the aggregate`,
  }));

  /** ARM 2: a REUSED prior-stage module — the arm that makes direct reuse safe. */
  arms.push(mutateByOverride({
    id: 'REUSED_PRIOR_ADMISSION_MODULE',
    target: 'scripts/r3l0ciar/admission.mjs',
    partId: 'REUSED_MODULES_CLOSURE',
    baseline,
    targetReachableByStaticWalker: true,
    detail: 'a change to the REUSED prior-stage admission gate moves the reused-modules part and the aggregate, so direct reuse is covered',
  }));

  /** ARM 3: a dynamically loaded module the static walker cannot see. */
  arms.push(mutateByOverride({
    id: 'RUNTIME_MANIFEST_DYNAMIC_MODULE',
    target: dynamicTarget,
    partId: 'RUNTIME_MANIFEST_CLOSURE',
    baseline,
    targetReachableByStaticWalker: false,
    detail: `the manifest part and the aggregate digest both move when ${dynamicTarget} changes, and the target is one the static import-graph walker cannot reach`,
  }));

  /** ARM 4: an execution configuration or toolchain identity. */
  arms.push(proveToolchainMutation(baseline));

  const failing = arms.filter((arm) => arm.PROPERTY_PROVEN !== true);
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C', kind: 'execution closure mutations',
    arms: Object.freeze(arms), blindSpot,
    ALL_MUTATIONS_PROVEN: failing.length === 0,
    failing: Object.freeze(failing.map((arm) => arm.id)),
    declaredArms: Object.freeze(['NEW_STAGE_PIPELINE_MODULE', 'REUSED_PRIOR_ADMISSION_MODULE', 'RUNTIME_MANIFEST_DYNAMIC_MODULE', 'EXECUTION_CONFIGURATION_OR_TOOLCHAIN']),
    computedByOverride: true,
    treeMutated: false,
    law: 'a mutation is computed by substituting a mutated file digest into the part map, so no reader can observe a mutation window',
  });
}

/** §7: compute one mutation arm by override, never touching the tree. */
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

/** §7: an execution-configuration or toolchain change moves the aggregate. */
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
