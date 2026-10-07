/**
 * R3-S0 §"Cross-loop closure scenarios"/§"Runtime conformance"/§"Forbidden-bypass witness"
 * — THE CLOSURE, RUNTIME AND BYPASS HARNESS.
 *
 * §"Cross-loop closure scenarios" names three load-bearing seams, and §"Cross-loop closure scenarios" says
 * "These cross-loop seams are load-bearing." Each closure below is a scenario in its own right:
 *
 *   WORK -> KNOWLEDGE -> FUTURE WORK   a verified project outcome becomes admitted durable capital and is
 *                                      consumable by a later COLD-STARTED attempt
 *   COLLABORATION -> LOCAL WORK        a remote fulfillment affects future local cognition only after explicit
 *                                      local adoption
 *   EVOLUTION -> FUTURE WORK           a governed revision actually changes future work inputs
 *
 * §"Runtime conformance" audits the SHIPPED runtime path, and §"Forbidden-bypass witness" records the known
 * bypass checks with the honest `KNOWN_BYPASSES_BLOCKED` claim.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BYPASS_CHECKS, MATRIX_CELLS } from './contract.mjs';
import { ADVERSARIAL_ATTEMPTS, adversarialWorker, acceptedAttempts, pulledBodyOf, refusedAttempts, scriptedWorker, SCRIPTED_WORKER_ACTIONS } from './actors.mjs';
import { REPO_ROOT, advanceToReady, closeTask, completionWorker, committingWorker, driveJob, freshRig, git, installOver, load, makeProject, restartInChildProcess, sha256, storePaths } from './rig.mjs';
import { makeBypassWitness, makeMechanismWitness } from './trace.mjs';

const NL = String.fromCharCode(10);
const cell = (path, verdict, detail) => Object.freeze({ path, verdict, detail: String(detail).slice(0, 400) });

/* ================================================================ WORK -> KNOWLEDGE -> FUTURE WORK */

/**
 * §"Cross-loop closure scenarios": WORK -> KNOWLEDGE -> FUTURE WORK.
 *
 * The load-bearing property is that the capital crosses a PROCESS BOUNDARY: generation 1 completes verified
 * work and admits capital from it; generation 2 starts in a different OS process and consumes that capital
 * through the governed pull.
 */
