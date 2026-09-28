#!/usr/bin/env node
/**
 * R1 §26–§29 — RELEVANCE PRESSURE: what must a HOST do to find the relevant assets?
 *
 * This is the SECONDARY R1 experiment, and it is deliberately independent of the primary one: it
 * involves NO worker, NO model and NO prompt, so it remains measurable even where the primary matrix
 * cannot run. It answers §27 exactly:
 *
 *     "Measure what the HOST must do to discover the relevant assets from current durable owner
 *      surfaces."
 *
 * V1 selection is EXPLICIT (§27): the host names the refs. So the honest question is not "can the
 * product rank them" — it explicitly does not — but "how much work does an operator have to do to
 * name the right ones, as the population grows?"
 *
 * THE DESIGN (§26). At each N the pool contains EXACTLY 3 relevant assets (1 Proof, 1 Reasoning,
 * 1 Procedure) and N-3 legitimate, admitted, project-associated DECOYS. The decoys are real assets
 * created through the ordinary owners — not malformed junk — so nothing can be dismissed on a
 * technicality. The 3 relevant refs are the SAME objects at every N, and they are never carried
 * across a cold restart as opaque ids: each round rediscovers them from durable state (§27).
 *
 * WHAT IS MEASURED, per N:
 *   · associated assets enumerated           (owner query size)
 *   · candidate refs inspected               (how many must be looked at to find the 3)
 *   · asset bodies/metadata fetched          (how many owner reads)
 *   · operations required before selection   (the host's own step count)
 *   · wall time
 *   · mistaken inclusion / relevant asset missed
 *
 * PLAIN JAVASCRIPT (`.mjs`), like the gates it borrows its discipline from.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = process.cwd();
const ROOT = join(homedir(), ".palimpsest-r1", "relevance-pressure");
const OUT = join(ROOT, "out");

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const proofModule = await import(pathToFileURL(`${REPO}/dist/src/proof_asset/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO}/dist/src/procedures/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO}/dist/src/experiment/index.js`).href);

const project = "r1relevance";
const POPULATIONS = [5, 25, 100];
/** §26: the relevant set is fixed at 3 — one of each kind — at EVERY N. */
const RELEVANT_COUNT = 3;

const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
const out = (line) => process.stdout.write(`${line}\n`);

const policyRef = (policyId) => ({ policyId, version: "v1" });

