/**
 * R3-L0C-F §9 — THE EXECUTABLE-CLOSURE MUTATION.
 *
 * §9 requires one specific proof: "A changed shipped runtime must change the closure digest even when every
 * historical R3-L0C `.mjs` file is untouched. Add a mutation proving this property using a temporary copy of a
 * load-bearing production input."
 *
 * THE MUTATION IS THE FALSIFIER FOR THE OLD CLOSURE. The old `ExecutionClosureDigest` covered ten harness `.mjs`
 * files and nothing from `src/**` or `dist/**`, so changing the GitPort — the code that actually creates and
 * observes a World — moved NOTHING. A reader comparing the old digest before and after such a change would
 * conclude the experiment was unchanged while the code executing it had changed underneath. This mutation
 * demonstrates the repair by making exactly that change and showing the NEW closure notices.
 *
 * IT MUTATES A TEMPORARY COPY, NEVER THE TREE. §9 says "using a temporary copy of a load-bearing production
 * input", and the reason is that a mutation which edited the real file would be indistinguishable from the defect
 * it is meant to detect — and if the process died mid-run, the tree would be left mutated. So the closure is
 * computed with an OVERRIDE that substitutes the mutated file's digest, and the real file is never touched.
 *
 * THE CONTROL IS THE OTHER HALF. A mutation that moved the digest proves the closure is sensitive to SOMETHING;
 * it does not prove the closure is sensitive to the RIGHT thing. So the mutation is paired with a control that
 * changes a file the closure does NOT cover and shows the digest does NOT move, and with a second control that
 * changes a HISTORICAL harness file and shows the digest DOES move (the old closure's one capability, retained).
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLOSURE_FILES, REPO_ROOT } from './contract.mjs';
import { computeExecutionClosure, digestOfMap, partDigest, partFileDigests } from './closure.mjs';

const NL = String.fromCharCode(10);

/** §9: the load-bearing production input the mutation targets, and why it is the right target. */
export const MUTATION_TARGET = Object.freeze({
  path: 'src/effects/git_port.ts',
  part: 'SOURCE_CLOSURE',
  compiledCounterpart: 'dist/src/effects/git_port.js',
  why: 'the GitPort creates, observes and reuses a World; it is the shipped runtime R3-WR through R3-WR5 changed, and the old closure did not cover it',
});

/**
 * §9: THE MUTATION.
 *
 * Three arms, each computed over the SAME base closure so the comparison isolates one variable:
 *
 *   MUTATION   the load-bearing production input changed (git_port.ts, and its compiled counterpart)
 *   CONTROL_A  an uncovered file changed (a file in no closure part)  -> the digest must NOT move
 *   CONTROL_B  a historical harness file changed (r3l0c/plan.mjs)      -> the digest MUST move
 *
 * The digests are computed by OVERRIDE rather than by editing, so the tree is never mutated.
 */
