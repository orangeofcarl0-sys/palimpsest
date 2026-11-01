/**
 * COG-6 rig — the frozen Sablewick scenario over the REAL product owners.
 *
 * What is real:
 *   · D2-d work delegation (prepare → isolated world → worker → completion → settle);
 *   · the completion contract and its observed evidence;
 *   · ATTEMPT_RESULT, basis capture, promotion, quiescence and head reconciliation;
 *   · the packaged ResultContinuationService and the D3 kernel it composes;
 *   · the Project Workspace journal and the ProjectIR revision path.
 *
 * What is TEST-OWNED and labelled:
 *   · the deterministic worker (it is NOT a model and NOT the DSH subprocess worker);
 *   · the external inbox and the candidate snapshots;
 *   · the operator authorisation policy and every operator call.
 *
 * No model is used. No real repository, runtime home or credential is touched. Every run directory is
 * explicit and outside the repository.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "..", "..");
export const RIG = process.env.COG6_RIG ?? join(REPO, "..", ".cog6-rig");
export const SCENARIO = join(import.meta.dirname, "scenario");

/* ================================================================== *
 * Scenario identities — pre-registered in COG6-EXPERIMENTAL-PROTOCOL.md
 * ================================================================== */

export const CANDIDATE_A = Object.freeze({
  candidateId: "sablewick-capabilities-2026-02-10",
  relativePath: "2026-02-10/vendor-capabilities.csv",
  digest: "0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c",
  origin: "Solaris programme office bulletin SW-2026-02-10",
  target: "sources/vendor-capabilities.csv",
});
export const CANDIDATE_B = Object.freeze({
  candidateId: "sablewick-capabilities-2026-02-14-corrected",
  relativePath: "2026-02-14/vendor-capabilities-corrected.csv",
  digest: "14ffdd6525d292f33e86f568d9ecfd8fc5dfe47019e1bfaa76bb055ffc07bc91",
  origin: "Solaris programme office correction SW-2026-02-14",
  target: "sources/vendor-capabilities.csv",
});
export const DUPLICATE_A = Object.freeze({
  candidateId: "sablewick-capabilities-2026-02-10-repeat",
  relativePath: "2026-02-14/vendor-capabilities.csv",
  digest: CANDIDATE_A.digest,
  origin: "Solaris programme office re-send of bulletin SW-2026-02-10",
  target: "sources/vendor-capabilities.csv",
});
export const NEWSLETTER = Object.freeze({
  relativePath: "2026-02-10/newsletter.md",
  digest: "8bb1927b134326c2ed46857359305dae9b329d68d332767b2d4a6e994b712ee4",
});
export const PRE_CANDIDATE_CAPABILITIES_DIGEST = "f81576167c284060eb494706e424204d99028823fe71bf56476883d49e4d9373";

export const GOAL =
  "Install battery backup at Sablewick's three community sites within the £120,000 grant by 30 June 2026.";

export const REQUIREMENTS = Object.freeze([
  Object.freeze({ requirement_id: "R1", statement: "Use the selected local installer; installation labour is included in the vendor quotes.", priority: "critical", acceptance_refs: [] }),
  Object.freeze({ requirement_id: "R2", statement: "No fossil-fuel backup may be installed.", priority: "critical", acceptance_refs: [] }),
  Object.freeze({ requirement_id: "R3", statement: "Site B is coastal and flood-exposed: only a vendor whose warranty covers coastal sites may be used there, and its published minimum operating temperature must be at or below -4 C.", priority: "critical", acceptance_refs: [] }),
  Object.freeze({ requirement_id: "R4", statement: "Site C is a listed building: the unit must be no wider than 800 mm.", priority: "critical", acceptance_refs: [] }),
  Object.freeze({ requirement_id: "R5", statement: "Keep at least 8% of committed cost as contingency.", priority: "high", acceptance_refs: [] }),
]);

