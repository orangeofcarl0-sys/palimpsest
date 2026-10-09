/**
 * R3-L0C-I-A-R §7 — THE EXPLICIT RUNTIME MANIFEST.
 *
 * THE GAP THIS CLOSES. §7 states it precisely: the generation child loads product modules BY COMPUTED PATH from
 * `dist/src`, and "these are not all discoverable by a static import-regex walker". The closure's import-graph
 * walker sees `import { x } from './y.mjs'`; it cannot see
 *
 *     const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);
 *     const advanced = await load('advanced.js');
 *
 * So a change to `dist/src/project_workspace/index.js` — the module that provides the association and journal
 * stores the primary path depends on — would move nothing in the closure digest. A reader comparing digests would
 * conclude the experiment was unchanged while the code executing it had changed.
 *
 * THE REPAIR IS NARROW AND EXPLICIT. §7 forbids building a bundler or a dependency system, and it is right to:
 * a general resolver would silently absorb a NEW module into the closure and hide the change. So the manifest is
 * an explicit list, and the two properties §7 requires are proven rather than asserted:
 *
 *   · every listed module EXISTS, and a missing one is a STOP rather than a silently dropped entry;
 *   · changing one previously uncovered, load-bearing compiled module MOVES the digest.
 *
 * The second is the load-bearing one, and it is measured by mutating a module that the import-graph walker does
 * NOT reach — which is what makes it a proof about the manifest rather than about the walker.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, RUNTIME_MANIFEST_LAW, RUNTIME_MANIFEST_MODULES } from './contract.mjs';

const NL = String.fromCharCode(10);

/** §7: the manifest, as data, so a reader can check it against the child's own load sites. */
export const RUNTIME_MANIFEST = Object.freeze([...RUNTIME_MANIFEST_MODULES]);

/** §7: the digest of one file's bytes, or a marker. */
function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return 'MISSING';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * §7: COMPUTE THE RUNTIME MANIFEST'S DIGEST AND ITS OWN COMPLETENESS.
 *
 * The completeness check is what keeps the manifest honest. It reports:
 *
 *   missingModules       a listed module that does not exist — a STOP, because a manifest entry that resolves to
 *                        nothing is a claim about bytes that are not there
 *   moduleCount          how many were hashed
 *   moduleDigests        the per-module digests, so a drift names WHICH module moved
 *
 * A digest over `MISSING` is never treated as a pass: the caller receives the missing list and must refuse.
 */
export function computeRuntimeManifest(input = {}) {
  const modules = input.modules ?? RUNTIME_MANIFEST;
  const moduleDigests = {};
  for (const relative of modules) moduleDigests[relative] = fileDigest(relative);
  const missing = modules.filter((relative) => moduleDigests[relative] === 'MISSING');
  const material = Object.entries(moduleDigests).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'dynamically loaded runtime manifest',
    modules: Object.freeze([...modules]),
    moduleDigests: Object.freeze(moduleDigests),
    moduleCount: modules.length,
    missingModules: Object.freeze(missing),
    RUNTIME_MANIFEST_COMPLETE: missing.length === 0,
    runtimeManifestDigest: createHash('sha256').update(material, 'utf8').digest('hex'),
    why: RUNTIME_MANIFEST_LAW.reason,
    onMissing: 'STOP — a manifest entry that resolves to nothing is a claim about bytes that are not there',
  });
}

/**
 * §7: PROVE THAT A PREVIOUSLY UNCOVERED MODULE MOVES THE DIGEST.
 *
 * §7 requires the proof, and the choice of module is what makes it a proof. The mutation is applied to a module
 * the STATIC WALKER CANNOT SEE — `dist/src/project_workspace/index.js` — so a digest that moves is evidence about
 * the manifest's coverage rather than about the walker's reach. A mutation applied to a module the walker already
 * covers would prove nothing new.
 *
 * The mutation is a real temporary byte change, restored afterwards, and the restore is verified so a failed
 * mutation cannot leave the shipped runtime altered.
 */