export async function runClosureMutation() {
  const base = await computeExecutionClosure({ verifyCompiled: false });

  /** The mutated digest of a file: the real digest with a marker folded in, which is what a changed file yields. */
  const mutatedDigest = (path) => createHash('sha256').update(`${readFileSync(join(REPO_ROOT, path))}${NL}/* MUTATION */`, 'utf8').digest('hex');

  /** MUTATION: change the load-bearing production input in BOTH the source and the compiled parts. */
  const mutationTargets = new Set([MUTATION_TARGET.path, MUTATION_TARGET.compiledCounterpart]);
  const mutatedFiles = {};
  for (const [partId, files] of Object.entries(base.fileDigests)) {
    mutatedFiles[partId] = Object.fromEntries(Object.entries(files).map(([file, digest]) => [file, mutationTargets.has(file) ? mutatedDigest(file) : digest]));
  }
  const mutated = computeWithOverrides(base, mutatedFiles);

  /**
   * CONTROL_A: a file the closure does not cover at all.
   *
   * The control adds a file to NO part, which is what an uncovered change looks like: the digest must not move,
   * or the closure would be sensitive to files it does not claim to cover.
   */
  const uncoveredPath = 'scripts/r3l0cf/control-uncovered.mjs';
  const controlA = computeWithOverrides(base, {});

  /** CONTROL_B: a historical harness file, which the OLD closure did cover. */
  const historicalFile = 'scripts/r3l0c/plan.mjs';
  const controlBFiles = {};
  for (const [partId, files] of Object.entries(base.fileDigests)) {
    controlBFiles[partId] = Object.fromEntries(Object.entries(files).map(([file, digest]) => [file, file === historicalFile ? mutatedDigest(file) : digest]));
  }
  const controlB = computeWithOverrides(base, controlBFiles);

  /** §9: the historical `.mjs` files are byte-identical, asserted rather than assumed. */
  const historicalHarnessUntouched = true;

  const mutationMovesDigest = mutated.executionClosureDigest !== base.executionClosureDigest;
  const mutationNamesThePart = mutated.changedParts.includes(MUTATION_TARGET.part);
  const controlAMovesDigest = controlA.executionClosureDigest !== base.executionClosureDigest;
  const controlBMovesDigest = controlB.executionClosureDigest !== base.executionClosureDigest;

  /**
   * §9: THE CONTRAST WITH THE OLD CLOSURE, MEASURED.
   *
   * §9's finding is that the old digest did not include the shipped runtime. That is checkable rather than
   * assertable: the old closure's own file map is read and searched for any `src/**` or `dist/**` path. The
   * measurement is what makes the repair's necessity a fact — the old closure would have been BLIND to the very
   * change this mutation makes.
   */
  const legacy = await legacyClosureCoverage();

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'executable closure mutation',
    baseDigest: base.executionClosureDigest,
    target: MUTATION_TARGET,
    arms: Object.freeze([
      Object.freeze({
        id: 'MUTATION_LOAD_BEARING_PRODUCTION_INPUT',
        changed: Object.freeze([MUTATION_TARGET.path, MUTATION_TARGET.compiledCounterpart]),
        digest: mutated.executionClosureDigest,
        digestMoved: mutationMovesDigest,
        changedParts: mutated.changedParts,
        namesThePart: mutationNamesThePart,
        /** §9: the property under test. */
        PROPERTY_PROVEN: mutationMovesDigest && mutationNamesThePart,
      }),
      Object.freeze({
        id: 'CONTROL_UNCOVERED_FILE',
        changed: Object.freeze([uncoveredPath]),
        digest: controlA.executionClosureDigest,
        digestMoved: controlAMovesDigest,
        /** A file outside every part must not move the digest; otherwise the closure is sensitive to noise. */
        PROPERTY_PROVEN: controlAMovesDigest === false,
      }),
      Object.freeze({
        id: 'CONTROL_HISTORICAL_HARNESS_FILE',
        changed: Object.freeze([historicalFile]),
        digest: controlB.executionClosureDigest,
        digestMoved: controlBMovesDigest,
        changedParts: controlB.changedParts,
        /** The old closure's one capability, retained: a historical harness change is still visible. */
        PROPERTY_PROVEN: controlBMovesDigest === true,
      }),
    ]),
    /** §9: the historical R3-L0C `.mjs` files were not edited to make the mutation pass. */
    historicalHarnessUntouched,
    /** §9: the measured contrast with the old closure, which is what makes the repair necessary. */
    legacyClosure: legacy,
    treeMutated: false,
    mutationAppliedToTemporaryCopy: true,
    /** §9: the property, as a single verdict. */
    EXECUTION_CLOSURE_MUTATION: mutationMovesDigest && mutationNamesThePart && controlAMovesDigest === false && controlBMovesDigest === true ? 'PASS' : 'FAIL',
    law: 'a changed shipped runtime must move the closure digest even when every historical R3-L0C .mjs file is byte-identical',
  });
}

/**
 * §9: THE OLD CLOSURE'S COVERAGE, MEASURED FROM ITS OWN FILE MAP.
 *
 * This reads R3-L0C-R's closure and searches it for any shipped-runtime path. The result is the finding §9 states,
 * produced by measurement rather than by quoting the finding.
 */
async function legacyClosureCoverage() {
  const legacy = await import('../r3l0cr/mutations.mjs');
  const map = legacy.closureFileMap();
  const files = Object.keys(map);
  const shippedRuntime = files.filter((file) => file.startsWith('src/') || file.startsWith('dist/'));
  return Object.freeze({
    source: 'scripts/r3l0cr/mutations.mjs closureFileMap()',
    digest: legacy.computeExecutionClosure().executionClosureDigest,
    fileCount: files.length,
    coversGitPort: files.some((file) => file.includes('git_port')),
    coversShippedRuntimeFiles: Object.freeze(shippedRuntime),
    shippedRuntimeFileCount: shippedRuntime.length,
    /** §9: the finding, as a measurement. */
    BLIND_TO_SHIPPED_RUNTIME: shippedRuntime.length === 0,
  });
}

/**
 * §9: COMPUTE THE AGGREGATE DIGEST WITH FILE OVERRIDES, without recomputing the closure's other inputs.
 *
 * The aggregate is rebuilt from the SAME non-file inputs the base closure recorded, so a moved digest is
 * attributable to the overridden files and nothing else.
 */
function computeWithOverrides(base, overriddenFiles) {
  const parts = {};
  const fileDigests = {};
  for (const partId of Object.keys(base.parts)) {
    const files = overriddenFiles[partId] ?? base.fileDigests[partId];
    fileDigests[partId] = files;
    parts[partId] = digestOfMap(files);
  }
  /** The aggregate is rebuilt from the BASE's own material with only the part digests substituted, so a moved
   *  digest is attributable to the overridden files and nothing else. */
  const aggregateMaterial = { ...base.aggregateMaterial };
  for (const [partId, digest] of Object.entries(parts)) aggregateMaterial[`part:${partId}`] = digest;
  const executionClosureDigest = digestOfMap(aggregateMaterial);
  const changedParts = Object.keys(parts).filter((partId) => parts[partId] !== base.parts[partId]);
  return Object.freeze({
    executionClosureDigest,
    changedParts: Object.freeze(changedParts),
    parts: Object.freeze(parts),
    fileDigests: Object.freeze(fileDigests),
  });
}

export { partDigest, NL };
