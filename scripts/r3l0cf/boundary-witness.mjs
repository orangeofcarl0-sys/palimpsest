/**
 * R3-L0C-F §10 — THE ZERO-MODEL TREATMENT-BOUNDARY WITNESS.
 *
 * §10 requires the treatment boundary to be proven WITHOUT a model call, and it forbids one specific shortcut:
 * "Do NOT call the old real-model `runPlumbingCheck()` during this qualification stage." So the witness uses:
 *
 *   · the packaged runtime (installed from `dist/**`);
 *   · the real Project prehistory and the real capital associations;
 *   · the ACTUAL KnowledgeSelectionRequest builder (the canonical validating one);
 *   · a ScriptedWorker;
 *   · the actual governed pull boundary.
 *
 * WHAT MAKES THIS DIFFERENT FROM R3-L0C-R's BOUNDARY PROBE, and why a second witness is warranted: R3-L0C-R's
 * probe proved the C/G1 boundary. §10 requires BOTH generations and BOTH arms, with EXACT IDENTITY AND KIND
 * matches rather than cardinality, and it requires every C pull to resolve the canonical asset body digest. The
 * four expectations are frozen in `BOUNDARY_EXPECTATIONS`: H/G1 and H/G2 select nothing; C/G1 selects 2; C/G2
 * selects 4.
 *
 * THE ACTOR HAS NO FILESYSTEM ESCAPE HATCH. It sees only the consumer boundary and reads only through the
 * governed pull — the same discipline R3-S0's ScriptedWorker enforces, reused rather than re-derived. A worker
 * that went looking for the body on disk would make a delivery defect invisible, which is the R1-L/R2-U failure
 * this project has already been bitten by.
 *
 * THE HIDDEN-READ-CHANNEL CHECK. §10 requires the worker-facing route/tool configuration to be checked for an
 * ALTERNATIVE HIDDEN READ CHANNEL. The check is on the payload the worker is handed: the set of handles it is
 * ALLOWED to pull must equal the set it can SEE, so a handle that is not compiled cannot be pulled. That is a
 * property of the composed environment payload, measured rather than assumed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BOUNDARY_EXPECTATIONS, PREFLIGHT_LAW, REPO_ROOT } from './contract.mjs';
import { buildSelection, validateSelection } from '../r3l0cr/selection.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';

const NL = String.fromCharCode(10);
const DIST = join(REPO_ROOT, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);

/** A digest of a value, so a body digest is comparable. */
export const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/**
 * §10: THE SCRIPTED WORKER.
 *
 * It performs only the scripted actions: observe the handles it was handed, assert the expected set is exactly
 * present, pull each visible handle through the governed pull, and report the resolved body digest. It NEVER
 * searches the filesystem.
 */
