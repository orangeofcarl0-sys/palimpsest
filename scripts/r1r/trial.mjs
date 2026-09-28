#!/usr/bin/env node
/**
 * R1-R §13–§22 — ONE PRIMARY TRIAL.
 *
 * One process per trial. That is not a convenience: §4 of the parent protocol requires a fresh install,
 * a fresh worker process, a fresh attempt and seeded durable state per trial, with no conversation or
 * transcript reuse and no manually-written handoff. A runner that looped trials in one process would
 * have to argue that its in-process state is irrelevant; a runner that spawns one process per trial
 * does not have to argue anything.
 *
 * WHAT ONE TRIAL DOES
 *
 *   Phase 0  build the world (fixture + H0), record the PAIRED-STATE DIGESTS (§14)
 *   Phase 1  install durable capital for this scenario (Proof + Reasoning + Procedure) and associate it
 *   Phase 2  dispose, COLD RESTART, install again, select capital per the CONDITION (§13)
 *   Phase 3  drive the REAL DSH stochastic worker through the shipped delegation seam
 *   Phase 4  read the payload, the transcript, the pull telemetry and the committed source
 *   Phase 5  judge the FIRST SUBMITTED CANDIDATE and the FINAL candidate against the HIDDEN acceptance
 *   Phase 6  detect the pre-paid known failure (§21) and write the trial record
 *
 * §19: a trial gets the ORDINARY product lifecycle. Nothing here restarts a worker because its result
 * was poor, and nothing retries a trial that failed. Ordinary product retry/escalation is RECORDED if
 * the product performs it; it is never performed by this harness.
 *
 * §16: pull bodies are never written into general telemetry. The trial record keeps handle ids, pull
 * order and result kinds; body CONTENT appears only as a fingerprint, and only where the record has to
 * prove the right object was returned.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { dshBin, dshHome, dshVersion, installHostBundle } from "../gates/env.mjs";
import { REPO_ROOT } from "./amendment.mjs";
import { deriveCapital } from "./capital.mjs";
import { detectKnownFailure } from "./known-failure.mjs";
import { judgeHidden, pairedStateDigest, runVisibleOracle, SCENARIOS, sha256 } from "./scenarios.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const SCENARIO = SCENARIOS[String(args.get("scenario") ?? "").toUpperCase()];
const CONDITION = String(args.get("condition") ?? "").toUpperCase();
const BLOCK = Number(args.get("block") ?? "0");
const REPETITION = Number(args.get("repetition") ?? "0");
const RIG = args.get("rig");
if (SCENARIO === undefined) throw new Error("--scenario=B|C is required");
if (!["C0", "C1", "C2"].includes(CONDITION)) throw new Error("--condition=C0|C1|C2 is required");
if (typeof RIG !== "string" || RIG === "") throw new Error("--rig=<dir> is required");

const TRIAL_ID = `${SCENARIO.id}-${CONDITION}-b${BLOCK}r${REPETITION}`;
const DIR = join(RIG, TRIAL_ID);
const PROJECT = join(DIR, "repo");
const STATE = join(DIR, "state");
const HOME = join(DIR, "home");
const OUT = join(DIR, "out");
const SCRATCH = join(DIR, "judge");
const PROFILE = `r1r${SCENARIO.id.toLowerCase()}${CONDITION.toLowerCase()}${BLOCK}`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL("../gates/d2-live-tee-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const WORKER_TIMEOUT_MS = 1_800_000;
const INDEX_HEADING = "Project context available to this attempt";

const git = (cwd, list) => execFileSync("git", [...list], { cwd, encoding: "utf8" }).trim();
const policyRef = (policyId) => ({ policyId, version: "v1" });

const advanced = await import(pathToFileURL(`${REPO_ROOT}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO_ROOT}/dist/src/interaction/work_delegation.js`).href);
const workWorker = await import(pathToFileURL(`${REPO_ROOT}/dist/src/deployment/work_worker.js`).href);
const proofModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/experiment/index.js`).href);

const capital = deriveCapital()[SCENARIO.id];
const project = SCENARIO.projectId;

/* ---------------------------------------------------------------- oracle instrumentation */

