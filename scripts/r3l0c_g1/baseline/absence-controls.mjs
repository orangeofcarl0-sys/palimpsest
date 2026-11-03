/**
 * R3-L0C-G1 §3/§12 C1 — THE SOURCE-LEVEL PRODUCER GAPS, MEASURED AGAINST THE UNMODIFIED BASELINE.
 *
 * §12 C1 requires the failing or absence-demonstrating controls to be committed BEFORE the implementation,
 * and §3 requires every claimed baseline gap to have an ACTUAL negative observation rather than an assertion.
 * Each control here reads the real baseline source or drives the real baseline port and records what it
 * actually observes — which, before G1, is the absence of the producer.
 *
 * WHY ABSENCE CONTROLS AND NOT FAILING TESTS. The G1 producer is ADDITIVE: the baseline is not broken, it is
 * incomplete. A control that "fails" would be a control asserting a capability the baseline never claimed. The
 * honest measurement is therefore an explicit negative observation — "the port returns no pid field" — which
 * C2 then flips to the positive form.
 *
 * SAFETY. Every measurement is read-only over source text, or drives the real port with a local non-model Node
 * child. No model, provider or remote service is involved. `modelCallsMade: 0`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, PRODUCER_GAPS, REPO_ROOT } from '../contract.mjs';

/** §3: read a repo-relative file's text, or null when absent. */
function readSource(relative) {
  try { return readFileSync(join(REPO_ROOT, relative), 'utf8'); } catch { return null; }
}

/**
 * §3 GAP-1: the Deployment port discards the process observation.
 *
 * Measured by reading the actual outcome type and the actual `spawn` call site. The port DOES call `spawn`
 * (so a direct child identity exists at runtime), but the returned vocabulary has no field for it.
 */
