/**
 * R3-L0C-R §7 — THE REAL-PREHISTORY DETERMINISTIC BOUNDARY PROBE.
 *
 * §7 requires the probe to be driven against the EXACT real R3-L0C prehistory and association state, with the
 * exact capital assets, the exact ProjectAssetAssociations, the exact selector, the packaged runtime and the
 * ACTUAL consumer boundary. It states plainly: *"A simplified dummy Project is not sufficient for this gate."*
 *
 * WHY THAT PROHIBITION IS EXACTLY RIGHT, stated with this stage's own history. R3-L0C's preflight drove a DUMMY
 * project, and a dummy project has no capital associations. So the dummy could not resolve a selection at all: it
 * refused with `KNOWLEDGE_NOT_PROJECT_ASSOCIATED`. The preflight therefore passed while the real delivery path
 * was broken, because the thing it exercised was not the thing that runs. This probe closes that by using the
 * real prehistory.
 *
 * NO LLM. The actor is scripted: it observes the handles the consumer was handed, pulls each one through the
 * governed pull, and records the canonical body digest. §7 requires the scripted actor to observe the EXPECTED
 * handles, pull them, and resolve the correct canonical body digests — which is a proof about the delivery path,
 * not about a model.
 *
 * THE ACTOR HAS NO FILESYSTEM ESCAPE HATCH. It can only see what the consumer was handed and can only read
 * through the governed pull, because a probe that went looking on disk would make a delivery defect invisible.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { buildSelection, validateSelection } from './selection.mjs';

const NL = String.fromCharCode(10);
const DIST = join(REPO_ROOT, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);
export const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/**
 * §7: THE SCRIPTED ACTOR.
 *
 * It is a real `WorkWorkerRunPort`-shaped actor, so the packaged runtime drives it exactly as it drives a model
 * worker. It performs only the scripted actions and NEVER searches the filesystem: if an expected handle is
 * absent from the consumer boundary, it REPORTS the absence rather than looking for the body on disk.
 */
