/**
 * COG-6 runner — the frozen deterministic mechanism arm and its controls.
 *
 * Usage:
 *   node scripts/cog6/run_cog6.mjs --scenario=mechanism --run=<fresh directory>
 *   node scripts/cog6/run_cog6.mjs --scenario=outofscope --run=<fresh directory>
 *   node scripts/cog6/run_cog6.mjs --scenario=irrelevant --run=<fresh directory>
 *
 * The run directory MUST be fresh. A previous run is never overwritten.
 *
 * This is NOT a model run and NOT an Agent run. The worker is deterministic; every operator call is
 * labelled. The real product owners are the Work delegation, completion, promotion, reconciliation,
 * workspace journal and packaged continuation.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANDIDATE_A,
  CANDIDATE_B,
  DUPLICATE_A,
  GOAL,
  NEWSLETTER,
  REQUIREMENTS,
  SEEDED_TASKS,
  STAGE_GRAPH,
  TASKS,
  applyDirectUpdate,
  attemptOf,
  attemptsOf,
  authorizeIntake,
  basisOf,
  buildInbox,
  buildWorld,
  createInstall,
  describeTask,
  digest,
  digestTree,
  domainRubric,
  driveTask,
  ensureDir,
  evaluateRequirementProposal,
  followJob,
  git,
  journalOf,
  makeRecorder,
  packagedInspect,
  planWithExtraTask,
  projectSnapshot,
  promote,
  promotionFactsOf,
  reconcile,
  resultOf,
  seedJournal,
  seedProject,
  sha256File,
  worldHead,
  writeJson,
} from "./rig6.mjs";

function parseArgs(argv) {
  const options = { scenario: "mechanism", run: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--scenario=")) options.scenario = arg.slice("--scenario=".length);
    else if (arg.startsWith("--run=")) options.run = arg.slice("--run=".length);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (options.run === null) throw new Error("--run=<fresh directory> is required");
  return options;
}

function requireFresh(dir) {
  if (existsSync(dir)) throw new Error(`the run directory ${dir} already exists; a previous run is never overwritten`);
  ensureDir(dir);
}

function stateDirFor(runDir) {
  return join(runDir, "state");
}

function worldDirFor(runDir) {
  return join(runDir, "world");
}

function inboxDirFor(runDir) {
  return join(runDir, "programme-inbox");
}

function eventsOf(installed) {
  return installed.controller.store.listEvents(installed.controller.projectId).map((event) => ({
    eventId: Number(event.event_id),
    type: event.event_type,
    entityId: event.entity_id,
    entityType: event.entity_type,
    revision: event.expected_project_revision,
    payload: summarizePayload(event.payload),
  }));
}

function summarizePayload(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (key === "project_ir") {
      out.project_ir = { revision: value.revision, digest: value.digest, head_commit: value.head_commit };
    } else if (key === "attempt_report") {
      out.attempt_report = {
        result_commit: value.result_commit,
        changed_files: value.changed_files,
        worker_status: value.worker_status,
        summary: typeof value.summary === "string" ? value.summary.slice(0, 400) : value.summary,
      };
    } else if (key === "envelope") {
      out.envelope = { envelope_id: value.envelope_id, base_commit: value.base_commit, write_paths: value.write_paths };
    } else if (key === "evidence") {
      out.evidence = { evidence_id: value.evidence_id, predicate: value.predicate, status: value.status, exit_code: value.exit_code };
    } else if (key === "rework_provenance") {
      out.rework_provenance = value;
    } else if (key === "project_id" || key === "task_id" || key === "reason" || key === "state" || key === "previous_state" || key === "new_state") {
      out[key] = value;
    }
  }
  return out;
}

async function withInstall(runDir, { workerMode = "auto", candidate } = {}) {
  const world = worldDirFor(runDir);
  const state = stateDirFor(runDir);
  buildWorld(world);
  const installed = await createInstall({
    projectId: "sablewick",
    workDir: world,
    stateDir: state,
    candidate,
    workerMode,
  });
  return { world, state, installed };
}

async function seedHistoricalWork(installed, world, record, captureAsync, { includeCost = true } = {}) {
  const head0 = worldHead(world);
  record.initialHead = head0;
  record.seedStart = await captureAsync("seed:start", () =>
    seedProject(installed, {
      projectId: "sablewick",
      goal: GOAL,
      requirements: REQUIREMENTS,
      tasks: includeCost ? SEEDED_TASKS : [TASKS.technicalFit],
      headCommit: head0,
      stageGraph: STAGE_GRAPH,
    }),
  );
  const fit = await captureAsync("seed:drive:technical-fit", () => driveTask(installed, "technical-fit"));
  record.seedTechnical = fit;
  record.seedTechnicalAttempt = attemptOf(installed, "technical-fit");
  record.seedTechnicalResult = resultOf(installed, record.seedTechnicalAttempt?.attemptId ?? "");
  const fitPromotion = await captureAsync("seed:promote:technical-fit", () =>
    promote(installed, record.seedTechnicalAttempt.attemptId, record.seedTechnicalResult.resultCommit, head0),
  );
  record.seedTechnicalPromotion = fitPromotion;
  record.seedReconcile1 = await captureAsync("seed:reconcile:1", () => reconcile(installed));
  if (includeCost) {
    const cost = await captureAsync("seed:drive:cost-schedule", () => driveTask(installed, "cost-schedule"));
    record.seedCost = cost;
    const costAttempt = attemptOf(installed, "cost-schedule");
    const costResult = resultOf(installed, costAttempt?.attemptId ?? "");
    record.seedCostAttempt = costAttempt;
    record.seedCostResult = costResult;
    record.seedCostPromotion = await captureAsync("seed:promote:cost-schedule", () =>
      promote(installed, costAttempt.attemptId, costResult.resultCommit, installed.controller.work.project().head_commit),
    );
    record.seedReconcile2 = await captureAsync("seed:reconcile:2", () => reconcile(installed));
  }
  return { head: installed.controller.work.project().head_commit };
}

function copyEvidenceFile(from, to) {
  ensureDir(join(to, ".."));
  cpSync(from, to);
}

async function runMechanism(runDir, recorder) {
  const { record, capture, captureAsync } = recorder;
  const inbox = buildInbox(inboxDirFor(runDir));
  record.inbox = inbox;
  const { world, state, installed } = await withInstall(runDir, {
    candidate: {
      sourcePath: join(inbox.dir, CANDIDATE_A.relativePath),
      digest: CANDIDATE_A.digest,
      origin: CANDIDATE_A.origin,
    },
  });
  record.world = world;
  record.stateDir = state;
  record.candidateA = CANDIDATE_A;
  record.candidateB = CANDIDATE_B;
  record.duplicateA = DUPLICATE_A;

  const historical = await seedHistoricalWork(installed, world, record, captureAsync);
  record.journalSeed = await captureAsync("seed:journal", () => seedJournal(installed));
  record.seedCurrentTask = await captureAsync("seed:plan:technical-refresh", () =>
    planWithExtraTask(installed, TASKS.technicalRefresh, "seed: add the current technical refresh"),
  );
  record.initialSnapshot = await projectSnapshot(installed, world);
  record.initialSourceTree = digestTree(join(world, "sources"));
  record.initialCanonicalCapabilities = sha256File(join(world, "sources", "vendor-capabilities.csv"));
  if (record.initialCanonicalCapabilities !== "f81576167c284060eb494706e424204d99028823fe71bf56476883d49e4d9373") {
    throw new Error("the seeded capability file does not match the pre-candidate digest");
  }

  /* ── the operator authorises the exact candidate and creates the intake task ── */
  record.operatorAuthorization = authorizeIntake({
    candidate: CANDIDATE_A,
    approvedDigest: CANDIDATE_A.digest,
    targetPath: CANDIDATE_A.target,
    taskObjective: TASKS.intake.objective,
  });
  if (record.operatorAuthorization.approved !== true) throw new Error("the operator policy refused the frozen candidate");
  record.operatorRejectionB = authorizeIntake({
    candidate: CANDIDATE_B,
    approvedDigest: CANDIDATE_A.digest,
    targetPath: CANDIDATE_B.target,
    taskObjective: TASKS.intake.objective,
  });
  record.operatorDuplicate = authorizeIntake({
    candidate: DUPLICATE_A,
    approvedDigest: CANDIDATE_A.digest,
    targetPath: DUPLICATE_A.target,
    taskObjective: TASKS.intake.objective,
  });
  record.operatorRequirementRelaxation = evaluateRequirementProposal("Lower Site B to -2 C and drop the coastal warranty so V3 can be used.");
  record.requirementsBefore = (await projectSnapshot(installed, world)).requirementsDigest;

  record.intakeTask = await captureAsync("operator:plan:intake", () =>
    planWithExtraTask(installed, TASKS.intake, `operator: authorise the exact candidate ${CANDIDATE_A.candidateId} (${CANDIDATE_A.digest}) for ${CANDIDATE_A.target}`),
  );

  /* ── the current technical refresh runs first and is held, unpromoted, as a completed candidate ── */
  record.refreshOld = await captureAsync("work:technical-refresh:old-basis", () => driveTask(installed, "technical-refresh"));
  const refreshOldAttempt = attemptOf(installed, "technical-refresh");
  record.refreshOldAttempt = refreshOldAttempt;
  record.refreshOldResult = resultOf(installed, refreshOldAttempt?.attemptId ?? "");
  record.refreshOldBasis = basisOf(installed, refreshOldAttempt?.attemptId ?? "");
  record.refreshOldInspectionBeforeChange = capture("inspect:refresh:old-before-intake", () =>
    packagedInspect(installed, refreshOldAttempt.attemptId),
  );

  /* ── the authorised intake runs and is promoted ── */
  record.intakeWork = await captureAsync("work:intake:authorised", () => driveTask(installed, "intake-vendor-2026-02-10"));
  const intakeAttempt = attemptOf(installed, "intake-vendor-2026-02-10");
  const intakeResult = resultOf(installed, intakeAttempt?.attemptId ?? "");
  record.intakeAttempt = intakeAttempt;
  record.intakeResult = intakeResult;
  record.intakeBasis = basisOf(installed, intakeAttempt?.attemptId ?? "");
  const headBeforeIntakePromotion = installed.controller.work.project().head_commit;
  record.intakePromotion = {};
  record.intakePromotion.before = { projectHead: headBeforeIntakePromotion, liveHead: worldHead(world) };
  record.intakePromotion.wrongSource = await captureAsync("control:promote:intake:wrongSource", () =>
    installed.controller.promote(intakeAttempt.attemptId, headBeforeIntakePromotion, headBeforeIntakePromotion),
  );
  record.intakePromotion.wrongHead = await captureAsync("control:promote:intake:wrongHead", () =>
    installed.controller.promote(intakeAttempt.attemptId, intakeResult.resultCommit, "0".repeat(40)),
  );
  record.intakePromotion.call = await captureAsync("promote:intake", () =>
    promote(installed, intakeAttempt.attemptId, intakeResult.resultCommit, headBeforeIntakePromotion),
  );
  record.intakePromotion.after = {
    projectHead: installed.controller.work.project().head_commit,
    liveHead: worldHead(world),
    task: describeTask(installed, "intake-vendor-2026-02-10"),
  };
  record.intakePromotion.facts = promotionFactsOf(installed, intakeAttempt.attemptId);
  record.intakePromotion.duplicate = await captureAsync("control:promote:intake:duplicate", () =>
    installed.controller.promote(intakeAttempt.attemptId, intakeResult.resultCommit, headBeforeIntakePromotion),
  );
  const intakeFact = record.intakePromotion.facts[0];
  if (intakeFact === undefined) throw new Error("the intake promotion committed no fact");
  const acceptedHead = intakeFact.resultingHeadCommit;
  const acceptedBlob = execGitBlob(world, acceptedHead, "sources/vendor-capabilities.csv");
  record.acceptedCapabilities = {
    acceptedHead,
    workingTreeDigest: sha256File(join(world, "sources", "vendor-capabilities.csv")),
    committedBlobDigest: digest(acceptedBlob),
    candidateDigest: CANDIDATE_A.digest,
    equalsCandidate: digest(acceptedBlob) === CANDIDATE_A.digest,
  };

  /* ── the promoted effect cannot become the project head while a candidate is held ── */
  record.reconcileBeforeRework = await captureAsync("reconcile:beforeRework", () => reconcile(installed));

  /* ── the packaged continuation assesses the held result and mints its own rework permit ── */
  record.refreshOldInspectionAfterChange = capture("inspect:refresh:after-intake", () =>
    packagedInspect(installed, refreshOldAttempt.attemptId),
  );
  const inspection = record.refreshOldInspectionAfterChange.value;
  if (inspection?.assessment === null || inspection?.assessment === undefined) {
    throw new Error("the packaged continuation did not assess the held result");
  }
  record.rework = {};
  record.rework.start = await captureAsync("continuation:startRework", () =>
    installed.continuation.startRework({
      result: { kind: "ATTEMPT_RESULT", ref: refreshOldAttempt.attemptId },
      expectedAssessmentDigest: inspection.assessment.assessmentDigest,
    }),
  );
  const reworkStart = record.rework.start.value;
  if (reworkStart?.jobId !== null && reworkStart?.jobId !== undefined) {
    record.rework.job = await captureAsync("continuation:followJob", () => followJob(installed, reworkStart.jobId));
  }
  record.rework.reopenedTask = capture("rework:task", () => describeTask(installed, "technical-refresh"));
  record.rework.attempts = attemptsOf(installed, "technical-refresh");
  const reworkAttempt = attemptOf(installed, "technical-refresh");
  record.rework.attempt = reworkAttempt;
  record.rework.result = resultOf(installed, reworkAttempt?.attemptId ?? "");
  record.rework.basis = basisOf(installed, reworkAttempt?.attemptId ?? "");
  record.rework.stepAfterJob = capture("step:afterReworkJob", () => installed.controller.step()?.event_type ?? null);
  const headBeforeReworkPromotion = installed.controller.work.project().head_commit;
  record.rework.promotion = await captureAsync("promote:rework", () =>
    promote(installed, reworkAttempt.attemptId, record.rework.result.resultCommit, headBeforeReworkPromotion),
  );
  record.rework.reconcile = await captureAsync("reconcile:afterRework", () => reconcile(installed));
  record.rework.finalTask = capture("rework:finalTask", () => describeTask(installed, "technical-refresh"));

  /* ── independent domain rubric ── */
  record.rubric = await domainRubric({
    installed,
    workDir: world,
    attemptId: reworkAttempt.attemptId,
  });
  record.finalSnapshot = await projectSnapshot(installed, world);
  record.finalSourceTree = digestTree(join(world, "sources"));
  record.requirementsAfter = record.finalSnapshot.requirementsDigest;

  /* ── the direct external-commit control leaves the live head ahead ── */
  record.postControl = {};
  record.postControl.plan = await captureAsync("control:plan:postControl", () =>
    planWithExtraTask(installed, TASKS.postControl, "control: a task at the final accepted head"),
  );
  record.postControl.directCommit = capture("control:directExternalCommit", () =>
    applyDirectUpdate(world, {
      source: join(inbox.dir, CANDIDATE_B.relativePath),
      target: CANDIDATE_B.target,
      message: "control: an external commit that bypassed Work and Promotion",
    }),
  );
  record.postControl.drive = await captureAsync("control:drive:postControl", () => driveTask(installed, "post-control"));
  record.postControl.attempt = attemptOf(installed, "post-control");
  record.postControl.task = describeTask(installed, "post-control");
  record.postControl.projectHead = installed.controller.work.project().head_commit;
  record.postControl.liveHead = worldHead(world);

  return { world, installed };
}

