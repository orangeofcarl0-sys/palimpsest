#!/usr/bin/env node
/**
 * R3-L0 §4/§13 — THE GENERATION CHILD PROGRAM.
 *
 * §4 requires every worker generation to use a fresh OS process/session with no previous model transcript, no
 * session-local object identity, no in-memory attempt identifiers and durable project state re-resolution. This
 * file IS that fresh process: the parent spawns `node scripts/r3l0/generation-child.mjs <specPath>`, and this
 * program starts from nothing but a JSON spec naming durable PATHS.
 *
 * It is a real committed artifact rather than an embedded string so that its digest can be recorded in the plan
 * and compared afterwards — a harness that changed mid-experiment would otherwise be invisible.
 *
 * WHAT ONE GENERATION DOES
 *
 *   1. re-attach to the durable stores BY PATH, and re-resolve the project head from the repository;
 *   2. add the generation's requirement through ORDINARY planning;
 *   3. advance the scheduler to the task the project itself makes next;
 *   4. drive ONE real DSH worker attempt under the frozen route, with the arm's knowledge selection;
 *   5. settle, gate, promote and reconcile through the ORDINARY governed path;
 *   6. read the promoted source back OUT of the durable repository;
 *   7. judge it with the research diagnostic oracle, OUTSIDE the world;
 *   8. write a report the parent reads.
 *
 * §10: the diagnostic oracle is never copied into the world and never reaches the worker. It is imported HERE,
 * in the parent-side process, and applied to the bytes the repository holds afterwards.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { diagnosticVector } from './diagnostic.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const REPO_ROOT = spec.repoRoot;
const DIST = join(REPO_ROOT, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);

/**
 * The tee wrapper re-execs the REAL DSH bin, so it needs both environment variables BEFORE the port spawns it.
 */
process.env.PALIMPSEST_REAL_DSH_BIN = spec.realDshBin;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = spec.transcript;
/**
 * DSH_HOME must point at THIS generation's home, or the DSH bin resolves the profile against the real user home
 * and refuses with "profile does not exist". The profile is per-trajectory, so this is per-process state.
 */
process.env.DSH_HOME = spec.dshHome;

const report = {
  schemaVersion: 1,
  stage: 'R3-L0',
  generation: spec.generation,
  arm: spec.arm,
  block: spec.block,
  pid: process.pid,
  startedAt: new Date().toISOString(),
  steps: [],
};
const step = (name, value) => { report.steps.push({ name, value }); };

