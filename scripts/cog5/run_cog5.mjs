#!/usr/bin/env node
/**
 * COG-5 deterministic mechanism runs.
 *
 *   node scripts/cog5/run_cog5.mjs --scenario=main        --run=../.cog5-rig/main
 *   node scripts/cog5/run_cog5.mjs --scenario=newsletter  --run=../.cog5-rig/newsletter
 *   node scripts/cog5/run_cog5.mjs --scenario=outofscope  --run=../.cog5-rig/outofscope
 *
 * `main` exercises the lawful source intake, the packaged/expert observation comparison, the governed rework
 * and a genuine D2 execution on the accepted basis. `newsletter` isolates the unrelated-change control.
 * `outofscope` isolates the completion contract's write-scope refusal.
 *
 * The worker is deterministic and test-owned; no model is called. Every world and state directory is under
 * the run directory. No real repository, runtime home or credential is touched.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import {
  RIG,
  SCENARIO,
  applyDirectUpdate,
  attemptOf,
  basisOf,
  buildWorld,
  createInstall,
  deterministicWorker,
  driveTask,
  expertAssess,
  git,
  packagedInspect,
  promotionFactsOf,
  readResultFile,
  resultOf,
  seedProject,
  sha256File,
  worldHead,
  writeJson,
} from "./rig5.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const SCENARIO_NAME = String(args.get("scenario") ?? "main");
if (!["main", "newsletter", "outofscope"].includes(SCENARIO_NAME)) {
  throw new Error("--scenario=main|newsletter|outofscope is required");
}
const RUN = resolve(String(args.get("run") ?? join(RIG, SCENARIO_NAME)));
const PROJECT = "sablewick";
const WORK = join(RUN, "work");
const STATE = join(RUN, "state");

if (existsSync(RUN)) rmSync(RUN, { recursive: true, force: true });
mkdirSync(RUN, { recursive: true });

const CANDIDATE = {
  name: "vendor-capabilities-2026-02-10.csv",
  sourcePath: join(SCENARIO, "candidates", "vendor-capabilities-2026-02-10.csv"),
  origin: "programme-office batch 2026-02-10 (test-owned immutable snapshot)",
};
CANDIDATE.digest = sha256File(CANDIDATE.sourcePath);

const TECHNICAL = {
  task_id: "technical-fit",
  objective:
    "Select a compliant battery vendor for each of the three sites from sources/vendor-capabilities.csv and sources/sites.md, and record the selection and its deciding constraint in deliverables/technical-fit.md.",
  depends_on: [],
  write_paths: ["deliverables/technical-fit.md"],
  required_artifacts: ["deliverables/technical-fit.md"],
};

const INTAKE = {
  task_id: "intake-vendor-2026-02-10",
  objective:
    "Accept the exact external vendor-capability revision dated 2026-02-10 from the programme-office snapshot into sources/vendor-capabilities.csv. Apply the candidate's bytes exactly; modify no other path.",
  depends_on: [],
  write_paths: ["sources/vendor-capabilities.csv"],
  required_artifacts: ["sources/vendor-capabilities.csv"],
};

const STAGE_GRAPH = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 2 },
    { id: "verifying", state: "VERIFYING", concurrency: 2 },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: [
    { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "verifying", event: "TASK_READY", to: "READY", when: "rework-admitted" },
    { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "cog5-spec",
  reason: "two independent work pieces must reach VERIFYING together so the continuation can be isolated from scheduling",
};

const record = {
  schema: "cog5-run/v1",
  scenario: SCENARIO_NAME,
  startedAt: new Date().toISOString(),
  process: { pid: process.pid, node: process.version, platform: process.platform },
  deterministicWorker: true,
  workerNote:
    "The Work Results are produced by a deterministic test-owned worker, not a model. The Work lifecycle, completion evaluation, basis capture, promotion, head reconciliation and packaged continuation are the real product paths.",
  projectId: PROJECT,
  workDir: WORK,
  stateDir: STATE,
  intakeCandidate: { ...CANDIDATE, sourcePathInEvidence: `scripts/cog5/scenario/candidates/${CANDIDATE.name}` },
  initialHead: null,
  scenarioDigests: {},
  tasks: {},
  results: {},
  packagedInspection: {},
  expertDiagnostic: {},
  promotions: {},
  head: {},
  rework: {},
  negativeControls: {},
  errors: [],
  finishedAt: null,
};

function capture(label, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    record.errors.push({ label, detail });
    return { ok: false, error: detail };
  }
}

async function captureAsync(label, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    record.errors.push({ label, detail });
    return { ok: false, error: detail };
  }
}

/** An EXPECTED refusal: recorded as a control, never counted as a run error. */
async function captureRefusal(label, fn) {
  try {
    return { refused: false, value: await fn() };
  } catch (error) {
    return { refused: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function taskState(installed, taskId) {
  return installed.controller.work.task(taskId)?.state ?? null;
}

function headState(installed) {
  const project = installed.controller.work.project();
  return {
    projectRevision: project.revision,
    projectHead: project.head_commit,
    liveHead: worldHead(WORK),
    headStatus: installed.controller.work.project()?.head_commit === null ? null : undefined,
  };
}

function describeTask(installed, taskId) {
  const task = installed.controller.work.task(taskId);
  return task === null
    ? null
    : {
        taskId: task.taskId,
        state: task.state,
        batchActivationEventId: task.batchActivationEventId ?? null,
        envelopeId: task.envelopeId ?? null,
        lastEventId: task.lastEventId ?? null,
      };
}

function recordResult(installed, taskId, driven) {
  const attemptId = driven.attemptId;
  record.tasks[taskId] = { driven, task: describeTask(installed, taskId), attempt: attemptOf(installed, taskId) };
  if (typeof attemptId !== "string") return null;
  const result = resultOf(installed, attemptId);
  const writePath = taskId === "technical-fit" ? "deliverables/technical-fit.md" : "sources/vendor-capabilities.csv";
  record.results[taskId] = {
    attemptId,
    basis: basisOf(installed, attemptId),
    result,
    content: readResultFile(WORK, installed, attemptId, writePath),
    taskState: taskState(installed, taskId),
    attemptState: attemptOf(installed, taskId)?.state ?? null,
    promotionFacts: promotionFactsOf(installed, attemptId),
  };
  return attemptId;
}

async function followJob(installed, jobId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await installed.workDelegation.followup({ jobId });
    if (view.phase === "FINISHED" || view.phase === "HOST_ERROR" || view.phase === "UNKNOWN") return view;
    if (Date.now() > deadline) return { jobId, phase: "TIMEOUT", detail: "the job did not reach a terminal phase" };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
}

function promote(installed, attemptId, resultCommit, expectedHead, label) {
  const outcome = installed.controller.promote(attemptId, resultCommit, expectedHead);
  const stepped = capture(`step:${label}`, () => installed.controller.step()?.event_type ?? null);
  return { label, attemptId, resultCommit, expectedHead, outcome, stepped, task: describeTask(installed, installed.controller.work.taskForAttempt?.(attemptId)?.taskId ?? "") };
}

/* ================================================================== *
 * Scenario: the main lawful-intake and executable-continuation path.
 * ================================================================== */
async function runMain() {
  const tasks = [TECHNICAL, INTAKE];
  buildWorld(WORK);
  record.initialHead = worldHead(WORK);
  record.scenarioDigests = Object.fromEntries(
    [
      "sources/brief.md",
      "sources/vendor-capabilities.csv",
      "sources/vendor-pricing.csv",
      "sources/sites.md",
      "sources/rollout-windows.md",
      "sources/prior-notes.md",
      "sources/newsletter.md",
      "verify.mjs",
    ].map((path) => [path, sha256File(join(WORK, path))]),
  );

  const installed = await createInstall({
    workDir: WORK,
    stateDir: STATE,
    projectId: PROJECT,
    intake: CANDIDATE,
    workerMode: "normal",
  });
  record.install = { adapters: installed.capabilities ?? null, hasContinuation: installed.continuation !== undefined, hasDelegation: installed.workDelegation !== undefined };
  const start = seedProject(installed, {
    projectId: PROJECT,
    goal: "Select compliant battery vendors for three community sites and produce a costed installation schedule within the grant conditions.",
    tasks,
    headCommit: record.initialHead,
    stageGraph: STAGE_GRAPH,
  });
  record.seed = { revision: start.revision ?? null, projectHead: installed.controller.work.project().head_commit, liveHead: worldHead(WORK) };

  /* ── 1. the technical result at H0 (the future stale candidate) ── */
  const technicalDriven = await driveTask(installed, "technical-fit");
  const technicalAttempt = recordResult(installed, "technical-fit", technicalDriven);
  record.packagedInspection["technical-fit"] = {
    beforeChange: capture("inspect:technical:before", () => packagedInspect(installed, technicalAttempt)),
  };
  record.expertDiagnostic["technical-fit"] = {
    beforeChange: await captureAsync("expert:technical:before", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: technicalAttempt,
        readPaths: ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"],
        projectSemantic: "observed",
      }),
    ),
  };

  /* ── 2. the lawful intake Work Result at H0 ── */
  const intakeDriven = await driveTask(installed, "intake-vendor-2026-02-10");
  const intakeAttempt = recordResult(installed, "intake-vendor-2026-02-10", intakeDriven);
  record.packagedInspection["intake-vendor-2026-02-10"] = {
    beforePromotion: capture("inspect:intake:beforePromotion", () => packagedInspect(installed, intakeAttempt)),
  };

  /* ── 3. normal operator Promotion; the accepted head becomes H1 ── */
  const h0 = installed.controller.work.project().head_commit;
  const intakeResult = resultOf(installed, intakeAttempt);
  /* Controls BEFORE the real promotion: the caller cannot name a different source or a different head. */
  record.negativeControls.wrongSourceCommit = await captureRefusal("promote:intake:wrongSource", () =>
    installed.controller.promote(intakeAttempt, record.initialHead, h0),
  );
  record.negativeControls.wrongExpectedHead = await captureRefusal("promote:intake:wrongHead", () =>
    installed.controller.promote(intakeAttempt, intakeResult.resultCommit, "0".repeat(40)),
  );
  record.promotions.intake = {
    before: { projectHead: h0, liveHead: worldHead(WORK), task: describeTask(installed, "intake-vendor-2026-02-10") },
    call: await captureAsync("promote:intake", () =>
      installed.controller.promote(
        intakeAttempt,
        intakeResult.resultCommit,
        h0,
      ),
    ),
  };
  if (record.promotions.intake.call.ok === true) {
    record.promotions.intake.step = capture("step:intake", () => installed.controller.step()?.event_type ?? null);
    record.promotions.intake.after = {
      projectHead: installed.controller.work.project().head_commit,
      liveHead: worldHead(WORK),
      task: describeTask(installed, "intake-vendor-2026-02-10"),
      facts: promotionFactsOf(installed, intakeAttempt),
    };
    record.promotions.intake.acceptedContentDigest = sha256File(join(WORK, "sources", "vendor-capabilities.csv"));
    record.promotions.intake.candidateDigest = CANDIDATE.digest;
    record.promotions.intake.contentMatchesCandidate =
      record.promotions.intake.acceptedContentDigest === CANDIDATE.digest;
    /**
     * The working-tree digest is EOL-normalized by Git on this platform; the committed BLOB is the immutable
     * artifact that must equal the approved candidate. Record both, and label which one is authoritative.
     */
    const acceptedFact = record.promotions.intake.after.facts[0];
    if (acceptedFact !== undefined) {
      const blob = execFileSync("git", ["show", `${acceptedFact.resultingHeadCommit}:sources/vendor-capabilities.csv`], {
        cwd: WORK,
      });
      record.promotions.intake.acceptedBlobDigest = createHash("sha256").update(blob).digest("hex");
      record.promotions.intake.blobMatchesCandidate =
        record.promotions.intake.acceptedBlobDigest === CANDIDATE.digest;
      record.promotions.intake.workingTreeMatchesCandidate = record.promotions.intake.contentMatchesCandidate;
      record.promotions.intake.digestNote =
        "the committed blob is the authoritative comparison; the working-tree file may be EOL-normalized by Git on Windows";
      const { gitAncestryProbe, resolvePromotionBaseline } = await import("../../dist/src/deployment/promotion_lineage.js");
      const probe = gitAncestryProbe(WORK);
      record.promotions.intake.lineage = {
        resultCommit: resultOf(installed, intakeAttempt).resultCommit,
        resultInAcceptedHead: probe({
          ancestor: resultOf(installed, intakeAttempt).resultCommit,
          descendant: acceptedFact.resultingHeadCommit,
        }),
        expectedHeadInAcceptedHead: probe({
          ancestor: acceptedFact.expectedHeadCommit,
          descendant: acceptedFact.resultingHeadCommit,
        }),
        acceptedHeadInCurrent: probe({
          ancestor: acceptedFact.resultingHeadCommit,
          descendant: worldHead(WORK),
        }),
      };
      record.promotions.intake.resolvedBaseline = resolvePromotionBaseline({
        attemptId: intakeAttempt,
        resultCommit: resultOf(installed, intakeAttempt).resultCommit,
        currentSourceRevision: worldHead(WORK),
        promotionFacts: record.promotions.intake.after.facts,
        provesAncestry: probe,
      });
    }
    record.negativeControls.duplicatePromotion = await captureAsync("promote:intake:duplicate", () =>
      installed.controller.promote(intakeAttempt, resultOf(installed, intakeAttempt).resultCommit, h0),
    );
  }

  /* ── 4. head reconciliation is blocked while the technical candidate is VERIFYING ── */
  record.head.reconcileBeforeRework = await captureAsync("reconcile:beforeRework", () =>
    installed.controller.reconcileProjectHead(),
  );

  /* ── 5. packaged and expert applicability after the lawful intake ── */
  const technicalInspectionAfterIntake = packagedInspect(installed, technicalAttempt);
  record.packagedInspection["technical-fit"].afterIntake = { ok: true, value: technicalInspectionAfterIntake };
  record.packagedInspection["intake-vendor-2026-02-10"].afterPromotion = capture(
    "inspect:intake:afterPromotion",
    () => packagedInspect(installed, intakeAttempt),
  );
  record.expertDiagnostic["technical-fit"].afterIntake = await captureAsync("expert:technical:afterIntake", () =>
    expertAssess({
      installed,
      workDir: WORK,
      stateDir: STATE,
      attemptId: technicalAttempt,
      readPaths: ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"],
      projectSemantic: "observed",
    }),
  );
  record.expertDiagnostic["intake-vendor-2026-02-10"] = {
    originIntervalPreFixBehaviour: await captureAsync("expert:intake:origin", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: intakeAttempt,
        readPaths: ["sources/vendor-capabilities.csv"],
        projectSemantic: "observed",
        changeFrom: "origin",
      }),
    ),
    acceptedHeadWithTestFacets: await captureAsync("expert:intake:promoted", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: intakeAttempt,
        readPaths: ["sources/vendor-capabilities.csv"],
        projectSemantic: "observed",
        changeFrom: "promoted-head",
      }),
    ),
    acceptedHeadWithUnavailableSemantic: await captureAsync("expert:intake:promotedUnknown", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: intakeAttempt,
        readPaths: ["sources/vendor-capabilities.csv"],
        projectSemantic: "unavailable",
        changeFrom: "promoted-head",
      }),
    ),
  };

  /* ── 6. the governed rework: the service mints the permit, reopens, reconciles and delegates ── */
  if (technicalInspectionAfterIntake.assessment !== null) {
    const digest = technicalInspectionAfterIntake.assessment.assessmentDigest;
    record.rework = {
      inspectionDigest: digest,
      availableActions: technicalInspectionAfterIntake.availableActions,
      start: await captureAsync("startRework:technical", () =>
        installed.continuation.startRework({
          result: { kind: "ATTEMPT_RESULT", ref: technicalAttempt },
          expectedAssessmentDigest: digest,
        }),
      ),
    };
    if (record.rework.start.ok === true) {
      record.rework.startValue = record.rework.start.value;
      record.rework.taskAfterStart = describeTask(installed, "technical-fit");
      record.rework.headAfterStart = {
        projectHead: installed.controller.work.project().head_commit,
        liveHead: worldHead(WORK),
      };
      const jobId = record.rework.start.value.jobId;
      if (typeof jobId === "string") {
        record.rework.job = await followJob(installed, jobId);
        record.rework.stepAfterJob = capture("step:afterReworkJob", () => installed.controller.step()?.event_type ?? null);
        record.rework.attempt = attemptOf(installed, "technical-fit");
        if (record.rework.attempt !== null) {
          record.rework.result = resultOf(installed, record.rework.attempt.attemptId);
          record.rework.content = readResultFile(WORK, installed, record.rework.attempt.attemptId, "deliverables/technical-fit.md");
          record.rework.basis = basisOf(installed, record.rework.attempt.attemptId);
          record.rework.taskAfterJob = describeTask(installed, "technical-fit");
        }
        /* Promote the new result on its own accepted basis (H1 -> H2). */
        const newAttempt = record.rework.attempt;
        const newResult = newAttempt === null ? null : resultOf(installed, newAttempt.attemptId);
        if (newAttempt !== null && newResult?.resultCommit != null) {
          const expectedHead = installed.controller.work.project().head_commit;
          record.rework.promotion = {
            before: { projectHead: expectedHead, liveHead: worldHead(WORK) },
            call: await captureAsync("promote:rework", () =>
              installed.controller.promote(newAttempt.attemptId, newResult.resultCommit, expectedHead),
            ),
          };
          if (record.rework.promotion.call.ok === true) {
            record.rework.promotion.step = capture("step:rework", () => installed.controller.step()?.event_type ?? null);
            record.rework.promotion.after = {
              projectHead: installed.controller.work.project().head_commit,
              liveHead: worldHead(WORK),
              task: describeTask(installed, "technical-fit"),
              facts: promotionFactsOf(installed, newAttempt.attemptId),
            };
            record.rework.reconcileAfterPromotion = await captureAsync("reconcile:afterRework", () =>
              installed.controller.reconcileProjectHead(),
            );
          }
        }
      }
    }
  }

  /* ── 7. the preserved negative control: an unauthorized live head is not adopted ── */
  record.negativeControls.unauthorizedHead = await captureAsync("control:unauthorizedHead", async () => {
    const currentTasks = [TECHNICAL, INTAKE, {
      task_id: "post-control",
      objective: "A control task that must never start on an unauthorized live head.",
      depends_on: [],
      write_paths: ["deliverables/post-control.md"],
      required_artifacts: ["deliverables/post-control.md"],
    }];
    const planned = installed.controller.plan({
      tasks: currentTasks,
      reason: "COG-5 HEAD_BASIS_MISMATCH control: add a READY task at the canonical head",
    });
    const before = {
      plannedEvent: planned.event_type,
      projectHead: installed.controller.work.project().head_commit,
      liveHead: worldHead(WORK),
      task: describeTask(installed, "post-control"),
    };
    const update = applyDirectUpdate(WORK, {
      target: "sources/newsletter.md",
      source: join(SCENARIO, "candidates", "newsletter-2026-02-12.md"),
      message: "control 2026-02-12: direct external commit (unauthorized)",
    });
    const started = await installed.workDelegation.start({ expectedTaskId: "post-control" });
    const view = await followJob(installed, started.jobId, 30_000);
    return {
      before,
      update,
      start: started,
      job: view,
      attempt: attemptOf(installed, "post-control"),
      taskAfter: describeTask(installed, "post-control"),
      projectHeadAfter: installed.controller.work.project().head_commit,
      liveHeadAfter: worldHead(WORK),
    };
  });

  record.final = {
    projectHead: installed.controller.work.project().head_commit,
    liveHead: worldHead(WORK),
    tasks: Object.fromEntries(tasks.map((task) => [task.task_id, describeTask(installed, task.task_id)])),
    events: installed.controller.store.listEvents(PROJECT).map((event) => ({
      eventId: Number(event.event_id),
      type: event.event_type,
      entityId: event.entity_id,
      revision: event.expected_project_revision,
    })),
  };
  await installed.dispose();
}