/**
 * §20 needs the number of VISIBLE-ORACLE invocations. The oracle runs INSIDE the worker's world, and
 * the PTC sandbox only permits writes under the workspace root — measured the hard way: an earlier
 * version of this instrumentation appended to a path OUTSIDE the world, and the worker reported that
 * `node test/check.js` aborted with EPERM, which would have silently made the task harder than the
 * task the experiment intends to measure.
 *
 * So the log is written NEXT TO THE ORACLE, resolved relative to the oracle's own module URL, which
 * lands inside whichever world the worker actually runs in. The count is read back from that world
 * after the trial. The log is untracked and outside the task's write scope, so the product's own scope
 * enforcement refuses to let it be committed.
 */
function instrumentOracle(worldDir, logName) {
  const checkPath = join(worldDir, "test", "check.js");
  const source = readFileSync(checkPath, "utf8");
  /**
   * No import is added: `appendFileSync` accepts a file URL directly, and `import.meta.url` is always
   * available in an ES module. An earlier version imported `fileURLToPath`, which COLLIDED with the
   * oracle's own import of it and made the oracle un-runnable — a defect a stochastic worker found and
   * reported, which is recorded in that trial's evidence rather than smoothed over.
   */
  const instrumented = [
    `try { appendFileSync(new URL(${JSON.stringify(logName)}, import.meta.url), String(Date.now()) + String.fromCharCode(10)); } catch { /* telemetry must never break the oracle */ }`,
    source.replace('import { readFileSync } from "node:fs";', 'import { readFileSync, appendFileSync } from "node:fs";'),
  ].join(String.fromCharCode(10));
  writeFileSync(checkPath, instrumented, "utf8");
  execFileSync("git", ["add", "-A"], { cwd: worldDir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0+instrumented-oracle"], { cwd: worldDir });
  return git(worldDir, ["rev-parse", "HEAD"]);
}

/** The oracle-invocation log's name, resolved inside the world by the instrumented oracle itself. */
const ORACLE_LOG_NAME = ".oracle-runs.log";

/* ---------------------------------------------------------------- policies */

const proofVerification = () => ({
  policyRef: policyRef("r1r-verification"),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 ? "SUPPORTED" : "INCONCLUSIVE", supportingEvidenceIds: supporting, contradictingEvidenceIds: [] };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef("r1r-publication"),
  async decide({ verification }) {
    return { decision: verification.standing === "SUPPORTED" ? "PUBLISH" : "UNRESOLVED", provenanceDigest: verification.provenanceDigest };
  },
});
const reasoningVerification = () => ({
  async verify({ definition, candidate, frontierBasis }) {
    const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };
    return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };
  },
  async verifyInvalidation({ definition, request, frontierBasis }) {
    const base = { schemaVersion: 1, cell: request.cell, candidateDigest: request.targetClaimId, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", evidenceIds: ["ev-9"], provenanceDigest: "b".repeat(64) };
    return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };
  },
});
const reasoningAdmission = () => ({
  async admit({ definition, candidate, verification, frontierBasis }) {
    const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT", provenanceDigest: "c".repeat(64) };
    return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };
  },
  async admitInvalidation({ definition, request, verification, frontierBasis }) {
    const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "INVALIDATE", provenanceDigest: "d".repeat(64) };
    return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };
  },
});

/**
 * §9/§10: the Procedure encodes METHOD. Its steps are the ordered clauses the exploration forced, in
 * the order the observations forced them, and nothing in it can widen the worker's authority.
 */
