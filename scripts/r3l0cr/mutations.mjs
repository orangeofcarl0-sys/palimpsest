/**
 * R3-L0C-R §5/§9 — THE PERMANENT MUTATIONS AND THE EXECUTION-CLOSURE DIGEST.
 *
 * §5 requires a DETERMINISTIC MUTATION that reproduces the escaped defect — a selection of the form
 * `{ handles: [...] }` — and requires the result to be `INVALID_SELECTION_SHAPE` (or a failing
 * `TREATMENT_REALIZATION_GATE`) with `REAL_MODEL_LAUNCH_COUNT = 0`. It also requires two positive controls: a
 * correct C owner-kind selection must PASS with exactly the expected handles, and the H empty selection must
 * PASS with zero handles.
 *
 * WHY THE LAUNCH COUNT IS PART OF THE REQUIREMENT. §5 does not merely want the malformed shape refused; it wants
 * the refusal to happen BEFORE a model could be launched. A gate that detected the defect after the worker
 * started would still have burned the session and, worse, produced a treated-looking record with no treatment.
 * The count is therefore measured at the point of decision.
 *
 * §9 requires ONE digest over every load-bearing executable input, computed before trial 1 and recomputed
 * immediately before it. A mismatch is a STOP, and a pre-exposure repair creates a NEW plan commit.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXECUTION_CLOSURE_INPUTS, REPO_ROOT, closureDigest, verifyClosure } from './contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';
import { attemptSelection, buildSelection, validateSelection } from './selection.mjs';
import { buildExpectationManifest } from './contract.mjs';

const NL = String.fromCharCode(10);

/* ================================================================ §5 the mutations */

/** §5: the mutation ids. */
export const MUTATION_IDS = Object.freeze({
  MALFORMED_HANDLES_FIELD: 'MALFORMED_SELECTION_HANDLES_FIELD',
  C_POSITIVE_CONTROL: 'C_OWNER_KIND_POSITIVE_CONTROL',
  H_POSITIVE_CONTROL: 'H_EMPTY_SELECTION_POSITIVE_CONTROL',
  MALFORMED_ITEM_SHAPE: 'MALFORMED_SELECTION_ITEM_SHAPE',
  UNKNOWN_KIND: 'MALFORMED_SELECTION_UNKNOWN_KIND',
});

/**
 * §5: THE MUTATIONS.
 *
 * Each mutation is a builder that produces the shape under test, run through the canonical path so the result is
 * the REAL gate's verdict rather than a re-implementation's.
 */
export function runSelectionMutations(input) {
  const { admittedRefs, generationId = 'G1' } = input;
  const expectation = buildExpectationManifest({ generationId, arm: 'C', admittedRefs, generationExposures: GENERATION_EXPOSURES });
  const expectedHandles = expectation.expectedConsumerVisibleHandles;

  /** §5: THE ESCAPED DEFECT, reproduced exactly: a bare `handles` list. */
  const malformedHandles = attemptSelection(() => validateSelection({ handles: [...expectedHandles] }));
  /** §5: a malformed ITEM inside a supported kind. */
  const malformedItem = attemptSelection(() => validateSelection({ reasoning: [{ cellId: 'cell-only' }] }));
  /** §5: an unknown KIND alongside a valid one. */
  const unknownKind = attemptSelection(() => validateSelection({ reasoning: [{ cellId: 'c', claimId: 'k' }], handles: ['x'] }));

  /** §5 positive control 1: the correct C selection, built through the canonical builder. */
  const cControl = attemptSelection(() => buildSelection({ arm: 'C', generationId, admittedRefs, generationExposures: GENERATION_EXPOSURES }));
  /** §5 positive control 2: the H arm, which is the ABSENCE of a selection. */
  const hControl = attemptSelection(() => buildSelection({ arm: 'H', generationId, admittedRefs, generationExposures: GENERATION_EXPOSURES }));

  const mutations = Object.freeze([
    Object.freeze({
      id: MUTATION_IDS.MALFORMED_HANDLES_FIELD,
      reproduces: 'the exact escaped defect: a selection sent as { handles: [...] }',
      expected: 'INVALID_SELECTION_SHAPE with zero launches',
      observed: malformedHandles.refusal,
      TREATMENT_REALIZATION_GATE: malformedHandles.TREATMENT_REALIZATION_GATE,
      REAL_MODEL_LAUNCH_COUNT: malformedHandles.realModelLaunchCount,
      detected: malformedHandles.refusal === 'INVALID_SELECTION_SHAPE' && malformedHandles.realModelLaunchCount === 0,
    }),
    Object.freeze({
      id: MUTATION_IDS.MALFORMED_ITEM_SHAPE,
      reproduces: 'a supported kind carrying an incomplete item',
      expected: 'INVALID_SELECTION_ITEM with zero launches',
      observed: malformedItem.refusal,
      TREATMENT_REALIZATION_GATE: malformedItem.TREATMENT_REALIZATION_GATE,
      REAL_MODEL_LAUNCH_COUNT: malformedItem.realModelLaunchCount,
      detected: malformedItem.refusal === 'INVALID_SELECTION_ITEM' && malformedItem.realModelLaunchCount === 0,
    }),
    Object.freeze({
      id: MUTATION_IDS.UNKNOWN_KIND,
      reproduces: 'an unknown kind smuggled alongside a valid one, which the product would ignore',
      expected: 'INVALID_SELECTION_SHAPE with zero launches',
      observed: unknownKind.refusal,
      TREATMENT_REALIZATION_GATE: unknownKind.TREATMENT_REALIZATION_GATE,
      REAL_MODEL_LAUNCH_COUNT: unknownKind.realModelLaunchCount,
      detected: unknownKind.refusal === 'INVALID_SELECTION_SHAPE' && unknownKind.realModelLaunchCount === 0,
    }),
  ]);

  const controls = Object.freeze([
    Object.freeze({
      id: MUTATION_IDS.C_POSITIVE_CONTROL,
      expectation: 'PASS with exactly the expected handles',
      gate: cControl.TREATMENT_REALIZATION_GATE,
      items: cControl.items,
      expectedItems: expectedHandles.length,
      passed: cControl.ok === true && cControl.TREATMENT_REALIZATION_GATE === 'PASS' && cControl.items === expectedHandles.length,
    }),
    Object.freeze({
      id: MUTATION_IDS.H_POSITIVE_CONTROL,
      expectation: 'PASS with zero handles, because H is the ABSENCE of a selection',
      gate: hControl.TREATMENT_REALIZATION_GATE,
      items: hControl.items,
      requestIsUndefined: hControl.request === undefined,
      passed: hControl.ok === true && hControl.items === 0 && hControl.request === undefined,
    }),
  ]);

  const allDetected = mutations.every((mutation) => mutation.detected);
  const allControlsPassed = controls.every((control) => control.passed);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'selection realization mutations',
    generationId,
    mutations,
    controls,
    mutationsDetected: allDetected,
    controlsPassed: allControlsPassed,
    TREATMENT_REALIZATION_GATE: allDetected && allControlsPassed ? 'PASS' : 'FAIL',
    REAL_MODEL_LAUNCH_COUNT_ON_ANY_MUTATION: mutations.reduce((total, mutation) => total + mutation.REAL_MODEL_LAUNCH_COUNT, 0),
    /** §5: the law, carried as a value. */
    law: 'a malformed non-empty selection must be refused before any model launch, and must never be converted into an empty selection',
  });
}

