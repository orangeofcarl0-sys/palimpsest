/**
 * COG-5 shared rig — deterministic Work Results over a test-owned world.
 *
 * What is REAL here:
 *   · the D2-d work delegation (prepare → isolated world → worker → completion → settle);
 *   · the completion contract and its observed evidence;
 *   · ATTEMPT_RESULT, basis capture, promotion, quiescence and head reconciliation;
 *   · the packaged ResultContinuationService and the D3 kernel it composes.
 *
 * What is TEST-OWNED and labelled:
 *   · the deterministic worker (it is not a model);
 *   · the intake candidate snapshot and its digest;
 *   · the expert diagnostic's precise read set and empty facet observations.
 *
 * READ-ONLY with respect to every non-test resource. Every run directory is explicit; no real repository,
 * runtime home or credential is touched.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "..", "..");
export const RIG = process.env.COG5_RIG ?? join(REPO, "..", ".cog5-rig");
export const SCENARIO = join(import.meta.dirname, "scenario");

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function git(args, cwd) {
  return execFileSync(
    "git",
    ["-c", "user.email=programme@example.invalid", "-c", "user.name=programme", ...args],
    { cwd, encoding: "utf8" },
  );
}

export function worldHead(workDir) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir, encoding: "utf8" }).trim();
}

export function buildWorld(workDir) {
  if (existsSync(join(workDir, ".git"))) return;
  ensureDir(workDir);
  cpSync(join(SCENARIO, "sources"), join(workDir, "sources"), { recursive: true });
  cpSync(join(SCENARIO, "verify.mjs"), join(workDir, "verify.mjs"));
  cpSync(join(SCENARIO, "package.json"), join(workDir, "package.json"));
  ensureDir(join(workDir, "deliverables"));
  writeFileSync(join(workDir, "deliverables", ".gitkeep"), "");
  git(["init", "-q"], workDir);
  git(["add", "--", "sources", "verify.mjs", "package.json", "deliverables/.gitkeep"], workDir);
  const staged = git(["diff", "--cached", "--name-only"], workDir).split(/\r?\n/u).filter(Boolean);
  const expected = [
    "package.json",
    "sources/brief.md",
    "sources/newsletter.md",
    "sources/prior-notes.md",
    "sources/rollout-windows.md",
    "sources/sites.md",
    "sources/vendor-capabilities.csv",
    "sources/vendor-pricing.csv",
    "verify.mjs",
    "deliverables/.gitkeep",
  ];
  if (staged.sort().join("|") !== expected.sort().join("|")) {
    throw new Error(`seed staged an unexpected path set: ${staged.join(", ")}`);
  }
  git(["commit", "-q", "-m", "seed: Sablewick programme pack"], workDir);
}

/**
 * A direct external commit, used ONLY for controls (the unauthorized-change and unrelated-change cases).
 * The main intake path does not use this: it applies the candidate through a Work task.
 */
export function applyDirectUpdate(workDir, input) {
  const before = worldHead(workDir);
  cpSync(input.source, join(workDir, input.target));
  git(["add", "--", input.target], workDir);
  const staged = git(["diff", "--cached", "--name-only"], workDir).split(/\r?\n/u).filter(Boolean);
  if (staged.length !== 1 || staged[0] !== input.target) {
    throw new Error(`direct update staged ${JSON.stringify(staged)} but expected ${JSON.stringify([input.target])}`);
  }
  git(["commit", "-q", "-m", input.message], workDir);
  return Object.freeze({
    fromHead: before,
    toHead: worldHead(workDir),
    target: input.target,
    paths: Object.freeze(staged),
    digestAfter: sha256File(join(workDir, input.target)),
  });
}