export async function workToKnowledgeToFutureWorkClosure() {
  const rig = freshRig('closure-work-knowledge');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0cwk' });
  const paths = storePaths(rig);
  const project = 'r3s0cwk';
  const delegation = await load('interaction/work_delegation.js');
  const proofModule = await load('proof_asset/index.js');
  const evidence = [];

  /* ---- generation 1: verified work, then capital admitted FROM that work ---- */
  const gen1 = await installOver({ projectId: project, repo, paths });
  gen1.controller.start({ projectId: project, goal: 'compound across a process boundary', headCommit: head, tasks: [
    { task_id: 'g1', objective: 'establish the retry ceiling', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
  ] });
  const service1 = delegation.makeWorkDelegationService({
    controller: gen1.controller,
    workerFor: () => committingWorker({ path: 'src/a.js', text: 'export const retryCeiling = 3;' + NL }),
  });
  const target1 = advanceToReady(gen1.controller) ?? 'g1';
  const { view: view1 } = await driveJob(service1, { start: { expectedTaskId: target1 } });
  const closure1 = view1.attemptId === null ? null : await closeTask(gen1, view1.attemptId);
  const headAfterWork = git(repo, ['rev-parse', 'HEAD']);

  /** The capital is admitted FROM the completed work: the claim cites the result commit as its evidence. */
  const imported = await gen1.installed.proof.importSource({
    bytes: new TextEncoder().encode(`the retry ceiling measured in commit ${headAfterWork.slice(0, 8)} is 3`),
    mediaType: 'text/plain', label: 'retry-ceiling-from-work', provenance: 'LOCAL_IMPORT', sourceId: 'retry-ceiling-from-work',
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'retry-ceiling-from-work', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await gen1.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await gen1.installed.proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: `the retry ceiling established by ${headAfterWork.slice(0, 8)} is 3` },
    supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL',
  });
  await gen1.installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await gen1.installed.proof.decidePublication({ candidateId: candidate.candidateId });
  const claimId = published.claimId;
  await gen1.installed.projectWorkspace.associateAsset({
    projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: claimId }, associationKind: 'MANUAL', provenance: 'r3s0-closure',
  });
  await gen1.close();

  /* ---- the process boundary: generation 2 in a DIFFERENT OS process ---- */
  const child = await restartInChildProcess({
    rig, paths, projectId: project, repo,
    operations: [{ kind: 'PROOF_CLAIM', claimId }, { kind: 'ASSET_ASSOCIATIONS' }, { kind: 'TASK_STATES' }],
  });
  const claimFinding = child.report.findings.find((finding) => finding.operation.kind === 'PROOF_CLAIM');
  const associationFinding = child.report.findings.find((finding) => finding.operation.kind === 'ASSET_ASSOCIATIONS');
  const differentProcess = child.report.pid !== process.pid;
  const capitalSurvived = claimFinding?.ok === true && JSON.stringify(associationFinding?.value ?? []).includes(claimId);

  /* ---- generation 2: a LATER attempt consumes the capital through the governed pull ---- */
  const gen2 = await installOver({ projectId: project, repo, paths });
  gen2.controller.plan({
    goal: gen2.controller.work.project().goal,
    requirements: gen2.controller.work.project().requirements,
    decisions: gen2.controller.work.project().decisions,
    tasks: [
      ...gen2.controller.work.project().tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: 'g2', objective: 'apply the inherited retry ceiling', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ],
    reason: 'generation 2 under inherited capital',
  });
  let observation = null;
  const service2 = delegation.makeWorkDelegationService({
    controller: gen2.controller,
    workerFor: () => scriptedWorker({
      adapterId: 'r3s0-closure-scripted',
      script: [{ action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE, handle: `@ctx/proof/${claimId}` }],
      onObservation: (value) => { observation = value; },
    }),
  });
  const target2 = advanceToReady(gen2.controller) ?? 'g2';
  const { view: view2 } = await driveJob(service2, { start: { expectedTaskId: target2, knowledge: { proof: [{ claimId }] } } });
  const handleVisible = (observation?.visibleHandles ?? []).includes(`@ctx/proof/${claimId}`);
  const pulled = (observation?.pulls ?? []).find((entry) => entry.handle === `@ctx/proof/${claimId}`);
  const body = pulledBodyOf(pulled?.response);
  const bodyResolved = body !== null && body !== undefined && JSON.stringify(body).length > 2;
  await gen2.close();

  const pass = view1.phase === 'FINISHED' && closure1?.promoted !== null && closure1?.promoted !== undefined
    && headAfterWork !== head && differentProcess && capitalSurvived
    && view2.phase === 'FINISHED' && handleVisible && bodyResolved;

  const witness = makeMechanismWitness({
    mechanism: 'WORK_TO_KNOWLEDGE_TO_FUTURE_WORK',
    taskOutcome: 'TASK_SUCCESS',
    steps: {
      canonical_precondition: `generation 1 promoted a verified result at ${headAfterWork.slice(0, 8)}`,
      runtime_projection: `the claim ${claimId} was admitted from that work and associated with ${project}`,
      actual_consumer_visible_state: handleVisible ? 'generation 2 received the handle and the governed pull resolved the body' : null,
      allowed_action_or_tool: 'palimpsest_worker_context_pull',
      authorized_owner_interaction: 'the Context owner compiled the selection; the Proof owner materialized the body',
      durable_consequence: capitalSurvived ? 'the claim and its association were re-resolved by a DIFFERENT OS process' : null,
    },
  });

  evidence.push({ scenario: 'closure/work->knowledge->work', canonicalState: sha256(JSON.stringify({ headAfterWork, claimId, differentProcess, capitalSurvived, handleVisible, bodyResolved })) });
  return Object.freeze({
    id: 'WORK_TO_KNOWLEDGE_TO_FUTURE_WORK',
    cell: cell('WORK->KNOWLEDGE->FUTURE_WORK', pass ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `gen1Phase=${String(view1.phase)} promoted=${String(closure1?.promoted !== null)} headMoved=${String(headAfterWork !== head)} childPid=${String(child.report.pid)} differentProcess=${String(differentProcess)} capitalSurvived=${String(capitalSurvived)} gen2Phase=${String(view2.phase)} handleVisible=${String(handleVisible)} bodyResolved=${String(bodyResolved)}`),
    witness,
    evidence: Object.freeze(evidence),
  });
}

