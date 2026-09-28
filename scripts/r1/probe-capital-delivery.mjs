#!/usr/bin/env node
/**
 * R1 §5/§16 — DECISIVE PROBE: can explicitly-selected durable capital reach a REAL stochastic worker?
 *
 * This is NOT the R1 experiment. It is the one question every R1 condition depends on, asked
 * empirically of the SHIPPED product before anything is built on top of the answer:
 *
 *     durable Proof / Reasoning / Procedure  →  explicit selection  →  canonical binding
 *       →  ...  →  what does the STOCHASTIC WORKER actually receive?
 *
 * The E1-K and E5-P gates prove the selection and the pull, but their workers are IN-PROCESS JS
 * fixtures that call `controller.fetchContext(...)` directly. A real DSH worker is a separate process
 * that composes no deployment and no store (D2-c), so "the fixture could pull it" does not settle
 * whether a stochastic worker can.
 *
 * So this probe runs the REAL `dshSubprocessWorkWorkerPort` through the STANDARD delegation path with
 * a real knowledge selection, and records what the worker process was handed:
 *
 *   · the `--work` payload it was launched with (does it carry bodies, or only handles?);
 *   · the prompt the host actually built for the model (does it render the capital?);
 *   · the tools the model was actually offered (can it pull?);
 *   · whether the worker's committed source reflects the method.
 *
 * PLAIN JAVASCRIPT (`.mjs`), like the gates it borrows its discipline from.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { dshBin, dshHome, dshVersion } from "../gates/env.mjs";

/** This Palimpsest checkout: the probe is run from its root, like the gates' `gateRepoRoot()`. */
const PROJECT_ROOT = process.cwd();
/**
 * WHICH CONDITION to deliver. R1 §12 defines three; this probe runs one per process so each gets a
 * FRESH fixture and the trial-isolation discipline (§11/§14) is not weakened.
 */
const CONDITION = (process.argv.find((arg) => arg.startsWith("--condition="))?.split("=")[1] ?? "C2").toUpperCase();
if (!["C0", "C1", "C2"].includes(CONDITION)) throw new Error(`unknown condition ${CONDITION}`);

/** §12: the ONLY thing that varies. C0 selects nothing; C1 adds the epistemic pair; C2 adds the method. */
const selectionFor = (refs) => {
  if (CONDITION === "C0") return undefined;
  if (CONDITION === "C1") return { proof: [{ claimId: refs.proofClaimId }], reasoning: [{ cellId: "cell-cycle", claimId: refs.reasoningClaimId }] };
  return {
    proof: [{ claimId: refs.proofClaimId }],
    reasoning: [{ cellId: "cell-cycle", claimId: refs.reasoningClaimId }],
    procedure: [{ procedureId: refs.procedureId, revision: refs.procedureRevision, reason: "the admitted method for this task" }],
  };
};

const project = "r1probe";

const RUN = join(homedir(), ".palimpsest-r1");
const RIG = join(RUN, `probe-${CONDITION}`);
const PROJECT = join(RIG, "repo");
const STATE = join(RIG, "state");
const HOME = join(RIG, "home");
const OUT = join(RIG, "out");

const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const PROFILE = "r1probe";
const TEE = new URL("../gates/d2-live-tee-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const WORKER_TIMEOUT_MS = 900_000;

const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
const out = (line) => process.stdout.write(`${line}\n`);

const advanced = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/interaction/work_delegation.js`).href);
const workWorker = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/deployment/work_worker.js`).href);
const proofModule = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${PROJECT_ROOT}/dist/src/experiment/index.js`).href);

const policyRef = (policyId) => ({ policyId, version: "v1" });

/** The method's distinctive clause text — the marker that proves the capital was actually delivered. */
const METHOD_MARKERS = ["detect a cycle before ordering", "normalize the graph", "close the witness loop", "lexical order of the ready set"];

/* ---------------------------------------------------------------- fixture */

/**
 * The plain-node acceptance oracle. It re-states the CANONICAL acceptance contract (the eight cases in
 * `test/acceptance.test.ts`) as an exit-code check a sandboxed worker can actually run. It is NOT a
 * second contract: the canonical suite remains the authority, and every R1 trial is judged by running
 * it on the host. This file exists only so the worker can see whether it is done.
 */
const CHECK_JS = `import { planExecution, CycleError } from "../src/dag.ts";