export function standardFor() {
  return Object.freeze({
    statement: "The package.json test script must pass and every change must stay inside the declared write scope.",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "verify.mjs"]), predicate: "tests_pass" }),
      Object.freeze({ kind: "scope_respected" }),
    ]),
    derivedFrom: Object.freeze(["package.json:scripts.test"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

export function policyFor() {
  return { allowed_commands: [{ executable: "node", argv_prefix: ["verify.mjs"] }] };
}

/* ================================================================== *
 * The deterministic worker. It is NOT a model: every read and write is code.
 * ================================================================== */

function technicalFit(worldPath) {
  const caps = readFileSync(join(worldPath, "sources", "vendor-capabilities.csv"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [vendor, chemistry, minC, maxC, warranty, coastal, width, lead] = line.split(",");
      return {
        vendor,
        chemistry,
        minC: Number(minC),
        maxC: Number(maxC),
        warranty: Number(warranty),
        coastal: coastal === "yes",
        width: Number(width),
        lead: Number(lead),
      };
    });
  const select = (minC, maxWidth, coastal) =>
    caps
      .filter((vendor) => vendor.minC <= minC && vendor.width <= maxWidth && (!coastal || vendor.coastal))
      .sort((left, right) => right.warranty - left.warranty || left.lead - right.lead)[0];
  const a = select(-12, 1200, false);
  const b = select(-4, 1200, true);
  const c = select(2, 800, false);
  if (a === undefined || b === undefined || c === undefined) {
    return `# Technical fit\n\n## Summary\n\nNo compliant vendor exists for every site on the current capability data.\n`;
  }
  return `# Technical fit\n\n## Site A — Marsh Lane Store\nVendor: ${a.vendor}\nConstraint: design minimum -12 °C; ${a.vendor} is rated to ${a.minC} °C. V2 is excluded by the 2023 marsh-lane failure.\n\n## Site B — Harbour Workshop\nVendor: ${b.vendor}\nConstraint: design minimum -4 °C and a coastal-rated warranty; ${b.vendor} is the only vendor meeting both.\n\n## Site C — School Annexe\nVendor: ${c.vendor}\nConstraint: ambient minimum 2 °C and a unit no wider than 800 mm; ${c.vendor} is ${c.width} mm wide. The 2023 V2 failure was at -8 °C, below this site's minimum.\n\n## Summary\n\nA: ${a.vendor}. B: ${b.vendor}. C: ${c.vendor}.\n`;
}

function costSchedule(worldPath) {
  const pricing = readFileSync(join(worldPath, "sources", "vendor-pricing.csv"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [vendor, unit, install] = line.split(",");
      return { vendor, cost: Number(unit) + Number(install) };
    });
  const costs = pricing.map((entry) => entry.cost);
  const low = Math.min(...costs);
  const high = Math.max(...costs);
  const lowCommitted = low * 3;
  const highCommitted = high * 3;
  const lowContingency = Math.ceil(lowCommitted * 0.08);
  const highContingency = Math.ceil(highCommitted * 0.08);
  return `# Cost and schedule\n\n## Budget\n\n| Site | Low (£) | High (£) |\n| --- | --- | --- |\n| A | ${low.toLocaleString("en-GB")} | ${high.toLocaleString("en-GB")} |\n| B | ${low.toLocaleString("en-GB")} | ${high.toLocaleString("en-GB")} |\n| C | ${low.toLocaleString("en-GB")} | ${high.toLocaleString("en-GB")} |\n\n## Sequence\n\nA in January–February, B in March–April, C in May–June. Order each unit before its window; the longest current lead time is 10 weeks, so the B order must be placed by late December.\n\n## Total\n\nCommitted low: £${lowCommitted.toLocaleString("en-GB")}; high: £${highCommitted.toLocaleString("en-GB")}. Contingency at 8%: £${lowContingency.toLocaleString("en-GB")}–£${highContingency.toLocaleString("en-GB")}. Total £${(lowCommitted + lowContingency).toLocaleString("en-GB")}–£${(highCommitted + highContingency).toLocaleString("en-GB")}, within the £120,000 grant.\n`;
}

export function deterministicWorker(input) {
  const { worldPath, intake, mode } = input;
  return Object.freeze({
    adapterId: "cog5-deterministic-worker",
    async run(runInput) {
      const writeScope = runInput.context?.work?.writeScope ?? [];
      const target = writeScope[0];
      if (typeof target !== "string" || target === "") throw new Error("the deterministic worker got no write scope");
      if (mode === "out-of-scope") {
        const text = target.endsWith("technical-fit.md") ? technicalFit(worldPath) : costSchedule(worldPath);
        writeFileSync(join(worldPath, target), text);
        writeFileSync(join(worldPath, "sources", "newsletter.md"), "unapproved write\n");
        git(["add", "--", target, "sources/newsletter.md"], worldPath);
        git(["commit", "-q", "-m", `work: ${target} (out-of-scope control)`], worldPath);
        return { kind: "READY_FOR_SETTLEMENT" };
      }
      if (target.endsWith("vendor-capabilities.csv")) {
        if (intake === undefined) throw new Error("the intake task has no candidate snapshot");
        const bytes = readFileSync(intake.sourcePath);
        const observed = createHash("sha256").update(bytes).digest("hex");
        if (observed !== intake.digest) {
          throw new Error(`the intake candidate changed: expected ${intake.digest}, observed ${observed}`);
        }
        writeFileSync(join(worldPath, target), bytes);
        git(["add", "--", target], worldPath);
        git(["commit", "-q", "-m", `work: accept external candidate ${intake.origin} at ${intake.digest.slice(0, 12)}`], worldPath);
        return { kind: "READY_FOR_SETTLEMENT" };
      }
      const text = target.endsWith("technical-fit.md")
        ? technicalFit(worldPath)
        : target.endsWith("cost-schedule.md")
          ? costSchedule(worldPath)
          : null;
      if (text === null) throw new Error(`the deterministic worker does not know ${target}`);
      writeFileSync(join(worldPath, target), text);
      git(["add", "--", target], worldPath);
      git(["commit", "-q", "-m", `work: ${target}`], worldPath);
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  });
}

/* ================================================================== *
 * The install
 * ================================================================== */
export async function createInstall(input) {
  const { installPalimpsest, trustedDefaultPolicy } = await import("../../dist/src/install.js");
  const { GitCliPort } = await import("../../dist/src/effects/index.js");
  const { SqliteProjectJournalStore } = await import("../../dist/src/project_workspace/journal.js");
  const { SqliteProjectAssetAssociationStore } = await import("../../dist/src/project_workspace/association.js");
  ensureDir(input.stateDir);
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: input.projectId,
      databasePath: join(input.stateDir, "palimpsest.sqlite"),
      ordariumDatabasePath: join(input.stateDir, "ordarium.sqlite"),
      repository: input.workDir,
      git: new GitCliPort(input.workDir, join(input.workDir, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardFor(),
      policy: trustedDefaultPolicy(policyFor()),
      projectJournalStore: new SqliteProjectJournalStore(join(input.stateDir, "journal.sqlite")),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(input.stateDir, "associations.sqlite")),
      workWorkerPort: (worldPath) => deterministicWorker({ worldPath, intake: input.intake, mode: input.workerMode }),
    },
  );
  return installed;
}

export function seedProject(installed, input) {
  return installed.controller.start({
    projectId: input.projectId,
    goal: input.goal,
    tasks: input.tasks,
    headCommit: input.headCommit,
    ...(input.stageGraph === undefined ? {} : { stageGraph: input.stageGraph }),
  });
}

export function attemptOf(installed, taskId) {
  const row = installed.controller.store.connection
    .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
    .get(installed.controller.projectId, taskId);
  return row === undefined ? null : { attemptId: String(row.attempt_id), state: String(row.state) };
}

export async function driveTask(installed, taskId) {
  const started = await installed.workDelegation.start({ expectedTaskId: taskId });
  let view = null;
  const deadline = Date.now() + 120_000;
  for (;;) {
    view = await installed.workDelegation.followup({ jobId: started.jobId });
    if (view.phase === "FINISHED" || view.phase === "HOST_ERROR" || view.phase === "UNKNOWN") break;
    if (Date.now() > deadline) throw new Error(`delegation job ${started.jobId} did not reach a terminal phase; last=${JSON.stringify(view)}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  const attempt = attemptOf(installed, taskId);
  if (view.phase !== "FINISHED" || attempt === null || attempt.state !== "COMPLETED") {
    return {
      jobId: started.jobId,
      attemptId: attempt?.attemptId ?? null,
      phase: view.phase,
      settlement: view.settlement ?? null,
      hostError: view.hostError ?? null,
      task: installed.controller.work.task(taskId),
    };
  }
  let stepped = null;
  try {
    stepped = installed.controller.step();
  } catch (error) {
    stepped = { error: error instanceof Error ? error.message : String(error) };
  }
  return {
    jobId: started.jobId,
    attemptId: attempt.attemptId,
    phase: view.phase,
    settlement: view.settlement ?? null,
    hostError: view.hostError ?? null,
    stepped: typeof stepped === "object" ? stepped : { event_type: stepped?.event_type ?? null },
    task: installed.controller.work.task(taskId),
  };
}

export function resultOf(installed, attemptId) {
  const event = installed.controller.store
    .listEvents(installed.controller.projectId)
    .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
  if (event === undefined) return null;
  const payload = event.payload;
  return {
    eventId: Number(event.event_id),
    resultCommit: payload.attempt_report?.result_commit ?? null,
    report: payload.attempt_report ?? null,
  };
}

export function readResultFile(workDir, installed, attemptId, path) {
  const result = resultOf(installed, attemptId);
  if (result?.resultCommit == null || result.resultCommit === "") return null;
  try {
    return git(["show", `${result.resultCommit}:${path}`], workDir);
  } catch {
    return null;
  }
}

export function basisOf(installed, attemptId) {
  return {
    resolution: installed.controller.attemptBasisForResolution(attemptId),
    summary: installed.controller.attemptWorldBasis(attemptId),
    currentness: installed.controller.attemptCurrentness(attemptId),
  };
}

export function promotionFactsOf(installed, attemptId) {
  return installed.controller.promotions
    .promotionFactsSync()
    .filter((fact) => fact.attemptId === attemptId);
}

export function packagedInspect(installed, attemptId) {
  return installed.continuation.inspect({ result: { kind: "ATTEMPT_RESULT", ref: attemptId } });
}

/* ================================================================== *
 * The expert diagnostic: the SAME D3 kernel, with test-owned precise reads and facets.
 * It is NOT a product surface and cannot grant reuse.
 * ================================================================== */
export async function expertAssess(input) {
  const {
    makeObservationAuthority,
    makeCompatibilityIssuer,
    makeCrossBasisAdmissionRuntime,
    SqliteAttemptWorldBasisStore,
    makeProjectWorldBasisRuntime,
    SqliteDerivedResultCandidateStore,
    REPOSITORY_SOURCE,
  } = await import("../../dist/src/project_world/index.js");
  const {
    gitSourceChangeObserver,
    GIT_SOURCE_OBSERVER_ID,
    GIT_SOURCE_OBSERVER_VERSION,
    GIT_SOURCE_MECHANISM,
  } = await import("../../dist/src/deployment/source_change_observer.js");
  const { firstPartyResultResolver } = await import("../../dist/src/deployment/result_resolution.js");
  const { firstPartyAttemptResultVerificationSource } = await import("../../dist/src/project_verification/index.js");
  const { firstPartyProjectWorldObservation } = await import("../../dist/src/deployment/world_observation.js");
  const controller = input.installed.controller;
  const store = controller.store;
  const projectId = controller.projectId;
  const repo = input.workDir;
  const envelopeOf = (taskId) => {
    const row = store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(projectId, taskId);
    if (row === undefined || row.envelope_json === null) return null;
    return JSON.parse(new TextDecoder().decode(row.envelope_json));
  };
  const observation = firstPartyProjectWorldObservation({
    owner: {
      taskEnvelope: envelopeOf,
      projectRevision: () =>
        Number(store.connection.prepare("SELECT revision FROM projects WHERE project_id=?").get(projectId).revision),
    },
    repository: repo,
  });
  const basisStore = new SqliteAttemptWorldBasisStore(join(input.stateDir, "attempt_world_basis.sqlite"));
  const basisRuntime = makeProjectWorldBasisRuntime({ projectId, store: basisStore, observation });
  const observations = makeObservationAuthority({ databasePath: ":memory:" });
  const issuer = makeCompatibilityIssuer({
    issuerId: "cog5-expert-diagnostic",
    observations,
    databasePath: ":memory:",
  });
  const sourceRecorder = observations.registerObserver({
    observerId: GIT_SOURCE_OBSERVER_ID,
    observerVersion: GIT_SOURCE_OBSERVER_VERSION,
    mechanism: GIT_SOURCE_MECHANISM,
  });
  const conservative = observations.registerObserver({
    observerId: "cog5-test-owned-instrumented-reads",
    observerVersion: "1",
    mechanism: "CONSERVATIVE_DOMAIN",
  });
  const sourceObserver = gitSourceChangeObserver({ repository: repo, recorder: sourceRecorder });
  const candidates = new SqliteDerivedResultCandidateStore(":memory:");
  const results = firstPartyResultResolver({
    owner: {
      projectId,
      attemptBasis: (attemptId) => {
        const record = basisStore.read({ projectId, attemptId });
        return record === null ? null : { basis: record.basis, taskId: record.taskId };
      },
    },
    attemptResultSource: firstPartyAttemptResultVerificationSource(controller),
    candidates,
  });
  const resolved = results.resolve({ kind: "ATTEMPT_RESULT", ref: input.attemptId });
  if (resolved === null) throw new Error(`the expert diagnostic cannot resolve ${input.attemptId}`);
  const crossBasis = makeCrossBasisAdmissionRuntime({ issuer, observation });
  const target = crossBasis.observeTarget(resolved.taskId);
  const record = basisStore.read({ projectId, attemptId: input.attemptId });
  if (record === null) throw new Error(`no captured basis for ${input.attemptId}`);
  const origin = record.basis.source.state === "BOUND" ? record.basis.source.value.revision : null;
  if (origin === null) throw new Error(`the basis for ${input.attemptId} has no bound source revision`);
  const current = observation.observeSource();
  const facts = promotionFactsOf(input.installed, input.attemptId);
  const changeBase = (() => {
    if (input.changeFrom === "promoted-head") {
      if (facts.length !== 1) throw new Error(`expected exactly one promotion fact for ${input.attemptId}, saw ${facts.length}`);
      return facts[0].resultingHeadCommit;
    }
    if (input.changeFrom === "result" && resolved.sourceResult !== null) return resolved.sourceResult.resultRevision;
    return origin;
  })();
  const scopeOf = (from, to) => ({ domain: "source", scopeRef: repo, from, to });
  const changeRef = current.ok
    ? sourceObserver.observeChange({ fromRevision: changeBase, toRevision: current.revision.revision, scopeRef: repo })
    : conservative.unavailable({ domain: "source", detail: "the current source revision could not be observed" });
  const writeRef =
    resolved.sourceResult === null
      ? conservative.unavailable({ domain: "source", detail: "the result produced no canonical source revision" })
      : sourceObserver.observeChange({
          fromRevision: origin,
          toRevision: resolved.sourceResult.resultRevision,
          scopeRef: repo,
        });
  const readRef = conservative.record({
    scope: scopeOf(origin, origin),
    selectors: input.readPaths.map((path) => ({ domain: "source", scope: "path", path })),
  });
  const assetsRef = conservative.record({
    scope: { domain: "assets", scopeRef: "test-owned-none", from: "-", to: "-" },
    selectors: [],
  });
  const environmentRef = conservative.record({
    scope: { domain: "environment", scopeRef: "test-owned-none", from: "-", to: "-" },
    selectors: [],
  });
  const projectSemanticRef =
    input.projectSemantic === "unavailable"
      ? conservative.unavailable({
          domain: "project_semantic",
          detail: "no first-party observer exists for the project semantic change domain",
        })
      : conservative.record({
          scope: {
            domain: "project_semantic",
            scopeRef: projectId,
            from: String(observation.observeRevision()),
            to: String(observation.observeRevision()),
          },
          selectors: [],
        });
  const certificate = issuer.issue({
    resultManifestDigest: resolved.resultManifestDigest,
    originBasisDigest: resolved.originBasisDigest,
    targetObservationDigest: target.digest,
    exactlyCurrent: basisRuntime.assessCurrentness({ attemptId: input.attemptId })?.currentness === "CURRENT",
    observationRefs: {
      projectSemantic: projectSemanticRef,
      source: changeRef,
      assets: assetsRef,
      environment: environmentRef,
      resultReads: readRef,
      resultWrites: writeRef,
    },
  });
  const decision = crossBasis.admit({
    presented: certificate,
    resultManifestDigest: resolved.resultManifestDigest,
    originBasisDigest: resolved.originBasisDigest,
    taskId: resolved.taskId,
    hasBasis: true,
  });
  return Object.freeze({
    outcome: certificate.assessment.outcome,
    detail: certificate.assessment.detail,
    conflicts: certificate.assessment.conflicts,
    unknowns: certificate.assessment.unknowns,
    proofs: certificate.assessment.disjointnessProofs,
    assessmentDigest: certificate.assessment.assessmentDigest,
    issuanceDigest: certificate.issuanceDigest,
    admission: { state: decision.state, admitted: decision.admitted, detail: decision.detail },
    targetObservation: target,
    resultManifestDigest: resolved.resultManifestDigest,
    originBasisDigest: resolved.originBasisDigest,
    originSourceRevision: origin,
    changeFrom: input.changeFrom ?? "origin",
    changeBaseRevision: changeBase,
    currentSourceRevision: current.ok ? current.revision.revision : null,
    repositorySourceSelector: REPOSITORY_SOURCE,
    testOwned: {
      preciseReadPaths: [...input.readPaths],
      facetObservations: input.projectSemantic === "unavailable" ? "projectSemantic unavailable; assets/environment empty" : "projectSemantic/assets/environment empty",
      note: "test instrumentation, not a DSH execution observation; this cannot grant production reuse",
    },
  });
}