function procedureAuthoring() {
  const steps = capital.procedureClauses.map((clause) => ({ instruction: clause.instruction }));
  return {
    origin: "r1r-teacher-exploration",
    async propose() {
      return {
        outcome: "proposal",
        content: {
          schemaVersion: 1,
          title: SCENARIO.id === "B" ? "Validate the legacy document before migrating it" : "Establish replay validity before reducing",
          purpose: SCENARIO.id === "B"
            ? "migrate a legacy configuration document without silently repairing content that should have been refused"
            : "reduce a durable event stream into deterministic state, refusing histories that cannot be replayed",
          applicability: [SCENARIO.projectGoal],
          preconditions: ["the implementation and the black-box oracle are readable"],
          steps,
          checks: [SCENARIO.knownFailure === undefined ? "" : `the pre-paid mistake is avoided: ${SCENARIO.knownFailure}`],
          expectedOutputs: ["the black-box oracle reports every case as PASS"],
          limitations: ["does not authorize any command, path or effect beyond the task envelope", "advisory guidance only; it cannot widen write scope or allowed commands"],
          capabilityHints: [],
          recommendedRecipeRefs: [],
        },
      };
    },
  };
}
function procedureAdmission() {
  return {
    policyRef: policyRef("r1r-admission"),
    async decide({ candidateDigest, validation }) {
      return { decision: "PUBLISH", candidateDigest, rationale: `admitted for R1-R (groundsResolved=${validation.groundsResolved})`, policyRef: policyRef("r1r-admission") };
    },
  };
}

/* ---------------------------------------------------------------- install */

const paths = {
  proof: join(STATE, "proof.sqlite"),
  blobs: join(STATE, "proof-blobs"),
  cells: join(STATE, "cells.sqlite"),
  assoc: join(STATE, "assoc.sqlite"),
  memory: join(STATE, "memory.sqlite"),
  procedures: join(STATE, "procedures.sqlite"),
  orchestration: join(STATE, "orchestration.sqlite"),
  ordarium: join(STATE, "ordarium.sqlite"),
};

const STANDARD = Object.freeze({
  statement: "the black-box acceptance oracle passes and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze([...SCENARIO.oracleCommand]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze([`r1-r ${SCENARIO.id} fixture`]),
  confirmed: true,
  notes: Object.freeze([]),
});

function install() {
  const proofStore = new proofModule.SqliteProofEvidenceStore(paths.proof);
  const reasoningStore = new reasoningModule.SqliteReasoningCellStore(paths.cells);
  const assocStore = new workspaceModule.SqliteProjectAssetAssociationStore(paths.assoc);
  const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(paths.memory);
  const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: project,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: PROJECT,
      execution: "worktree",
      standard: STANDARD,
      policy: advanced.trustedDefaultPolicy({
        read_paths: ["src", "test", "README.md"],
        allowed_commands: [{ executable: "node", argv_prefix: [...SCENARIO.oracleCommand.slice(1)] }],
      }),
      proofEvidenceStore: proofStore,
      proofBlobStore: proofModule.localProofBlobStore(paths.blobs),
      proofVerificationPolicy: proofVerification(),
      proofPublicationAdmission: proofAdmission(),
      reasoningCellStore: reasoningStore,
      reasoningCellStoreOwned: false,
      reasoningVerificationPolicy: reasoningVerification(),
      reasoningAdmissionPolicy: reasoningAdmission(),
      projectAssociationStore: assocStore,
      organizationMemoryStore: memoryStore,
      procedureStore,
      procedureAuthoring: procedureAuthoring(),
      procedureAdmission: procedureAdmission(),
    },
  );
  return { installed, proofStore, procedureStore };
}

/* ---------------------------------------------------------------- phase 0: world */

const started = Date.now();
mkdirSync(OUT, { recursive: true });
const { buildWorld, assertOracleInaccessible } = await import("./scenarios.mjs");
const head = buildWorld(SCENARIO, PROJECT);
const worldHead = instrumentOracle(PROJECT, ORACLE_LOG_NAME);
/** The digest of the instrumented oracle, so the record can show the worker did not edit it. */
const instrumentedOracleDigest = sha256(readFileSync(join(PROJECT, "test", "check.js")));

const task = Object.freeze({
  task_id: "t1",
  objective: SCENARIO.taskObjective,
  depends_on: Object.freeze([]),
  write_paths: Object.freeze([SCENARIO.sourceFile]),
  required_artifacts: Object.freeze([]),
});

const inaccessible = assertOracleInaccessible(SCENARIO, PROJECT);
const paired = pairedStateDigest(SCENARIO, PROJECT, task);

/* ---------------------------------------------------------------- phase 1: capital */