/* ================================================================== *
 * Scenario: the unrelated-change control on its own world.
 * ================================================================== */
async function runNewsletter() {
  buildWorld(WORK);
  record.initialHead = worldHead(WORK);
  const installed = await createInstall({
    workDir: WORK,
    stateDir: STATE,
    projectId: PROJECT,
    intake: CANDIDATE,
    workerMode: "normal",
  });
  seedProject(installed, {
    projectId: PROJECT,
    goal: "Select compliant battery vendors for three community sites and produce a costed installation schedule within the grant conditions.",
    tasks: [TECHNICAL],
    headCommit: record.initialHead,
    stageGraph: STAGE_GRAPH,
  });
  const driven = await driveTask(installed, "technical-fit");
  const attemptId = recordResult(installed, "technical-fit", driven);
  record.packagedInspection["technical-fit"] = {
    beforeChange: capture("inspect:technical:beforeNewsletter", () => packagedInspect(installed, attemptId)),
  };
  record.updates = {
    newsletter: capture("direct:newsletter", () =>
      applyDirectUpdate(WORK, {
        target: "sources/newsletter.md",
        source: join(SCENARIO, "candidates", "newsletter-2026-02-12.md"),
        message: "control 2026-02-12: unrelated communications update",
      }),
    ),
  };
  record.packagedInspection["technical-fit"].afterNewsletter = capture("inspect:technical:afterNewsletter", () =>
    packagedInspect(installed, attemptId),
  );
  record.expertDiagnostic["technical-fit"] = {
    unrelatedChangeWithTestFacets: await captureAsync("expert:technical:newsletter", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId,
        readPaths: ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"],
        projectSemantic: "observed",
      }),
    ),
    unrelatedChangeWithUnavailableSemantic: await captureAsync("expert:technical:newsletterUnknown", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId,
        readPaths: ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"],
        projectSemantic: "unavailable",
      }),
    ),
  };
  record.final = {
    projectHead: installed.controller.work.project().head_commit,
    liveHead: worldHead(WORK),
    task: describeTask(installed, "technical-fit"),
  };
  await installed.dispose();
}