const cases = [];
const check = (name, fn) => { try { fn(); cases.push([name, true, ""]); } catch (error) { cases.push([name, false, error?.message ?? String(error)]); } };
const depends = (nodes, edges, order) => {
  const pos = new Map(order.map((n, i) => [n, i]));
  if (pos.size !== order.length) throw new Error("the order repeats a node");
  for (const n of nodes) if (!pos.has(n)) throw new Error("missing node " + n);
  for (const e of edges) if (!(pos.get(e.from) < pos.get(e.to))) throw new Error("dependency " + e.from + " -> " + e.to + " violated by " + order.join(","));
};

check("acyclic", () => {
  const nodes = ["a", "b", "c", "d"];
  const edges = [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }];
  depends(nodes, edges, planExecution({ nodes, edges }));
});
check("determinism", () => {
  const nodes = ["a", "b", "c", "d", "e"];
  const edges = [{ from: "a", to: "c" }, { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "e" }];
  const first = planExecution({ nodes, edges });
  for (let i = 0; i < 5; i += 1) if (JSON.stringify(planExecution({ nodes, edges })) !== JSON.stringify(first)) throw new Error("not reproducible");
});
check("disconnected", () => {
  const nodes = ["a", "b", "c", "d", "e", "f"];
  const edges = [{ from: "a", to: "b" }, { from: "d", to: "e" }];
  const order = planExecution({ nodes, edges });
  depends(nodes, edges, order);
});
check("tie break is lexical", () => {
  const nodes = ["d", "c", "b", "a"];
  const edges = [{ from: "a", to: "c" }, { from: "b", to: "d" }];
  const got = planExecution({ nodes, edges });
  if (JSON.stringify(got) !== JSON.stringify(["a", "b", "c", "d"])) throw new Error("expected a,b,c,d got " + got.join(","));
});
check("cycle raises CycleError", () => {
  const nodes = ["a", "b", "c"];
  const edges = [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }];
  try { planExecution({ nodes, edges }); } catch (error) {
    if (!(error instanceof CycleError)) throw new Error("a cycle must raise CycleError");
    const d = error.diagnostic;
    if (d.kind !== "CYCLE") throw new Error("diagnostic kind must be CYCLE");
    if ([...d.nodes].sort().join(",") !== "a,b,c") throw new Error("diagnostic must name a,b,c");
    if (!(d.path.length >= 2)) throw new Error("the witness path must contain at least one edge");
    for (const step of d.path) if (!nodes.includes(step)) throw new Error("unknown node " + step);
    return;
  }
  throw new Error("a cycle must raise CycleError");
});
check("cycle witness is normalized", () => {
  const nodes = ["a", "b", "c"];
  const witness = (edges) => { try { planExecution({ nodes, edges }); } catch (error) { if (!(error instanceof CycleError)) throw new Error("not a CycleError"); return error.diagnostic; } throw new Error("expected CycleError"); };
  const left = witness([{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }]);
  const right = witness([{ from: "b", to: "c" }, { from: "c", to: "a" }, { from: "a", to: "b" }]);
  if (JSON.stringify(left.path) !== JSON.stringify(right.path)) throw new Error("the same cycle must yield one canonical witness");
});
check("unknown endpoint rejected", () => {
  try { planExecution({ nodes: ["a", "b"], edges: [{ from: "a", to: "ghost" }] }); } catch (error) { if (/ghost/.test(String(error?.message ?? ""))) return; throw new Error("the error must name the unknown endpoint"); }
  throw new Error("an unknown endpoint must be rejected");
});
check("self loop is a cycle", () => {
  try { planExecution({ nodes: ["a"], edges: [{ from: "a", to: "a" }] }); } catch (error) { if (error instanceof CycleError) return; throw new Error("a self loop must raise CycleError"); }
  throw new Error("a self loop must raise CycleError");
});