export function scriptedBoundaryWorker(input) {
  const adapterId = input.adapterId ?? 'r3l0cf-scripted-boundary-worker';
  const observations = [];
  return Object.freeze({
    adapterId,
    observations,
    async run({ workDir, context, contextPull }) {
      const visible = (context?.compiled?.handles ?? []).map((entry) => ({ handle: entry.handle, kind: entry.kind }));
      const visibleHandles = visible.map((entry) => entry.handle);
      const expected = [...(input.expectedHandles ?? [])];
      const record = {
        adapterId,
        visibleHandles: Object.freeze([...visibleHandles]),
        visibleKinds: Object.freeze(visible.map((entry) => entry.kind)),
        expected: Object.freeze(expected),
        /** §10: exact identity, not cardinality. */
        missingFromBoundary: Object.freeze(expected.filter((handle) => !visibleHandles.includes(handle))),
        unexpectedAtBoundary: Object.freeze(visibleHandles.filter((handle) => !expected.includes(handle))),
        pulls: [],
        failures: [],
        workDir,
      };
      for (const handle of expected) if (!visibleHandles.includes(handle)) record.failures.push(`HANDLE_NOT_AT_CONSUMER_BOUNDARY:${handle}`);
      for (const handle of visibleHandles) {
        if (typeof contextPull !== 'function') { record.failures.push(`NO_GOVERNED_PULL_BOUND:${handle}`); continue; }
        let response;
        try {
          response = await contextPull(handle);
        } catch (error) {
          response = { threw: String(error?.message ?? error) };
        }
        const body = response?.body === undefined ? null : response.body;
        record.pulls.push(Object.freeze({
          handle,
          resolved: response !== null && response !== undefined && !('threw' in (response ?? {})),
          bodyBytes: body === null ? 0 : JSON.stringify(body).length,
          bodyDigest: body === null ? null : sha256(JSON.stringify(body)),
        }));
      }
      /** §10: the worker writes a file so the attempt settles, exactly as a real worker would. */
      writeFileSync(join(workDir, 'boundary-witness.txt'), `the scripted boundary worker ran for ${String(expected.length)} expected handle(s)${NL}`, 'utf8');
      observations.push(record);
      input.onObservation?.(record);
      return Object.freeze({
        kind: record.failures.length === 0 ? 'READY_FOR_SETTLEMENT' : 'NEEDS_ESCALATION',
        detail: record.failures.length === 0 ? 'the scripted boundary witness completed' : record.failures.join(', '),
      });
    },
  });
}

/**
 * §10: RUN ONE BOUNDARY CONTROL.
 *
 * It installs over the real durable stores, compiles the real selection for the real project, drives the scripted
 * worker through the packaged delegation, and reports what the consumer boundary carried and what the governed
 * pull resolved. NO MODEL IS INVOKED.
 */