function execGitBlob(workDir, commit, path) {
  return execFileSync("git", ["show", `${commit}:${path}`], { cwd: workDir, encoding: "utf8" });
}

async function runOutOfScope(runDir, recorder) {
  const { record, captureAsync } = recorder;
  const inbox = buildInbox(inboxDirFor(runDir));
  record.inbox = inbox;
  const { world, installed } = await withInstall(runDir, { workerMode: "out-of-scope" });
  const head0 = worldHead(world);
  record.initialHead = head0;
  record.seedStart = await captureAsync("outofscope:start", () =>
    seedProject(installed, {
      projectId: "sablewick",
      goal: GOAL,
      requirements: REQUIREMENTS,
      tasks: [TASKS.technicalRefresh],
      headCommit: head0,
      stageGraph: STAGE_GRAPH,
    }),
  );
  record.work = await captureAsync("outofscope:drive", () => driveTask(installed, "technical-refresh"));
  record.attempt = attemptOf(installed, "technical-refresh");
  record.result = record.attempt === null ? null : resultOf(installed, record.attempt.attemptId);
  record.finalSnapshot = await projectSnapshot(installed, world);
  record.status = "out-of-scope control complete";
  return { world, installed };
}

async function runIrrelevant(runDir, recorder) {
  const { record, capture, captureAsync } = recorder;
  const inbox = buildInbox(inboxDirFor(runDir));
  record.inbox = inbox;
  const { world, installed } = await withInstall(runDir);
  const head0 = worldHead(world);
  record.initialHead = head0;
  record.seedStart = await captureAsync("newsletter:start", () =>
    seedProject(installed, {
      projectId: "sablewick",
      goal: GOAL,
      requirements: REQUIREMENTS,
      tasks: [TASKS.technicalFit],
      headCommit: head0,
      stageGraph: STAGE_GRAPH,
    }),
  );
  record.work = await captureAsync("newsletter:drive", () => driveTask(installed, "technical-fit"));
  const attempt = attemptOf(installed, "technical-fit");
  record.attempt = attempt;
  record.result = resultOf(installed, attempt?.attemptId ?? "");
  record.beforeChange = capture("newsletter:inspect:before", () => packagedInspect(installed, attempt.attemptId));
  record.directUpdate = capture("newsletter:directUpdate", () =>
    applyDirectUpdate(world, {
      source: join(inbox.dir, NEWSLETTER.relativePath),
      target: "sources/newsletter.md",
      message: "control: an unrelated newsletter update arrives by direct commit",
    }),
  );
  record.afterChange = capture("newsletter:inspect:after", () => packagedInspect(installed, attempt.attemptId));
  record.finalSnapshot = await projectSnapshot(installed, world);
  record.status = "irrelevant-update control complete";
  return { world, installed };
}

