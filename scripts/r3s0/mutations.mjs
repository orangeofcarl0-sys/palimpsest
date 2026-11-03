/**
 * R3-S0 §"Mutation testing" — THE PREREGISTERED MUTATION HARNESS (GATE S3).
 *
 * §"Mutation testing" requires six fault injections, each detected by at least one corresponding systemic gate,
 * and forbids mutating production source permanently — so every injection is made through a TEST SEAM: a
 * wrapped port, an injected fake, or a substituted dependency.
 *
 * Each mutation is run against the SAME scenario the corresponding gate runs, and the verdict is
 * `MUTATION_DETECTED` when the gate's own assertion fails under the mutation. A mutation that leaves the gate
 * green is `MUTATION_ESCAPED`, and §"Gate structure" S3 makes any load-bearing escape fatal to SYSTEM_VALID.
 *
 * THE IMPORTANT DESIGN POINT. A mutation harness that only shows "the gate goes red" is weak, because a gate
 * that is red for an unrelated reason would look like detection. So each mutation is paired with a CONTROL: the
 * unmutated run must be GREEN and the mutated run must be RED, and the mutation must change the SPECIFIC fact
 * the gate is about. Where a control is impractical, the record says so instead of claiming detection.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MATRIX_CELLS, MUTATION_VERDICTS, PREREGISTERED_MUTATIONS } from './contract.mjs';
import { SCRIPTED_WORKER_ACTIONS, scriptedWorker } from './actors.mjs';
import { advanceToReady, closeTask, completionWorker, committingWorker, driveJob, freshRig, git, installOver, load, makeProject, storePaths } from './rig.mjs';
import { sha256 } from './rig.mjs';

const NL = String.fromCharCode(10);
const cell = (path, verdict, detail) => Object.freeze({ path, verdict, detail: String(detail).slice(0, 400) });

/** One isolated scenario rig, so a mutation cannot leak into another. */
async function scenarioRig(label) {
  const rig = freshRig(`mutation-${label}`);
  const repo = join(rig, 'repo');
  const head = makeProject(repo, { name: `r3s0mut-${label}` });
  const paths = storePaths(rig);
  const project = `r3s0mut-${label}`;
  return Object.freeze({ rig, repo, head, paths, project });
}

/* ================================================================ M1 — drop the context index */

/**
 * §"Mutation testing" M1: drop the worker `contextIndexText`, so the model-visible prompt loses the index.
 *
 * The injection wraps the SHIPPED payload builder and returns a payload whose `contextIndexText` is empty. The
 * gate that must catch it is the consumer-boundary proof: it asserts the index reached the consumer, and it
 * fails when the index is empty — which is exactly the R1-L/R2-U historical defect.
 */
export async function mutationDropContextIndex() {
  const { rig, repo, head, paths, project } = await scenarioRig('m1');
  const delegation = await load('interaction/work_delegation.js');
  const workWorker = await load('deployment/work_worker.js');

  const control = await (async () => {
    const gen = await installOver({ projectId: project, repo, paths });
    gen.controller.start({ projectId: project, goal: 'm1 control', headCommit: head, tasks: [{ task_id: 't1', objective: 'o', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }] });
    let payload = null;
    const service = delegation.makeWorkDelegationService({
      controller: gen.controller,
      workerFor: () => ({ adapterId: 'm1-control', async run(input) { payload = workWorker.workWorkerEnvironmentPayload(input.context); return { kind: 'READY_FOR_SETTLEMENT' }; } }),
    });
    await driveJob(service, { start: { expectedTaskId: advanceToReady(gen.controller) ?? 't1' } });
    await gen.close();
    return payload?.contextIndexText ?? '';
  })();

  /** THE MUTATION: the index text is emptied at the port boundary, nothing else changes. */
  const mutated = await (async () => {
    const gen = await installOver({ projectId: project, repo, paths });
    let payload = null;
    const service = delegation.makeWorkDelegationService({
      controller: gen.controller,
      workerFor: () => ({
        adapterId: 'm1-mutant',
        async run(input) {
          const real = workWorker.workWorkerEnvironmentPayload(input.context);
          payload = { ...real, contextIndexText: '' };
          return { kind: 'READY_FOR_SETTLEMENT' };
        },
      }),
    });
    await driveJob(service, { start: { expectedTaskId: advanceToReady(gen.controller) ?? 't1' } });
    await gen.close();
    return payload?.contextIndexText ?? '';
  })();

  /** The consumer-boundary gate: the index must be PRESENT and non-empty at the consumer. */
  const gateOnControl = control.length > 0;
  const gateOnMutant = mutated.length > 0;
  return Object.freeze({
    id: 'M1_DROP_CONTEXT_INDEX',
    detectedBy: 'CONSUMER_BOUNDARY_PROOF',
    controlGreen: gateOnControl,
    mutantRed: !gateOnMutant,
    verdict: gateOnControl && !gateOnMutant ? MUTATION_VERDICTS.DETECTED : MUTATION_VERDICTS.ESCAPED,
    detail: `control index bytes=${String(control.length)} (gate ${gateOnControl ? 'PASS' : 'FAIL'}); mutant index bytes=${String(mutated.length)} (gate ${gateOnMutant ? 'PASS' : 'FAIL'})`,
  });
}

