/**
 * R3-S0 §"Project Behavior Trace"/§"Mechanism Witness" — THE EXPERIMENTAL EVIDENCE SCHEMAS.
 *
 * §"Project Behavior Trace" is explicit: `ProjectBehaviorTrace` is "NOT a canonical store or owner. It is
 * test/evidence infrastructure." This module honours that literally — it defines an in-memory record shape
 * with a strict builder and a digest, and it writes nothing durable, registers nothing, and exports no name on
 * any package surface.
 *
 * The `MechanismWitness` builder is the reusable experimental instrument §"Mechanism Witness" asks for. Its
 * one important behaviour is the law: a witness that is missing a required step is `MECHANISM_NOT_DEMONSTRATED`
 * even when the task succeeded, and the record says so explicitly.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import { MECHANISM_WITNESS_CHAIN, WITNESS_VERDICTS, judgeWitness } from './contract.mjs';

/** A stable canonical JSON encoding, so a digest does not depend on key insertion order. */
export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The digest of an experimental record. Prefixed with the domain so two record kinds cannot collide. */
export function digestOf(domain, value) {
  return createHash('sha256').update(`${domain}${canonicalJson(value)}`, 'utf8').digest('hex');
}

export const PROJECT_BEHAVIOR_TRACE_DOMAIN = 'palimpsest.r3-s0.project-behavior-trace.v1';
export const MECHANISM_WITNESS_DOMAIN = 'palimpsest.r3-s0.mechanism-witness.v1';

/** §"Project Behavior Trace": the fields the trace MAY record, frozen so a report cannot invent others. */
export const PROJECT_BEHAVIOR_TRACE_FIELDS = Object.freeze([
  'projectId',
  'workIds',
  'attemptIds',
  'canonicalNodeRefs',
  'canonicalEdgeWitnesses',
  'authorityDecisions',
  'runtimeBindingDigests',
  'consumerVisibleDigests',
  'toolSurfaceDigest',
  'toolInvocations',
  'ownerReads',
  'durableMutations',
  'verificationPromotionReceipts',
  'restartBoundaries',
  'forbiddenBypassChecks',
]);

/**
 * §"Project Behavior Trace": build a trace. Every field is OPTIONAL and defaults to an empty list, so a trace
 * can record a partial observation honestly rather than forcing a caller to invent values.
 */
export function makeProjectBehaviorTrace(input = {}) {
  const trace = {
    schemaVersion: 1,
    kind: 'ProjectBehaviorTrace',
    domain: PROJECT_BEHAVIOR_TRACE_DOMAIN,
    /** §"Project Behavior Trace": declared NOT canonical, in the record itself. */
    canonical: false,
    projectId: input.projectId ?? null,
    workIds: Object.freeze([...(input.workIds ?? [])]),
    attemptIds: Object.freeze([...(input.attemptIds ?? [])]),
    canonicalNodeRefs: Object.freeze([...(input.canonicalNodeRefs ?? [])]),
    canonicalEdgeWitnesses: Object.freeze([...(input.canonicalEdgeWitnesses ?? [])]),
    authorityDecisions: Object.freeze([...(input.authorityDecisions ?? [])]),
    runtimeBindingDigests: Object.freeze([...(input.runtimeBindingDigests ?? [])]),
    consumerVisibleDigests: Object.freeze([...(input.consumerVisibleDigests ?? [])]),
    toolSurfaceDigest: input.toolSurfaceDigest ?? null,
    toolInvocations: Object.freeze([...(input.toolInvocations ?? [])]),
    ownerReads: Object.freeze([...(input.ownerReads ?? [])]),
    durableMutations: Object.freeze([...(input.durableMutations ?? [])]),
    verificationPromotionReceipts: Object.freeze([...(input.verificationPromotionReceipts ?? [])]),
    restartBoundaries: Object.freeze([...(input.restartBoundaries ?? [])]),
    forbiddenBypassChecks: Object.freeze([...(input.forbiddenBypassChecks ?? [])]),
  };
  return Object.freeze({ ...trace, traceDigest: digestOf(PROJECT_BEHAVIOR_TRACE_DOMAIN, trace) });
}

/**
 * §"Project Behavior Trace": which of the declared fields a trace actually populated. An empty trace is
 * legitimate but must be VISIBLE as empty rather than looking complete.
 */