async function writeRunArtifacts(runDir, scenario, record, installed, world) {
  writeJson(join(runDir, "run.json"), record);
  writeJson(join(runDir, "events.json"), eventsOf(installed));
  const log = git(["log", "--oneline", "--decorate", "--all"], world).split(/\r?\n/u).filter(Boolean);
  const status = git(["status", "--porcelain=v1", "-uall"], world);
  const files = {};
  for (const relative of ["sources/vendor-capabilities.csv", "deliverables/technical-fit.md", "deliverables/technical-refresh.md", "deliverables/cost-schedule.md"]) {
    const full = join(world, relative);
    if (existsSync(full)) {
      files[relative] = { digest: sha256File(full), text: readFileSync(full, "utf8") };
      copyEvidenceFile(full, join(runDir, "files", relative));
    }
  }
  writeJson(join(runDir, "worktree.json"), {
    head: worldHead(world),
    log,
    status,
    files,
    sourceTree: digestTree(join(world, "sources")),
  });
  writeJson(join(runDir, "candidates.json"), {
    inbox: record.inbox,
    candidateA: CANDIDATE_A,
    candidateB: CANDIDATE_B,
    duplicateA: DUPLICATE_A,
    acceptedBlob: record.acceptedCapabilities ?? null,
  });
  if (record.rubric !== undefined) writeJson(join(runDir, "rubric.json"), record.rubric);
  const summary = {
    schema: "cog6-run/v1",
    scenario,
    at: new Date().toISOString(),
    modelUsed: false,
    worker: "deterministic test-owned WorkWorkerRunPort (not a model, not the DSH subprocess worker)",
    agentUsed: false,
    note: scenario === "mechanism"
      ? "Operator-authored authorised intake plus deterministic execution. This is not an Agent discovery, proposal or approval."
      : "Deterministic control run; no model and no Agent.",
    initialHead: record.initialHead ?? null,
    finalHead: worldHead(world),
    projectHead: installed.controller.work.project().head_commit,
    taskStates: Object.fromEntries(installed.controller.work.taskStates().map((row) => [row.taskId, row.state])),
    requirementsDigest: digest(JSON.stringify(installed.controller.work.project().requirements)),
    journal: await journalOf(installed),
    promotionFacts: installed.controller.promotions.promotionFactsSync().map((fact) => ({
      promotionId: fact.promotionId,
      attemptId: fact.attemptId,
      sourceCommit: fact.sourceCommit,
      expectedHeadCommit: fact.expectedHeadCommit,
      resultingHeadCommit: fact.resultingHeadCommit,
    })),
    key: record.key ?? null,
  };
  writeJson(join(runDir, "summary.json"), summary);
  return summary;
}