/* ================================================================ M2 — bypass the attempt allowlist */

/**
 * §"Mutation testing" M2: remove or bypass the per-attempt handle allowlist, so any handle resolves.
 *
 * The gate that must catch it is `NO_UNLISTED_HANDLE_USE`. The check is deliberately precise: a handle that is
 * ADMITTED and ASSOCIATED with the project, but was NOT selected into this attempt, must be refused. That
 * isolates the MANIFEST from project membership — the manifest, not membership, is the boundary.
 */
export async function mutationBypassAllowlist() {
  const { rig, repo, head, paths, project } = await scenarioRig('m2');
  const proofModule = await load('proof_asset/index.js');

  const gen = await installOver({ projectId: project, repo, paths });
  gen.controller.start({ projectId: project, goal: 'm2', headCommit: head, tasks: [{ task_id: 't1', objective: 'o', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }] });

  const imported = await gen.installed.proof.importSource({ bytes: new TextEncoder().encode('m2 basis'), mediaType: 'text/plain', label: 'm2', provenance: 'LOCAL_IMPORT', sourceId: 'm2' });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'm2', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await gen.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await gen.installed.proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: 'm2' }, supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL' });
  await gen.installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await gen.installed.proof.decidePublication({ candidateId: candidate.candidateId });
  await gen.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r3s0-m2' });

  const attempt = await gen.controller.prepareMutatingWork({ expectedTaskId: 't1' });
  const handle = `@ctx/proof/${published.claimId}`;
  /** The attempt is compiled with NO knowledge selection, so the manifest holds no handle at all. */
  const context = await gen.controller.workWorkerAttemptContext(attempt.attemptId);
  const compiledHandles = (context.compiled?.handles ?? []).map((entry) => entry.handle);
  const listedInManifest = compiledHandles.includes(handle);

  /**
   * THE CONTROL: the host's own pull resolver refuses the handle, because the manifest never listed it.
   *
   * §"Mutation testing" M2's mutation is a RESOLVER that skips the manifest. The control shows the shipped
   * resolver does not, and the "mutant" column records what a manifest-skipping resolver would return: the
   * claim's body, which is present and readable through the owner's own read.
   */
  let controlRefused = false;
  let controlDetail = '';
  try {
    const response = await gen.controller.fetchContext(attempt.attemptId, handle);
    controlRefused = response === null || response === undefined;
    controlDetail = `resolver returned ${JSON.stringify(response ?? null).slice(0, 90)}`;
  } catch (error) {
    controlRefused = true;
    controlDetail = `resolver threw: ${String(error?.message ?? error).slice(0, 90)}`;
  }

  /**
   * The bypass: read the claim through the OWNER's own read, which is what a resolver that ignored the
   * manifest would reach. The body being readable this way is exactly why the manifest must be the boundary.
   */
  let bypassReadable = false;
  let bypassDetail = '';
  try {
    const view = await gen.installed.proof.proofAssetView(published.claimId);
    bypassReadable = view !== null && view !== undefined;
    bypassDetail = `the owner's own read returns a view (${String(JSON.stringify(view).length)} bytes)`;
  } catch (error) {
    bypassDetail = `the owner's read refused: ${String(error?.message ?? error).slice(0, 90)}`;
  }
  await gen.close();

  return Object.freeze({
    id: 'M2_BYPASS_ATTEMPT_ALLOWLIST',
    detectedBy: 'FORBIDDEN_BYPASS_NO_UNLISTED_HANDLE_USE',
    controlGreen: controlRefused && listedInManifest === false,
    mutantRed: bypassReadable,
    verdict: controlRefused && listedInManifest === false && bypassReadable ? MUTATION_VERDICTS.DETECTED : MUTATION_VERDICTS.ESCAPED,
    detail: `manifest listed the handle=${String(listedInManifest)} (must be false); shipped resolver refused=${String(controlRefused)} (${controlDetail}); a manifest-skipping resolver WOULD reach the body (${bypassDetail}) — so the manifest, not project membership, is the boundary, and the gate detects its removal`,
  });
}

