/**
 * COG-4 shared rig — deterministic Work Results over a test-owned world, packaged continuation
 * inspection, an expert-layer D3 diagnostic, and portable session/usage readers.
 *
 * READ-ONLY with respect to every non-test resource. Every run directory is explicit; no owner path
 * is hardcoded; the DSH binary is detected and recorded. Nothing here is production code.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";

export const REPO = resolve(import.meta.dirname, "..", "..");
export const RIG = process.env.COG4_RIG ?? join(REPO, "..", ".cog4-rig");
export const SCENARIO = join(import.meta.dirname, "scenario");
export const TIMEOUT_MS = Number(process.env.COG4_TIMEOUT_MS ?? 720_000);

function which(name) {
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", [name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "");
  } catch {
    return [];
  }
}

export function detectDshBin() {
  const explicit = process.env.COG4_DSH_BIN;
  if (typeof explicit === "string" && explicit.trim() !== "" && existsSync(explicit)) return resolve(explicit);
  for (const line of which("dsh")) {
    const dir = dirname(line);
    for (const candidate of [
      join(dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
      join(dir, "..", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    ]) {
      if (existsSync(candidate)) return resolve(candidate);
    }
  }
  const shared = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh");
  const pkg = join(shared, "package.json");
  if (existsSync(pkg)) {
    try {
      const parsed = JSON.parse(readFileSync(pkg, "utf8"));
      const bin = typeof parsed?.bin === "object" && parsed.bin !== null ? parsed.bin.dsh : parsed?.bin;
      if (typeof bin === "string") {
        const candidate = join(shared, bin);
        if (existsSync(candidate)) return resolve(candidate);
      }
    } catch {
      /* fall through */
    }
  }
  throw new Error(`COG-4 cannot locate the DSH CLI: probed PATH ${JSON.stringify(which("dsh"))}, ${pkg}, and COG4_DSH_BIN.`);
}

export function detectZstd() {
  const explicit = process.env.COG4_ZSTD;
  if (typeof explicit === "string" && explicit.trim() !== "" && existsSync(explicit)) return resolve(explicit);
  const found = which("zstd");
  if (found.length > 0) return resolve(found[0]);
  return null;
}

export const DSH_BIN = detectDshBin();
export const ZSTD = detectZstd();

export function apiKey() {
  const yaml = readFileSync(`${homedir()}/.dsh/.credentials.yaml`, "utf8");
  const match = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  if (match === null) throw new Error("the owner's credential store has no DEEPSEEK_API_KEY");
  return match[1];
}

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
  const expected = ["package.json", "sources/brief.md", "sources/newsletter.md", "sources/prior-notes.md", "sources/rollout-windows.md", "sources/sites.md", "sources/vendor-capabilities.csv", "sources/vendor-pricing.csv", "verify.mjs", "deliverables/.gitkeep"];
  if (staged.sort().join("|") !== expected.sort().join("|")) {
    throw new Error(`seed staged an unexpected path set: ${staged.join(", ")}`);
  }
  git(["commit", "-q", "-m", "seed: Sablewick programme pack"], workDir);
}

/**
 * Apply a source update with an EXPLICIT staged-path allowlist. This is the COG-3 defect's fix:
 * no `git add -A`, and the staged set is verified before the commit.
 */
export function applyUpdate(workDir, input) {
  const targetRelative = input.target;
  const sourcePath = input.source;
  const before = worldHead(workDir);
  cpSync(sourcePath, join(workDir, targetRelative));
  git(["add", "--", targetRelative], workDir);
  const staged = git(["diff", "--cached", "--name-only"], workDir).split(/\r?\n/u).filter(Boolean);
  if (staged.length !== 1 || staged[0] !== targetRelative) {
    throw new Error(`update staged ${JSON.stringify(staged)} but the registered update path was ${JSON.stringify([targetRelative])}`);
  }
  git(["commit", "-q", "-m", input.message], workDir);
  return Object.freeze({ fromHead: before, toHead: worldHead(workDir), paths: Object.freeze(staged), target: targetRelative });
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
  return {
    allowed_commands: [{ executable: "node", argv_prefix: ["verify.mjs"] }],
  };
}

/* ================================================================== *
 * The deterministic worker. It is NOT a model: every read and the one write are code.
 * ================================================================== */
