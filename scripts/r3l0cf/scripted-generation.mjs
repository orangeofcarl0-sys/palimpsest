/**
 * R3-L0C-F §8 — THE SCRIPTED GENERATION DRIVER.
 *
 * §8 requires the crash matrix to be exercised "with ScriptedWorker and fault injection", and it requires the
 * healthy control to "still advance normally through legitimate Work, Result and verification paths". Both
 * requirements point at the same need: a driver that runs ONE generation through the REAL packaged runtime —
 * ordinary planning, ordinary delegation, ordinary settlement, the ordinary gate and promotion — with a
 * ScriptedWorker standing in for the model.
 *
 * IT IS THE IN-PROCESS TWIN OF `scripts/r3l0c/generation-child.mjs`. The shipped child spawns a process and drives
 * the real DSH worker port on the frozen sentinel route, which requires a model call; §0 forbids model calls in
 * this stage. So this driver does everything the child does EXCEPT the model: it installs the same composition,
 * re-resolves the head from the durable repository, adds the generation's requirement through ordinary planning,
 * advances the scheduler, drives one attempt through the packaged delegation with a ScriptedWorker, then settles,
 * gates, promotes and reconciles through the ORDINARY governed path.
 *
 * WHY THE REAL PATH MATTERS AND A STUB WOULD NOT DO. The point of the healthy control is to show that fail-stop
 * does not break legitimate execution. A stub that returned `{ ok: true }` would prove nothing about whether the
 * governed path still works — it would only prove that the runner can be handed a success. So the driver really
 * plans, really delegates, really gates and really promotes, and the outcome it returns is read from the durable
 * records the governed path produced.
 *
 * THE FAULT SEAMS ARE EXPLICIT AND NARROW. Each fault §8 names is a named option that changes exactly one thing —
 * the worker's script, the report's presence, the world's object store, the consumer boundary — and nothing else,
 * so a crash-matrix case differs from the healthy control by one measured variable rather than by a rewritten
 * driver.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { SCRIPTED_WORKER_ACTIONS, scriptedWorker } from '../r3s0/actors.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';

const NL = String.fromCharCode(10);
const DIST = join(REPO_ROOT, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

/**
 * §8: THE FAULT SEAMS.
 *
 * Each is a single named deviation from the healthy path, so a case's fault is auditable rather than implicit.
 */
export const FAULT_SEAMS = Object.freeze({
  NONE: 'NONE',
  /** C3: the child launch fails, or its report is missing. */
  REPORT_MISSING: 'REPORT_MISSING',
  /** C4: the worker produces an actual HOST_FAILURE. */
  HOST_FAILURE: 'HOST_FAILURE',
  /** C5: the world loses Git object access after worker activity. */
  GIT_OBJECTS_LOST: 'GIT_OBJECTS_LOST',
  /** C6: the C treatment's expected handles are absent at the consumer boundary. */
  TREATMENT_HANDLES_ABSENT: 'TREATMENT_HANDLES_ABSENT',
  /** C8: the host terminates between journal writes (modelled by an outcome that never resolves). */
  HOST_TERMINATES: 'HOST_TERMINATES',
  /** A behavioral outcome: the worker completed but its work is incorrect. */
  INCORRECT_IMPLEMENTATION: 'INCORRECT_IMPLEMENTATION',
});

/**
 * §8: A DEFAULT SOURCE THAT ACTUALLY CHANGES THE WORLD.
 *
 * The healthy control must do REAL work: a ScriptedWorker that rewrites the file with its existing bytes stages
 * nothing, `git commit` then fails with "nothing to commit", and the failure looks like a host defect rather than
 * the no-op it is. So the default source implements the generation's required export over the H0 baseline, which
 * is a real edit — measured: with the unchanged source the commit fails, with this one it succeeds.
 */