const first = install();
first.installed.controller.start({
  projectId: project,
  goal: SCENARIO.projectGoal,
  headCommit: worldHead,
  tasks: [task],
});

const proof = first.installed.proof;
const imported = await proof.importSource({
  bytes: new TextEncoder().encode(capital.proof.statement),
  mediaType: "text/plain",
  label: `${SCENARIO.id}-proof`,
  provenance: "LOCAL_IMPORT",
  sourceId: `${SCENARIO.id}-proof`,
});
const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: `${SCENARIO.id}-proof`, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: "WHOLE_SOURCE" } });
const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: capital.proof.statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
await proof.verify({ candidateId: candidate.candidateId });
const published = await proof.decidePublication({ candidateId: candidate.candidateId });
const proofClaimId = published.claimId;

const cellId = `cell-${SCENARIO.id.toLowerCase()}`;
const cells = first.installed.reasoningCells;
await cells.service.openCell({ cellId, objective: capital.reasoning.branchQuestion, verificationPolicyRef: policyRef("r1r-rv"), admissionPolicyRef: policyRef("r1r-ra") });
const branch = await cells.service.openBranch({ cellId, question: capital.reasoning.branchQuestion });
const submitted = await cells.service.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: capital.reasoning.statement } });
await cells.service.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
const frontier = await cells.service.frontier({ cellId });
const reasoningClaimId = frontier.claims[0]?.ref.claimId;

const scenarioRef = memoryModule.materializeScenario({ scenarioId: "s1", scenarioRevision: 0, kind: "S1_LOW_COUPLING", classification: "SCRIPTED_MECHANICAL", task: SCENARIO.taskObjective, successCriteria: ["the black-box oracle reports every case as PASS"], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
const variantRef = memoryModule.materializeVariant({ variantId: "v1", kind: "SINGLE_LOCUS", description: "validate-then-transform" });
const experiment = memoryModule.materializeExperiment({ experimentId: `exp-${SCENARIO.id.toLowerCase()}`, revision: 0, objective: capital.reasoning.branchQuestion, scenarioRefs: [{ scenarioId: scenarioRef.scenarioId, scenarioRevision: 0, digest: scenarioRef.digest }], variantRefs: [{ variantId: variantRef.variantId, digest: variantRef.digest }], measurementPlan: { metricIds: ["quality"], primaryValidatorRef: "validator-1", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
await first.installed.organizationMemory.recordExperiment(experiment);
await first.installed.organizationMemory.recordScenario(experiment.experimentId, scenarioRef);
await first.installed.organizationMemory.recordVariant(experiment.experimentId, variantRef);
const runResult = experimentModule.buildRunResult({
  spec: { experiment, scenario: scenarioRef, variant: variantRef, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
  provenance: { provider: "r1-r", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
  execution: { outcome: "PASS", failureClassification: "NONE", measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "r1-r" })], validatorResults: [] },
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:01.000Z",
});
await first.installed.organizationMemory.recordRun(experiment.experimentId, runResult);
const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenarioRef], variants: [variantRef], runs: [runResult], corrections: [], annotations: [] });
await first.installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);
const prepared = await first.installed.procedures.prepare({ grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: evaluation.evaluationRef }], projectContext: { projectId: project, projectRevision: 1, projectDigest: "4".repeat(64), objective: SCENARIO.taskObjective } });
const procPub = await first.installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
if (procPub.status !== "published") throw new Error(`procedure publish answered ${procPub.status}`);

const workspace = first.installed.projectWorkspace;
await workspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: proofClaimId }, associationKind: "MANUAL", provenance: "r1-r" });
await workspace.associateAsset({ projectId: project, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: cellId }, associationKind: "MANUAL", provenance: "r1-r" });
await workspace.associateAsset({ projectId: project, assetKind: "PROCEDURE", canonicalRef: { kind: "PROCEDURE", id: `${procPub.ref.procedureId}@${procPub.ref.revision}`, digest: procPub.revision.digest }, associationKind: "MANUAL", provenance: "r1-r" });
await first.installed.dispose();
first.procedureStore.close();