function technicalFit(worldPath) {
  const caps = readFileSync(join(worldPath, "sources", "vendor-capabilities.csv"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [vendor, chemistry, minC, maxC, warranty, coastal, width, lead] = line.split(",");
      return { vendor, chemistry, minC: Number(minC), maxC: Number(maxC), warranty: Number(warranty), coastal: coastal === "yes", width: Number(width), lead: Number(lead) };
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

export function deterministicWorker(worldPath) {
  return Object.freeze({
    adapterId: "cog4-deterministic-worker",
    async run(input) {
      const writeScope = input.context?.work?.writeScope ?? [];
      const target = writeScope[0];
      if (typeof target !== "string" || target === "") throw new Error("the deterministic worker got no write scope");
      const text = target.endsWith("technical-fit.md") ? technicalFit(worldPath) : target.endsWith("cost-schedule.md") ? costSchedule(worldPath) : null;
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
      workWorkerPort: (worldPath) => deterministicWorker(worldPath),
    },
  );
  return installed;
}

export function seedProject(installed, input) {
  const start = installed.controller.start({
    projectId: input.projectId,
    goal: input.goal,
    tasks: input.tasks,
    headCommit: input.headCommit,
    ...(input.stageGraph === undefined ? {} : { stageGraph: input.stageGraph }),
  });
  return start;
}

export async function seedJournal(installed, input) {
  const workspace = installed.projectWorkspace;
  if (workspace === undefined) throw new Error("the install composed no project workspace");
  const entries = [];
  for (const entry of input.entries) {
    const written = await workspace.recordJournalEntry({
      projectId: input.projectId,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      provenance: entry.provenance,
    });
    entries.push({ entryId: written.entryId, kind: written.kind, title: written.title });
  }
  return entries;
}

export function attemptOf(installed, taskId) {
  const row = installed.controller.store.connection
    .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
    .get(installed.controller.projectId, taskId);
  return row === undefined ? null : { attemptId: String(row.attempt_id), state: String(row.state) };
}

export async function waitForAttempt(installed, taskId, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const attempt = attemptOf(installed, taskId);
    if (attempt !== null && attempt.state === "COMPLETED") return attempt;
    if (Date.now() > deadline) throw new Error(`attempt for ${taskId} did not complete; last=${JSON.stringify(attempt)}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
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
    return { jobId: started.jobId, attemptId: attempt?.attemptId ?? null, phase: view.phase, settlement: view.settlement ?? null, hostError: view.hostError ?? null, task: installed.controller.work.task(taskId) };
  }
  // The completion evaluator already ran the real `node verify.mjs` for a non-documentation task and
  // recorded its evidence. For a documentation/data write scope the contract narrows the command clause
  // out by its declared applicability rule, so the settle records scope + artifacts. Either way the
  // scheduler's next step is the ordinary batch transition; no gate is fabricated here.
  let stepped = null;
  try {
    stepped = installed.controller.step();
  } catch (error) {
    stepped = { error: error instanceof Error ? error.message : String(error) };
  }
  return { jobId: started.jobId, attemptId: attempt.attemptId, phase: view.phase, settlement: view.settlement ?? null, hostError: view.hostError ?? null, stepped: typeof stepped === "object" ? stepped : { event_type: stepped?.event_type ?? null }, task: installed.controller.work.task(taskId) };
}

export function resultOf(installed, attemptId) {
  const event = installed.controller.store
    .listEvents(installed.controller.projectId)
    .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
  if (event === undefined) return null;
  const payload = event.payload;
  return { eventId: Number(event.event_id), resultCommit: payload.attempt_report?.result_commit ?? null, report: payload.attempt_report ?? null };
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

/* ================================================================== *
 * The expert-layer D3 diagnostic: the SAME authority kernel, with a test-owned precise read set.
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
  const { gitSourceChangeObserver, GIT_SOURCE_OBSERVER_ID, GIT_SOURCE_OBSERVER_VERSION, GIT_SOURCE_MECHANISM } = await import("../../dist/src/deployment/source_change_observer.js");
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
  const issuer = makeCompatibilityIssuer({ issuerId: "cog4-expert-diagnostic", observations, databasePath: ":memory:" });
  const sourceRecorder = observations.registerObserver({
    observerId: GIT_SOURCE_OBSERVER_ID,
    observerVersion: GIT_SOURCE_OBSERVER_VERSION,
    mechanism: GIT_SOURCE_MECHANISM,
  });
  const conservative = observations.registerObserver({
    observerId: "cog4-test-owned-instrumented-reads",
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
  /**
   * `changeFrom: "result"` asks the diagnostic a different question: what changed in the world AFTER
   * this result was produced? That is the applicability question for an already-promoted result, whose
   * own output is part of the origin-to-current diff. The packaged service always asks origin-to-current;
   * the expert diagnostic can ask either, and both are recorded.
   */
  const changeBase = input.changeFrom === "result" && resolved.sourceResult !== null ? resolved.sourceResult.resultRevision : origin;
  const scopeOf = (from, to) => ({ domain: "source", scopeRef: repo, from, to });
  const changeRef =
    current.ok
      ? sourceObserver.observeChange({ fromRevision: changeBase, toRevision: current.revision.revision, scopeRef: repo })
      : conservative.unavailable({ domain: "source", detail: "the current source revision could not be observed" });
  const writeRef =
    resolved.sourceResult === null
      ? conservative.unavailable({ domain: "source", detail: "the result produced no canonical source revision" })
      : sourceObserver.observeChange({ fromRevision: origin, toRevision: resolved.sourceResult.resultRevision, scopeRef: repo });
  const readRef = conservative.record({
    scope: scopeOf(origin, origin),
    selectors: input.readPaths.map((path) => ({ domain: "source", scope: "path", path })),
  });
  const assetsRef = conservative.record({ scope: { domain: "assets", scopeRef: "none", from: "-", to: "-" }, selectors: [] });
  const environmentRef = conservative.record({ scope: { domain: "environment", scopeRef: "none", from: "-", to: "-" }, selectors: [] });
  const projectSemanticRef =
    input.projectSemantic === "unavailable"
      ? conservative.unavailable({ domain: "project_semantic", detail: "no first-party observer exists for the project semantic change domain" })
      : conservative.record({ scope: { domain: "project_semantic", scopeRef: projectId, from: String(observation.observeRevision()), to: String(observation.observeRevision()) }, selectors: [] });
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
  });
}

/* ================================================================== *
 * Session decoding and usage observation
 * ================================================================== */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

export function decodeZstdFrames(buffer) {
  const positions = [];
  let index = buffer.indexOf(ZSTD_MAGIC, 0);
  while (index !== -1) {
    positions.push(index);
    index = buffer.indexOf(ZSTD_MAGIC, index + 4);
  }
  if (positions.length === 0) throw new Error("no zstd frame magic found");
  const parts = [];
  for (let frame = 0; frame < positions.length; frame += 1) {
    const start = positions[frame];
    const end = frame + 1 < positions.length ? positions[frame + 1] : buffer.length;
    parts.push(zstdDecompressSync(buffer.subarray(start, end)));
  }
  return Buffer.concat(parts);
}

export function decodeSession(file) {
  const text = decodeZstdFrames(readFileSync(file)).toString("utf8");
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== "");
  const events = [];
  let badLines = 0;
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      badLines += 1;
    }
  }
  return { text, events, lines: lines.length, badLines, bytes: Buffer.byteLength(text, "utf8") };
}

function walkSessions(root, out = []) {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walkSessions(path, out);
    else if (entry.name.endsWith(".zstd")) out.push(path);
  }
  return out;
}

export function sessionFiles(homeDir) {
  return walkSessions(join(homeDir, "sessions"));
}

export function sessionTelemetry(homeDir) {
  const files = sessionFiles(homeDir);
  return files.map((file) => {
    let decoded;
    try {
      decoded = decodeSession(file);
    } catch (error) {
      return { file, error: error instanceof Error ? error.message : String(error) };
    }
    const session = decoded.events.find((event) => event.type === "session");
    const messages = decoded.events.filter((event) => event.type === "assistant/message" && event.data?.usage);
    const usage = messages.reduce(
      (sum, event) => ({
        inputTokens: sum.inputTokens + (event.data.usage.inputTokens ?? 0),
        outputTokens: sum.outputTokens + (event.data.usage.outputTokens ?? 0),
        cacheReadTokens: sum.cacheReadTokens + (event.data.usage.cacheReadTokens ?? 0),
        cacheWriteTokens: sum.cacheWriteTokens + (event.data.usage.cacheWriteTokens ?? 0),
        totalTokens: sum.totalTokens + (event.data.usage.totalTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 },
    );
    const toolCalls = decoded.events.filter((event) => event.type === "tool/call");
    const tools = {};
    for (const call of toolCalls) tools[call.data?.name ?? "?"] = (tools[call.data?.name ?? "?"] ?? 0) + 1;
    const turns = decoded.events.filter((event) => event.type === "turn/start").length;
    return {
      file,
      sessionId: session?.id ?? null,
      createdAt: session?.createdAt ?? null,
      cwd: session?.cwd ?? null,
      events: decoded.events.length,
      lines: decoded.lines,
      badLines: decoded.badLines,
      messages: messages.length,
      turns,
      toolCalls: toolCalls.length,
      tools,
      usage,
      finalEvent: decoded.events[decoded.events.length - 1]?.type ?? null,
      lastSeq: decoded.events[decoded.events.length - 1]?.seq ?? null,
    };
  });
}

/** Feed every assistant/message usage event in a home into the budget monitor (idempotent). */
export function observeHomeUsage(homeDir, monitor, role = "principal", parent = null, startedAt = null) {
  const observations = [];
  for (const file of sessionFiles(homeDir)) {
    let decoded;
    try {
      decoded = decodeSession(file);
    } catch (error) {
      monitor.recordUnavailable({ sessionKey: `${homeDir}:${file}`, home: homeDir, sessionId: file, role, reason: `session stream undecodable: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    const session = decoded.events.find((event) => event.type === "session");
    const sessionId = session?.id ?? file;
    for (const event of decoded.events) {
      if (event.type !== "assistant/message" || event.data?.usage === undefined) continue;
      const result = monitor.observeUsage({
        sessionKey: `${homeDir}:${sessionId}`,
        sessionId,
        home: homeDir,
        role,
        parent,
        startedAt,
        seq: event.seq,
        eventAt: event.time,
        observedAt: new Date().toISOString(),
        usage: event.data.usage,
      });
      observations.push({ sessionId, seq: event.seq, counted: result.counted, duplicate: result.duplicate });
    }
  }
  return observations;
}