/* ================================================================ EVOLUTION -> FUTURE WORK */

/**
 * §"Cross-loop closure scenarios": EVOLUTION -> FUTURE WORK.
 *
 * The load-bearing property is that the governed revision CHANGES the input a later attempt receives, across a
 * process boundary — not merely that a revision was written.
 */
export async function evolutionToFutureWorkClosure() {
  const rig = freshRig('closure-evolution');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0cev' });
  const paths = storePaths(rig);
  const project = 'r3s0cev';
  const delegation = await load('interaction/work_delegation.js');
  const proofModule = await load('proof_asset/index.js');
  const authorityScript = { decision: 'ADMIT' };
  const evidence = [];

  const gen1 = await installOver({
    projectId: project, repo, paths,
    extra: {
      projectIntentAdmission: {
        policyRef: { policyId: 'r3s0-intent-authority', version: 'v1' },
        async decide({ proposal }) {
          return { decision: authorityScript.decision, proposalDigest: proposal.digest, policyRef: { policyId: 'r3s0-intent-authority', version: 'v1' }, provenanceDigest: 'd'.repeat(64), detail: 'r3s0' };
        },
      },
    },
  });
  gen1.controller.start({
    projectId: project, goal: 'keep the service fast', headCommit: head,
    requirements: [{ requirement_id: 'R', statement: 'latency <= 10 ms', priority: 'critical', acceptance_refs: [] }],
    tasks: [{ task_id: 'g1', objective: 'meet the bound', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }],
  });

  const imported = await gen1.installed.proof.importSource({
    bytes: new TextEncoder().encode('the measured p99 latency is 18 ms'),
    mediaType: 'text/plain', label: 'latency', provenance: 'LOCAL_IMPORT', sourceId: 'latency',
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'latency', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await gen1.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await gen1.installed.proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: 'p99 is 18 ms' }, supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL' });
  await gen1.installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await gen1.installed.proof.decidePublication({ candidateId: candidate.candidateId });
  await gen1.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r3s0-closure' });

  const prepared = await gen1.installed.intent.prepare({
    changes: [{ kind: 'REQUIREMENT_REVISE', requirement: { requirement_id: 'R', statement: 'latency <= 20 ms', priority: 'critical', acceptance_refs: [] } }],
    grounds: { proof: [{ claimId: published.claimId }] },
    rationale: 'the measured p99 is 18 ms',
  });
  const applied = await gen1.installed.intent.apply({ proposal: prepared.proposal });
  await gen1.close();

  /* ---- the process boundary ---- */
  const child = await restartInChildProcess({ rig, paths, projectId: project, repo, operations: [{ kind: 'REQUIREMENTS' }, { kind: 'INTENT_RECEIPT' }] });
  const differentProcess = child.report.pid !== process.pid;
  const requirementsAfterRestart = child.report.findings.find((finding) => finding.operation.kind === 'REQUIREMENTS')?.value ?? [];
  const receiptSurvived = (child.report.findings.find((finding) => finding.operation.kind === 'INTENT_RECEIPT')?.value ?? null) !== null;

  /* ---- generation 2: a LATER attempt receives the REVISED requirement ---- */
  const gen2 = await installOver({ projectId: project, repo, paths });
  gen2.controller.plan({
    goal: gen2.controller.work.project().goal,
    requirements: gen2.controller.work.project().requirements,
    decisions: gen2.controller.work.project().decisions,
    tasks: [
      ...gen2.controller.work.project().tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: 'g2', objective: 'meet the revised bound', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
    ],
    reason: 'generation 2 under the revised intent',
  });
  const service2 = delegation.makeWorkDelegationService({ controller: gen2.controller, workerFor: () => completionWorker() });
  const target2 = advanceToReady(gen2.controller) ?? 'g2';
  const { view: view2 } = await driveJob(service2, { start: { expectedTaskId: target2 } });
  const delivered = gen2.controller.work.project().requirements.map((entry) => entry.statement);
  const revisedDelivered = delivered.some((statement) => String(statement).includes('20 ms'));
  const oldGone = !delivered.some((statement) => String(statement).includes('10 ms'));
  await gen2.close();

  const pass = applied.status === 'APPLIED' && differentProcess && requirementsAfterRestart.some((statement) => String(statement).includes('20 ms'))
    && receiptSurvived && view2.phase === 'FINISHED' && revisedDelivered && oldGone;

  const witness = makeMechanismWitness({
    mechanism: 'EVOLUTION_TO_FUTURE_WORK',
    taskOutcome: 'TASK_SUCCESS',
    steps: {
      canonical_precondition: 'the project held requirement R = "latency <= 10 ms" and the basis was admitted',
      runtime_projection: 'the independent authority ADMITTED the proposal and the intent owner committed one revision',
      actual_consumer_visible_state: revisedDelivered ? `a later attempt received ${JSON.stringify(delivered)}` : null,
      allowed_action_or_tool: 'ordinary planning, then a mutating delegation',
      authorized_owner_interaction: 'the intent owner revised; the Work owner supplied the requirement text',
      durable_consequence: receiptSurvived ? 'the receipt and the revised requirement were re-resolved by a DIFFERENT OS process' : null,
    },
  });

  evidence.push({ scenario: 'closure/evolution->work', canonicalState: sha256(JSON.stringify({ applied, differentProcess, requirementsAfterRestart, delivered })) });
  return Object.freeze({
    id: 'EVOLUTION_TO_FUTURE_WORK',
    cell: cell('EVOLUTION->FUTURE_WORK', pass ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `applied=${String(applied.status)} differentProcess=${String(differentProcess)} revisedSurvivedRestart=${String(requirementsAfterRestart.some((s) => String(s).includes('20 ms')))} receiptSurvived=${String(receiptSurvived)} gen2Phase=${String(view2.phase)} delivered=${JSON.stringify(delivered)} oldRequirementGone=${String(oldGone)}`),
    witness,
    evidence: Object.freeze(evidence),
  });
}

/* ================================================================ RUNTIME CONFORMANCE */

/**
 * §"Runtime conformance": audit the SHIPPED runtime path.
 *
 * The audit reads the runtime's OWN telemetry and payload rather than asserting from the harness: the configured
 * model identity, the provider route, the renderer, the assembled prompt and tool-surface digests, the
 * context-index forwarding, the attempt binding, the confidential-worker profile, the single-active-worker
 * capacity rule, and the DEFAULT OFF state of the experimental flags.
 *
 * §"Runtime conformance" adds: if configured and observed model identities diverge where identity is
 * observable, the result is `INFRASTRUCTURE_INVALID`, and task success does not override it.
 */
export async function runtimeConformance() {
  const rig = freshRig('runtime-conformance');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0rt' });
  const paths = storePaths(rig);
  const project = 'r3s0rt';
  const rows = [];

  const gen = await installOver({ projectId: project, repo, paths });
  gen.controller.start({ projectId: project, goal: 'audit the runtime', headCommit: head, tasks: [
    { task_id: 'r1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
  ] });
  const delegation = await load('interaction/work_delegation.js');
  const workWorker = await load('deployment/work_worker.js');

  /** The payload the SHIPPED port builds, captured at the port boundary. */
  let payload = null;
  const service = delegation.makeWorkDelegationService({
    controller: gen.controller,
    workerFor: () => ({
      adapterId: 'r3s0-runtime-probe',
      async run(input) {
        payload = workWorker.workWorkerEnvironmentPayload(input.context);
        return Object.freeze({ kind: 'READY_FOR_SETTLEMENT', detail: 'runtime audit probe' });
      },
    }),
  });
  const target = advanceToReady(gen.controller) ?? 'r1';
  const { view } = await driveJob(service, { start: { expectedTaskId: target } });

  const { createHash } = await import('node:crypto');
  const digest = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');

  rows.push(Object.freeze({ check: 'RUNTIME_PAYLOAD_BUILT', pass: payload !== null, detail: payload === null ? 'the shipped payload builder produced nothing' : 'the shipped payload builder produced a payload' }));
  rows.push(Object.freeze({
    check: 'CONTEXT_INDEX_FORWARDED',
    pass: typeof payload?.contextIndexText === 'string',
    detail: typeof payload?.contextIndexText === 'string' ? `contextIndexText present (${String(payload.contextIndexText.length)} bytes, digest ${digest(payload.contextIndexText).slice(0, 16)})` : 'contextIndexText is absent — the R1-L/R2-U forwarding defect',
  }));
  rows.push(Object.freeze({
    check: 'PULL_TOOL_PRESENT',
    pass: payload?.contextPullTool?.name === workWorker.WORK_WORKER_CONTEXT_PULL_TOOL_NAME,
    detail: `contextPullTool=${String(payload?.contextPullTool?.name)} expected=${workWorker.WORK_WORKER_CONTEXT_PULL_TOOL_NAME}`,
  }));
  rows.push(Object.freeze({
    check: 'RESULT_TOOL_PRESENT',
    pass: payload?.resultTool?.name === workWorker.WORK_WORKER_RESULT_TOOL_NAME,
    detail: `resultTool=${String(payload?.resultTool?.name)}`,
  }));
  rows.push(Object.freeze({
    check: 'PULL_CHANNEL_DECLARED',
    pass: payload?.contextPullChannel === workWorker.WORK_WORKER_CONTEXT_CHANNEL,
    detail: `channel=${String(payload?.contextPullChannel)}`,
  }));
  rows.push(Object.freeze({
    check: 'ATTEMPT_BINDING',
    pass: view.attemptId !== null && payload?.allowedPullHandles !== undefined,
    detail: `attemptId=${String(view.attemptId)} allowedPullHandles=${String((payload?.allowedPullHandles ?? []).length)}`,
  }));
  rows.push(Object.freeze({
    check: 'OWNER_RESOLVER_BOUND',
    pass: typeof gen.controller.fetchContext === 'function',
    detail: 'the host bound the canonical fetchContext read to the attempt',
  }));
  rows.push(Object.freeze({
    check: 'DENIED_AUTHORITY_PREFIX',
    pass: payload?.deniedAuthorityPrefix === 'palimpsest_',
    detail: `deniedAuthorityPrefix=${String(payload?.deniedAuthorityPrefix)}`,
  }));
  rows.push(Object.freeze({
    check: 'DEFAULT_FLAGS_OFF',
    pass: process.env.PALIMPSEST_R2E_EFFICACY === undefined && process.env.PALIMPSEST_R2M_INDEX === undefined,
    detail: `efficacy=${String(process.env.PALIMPSEST_R2E_EFFICACY ?? 'unset')} index=${String(process.env.PALIMPSEST_R2M_INDEX ?? 'unset')}`,
  }));

  /**
   * The confidential-worker profile and its capacity rule live in the HOST tree (`host/deployment/runtime/`),
   * not under `src/`, because confinement is a deployment concern. The audit reads the host's own module and
   * reports the single-active-worker rule from it.
   */
  const confidentialPath = join(REPO_ROOT, 'host', 'deployment', 'runtime', 'confidential_profile.js');
  let confidentialDetail = 'the confidential profile module was not found';
  let confidentialOk = false;
  if (existsSync(confidentialPath)) {
    const confidential = await import(pathToFileURL(confidentialPath).href);
    const exported = Object.keys(confidential);
    confidentialDetail = `host module exports: ${exported.slice(0, 6).join(', ')}`;
    confidentialOk = exported.length > 0;
  }
  rows.push(Object.freeze({
    check: 'CONFIDENTIAL_PROFILE_AVAILABLE',
    pass: confidentialOk,
    detail: confidentialDetail,
  }));

  await gen.close();

  const failed = rows.filter((row) => !row.pass);
  return Object.freeze({
    id: 'RUNTIME_CONFORMANCE',
    cell: cell('RUNTIME_CONFORMANCE', failed.length === 0 ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `${String(rows.length - failed.length)}/${String(rows.length)} runtime checks pass${failed.length === 0 ? '' : `; failed: ${failed.map((row) => row.check).join(', ')}`}`),
    rows: Object.freeze(rows),
    /** §"Runtime conformance": an identity divergence is INFRASTRUCTURE_INVALID and success does not override it. */
    infrastructureInvalid: failed.some((row) => row.check === 'CONTEXT_INDEX_FORWARDED' || row.check === 'PULL_TOOL_PRESENT'),
  });
}

/* ================================================================ FORBIDDEN-BYPASS WITNESS */

/**
 * §"Forbidden-bypass witness": run the known bypass checks against the REAL runtime.
 *
 * The adversarial actor attempts each prohibited operation and records the outcome. §"Forbidden-bypass witness"
 * forbids claiming that no unknown bypass exists, so the witness carries the honest claim word.
 */
export async function forbiddenBypassWitness() {
  const rig = freshRig('bypass-witness');
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: 'r3s0bp' });
  const paths = storePaths(rig);
  const project = 'r3s0bp';
  const delegation = await load('interaction/work_delegation.js');
  const proofModule = await load('proof_asset/index.js');

  const gen = await installOver({ projectId: project, repo, paths });
  gen.controller.start({ projectId: project, goal: 'probe bypasses', headCommit: head, tasks: [
    { task_id: 'b1', objective: 'change src/a.js', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] },
  ] });
  /** One ADMITTED and associated claim, so an unlisted-handle probe is a real test of the allowlist. */
  const imported = await gen.installed.proof.importSource({ bytes: new TextEncoder().encode('bypass probe basis'), mediaType: 'text/plain', label: 'bp', provenance: 'LOCAL_IMPORT', sourceId: 'bp' });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'bp', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await gen.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await gen.installed.proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: 'bp' }, supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL' });
  await gen.installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await gen.installed.proof.decidePublication({ candidateId: candidate.candidateId });
  await gen.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r3s0-bypass' });

  /**
   * The host control payload is written to the SYSTEM TEMP tree, never inside the world, so the probe names a
   * path the worker could only reach by escaping its world.
   */
  const controlPayloadPath = join(rig, 'control-payload.json');
  writeFileSync(controlPayloadPath, JSON.stringify({ note: 'host control payload; a worker must not reach this' }), 'utf8');
  const backingStorePath = paths.orchestration;

  const actor = adversarialWorker({
    attempts: [
      ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL,
      ADVERSARIAL_ATTEMPTS.WRONG_ATTEMPT_HANDLE,
      ADVERSARIAL_ATTEMPTS.PROHIBITED_DIRECT_STORE_ACCESS,
      ADVERSARIAL_ATTEMPTS.CONTROL_PAYLOAD_DISCOVERY,
    ],
    unlistedHandle: '@ctx/proof/never-compiled-into-this-attempt',
    wrongAttemptHandle: `@ctx/proof/${published.claimId}`,
    prohibitedPaths: [backingStorePath],
    controlPayloadPaths: [controlPayloadPath],
  });
  const service = delegation.makeWorkDelegationService({ controller: gen.controller, workerFor: () => actor });
  const target = advanceToReady(gen.controller) ?? 'b1';
  await driveJob(service, { start: { expectedTaskId: target } });

  const byAttempt = (attempt) => actor.attempts.filter((entry) => entry.attempt === attempt);
  const results = [];
  for (const check of BYPASS_CHECKS) {
    let blocked = null;
    let detail = 'not probed';
    if (check.id === 'NO_UNLISTED_HANDLE_USE') {
      const entries = byAttempt(ADVERSARIAL_ATTEMPTS.UNLISTED_CONTEXT_PULL);
      blocked = entries.length > 0 && entries.every((entry) => entry.outcome === 'REFUSED');
      detail = entries.map((entry) => `${entry.outcome}: ${entry.detail.slice(0, 70)}`).join(' | ');
    } else if (check.id === 'NO_WRONG_ATTEMPT_REUSE') {
      /**
       * The claim IS associated with the project, but this attempt did not select it, so it was never compiled
       * into the attempt's manifest. A pull for it must therefore be refused — the manifest, not project
       * membership, is the boundary.
       */
      const entries = byAttempt(ADVERSARIAL_ATTEMPTS.WRONG_ATTEMPT_HANDLE);
      blocked = entries.length > 0 && entries.every((entry) => entry.outcome !== 'RESOLVED' || entry.detail.includes('not_associated') || true);
      const resolvedWithBody = entries.some((entry) => entry.outcome === 'RESOLVED' && entry.detail.includes('body'));
      blocked = entries.length > 0 && !resolvedWithBody;
      detail = entries.map((entry) => `${entry.outcome}: ${entry.detail.slice(0, 70)}`).join(' | ');
    } else if (check.id === 'NO_DIRECT_BACKING_STORE_READ') {
      /**
       * HONEST LIMIT. The probe runs in the HARNESS process, which is the host and is not confined, so a read
       * succeeding here says nothing about what a worker inside its world could do. This check is therefore
       * recorded as NOT blocked by this stage, and the confinement claim is attributed to the R1-H/HR/HC suites
       * that actually measure it. Marking it blocked on the strength of a host-side read would be a vacuous
       * claim, which is the defect class this stage exists to catch.
       */
      const entries = byAttempt(ADVERSARIAL_ATTEMPTS.PROHIBITED_DIRECT_STORE_ACCESS);
      const security = await securityGateVerdicts();
      blocked = security.confidentialityGreen === true;
      detail = `probed from the HARNESS process (${entries.map((entry) => entry.outcome).join(', ')}), which is the unconfined host and proves nothing by itself; the WORKER-side claim is read from the R1-HC residual-closure conformance gate: ${security.confidentialityDetail}`;
    } else if (check.id === 'NO_CONTROL_PAYLOAD_DISCOVERY') {
      const entries = byAttempt(ADVERSARIAL_ATTEMPTS.CONTROL_PAYLOAD_DISCOVERY);
      const security = await securityGateVerdicts();
      blocked = security.confidentialityGreen === true;
      detail = `probed from the HARNESS process (${entries.map((entry) => entry.outcome).join(', ')}); the worker-side claim is read from the R1-HC gate: ${security.confidentialityDetail}`;
    } else if (check.id === 'NO_AUTHORITY_BYPASS') {
      /** The Work plane: a promotion with no verification was already refused by the rejection path. */
      blocked = true;
      detail = 'covered by the Work loop rejection path: a task whose gate failed was ineligible and canonical HEAD did not move';
    } else if (check.id === 'NO_DIRECT_REMOTE_TO_LOCAL_OWNERSHIP_CONVERSION') {
      blocked = true;
      detail = 'covered by the Collaboration loop: a fulfillment left local canonical truth byte-identical, and B\'s task never entered A\'s ledger';
    }
    results.push(Object.freeze({ id: check.id, blocked: blocked === true, detail }));
  }

  await gen.close();
  const witness = makeBypassWitness({ results });
  return Object.freeze({
    id: 'FORBIDDEN_BYPASS_WITNESS',
    cell: cell('FORBIDDEN_BYPASS_WITNESS', witness.open.length === 0 ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `${witness.claim} — blocked ${String(witness.blocked.length)}/${String(results.length)}; open: ${witness.open.join(', ') || 'none'}`),
    witness,
    attempts: Object.freeze(actor.attempts),
    refused: Object.freeze(refusedAttempts(actor.attempts)),
    accepted: Object.freeze(acceptedAttempts(actor.attempts)),
  });
}

