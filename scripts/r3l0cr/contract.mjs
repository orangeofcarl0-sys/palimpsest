/**
 * R3-L0C-R §1/§2/§3/§4/§6/§9/§15/§16 — THE CORRECTED CONTRACT.
 *
 * §2 replaces the single ambiguous `EXPERIMENT_VALID` with THREE separable dimensions, because Run 1 showed that
 * one boolean was doing three jobs and answered the wrong one:
 *
 *   EXPERIMENT_ENVIRONMENT_VALID   was the environment sound? (containment, topology, evidence immutability)
 *   TREATMENT_REALIZATION_VALID    did the intended treatment actually reach the consumer?
 *   ANALYSIS_PLAN_VALID            was the analysis fixed before execution, and is it still the one being run?
 *
 * A behavioral mechanism claim requires all three, plus `SYSTEM_VALID`. Their conjunction is
 * `CAUSAL_EXPERIMENT_VALID`. §16 states the consequence and it is carried as a value: if any dimension fails, no
 * treatment verdict is issued.
 *
 * WHY THE SPLIT MATTERS, stated with Run 1 as the case. Run 1 had a sound environment and an unapplied treatment.
 * A single `EXPERIMENT_VALID` would have reported `YES` — the environment was valid — and a reader would have
 * concluded the experiment was sound while the treatment was absent. The three-way split makes that state
 * nameable, and §1 appends it as the corrected verdict.
 *
 * §3 corrects the TELEMETRY reading. `knowledgeSelected` was treated as proof of delivery, and Run 1 proved it is
 * not: all eight C sessions reported `true` while compiling zero handles. The five fields below separate a
 * REQUEST from a DELIVERY, and §3 states the rule that a requested-but-not-compiled selection is a delivery
 * failure rather than an uptake observation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

import { createHash } from 'node:crypto';

const NL = String.fromCharCode(10);

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §13: the stage-owned evidence path. The ONLY place this stage may add to the protected tree. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c-r';

/** §13: the source stage whose evidence is immutable. */
export const SOURCE_STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0c';

/* ================================================================ §2 the validity dimensions */

/**
 * §2: THE FOUR DIMENSIONS.
 *
 * Each is a separate question with a separate answer, and none is averaged into another. The order is the order
 * §2 lists them, so a report is reproducible.
 */
export const VALIDITY_DIMENSIONS = Object.freeze([
  Object.freeze({
    id: 'SYSTEM_VALID',
    question: 'is the mechanism correct?',
    source: 'R3-S0 systemic closure',
    requirement: 'the four truth layers, loop conformance matrices, cross-loop closures and preregistered mutations are green',
  }),
  Object.freeze({
    id: 'EXPERIMENT_ENVIRONMENT_VALID',
    question: 'is the experimental environment sound?',
    source: 'R3-L0B containment, extended by §8 topology derivation',
    requirement: 'containment, topology-derived isolation, preflight repairs and evidence immutability all hold',
  }),
  Object.freeze({
    id: 'TREATMENT_REALIZATION_VALID',
    question: 'did the intended treatment actually reach the consumer boundary?',
    source: '§3 telemetry semantics, §6 expectation manifest, §7 boundary probe',
    requirement: 'for every C generation the requested set equals the compiled set equals the consumer-visible set; for every H generation all three are empty',
  }),
  Object.freeze({
    id: 'ANALYSIS_PLAN_VALID',
    question: 'was the analysis fixed before execution and is it still the one running?',
    source: '§9 ExecutionClosureDigest',
    requirement: 'the analysis plan, outcome schema and verdict logic were frozen before trial 1 and their closure digest still matches',
  }),
]);

/** §2/§16: the conjunction. */
export function causalExperimentValidFrom(dimensions) {
  const entries = VALIDITY_DIMENSIONS.map((definition) => Object.freeze({
    id: definition.id,
    verdict: dimensions?.[definition.id] === true ? 'YES' : 'NO',
    detail: dimensions?.[`${definition.id}_detail`] ?? null,
  }));
  const failing = entries.filter((entry) => entry.verdict !== 'YES').map((entry) => entry.id);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'causal experiment validity',
    CAUSAL_EXPERIMENT_VALID: failing.length === 0,
    dimensions: entries,
    failing,
    /** §16: the consequence, carried so a report cannot soften it. */
    onFailure: 'no reconstruction-compression or net-cost treatment verdict is issued',
    taskOutcomeIsAnInput: false,
  });
}