/* ================================================================ §9 the execution closure */

/**
 * §9: THE CLOSURE INPUT SET.
 *
 * §9 lists the categories; each is mapped to the FILES that carry it. The mapping is explicit so a reader can see
 * which file implements which category, and so a category cannot be silently dropped.
 */
export const CLOSURE_FILES = Object.freeze({
  'project/corpus': Object.freeze(['scripts/r3l0c/corpus.mjs', 'scripts/r3l0c/project.mjs']),
  oracle: Object.freeze(['scripts/r3l0c/diagnostic.mjs']),
  'generation child': Object.freeze(['scripts/r3l0c/generation-child.mjs']),
  'matrix runner': Object.freeze(['scripts/r3l0c/matrix.mjs', 'scripts/r3l0cr/matrix.mjs']),
  'selector/builder': Object.freeze(['scripts/r3l0cr/selection.mjs', 'scripts/r3l0c/capital.mjs']),
  witness: Object.freeze(['scripts/r3l0c/witness.mjs']),
  analysis: Object.freeze(['scripts/r3l0c/analyse.mjs', 'scripts/r3l0cr/analyse.mjs']),
  'containment topology': Object.freeze(['scripts/r3l0cr/topology.mjs', 'scripts/r3l0b/containment.mjs', 'scripts/r3l0c/trajectory.mjs']),
  'trial schema': Object.freeze(['scripts/r3l0cr/contract.mjs']),
  'verdict logic': Object.freeze(['scripts/r3l0c/analyse.mjs', 'scripts/r3l0cr/analyse.mjs']),
});

/** §9: the digest of one file's bytes, or a marker when it is absent. */
function fileDigest(relative) {
  const path = join(REPO_ROOT, relative);
  if (!existsSync(path)) return 'MISSING';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** §9: the per-category digests, so a drift names the category rather than only the digest. */
export function closureByCategory() {
  const byCategory = {};
  for (const [category, files] of Object.entries(CLOSURE_FILES)) {
    byCategory[category] = closureDigest(Object.fromEntries(files.map((file) => [file, fileDigest(file)])));
  }
  return Object.freeze(byCategory);
}

/** §9: the flat file map, which is what `verifyClosure` compares. */
export function closureFileMap() {
  const map = {};
  for (const files of Object.values(CLOSURE_FILES)) {
    for (const file of files) map[file] = fileDigest(file);
  }
  return Object.freeze(map);
}

/**
 * §9: COMPUTE THE EXECUTION-CLOSURE DIGEST.
 *
 * The digest is over the per-CATEGORY digests rather than the flat file list, so the number is stable when a
 * category is represented by the same files and changes when any file in any category changes.
 */
export function computeExecutionClosure() {
  const byCategory = closureByCategory();
  return Object.freeze({
    schemaVersion: 1,
    kind: 'ExecutionClosureDigest',
    inputs: EXECUTION_CLOSURE_INPUTS,
    byCategory,
    executionClosureDigest: closureDigest(byCategory),
    fileCount: Object.keys(closureFileMap()).length,
    coversCodeNotResults: true,
  });
}

/** §9: recompute and compare against a frozen closure. */
export function checkExecutionClosure(frozen) {
  const current = closureByCategory();
  const comparison = verifyClosure(frozen?.byCategory ?? frozen ?? {}, current);
  return Object.freeze({
    ...comparison,
    current,
    executionClosureDigest: closureDigest(current),
  });
}

export { NL };
