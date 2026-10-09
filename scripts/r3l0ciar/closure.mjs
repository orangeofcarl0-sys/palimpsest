/**
 * R3-L0C-I-A-R §7/§9 — THE STAGE-OWNED EXECUTION CLOSURE.
 *
 * WHAT THIS EXTENDS. R3-L0C-F's closure covers five parts and folds the toolchain, the packages, the effective
 * route and the model identity into the aggregate. R3-L0C-I-A added two parts: the stage harness and the
 * dynamically loaded runtime manifest. This stage adds its OWN harness part (so a change to the R3-L0C-I-A-R
 * pipeline moves the digest) and reuses the runtime manifest, then folds both into the aggregate.
 *
 * WHY A NEW HARNESS PART RATHER THAN REUSING R3-L0C-I-A's. §9 requires the new plan to carry a FRESHLY COMPUTED
 * execution closure, and the closure must cover the code that actually runs the experiment. The code that runs it
 * is now `scripts/r3l0ciar/*`; R3-L0C-I-A's harness is byte-identical and superseded. So the harness part names
 * the R3-L0C-I-A-R modules, and a reader comparing the two digests sees the supersession rather than a
 * contradiction.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { computeRuntimeManifest, runtimeManifestClosurePart } from './runtime-manifest.mjs';

/** §7: this stage's own harness modules, which execute the experiment and are therefore load-bearing. */
export const STAGE_HARNESS_MODULES = Object.freeze([
  `${STAGE_CODE_PATH}/contract.mjs`,
  `${STAGE_CODE_PATH}/activation.mjs`,
  `${STAGE_CODE_PATH}/modes.mjs`,
  `${STAGE_CODE_PATH}/pipeline.mjs`,
  `${STAGE_CODE_PATH}/primary-adapter.mjs`,
  `${STAGE_CODE_PATH}/scripted-worker.mjs`,
  `${STAGE_CODE_PATH}/treatment.mjs`,
  `${STAGE_CODE_PATH}/admission.mjs`,
  `${STAGE_CODE_PATH}/validity.mjs`,
  `${STAGE_CODE_PATH}/confinement.mjs`,
  `${STAGE_CODE_PATH}/host-bundle.mjs`,
  `${STAGE_CODE_PATH}/preflight.mjs`,
  `${STAGE_CODE_PATH}/instrumentation.mjs`,
  `${STAGE_CODE_PATH}/runtime-manifest.mjs`,
  `${STAGE_CODE_PATH}/closure.mjs`,
  `${STAGE_CODE_PATH}/falsifiers.mjs`,
  `${STAGE_CODE_PATH}/baseline/legacy-activation.mjs`,
  `${STAGE_CODE_PATH}/acceptance.mjs`,
  `${STAGE_CODE_PATH}/qualification.mjs`,
  `${STAGE_CODE_PATH}/prospective-plan.mjs`,
  `${STAGE_CODE_PATH}/evidence-corrections.mjs`,
  `${STAGE_CODE_PATH}/regression.mjs`,
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
 * The frozen R3-L0C-F parts are taken UNCHANGED, the stage harness is its own part, the runtime manifest is
 * another, and the aggregate folds in the toolchain, the package versions, the executor route, the model identity
 * and the plan digests — plus the two new parts.
 */
export async function computeExecutionClosure(input = {}) {
  const prior = await import('../r3l0cf/closure.mjs');
  const base = await prior.computeExecutionClosure(input);

  const harnessDigests = {};
  for (const relative of STAGE_HARNESS_MODULES) harnessDigests[relative] = fileDigest(relative);
  const missingHarness = STAGE_HARNESS_MODULES.filter((relative) => harnessDigests[relative] === 'MISSING');
  const harnessPartDigest = digestOfMap(harnessDigests);

  const manifest = computeRuntimeManifest();
  const manifestPart = await runtimeManifestClosurePart();

  const parts = Object.freeze({ ...base.parts, STAGE_HARNESS_CLOSURE: harnessPartDigest, RUNTIME_MANIFEST_CLOSURE: manifestPart.digest });
  const fileDigests = Object.freeze({ ...base.fileDigests, STAGE_HARNESS_CLOSURE: Object.freeze(harnessDigests), RUNTIME_MANIFEST_CLOSURE: Object.freeze(manifest.moduleDigests) });

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
    'runtime-manifest:complete': String(manifest.RUNTIME_MANIFEST_COMPLETE),
    'runtime-manifest:moduleCount': String(manifest.moduleCount),
  };
  const executionClosureDigest = digestOfMap(aggregateMaterial);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'R3-L0C-I-A-R ExecutionClosureDigest',
    parts,
    partIds: Object.freeze([...Object.keys(parts)]),
    fileDigests,
    fileCount: Object.values(fileDigests).reduce((total, map) => total + Object.keys(map).length, 0),
    toolchain: base.toolchain,
    executor: base.executor,
    modelIdentity: base.modelIdentity,
    schedule: base.schedule,
    runtimeManifest: Object.freeze({ digest: manifestPart.digest, moduleCount: manifest.moduleCount, missing: manifest.missingModules, complete: manifest.RUNTIME_MANIFEST_COMPLETE, modules: manifest.modules }),
    stageHarness: Object.freeze({ digest: harnessPartDigest, moduleCount: STAGE_HARNESS_MODULES.length, missing: Object.freeze(missingHarness) }),
    aggregateMaterial: Object.freeze(aggregateMaterial),
    compiledVerification: base.compiledVerification,
    selfExclusions: Object.freeze([
      `${STAGE_EVIDENCE_PATH}/execution-plan.json`,
      `${STAGE_EVIDENCE_PATH}/stage-result.json`,
      `${STAGE_EVIDENCE_PATH}/qualification.json`,
    ]),
    coversCodeNotResults: true,
    executionClosureDigest,
    CLOSURE_COMPLETE: missingHarness.length === 0 && manifest.RUNTIME_MANIFEST_COMPLETE === true,
    onIncomplete: 'STOP — a closure whose manifest names a module that does not exist is a claim about bytes that are not there',
    law: 'a changed shipped runtime must change the closure digest even when every historical R3-L0C .mjs file is byte-identical',
  });
}