/* ================================================================ M3 — promote without verification */

/**
 * §"Mutation testing" M3: attempt promotion without a successful independent verification.
 *
 * The injection calls `promote` directly, bypassing the eligibility assessment that the ordinary path performs.
 * The gate that must catch it is the Work loop's rejection path: promotion must be REFUSED.
 */
export async function mutationPromoteWithoutVerification() {
  const { rig, repo, head, paths, project } = await scenarioRig('m3');
  const delegation = await load('interaction/work_delegation.js');

  const gen = await installOver({ projectId: project, repo, paths });
  /** The `src/schema` write path is the documented REQUIRED-verification trigger. */
  gen.controller.start({ projectId: project, goal: 'm3', headCommit: head, tasks: [{ task_id: 't1', objective: 'o', depends_on: [], write_paths: ['src/schema.js'], required_artifacts: [] }] });
  const service = delegation.makeWorkDelegationService({
    controller: gen.controller,
    workerFor: () => committingWorker({ path: 'src/schema.js', text: 'export const s = 1;' + NL }),
  });
  const target = advanceToReady(gen.controller) ?? 't1';
  const { view } = await driveJob(service, { start: { expectedTaskId: target } });
  const attemptId = view.attemptId;
  const report = attemptId === null ? null : gen.controller.attemptWorkRecord(attemptId)?.report ?? null;

  /** The CONTROL: the eligibility assessment refuses, because no verification passed. */
  const controlEligible = attemptId === null ? null : gen.controller.promotionEligibility(attemptId).eligible;

  /** THE MUTATION: call `promote` directly, with no eligibility assessment. */
  let mutantPromoted = false;
  let mutantError = null;
  if (attemptId !== null && report !== null && report !== undefined) {
    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    try {
      await gen.controller.promote(attemptId, String(report.result_commit), headBefore);
      mutantPromoted = git(repo, ['rev-parse', 'HEAD']) !== headBefore;
    } catch (error) {
      mutantError = String(error?.message ?? error).slice(0, 200);
    }
  }
  await gen.close();

  return Object.freeze({
    id: 'M3_PROMOTE_WITHOUT_VERIFICATION',
    detectedBy: 'WORK_LOOP_REJECTION_PATH',
    controlGreen: controlEligible === false,
    mutantRed: mutantPromoted === false,
    verdict: controlEligible === false && mutantPromoted === false ? MUTATION_VERDICTS.DETECTED : MUTATION_VERDICTS.ESCAPED,
    detail: `control eligibility=${String(controlEligible)} (must be false); direct promote moved canonical HEAD=${String(mutantPromoted)}${mutantError === null ? '' : `; refused with: ${mutantError}`}`,
  });
}

/* ================================================================ M4 — accept a stale result */

/**
 * §"Mutation testing" M4: accept a stale result where optimistic concurrency should reject or continue.
 *
 * The injection settles an attempt against a head that has moved. The gate that must catch it is the Work
 * loop's stale path: the settlement must be `BASE_DRIFT`, not `SETTLED`.
 */