export function traceCoverage(trace) {
  const populated = PROJECT_BEHAVIOR_TRACE_FIELDS.filter((field) => {
    const value = trace[field];
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  return Object.freeze({
    populated: Object.freeze(populated),
    empty: Object.freeze(PROJECT_BEHAVIOR_TRACE_FIELDS.filter((field) => !populated.includes(field))),
    populatedCount: populated.length,
    declaredCount: PROJECT_BEHAVIOR_TRACE_FIELDS.length,
  });
}

/**
 * §"Mechanism Witness": build a witness over the frozen chain, and judge it.
 *
 * `steps` supplies the answers. `taskOutcome` is recorded so the law can be applied: a `TASK_SUCCESS` with an
 * incomplete chain is reported as exactly that, and NOT as mechanism success.
 */
export function makeMechanismWitness(input = {}) {
  const steps = input.steps ?? {};
  const required = input.requiredSteps ?? MECHANISM_WITNESS_CHAIN.map((entry) => entry.step);
  const witness = {
    schemaVersion: 1,
    kind: 'MechanismWitness',
    domain: MECHANISM_WITNESS_DOMAIN,
    mechanism: input.mechanism ?? 'UNNAMED_MECHANISM',
    taskOutcome: input.taskOutcome ?? null,
    steps: Object.freeze(Object.fromEntries(MECHANISM_WITNESS_CHAIN.map((entry) => [entry.step, steps[entry.step] ?? null]))),
    requiredSteps: Object.freeze([...required]),
  };
  const judgement = judgeWitness({ ...witness.steps, taskOutcome: witness.taskOutcome }, required);
  return Object.freeze({
    ...witness,
    verdict: judgement.verdict,
    complete: judgement.complete,
    missingSteps: judgement.missingSteps,
    /** §"Mechanism Witness": the record that must be produced when a task succeeds without a full witness. */
    taskSuccessWithoutWitness: judgement.taskSuccessWithoutWitness,
    ruling: judgement.ruling,
    witnessDigest: digestOf(MECHANISM_WITNESS_DOMAIN, { mechanism: witness.mechanism, steps: witness.steps, requiredSteps: witness.requiredSteps, taskOutcome: witness.taskOutcome }),
  });
}

/** §"Mechanism Witness": the two verdict constants, re-exported for the harness. */
export { WITNESS_VERDICTS };

/**
 * §"Forbidden-bypass witness": build the bypass record.
 *
 * §"Forbidden-bypass witness" forbids claiming that no unknown bypass exists, so the record carries the honest
 * claim word and the reason, and a caller cannot construct one that says more.
 */
export function makeBypassWitness(input = {}) {
  const results = Object.freeze([...(input.results ?? [])]);
  const blocked = results.filter((entry) => entry.blocked === true).map((entry) => entry.id);
  const open = results.filter((entry) => entry.blocked !== true).map((entry) => entry.id);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'ForbiddenBypassWitness',
    claim: open.length === 0 ? 'KNOWN_BYPASSES_BLOCKED' : 'KNOWN_BYPASSES_OPEN',
    /** §"Forbidden-bypass witness": the claim is about KNOWN bypasses and says nothing about unknown ones. */
    claimScope: 'known bypasses only; this is not a proof that no unknown bypass exists',
    blocked: Object.freeze(blocked),
    open: Object.freeze(open),
    results,
  });
}

/**
 * §"Evidence correctness": the digest closure for one conformance run.
 *
 * §"Evidence correctness" requires enough hashes to establish the tested bytes, the relevant canonical state,
 * the runtime/session bytes, the acceptance module and the produced trace — and forbids relying only on
 * ephemeral artifacts. So every entry is a named digest, and a run with a missing entry is visibly incomplete.
 */
export const EVIDENCE_DIGEST_KINDS = Object.freeze([
  'testedSourceBytes',
  'canonicalState',
  'runtimeSessionBytes',
  'acceptanceModule',
  'producedTrace',
]);

export function makeEvidenceClosure(input = {}) {
  const digests = input.digests ?? {};
  const present = EVIDENCE_DIGEST_KINDS.filter((kind) => typeof digests[kind] === 'string' && /^[0-9a-f]{64}$/u.test(digests[kind]));
  const missing = EVIDENCE_DIGEST_KINDS.filter((kind) => !present.includes(kind));
  return Object.freeze({
    schemaVersion: 1,
    kind: 'EvidenceDigestClosure',
    scenario: input.scenario ?? 'UNNAMED_SCENARIO',
    digests: Object.freeze(Object.fromEntries(EVIDENCE_DIGEST_KINDS.map((kind) => [kind, digests[kind] ?? null]))),
    present: Object.freeze(present),
    missing: Object.freeze(missing),
    complete: missing.length === 0,
  });
}