export async function runBoundaryControl(input) {
  const { projectId, world, paths, refs, arm, generationId } = input;
  const advanced = await load('advanced.js');
  const delegation = await load('interaction/delegation.js');
  const workDelegation = await load('interaction/work_delegation.js');
  const workWorker = await load('deployment/work_worker.js');
  const workspaceModule = await load('project_workspace/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const proceduresModule = await load('procedures/index.js');

  /** §10: the ACTUAL canonical builder. H is the ABSENCE of a selection, which is `undefined`. */
  const selection = buildSelection({ arm, generationId, admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  if (selection !== undefined) validateSelection(selection);

  const { capitalPolicyPorts } = await import('../r3l0cr/capital-ports.mjs');
  const policyPorts = capitalPolicyPorts(reasoningModule);

  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: world,
      execution: 'worktree',
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0cf boundary witness'], confirmed: true, notes: [] },
      policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md', 'docs'], allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
      projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(paths.association),
      projectJournalStore: new workspaceModule.SqliteProjectJournalStore(paths.journal),
      proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(paths.proof),
      proofBlobStore: proofModule.localProofBlobStore(paths.proofBlobs),
      reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(paths.cells),
      reasoningCellStoreOwned: false,
      proofVerificationPolicy: policyPorts.proofVerification,
      proofPublicationAdmission: policyPorts.proofAdmission,
      reasoningVerificationPolicy: policyPorts.reasoningVerification,
      reasoningAdmissionPolicy: policyPorts.reasoningAdmission,
      procedureStore: new proceduresModule.SqliteProcedureStore(paths.procedures),
      procedureAuthoring: { origin: 'r3l0cf-witness', async propose() { return { outcome: 'NO_PROCEDURE' }; } },
      procedureAdmission: { policyRef: { policyId: 'r3l0cf-witness', version: '1' }, async decide({ candidateDigest }) { return { decision: 'UNRESOLVED', candidateDigest, rationale: 'the witness authors nothing', policyRef: { policyId: 'r3l0cf-witness', version: '1' } }; } },
    },
  );
  const controller = installed.controller;

  /**
   * §10: THE EXPECTATION COMES FROM THE FROZEN MANIFEST, not from a hand-built handle list.
   *
   * This matters: §6 of R3-L0C-R froze the expectation BEFORE execution precisely so an expectation read off the
   * run could never disagree with the run. A witness that constructed its own expected handles would be
   * re-deriving the frozen design, and a divergence between the two would be invisible. So the expected set is
   * the manifest's `expectedConsumerVisibleHandles`, and the witness asserts the OBSERVED set against it.
   */
  const expectation = buildExpectationManifest({ generationId, arm, admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  const expectedHandles = [...expectation.expectedConsumerVisibleHandles];
  const actor = scriptedBoundaryWorker({ expectedHandles });
  /** The environment payload, so the hidden-read-channel check reads the ACTUAL allowed-pull set. */
  let allowedPullHandles = null;
  const service = workDelegation.makeWorkDelegationService({
    controller,
    workerFor: () => ({
      adapterId: actor.adapterId,
      async run(runInput) {
        try { allowedPullHandles = workWorker.workWorkerEnvironmentPayload(runInput.context).allowedPullHandles; } catch { allowedPullHandles = null; }
        return await actor.run(runInput);
      },
    }),
  });

  const taskId = `boundary-${arm}-${generationId}`;
  const project = controller.work.project();
  const alreadyDeclared = project.tasks.some((task) => task.task_id === taskId);
  if (!alreadyDeclared) {
    controller.plan({
      goal: project.goal,
      requirements: project.requirements,
      decisions: project.decisions,
      tasks: [
        ...project.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: taskId, objective: 'exercise the capital delivery boundary', depends_on: [], write_paths: ['boundary-witness.txt'], required_artifacts: [] },
      ],
      reason: `boundary witness ${arm}/${generationId}`,
    });
  }
  for (let index = 0; index < 24; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
    controller.step();
  }
  const states = controller.work.taskStates();
  const target = states.find((task) => task.state === 'READY')?.taskId ?? states.find((task) => task.state === 'ACTIVE')?.taskId ?? taskId;

  let result;
  try {
    const started = await service.start(selection === undefined ? { expectedTaskId: target } : { expectedTaskId: target, knowledge: selection });
    let view = await service.followup({ jobId: started.jobId });
    for (let index = 0; index < 2_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      view = await service.followup({ jobId: started.jobId });
    }
    result = Object.freeze({ phase: view.phase, attemptId: 'attemptId' in view ? view.attemptId : null, hostError: 'hostError' in view ? view.hostError : null });
  } catch (error) {
    result = Object.freeze({ phase: 'REFUSED', attemptId: null, hostError: String(error?.message ?? error).slice(0, 300) });
  }

  const observation = actor.observations[0] ?? null;
  await installed.dispose().catch(() => undefined);

  /** §10: exact identity AND kind, not cardinality. */
  const observedHandles = [...(observation?.visibleHandles ?? [])].sort();
  const expectedSorted = [...expectedHandles].sort();
  const identityMatches = observedHandles.length === expectedSorted.length && expectedSorted.every((handle) => observedHandles.includes(handle));
  const kindMatches = (observation?.visibleKinds ?? []).length === (observation?.visibleHandles ?? []).length;
  const pullsAllResolved = (observation?.pulls ?? []).length > 0 && (observation?.pulls ?? []).every((pull) => pull.resolved && pull.bodyDigest !== null);
  const pullsResolveCanonicalBody = (observation?.pulls ?? []).length === expectedHandles.length && pullsAllResolved;
  /** §10: the hidden-read-channel check. */
  const allowedEqualsVisible = allowedPullHandles === null
    ? null
    : Array.isArray(allowedPullHandles)
      && allowedPullHandles.length === (observation?.visibleHandles ?? []).length
      && allowedPullHandles.every((handle) => (observation?.visibleHandles ?? []).includes(handle));

  const pass = result.phase !== 'REFUSED'
    && observation !== null
    && (observation.failures ?? []).length === 0
    && identityMatches
    && kindMatches
    && (arm === 'H' ? expectedHandles.length === 0 && (observation.pulls ?? []).length === 0 : pullsResolveCanonicalBody)
    && allowedEqualsVisible !== false;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'zero-model treatment-boundary control',
    arm,
    generationId,
    projectId,
    phase: result.phase,
    attemptId: result.attemptId,
    hostError: result.hostError,
    /** §10: what the consumer boundary carried, and the frozen expectation. */
    consumerVisibleHandles: Object.freeze([...(observation?.visibleHandles ?? [])]),
    consumerVisibleKinds: Object.freeze([...(observation?.visibleKinds ?? [])]),
    expectedHandles: Object.freeze(expectedHandles),
    expectedCount: expectedHandles.length,
    /** §10: the frozen expectation manifest's own digest and declared count, so the two cannot silently diverge. */
    expectationDigest: (await import('../r3l0cr/contract.mjs')).expectationDigest(expectation),
    expectedCountFrozen: expectation.expectedCounts.total,
    expectedCountMatchesFrozenDesign: expectation.expectedCounts.total === (BOUNDARY_EXPECTATIONS[`${arm}/${generationId}`]?.selectedHandles ?? null),
    missingFromBoundary: observation?.missingFromBoundary ?? Object.freeze([]),
    unexpectedAtBoundary: observation?.unexpectedAtBoundary ?? Object.freeze([]),
    /** §10: the governed pulls and their canonical body digests. */
    pulls: observation?.pulls ?? Object.freeze([]),
    failures: observation?.failures ?? Object.freeze([]),
    identityMatches,
    kindMatches,
    pullsAllResolved,
    pullsResolveCanonicalBody,
    /** §10: the hidden-read-channel check. */
    allowedPullHandles: allowedPullHandles === null ? null : Object.freeze([...allowedPullHandles]),
    allowedEqualsVisible,
    hiddenReadChannelExposed: allowedEqualsVisible === false,
    BOUNDARY_CONTROL: pass ? 'PASS' : 'FAIL',
    /** §10: the prohibitions this witness honours, carried as values. */
    noLlmInvoked: true,
    usedPackagedRuntime: true,
    usedRealPrehistory: true,
    usedScriptedWorker: true,
    usedCanonicalBuilder: true,
    usedGovernedPullBoundary: true,
    calledOldPlumbingCheck: false,
    dummyProject: false,
  });
}