export const TASKS = Object.freeze({
  technicalFit: Object.freeze({
    task_id: "technical-fit",
    objective: "Select a technically compliant battery vendor for each site from the current capability data, or record that no compliant selection exists. State the constraint that decides each site.",
    depends_on: [],
    write_paths: ["deliverables/technical-fit.md"],
    required_artifacts: ["deliverables/technical-fit.md"],
  }),
  costSchedule: Object.freeze({
    task_id: "cost-schedule",
    objective: "Produce the programme cost and schedule envelope from the current pricing and installation windows, including the 8% contingency.",
    depends_on: [],
    write_paths: ["deliverables/cost-schedule.md"],
    required_artifacts: ["deliverables/cost-schedule.md"],
  }),
  technicalRefresh: Object.freeze({
    task_id: "technical-refresh",
    objective: "Re-check the technical fit against the current site requirements and vendor capability data. For each site, name a compliant vendor or record that none exists; note any unresolved evidence question.",
    depends_on: [],
    write_paths: ["deliverables/technical-refresh.md"],
    required_artifacts: ["deliverables/technical-refresh.md"],
  }),
  intake: Object.freeze({
    task_id: "intake-vendor-2026-02-10",
    objective: `Apply the exact external candidate ${CANDIDATE_A.relativePath} (SHA-256 ${CANDIDATE_A.digest}, origin: ${CANDIDATE_A.origin}) to ${CANDIDATE_A.target}. Change no other path.`,
    depends_on: [],
    write_paths: [CANDIDATE_A.target],
    required_artifacts: [CANDIDATE_A.target],
  }),
  postControl: Object.freeze({
    task_id: "post-control",
    objective: "Read the current vendor capability data and record one observation in deliverables/post-control.md.",
    depends_on: [],
    write_paths: ["deliverables/post-control.md"],
    required_artifacts: ["deliverables/post-control.md"],
  }),
});

export const SEEDED_TASKS = Object.freeze([TASKS.technicalFit, TASKS.costSchedule]);

/**
 * The operator's declared scheduler capacity. The shipped default declares concurrency 1, which
 * latches the VERIFYING stage and prevents a second independent task from starting while the first
 * holds a completed candidate. COG-5 declared 2 for the same reason. This is a deployment
 * declaration, not an authority change: promotion, write scope, completion and the head guard are
 * unchanged.
 */