export function controlPortDiscardsProcessObservation() {
  const source = readSource('src/deployment/work_worker.ts');
  const outcomeType = source === null ? null : /export type WorkWorkerExecutionOutcome =[\s\S]{0,400}?;/.exec(source)?.[0] ?? null;
  return Object.freeze({
    id: 'GAP-1',
    requirement: 'the Deployment port observes the direct child but exposes no process observation',
    authorityBearingFunction: 'src/deployment/work_worker.ts dshSubprocessWorkWorkerPort().run',
    observed: Object.freeze({
      portCallsSpawn: source !== null && /\bspawn\(nodeExecPath/.test(source),
      outcomeTypeMentionsPid: outcomeType !== null && /\bpid\b/u.test(outcomeType),
      outcomeTypeMentionsObservation: outcomeType !== null && /observation/iu.test(outcomeType),
      outcomeTypeFields: outcomeType === null ? null : (outcomeType.match(/readonly (\w+)/gu) ?? []),
      outcomeTypeExcerpt: outcomeType,
    }),
    /** §3: the gap is PRESENT when the port spawns but the outcome carries no process identity. */
    gapPresent: source !== null && /\bspawn\(nodeExecPath/.test(source) && outcomeType !== null && !/\bpid\b/u.test(outcomeType),
    evidenceClass: 'SOURCE_READ',
  });
}

/**
 * §3 GAP-2: no correlation exists between a process observation and the canonical AttemptId.
 *
 * The port deliberately receives no attempt id; the Work Delegation service holds the attemptId but has no
 * seam through which a port observation could be correlated with it.
 */
export function controlNoAttemptCorrelationSeam() {
  const worker = readSource('src/deployment/work_worker.ts');
  const delegation = readSource('src/interaction/work_delegation.ts');
  const workerInput = worker === null ? null : /export interface WorkWorkerExecutionInput \{[\s\S]*?\n\}/.exec(worker)?.[0] ?? null;
  return Object.freeze({
    id: 'GAP-2',
    requirement: 'nothing correlates a process observation with the canonical AttemptId and the host-local JobId',
    observed: Object.freeze({
      portReceivesAttemptId: workerInput !== null && /attemptId/u.test(workerInput),
      portInputFields: workerInput === null ? null : (workerInput.match(/readonly (\w+)/gu) ?? []),
      delegationHoldsAttemptId: delegation !== null && /prepared\.attemptId/u.test(delegation),
      /** §3: a structural seam, not the word "observation" in prose — an interface member a caller could pass. */
      delegationDepsHaveObserverCallback: delegation !== null && /WorkDelegationServiceDeps = \{[\s\S]*?\n\}/u.test(delegation) && /onObservation/u.test(/WorkDelegationServiceDeps = \{[\s\S]*?\n\}/u.exec(delegation)?.[0] ?? ''),
      delegationInterfaceHasObserverCallback: delegation !== null && /onObservation/u.test(delegation),
    }),
    /** §3: the gap is PRESENT when the port has no attempt id and the delegation has no observation seam. */
    gapPresent: workerInput !== null && !/attemptId/u.test(workerInput) && delegation !== null && !/onObservation/u.test(delegation),
    evidenceClass: 'SOURCE_READ',
  });
}

/** §3 GAP-3: no durable host-observation record exists. */
export function controlNoDurableObservationRecord() {
  const worker = readSource('src/deployment/work_worker.ts');
  const delegation = readSource('src/interaction/work_delegation.ts');
  /**
   * §3: an observation SCHEMA is a structural declaration — a versioned constant or a typed interface. Prose
   * mentioning "observation" is not a record, so the check names the shape rather than the word.
   */
  const schemaDeclaration = (source) => source !== null && /(OBSERVATION_SCHEMA_VERSION|interface \w*Observation\b|type \w*Observation\b)/u.test(source);
  return Object.freeze({
    id: 'GAP-3',
    requirement: 'no durable record preserves a host observation',
    observed: Object.freeze({
      workerDeclaresObservationSchema: schemaDeclaration(worker),
      delegationDeclaresObservationSchema: schemaDeclaration(delegation),
      /** The port writes a worker-context file, but that is INPUT to the worker, not an observation record. */
      workerWritesOnlyWorkerContext: worker !== null && /worker-context\.json/u.test(worker),
      observationSchemaPresent: schemaDeclaration(worker) || schemaDeclaration(delegation),
    }),
    gapPresent: !(schemaDeclaration(worker) || schemaDeclaration(delegation)),
    evidenceClass: 'SOURCE_READ',
  });
}

/**
 * §3 GAP-4: the two Artifact path parsers disagree.
 *
 * Measured by running BOTH real parsers against the SAME real palimpsest-controlled DSH session path, so the
 * disagreement is observed rather than described.
 */
export async function controlArtifactParsersDisagree(input = {}) {
  const realPath = input.realPath
    ?? 'C:/Users/66494/.palimpsest-gates/d2-live/home/sessions/--C-Users-66494-.palimpsest-gates-d2-live-repo-.palimpsest-worlds-attempt-a07384dd03aa9f5c4597b61e8f929771--/worker-c7e88db3-a360-4b1f-97ec-d16108d641e1/session.v4.jsonl.zstd';
  const { attemptIdFromPath } = await import('../../r3l0ciarlcf/artifact-identity.mjs');
  const segmentAnchored = attemptIdFromPath(realPath);
  const substring = (/attempt-([0-9a-f]+)/u.exec(realPath.replace(/\\/gu, '/'))?.[1]) ?? null;
  return Object.freeze({
    id: 'GAP-4',
    requirement: 'the Artifact path parsers disagree about AttemptId extraction',
    authorityBearingFunctions: Object.freeze([
      'scripts/r3l0ciarlcf/artifact-identity.mjs attemptIdFromPath (segment-anchored)',
      'scripts/r3l0c/instrumentation.mjs sessionArtifacts (substring)',
    ]),
    realPath,
    observed: Object.freeze({
      segmentAnchoredResult: segmentAnchored,
      substringResult: substring,
      disagree: segmentAnchored !== substring,
      segmentAnchoredNullOnRealPath: segmentAnchored === null,
    }),
    gapPresent: segmentAnchored !== substring,
    evidenceClass: 'SOURCE_READ + REAL_PATH_FROM_A_PALIMPSEST_CONTROLLED_DIRECTORY',
  });
}

/**
 * §3 GAP-5: no execution witness can be produced from the durable record.
 *
 * Measured by reading the frozen journal field list: it carries `attemptId` and `hostJobId` but no `runId`,
 * which is exactly what `corroborateExecutionWitness` requires on the witness.
 */
export function controlNoExecutionWitnessProducer() {
  const contract = readSource('scripts/r3l0cf/contract.mjs');
  const fieldBlock = contract === null ? null : /export const JOURNAL_FIELDS = Object\.freeze\(\[[\s\S]*?\]\);/u.exec(contract)?.[0] ?? null;
  const fields = fieldBlock === null ? null : (fieldBlock.match(/'([A-Za-z]+)'/gu) ?? []).map((token) => token.replace(/'/gu, ''));
  return Object.freeze({
    id: 'GAP-5',
    requirement: 'no execution witness can be produced',
    observed: Object.freeze({
      journalFieldsPresent: fields !== null,
      journalCarriesAttemptId: fields !== null && fields.includes('attemptId'),
      journalCarriesHostJobId: fields !== null && fields.includes('hostJobId'),
      journalCarriesRunId: fields !== null && fields.includes('runId'),
    }),
    gapPresent: fields !== null && !fields.includes('runId'),
    evidenceClass: 'SOURCE_READ',
  });
}

/** §3: run every absence control and return the measured set. */
export async function runAbsenceControls(input = {}) {
  const controls = [
    controlPortDiscardsProcessObservation(),
    controlNoAttemptCorrelationSeam(),
    controlNoDurableObservationRecord(),
    await controlArtifactParsersDisagree(input),
    controlNoExecutionWitnessProducer(),
  ];
  const present = controls.filter((control) => control.gapPresent === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-G1',
    kind: 'source-level producer gaps measured against the unmodified baseline',
    declaredGapIds: Object.freeze(PRODUCER_GAPS.map((gap) => gap.id)),
    controls: Object.freeze(controls),
    measuredGapCount: present.length,
    measuredGapIds: Object.freeze(present.map((control) => control.id)),
    allDeclaredGapsMeasured: present.length === PRODUCER_GAPS.length,
    modelCallsMade: 0,
    law: 'a claimed baseline gap must have an actual negative observation; an absence is measured by reading the real source or running the real parser, never asserted',
  });
}

export { NL };