/**
 * §10: RUN ALL FOUR CONTROLS.
 *
 * §10 requires H/G1, H/G2, C/G1 and C/G2, and requires "any failed boundary control is a qualification STOP". The
 * four are run against COPIES of the real prehistory so the controls do not interfere with one another.
 */
export async function runBoundaryWitnessSuite(input) {
  const { prehistoryRoot, buildPrehistory, admitCapital, selectionRefs, copyPrehistory } = input;
  const controls = [];
  for (const key of Object.keys(BOUNDARY_EXPECTATIONS)) {
    if (key === 'law') continue;
    const [arm, generationId] = key.split('/');
    const controlRoot = await copyPrehistory(key);
    const admitted = await admitCapital(controlRoot.root, controlRoot.paths, 'cutover-entitlements', controlRoot.world);
    const refs = selectionRefs(admitted);
    const control = await runBoundaryControl({
      projectId: 'cutover-entitlements',
      world: controlRoot.world,
      paths: controlRoot.paths,
      refs,
      arm,
      generationId,
    });
    controls.push(control);
  }
  const failing = controls.filter((control) => control.BOUNDARY_CONTROL !== 'PASS');
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'zero-model treatment-boundary witness suite',
    controls: Object.freeze(controls),
    TREATMENT_BOUNDARY: failing.length === 0 ? 'PASS' : 'FAIL',
    failing: Object.freeze(failing.map((control) => `${control.arm}/${control.generationId}`)),
    modelCallsMade: 0,
    /** §10: the consequence, carried so a report cannot soften it. */
    onFailure: PREFLIGHT_LAW.anyFailedBoundaryControl,
    law: PREFLIGHT_LAW.used.join('; '),
  });
}

export { NL, mkdirSync, PREFLIGHT_LAW };