/* ---------------------------------------------------------------- phase 2: home + worker */

mkdirSync(join(HOME, "profiles", PROFILE), { recursive: true });
installHostBundle({ repo: REPO_ROOT, realDshHome: REAL_DSH });
execFileSync("cmd", ["/c", "mklink", "/J", `${HOME.replace(/\//gu, "\\")}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, "\\")}\\profiles\\node_modules`], { stdio: "ignore" });
writeFileSync(join(HOME, "settings.yaml"), ["agent-default-model:", "  provider: deepseek-official", "  model: deepseek-flash", "locale:", "  preference: zh", ""].join("\n"));
copyFileSync(join(REAL_DSH, ".credentials.yaml"), join(HOME, ".credentials.yaml"));
writeFileSync(
  join(HOME, "profiles", PROFILE, "deployment.json"),
  `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: project, localPeer: `${PROFILE}-peer`, persistentPoint: `pp-${PROFILE}`, repository: PROJECT, transport: { namespace: PROFILE, databasePath: join(STATE, "transport.sqlite") }, databases: { orchestration: paths.orchestration, ordarium: paths.ordarium, coordination: join(STATE, "coordination.sqlite"), transportCursors: join(STATE, "cursors.sqlite") }, reasoning: {}, execution: "worktree", concurrency: 1, policy: { allowed_commands: [{ executable: "node", argv_prefix: [...SCENARIO.oracleCommand.slice(1)] }] }, standard: { statement: "the black-box acceptance oracle passes" } }, null, 2)}\n`,
);
writeFileSync(join(HOME, "profiles", PROFILE, "package.json"), `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`);
writeFileSync(
  join(HOME, "profiles", PROFILE, "cordis.patch.yml"),
  ["- id: palimpsest-tools", "  config:", `    palimpsestEntry: '${REPO_ROOT}/dist/src/advanced.js'`, `    deploymentProfile: '${join(HOME, "profiles", PROFILE, "deployment.json")}'`, "    serve: false", "    openDashboard: false", ""].join("\n"),
);

const transcript = join(OUT, "worker-transcript.txt");
const payloadSink = join(OUT, "payload.json");
const promptSink = join(OUT, "rendered-prompt.json");
const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

const record = {
  schemaVersion: 1,
  trialId: TRIAL_ID,
  scenario: SCENARIO.name,
  condition: CONDITION,
  block: BLOCK,
  repetition: REPETITION,
  knownFailureName: SCENARIO.knownFailure,
  pairedState: paired,
  oracleInaccessible: inaccessible,
  capital: {
    proofClaimId,
    reasoningCellId: cellId,
    reasoningClaimId,
    procedureRef: `${procPub.ref.procedureId}@${procPub.ref.revision}`,
    procedureDigest: procPub.revision.digest,
  },
};