let installed = null;
try {
  const advanced = await load('advanced.js');
  const delegation = await load('interaction/work_delegation.js');
  const workspaceModule = await load('project_workspace/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const proceduresModule = await load('procedures/index.js');
  const workWorker = await load('deployment/work_worker.js');

  const options = {
    projectId: spec.projectId,
    databasePath: spec.paths.orchestration,
    ordariumDatabasePath: spec.paths.ordarium,
    repository: spec.repo,
    execution: 'worktree',
    standard: spec.standard,
    policy: advanced.trustedDefaultPolicy({
      read_paths: ['src', 'test', 'README.md', 'docs'],
      allowed_commands: [
        { executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] },
        { executable: 'node', argv_prefix: ['-e', 'process.exit(1)'] },
      ],
    }),
    projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(spec.paths.association),
    projectJournalStore: new workspaceModule.SqliteProjectJournalStore(spec.paths.journal),
    proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(spec.paths.proof),
    proofBlobStore: proofModule.localProofBlobStore(spec.paths.proofBlobs),
    reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(spec.paths.cells),
    reasoningCellStoreOwned: false,
    /**
     * The reasoning read capability is composed ONLY when the store AND both policy ports are supplied. Wiring
     * the store alone leaves the capability ABSENT, and a CAPITALIZED selection then refuses with
     * KNOWLEDGE_CAPABILITY_UNAVAILABLE — the bundle would silently lose its reasoning third.
     */
    reasoningVerificationPolicy: {
      async verify({ definition, candidate, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis,
          verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED',
          supportingEvidenceIds: ['ev-1'], contradictingEvidenceIds: [], provenanceDigest: 'a'.repeat(64),
        };
        return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };
      },
      async verifyInvalidation({ definition, request, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest,
          frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED',
          evidenceIds: ['ev-9'], provenanceDigest: 'b'.repeat(64),
        };
        return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };
      },
    },
    reasoningAdmissionPolicy: {
      async admit({ definition, candidate, verification, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest,
          verificationResultDigest: verification.digest, frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'c'.repeat(64),
        };
        return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };
      },
      async admitInvalidation({ definition, request, verification, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest,
          verificationResultDigest: verification.digest, frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'd'.repeat(64),
        };
        return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };
      },
    },
    /**
     * The PROCEDURE store must be wired, or a selected procedure handle cannot be resolved by the Context owner
     * and the CAPITALIZED arm would silently lose one third of its bundle. The authoring and admission seams are
     * deliberately inert here: a generation SELECTS capital, it never authors or admits any.
     */
    procedureStore: new proceduresModule.SqliteProcedureStore(spec.paths.procedures),
    procedureAuthoring: { origin: 'r3l0-generation', async propose() { return { outcome: 'NO_PROCEDURE' }; } },
    procedureAdmission: {
      policyRef: { policyId: 'r3l0-generation', version: '1' },
      async decide({ candidateDigest }) {
        return { decision: 'UNRESOLVED', candidateDigest, rationale: 'a generation does not admit procedures', policyRef: { policyId: 'r3l0-generation', version: '1' } };
      },
    },
  };
  installed = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, options);
  const controller = installed.controller;

  /** 1. Durable re-resolution: the head and the project come from the stores, never from the parent. */
  const head = git(spec.repo, ['rev-parse', 'HEAD']);
  const project = controller.work.project();
  report.startingHead = head;
  report.startingRevision = project.revision;
  step('resolvedHead', head);

  /** 2. Ordinary planning adds this generation's requirement. */
  const taskId = `${spec.generation.toLowerCase()}-task`;
  const alreadyDeclared = project.tasks.some((task) => task.task_id === taskId);
  if (!alreadyDeclared) {
    controller.plan({
      goal: spec.projectGoal,
      requirements: [...project.requirements, { requirement_id: spec.generation, statement: spec.requirement, priority: 'critical', acceptance_refs: [] }],
      decisions: project.decisions,
      tasks: [
        ...project.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: taskId, objective: spec.objective, depends_on: [], write_paths: ['src/ledger.mjs'], required_artifacts: [] },
      ],
      reason: `generation ${spec.generation} requirement`,
    });
  }
  step('planned', taskId);

  /** 3. Advance the scheduler to the task the project itself makes next. */
  for (let index = 0; index < 24; index += 1) {
    const preview = controller.preview();
    if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
    controller.step();
  }
  const states = controller.work.taskStates();
  const target = states.find((task) => task.state === 'READY')?.taskId ?? states.find((task) => task.state === 'ACTIVE')?.taskId ?? taskId;
  step('target', target);

  /** 4. ONE real DSH worker attempt. The payload is captured at the port boundary. */
  const payloadSink = spec.payloadSink;
  const transcript = spec.transcript;
  const workerFor = () => {
    const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: spec.teePath, profile: spec.profile, timeoutMs: 1_800_000 });
    return {
      adapterId: port.adapterId,
      async run(input) {
        /** The model-visible boundary: what the CONSUMER was actually handed. */
        writeFileSync(payloadSink, JSON.stringify({
          compiledHandleCount: (input.context?.compiled?.handles ?? []).length,
          handles: (input.context?.compiled?.handles ?? []).map((entry) => ({ kind: entry.kind, handle: entry.handle })),
          bootKinds: (input.context?.compiled?.boot ?? []).map((entry) => entry.kind),
          requirements: input.context?.work?.requirements ?? [],
          contextIndexText: input.context?.contextIndexText ?? null,
          allowedPullHandles: workWorker.workWorkerEnvironmentPayload(input.context).allowedPullHandles,
        }, null, 2), 'utf8');
        return await port.run(input);
      },
    };
  };
  const service = delegation.makeWorkDelegationService({ controller, workerFor });

  /** §7: the ONLY difference between the arms — whether capital is SELECTED. H omits the field entirely. */
  const startInput = spec.knowledge === null || spec.knowledge === undefined
    ? { expectedTaskId: target }
    : { expectedTaskId: target, knowledge: spec.knowledge };
  const started = await service.start(startInput);
  report.jobId = started.jobId;
  let view = await service.followup({ jobId: started.jobId });
  for (let index = 0; index < 6_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: started.jobId });
  }
  report.jobPhase = view.phase;
  report.attemptId = 'attemptId' in view ? view.attemptId : null;
  report.hostError = 'hostError' in view ? view.hostError : null;
  step('delegation', { phase: report.jobPhase, attemptId: report.attemptId });

  /** 5. The ORDINARY governed path: gate -> promotion -> head reconciliation. */
  const attemptId = report.attemptId;
  if (attemptId !== null) {
    for (let index = 0; index < 12; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next') break;
      controller.step();
    }
    await controller.gate({ attemptId, predicate: 'tests_pass', command: ['node', '-e', 'process.exit(0)'] });
    for (let index = 0; index < 12; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next') break;
      controller.step();
    }
    const record = controller.attemptWorkRecord(attemptId);
    const eligibility = controller.promotionEligibility(attemptId);
    report.attemptState = record?.state ?? null;
    report.eligibility = { eligible: eligibility.eligible, blockers: eligibility.blockers ?? [] };
    if (eligibility.eligible && record?.report !== null && record?.report !== undefined) {
      await controller.promote(attemptId, String(record.report.result_commit), eligibility.canonicalExpectedHead);
      controller.step();
      report.promoted = true;
    } else {
      report.promoted = false;
    }
    await controller.reconcileProjectHead({ operator: true });
  }

  /** 6. The promoted source is read back OUT of the durable repository. */
  report.finalHead = git(spec.repo, ['rev-parse', 'HEAD']);
  report.source = git(spec.repo, ['show', 'HEAD:src/ledger.mjs']);
  report.sourceDigest = sha256(report.source);
  report.projectRevision = controller.work.project().revision;
  report.requirements = controller.work.project().requirements.map((entry) => entry.statement);

  /** The visible oracle is ordinary PROJECT VERIFICATION, run outside the world. */
  try {
    const output = execFileSync('node', ['test/check.js'], { cwd: spec.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    report.visibleOracle = { ok: /ok/u.test(output), detail: output.trim().slice(0, 200) };
  } catch (error) {
    report.visibleOracle = { ok: false, detail: String(error?.stdout ?? error?.message ?? error).slice(0, 200) };
  }

  /** 7. §10: the RESEARCH diagnostic oracle, applied to the bytes the repository holds, in THIS process. */
  const scratch = join(spec.workRoot, 'diagnostic');
  mkdirSync(scratch, { recursive: true });
  writeFileSync(join(scratch, 'ledger.mjs'), report.source, 'utf8');
  /** The support modules keep their own names, because the promoted source imports them by relative path. */
  for (const [name, content] of Object.entries(spec.supportFiles)) writeFileSync(join(scratch, name), content, 'utf8');
  const candidate = await import(`${pathToFileURL(join(scratch, 'ledger.mjs')).href}?v=${String(Date.now())}`);
  const vector = diagnosticVector(candidate);
  report.diagnostic = {
    classPass: vector.classPass,
    failedClasses: vector.failedClasses,
    coverage: vector.coverage,
    classes: vector.classes.map((entry) => ({ classId: entry.classId, invariant: entry.invariant, lesson: entry.lesson, prepaid: entry.prepaid, pass: entry.pass, failures: entry.failures })),
  };

  /** 8. The model-visible payload, so the arm's delivery can be witnessed from the consumer side. */
  report.payload = existsSync(payloadSink) ? JSON.parse(readFileSync(payloadSink, 'utf8')) : null;
  report.transcriptBytes = existsSync(transcript) ? readFileSync(transcript).length : 0;

  /**
   * §20: the provider-reported token usage, read from THIS generation's durable session artifact. The reader is
   * the one the R3-A2 stage built for the multi-frame zstd artifact, so the numbers are the provider's and not a
   * reconstruction.
   */
  try {
    const telemetry = await import(pathToFileURL(join(REPO_ROOT, 'scripts', 'r3a2', 'telemetry.mjs')).href);
    const read = telemetry.readSessionTelemetry(spec.dshHome, { modelId: spec.modelId ?? 'deepseek-flash' });
    report.usage = read.usage;
    report.cost = read.cost;
    report.usageNote = read.note;
  } catch (error) {
    report.usage = null;
    report.usageNote = `the session telemetry could not be read: ${String(error?.message ?? error).slice(0, 160)}`;
  }

  /** The governed pull: the generation records whether the CAPITALIZED arm's handles resolve. */
  if (attemptId !== null && report.payload !== null) {
    const pulls = [];
    for (const handle of (report.payload.handles ?? []).map((entry) => entry.handle)) {
      try {
        const response = await controller.fetchContext(attemptId, handle);
        pulls.push({ handle, resolved: response !== null && response !== undefined, bodyBytes: response?.body === undefined ? 0 : JSON.stringify(response.body).length });
      } catch (error) {
        pulls.push({ handle, resolved: false, error: String(error?.message ?? error).slice(0, 120) });
      }
    }
    report.governedPulls = pulls;
  }

  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error?.stack ?? error).slice(0, 4000);
} finally {
  if (installed !== null) await installed.dispose().catch(() => undefined);
}

report.endedAt = new Date().toISOString();
writeFileSync(spec.reportPath, JSON.stringify(report, null, 2), 'utf8');
process.stdout.write(`GENERATION_DONE ${spec.generation} ${spec.arm} ok=${String(report.ok)}${NL}`);