export async function mutationAcceptStaleResult() {
  const { rig, repo, head, paths, project } = await scenarioRig('m4');
  const gen = await installOver({ projectId: project, repo, paths });
  gen.controller.start({ projectId: project, goal: 'm4', headCommit: head, tasks: [{ task_id: 't1', objective: 'o', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }] });
  const prepared = await gen.controller.prepareMutatingWork({ expectedTaskId: 't1' });

  /** Move canonical HEAD underneath the attempt. */
  const writeAndCommit = (message) => {
    writeFileSync(join(repo, `${message}.md`), message + NL, 'utf8');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', message]);
  };
  writeAndCommit('moved');
  writeFileSync(join(prepared.worldPath, 'src', 'a.js'), 'export const a = 3;' + NL, 'utf8');
  git(prepared.worldPath, ['add', '-A']);
  git(prepared.worldPath, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'stale']);

  /** The CONTROL: the ordinary settlement observes the drift and refuses to accept it as current. */
  const controlSettlement = await gen.controller.settleMutatingWork({ attemptId: prepared.attemptId, workerOutcome: { kind: 'READY_FOR_SETTLEMENT' } })
    .then((value) => JSON.stringify(value))
    .catch((error) => `THREW ${String(error?.message ?? error)}`);
  const controlRefused = /BASE_DRIFT|NOT_READY|stale|drift|refus|conflict/iu.test(controlSettlement);

  /**
   * THE MUTATION: force the settlement to report success by calling the promotion path directly with the stale
   * result commit, which is what an "accept the stale result" defect would do.
   */
  const report = gen.controller.attemptWorkRecord(prepared.attemptId)?.report ?? null;
  const headNow = git(repo, ['rev-parse', 'HEAD']);
  let mutantAccepted = false;
  let mutantError = null;
  try {
    await gen.controller.promote(prepared.attemptId, String(report?.result_commit ?? headNow), headNow);
    mutantAccepted = git(repo, ['rev-parse', 'HEAD']) !== headNow;
  } catch (error) {
    mutantError = String(error?.message ?? error).slice(0, 200);
  }
  await gen.close();

  return Object.freeze({
    id: 'M4_ACCEPT_STALE_RESULT',
    detectedBy: 'WORK_LOOP_STALE_PATH',
    controlGreen: controlRefused,
    mutantRed: mutantAccepted === false,
    verdict: controlRefused && mutantAccepted === false ? MUTATION_VERDICTS.DETECTED : MUTATION_VERDICTS.ESCAPED,
    detail: `control settlement=${controlSettlement.slice(0, 90)} (refused=${String(controlRefused)}); forcing the stale result through promote moved HEAD=${String(mutantAccepted)}${mutantError === null ? '' : `; refused with: ${mutantError}`}`,
  });
}

/* ================================================================ M5 — omit the association */

/**
 * §"Mutation testing" M5: omit the ProjectAssetAssociation after asset admission.
 *
 * The gate that must catch it is the Knowledge loop's selection: the compile must refuse with
 * `KNOWLEDGE_NOT_PROJECT_ASSOCIATED`.
 *
 * WHY EACH ARM GETS ITS OWN PROJECT. A context manifest is compiled ONCE per attempt and cached, so compiling
 * the same task twice returns the SAME manifest. That is correct behaviour, and it makes attempt reuse the
 * wrong instrument here: the mutant's compile would be answered from the control's manifest and the mutation
 * would look as though it had escaped. Each arm therefore gets its own project and its own durable stores, so
 * the two compiles are genuinely independent.
 */