let view;
let hostFailure = null;
try {
  const second = install();
  const controller = second.installed.controller;
  const service = delegation.makeWorkDelegationService({
    controller,
    workerFor: () => {
      const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: WORKER_TIMEOUT_MS });
      return {
        adapterId: port.adapterId,
        async run(input) {
          writeFileSync(payloadSink, JSON.stringify(workWorker.workWorkerEnvironmentPayload(input.context), null, 2), "utf8");
          return await port.run(input);
        },
      };
    },
  });

  /** §13: the ONLY thing that varies. C0 selects nothing; C1 the epistemic pair; C2 adds the method. */
  const selection =
    CONDITION === "C0"
      ? undefined
      : CONDITION === "C1"
        ? { proof: [{ claimId: proofClaimId }], reasoning: [{ cellId, claimId: reasoningClaimId }] }
        : { proof: [{ claimId: proofClaimId }], reasoning: [{ cellId, claimId: reasoningClaimId }], procedure: [{ procedureId: procPub.ref.procedureId, revision: procPub.ref.revision, reason: "the admitted method for this task" }] };

  const jobStarted = await service.start(selection === undefined ? { expectedTaskId: "t1" } : { expectedTaskId: "t1", knowledge: selection });
  record.jobId = jobStarted.jobId;
  view = await service.followup({ jobId: jobStarted.jobId });
  for (let i = 0; i < 6_000 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: jobStarted.jobId });
  }
  record.jobPhase = view.phase;
  record.hostError = view.hostError ?? null;
  record.attemptId = view.attemptId ?? null;

  /* -- phase 4: what the worker was handed and what it did -------------------- */
  if (existsSync(payloadSink)) {
    const payload = JSON.parse(readFileSync(payloadSink, "utf8"));
    const handles = payload?.context?.compiled?.handles ?? [];
    const indexText = typeof payload?.contextIndexText === "string" ? payload.contextIndexText : "";
    const w = payload.context.work;
    const listed = (value) => (Array.isArray(value) && value.length > 0 ? value.map((entry) => `  - ${entry}`).join(String.fromCharCode(10)) : "  (none)");
    const promptText = [
      "You are a Palimpsest WORK WORKER: a capable engineering agent running inside ONE isolated execution world prepared for one canonical Work task.",
      "You are NOT the principal: you cannot settle, verify, promote or plan anything, and no canonical fact changes because you say so.",
      "",
      `Project goal: ${w.projectGoal}`,
      `Requirements:${String.fromCharCode(10)}${listed(w.requirements)}`,
      `Decisions in force:${String.fromCharCode(10)}${listed(w.decisions)}`,
      "",
      `Your task: ${w.objective}`,
      `Write scope (changes outside it are refused when the product observes the tree):${String.fromCharCode(10)}${listed(w.writeScope)}`,
      `Required artifacts:${String.fromCharCode(10)}${listed(w.requiredArtifacts)}`,
      `Base commit: ${w.baseCommit}`,
      `What completion will require:${String.fromCharCode(10)}${listed(w.completionChecks)}`,
      `Independent verification required: ${w.independentVerificationRequired === true ? "yes" : "no"}`,
    ].join(String.fromCharCode(10));
    const cutAt = promptText.indexOf(INDEX_HEADING);
    const ordinary = cutAt === -1 ? promptText : promptText.slice(0, cutAt);
    record.prompt = {
      ordinaryTaskDigest: sha256(ordinary.replace(/^Base commit: .*$/mu, "Base commit: <masked>")),
      indexSection: indexText,
      indexHandleCount: indexText.split(String.fromCharCode(10)).filter((line) => line.includes("@ctx/")).length,
      handlesInPayload: handles.map((entry) => `${entry.kind}:${entry.handle}`),
      pullToolName: payload?.contextPullTool?.name ?? null,
      resultToolName: payload?.resultTool?.name ?? null,
      allowedPullHandles: payload?.allowedPullHandles ?? [],
      capabilitySetDigest: sha256(JSON.stringify({ pull: payload?.contextPullTool?.name ?? null, result: payload?.resultTool?.name ?? null, denied: payload?.deniedAuthorityPrefix ?? null })),
      ordinaryTaskText: ordinary,
    };
    writeFileSync(promptSink, JSON.stringify(record.prompt, null, 2), "utf8");
  }

  if (existsSync(transcript)) {
    const text = readFileSync(transcript, "utf8");
    const lines = text.split(/\r?\n/u);
    const envLine = lines.find((line) => line.startsWith("PALIMPSEST_WORKER_ENV")) ?? "";
    const pullLines = lines.filter((line) => line.startsWith("PALIMPSEST_WORKER_PULL"));
    const outcomeLine = lines.filter((line) => line.startsWith("PALIMPSEST_WORK_RESULT")).pop() ?? "";
    const env = envLine === "" ? {} : JSON.parse(envLine.slice(envLine.indexOf("{")));
    const pull = pullLines.length === 0 ? { pulled: [] } : JSON.parse(pullLines[pullLines.length - 1].slice(pullLines[pullLines.length - 1].indexOf("{")));
    record.worker = {
      offeredTools: env.offeredTools ?? [],
      presentation: env.presentation ?? null,
      deniedPrincipalToolCount: (env.deniedTools ?? []).length,
      pulledHandles: pull.pulled ?? [],
      pullOrder: pull.pulled ?? [],
      pullTelemetryLines: pullLines.length,
      outcomeKind: /"kind":"([A-Z_]+)"/u.exec(outcomeLine)?.[1] ?? "UNKNOWN",
      outcomeSummary: /"summary":"((?:[^"\\]|\\.)*)"/u.exec(outcomeLine)?.[1]?.slice(0, 600) ?? "",
      escalationReason: /"reason":"((?:[^"\\]|\\.)*)"/u.exec(outcomeLine)?.[1]?.slice(0, 400) ?? "",
      transcriptBytes: Buffer.byteLength(text, "utf8"),
    };
  }

  /* -- phase 5/6: judge the candidate ---------------------------------------- */
  const world = view.attemptId === undefined || view.attemptId === null ? null : (() => { try { return controller.observeAttemptResult(view.attemptId); } catch { return null; } })();
  record.worldObserved = world !== null && world !== undefined;
  if (world !== null && world !== undefined) {
    const workDir = world.workDir;
    record.workDir = workDir;
    // §20: FIRST SUBMITTED CANDIDATE vs FINAL. The first candidate is the OLDEST commit that changed
    // the target source and is NOT reachable from the world's starting commit — i.e. the worker's first
    // submission, not the H0 baseline the world began from. Resolving this to the H0 commit would report
    // the starting implementation's score as the worker's first attempt, a different measurement
    // entirely. Ancestry is used rather than a plain file log because the starting commit itself does
    // not touch the target source (it only instruments the oracle), so it never appears in that log.
    const workerCommits = git(workDir, ["rev-list", "--reverse", "HEAD", `^${worldHead}`, "--", SCENARIO.sourceFile])
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const firstCandidateCommit = workerCommits.length > 0 ? workerCommits[0] : null;
    record.implementationRevisions = Math.max(0, workerCommits.length - 1);
    record.workerAttempts = 1;
    record.workerCommitCount = workerCommits.length;
    record.commits = git(workDir, ["rev-list", "--count", "HEAD"]).trim();
    const finalSource = git(workDir, ["show", `HEAD:${SCENARIO.sourceFile}`]);
    // A worker that never committed its work leaves no first candidate; the honest record is that no
    // candidate was submitted, rather than the starting implementation being reported as one.
    const firstSource = firstCandidateCommit === null ? null : git(workDir, ["show", `${firstCandidateCommit}:${SCENARIO.sourceFile}`]);
    writeFileSync(join(OUT, "final-source.txt"), finalSource, "utf8");
    if (firstSource !== null) writeFileSync(join(OUT, "first-source.txt"), firstSource, "utf8");
    record.submittedCandidate = firstSource !== null;
    record.sourceBytes = Buffer.byteLength(finalSource, "utf8");
    record.firstSourceEqualsFinal = firstSource !== null && firstSource === finalSource;
    // The oracle file the worker was given must be unmodified for the invocation count to be
    // meaningful; an edited oracle is recorded rather than silently tolerated (§20). The comparison is
    // line-ending-insensitive: Git checks the fixture out with CRLF on Windows, and a digest that
    // changed on checkout would report every trial as having edited the oracle.
    const normalize = (text) => text.replace(/\r\n/gu, "\n");
    const committedOracle = git(workDir, ["show", `${worldHead}:test/check.js`]);
    record.oracleFileDigest = sha256(readFileSync(join(workDir, "test", "check.js")));
    record.oracleFileUnmodified = normalize(readFileSync(join(workDir, "test", "check.js"), "utf8")) === normalize(committedOracle);

    const finalJudgement = await judgeHidden(SCENARIO, finalSource, join(SCRATCH, "final"));
    record.finalAcceptance = { passed: finalJudgement.passed, total: finalJudgement.total, failures: finalJudgement.results.filter((r) => !r.pass).map((r) => `${r.id}:${r.failureClass}`) };
    /**
     * §20: when the worker submitted no candidate at all, "first candidate acceptance" is recorded as
     * an ABSENT measurement rather than as a score. Reporting 0/16 would be indistinguishable from a
     * submission that scored nothing, and reporting the final score would be a fabrication.
     */
    const firstJudgement = firstSource === null ? null : await judgeHidden(SCENARIO, firstSource, join(SCRATCH, "first"));
    record.firstCandidateAcceptance = firstJudgement === null
      ? { passed: null, total: null, failures: [], note: "NO_CANDIDATE_SUBMITTED — the worker committed no change to the target source" }
      : { passed: firstJudgement.passed, total: firstJudgement.total, failures: firstJudgement.results.filter((r) => !r.pass).map((r) => `${r.id}:${r.failureClass}`) };

    // §21: the pre-paid mistake, detected BEHAVIOURALLY on the final candidate.
    const finalModule = await import(`${pathToFileURL(join(SCRATCH, "final", SCENARIO.sourceFile)).href}?v=${Date.now()}`);
    const finalFn = finalModule[SCENARIO.exportName];
    record.knownFailureFinal = detectKnownFailure(SCENARIO.id, finalFn);
    if (firstSource === null) {
      record.knownFailureFirst = { detector: SCENARIO.knownFailureDetector, recurred: "UNKNOWN", violations: [], probesRun: 0, note: "NO_CANDIDATE_SUBMITTED" };
    } else {
      const firstModule = await import(`${pathToFileURL(join(SCRATCH, "first", SCENARIO.sourceFile)).href}?v=${Date.now() + 1}`);
      const firstFn = firstModule[SCENARIO.exportName];
      record.knownFailureFirst = typeof firstFn === "function" ? detectKnownFailure(SCENARIO.id, firstFn) : { detector: SCENARIO.knownFailureDetector, recurred: "UNKNOWN", violations: [], probesRun: 0 };
    }
  } else {
    record.finalAcceptance = { passed: 0, total: 0, failures: ["NO_WORLD"] };
    record.firstCandidateAcceptance = { passed: 0, total: 0, failures: ["NO_WORLD"] };
    record.knownFailureFinal = { detector: SCENARIO.knownFailureDetector, recurred: "UNKNOWN", violations: [], probesRun: 0 };
    record.knownFailureFirst = { detector: SCENARIO.knownFailureDetector, recurred: "UNKNOWN", violations: [], probesRun: 0 };
  }

  await second.installed.dispose().catch(() => undefined);
  second.procedureStore.close();
} catch (error) {
  hostFailure = error?.stack ?? String(error);
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
}