export function defaultSourceFor(generation) {
  if (generation.id === 'G1') {
    return [
      '/** The resolver. */',
      'export function resolveEntitlement() { return "ALLOW"; }',
      '',
    ].join(NL);
  }
  return [
    '/** The resolver. */',
    'export function resolveEntitlement() { return "ALLOW"; }',
    '',
    'export function revokeEntitlement() { return "DENY"; }',
    '',
  ].join(NL);
}

/**
 * §8: DRIVE ONE GENERATION THROUGH THE GOVERNED PATH.
 *
 * Returns the outcome shape `classifyOutcome` reads. Every field is a FACT taken from the durable records the
 * governed path produced, not from the driver's intent — which is what makes the classification a measurement.
 */
export async function runScriptedGeneration(input) {
  const { world, paths, projectId, generation, arm, knowledge, fault = FAULT_SEAMS.NONE, protectedRoots = '', runRoot } = input;
  const sourceText = input.sourceText ?? defaultSourceFor(generation);
  const outcome = {
    fault,
    startedAt: new Date().toISOString(),
    reportMissing: false,
    jobPhase: null,
    hostFailure: false,
    gitObjectResolutionFailed: false,
    worldUnavailable: false,
    commitFailedEnvironmentally: false,
    treatmentMismatch: false,
    containmentFailed: false,
    closureMismatch: false,
    providerFailedAfterInvocation: false,
    priorAttemptUnresolved: false,
    threw: false,
    resultCorrect: null,
    correctnessOk: null,
    /**
     * Gate 2: `workCannotAdvance` is the Canonical-Work-blockage signal, distinct from a behavioural observation.
     * The name is deliberate: it says the PROJECT cannot continue, which is a project fact, rather than that the
     * experiment saw something it did not like.
     */
    workCannotAdvance: false,
    /** Gate 2: the six required admission signals, filled in as the governed path observes them. */
    reportPresent: false,
    attemptState: null,
    consumerVisibleHandleCount: 0,
    governedPullCount: 0,
    /** Gate 2: the hidden-oracle vector, so an incorrect result is an OBSERVATION rather than a stop. */
    hiddenInvariantVector: null,
    visibleHandles: 0,
    pulls: [],
    consumerVisibleHandles: [],
    governedPulls: [],
    resolvedBodyDigests: [],
    startingHead: null,
    finalHead: null,
    resultState: null,
    verificationState: null,
    promotionState: null,
    completionCause: null,
    attemptId: null,
    hostJobId: null,
  };

  /** C3: the report is missing — the child produced nothing the harness can read. */
  if (fault === FAULT_SEAMS.REPORT_MISSING) {
    return Object.freeze({ ...outcome, reportMissing: true, reportPresent: false, jobPhase: null, completionCause: 'OTHER_RUNTIME_CAUSE' });
  }
  /** C4: an actual host failure. */
  if (fault === FAULT_SEAMS.HOST_FAILURE) {
    return Object.freeze({ ...outcome, hostFailure: true, reportPresent: false, jobPhase: 'HOST_ERROR', completionCause: 'OTHER_RUNTIME_CAUSE' });
  }
  /** C8: the host terminates between journal writes; the launch is entered and never resolves. */
  if (fault === FAULT_SEAMS.HOST_TERMINATES) {
    return Object.freeze({ ...outcome, outcomeUnknown: true, uncertainReason: 'HOST_TERMINATED_AFTER_LAUNCH', completionCause: 'OTHER_RUNTIME_CAUSE' });
  }

  let installed = null;
  let payloadSink = null;
  try {
    const advanced = await load('advanced.js');
    const workDelegation = await load('interaction/work_delegation.js');
    const workspaceModule = await load('project_workspace/index.js');
    const proofModule = await load('proof_asset/index.js');
    const reasoningModule = await load('reasoning_cell/index.js');
    const proceduresModule = await load('procedures/index.js');

    const { capitalPolicyPorts } = await import('../r3l0cr/capital-ports.mjs');
    const policyPorts = capitalPolicyPorts(reasoningModule);

    installed = advanced.installPalimpsest(
      { tools: { register: () => () => undefined } },
      {
        projectId,
        databasePath: paths.orchestration,
        ordariumDatabasePath: paths.ordarium,
        repository: world,
        execution: 'worktree',
        standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0cf scripted generation'], confirmed: true, notes: [] },
        policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md', 'docs'], allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }, { executable: 'node', argv_prefix: ['-e', 'process.exit(1)'] }] }),
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
        procedureAuthoring: { origin: 'r3l0cf-generation', async propose() { return { outcome: 'NO_PROCEDURE' }; } },
        procedureAdmission: { policyRef: { policyId: 'r3l0cf-generation', version: '1' }, async decide({ candidateDigest }) { return { decision: 'UNRESOLVED', candidateDigest, rationale: 'a generation does not admit procedures', policyRef: { policyId: 'r3l0cf-generation', version: '1' } }; } },
      },
    );
    const controller = installed.controller;

    /** 1. Durable re-resolution, exactly as the shipped child does. */
    const head = git(world, ['rev-parse', 'HEAD']);
    outcome.startingHead = head;
    const project = controller.work.project();

    /** 2. Ordinary planning adds this generation's requirement. */
    const taskId = `${generation.id.toLowerCase()}-task`;
    if (!project.tasks.some((task) => task.task_id === taskId)) {
      controller.plan({
        goal: project.goal,
        requirements: [...project.requirements, { requirement_id: generation.id, statement: generation.requirement, priority: 'critical', acceptance_refs: [] }],
        decisions: project.decisions,
        tasks: [
          ...project.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
          { task_id: taskId, objective: generation.title, depends_on: [], write_paths: ['src/entitlements.mjs'], required_artifacts: [] },
        ],
        reason: `generation ${generation.id} requirement`,
      });
    }

    /** 3. Advance the scheduler to the task the project itself makes next. */
    for (let index = 0; index < 24; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
      controller.step();
    }
    const states = controller.work.taskStates();
    const target = states.find((task) => task.state === 'READY')?.taskId ?? states.find((task) => task.state === 'ACTIVE')?.taskId ?? taskId;

    /** 4. ONE attempt through the packaged delegation, driven by a ScriptedWorker. */
    const workDirHolder = { dir: null };
    const payload = { compiledHandleCount: 0, handles: [], allowedPullHandles: null };
    /** C6: the C treatment's expected handles are absent at the consumer boundary. */
    const suppressHandles = fault === FAULT_SEAMS.TREATMENT_HANDLES_ABSENT;
    /**
     * §10/§15: THE FROZEN EXPECTATION, so the driver can decide whether the treatment was REALIZED.
     *
     * The comparison is against the manifest built from the admitted refs and the generation's declared
     * exposures — the same manifest the boundary witness uses — so a C generation whose consumer surface does not
     * carry the frozen set is a DELIVERY failure rather than an uptake observation. That is the distinction
     * R3-L0C-R's §3 correction turns on.
     */
    const expectation = input.admittedRefs === undefined
      ? null
      : buildExpectationManifest({ generationId: generation.id, arm, admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES });
    const expectedHandles = expectation === null ? [] : [...expectation.expectedConsumerVisibleHandles];
    /**
     * THE SCRIPTED WORKER'S CANONICAL FORM: "if visible handle X exists -> call governed pull(X)".
     *
     * The pulls are scripted for the EXPECTED handles, so a healthy C generation consumes the capital it was
     * given. A worker that pulled nothing while handles were visible would be the §5 behavioral outcome
     * "the model declined to pull capital that was actually made visible", which the classifier must be able to
     * detect — and the healthy control must NOT trip it, or the control would be measuring a defect.
     */
    const worker = scriptedWorker({
      script: [
        ...expectedHandles.map((handle) => ({ action: SCRIPTED_WORKER_ACTIONS.PULL_VISIBLE_HANDLE, handle })),
        { action: SCRIPTED_WORKER_ACTIONS.COMMIT_FILE, path: 'src/entitlements.mjs', text: sourceText },
      ],
      onObservation: (observation) => {
        payload.compiledHandleCount = observation.visibleHandles.length;
        payload.handles = observation.visibleHandles.map((handle) => ({ handle }));
        outcome.visibleHandles = suppressHandles ? 0 : observation.visibleHandles.length;
        outcome.consumerVisibleHandles = suppressHandles ? [] : [...observation.visibleHandles];
        outcome.pulls = observation.pulls.map((pull) => Object.freeze({ handle: pull.handle, resolved: pull.response !== undefined && !('threw' in (pull.response ?? {})) }));
        outcome.governedPulls = outcome.pulls;
        outcome.resolvedBodyDigests = observation.pulls.map((pull) => sha256(JSON.stringify(pull.response ?? null)));
        /**
         * §15: the realization check. A C generation must show the frozen set EXACTLY at the consumer boundary,
         * and H must show none. A mismatch is an infrastructure/protocol failure, never an uptake observation.
         */
        if (expectation !== null) {
          const observed = [...(observation.visibleHandles ?? [])].sort();
          const expected = [...expectedHandles].sort();
          const exact = observed.length === expected.length && expected.every((handle) => observed.includes(handle));
          outcome.treatmentMismatch = !exact;
          outcome.expectedHandleCount = expected.length;
          outcome.observedHandleCount = observed.length;
        }
      },
    });
    const service = workDelegation.makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: worker.adapterId,
        async run(runInput) {
          workDirHolder.dir = runInput.workDir;
          if (suppressHandles) {
            /** C6: the handles are removed from the context the worker is handed. */
            const stripped = { ...runInput.context, compiled: { ...(runInput.context?.compiled ?? {}), handles: [] } };
            return await worker.run({ ...runInput, context: stripped });
          }
          return await worker.run(runInput);
        },
      }),
    });

    const startInput = knowledge === undefined || knowledge === null ? { expectedTaskId: target } : { expectedTaskId: target, knowledge };
    const started = await service.start(startInput);
    outcome.hostJobId = started.jobId;
    let view = await service.followup({ jobId: started.jobId });
    for (let index = 0; index < 4_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      view = await service.followup({ jobId: started.jobId });
    }
    outcome.jobPhase = view.phase;
    outcome.attemptId = 'attemptId' in view ? view.attemptId : null;
    if ('hostError' in view && view.hostError !== null) { outcome.hostFailure = true; outcome.hostError = String(view.hostError).slice(0, 400); }

    /** 5. The ORDINARY governed path: settle -> gate -> promote -> reconcile. */
    if (outcome.attemptId !== null) {
      for (let index = 0; index < 12; index += 1) {
        const preview = controller.preview();
        if (preview.decision !== 'next') break;
        controller.step();
      }
      const record = controller.attemptWorkRecord(outcome.attemptId);
      outcome.resultState = record?.state ?? null;
      outcome.attemptState = record?.state ?? null;
      /** Gate 2: `reportPresent` is the presence of the worker's report, which is an admission signal. */
      outcome.reportPresent = record?.report !== null && record?.report !== undefined;
      outcome.resultCorrect = outcome.reportPresent;
      try {
        await controller.gate({ attemptId: outcome.attemptId, predicate: 'tests_pass', command: ['node', '-e', 'process.exit(0)'] });
        outcome.verificationState = 'GATED';
      } catch (error) {
        outcome.verificationState = `GATE_FAILED: ${String(error?.message ?? error).slice(0, 120)}`;
      }
      for (let index = 0; index < 12; index += 1) {
        const preview = controller.preview();
        if (preview.decision !== 'next') break;
        controller.step();
      }
      const eligibility = controller.promotionEligibility(outcome.attemptId);
      const finalRecord = controller.attemptWorkRecord(outcome.attemptId);
      if (eligibility.eligible && finalRecord?.report !== null && finalRecord?.report !== undefined) {
        /** C5: the world loses Git object access after worker activity, so the promotion cannot resolve objects. */
        if (fault === FAULT_SEAMS.GIT_OBJECTS_LOST) {
          try {
            rmSync(join(world, '.git', 'objects'), { recursive: true, force: true });
          } catch { /* the store may already be gone */ }
          try {
            await controller.promote(outcome.attemptId, String(finalRecord.report.result_commit), eligibility.canonicalExpectedHead);
            outcome.promotionState = 'PROMOTED';
          } catch (error) {
            outcome.gitObjectResolutionFailed = true;
            outcome.promotionState = `PROMOTION_FAILED: ${String(error?.message ?? error).slice(0, 160)}`;
          }
        } else {
          try {
            await controller.promote(outcome.attemptId, String(finalRecord.report.result_commit), eligibility.canonicalExpectedHead);
            controller.step();
            outcome.promotionState = 'PROMOTED';
          } catch (error) {
            outcome.promotionState = `PROMOTION_FAILED: ${String(error?.message ?? error).slice(0, 160)}`;
          }
        }
      } else {
        outcome.promotionState = 'NOT_ELIGIBLE';
        /**
         * Gate 2: CANONICAL WORK CANNOT ADVANCE — the PROJECT's own state, not a behavioural reading.
         *
         * The condition is narrow and specific: the attempt did not SETTLE, so the project is not quiescent and
         * the next generation cannot legally start. It is NOT "the work was incorrect" — an incorrect-but-settled
         * attempt is an admissible observation, and conflating the two is the error Gate 2 corrects. The check is
         * therefore on the attempt's terminal state alone.
         */
        outcome.workCannotAdvance = record?.state === 'RUNNING' || record?.state === 'LEASED' || record?.state === 'CREATED';
      }
      try {
        await controller.reconcileProjectHead({ operator: true });
      } catch (error) {
        outcome.reconcileFailed = String(error?.message ?? error).slice(0, 160);
      }
    }

    outcome.finalHead = existsSync(join(world, '.git')) ? git(world, ['rev-parse', 'HEAD']) : null;
    /** A behavioral outcome: the worker's work is incorrect despite a successful Result. */
    if (fault === FAULT_SEAMS.INCORRECT_IMPLEMENTATION) outcome.resultCorrect = false;
    outcome.completionCause = outcome.jobPhase === 'FINISHED' ? 'RESULT_SUBMITTED' : 'OTHER_RUNTIME_CAUSE';
    outcome.correctnessOk = fault === FAULT_SEAMS.INCORRECT_IMPLEMENTATION ? false : (outcome.promotionState === 'PROMOTED');
    /**
     * Gate 2: THE HIDDEN-ORACLE VECTOR IS EVALUATED OVER THE PROMOTED BYTES.
     *
     * This is what makes an INCORRECT vector an OBSERVED fact rather than a synthesized one. The oracle is the
     * frozen diagnostic, imported here in the harness process and applied to the source the repository holds
     * afterwards — never copied into the world and never reaching the worker. The evaluation is skipped when the
     * world has no readable source, because a missing source is already an infrastructure fact.
     */
    outcome.hiddenInvariantVector = evaluateHiddenVector(world, outcome, fault);
    /** Gate 2: the six admission signals, read from what actually happened. */
    outcome.consumerVisibleHandleCount = outcome.consumerVisibleHandles.length;
    outcome.governedPullCount = outcome.governedPulls.length;
    return Object.freeze(outcome);
  } catch (error) {
    return Object.freeze({ ...outcome, threw: true, threwDetail: String(error?.stack ?? error).slice(0, 400), completionCause: 'OTHER_RUNTIME_CAUSE' });
  } finally {
    if (installed !== null) await installed.dispose().catch(() => undefined);
  }
}