const failed = cases.filter(([, ok]) => !ok);
for (const [name, ok, why] of cases) console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " :: " + why));
console.log(cases.length + " cases, " + (cases.length - failed.length) + " pass, " + failed.length + " fail");
process.exit(failed.length === 0 ? 0 : 1);
`;

/** Scenario A's pre-task state: the naive planner (4 PASS / 4 FAIL), read from the committed fixture. */
function setupProject() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(join(PROJECT, "src"), { recursive: true });
  mkdirSync(join(PROJECT, "test"), { recursive: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const FIX = `${PROJECT_ROOT}/scripts/gates/dag-planner`;
  copyFileSync(join(FIX, "package.json"), join(PROJECT, "package.json"));
  cpSync(join(FIX, "test"), join(PROJECT, "test"), { recursive: true });
  copyFileSync(`${PROJECT_ROOT}/scripts/gates/naive-dag.ts`, join(PROJECT, "src", "dag.ts"));
  // A PLAIN-node oracle beside the canonical suite. Node's own `--test` runner spawns test files with
  // piped stdio, which the PTC sandbox denies (measured by the D2/D5 gates); a worker inside the sandbox
  // can run this file directly, so it is the oracle the worker is told to use.
  writeFileSync(join(PROJECT, "test", "check.js"), CHECK_JS);
  execFileSync("git", ["init", "-q"], { cwd: PROJECT });
  execFileSync("git", ["add", "-A"], { cwd: PROJECT });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0 naive"], { cwd: PROJECT });
  return git(PROJECT, ["rev-parse", "HEAD"]);
}

const STANDARD = Object.freeze({
  statement: "the acceptance oracle passes and scope is respected",
  clauses: Object.freeze([
    // The mechanical check must be a command the task's OWN envelope authorizes, or `prepareMutatingWork`
    // refuses before writing anything (a real product guard, measured here rather than assumed).
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "test/check.js"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["r1 probe fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/* ---------------------------------------------------------------- policies */

const proofVerification = () => ({
  policyRef: policyRef("r1-verification"),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 && contradicting.length === 0 ? "SUPPORTED" : "INCONCLUSIVE", supportingEvidenceIds: supporting, contradictingEvidenceIds: contradicting };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef("r1-publication"),
  async decide({ verification }) {
    return { decision: verification.standing === "SUPPORTED" || verification.standing === "PARTIALLY_SUPPORTED" ? "PUBLISH" : "UNRESOLVED", provenanceDigest: verification.provenanceDigest };
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

/** The method under test, as an ordered clause list — the SAME shape E-LIVE's procedure used. */
const METHOD = {
  schemaVersion: 1,
  title: "Detect cycles before ordering",
  purpose: "produce a dependency-preserving order that refuses cyclic input instead of returning a wrong answer",
  applicability: ["any dependency-planning task whose input may contain a cycle"],
  preconditions: ["the graph's nodes and edges are readable"],
  steps: [
    { instruction: "normalize the graph and validate every edge endpoint names a known node" },
    { instruction: "detect a cycle before ordering: if one exists, refuse with a normalized witness path" },
    { instruction: "order only the acyclic remainder, breaking ties by lexical order of the ready set" },
    { instruction: "close the witness loop once, so a rotation of the same cycle yields one canonical witness" },
  ],
  checks: ["a cyclic input raises instead of returning an order", "an unknown endpoint is rejected"],
  expectedOutputs: ["a dependency-preserving order for acyclic input", "a normalized cycle witness for cyclic input"],
  limitations: ["does not attempt to repair a cycle"],
  capabilityHints: [],
  recommendedRecipeRefs: [],
};

function procedureAuthoring() {
  return {
    origin: "r1-probe-deterministic-author",
    async propose() {
      return { outcome: "proposal", content: METHOD };
    },
  };
}
function procedureAdmission() {
  return {
    policyRef: policyRef("r1-admission"),
    async decide({ candidateDigest, validation }) {
      return { decision: "PUBLISH", candidateDigest, rationale: `admitted for the R1 probe (groundsResolved=${validation.groundsResolved})`, policyRef: policyRef("r1-admission") };
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
        read_paths: ["src", "test"],
        // The D5 gate measured that Node's own `--test` runner spawns with piped stdio, which the PTC
        // sandbox denies; a plain-node oracle is what a constrained worker can actually run.
        allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }],
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
  return { installed, proofStore, reasoningStore, assocStore, memoryStore, procedureStore };
}

/* ---------------------------------------------------------------- profile */

function setupHome() {
  rmSync(HOME, { recursive: true, force: true });
  mkdirSync(join(HOME, "profiles", PROFILE), { recursive: true });
  // The host bundle the profile loads must be the CURRENT one, never a stale copy.
  const hostTarget = join(REAL_DSH, "profiles", "node_modules", "palimpsest-dsh-host");
  rmSync(hostTarget, { recursive: true, force: true });
  cpSync(join(PROJECT_ROOT, "host", "dsh"), hostTarget, { recursive: true });
  execFileSync("cmd", ["/c", "mklink", "/J", `${HOME.replace(/\//gu, "\\")}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, "\\")}\\profiles\\node_modules`], { stdio: "ignore" });
  writeFileSync(join(HOME, "settings.yaml"), ["agent-default-model:", "  provider: deepseek-official", "  model: deepseek-flash", "locale:", "  preference: zh", ""].join("\n"));
  copyFileSync(join(REAL_DSH, ".credentials.yaml"), join(HOME, ".credentials.yaml"));
  writeFileSync(
    join(HOME, "profiles", PROFILE, "deployment.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: PROFILE,
        projectId: project,
        localPeer: "r1probe-peer",
        persistentPoint: "pp-r1probe",
        repository: PROJECT,
        transport: { namespace: PROFILE, databasePath: join(STATE, "transport.sqlite") },
        databases: { orchestration: paths.orchestration, ordarium: paths.ordarium, coordination: join(STATE, "coordination.sqlite"), transportCursors: join(STATE, "cursors.sqlite") },
        reasoning: {},
        execution: "worktree",
        concurrency: 1,
        policy: { allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }] },
        standard: { statement: "the acceptance oracle passes" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(HOME, "profiles", PROFILE, "package.json"), `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`);
  writeFileSync(
    join(HOME, "profiles", PROFILE, "cordis.patch.yml"),
    ["- id: palimpsest-tools", "  config:", `    palimpsestEntry: '${PROJECT_ROOT}/dist/src/advanced.js'`, `    deploymentProfile: '${join(HOME, "profiles", PROFILE, "deployment.json")}'`, "    serve: false", "    openDashboard: false", ""].join("\n"),
  );
}

/* ---------------------------------------------------------------- the probe */

async function main() {
  const head = setupProject();
  setupHome();
  out(`repo     ${PROJECT}`);
  out(`head     ${head}`);
  out(`host DSH ${dshVersion()}`);
  out("");

  /* -- Phase 1: durable capital -------------------------------------------------- */
  out("PHASE 1 — durable capital");
  const first = install();
  first.installed.controller.start({
    projectId: project,
    goal: "make the dependency planner satisfy its adopted contract",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "finish the dependency planner so it satisfies the adopted contract, including cyclic input behavior", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] }],
  });

  // Proof: the fact that a cycle must be detected before ordering is attempted.
  const proof = first.installed.proof;
  const imported = await proof.importSource({ bytes: new TextEncoder().encode("A cyclic dependency graph admits no dependency-preserving order, so any planner must detect the cycle before it attempts to order the graph."), mediaType: "text/plain", label: "cycle-precedence", provenance: "LOCAL_IMPORT", sourceId: "cycle-precedence" });
  const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: "cycle-precedence", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: "a cycle must be detected before the graph is ordered" }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  const proofClaimId = published.claimId;
  out(`  proof claim       ${proofClaimId}`);

  // Reasoning: the claim that ordering a cyclic graph is the wrong first move.
  const reasoning = first.installed.reasoningCells;
  await reasoning.service.openCell({ cellId: "cell-cycle", objective: "how should a dependency planner treat cyclic input", verificationPolicyRef: policyRef("r1-rv"), admissionPolicyRef: policyRef("r1-ra") });
  const branch = await reasoning.service.openBranch({ cellId: "cell-cycle", question: "must a cycle be detected before ordering?" });
  const submitted = await reasoning.service.submitCandidate({ cellId: "cell-cycle", branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: "detect the cycle first, then order the remainder" } });
  await reasoning.service.evaluateCandidate({ cellId: "cell-cycle", candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await reasoning.service.frontier({ cellId: "cell-cycle" });
  const reasoningClaimId = frontier.claims[0]?.ref.claimId;
  out(`  reasoning claim   cell-cycle/${reasoningClaimId}`);

  // Procedure: grounded in a real recorded experiment, admitted by an independent authority.
  const scenario = memoryModule.materializeScenario({ scenarioId: "s1", scenarioRevision: 0, kind: "S1_LOW_COUPLING", classification: "SCRIPTED_MECHANICAL", task: "order a graph that contains a cycle", successCriteria: ["cyclic input is refused rather than mis-ordered"], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variant = memoryModule.materializeVariant({ variantId: "v1", kind: "SINGLE_LOCUS", description: "detect-then-order" });
  const experiment = memoryModule.materializeExperiment({ experimentId: "exp-r1", revision: 0, objective: "does detecting the cycle before ordering avoid a wrong answer?", scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }], variantRefs: [{ variantId: variant.variantId, digest: variant.digest }], measurementPlan: { metricIds: ["quality"], primaryValidatorRef: "validator-1", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await first.installed.organizationMemory.recordExperiment(experiment);
  await first.installed.organizationMemory.recordScenario(experiment.experimentId, scenario);
  await first.installed.organizationMemory.recordVariant(experiment.experimentId, variant);
  const run = experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "r1-probe", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: { outcome: "PASS", failureClassification: "NONE", measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "r1-probe" })], validatorResults: [] },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  });
  await first.installed.organizationMemory.recordRun(experiment.experimentId, run);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenario], variants: [variant], runs: [run], corrections: [], annotations: [] });
  await first.installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);
  const prepared = await first.installed.procedures.prepare({ grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: evaluation.evaluationRef }], projectContext: { projectId: project, projectRevision: 1, projectDigest: "4".repeat(64), objective: "finish the planner" } });
  const pub = await first.installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  if (pub.status !== "published") throw new Error(`procedure publish answered ${pub.status}`);
  out(`  procedure         ${pub.ref.procedureId}@${pub.ref.revision}`);

  // Associate all three: association is the eligibility precondition.
  const workspace = first.installed.projectWorkspace;
  await workspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: proofClaimId }, associationKind: "MANUAL", provenance: "r1-probe" });
  await workspace.associateAsset({ projectId: project, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: "cell-cycle" }, associationKind: "MANUAL", provenance: "r1-probe" });
  // §"HistoricalProcedure != CurrentProcedure": a PROCEDURE association names the EXACT revision —
  // both in the digest it must carry and in the association id `<procedureId>@<revision>` the
  // eligibility read matches on. An association of P@1 must not admit P@2.
  await workspace.associateAsset({ projectId: project, assetKind: "PROCEDURE", canonicalRef: { kind: "PROCEDURE", id: `${pub.ref.procedureId}@${pub.ref.revision}`, digest: pub.revision.digest }, associationKind: "MANUAL", provenance: "r1-probe" });
  out("  associated        PROOF_CLAIM + REASONING_CELL + PROCEDURE");

  await first.installed.dispose();
  first.procedureStore.close();
  out("  first install disposed (capital is now durable only)");

  /* -- Phase 2: cold restart, real stochastic worker ---------------------------- */
  out("\nPHASE 2 — real stochastic DSH worker, C2-style selection");
  const transcript = join(OUT, `worker-transcript-${CONDITION}.txt`);
  process.env.DSH_HOME = HOME;
  process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
  // The tee wrapper tees the real DSH process's stdout+stderr, which carries the host's own
  // `PALIMPSEST_WORKER_ENV` line (the tools the model was ACTUALLY offered). This is the same
  // observational channel the D2/D5 gates use; it captures no private reasoning.
  process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

  const second = install();
  const controller = second.installed.controller;
  const payloadSink = join(OUT, `worker-payload-${CONDITION}.json`);

  const service = delegation.makeWorkDelegationService({
    controller,
    workerFor: () => {
      const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: WORKER_TIMEOUT_MS });
      return {
        adapterId: port.adapterId,
        async run(input) {
          // Capture the EXACT payload the worker process is launched with.
          writeFileSync(payloadSink, JSON.stringify(workWorker.workWorkerEnvironmentPayload(input.context), null, 2), "utf8");
          return await port.run(input);
        },
      };
    },
  });

  const selection = selectionFor({ proofClaimId, reasoningClaimId, procedureId: pub.ref.procedureId, procedureRevision: pub.ref.revision });
  out(`  condition         ${CONDITION} (knowledge selection: ${selection === undefined ? "OMITTED" : Object.keys(selection).join("+")})`);
  const started = await service.start(selection === undefined ? { expectedTaskId: "t1" } : { expectedTaskId: "t1", knowledge: selection });
  out(`  job started       ${started.jobId} (task ${started.taskId})`);

  let view = await service.followup({ jobId: started.jobId });
  for (let i = 0; i < 18_000 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: started.jobId });
  }
  out(`  job phase         ${view.phase}${view.hostError === undefined ? "" : ` hostError=${view.hostError}`}`);
  // The JOB phase and the WORKER outcome are different facts, and reporting only the first would hide a
  // worker that did the work without reporting it (§16: a worker is not "clean" merely because code
  // landed). The worker's own line is read back from the transcript.
  const workerOutcomeLine = existsSync(transcript)
    ? (readFileSync(transcript, "utf8").split(/\r?\n/u).filter((line) => line.startsWith("PALIMPSEST_WORK_RESULT")).pop() ?? "")
    : "";
  const workerKind = /"kind":"([A-Z_]+)"/u.exec(workerOutcomeLine)?.[1] ?? "UNKNOWN";
  out(`  worker outcome    ${workerKind}`);

  /* -- Phase 3: what did the worker actually receive? ---------------------------- */
  out("\nPHASE 3 — what the worker process was handed");
  if (existsSync(payloadSink)) {
    const payload = JSON.parse(readFileSync(payloadSink, "utf8"));
    const compiled = payload.context?.compiled ?? {};
    out(`  payload.context keys       ${Object.keys(payload.context ?? {}).join(", ")}`);
    out(`  compiled keys              ${Object.keys(compiled).join(", ")}`);
    out(`  compiled.handles           ${JSON.stringify((compiled.handles ?? []).map((entry) => `${entry.kind}:${entry.handle}`))}`);
    out(`  compiled.boot kinds        ${JSON.stringify((compiled.boot ?? []).map((entry) => entry.kind))}`);
    const text = JSON.stringify(payload);
    out(`  payload carries ANY body?  ${/detect(?:s|ed)? (?:the )?cycle before|normalize the graph/i.test(text) ? "YES (capital text present)" : "NO (literal instruction text for the method)"}`);
    out(`  payload carries handles?   ${/@ctx\/(proof|reasoning|procedure)\//u.test(text) ? "YES" : "NO"}`);
    const found = METHOD_MARKERS.filter((marker) => text.includes(marker));
    out(`  method clause text in payload: ${found.length === 0 ? "NONE" : found.join(" | ")}`);
    // THE DECISIVE PROJECTION: what the host's `workTask()` actually renders into the model's prompt.
    // `work` is rendered field-by-field; from `compiled` ONLY `continuation` is rendered.
    // The LITERAL model-visible prompt, reconstructed by the host's own `workTask()` rule: every
    // `work.*` field, plus `compiled.continuation` when present. `compiled.boot` and
    // `compiled.handles` are NOT rendered. Hashing THIS is the airtight statement of what the model saw.
    const w = payload.context.work;
    const listed = (v) => (Array.isArray(v) && v.length > 0 ? v.map((x) => `  - ${x}`).join("\n") : "  (none)");
    const promptText = [
      "You are a Palimpsest WORK WORKER: a capable engineering agent running inside ONE isolated execution world prepared for one canonical Work task.",
      "You are NOT the principal: you cannot settle, verify, promote or plan anything, and no canonical fact changes because you say so.",
      "",
      `Project goal: ${w.projectGoal}`,
      `Requirements:\n${listed(w.requirements)}`,
      `Decisions in force:\n${listed(w.decisions)}`,
      "",
      `Your task: ${w.objective}`,
      `Write scope (changes outside it are refused when the product observes the tree):\n${listed(w.writeScope)}`,
      `Required artifacts:\n${listed(w.requiredArtifacts)}`,
      `Base commit: ${w.baseCommit}`,
      `What completion will require:\n${listed(w.completionChecks)}`,
      `Independent verification required: ${w.independentVerificationRequired === true ? "yes" : "no"}`,
    ].join("\n");
    const promptDigest = createHash("sha256").update(promptText).digest("hex");
    /**
     * A SECOND digest with the base commit masked. `baseCommit` is a per-run fixture value (the hash of
     * the H0 commit the probe just created), not a condition variable, so the literal digest can differ
     * between two runs of the SAME condition purely because the fixture was rebuilt a second later.
     * The masked digest is what makes a cross-condition comparison valid.
     */
    const promptDigestMasked = createHash("sha256").update(promptText.replace(/^Base commit: .*$/mu, "Base commit: <masked>")).digest("hex");
    writeFileSync(join(OUT, `rendered-prompt-${CONDITION}.json`), JSON.stringify({
      condition: CONDITION,
      promptText,
      promptDigest,
      promptDigestMasked,
      handlesInPayload: (payload.context.compiled?.handles ?? []).map((e) => `${e.kind}:${e.handle}`),
      handlesRenderedIntoPrompt: false,
      bootRenderedIntoPrompt: false,
      capitalBodyBytesInPrompt: METHOD_MARKERS.filter((m) => promptText.includes(m)).length,
    }, null, 2), "utf8");
    out(`  MODEL-VISIBLE PROMPT digest: ${promptDigest.slice(0, 32)} (base-masked ${promptDigestMasked.slice(0, 32)})`);
    out(`  handles in payload: ${(payload.context.compiled?.handles ?? []).length} | rendered into prompt: 0`);
  } else {
    out("  payload unavailable");
  }

  const world = view.attemptId === undefined ? null : (() => { try { return controller.observeAttemptResult(view.attemptId); } catch { return null; } })();
  if (world !== null && world !== undefined) {
    out(`  world             ${world.workDir.replace(PROJECT, "<repo>")}`);
    const committed = git(world.workDir, ["show", "HEAD:src/dag.ts"]);
    const markers = METHOD_MARKERS.filter((marker) => committed.includes(marker));
    out(`  committed src/dag.ts method markers: ${markers.length === 0 ? "NONE" : markers.join(" | ")}`);
    out(`  committed src/dag.ts bytes: ${Buffer.byteLength(committed, "utf8")}`);
    const probeDir = join(OUT, "oracle");
    rmSync(probeDir, { recursive: true, force: true });
    cpSync(PROJECT, probeDir, { recursive: true });
    writeFileSync(join(probeDir, "src", "dag.ts"), committed);
    try {
      const result = execFileSync("node", ["test/check.js"], { cwd: probeDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      out(`  worker output vs oracle: ${result.trim().split(/\r?\n/u).pop()}`);
    } catch (error) {
      const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      out(`  worker output vs oracle: ${text.trim().split(/\r?\n/u).pop()}`);
    }
  }

  if (existsSync(transcript)) {
    const t = readFileSync(transcript, "utf8");
    out("\nPHASE 4 — the real worker's own recorded environment / prompt");
    for (const line of t.split(/\r?\n/u)) {
      if (line.startsWith("PALIMPSEST_WORKER_ENV")) out(`  ${line.slice(0, 400)}`);
      if (line.startsWith("PALIMPSEST_WORK_RESULT")) out(`  ${line.slice(0, 700)}`);
    }
    const capitalSeen = METHOD_MARKERS.filter((marker) => t.includes(marker));
    out(`  method text EVER visible to the worker process: ${capitalSeen.length === 0 ? "NO" : `YES -> ${capitalSeen.join(" | ")}`}`);
  } else {
    out("\nPHASE 4 — no transcript (the tee worker was not reached)");
  }

  out(`\nPROBE COMPLETE — artifacts under ${OUT}`);
  await second.installed.dispose().catch(() => undefined);
  second.procedureStore.close();
}

await main();