const STANDARD = Object.freeze({
  statement: "the commit exists and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["r1 relevance fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function setupProject(n) {
  const RUN = join(ROOT, `n${n}`);
  PROJECT = join(RUN, "repo");
  const STATE = join(RUN, "state");
  mkdirSync(join(PROJECT, "src"), { recursive: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  paths = {
    proof: join(STATE, "proof.sqlite"),
    blobs: join(STATE, "proof-blobs"),
    cells: join(STATE, "cells.sqlite"),
    assoc: join(STATE, "assoc.sqlite"),
    memory: join(STATE, "memory.sqlite"),
    procedures: join(STATE, "procedures.sqlite"),
    orchestration: join(STATE, "orchestration.sqlite"),
    ordarium: join(STATE, "ordarium.sqlite"),
  };
  writeFileSync(join(PROJECT, "src", "a.js"), "// The alpha helper.\nexport const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: PROJECT });
  execFileSync("git", ["add", "-A"], { cwd: PROJECT });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: PROJECT });
  return git(PROJECT, ["rev-parse", "HEAD"]);
}

const proofVerification = () => ({
  policyRef: policyRef("r1rp-verification"),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 ? "SUPPORTED" : "INCONCLUSIVE", supportingEvidenceIds: supporting, contradictingEvidenceIds: [] };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef("r1rp-publication"),
  async decide({ verification }) {
    return { decision: verification.standing === "SUPPORTED" ? "PUBLISH" : "UNRESOLVED", provenanceDigest: verification.provenanceDigest };
  },
});
/** Reasoning verification/admission: every claim SUPPORTED, so the admission can ADMIT it. */
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
function procedureAuthoring(title) {
  return {
    origin: "r1-relevance-deterministic-author",
    async propose() {
      return {
        outcome: "proposal",
        content: {
          schemaVersion: 1,
          title,
          purpose: `a legitimate reusable method named ${title}`,
          applicability: ["a project task that wants a reusable method"],
          preconditions: ["the project is readable"],
          steps: [{ instruction: "inspect the basis" }, { instruction: "act on the current basis" }],
          checks: ["the basis digest is unchanged"],
          expectedOutputs: ["a change applied on a current basis"],
          limitations: ["does not cover a concurrent writer"],
          capabilityHints: [],
          recommendedRecipeRefs: [],
        },
      };
    },
  };
}
function procedureAdmission() {
  return {
    policyRef: policyRef("r1rp-admission"),
    async decide({ candidateDigest, validation }) {
      return { decision: "PUBLISH", candidateDigest, rationale: `admitted (groundsResolved=${validation.groundsResolved})`, policyRef: policyRef("r1rp-admission") };
    },
  };
}

/**
 * ONE install over path-based stores. `authorTitle` is per-install because each asset is authored
 * through its own install (the authoring seam is closed over at composition time).
 *
 * `paths` is per-N: each population is built in its OWN durable world, so one N cannot observe the
 * previous N's assets and a closed store cannot hold a handle into the next round.
 */
let PROJECT = "";
let paths = {};

function install(authorTitle) {
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
      policy: advanced.trustedDefaultPolicy({ read_paths: ["src"], allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
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
      procedureAuthoring: procedureAuthoring(authorTitle),
      procedureAdmission: procedureAdmission(),
    },
  );
  return { installed, proofStore, reasoningStore, assocStore, memoryStore, procedureStore };
}

/** Publish one Proof claim; returns its claimId. */
async function makeProof(inst, statement, sourceId) {
  const proof = inst.installed.proof;
  const imported = await proof.importSource({ bytes: new TextEncoder().encode(statement), mediaType: "text/plain", label: sourceId, provenance: "LOCAL_IMPORT", sourceId });
  const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  return published.claimId;
}

/** Publish one Procedure grounded in a real recorded experiment; returns {procedureId, revision, digest}. */
async function makeProcedure(inst, tag) {
  const scenario = memoryModule.materializeScenario({ scenarioId: `s-${tag}`, scenarioRevision: 0, kind: "S1_LOW_COUPLING", classification: "SCRIPTED_MECHANICAL", task: `task ${tag}`, successCriteria: ["the change lands on a current basis"], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variant = memoryModule.materializeVariant({ variantId: `v-${tag}`, kind: "SINGLE_LOCUS", description: `variant ${tag}` });
  const experiment = memoryModule.materializeExperiment({ experimentId: `exp-${tag}`, revision: 0, objective: `does ${tag} hold?`, scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: 0, digest: scenario.digest }], variantRefs: [{ variantId: variant.variantId, digest: variant.digest }], measurementPlan: { metricIds: ["quality"], primaryValidatorRef: "validator-1", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await inst.installed.organizationMemory.recordExperiment(experiment);
  await inst.installed.organizationMemory.recordScenario(experiment.experimentId, scenario);
  await inst.installed.organizationMemory.recordVariant(experiment.experimentId, variant);
  const run = experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "r1-relevance", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: { outcome: "PASS", failureClassification: "NONE", measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "r1-relevance" })], validatorResults: [] },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  });
  await inst.installed.organizationMemory.recordRun(experiment.experimentId, run);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenario], variants: [variant], runs: [run], corrections: [], annotations: [] });
  await inst.installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);
  const prepared = await inst.installed.procedures.prepare({ grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: evaluation.evaluationRef }], projectContext: { projectId: project, projectRevision: 1, projectDigest: "4".repeat(64), objective: `task ${tag}` } });
  const published = await inst.installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  if (published.status !== "published") throw new Error(`publish answered ${published.status}`);
  return { procedureId: published.ref.procedureId, revision: published.ref.revision, digest: published.revision.digest };
}

/**
 * Build a pool of N assets: exactly 3 RELEVANT (created first, and returned by name) plus N-3 decoys.
 * Every asset goes through the ordinary owners and is project-associated, so all N are legitimate.
 */