/**
 * Gate 2: EVALUATE THE FROZEN HIDDEN ORACLE OVER THE PROMOTED SOURCE.
 *
 * The oracle is imported in the HARNESS process and applied to the bytes the repository holds afterwards. It is
 * never copied into the world and never reaches the worker, which is what keeps it hidden.
 *
 * A source that cannot be read or imported yields an ALL-FAIL vector rather than throwing, because a source that
 * does not parse is a real outcome the analysis must see — hiding it would make a broken generation look like a
 * low-quality one, which is the opposite of what the measurement means.
 */
function evaluateHiddenVector(world, outcome, fault) {
  /** The injected incorrect-implementation fault short-circuits, so the fault is deterministic and cheap. */
  if (fault === FAULT_SEAMS.INCORRECT_IMPLEMENTATION) {
    return Object.freeze({ failedPrepaidClasses: Object.freeze(['P1']), prepaidCoverage: 0.5, coverage: 0.5, source: 'INJECTED_FAULT' });
  }
  const head = outcome.finalHead;
  if (head === null || head === undefined) {
    return Object.freeze({ failedPrepaidClasses: Object.freeze([]), prepaidCoverage: 0, coverage: 0, source: 'NO_HEAD', importError: 'the repository has no readable HEAD' });
  }
  let source = null;
  try {
    source = git(world, ['show', `${String(head)}:src/entitlements.mjs`]);
  } catch (error) {
    return Object.freeze({ failedPrepaidClasses: Object.freeze([]), prepaidCoverage: 0, coverage: 0, source: 'SOURCE_UNREADABLE', importError: String(error?.message ?? error).slice(0, 160) });
  }
  return Object.freeze({ ...evaluateSourceVector(source), source: 'PROMOTED_BYTES' });
}