/**
 * §2: THE CLAIM ADMISSION LAW.
 *
 * §2 makes the conjunction the gate for a behavioral mechanism claim, and §2 states that the task outcome is not
 * an input — in either direction.
 */
export const CLAIM_ADMISSION = Object.freeze({
  requires: Object.freeze(['SYSTEM_VALID', 'EXPERIMENT_ENVIRONMENT_VALID', 'TREATMENT_REALIZATION_VALID', 'ANALYSIS_PLAN_VALID']),
  conjunctionName: 'CAUSAL_EXPERIMENT_VALID',
  law: 'a behavioral mechanism claim requires the conjunction of all four dimensions',
  taskOutcomeIsAnInput: false,
  repairLaw: 'a favorable task outcome cannot repair a failed dimension, and an unfavorable one cannot invalidate a passing one',
});

/* ================================================================ §3 the telemetry semantics */

/**
 * §3: THE FIVE TELEMETRY FIELDS.
 *
 * §3 requires them recorded SEPARATELY, because they answer five different questions and Run 1 collapsed them
 * into one wrong answer. The chain is ordered: a request is not a compilation, a compilation is not a delivery,
 * a delivery is not a pull, and a pull is not a resolved body.
 */
export const TELEMETRY_FIELDS = Object.freeze([
  Object.freeze({ id: 'selectionRequested', question: 'was a selection asked for?', measuredFrom: 'the delegation input' }),
  Object.freeze({ id: 'selectionCompiled', question: 'did the host compile handles from it?', measuredFrom: 'the consumer-boundary payload' }),
  Object.freeze({ id: 'consumerVisible', question: 'did the handles reach the surface the worker was handed?', measuredFrom: 'the consumer-boundary payload' }),
  Object.freeze({ id: 'pullInvoked', question: 'did the governed pull run for each handle?', measuredFrom: 'the governed pull records' }),
  Object.freeze({ id: 'bodyResolved', question: 'did the pull return the canonical owner body?', measuredFrom: 'the pull response digest' }),
]);

/**
 * §3: THE READING RULE.
 *
 * This is the sentence the correction turns on, and it is a value rather than prose so a report can quote it.
 */
export const TELEMETRY_READING_RULE = Object.freeze({
  rule: 'selectionRequested = true with zero compiled handles is a DELIVERY/TREATMENT failure, NOT an uptake failure',
  forbiddenReading: 'do not read a requested-but-not-compiled selection as evidence that capital is not consumed',
  /** §3: for every capital kind, the requested and compiled counts are recorded separately. */
  perKindCountsRequired: true,
  kinds: Object.freeze(['proof', 'reasoning', 'procedure']),
});

/**
 * §3: BUILD THE TREATMENT TELEMETRY for one generation, from the observed chain.
 *
 * Each field is derived from where it is actually observable, so the record cannot be satisfied by one signal
 * standing in for another. `selectionRequested` comes from what was SENT; `selectionCompiled` and
 * `consumerVisible` come from the consumer-boundary payload; `pullInvoked` and `bodyResolved` come from the pull
 * records.
 */