export const STAGE_GRAPH = Object.freeze({
  stages: Object.freeze([
    Object.freeze({ id: "active", state: "ACTIVE", concurrency: 2 }),
    Object.freeze({ id: "verifying", state: "VERIFYING", concurrency: 2 }),
    Object.freeze({ id: "blocked", state: "BLOCKED" }),
    Object.freeze({ id: "ready", state: "READY" }),
  ]),
  transitions: Object.freeze([
    Object.freeze({ from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" }),
    Object.freeze({ from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" }),
    Object.freeze({ from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" }),
    Object.freeze({ from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" }),
    Object.freeze({ from: "verifying", event: "TASK_READY", to: "READY", when: "rework-admitted" }),
    Object.freeze({ from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" }),
    Object.freeze({ from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" }),
  ]),
  guards: Object.freeze({}),
  declared_by: "cog6-rig",
  reason: "two independent programme work pieces must reach VERIFYING together so the continuation can be isolated from scheduling",
});

/* ================================================================== *
 * Utilities
 * ================================================================== */

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
  ensureDir(resolve(path, ".."));
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

export function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Hash a directory's files (path + bytes), excluding `.git`. */
export function digestTree(root) {
  const hash = createHash("sha256");
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(root);
  files.sort();
  for (const file of files) {
    hash.update(file.slice(root.length).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), files: files.map((file) => file.slice(root.length + 1).replaceAll("\\", "/")) };
}

/* ================================================================== *
 * Worlds and inbox
 * ================================================================== */

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
  const staged = git(["diff", "--cached", "--name-only"], workDir).split(/\r?\n/u).filter(Boolean).sort();
  const expected = [
    "deliverables/.gitkeep",
    "package.json",
    "sources/brief.md",
    "sources/newsletter.md",
    "sources/operations.md",
    "sources/prior-notes.md",
    "sources/rollout-windows.md",
    "sources/sites.md",
    "sources/vendor-capabilities.csv",
    "sources/vendor-pricing.csv",
    "verify.mjs",
  ].sort();
  if (staged.join("|") !== expected.join("|")) {
    throw new Error(`the seed staged an unexpected path set: ${staged.join(", ")}`);
  }
  git(["commit", "-q", "-m", "seed: Sablewick programme pack (canonical data before the 2026-02-10 bulletin)"], workDir);
}

export function buildInbox(inboxDir) {
  rmSync(inboxDir, { recursive: true, force: true });
  cpSync(join(SCENARIO, "inbox"), inboxDir, { recursive: true });
  const index = [];
  const arrivals = readFileSync(join(inboxDir, "arrivals.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  for (const arrival of arrivals) {
    const observed = sha256File(join(inboxDir, arrival.item));
    if (observed !== arrival.sha256) {
      throw new Error(`the inbox candidate ${arrival.item} does not match its arrival digest`);
    }
    index.push({ ...arrival, observed });
  }
  return Object.freeze({ dir: inboxDir, arrivals: Object.freeze(index) });
}

/** A direct external commit. Used ONLY for controls. */
export function applyDirectUpdate(workDir, input) {
  const before = worldHead(workDir);
  cpSync(input.source, join(workDir, input.target));
  git(["add", "--", input.target], workDir);
  const staged = git(["diff", "--cached", "--name-only"], workDir).split(/\r?\n/u).filter(Boolean);
  if (staged.length !== 1 || staged[0] !== input.target) {
    throw new Error(`the direct update staged ${JSON.stringify(staged)} but expected ${JSON.stringify([input.target])}`);
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

/* ================================================================== *
 * The deterministic worker (NOT a model)
 * ================================================================== */

function readCapabilities(worldPath) {
  return readFileSync(join(worldPath, "sources", "vendor-capabilities.csv"), "utf8")
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
}

function select(caps, minC, maxWidth, coastal) {
  return caps
    .filter((vendor) => vendor.minC <= minC && vendor.width <= maxWidth && (!coastal || vendor.coastal))
    .sort((left, right) => right.warranty - left.warranty || left.lead - right.lead)[0];
}

function technicalText(worldPath, title) {
  const caps = readCapabilities(worldPath);
  const a = select(caps, -12, 1200, false);
  const b = select(caps, -4, 1200, true);
  const c = select(caps, 2, 800, false);
  const certificate =
    "The Solaris (V3) cold-weather certificate is promised but not on file. This analysis uses the published capability data only; the certificate claim is unverified and does not change a published minimum.";
  if (a === undefined || b === undefined || c === undefined) {
    const lines = [
      `# ${title}`,
      "",
      "## Site findings",
      "",
      `- Site A (design minimum -12 C, no coastal requirement): ${a === undefined ? "no compliant vendor on the current data" : `${a.vendor} (rated to ${a.minC} C)`}.`,
      `- Site B (design minimum -4 C **and** a coastal-rated warranty): ${b === undefined ? "**no compliant vendor on the current data**" : `${b.vendor} (rated to ${b.minC} C, coastal warranty)`}. V3 is rated to 0 C after the 2026-02-10 bulletin, which is above the site minimum; V2 is rated to -5 C but has no coastal warranty; V1 and V4 have no coastal warranty.`,
      `- Site C (ambient minimum 2 C, width <= 800 mm): ${c === undefined ? "no compliant vendor on the current data" : `${c.vendor} (${c.width} mm, rated to ${c.minC} C)`}.`,
      "",
      "## Summary",
      "",
      "No compliant vendor exists for Site B on the current capability data. The programme cannot satisfy the Site B coastal-temperature requirement with the current vendor set. This is a negative finding about the current data, not a completed procurement.",
      "",
      "## Evidence note",
      "",
      certificate,
      "",
    ];
    return lines.join("\n");
  }
  return [
    `# ${title}`,
    "",
    "## Site findings",
    "",
    `- Site A: ${a.vendor} (rated to ${a.minC} C).`,
    `- Site B: ${b.vendor} (rated to ${b.minC} C, coastal warranty).`,
    `- Site C: ${c.vendor} (${c.width} mm, rated to ${c.minC} C).`,
    "",
    "## Summary",
    "",
    `A: ${a.vendor}; B: ${b.vendor}; C: ${c.vendor}.`,
    "",
    "## Evidence note",
    "",
    certificate,
    "",
  ].join("\n");
}

function costText(worldPath) {
  const pricing = readFileSync(join(worldPath, "sources", "vendor-pricing.csv"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [vendor, unit, install] = line.split(",");
      return { vendor, cost: Number(unit) + Number(install) };
    });
  const v1 = pricing.find((entry) => entry.vendor === "V1")?.cost ?? 0;
  const v3 = pricing.find((entry) => entry.vendor === "V3")?.cost ?? 0;
  const committed = v1 + 2 * v3;
  const contingency = Math.ceil(committed * 0.08);
  return [
    "# Cost and schedule",
    "",
    "## Historical envelope (V1 for Site A, two V3 units for Sites B and C)",
    "",
    `Committed cost: £${committed.toLocaleString("en-GB")}.`,
    `Contingency at 8%: £${contingency.toLocaleString("en-GB")}.`,
    `Total: £${(committed + contingency).toLocaleString("en-GB")}, within the £120,000 grant.`,
    "",
    "## Sequence",
    "",
    "Site A in January-February, Site B in March-April, Site C in May-June. Order each unit before its window; the longest lead time is 10 weeks, so the Site B order must be placed by late December.",
    "",
  ].join("\n");
}

export function deterministicWorker(input) {
  const { worldPath, candidate, mode } = input;
  return Object.freeze({
    adapterId: "cog6-deterministic-worker",
    async run(runInput) {
      const writeScope = runInput.context?.work?.writeScope ?? [];
      const target = writeScope[0];
      if (typeof target !== "string" || target === "") throw new Error("the deterministic worker got no write scope");
      if (mode === "out-of-scope") {
        const text = target.endsWith("technical-refresh.md") || target.endsWith("technical-fit.md")
          ? technicalText(worldPath, target.endsWith("technical-refresh.md") ? "Technical refresh" : "Technical fit")
          : costText(worldPath);
        writeFileSync(join(worldPath, target), text);
        writeFileSync(join(worldPath, "sources", "newsletter.md"), "unapproved write\n");
        git(["add", "--", target, "sources/newsletter.md"], worldPath);
        git(["commit", "-q", "-m", `work: ${target} (out-of-scope control)`], worldPath);
        return { kind: "READY_FOR_SETTLEMENT" };
      }
      if (target === CANDIDATE_A.target) {
        if (candidate === undefined) throw new Error("the intake task has no candidate snapshot");
        const bytes = readFileSync(candidate.sourcePath);
        const observed = createHash("sha256").update(bytes).digest("hex");
        if (observed !== candidate.digest) {
          throw new Error(`the intake candidate changed: expected ${candidate.digest}, observed ${observed}`);
        }
        writeFileSync(join(worldPath, target), bytes);
        git(["add", "--", target], worldPath);
        git(["commit", "-q", "-m", `work: accept external candidate ${candidate.origin} at ${candidate.digest.slice(0, 12)}`], worldPath);
        return { kind: "READY_FOR_SETTLEMENT" };
      }
      const text = target.endsWith("technical-refresh.md")
        ? technicalText(worldPath, "Technical refresh")
        : target.endsWith("technical-fit.md")
          ? technicalText(worldPath, "Technical fit")
          : target.endsWith("cost-schedule.md")
            ? costText(worldPath)
            : target.endsWith("post-control.md")
              ? `# Post control\n\nThe programme is at ${worldHead(worldPath).slice(0, 12)}.\n`
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
 * Install, seed and drive
 * ================================================================== */

export function standardFor() {
  return Object.freeze({
    statement: "The package test script must pass and every change must stay inside the declared write scope.",
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
      workWorkerPort: (worldPath) =>
        deterministicWorker({ worldPath, candidate: input.candidate, mode: input.workerMode }),
    },
  );
  return installed;
}

export function seedProject(installed, input) {
  return installed.controller.start({
    projectId: input.projectId,
    goal: input.goal,
    requirements: input.requirements,
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

export function attemptsOf(installed, taskId) {
  return installed.controller.store.connection
    .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid")
    .all(installed.controller.projectId, taskId)
    .map((row) => ({ attemptId: String(row.attempt_id), state: String(row.state) }));
}

export async function driveTask(installed, taskId) {
  const started = await installed.workDelegation.start({ expectedTaskId: taskId });
  const view = await followJob(installed, started.jobId);
  const attempt = attemptOf(installed, taskId);
  let stepped = null;
  // A HOST_ERROR means no world was prepared: stepping would activate a task that has no candidate.
  if (view.phase === "FINISHED" && attempt?.state === "COMPLETED") {
    try {
      stepped = installed.controller.step();
    } catch (error) {
      stepped = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return {
    jobId: started.jobId,
    attemptId: attempt?.attemptId ?? null,
    attemptState: attempt?.state ?? null,
    phase: view.phase,
    settlement: view.settlement ?? null,
    hostError: view.hostError ?? null,
    stepped: stepped?.event_type ?? stepped?.error ?? null,
    task: installed.controller.work.task(taskId),
  };
}

export async function followJob(installed, jobId) {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const view = await installed.workDelegation.followup({ jobId });
    if (view.phase === "FINISHED" || view.phase === "HOST_ERROR" || view.phase === "UNKNOWN") return view;
    if (Date.now() > deadline) throw new Error(`delegation job ${jobId} did not reach a terminal phase; last=${JSON.stringify(view)}`);
    await sleep(50);
  }
}

export function resultOf(installed, attemptId) {
  const event = installed.controller.store
    .listEvents(installed.controller.projectId)
    .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
  if (event === undefined) return null;
  return {
    eventId: Number(event.event_id),
    resultCommit: event.payload.attempt_report?.result_commit ?? null,
    report: event.payload.attempt_report ?? null,
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

export async function promote(installed, attemptId, resultCommit, expectedHead) {
  const outcome = await installed.controller.promote(attemptId, resultCommit, expectedHead);
  const stepped = installed.controller.step();
  return { outcome, stepped: stepped?.event_type ?? null };
}

export async function reconcile(installed) {
  return installed.controller.reconcileProjectHead();
}

export function describeTask(installed, taskId) {
  return installed.controller.work.task(taskId);
}

export function taskStates(installed) {
  return installed.controller.work.taskStates();
}

/* ================================================================== *
 * Journal and plan
 * ================================================================== */

export async function seedJournal(installed) {
  const projectId = installed.controller.projectId;
  const negative = await installed.projectWorkspace.recordJournalEntry({
    projectId,
    kind: "NEGATIVE_RESULT",
    title: "2023 Marsh Lane trial: V2 cold-start failure",
    body: "A Kestrel (V2) unit failed to start at -8 C at Marsh Lane in January 2023. V2 is not suitable for a site whose design minimum is below -5 C. This finding remains valid and is not superseded by the 2026 supplier bulletins.",
    provenance: "sources/prior-notes.md (2023 trial notes)",
  });
  const question = await installed.projectWorkspace.recordJournalEntry({
    projectId,
    kind: "OPEN_QUESTION",
    title: "Solaris V3 cold-weather certificate is not on file",
    body: "Solaris claims a cold-weather certificate for the LTO unit. The certificate has been promised but no document, number, issuing body or test standard is on file. The claim is unverified and does not change the published minimum operating temperature.",
    provenance: "sources/prior-notes.md; inbox/2026-02-08/solaris-certificate-claim.md",
  });
  const opportunity = await installed.projectWorkspace.recordJournalEntry({
    projectId,
    kind: "OPPORTUNITY",
    title: "Switch Site B to V2 to reduce cost",
    body: "A volunteer proposed using V2 at Site B because it is £7,200 cheaper than V3 per unit. The proposal was considered by the programme lead.",
    provenance: "programme volunteer proposal, 2026-01-05 (rejected)",
  });
  const dismissed = await installed.projectWorkspace.resolveJournalEntry({
    projectId,
    entryId: opportunity.entryId,
    resolution: { status: "DISMISSED", detail: "rejected: V2 has no coastal warranty (grant condition 3); the saving does not justify an unqualified installation" },
  });
  return {
    negative: { entryId: negative.entryId, digest: negative.digest, kind: negative.kind },
    question: { entryId: question.entryId, digest: question.digest, kind: question.kind },
    opportunity: { entryId: opportunity.entryId, digest: opportunity.digest, kind: opportunity.kind, resolution: dismissed.resolution ?? null },
  };
}

export async function journalOf(installed) {
  const entries = await installed.projectWorkspace.journal();
  return entries.map((entry) => ({
    entryId: entry.entry.entryId,
    kind: entry.entry.kind,
    title: entry.entry.title,
    provenance: entry.entry.provenance,
    resolution: entry.resolution ?? null,
  }));
}

export function planWithExtraTask(installed, taskSpec, reason) {
  const current = installed.controller.work.project();
  const event = installed.controller.plan({
    tasks: [...current.tasks, taskSpec],
    reason,
  });
  return {
    eventType: event.event_type,
    eventId: event.event_id,
    revision: event.payload.project_ir?.revision ?? null,
    digest: event.payload.project_ir?.digest ?? null,
  };
}

/* ================================================================== *
 * Operator policy (pre-registered)
 * ================================================================== */

export function authorizeIntake(input) {
  const { candidate, approvedDigest, targetPath, taskObjective } = input;
  if (candidate.digest !== approvedDigest) {
    return {
      approved: false,
      reason: "digest_mismatch",
      detail: `approval binds ${approvedDigest}; the proposed candidate is ${candidate.digest} (${candidate.candidateId}) and is a different candidate`,
    };
  }
  if (targetPath !== CANDIDATE_A.target) {
    return { approved: false, reason: "unapproved_target", detail: `the target ${targetPath} is not the approved path ${CANDIDATE_A.target}` };
  }
  if (typeof taskObjective !== "string" || !taskObjective.includes(candidate.digest) || !taskObjective.includes("Change no other path")) {
    return { approved: false, reason: "incomplete_objective", detail: "the task objective must name the exact digest and the no-extra-paths rule" };
  }
  const duplicate = candidate.digest === CANDIDATE_A.digest && candidate.candidateId !== CANDIDATE_A.candidateId;
  return {
    approved: true,
    reason: duplicate ? "duplicate_delivery_same_digest" : "authorised",
    duplicate,
    detail: duplicate
      ? "the bytes are identical to the already authorised candidate; no second canonical application is authorised"
      : "the exact candidate digest, target and no-extra-paths objective are bound",
  };
}

export function evaluateRequirementProposal(text) {
  const lowered = text.toLowerCase();
  const relaxation =
    changedSiteB(lowered) || lowered.includes("drop the coastal") || lowered.includes("remove the coastal") || lowered.includes("relax site b");
  if (relaxation) {
    return {
      approved: false,
      reason: "business_requirement_change_requires_operator",
      detail: "Site B's -4 C minimum and coastal warranty are binding grant requirements; a separate explicit operator decision is required, and the normal product has no model-facing requirement-change path",
    };
  }
  return { approved: false, reason: "not_an_intake", detail: "the proposal is not an external source intake" };
}

function changedSiteB(text) {
  return /site b/.test(text) && /(-2|minus 2|lower|reduce|relax|drop)/.test(text);
}

/* ================================================================== *
 * Snapshot and rubric
 * ================================================================== */

export async function projectSnapshot(installed, workDir) {
  const project = installed.controller.work.project();
  const states = new Map(installed.controller.work.taskStates().map((row) => [row.taskId, row.state]));
  return {
    head: project.head_commit,
    liveHead: worldHead(workDir),
    revision: project.revision,
    digest: project.digest,
    goal: project.goal,
    requirements: project.requirements,
    requirementsDigest: digest(JSON.stringify(project.requirements)),
    tasks: project.tasks.map((task) => ({
      taskId: task.task_id,
      objective: task.objective,
      writePaths: task.write_paths,
      state: states.get(task.task_id) ?? null,
    })),
    journal: await journalOf(installed),
  };
}

export async function domainRubric(input) {
  const { installed, workDir, attemptId } = input;
  const caps = readCapabilities(workDir);
  const siteB = caps.filter((vendor) => vendor.minC <= -4 && vendor.coastal);
  const deliverable = readFileSync(join(workDir, "deliverables", "technical-refresh.md"), "utf8");
  const project = installed.controller.work.project();
  const requirements = project.requirements;
  const r3 = requirements.find((requirement) => requirement.requirement_id === "R3");
  const stateOfRefresh =
    installed.controller.work.taskStates().find((row) => row.taskId === "technical-refresh")?.state ?? null;
  const result = resultOf(installed, attemptId);
  const checks = {
    acceptedV3MinIsZero: caps.find((vendor) => vendor.vendor === "V3")?.minC === 0,
    noVendorSatisfiesSiteB: siteB.length === 0,
    deliverableStatesNoSiteBVendor: /no compliant vendor/i.test(deliverable) && /site b/i.test(deliverable),
    deliverablePreservesCertificateUnverified: /not on file/i.test(deliverable) && /unverified/i.test(deliverable),
    requirementR3Unchanged: r3 !== undefined && r3.statement.includes("-4") && r3.statement.includes("coastal"),
    goalUnchanged: project.goal === GOAL,
    taskAccepted: stateOfRefresh === "SATISFIED",
    resultCommitPresent: typeof result?.resultCommit === "string" && result.resultCommit.length === 40,
    journalHasAgentNegativeResult: (await journalOf(installed)).some((entry) => entry.kind === "NEGATIVE_RESULT" && entry.provenance.includes("agent")),
  };
  const failed = Object.entries(checks).filter(([key, value]) => key !== "journalHasAgentNegativeResult" && value !== true).map(([key]) => key);
  return {
    checks,
    failed,
    siteBVendors: siteB.map((vendor) => vendor.vendor),
    deliverable,
    requirementR3: r3 ?? null,
    taskState: stateOfRefresh,
    result,
  };
}

/* ================================================================== *
 * Recorder
 * ================================================================== */

export function makeRecorder() {
  const record = { startedAt: new Date().toISOString(), steps: [] };
  function capture(label, fn) {
    const at = new Date().toISOString();
    try {
      const value = fn();
      const entry = { label, at, ok: true, value: value === undefined ? null : value };
      record.steps.push(entry);
      return entry;
    } catch (error) {
      const entry = { label, at, ok: false, error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } };
      record.steps.push(entry);
      return entry;
    }
  }
  async function captureAsync(label, fn) {
    const at = new Date().toISOString();
    try {
      const value = await fn();
      const entry = { label, at, ok: true, value: value === undefined ? null : value };
      record.steps.push(entry);
      return entry;
    } catch (error) {
      const entry = { label, at, ok: false, error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) } };
      record.steps.push(entry);
      return entry;
    }
  }
  return { record, capture, captureAsync };
}