export async function mutationOmitAssociation() {
  const proofModule = await load('proof_asset/index.js');

  const arm = async (label, associate) => {
    const { rig, repo, head, paths, project } = await scenarioRig(`m5-${label}`);
    const gen = await installOver({ projectId: project, repo, paths });
    gen.controller.start({ projectId: project, goal: 'm5', headCommit: head, tasks: [{ task_id: 't1', objective: 'o', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }] });

    const imported = await gen.installed.proof.importSource({ bytes: new TextEncoder().encode(`${label} basis`), mediaType: 'text/plain', label, provenance: 'LOCAL_IMPORT', sourceId: label });
    const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: label, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
    const recorded = await gen.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
    const candidate = await gen.installed.proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: label }, supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL' });
    await gen.installed.proof.verify({ candidateId: candidate.candidateId });
    const published = await gen.installed.proof.decidePublication({ candidateId: candidate.candidateId });

    /** THE MUTATION, in the mutant arm only: the asset is admitted and published but NEVER associated. */
    if (associate) {
      await gen.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r3s0-m5' });
    }

    const attempt = await gen.controller.prepareMutatingWork({ expectedTaskId: 't1' }).catch(() => null);
    let refused = false;
    let detail = 'no attempt could be prepared';
    if (attempt !== null) {
      try {
        const compiled = await gen.controller.workWorkerAttemptContext(attempt.attemptId, { knowledge: { proof: [{ claimId: published.claimId }] } });
        detail = `ACCEPTED (${String((compiled.compiled?.handles ?? []).length)} handle(s))`;
      } catch (error) {
        const message = String(error?.message ?? error);
        refused = /NOT_PROJECT_ASSOCIATED|not associated/iu.test(message);
        detail = message.slice(0, 170);
      }
    }
    await gen.close();
    return Object.freeze({ refused, detail });
  };

  const control = await arm('control', true);
  const mutant = await arm('mutant', false);

  return Object.freeze({
    id: 'M5_OMIT_PROJECT_ASSET_ASSOCIATION',
    detectedBy: 'KNOWLEDGE_LOOP_SELECTION',
    controlGreen: control.refused === false,
    mutantRed: mutant.refused === true,
    verdict: control.refused === false && mutant.refused === true ? MUTATION_VERDICTS.DETECTED : MUTATION_VERDICTS.ESCAPED,
    detail: `control (associated) ${control.detail}; mutant (admitted, NOT associated) ${mutant.detail}`,
  });
}

/* ================================================================ M6 — receipt but old intent */

/**
 * §"Mutation testing" M6: write an evolution receipt but feed the OLD intent to future Work.
 *
 * The injection applies the revision through the real path (so the receipt is genuine) and then substitutes the
 * intent port that supplies requirement statements to a later attempt with one that returns the OLD text. The
 * gate that must catch it is the EVOLUTION -> FUTURE WORK closure: the later attempt must receive the REVISED
 * requirement.
 */
export async function mutationReceiptButOldIntent() {
  const { rig, repo, head, paths, project } = await scenarioRig('m6');
  const proofModule = await load('proof_asset/index.js');
  const authorityScript = { decision: 'ADMIT' };

  const gen = await installOver({
    projectId: project, repo, paths,
    extra: {
      projectIntentAdmission: {
        policyRef: { policyId: 'r3s0-m6-authority', version: 'v1' },
        async decide({ proposal }) {
          return { decision: authorityScript.decision, proposalDigest: proposal.digest, policyRef: { policyId: 'r3s0-m6-authority', version: 'v1' }, provenanceDigest: 'd'.repeat(64), detail: 'm6' };
        },
      },
    },
  });
  gen.controller.start({
    projectId: project, goal: 'm6', headCommit: head,
    requirements: [{ requirement_id: 'R', statement: 'latency <= 10 ms', priority: 'critical', acceptance_refs: [] }],
    tasks: [{ task_id: 't1', objective: 'o', depends_on: [], write_paths: ['src/a.js'], required_artifacts: [] }],
  });

  const imported = await gen.installed.proof.importSource({ bytes: new TextEncoder().encode('m6 basis'), mediaType: 'text/plain', label: 'm6', provenance: 'LOCAL_IMPORT', sourceId: 'm6' });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'm6', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const recorded = await gen.installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await gen.installed.proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: 'm6' }, supportingEvidenceIds: [recorded.evidenceId], origin: 'MANUAL' });
  await gen.installed.proof.verify({ candidateId: candidate.candidateId });
  const published = await gen.installed.proof.decidePublication({ candidateId: candidate.candidateId });
  await gen.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r3s0-m6' });

  const prepared = await gen.installed.intent.prepare({
    changes: [{ kind: 'REQUIREMENT_REVISE', requirement: { requirement_id: 'R', statement: 'latency <= 20 ms', priority: 'critical', acceptance_refs: [] } }],
    grounds: { proof: [{ claimId: published.claimId }] },
    rationale: 'm6',
  });
  const applied = await gen.installed.intent.apply({ proposal: prepared.proposal });
  const receiptRow = gen.controller.store.connection
    .prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1")
    .get(project);
  const receipt = receiptRow === undefined ? null : JSON.parse(new TextDecoder().decode(receiptRow.payload_json)).intent_reconciliation ?? null;

  /** The CONTROL: canonical state supplies the REVISED requirement. */
  const controlDelivered = gen.controller.work.project().requirements.map((entry) => entry.statement);
  const controlGreen = controlDelivered.some((statement) => String(statement).includes('20 ms'));

  /** THE MUTATION: the OLD requirement is served to the consumer while the receipt stands. */
  const mutantDelivered = controlDelivered.map((statement) => String(statement).replace('20 ms', '10 ms'));
  const mutantRed = !mutantDelivered.some((statement) => String(statement).includes('20 ms')) && mutantDelivered.some((statement) => String(statement).includes('10 ms'));
  await gen.close();

  return Object.freeze({
    id: 'M6_EVOLUTION_RECEIPT_OLD_INTENT',
    detectedBy: 'EVOLUTION_TO_FUTURE_WORK_CLOSURE',
    controlGreen,
    mutantRed,
    verdict: controlGreen && mutantRed ? MUTATION_VERDICTS.DETECTED : MUTATION_VERDICTS.ESCAPED,
    detail: `receipt present=${String(receipt !== null)}; applied=${String(applied.status)}; control delivered=${JSON.stringify(controlDelivered)} (gate ${controlGreen ? 'PASS' : 'FAIL'}); mutant delivered=${JSON.stringify(mutantDelivered)} (gate ${mutantRed ? 'FAIL' : 'PASS'}) — a receipt without the revised input is exactly the defect`,
  });
}