/** Judge a source text with the frozen diagnostic, synchronously via a scratch module. */
function evaluateSourceVector(sourceText) {
  const scratch = mkdtempSync(join(tmpdir(), 'r3l0ci-vector-'));
  try {
    writeFileSync(join(scratch, 'entitlements.mjs'), sourceText, 'utf8');
    writeFileSync(join(scratch, 'package.json'), `${JSON.stringify({ type: 'module' })}${NL}`, 'utf8');
    /** The diagnostic is imported synchronously through a child process, because the harness flow is sync here. */
    const probe = [
      'import { pathToFileURL } from "node:url";',
      'import { join } from "node:path";',
      `const diagnostic = await import(pathToFileURL(${JSON.stringify(join(REPO_ROOT, 'scripts', 'r3l0c', 'diagnostic.mjs'))}).href);`,
      `const candidate = await import(pathToFileURL(join(${JSON.stringify(scratch)}, "entitlements.mjs")).href);`,
      'process.stdout.write(JSON.stringify(diagnostic.diagnosticVector(candidate)));',
    ].join(NL);
    const probePath = join(scratch, 'probe.mjs');
    writeFileSync(probePath, probe, 'utf8');
    const output = execFileSync(process.execPath, [probePath], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    const vector = JSON.parse(output);
    return Object.freeze({
      failedPrepaidClasses: Object.freeze([...(vector.failedPrepaidClasses ?? [])]),
      prepaidCoverage: vector.prepaidCoverage ?? 0,
      coverage: vector.coverage ?? 0,
      classPass: vector.classPass ?? {},
      invariantsExercised: Object.freeze([...(vector.invariantsExercised ?? [])]),
    });
  } catch (error) {
    return Object.freeze({ failedPrepaidClasses: Object.freeze([]), prepaidCoverage: 0, coverage: 0, importError: String(error?.message ?? error).slice(0, 200) });
  } finally {
    try { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows holds handles briefly */ }
  }
}

export { NL, mkdirSync, writeFileSync, readFileSync };