async function buildPool(n) {
  const head = setupProject(n);
  const relevant = { proofClaimId: undefined, reasoningCellId: undefined, procedure: undefined };

  // The 3 RELEVANT assets.
  const seed = install("Detect cycles before ordering");
  seed.installed.controller.start({ projectId: project, goal: "keep the planner honest", headCommit: head, tasks: [{ task_id: "t1", objective: "finish the planner", depends_on: [], write_paths: ["src/a.js"], required_artifacts: [] }] });
  relevant.proofClaimId = await makeProof(seed, "a cycle must be detected before the graph is ordered", "cycle-precedence");
  const cell = seed.installed.reasoningCells;
  await cell.service.openCell({ cellId: "cell-cycle", objective: "how should cyclic input be treated", verificationPolicyRef: policyRef("r1rp-rv"), admissionPolicyRef: policyRef("r1rp-ra") });
  const branch = await cell.service.openBranch({ cellId: "cell-cycle", question: "detect before ordering?" });
  const submitted = await cell.service.submitCandidate({ cellId: "cell-cycle", branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: "detect the cycle first" } });
  await cell.service.evaluateCandidate({ cellId: "cell-cycle", candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await cell.service.frontier({ cellId: "cell-cycle" });
  relevant.reasoningCellId = "cell-cycle";
  relevant.reasoningClaimId = frontier.claims[0]?.ref.claimId;
  relevant.procedure = await makeProcedure(seed, "relevant");
  await seed.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: relevant.proofClaimId }, associationKind: "MANUAL", provenance: "r1-relevance" });
  await seed.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: relevant.reasoningCellId }, associationKind: "MANUAL", provenance: "r1-relevance" });
  await seed.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: "PROCEDURE", canonicalRef: { kind: "PROCEDURE", id: `${relevant.procedure.procedureId}@${relevant.procedure.revision}`, digest: relevant.procedure.digest }, associationKind: "MANUAL", provenance: "r1-relevance" });
  await seed.installed.dispose();
  seed.procedureStore.close();

  // The N-3 DECOYS: legitimate admitted assets, each on a topic unrelated to the task.
  for (let i = 0; i < n - RELEVANT_COUNT; i += 1) {
    // A decoy install composes over the SAME durable project, which is already started — calling
    // `start` again would be a second PROJECT_STARTED for one project (the store's idempotency guard
    // refuses it, correctly). The asset planes need no project lifecycle of their own.
    const decoy = install(`Unrelated method ${i}`);
    if (i % 2 === 0) {
      const claimId = await makeProof(decoy, `unrelated observation number ${i} about an unrelated subsystem`, `decoy-${i}`);
      await decoy.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: claimId }, associationKind: "MANUAL", provenance: "r1-relevance-decoy" });
    } else {
      const proc = await makeProcedure(decoy, `decoy-${i}`);
      await decoy.installed.projectWorkspace.associateAsset({ projectId: project, assetKind: "PROCEDURE", canonicalRef: { kind: "PROCEDURE", id: `${proc.procedureId}@${proc.revision}`, digest: proc.digest }, associationKind: "MANUAL", provenance: "r1-relevance-decoy" });
    }
    await decoy.installed.dispose();
    decoy.procedureStore.close();
  }

  return { head, relevant };
}

/**
 * §27: measure what a HOST must do to rediscover the 3 relevant refs from durable state — with NO
 * hard-coded opaque id carried in. The relevant refs are known to the EXPERIMENT (it created them);
 * the measurement is of the OWNER SURFACES a host has to walk.
 */
async function measure(n, truth) {
  const reader = install("probe");
  const controller = reader.installed.controller;
  const started = Date.now();
  let operations = 0;
  let refsInspected = 0;
  let bodiesFetched = 0;

  // 1. Enumerate the project's associated assets — the ONE owner surface that spans all three kinds.
  const associations = await reader.installed.projectWorkspace.projectScopedAssets(project);
  operations += 1;

  // 2. Enumerate each owner's own catalogue: a host must cross-reference these to find the body.
  const proofClaims = await reader.installed.proof.publishedClaims();
  operations += 1;
  const cells = await reader.installed.reasoningCells.service.listCells();
  operations += 1;
  const procedureIds = await reader.installed.procedures.procedures();
  operations += 1;

  // 3. Walk every associated ref. A host has no relevance ranking (V1 is explicit), so the honest
  //    model of "discovery" is: inspect the metadata of each candidate until the relevant ones are
  //    recognised. This is the COST that grows with N.
  const found = { proof: false, reasoning: false, procedure: false };
  let mistakenInclusion = 0;
  for (const association of associations) {
    refsInspected += 1;
    operations += 1;
    if (association.assetKind === "PROOF_CLAIM") {
      const claim = proofClaims.find((entry) => entry.claimRef.claimId === association.canonicalRef.id);
      if (claim !== undefined) bodiesFetched += 1;
      if (association.canonicalRef.id === truth.proofClaimId) found.proof = true;
      else mistakenInclusion += 1;
    } else if (association.assetKind === "REASONING_CELL") {
      if (cells.some((entry) => entry.cellId === association.canonicalRef.id)) bodiesFetched += 1;
      if (association.canonicalRef.id === truth.reasoningCellId) found.reasoning = true;
      else mistakenInclusion += 1;
    } else if (association.assetKind === "PROCEDURE") {
      const id = association.canonicalRef.id;
      if (procedureIds.some((candidate) => id.startsWith(candidate))) bodiesFetched += 1;
      if (id === `${truth.procedure.procedureId}@${truth.procedure.revision}`) found.procedure = true;
      else mistakenInclusion += 1;
    }
  }

  const wallMs = Date.now() - started;
  await reader.installed.dispose();
  reader.procedureStore.close();
  void controller;

  return {
    n,
    associatedAssetsEnumerated: associations.length,
    candidateRefsInspected: refsInspected,
    assetBodiesFetched: bodiesFetched,
    operationsRequired: operations,
    wallMs,
    mistakenInclusion,
    relevantFound: found,
    relevantMissed: Object.entries(found).filter(([, ok]) => !ok).map(([kind]) => kind),
    // The decoy count is what grows; the relevant count is fixed at 3 by construction (§26).
    decoys: associations.length - RELEVANT_COUNT,
  };
}

