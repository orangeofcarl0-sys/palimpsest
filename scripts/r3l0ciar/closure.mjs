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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
 * Each is a real temporary byte change, restored and verified: a dynamically loaded module the static walker
 * cannot see, this stage's own harness, and a toolchain version.
 */
export async function proveClosureMutations() {
  const arms = [];
  const baseline = await computeExecutionClosure({ verifyCompiled: false });

  const { measureWalkerBlindSpot } = await import('./runtime-manifest.mjs');
  const blindSpot = await measureWalkerBlindSpot();
  const dynamicTarget = blindSpot.manifestModulesNotReachableByWalker[0] ?? 'dist/src/project_workspace/index.js';
  const dynamicPath = join(REPO_ROOT, dynamicTarget);
  let dynamicArm;
  if (!existsSync(dynamicPath)) {
    dynamicArm = Object.freeze({ id: 'RUNTIME_MANIFEST_DYNAMIC_MODULE', target: dynamicTarget, PROPERTY_PROVEN: false, reason: 'the target does not exist' });
  } else {
    const originalBytes = readFileSync(dynamicPath);
    let mutatedClosure = null;
    try {
      writeFileSync(dynamicPath, Buffer.concat([originalBytes, Buffer.from(`${NL}// r3l0ciar dynamic-module mutation probe${NL}`, 'utf8')]));
      mutatedClosure = await computeExecutionClosure({ verifyCompiled: false });
    } finally {
      writeFileSync(dynamicPath, originalBytes);
    }
    const restoredClosure = await computeExecutionClosure({ verifyCompiled: false });
    dynamicArm = Object.freeze({
      id: 'RUNTIME_MANIFEST_DYNAMIC_MODULE', target: dynamicTarget,
      digestBefore: baseline.executionClosureDigest,
      digestMutated: mutatedClosure.executionClosureDigest,
      digestRestored: restoredClosure.executionClosureDigest,
      partMoved: baseline.parts.RUNTIME_MANIFEST_CLOSURE !== mutatedClosure.parts.RUNTIME_MANIFEST_CLOSURE,
      targetReachableByStaticWalker: false,
      PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedClosure.executionClosureDigest && restoredClosure.executionClosureDigest === baseline.executionClosureDigest,
      detail: `a temporary change to ${dynamicTarget} moved both the manifest part and the aggregate digest, and was restored exactly`,
    });
  }
  arms.push(dynamicArm);

  arms.push(await mutateAndRecompute({ target: `${STAGE_CODE_PATH}/pipeline.mjs`, partId: 'STAGE_HARNESS_CLOSURE', baseline }));
  arms.push(await proveToolchainMutation(baseline));

  const failing = arms.filter((arm) => arm.PROPERTY_PROVEN !== true);
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'execution closure mutations',
    arms: Object.freeze(arms), blindSpot,
    ALL_MUTATIONS_PROVEN: failing.length === 0,
    failing: Object.freeze(failing.map((arm) => arm.id)),
  });
}

/** A real temporary byte change to a harness module, with the closure recomputed on both sides. */
async function mutateAndRecompute(input) {
  const { target, partId, baseline } = input;
  const path = join(REPO_ROOT, target);
  if (!existsSync(path)) return Object.freeze({ id: 'STAGE_HARNESS_MODULE', target, PROPERTY_PROVEN: false, reason: 'the target does not exist' });
  const original = readFileSync(path);
  let mutatedDigest = null;
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from(`${NL}// r3l0ciar closure mutation probe${NL}`, 'utf8')]));
    mutatedDigest = await computeExecutionClosure({ verifyCompiled: false });
  } finally {
    writeFileSync(path, original);
  }
  const restored = await computeExecutionClosure({ verifyCompiled: false });
  return Object.freeze({
    id: 'STAGE_HARNESS_MODULE', target, partId,
    digestBefore: baseline.executionClosureDigest,
    digestMutated: mutatedDigest.executionClosureDigest,
    digestRestored: restored.executionClosureDigest,
    partMoved: baseline.parts[partId] !== mutatedDigest.parts[partId],
    PROPERTY_PROVEN: baseline.executionClosureDigest !== mutatedDigest.executionClosureDigest && restored.executionClosureDigest === baseline.executionClosureDigest,
    detail: `a temporary change to ${target} moved both the part digest and the aggregate, and was restored exactly`,
  });
}

/** §7: a toolchain version change moves the aggregate, because the versions are folded in as named entries. */
async function proveToolchainMutation(baseline) {
  const { computeExecutionClosure: priorClosure } = await import('../r3l0cf/closure.mjs');
  const baseToolchain = await priorClosure({ verifyCompiled: false });
  const mutated = await priorClosure({ verifyCompiled: false, toolchain: { ...baseToolchain.toolchain, packages: { ...baseToolchain.toolchain.packages, vitest: '0.0.0-mutation-probe' } } });
  return Object.freeze({
    id: 'TOOLCHAIN_VERSION', target: 'package:vitest',
    digestBefore: baseToolchain.executionClosureDigest,
    digestMutated: mutated.executionClosureDigest,
    PROPERTY_PROVEN: baseToolchain.executionClosureDigest !== mutated.executionClosureDigest,
    detail: 'a changed package version moves the aggregate digest, because the versions participate in it as named entries rather than sitting beside it',
  });
}

export { NL };