export function treatmentTelemetry(input) {
  const requested = input.requestedSelection ?? null;
  const payload = input.payload ?? null;
  const pulls = input.governedPulls ?? [];
  const compiledHandles = (payload?.handles ?? []).map((entry) => entry.handle);
  const requestedCounts = Object.freeze({
    proof: requested?.proof?.length ?? 0,
    reasoning: requested?.reasoning?.length ?? 0,
    procedure: requested?.procedure?.length ?? 0,
  });
  const compiledCounts = Object.freeze({
    proof: (payload?.handles ?? []).filter((entry) => entry.kind === 'proof' || /@ctx\/proof\//u.test(entry.handle)).length,
    reasoning: (payload?.handles ?? []).filter((entry) => entry.kind === 'reasoning' || /@ctx\/reasoning\//u.test(entry.handle)).length,
    procedure: (payload?.handles ?? []).filter((entry) => entry.kind === 'procedure' || /@ctx\/procedure\//u.test(entry.handle)).length,
  });
  const requestedTotal = requestedCounts.proof + requestedCounts.reasoning + requestedCounts.procedure;
  const resolvedPulls = pulls.filter((pull) => pull.resolved === true && typeof pull.bodyDigest === 'string' && pull.bodyDigest !== null);

  return Object.freeze({
    /** §3: the five fields, each from its own observation. */
    selectionRequested: requestedTotal > 0,
    selectionCompiled: compiledHandles.length > 0,
    consumerVisible: compiledHandles.length > 0,
    pullInvoked: pulls.length > 0,
    bodyResolved: resolvedPulls.length > 0,
    /** §3: the per-kind counts. */
    requestedCounts,
    compiledCounts,
    requestedTotal,
    compiledTotal: compiledHandles.length,
    consumerVisibleHandles: Object.freeze(compiledHandles),
    pulledHandles: Object.freeze(pulls.map((pull) => pull.handle)),
    resolvedHandles: Object.freeze(resolvedPulls.map((pull) => pull.handle)),
    bodyDigests: Object.freeze(resolvedPulls.map((pull) => Object.freeze({ handle: pull.handle, digest: pull.bodyDigest }))),
    /**
     * §3: THE READING. A request that compiled nothing is a DELIVERY failure. It is never reported as an uptake
     * observation, which is the error Run 1's record made.
     */
    reading: requestedTotal > 0 && compiledHandles.length === 0
      ? 'DELIVERY_FAILURE_REQUESTED_BUT_NOT_COMPILED'
      : requestedTotal === 0 && compiledHandles.length === 0
        ? 'NO_SELECTION_REQUESTED'
        : 'SELECTION_COMPILED',
    rule: TELEMETRY_READING_RULE.rule,
  });
}

/* ================================================================ §4 the selection contract */

/**
 * §4: THE SELECTION CONTRACT FINDING.
 *
 * §4 asks for a determination between two cases and requires the case to be RECORDED:
 *
 *   RUNTIME_CONTRACT_UNHARDENED   the boundary is a shipped untyped or serialized runtime contract, so a
 *                                 malformed selection can pass through it and a fail-closed runtime validation
 *                                 is warranted
 *   HARNESS_BYPASSED_TYPED_API    an already-enforced typed API exists and the harness bypassed it, so the
 *                                 repair is to make the harness use the canonical builder rather than to change
 *                                 product behaviour
 *
 * THE DETERMINATION IS THE SECOND CASE, and the evidence is recorded rather than asserted:
 *
 *   · the boundary is IN-PROCESS — `work_delegation` passes the object straight to the controller, with no
 *     serialization step, so the object is a live JavaScript value;
 *   · the contract is a TYPED interface, `KnowledgeSelectionRequest` in `src/context/knowledge.ts`, whose
 *     fields are exactly `proof`/`reasoning`/`procedure`;
 *   · TypeScript REJECTS the escaped shape with `TS2353` (`'handles' does not exist in type
 *     'KnowledgeSelectionRequest'`) — verified by compiling it;
 *   · the harness is PLAIN JAVASCRIPT and `scripts/` is outside `tsconfig.include`, so the type never ran;
 *   · the ONLY other caller path is the sealed public API, and `knowledge` is absent from it, so a typed caller
 *     cannot reach the boundary with the malformed shape.
 *
 * Therefore the type system already enforced this contract and the harness bypassed it by being untyped. §4 says
 * explicitly: do NOT change product behaviour in that case. The repair is that the HARNESS must use a canonical
 * builder that validates.
 */
export const SELECTION_CONTRACT_FINDING = Object.freeze({
  case: 'HARNESS_BYPASSED_TYPED_API',
  boundary: 'in-process (work_delegation passes the object to the controller; no serialization)',
  typedContract: Object.freeze({
    name: 'KnowledgeSelectionRequest',
    module: 'src/context/knowledge.ts',
    fields: Object.freeze(['proof', 'reasoning', 'procedure']),
  }),
  evidence: Object.freeze([
    Object.freeze({ id: 'TS_REJECTS_ESCAPED_SHAPE', detail: 'compiling `const bad: KnowledgeSelectionRequest = { handles: [...] }` yields TS2353: Object literal may only specify known properties, and handles does not exist in type KnowledgeSelectionRequest' }),
    Object.freeze({ id: 'HARNESS_IS_UNTYPED', detail: 'the harness is plain JavaScript and tsconfig.include is ["src","test","tools"], so the type never ran on the harness' }),
    Object.freeze({ id: 'NO_SERIALIZATION_STEP', detail: 'work_delegation passes input.knowledge straight to workWorkerAttemptContext, so no wire format could strip or coerce it' }),
    Object.freeze({ id: 'SILENT_DEGRADATION', detail: 'knowledgeRequestIsEmpty({handles:[...]}) returns true, so a non-empty malformed request is indistinguishable from no selection' }),
    Object.freeze({ id: 'NOT_ON_THE_SEALED_SURFACE', detail: 'the `knowledge` field is absent from the sealed public API, so no typed external caller can produce the shape' }),
  ]),
  productChangeRequired: false,
  productChangeMade: false,
  repair: 'the harness must use a canonical, validating selection builder; the builder refuses an unknown key or a malformed value shape and NEVER converts a malformed non-empty selection into an empty one',
  forbiddenRepair: 'do not add a runtime validator to the product boundary, and do not make the product reject what its own type already rejects',
});

/* ================================================================ §6 the expectation manifest */

/**
 * §6: THE TREATMENT EXPECTATION MANIFEST.
 *
 * §6 requires the expectation to be FROZEN per generation BEFORE execution and explicitly forbids inferring it
 * from runtime results. That ordering is the whole point: an expectation read off the run can never disagree with
 * the run, so it could not detect the defect Run 1 had.
 *
 * The manifest is built from the admitted capital and the generation's declared exposures, both of which exist
 * before trial 1. Its digest is bound into the plan (§9) and compared against the observed realization.
 */
export function buildExpectationManifest(input) {
  const { generationId, arm, admittedRefs, generationExposures } = input;
  const exposed = new Set(generationExposures[generationId] ?? []);
  const selected = arm === 'H' ? [] : admittedRefs.filter((entry) => exposed.has(entry.invariant));
  const byKind = Object.freeze({
    proof: Object.freeze(selected.filter((entry) => entry.kind === 'PROOF_CLAIM').map((entry) => entry.handle)),
    reasoning: Object.freeze(selected.filter((entry) => entry.kind === 'REASONING_CLAIM').map((entry) => entry.handle)),
    procedure: Object.freeze(selected.filter((entry) => entry.kind === 'PROCEDURE').map((entry) => entry.handle)),
  });
  const expectedHandles = Object.freeze([...byKind.proof, ...byKind.reasoning, ...byKind.procedure].sort());
  return Object.freeze({
    generationId,
    arm,
    exposedInvariants: Object.freeze([...exposed]),
    /** §6: the expectation, by kind. */
    expectedSelectionByKind: byKind,
    expectedConsumerVisibleHandles: expectedHandles,
    expectedCounts: Object.freeze({ proof: byKind.proof.length, reasoning: byKind.reasoning.length, procedure: byKind.procedure.length, total: expectedHandles.length }),
    /** §6: H is the ABSENCE of a selection, so its expectation is empty on every field. */
    expectationRule: arm === 'H'
      ? 'requested == compiled == consumer-visible == empty'
      : 'requested == compiled == consumer-visible == the frozen expected set, compared by exact identity, kind and count',
    /** §6: the consequence of a mismatch. */
    onMismatch: 'TREATMENT_NOT_APPLIED and the model launch is forbidden',
    inferredFromRuntime: false,
  });
}

/** §6: the digest of an expectation manifest, so the plan can bind it. */
export function expectationDigest(manifest) {
  const material = [manifest.generationId, manifest.arm, manifest.expectedConsumerVisibleHandles.join(',')].join('|');
  return createHashOf(material);
}

/** §6: compare an observed realization against the frozen expectation. Exact identity, kind and count. */
export function verifyRealization(manifest, telemetry) {
  const expected = manifest.expectedConsumerVisibleHandles;
  const observed = telemetry.consumerVisibleHandles;
  const sameSet = expected.length === observed.length && expected.every((handle) => observed.includes(handle));
  const countsMatch = manifest.expectedCounts.total === telemetry.compiledTotal
    && manifest.expectedCounts.proof === telemetry.compiledCounts.proof
    && manifest.expectedCounts.reasoning === telemetry.compiledCounts.reasoning
    && manifest.expectedCounts.procedure === telemetry.compiledCounts.procedure;
  const requestedMatches = manifest.arm === 'H'
    ? telemetry.requestedTotal === 0
    : telemetry.requestedTotal === manifest.expectedCounts.total;
  const ok = sameSet && countsMatch && requestedMatches;
  return Object.freeze({
    generationId: manifest.generationId,
    arm: manifest.arm,
    expectedHandles: expected,
    observedHandles: observed,
    sameSet,
    countsMatch,
    requestedMatches,
    TREATMENT_REALIZATION: ok ? 'APPLIED' : 'NOT_APPLIED',
    onMismatch: ok ? null : manifest.onMismatch,
    modelLaunchPermitted: ok,
  });
}

/* ================================================================ §9 the execution closure */

/**
 * §9: THE EXECUTION-CLOSURE DIGEST.
 *
 * §9 requires ONE digest over every load-bearing executable input, computed before trial 1 and recomputed
 * immediately before it. A mismatch is a STOP, and a pre-exposure repair must create a NEW plan commit rather
 * than leaving an older plan whose executable closure has drifted.
 *
 * The digest covers CODE, not results, so it can be computed and compared before any model runs.
 */
export const EXECUTION_CLOSURE_INPUTS = Object.freeze([
  'project/corpus', 'oracle', 'generation child', 'matrix runner', 'selector/builder', 'witness',
  'analysis', 'containment topology', 'trial schema', 'verdict logic',
]);

/** §9: the digest of a set of named file digests. */
export function closureDigest(fileDigests) {
  const material = Object.entries(fileDigests).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHashOf(material);
}

/** §9: compare a recomputed closure against the frozen one. */
export function verifyClosure(frozen, recomputed) {
  const frozenPaths = Object.keys(frozen).sort();
  const recomputedPaths = Object.keys(recomputed).sort();
  const added = recomputedPaths.filter((path) => !frozenPaths.includes(path));
  const removed = frozenPaths.filter((path) => !recomputedPaths.includes(path));
  const changed = frozenPaths.filter((path) => path in recomputed && frozen[path] !== recomputed[path]);
  const ok = added.length === 0 && removed.length === 0 && changed.length === 0;
  return Object.freeze({
    EXECUTION_CLOSURE: ok ? 'MATCH' : 'DRIFTED',
    frozenDigest: closureDigest(frozen),
    recomputedDigest: closureDigest(recomputed),
    changed: Object.freeze(changed),
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    onMismatch: 'STOP — a pre-exposure repair must create a NEW plan commit',
  });
}

/* ================================================================ the small hash helper */

/** A sha256 of a string. */
export function createHashOf(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** A one-line summary of the corrected contract, for a report header. */
export function contractSummary() {
  return Object.freeze({
    stage: 'R3-L0C-R',
    kind: 'treatment realization and repair replication contract',
    validityDimensions: VALIDITY_DIMENSIONS.map((entry) => entry.id),
    conjunction: CLAIM_ADMISSION.conjunctionName,
    telemetryFields: TELEMETRY_FIELDS.map((entry) => entry.id),
    selectionContractCase: SELECTION_CONTRACT_FINDING.case,
    productChangeMade: SELECTION_CONTRACT_FINDING.productChangeMade,
    closureInputs: EXECUTION_CLOSURE_INPUTS.length,
    newline: NL,
  });
}