/* -- oracle invocation count, from the instrumented oracle's own log INSIDE the world ---------- */
const oracleLogPath = record.workDir === undefined ? null : join(record.workDir, "test", ORACLE_LOG_NAME);
const oracleLogText = oracleLogPath !== null && existsSync(oracleLogPath) ? readFileSync(oracleLogPath, "utf8") : "";
record.visibleOracleInvocations = oracleLogText.split("\n").filter((line) => line.trim() !== "").length;
record.visibleOracleLogObserved = oracleLogPath !== null && existsSync(oracleLogPath);
// §20: the hidden oracle is invoked by THIS harness, once per judged candidate.
record.hiddenOracleInvocations = record.finalAcceptance === undefined ? 0 : (record.firstSourceEqualsFinal === true ? 1 : 2);

record.hostFailure = hostFailure;
record.timedOut = view !== undefined && (view.phase === "QUEUED" || view.phase === "RUNNING");
record.manualInterventions = 0;
record.elapsedMs = Date.now() - started;
record.tokens = { exposed: false, note: "the DSH host does not expose token counts to this seam; recorded as UNKNOWN rather than inferred (parent §5)" };

writeFileSync(join(OUT, "trial.json"), JSON.stringify(record, null, 2), "utf8");
process.stdout.write(`${TRIAL_ID} phase=${record.jobPhase ?? "HOST_ERROR"} final=${record.finalAcceptance.passed}/${record.finalAcceptance.total} first=${record.firstCandidateAcceptance.passed}/${record.firstCandidateAcceptance.total} knownFailure=${record.knownFailureFinal.recurred} pulled=${(record.worker?.pulledHandles ?? []).length} oracleRuns=${record.visibleOracleInvocations}${record.hostFailure === null ? "" : " HOST_FAILURE"}\n`);
process.exit(0);
