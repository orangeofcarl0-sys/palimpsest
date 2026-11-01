#!/usr/bin/env node
/**
 * COG-4.1 — produce one REAL governed Work Result in a test-owned world, then run the PACKAGED
 * ResultContinuationService over it in the four target-world conditions.
 *
 * The worker is deterministic and is labelled as such. It is not a model. The Work lifecycle,
 * completion check, result commit, basis capture, continuation inspection and rework are the real
 * product paths.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  RIG,
  SCENARIO,
  applyUpdate,
  attemptOf,
  basisOf,
  buildWorld,
  createInstall,
  driveTask,
  expertAssess,
  git,
  readJson,
  readResultFile,
  resultOf,
  seedJournal,
  seedProject,
  sha256File,
  worldHead,
  writeJson,
} from "./rig4.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(RIG, "cross-basis")));
const PROJECT = "sablewick";
const WORK = join(RUN, "work");
const STATE = join(RUN, "state");

if (existsSync(RUN)) rmSync(RUN, { recursive: true, force: true });
mkdirSync(RUN, { recursive: true });

const TASKS = [
  {
    task_id: "technical-fit",
    objective:
      "Select a compliant battery vendor for each of the three sites from sources/vendor-capabilities.csv and sources/sites.md, and record the selection and its deciding constraint in deliverables/technical-fit.md.",
    depends_on: [],
    write_paths: ["deliverables/technical-fit.md"],
    required_artifacts: ["deliverables/technical-fit.md"],
  },
  {
    task_id: "cost-schedule",
    objective:
      "Produce the installation sequence and a low/high budget envelope for the three sites from sources/vendor-pricing.csv and sources/rollout-windows.md, within the grant conditions, in deliverables/cost-schedule.md.",
    depends_on: [],
    write_paths: ["deliverables/cost-schedule.md"],
    required_artifacts: ["deliverables/cost-schedule.md"],
  },
];

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
  declared_by: "cog4-spec",
  reason: "two independent work products must be able to reach VERIFYING together",
};

const JOURNAL = [  {
    kind: "NEGATIVE_RESULT",
    title: "2023 Marsh Lane trial failed",
    body: "A Kestrel (V2) unit trialled at Marsh Lane in January 2023 failed to start at -8 °C. Do not specify V2 for a site whose design minimum is below -5 °C.",
    provenance: "2023 trial review",
  },
  {
    kind: "OPEN_QUESTION",
    title: "Solaris cold-weather certificate not on file",
    body: "Solaris claims a cold-weather certificate for the V3 LTO unit. The certificate has been promised but is not on file. Treat the claim as unverified until the document is received.",
    provenance: "programme office",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "Grant conditions",
    body: "The grant is £120,000, requires a local installer, forbids fossil-fuel backup, requires a coastal-rated warranty at Site B, limits Site C to a unit no wider than 800 mm, and requires at least 8% contingency. All work must finish by 30 June 2026.",
    provenance: "grant award letter",
  },
];

buildWorld(WORK);
const initialHead = worldHead(WORK);
const installed = await createInstall({ workDir: WORK, stateDir: STATE, projectId: PROJECT });
const record = {
  schema: "cog4-work-result-run/v1",
  startedAt: new Date().toISOString(),
  projectId: PROJECT,
  deterministicWorker: true,
  workerNote: "The Work Result is produced by a deterministic test-owned worker, not a model. The Work lifecycle, completion check, basis capture and continuation are the real product paths.",
  workDir: WORK,
  stateDir: STATE,
  initialHead,
  scenarioDigests: {
    "sources/brief.md": sha256File(join(WORK, "sources", "brief.md")),
    "sources/vendor-capabilities.csv": sha256File(join(WORK, "sources", "vendor-capabilities.csv")),
    "sources/vendor-pricing.csv": sha256File(join(WORK, "sources", "vendor-pricing.csv")),
    "sources/sites.md": sha256File(join(WORK, "sources", "sites.md")),
    "sources/rollout-windows.md": sha256File(join(WORK, "sources", "rollout-windows.md")),
    "sources/prior-notes.md": sha256File(join(WORK, "sources", "prior-notes.md")),
    "sources/newsletter.md": sha256File(join(WORK, "sources", "newsletter.md")),
    "verify.mjs": sha256File(join(WORK, "verify.mjs")),
  },
  journal: [],
  tasks: {},
  results: {},
  packagedInspection: {},
  expertDiagnostic: {},
  updates: {},
  negativeControls: {},
  errors: [],
};

function capture(label, fn) {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    record.errors.push({ label, message });
    return { error: message };
  }
}

async function captureAsync(label, fn) {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    record.errors.push({ label, message });
    return { error: message };
  }
}

try {
  const start = seedProject(installed, {
    projectId: PROJECT,
    goal: "Select a compliant battery vendor for each site and produce a schedule and budget envelope within the £120,000 grant.",
    tasks: TASKS,
    headCommit: initialHead,
    stageGraph: STAGE_GRAPH,
  });
  record.projectRevision = start.revision ?? null;
  record.journal = await seedJournal(installed, { projectId: PROJECT, entries: JOURNAL });

  for (const task of TASKS) {
    const driven = await captureAsync(`drive:${task.task_id}`, () => driveTask(installed, task.task_id));
    record.tasks[task.task_id] = {
      driven,
      state: installed.controller.work.task(task.task_id)?.state ?? null,
      attempt: attemptOf(installed, task.task_id),
    };
    if (driven.attemptId !== undefined) {
      const result = resultOf(installed, driven.attemptId);
      record.results[task.task_id] = {
        attemptId: driven.attemptId,
        basis: basisOf(installed, driven.attemptId),
        result,
        content: readResultFile(WORK, installed, driven.attemptId, task.write_paths[0]),
        taskState: installed.controller.work.task(task.task_id)?.state ?? null,
        attemptState: attemptOf(installed, task.task_id)?.state ?? null,
      };
      record.packagedInspection[task.task_id] = {
        EXACT: capture(`inspect:${task.task_id}:EXACT`, () => installed.continuation.inspect({ result: { kind: "ATTEMPT_RESULT", ref: driven.attemptId } })),
      };
      record.expertDiagnostic[task.task_id] = {
        EXACT: await captureAsync(`expert:${task.task_id}:EXACT`, () =>
          expertAssess({
            installed,
            workDir: WORK,
            stateDir: STATE,
            attemptId: driven.attemptId,
            readPaths:
              task.task_id === "technical-fit"
                ? ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"]
                : ["sources/brief.md", "sources/vendor-pricing.csv", "sources/rollout-windows.md"],
            projectSemantic: "none",
          }),
        ),
      };
    }
  }

  const technical = record.results["technical-fit"];
  const cost = record.results["cost-schedule"];

  /* ── operator action: promote the unaffected cost/schedule result while the heads agree ── */
  record.promotions = {};
  if (cost?.attemptId !== undefined && cost.result?.resultCommit) {
    record.promotions.liveHeadBefore = worldHead(WORK);
    record.promotions.canonicalHeadBefore = installed.controller.work.project().head_commit;
    record.promotions.costSchedule = await captureAsync("promote:cost-schedule", () =>
      installed.controller.promote(cost.attemptId, cost.result.resultCommit, installed.controller.work.project().head_commit),
    );
    record.promotions.costScheduleStep = capture("step:cost-schedule-promotion", () => installed.controller.step()?.event_type ?? null);
    record.promotions.costScheduleTask = installed.controller.work.task("cost-schedule")?.state ?? null;
    record.promotions.headAfter = installed.controller.work.project().head_commit;
    record.promotions.liveHeadAfter = worldHead(WORK);
    record.promotions.reconcile = await captureAsync("reconcile:afterPromotion", () => installed.controller.reconcileProjectHead());
    record.promotions.headAfterReconcile = installed.controller.work.project().head_commit;
    record.promotions.costContentInTree = existsSync(join(WORK, "deliverables", "cost-schedule.md")) ? readFileSync(join(WORK, "deliverables", "cost-schedule.md"), "utf8") : null;

    record.negativeControls.duplicatePromotion = await captureAsync("promote:cost-schedule:duplicate", () =>
      installed.controller.promote(cost.attemptId, cost.result.resultCommit, record.promotions.liveHeadBefore),
    );
    record.negativeControls.inspectUnknownResult = capture("inspect:unknown-result", () =>
      installed.continuation.inspect({ result: { kind: "ATTEMPT_RESULT", ref: "attempt-does-not-exist" } }),
    );
  }

  /**
   * Clean UNKNOWN: the technical result is still VERIFYING, its own commit is not in the canonical
   * head, and the only source change is the promoted cost deliverable (disjoint from its reads). With
   * no project-semantic observer, the kernel has no complete proof — UNKNOWN, not COMPATIBLE.
   */
  if (technical?.attemptId !== undefined) {
    record.expertDiagnostic["technical-fit"].unknownSemanticBeforeUpdate = await captureAsync("expert:technical-fit:unknownSemanticBeforeUpdate", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: technical.attemptId,
        readPaths: ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"],
        projectSemantic: "unavailable",
        changeFrom: "origin",
      }),
    );
  }

  /* ── update 1: the vendor capability change, as an EXTERNAL source fact ── */
  if (technical?.attemptId !== undefined) {
    const vendorUpdate = applyUpdate(WORK, {
      target: "sources/vendor-capabilities.csv",
      source: join(SCENARIO, "updates", "vendor-capabilities-2026-02-10.csv"),
      message: "update 2026-02-10: Solaris V3 minimum operating temperature revised to 0 C",
    });
    record.updates.vendor = { ...vendorUpdate, digestAfter: sha256File(join(WORK, "sources", "vendor-capabilities.csv")) };
    for (const taskId of ["technical-fit", "cost-schedule"]) {
      const result = record.results[taskId];
      if (result?.attemptId === undefined) continue;
      record.packagedInspection[taskId].vendorUpdate = capture(`inspect:${taskId}:vendorUpdate`, () =>
        installed.continuation.inspect({ result: { kind: "ATTEMPT_RESULT", ref: result.attemptId } }),
      );
      record.expertDiagnostic[taskId].vendorUpdate = await captureAsync(`expert:${taskId}:vendorUpdate`, () =>
        expertAssess({
          installed,
          workDir: WORK,
          stateDir: STATE,
          attemptId: result.attemptId,
          readPaths:
            taskId === "technical-fit"
              ? ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"]
              : ["sources/brief.md", "sources/vendor-pricing.csv", "sources/rollout-windows.md"],
          projectSemantic: "none",
        }),
      );
    }

    /* ── the packaged rematerialize route, on the real inspection digest ── */
    const technicalInspection = record.packagedInspection["technical-fit"].vendorUpdate;
    if (technicalInspection?.assessment?.assessmentDigest !== undefined) {
      record.negativeControls.rematerializeIncompatible = await captureAsync("rematerialize:technical-fit:vendorUpdate", () =>
        installed.continuation.rematerialize({
          result: { kind: "ATTEMPT_RESULT", ref: technical.attemptId },
          expectedAssessmentDigest: technicalInspection.assessment.assessmentDigest,
        }),
      );
    }

    /* ── a stale inspection must write nothing ── */
    const beforeStale = installed.controller.store.listEvents(PROJECT).length;
    record.negativeControls.staleInspection = await captureAsync("startRework:stale-digest", () =>
      installed.continuation.startRework({
        result: { kind: "ATTEMPT_RESULT", ref: technical.attemptId },
        expectedAssessmentDigest: "0".repeat(64),
      }),
    );
    record.negativeControls.staleInspectionEventsAdded = installed.controller.store.listEvents(PROJECT).length - beforeStale;
  }

  /* ── update 2: the truly unrelated newsletter change ── */
  if (cost?.attemptId !== undefined) {
    const newsletterUpdate = applyUpdate(WORK, {
      target: "sources/newsletter.md",
      source: join(SCENARIO, "updates", "newsletter-2026-02-12.md"),
      message: "update 2026-02-12: spring newsletter note",
    });
    record.updates.newsletter = { ...newsletterUpdate, digestAfter: sha256File(join(WORK, "sources", "newsletter.md")) };
    for (const taskId of ["technical-fit", "cost-schedule"]) {
      const result = record.results[taskId];
      if (result?.attemptId === undefined) continue;
      record.packagedInspection[taskId].newsletterUpdate = capture(`inspect:${taskId}:newsletterUpdate`, () =>
        installed.continuation.inspect({ result: { kind: "ATTEMPT_RESULT", ref: result.attemptId } }),
      );
      record.expertDiagnostic[taskId].newsletterUpdate = await captureAsync(`expert:${taskId}:newsletterUpdate`, () =>
        expertAssess({
          installed,
          workDir: WORK,
          stateDir: STATE,
          attemptId: result.attemptId,
          readPaths:
            taskId === "technical-fit"
              ? ["sources/brief.md", "sources/vendor-capabilities.csv", "sources/sites.md", "sources/prior-notes.md"]
              : ["sources/brief.md", "sources/vendor-pricing.csv", "sources/rollout-windows.md"],
          projectSemantic: "none",
        }),
      );
    }
  }

  /**
   * The cost result is now promoted, so its own output is part of the origin-to-current diff. The
   * packaged service asks origin-to-current and reports a write collision with the result's own
   * deliverable. The expert diagnostic also asks the APPLICABILITY question — what changed AFTER this
   * result was produced — and can prove the external updates disjoint from its reads and writes.
   */
  if (cost?.attemptId !== undefined) {
    record.packagedInspection["cost-schedule"].externalSinceResult = capture("inspect:cost-schedule:externalSinceResult", () =>
      installed.continuation.inspect({ result: { kind: "ATTEMPT_RESULT", ref: cost.attemptId } }),
    );
    record.expertDiagnostic["cost-schedule"].externalSinceResult = await captureAsync("expert:cost-schedule:externalSinceResult", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: cost.attemptId,
        readPaths: ["sources/brief.md", "sources/vendor-pricing.csv", "sources/rollout-windows.md"],
        projectSemantic: "none",
        changeFrom: "result",
      }),
    );
    const costInspection = record.packagedInspection["cost-schedule"].externalSinceResult;
    if (costInspection?.assessment?.assessmentDigest !== undefined) {
      record.negativeControls.reworkPromoted = await captureAsync("startRework:cost-schedule:promoted", () =>
        installed.continuation.startRework({
          result: { kind: "ATTEMPT_RESULT", ref: cost.attemptId },
          expectedAssessmentDigest: costInspection.assessment.assessmentDigest,
        }),
      );
    }
  }

  /* ── the packaged rework route: the service mints the permit, NOT the driver ── */
  const technicalInspectionCurrent = record.packagedInspection["technical-fit"]?.newsletterUpdate ?? record.packagedInspection["technical-fit"]?.vendorUpdate;
  if (technical?.attemptId !== undefined && technicalInspectionCurrent?.assessment?.assessmentDigest !== undefined) {
    record.packagedContinuation = {
      reworkTechnicalFit: await captureAsync("startRework:technical-fit:currentWorld", () =>
        installed.continuation.startRework({
          result: { kind: "ATTEMPT_RESULT", ref: technical.attemptId },
          expectedAssessmentDigest: technicalInspectionCurrent.assessment.assessmentDigest,
        }),
      ),
    };
    record.packagedContinuation.technicalFitTaskAfterRework = installed.controller.work.task("technical-fit")?.state ?? null;
    const reworkJobId = record.packagedContinuation.reworkTechnicalFit?.jobId;
    if (typeof reworkJobId === "string") {
      let view = null;
      const deadline = Date.now() + 120_000;
      for (;;) {
        view = await installed.workDelegation.followup({ jobId: reworkJobId });
        if (view.phase === "FINISHED" || view.phase === "HOST_ERROR" || view.phase === "UNKNOWN") break;
        if (Date.now() > deadline) break;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      record.packagedContinuation.reworkTerminal = view;
      record.packagedContinuation.reworkAttempt = attemptOf(installed, "technical-fit");
      if (record.packagedContinuation.reworkAttempt?.attemptId !== undefined) {
        record.packagedContinuation.reworkResult = resultOf(installed, record.packagedContinuation.reworkAttempt.attemptId);
        record.packagedContinuation.reworkContent = readResultFile(WORK, installed, record.packagedContinuation.reworkAttempt.attemptId, "deliverables/technical-fit.md");
      }
    }
    record.packagedContinuation.reworkEvents = installed.controller.store
      .listEvents(PROJECT)
      .filter((event) => event.event_type === "TASK_READY")
      .filter((event) => event.payload?.rework_provenance !== undefined)
      .map((event) => ({ eventId: Number(event.event_id), entityId: event.entity_id, provenance: event.payload.rework_provenance }));
    record.packagedContinuation.reconcileAfterReopen = await captureAsync("reconcile:afterReopen", () => installed.controller.reconcileProjectHead());
    record.packagedContinuation.headAfterReopenReconcile = installed.controller.work.project().head_commit;
    record.packagedContinuation.liveHeadAfterReopen = worldHead(WORK);
  }

  /* ── the insufficiently-observed case: the same world, no project-semantic observer ── */
  if (cost?.attemptId !== undefined) {
    record.expertDiagnostic["cost-schedule"].unknownSemantic = await captureAsync("expert:cost-schedule:unknownSemantic", () =>
      expertAssess({
        installed,
        workDir: WORK,
        stateDir: STATE,
        attemptId: cost.attemptId,
        readPaths: ["sources/brief.md", "sources/vendor-pricing.csv", "sources/rollout-windows.md"],
        projectSemantic: "unavailable",
      }),
    );
  }

  record.history = installed.controller.store
    .listEvents(PROJECT)
    .map((event) => ({ eventId: Number(event.event_id), type: event.event_type, entityId: event.entity_id, revision: event.expected_project_revision }));
  record.finalHead = worldHead(WORK);
  record.finalTaskStates = {
    "technical-fit": installed.controller.work.task("technical-fit")?.state ?? null,
    "cost-schedule": installed.controller.work.task("cost-schedule")?.state ?? null,
  };
  record.plan = {
    "technical-fit": existsSync(join(WORK, "deliverables", "technical-fit.md")) ? readFileSync(join(WORK, "deliverables", "technical-fit.md"), "utf8") : null,
    "cost-schedule": existsSync(join(WORK, "deliverables", "cost-schedule.md")) ? readFileSync(join(WORK, "deliverables", "cost-schedule.md"), "utf8") : null,
  };
} finally {
  try {
    await installed.dispose();
  } catch (error) {
    record.errors.push({ label: "dispose", message: error instanceof Error ? error.message : String(error) });
  }
  record.finishedAt = new Date().toISOString();
  writeJson(join(RUN, "run.json"), record);
}

const summary = {
  run: RUN,
  errors: record.errors.length,
  tasks: record.finalTaskStates,
  packaged: Object.fromEntries(
    Object.entries(record.packagedInspection).map(([task, value]) => [
      task,
      Object.fromEntries(Object.entries(value).map(([condition, inspection]) => [condition, inspection?.compatibility?.outcome ?? inspection?.error ?? null])),
    ]),
  ),
  expert: Object.fromEntries(
    Object.entries(record.expertDiagnostic).map(([task, value]) => [
      task,
      Object.fromEntries(Object.entries(value).map(([condition, assessment]) => [condition, assessment?.outcome ?? assessment?.error ?? null])),
    ]),
  ),
  rework: record.packagedContinuation?.reworkTechnicalFit?.state ?? null,
};
writeJson(join(RUN, "summary.json"), summary);
console.log(JSON.stringify(summary, null, 2));