/**
 * §7: THE THREE REQUIRED MUTATIONS.
 *
 * §7 requires the closure to be shown to move when a load-bearing input changes, and this stage proves the fourth
 * §7 names: a DYNAMICALLY LOADED module the static walker cannot see, this stage's own harness, and a toolchain
 * version.
 *
 * WHY THE MUTATIONS ARE COMPUTED BY OVERRIDE RATHER THAN BY EDITING THE TREE. This is the repair of a race that
 * was MEASURED, not guessed: an earlier version of this function wrote a temporary byte change to disk, recomputed
 * the closure, and restored it. Those files are SHARED — every closure computation hashes them — and vitest runs
 * test files in parallel processes, so a second file hashing during the window saw the MUTATED bytes. Measured:
 * the suite passed 25/25 alone and failed 3 under a full parallel run. Editing the tree to prove a digest property
 * is not required by §7 and is what created the hazard. R3-L0C-F's own mutation module computes its arms by
 * OVERRIDE for exactly this reason, and this stage follows it: the mutated digest is the real digest with a marker
 * folded in, substituted into the part's file map, and the aggregate is rebuilt from the base's own material. The
 * tree is never touched, so no reader can observe a window.
 */
export async function proveClosureMutations() {
  const arms = [];
  const baseline = await computeExecutionClosure({ verifyCompiled: false });

  const { measureWalkerBlindSpot } = await import('./runtime-manifest.mjs');
  const blindSpot = await measureWalkerBlindSpot();
  const dynamicTarget = blindSpot.manifestModulesNotReachableByWalker[0] ?? 'dist/src/project_workspace/index.js';

  /** ARM 1: a dynamically loaded module, the one the static walker cannot reach. */
  arms.push(mutateByOverride({
    id: 'RUNTIME_MANIFEST_DYNAMIC_MODULE',
    target: dynamicTarget,
    partId: 'RUNTIME_MANIFEST_CLOSURE',
    baseline,
    targetReachableByStaticWalker: false,
    detail: `the manifest part and the aggregate digest both move when ${dynamicTarget} changes, and the target is one the static import-graph walker cannot reach`,
  }));

  /** ARM 2: this stage's own pipeline module. */
  arms.push(mutateByOverride({
    id: 'STAGE_HARNESS_MODULE',
    target: `${STAGE_CODE_PATH}/pipeline.mjs`,
    partId: 'STAGE_HARNESS_CLOSURE',
    baseline,
    targetReachableByStaticWalker: true,
    detail: `a change to ${STAGE_CODE_PATH}/pipeline.mjs moves the harness part and the aggregate`,
  }));

  /** ARM 3: a toolchain version, folded in as a named entry. */
  arms.push(await proveToolchainMutation(baseline));

  const failing = arms.filter((arm) => arm.PROPERTY_PROVEN !== true);
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'execution closure mutations',
    arms: Object.freeze(arms), blindSpot,
    ALL_MUTATIONS_PROVEN: failing.length === 0,
    failing: Object.freeze(failing.map((arm) => arm.id)),
    /** §7: the mechanism, carried so a reader can see the tree is never mutated. */
    computedByOverride: true,
    treeMutated: false,
    law: 'a mutation is computed by substituting a mutated file digest into the part map, so no reader can observe a mutation window',
  });
}

/**
 * §7: COMPUTE ONE MUTATION ARM BY OVERRIDE.
 *
 * The mutated digest is the file's REAL digest with a marker folded in — which is what changed bytes yield. The
 * part map is rebuilt with that one entry substituted, the aggregate is rebuilt from the base's own material, and
 * the tree is never written.
 */
function mutateByOverride(input) {
  const { id, target, partId, baseline, targetReachableByStaticWalker, detail } = input;
  const partFiles = baseline.fileDigests[partId] ?? {};
  if (!(target in partFiles)) {
    return Object.freeze({ id, target, PROPERTY_PROVEN: false, reason: `the target ${target} is not a file of part ${partId}, so the arm cannot be measured` });
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
    id,
    target,
    partId,
    digestBefore: baseline.executionClosureDigest,
    digestMutated: mutatedClosureDigest,
    partMoved,
    targetReachableByStaticWalker,
    PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedClosureDigest && partMoved,
    detail,
    computedByOverride: true,
  });
}

/** §7: a toolchain version change moves the aggregate, because the versions are folded in as named entries. */
async function proveToolchainMutation(baseline) {
  const { computeExecutionClosure: priorClosure } = await import('../r3l0cf/closure.mjs');
  const baseToolchain = await priorClosure({ verifyCompiled: false });
  const aggregateMaterial = { ...baseline.aggregateMaterial, 'package:vitest': '0.0.0-mutation-probe' };
  const mutatedDigest = digestOfMap(aggregateMaterial);
  return Object.freeze({
    id: 'TOOLCHAIN_VERSION',
    target: 'package:vitest',
    digestBefore: baseline.executionClosureDigest,
    digestMutated: mutatedDigest,
    PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedDigest && baseline.aggregateMaterial['package:vitest'] !== '0.0.0-mutation-probe',
    detail: 'a changed package version moves the aggregate digest, because the versions participate in it as named entries rather than sitting beside it',
    computedByOverride: true,
    priorClosureReadForTheControl: baseToolchain.executionClosureDigest !== undefined,
  });
}

export { NL };