/* ================================================================== *
 * Scenario: the unapproved-write control, judged by the completion contract.
 * ================================================================== */
async function runOutOfScope() {
  buildWorld(WORK);
  record.initialHead = worldHead(WORK);
  const installed = await createInstall({
    workDir: WORK,
    stateDir: STATE,
    projectId: PROJECT,
    intake: CANDIDATE,
    workerMode: "out-of-scope",
  });
  seedProject(installed, {
    projectId: PROJECT,
    goal: "Select compliant battery vendors for three community sites and produce a costed installation schedule within the grant conditions.",
    tasks: [TECHNICAL],
    headCommit: record.initialHead,
    stageGraph: STAGE_GRAPH,
  });
  const driven = await driveTask(installed, "technical-fit");
  record.tasks["technical-fit"] = { driven, task: describeTask(installed, "technical-fit"), attempt: attemptOf(installed, "technical-fit") };
  record.results["technical-fit"] = {
    attemptId: driven.attemptId,
    result: driven.attemptId === null ? null : resultOf(installed, driven.attemptId),
    attemptState: driven.attemptId === null ? null : attemptOf(installed, "technical-fit")?.state ?? null,
    taskState: taskState(installed, "technical-fit"),
  };
  record.events = installed.controller.store.listEvents(PROJECT).map((event) => ({
    eventId: Number(event.event_id),
    type: event.event_type,
    entityId: event.entity_id,
  }));
  record.final = {
    projectHead: installed.controller.work.project().head_commit,
    liveHead: worldHead(WORK),
    task: describeTask(installed, "technical-fit"),
  };
  await installed.dispose();
}