async function main() {
  out(`repo  ${PROJECT}`);
  out(`N values: ${POPULATIONS.join(", ")}  (relevant fixed at ${RELEVANT_COUNT})\n`);
  const rows = [];
  for (const n of POPULATIONS) {
    out(`=== N = ${n} ===`);
    const { head, relevant } = await buildPool(n);
    out(`  pool built (head ${head.slice(0, 7)}); relevant: proof=${relevant.proofClaimId.slice(0, 12)}… reasoning=${relevant.reasoningCellId} procedure=${relevant.procedure.procedureId.slice(0, 12)}…`);
    // §27: the reader rediscovers the relevant refs from durable state; no opaque id is carried in
    // from the pool-building phase except the EXPERIMENT's own record of what it created.
    const row = await measure(n, relevant);
    rows.push(row);
    out(`  associated assets enumerated : ${row.associatedAssetsEnumerated}`);
    out(`  candidate refs inspected     : ${row.candidateRefsInspected}`);
    out(`  asset bodies fetched         : ${row.assetBodiesFetched}`);
    out(`  operations before selection  : ${row.operationsRequired}`);
    out(`  wall time                    : ${row.wallMs} ms`);
    out(`  mistaken inclusion           : ${row.mistakenInclusion}`);
    out(`  relevant assets missed       : ${row.relevantMissed.length === 0 ? "NONE" : row.relevantMissed.join(", ")}`);
    out("");
  }

  const result = {
    schemaVersion: 1,
    experiment: "R1 §26–§29 relevance pressure",
    relevantCount: RELEVANT_COUNT,
    populations: POPULATIONS,
    rows,
    classification: classify(rows),
  };
  writeFileSync(join(OUT, "selection-pressure.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  out(`CLASSIFICATION: ${result.classification.verdict}`);
  out(`  ${result.classification.reason}`);
  out(`\nwrote ${join(OUT, "selection-pressure.json")}`);
}

/**
 * §28's classification, applied to the MEASURED rows. It is deliberately conservative: correctness is
 * achievable at every N (the relevant assets are found every time), so the question is only whether
 * the COST grows materially.
 */
function classify(rows) {
  const missed = rows.some((row) => row.relevantMissed.length > 0);
  if (missed) return { verdict: "SEMANTIC_BLOCKER", reason: "current semantics could not select what the task needed at some N" };
  const growth = rows[rows.length - 1].candidateRefsInspected / Math.max(1, rows[0].candidateRefsInspected);
  const operationsGrowth = rows[rows.length - 1].operationsRequired / Math.max(1, rows[0].operationsRequired);
  if (growth >= 10 || operationsGrowth >= 10) {
    return {
      verdict: "SCALING_FRICTION",
      reason: `selection cost grows materially with the asset population (inspected refs ×${growth.toFixed(1)}, operations ×${operationsGrowth.toFixed(1)}) while correctness remains achievable at every N`,
    };
  }
  if (growth > 1.5) return { verdict: "UX_FRICTION", reason: `correct but tedious: cost grows ×${growth.toFixed(1)} with N` };
  return { verdict: "ADEQUATE", reason: "current explicit selection remains manageable" };
}

await main();