async function main() {
  const options = parseArgs(process.argv);
  const runDir = options.run;
  requireFresh(runDir);
  const recorder = makeRecorder();
  let scenario = options.scenario;
  let installed;
  let world;
  try {
    if (scenario === "mechanism") {
      ({ installed, world } = await runMechanism(runDir, recorder));
    } else if (scenario === "outofscope") {
      ({ installed, world } = await runOutOfScope(runDir, recorder));
    } else if (scenario === "irrelevant") {
      ({ installed, world } = await runIrrelevant(runDir, recorder));
    } else {
      throw new Error(`unknown scenario ${scenario}`);
    }
    const summary = await writeRunArtifacts(runDir, scenario, recorder.record, installed, world);
    console.log(JSON.stringify({ ok: true, scenario, runDir, finalHead: summary.finalHead, projectHead: summary.projectHead, taskStates: summary.taskStates }));
  } catch (error) {
    recorder.record.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
    if (installed !== undefined && world !== undefined) {
      try {
        await writeRunArtifacts(runDir, scenario, recorder.record, installed, world);
      } catch {
        /* preserve the original failure */
      }
    } else {
      writeJson(join(runDir, "run.json"), recorder.record);
    }
    console.error(JSON.stringify({ ok: false, scenario, runDir, error: recorder.record.failure.message }));
    process.exitCode = 1;
  } finally {
    await installed?.dispose?.();
  }
}

main();