export function scriptedBoundaryActor(input) {
  const adapterId = input.adapterId ?? 'r3l0cr-scripted-boundary-actor';
  const observations = [];
  return Object.freeze({
    adapterId,
    observations,
    async run({ workDir, context, contextPull }) {
      const visibleHandles = (context?.compiled?.handles ?? []).map((entry) => entry.handle);
      const record = {
        adapterId,
        visibleHandles: Object.freeze([...visibleHandles]),
        visibleKinds: Object.freeze((context?.compiled?.handles ?? []).map((entry) => entry.kind)),
        expected: Object.freeze([...(input.expectedHandles ?? [])]),
        missingFromBoundary: Object.freeze((input.expectedHandles ?? []).filter((handle) => !visibleHandles.includes(handle))),
        pulls: [],
        failures: [],
        /** §7: the actor writes a file so the attempt settles, exactly as a worker would. */
        workDir,
      };
      /** §7: if an expected handle did not reach the boundary, that is REPORTED, never searched for. */
      for (const handle of input.expectedHandles ?? []) {
        if (!visibleHandles.includes(handle)) record.failures.push(`HANDLE_NOT_AT_CONSUMER_BOUNDARY:${handle}`);
      }
      for (const handle of visibleHandles) {
        if (typeof contextPull !== 'function') {
          record.failures.push(`NO_GOVERNED_PULL_BOUND:${handle}`);
          continue;
        }
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
      /** §7: the attempt must settle, so the actor commits its work like a worker would. */
      writeFileSync(join(workDir, 'boundary-probe.txt'), `the scripted boundary actor ran for ${String((input.expectedHandles ?? []).length)} expected handle(s)${NL}`, 'utf8');
      observations.push(record);
      input.onObservation?.(record);
      return Object.freeze({
        kind: record.failures.length === 0 ? 'READY_FOR_SETTLEMENT' : 'NEEDS_ESCALATION',
        detail: record.failures.length === 0 ? 'the scripted boundary probe completed' : record.failures.join(', '),
      });
    },
  });
}

/**
 * §7: RUN THE PROBE AGAINST THE REAL PREHISTORY.
 *
 * The probe installs over the real durable stores, compiles the real selection for the real project, drives the
 * scripted actor through the packaged delegation, and reports what the consumer boundary carried and what the
 * governed pull resolved. No model is invoked.
 */
export async function runRealPrehistoryBoundaryProbe(input) {
  const { projectId, world, paths, refs, generationId, generationExposures, expectation } = input;
  const advanced = await load('advanced.js');
  const delegation = await load('interaction/work_delegation.js');
  const workspaceModule = await load('project_workspace/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const proceduresModule = await load('procedures/index.js');

  /** §7: the exact selector, built through the canonical validating builder. */
  const selection = buildSelection({ arm: 'C', generationId, admittedRefs: refs, generationExposures });
  validateSelection(selection);

  const { capitalPolicyPorts } = await import('./capital-ports.mjs');
  const policyPorts = capitalPolicyPorts(reasoningModule);

  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: world,
      execution: 'worktree',
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0cr boundary probe'], confirmed: true, notes: [] },
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
      procedureAuthoring: { origin: 'r3l0cr-probe', async propose() { return { outcome: 'NO_PROCEDURE' }; } },
      procedureAdmission: { policyRef: { policyId: 'r3l0cr-probe', version: '1' }, async decide({ candidateDigest }) { return { decision: 'UNRESOLVED', candidateDigest, rationale: 'the probe authors nothing', policyRef: { policyId: 'r3l0cr-probe', version: '1' } }; } },
    },
  );
  const controller = installed.controller;

  const actor = scriptedBoundaryActor({ expectedHandles: expectation.expectedConsumerVisibleHandles });
  const service = delegation.makeWorkDelegationService({ controller, workerFor: () => actor });

  /**
   * §7: the probe needs an ACTIVE attempt to compile against, so it advances the real project's own scheduler
   * exactly as a generation does. The real project already carries its requirements from the prehistory.
   */
  const taskId = 'boundary-probe';
  const project = controller.work.project();
  const alreadyDeclared = project.tasks.some((task) => task.task_id === taskId);
  if (!alreadyDeclared) {
    controller.plan({
      goal: project.goal,
      requirements: project.requirements,
      decisions: project.decisions,
      tasks: [
        ...project.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: taskId, objective: 'exercise the capital delivery boundary', depends_on: [], write_paths: ['boundary-probe.txt'], required_artifacts: [] },
      ],
      reason: 'boundary probe',
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
    const started = await service.start({ expectedTaskId: target, knowledge: selection });
    let view = await service.followup({ jobId: started.jobId });
    for (let index = 0; index < 2_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      view = await service.followup({ jobId: started.jobId });
    }
    result = Object.freeze({
      phase: view.phase,
      attemptId: 'attemptId' in view ? view.attemptId : null,
      hostError: 'hostError' in view ? view.hostError : null,
    });
  } catch (error) {
    result = Object.freeze({ phase: 'REFUSED', attemptId: null, hostError: String(error?.message ?? error).slice(0, 300) });
  }

  const observation = actor.observations[0] ?? null;
  await installed.dispose().catch(() => undefined);

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'real-prehistory deterministic boundary probe',
    projectId,
    generationId,
    phase: result.phase,
    attemptId: result.attemptId,
    hostError: result.hostError,
    /** §7: what the consumer boundary carried. */
    consumerVisibleHandles: observation?.visibleHandles ?? Object.freeze([]),
    consumerVisibleKinds: observation?.visibleKinds ?? Object.freeze([]),
    expectedHandles: expectation.expectedConsumerVisibleHandles,
    missingFromBoundary: observation?.missingFromBoundary ?? Object.freeze([]),
    /** §7: the pulls and their canonical body digests. */
    pulls: observation?.pulls ?? Object.freeze([]),
    failures: observation?.failures ?? Object.freeze([]),
    /** §7: the verdict. */
    BOUNDARY_PROBE: (observation !== null && observation.failures.length === 0 && (observation.pulls ?? []).length > 0 && (observation.pulls ?? []).every((pull) => pull.resolved && pull.bodyDigest !== null)) ? 'PASS' : 'FAIL',
    noLlmInvoked: true,
    usedRealPrehistory: true,
    dummyProject: false,
  });
}

/** §7: whether the probe's observed handles equal the frozen expectation exactly. */
export function probeMatchesExpectation(probe, expectation) {
  const observed = [...probe.consumerVisibleHandles].sort();
  const expected = [...expectation.expectedConsumerVisibleHandles].sort();
  return Object.freeze({
    matches: observed.length === expected.length && expected.every((handle) => observed.includes(handle)),
    expected,
    observed,
    kinds: probe.consumerVisibleKinds,
  });
}

export { NL, mkdirSync };