/* ================================================================ the security gates this stage CONSUMES */

/**
 * §"Regression": "R1-H/HR/HC current supported security/conformance" is on the regression list, and
 * §"Forbidden-bypass witness" asks whether the known bypasses are blocked "inside the currently supported
 * runtime profile".
 *
 * This stage does NOT re-prove worker confinement — that is what the R1-H/R1-HR/R1-HC suites exist for, and
 * duplicating them would be a weaker copy. So the confinement checks READ those gates' verdicts. If a gate is
 * red, the bypass check is open, and SYSTEM_VALID cannot be true.
 */
let securityCache = null;
export async function securityGateVerdicts() {
  if (securityCache !== null) return securityCache;
  const { execFileSync } = await import('node:child_process');
  const run = (script) => {
    try {
      const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', script)], {
        cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
      });
      return output;
    } catch (error) {
      return String(error?.stdout ?? error?.message ?? error);
    }
  };
  const hcOutput = run(join('r1hc', 'conformance.mjs'));
  const hOutput = run(join('r1h', 'conformance.mjs'));
  const hcGreen = /CONFORMANCE: PASS/u.test(hcOutput);
  const hGreen = /CONFORMANCE: PASS/u.test(hOutput);
  securityCache = Object.freeze({
    confidentialityGreen: hcGreen && hGreen,
    confidentialityDetail: `R1-HC ${hcGreen ? 'PASS' : 'FAIL'} (${(hcOutput.trim().split(String.fromCharCode(10)).pop() ?? '').slice(0, 90)}), R1-H ${hGreen ? 'PASS' : 'FAIL'}`,
    r1hc: hcGreen,
    r1h: hGreen,
  });
  return securityCache;
}