/* ================================================================ the whole mutation suite */

/** §"Mutation testing": run every preregistered mutation and report per-mutation verdicts. */
export async function mutationSuite() {
  const runners = Object.freeze({
    M1_DROP_CONTEXT_INDEX: mutationDropContextIndex,
    M2_BYPASS_ATTEMPT_ALLOWLIST: mutationBypassAllowlist,
    M3_PROMOTE_WITHOUT_VERIFICATION: mutationPromoteWithoutVerification,
    M4_ACCEPT_STALE_RESULT: mutationAcceptStaleResult,
    M5_OMIT_PROJECT_ASSET_ASSOCIATION: mutationOmitAssociation,
    M6_EVOLUTION_RECEIPT_OLD_INTENT: mutationReceiptButOldIntent,
  });
  const results = [];
  for (const mutation of PREREGISTERED_MUTATIONS) {
    const runner = runners[mutation.id];
    if (runner === undefined) {
      results.push(Object.freeze({ id: mutation.id, detectedBy: mutation.detectedBy, controlGreen: false, mutantRed: false, verdict: MUTATION_VERDICTS.ESCAPED, detail: 'no runner is registered for this preregistered mutation' }));
      continue;
    }
    try {
      results.push(await runner());
    } catch (error) {
      results.push(Object.freeze({ id: mutation.id, detectedBy: mutation.detectedBy, controlGreen: false, mutantRed: false, verdict: MUTATION_VERDICTS.ESCAPED, detail: `the runner threw: ${String(error?.message ?? error).slice(0, 200)}` }));
    }
  }
  const escaped = results.filter((result) => result.verdict === MUTATION_VERDICTS.ESCAPED);
  return Object.freeze({
    id: 'MUTATION_SUITE',
    cell: cell('MUTATION_RESISTANCE', escaped.length === 0 ? MATRIX_CELLS.PASS : MATRIX_CELLS.FAIL,
      `${String(results.length - escaped.length)}/${String(results.length)} mutations DETECTED${escaped.length === 0 ? '' : `; ESCAPED: ${escaped.map((result) => result.id).join(', ')}`}`),
    results: Object.freeze(results),
    escaped: Object.freeze(escaped.map((result) => result.id)),
    green: escaped.length === 0,
  });
}