try {
  if (SCENARIO_NAME === "main") await runMain();
  else if (SCENARIO_NAME === "newsletter") await runNewsletter();
  else await runOutOfScope();
  record.exitCode = 0;
} catch (error) {
  record.exitCode = 1;
  record.fatal = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  record.finishedAt = new Date().toISOString();
  writeJson(join(RUN, "run.json"), record);
  const summary = {
    scenario: SCENARIO_NAME,
    exitCode: record.exitCode,
    errorCount: record.errors.length,
    fatal: record.fatal ?? null,
    initialHead: record.initialHead,
    promotions: record.promotions?.intake?.call?.ok === true
      ? {
          promotionId: record.promotions.intake.call.value?.promotionId ?? null,
          resultingHeadCommit: record.promotions.intake.call.value?.resultingHeadCommit ?? null,
          blobMatchesCandidate: record.promotions.intake.blobMatchesCandidate ?? null,
          resolvedBaseline: record.promotions.intake.resolvedBaseline ?? null,
        }
      : null,
    packaged: record.packagedInspection,
    expertOutcomes: Object.fromEntries(
      Object.entries(record.expertDiagnostic ?? {}).map(([key, value]) => [
        key,
        Object.fromEntries(
          Object.entries(value).map(([label, result]) => [label, result?.ok === true ? result.value.outcome : { error: result?.error ?? null }]),
        ),
      ]),
    ),
    rework: record.rework?.start?.ok === true
      ? {
          state: record.rework.start.value.state,
          jobId: record.rework.start.value.jobId ?? null,
          headSynced: record.rework.start.value.headSynced,
          jobPhase: record.rework.job?.phase ?? null,
          attempt: record.rework.attempt,
          result: record.rework.result,
          promotion: record.rework.promotion?.call?.ok === true ? record.rework.promotion.call.value : null,
        }
      : record.rework?.start ?? null,
    negativeControls: {
      duplicatePromotion: record.negativeControls.duplicatePromotion ?? null,
      wrongSourceCommit: record.negativeControls.wrongSourceCommit ?? null,
      wrongExpectedHead: record.negativeControls.wrongExpectedHead ?? null,
      unauthorizedHead: record.negativeControls.unauthorizedHead?.ok === true
        ? {
            before: record.negativeControls.unauthorizedHead.value.before,
            update: record.negativeControls.unauthorizedHead.value.update,
            job: record.negativeControls.unauthorizedHead.value.job,
            attempt: record.negativeControls.unauthorizedHead.value.attempt,
            taskAfter: record.negativeControls.unauthorizedHead.value.taskAfter,
          }
        : record.negativeControls.unauthorizedHead ?? null,
    },
    final: record.final ?? null,
  };
  writeJson(join(RUN, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
}