export function proveRuntimeManifestMutation(input = {}) {
  const target = input.target ?? 'dist/src/project_workspace/index.js';
  const before = computeRuntimeManifest();
  const path = join(REPO_ROOT, target);
  if (!existsSync(path)) {
    return Object.freeze({
      id: 'RUNTIME_MANIFEST_MUTATION',
      target,
      PROPERTY_PROVEN: false,
      reason: `the mutation target does not exist at ${target}, so the property cannot be proven`,
    });
  }
  const original = readFileSync(path);
  let mutated = null;
  try {
    /** A byte-level change that preserves the module's syntax: a trailing comment appended. */
    writeFileSync(path, Buffer.concat([original, Buffer.from(`${NL}// r3l0ciar runtime-manifest mutation probe${NL}`, 'utf8')]));
    mutated = computeRuntimeManifest();
  } finally {
    writeFileSync(path, original);
  }
  const restored = computeRuntimeManifest();
  const moved = before.runtimeManifestDigest !== mutated.runtimeManifestDigest;
  const restoredExactly = restored.runtimeManifestDigest === before.runtimeManifestDigest;
  const inStaticWalker = input.staticWalkerReaches === true;
  return Object.freeze({
    id: 'RUNTIME_MANIFEST_MUTATION',
    target,
    /** §7: the property, measured on a module the static walker cannot reach. */
    digestBefore: before.runtimeManifestDigest,
    digestMutated: mutated.runtimeManifestDigest,
    digestRestored: restored.runtimeManifestDigest,
    digestMovedOnMutation: moved,
    digestRestoredExactly: restoredExactly,
    /** §7: whether the target is reachable by the static import-graph walker, which is what makes the proof new. */
    targetReachableByStaticWalker: inStaticWalker,
    PROPERTY_PROVEN: moved && restoredExactly,
    law: RUNTIME_MANIFEST_LAW.mutationRequired,
  });
}

/**
 * §7: THE MODULES THE STATIC IMPORT-GRAPH WALKER CANNOT SEE.
 *
 * This is the measurement that justifies the manifest's existence, and it is a measurement rather than an
 * argument: the walker's own module list is compared against the manifest, and the difference is reported. A
 * module in the manifest but NOT in the walker's list is precisely one the closure would have missed.
 */
export async function measureWalkerBlindSpot() {
  const { walkImportGraph } = await import('../r3l0cf/closure-graph.mjs');
  const graph = walkImportGraph();
  const reachable = new Set(graph.modules ?? []);
  const blind = RUNTIME_MANIFEST.filter((relative) => !reachable.has(relative));
  return Object.freeze({
    kind: 'walker blind-spot measurement',
    walkerModuleCount: reachable.size,
    manifestModuleCount: RUNTIME_MANIFEST.length,
    manifestModulesNotReachableByWalker: Object.freeze(blind),
    blindSpotCount: blind.length,
    /** §7's claim, measured: the manifest covers modules the walker does not. */
    manifestCoversModulesTheWalkerMisses: blind.length > 0,
    note: 'a module the walker cannot see is one a walker-only closure would leave uncovered, which is the gap the explicit manifest exists to close',
  });
}

/**
 * §7: THE CLOSURE EXTENSION, AS ONE PART.
 *
 * §7 requires the manifest to participate in the aggregate digest, and it requires the configured AND observed
 * executor configuration to be recorded. This returns the values the closure folds in, so the extension is one
 * function rather than a scattering of additions to `computeExecutionClosure`.
 */
export async function runtimeManifestClosurePart() {
  const manifest = computeRuntimeManifest();
  return Object.freeze({
    partId: 'RUNTIME_MANIFEST_CLOSURE',
    digest: manifest.runtimeManifestDigest,
    moduleCount: manifest.moduleCount,
    missing: manifest.missingModules,
    complete: manifest.RUNTIME_MANIFEST_COMPLETE,
    law: RUNTIME_MANIFEST_LAW.reason,
  });
}

export { NL, rmSync };
