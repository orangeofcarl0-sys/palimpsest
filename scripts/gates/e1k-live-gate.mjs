#!/usr/bin/env node
/**
 * §E1-K-LIVE — GOVERNED KNOWLEDGE REUSE, end to end, on a REAL PACKAGED INSTALL.
 *
 * NOT a product component: this is acceptance evidence, kept in Git so the gate can be re-run.
 *
 * The claim under test is the one G-5 exists for:
 *
 *     durable project knowledge  →  explicit selection  →  canonical revalidation
 *       →  historical ContextManifest binding  →  boot pull-index  →  a NEW session/worker
 *       →  pull the canonical owner body
 *
 * and it must hold while preserving:
 *
 *     Knowledge ≠ Work truth   Knowledge ≠ Evidence   Knowledge ≠ Authority
 *     Historical standing ≠ Current standing   Project asset ≠ Context
 *
 * WHAT MAKES THIS A REAL GATE (not a unit test with extra steps):
 *
 *   · the composition is the PACKAGED `installPalimpsest` — the same one a host launches;
 *   · the knowledge owners are the REAL Proof / Reasoning / ProjectWorkspace services, wired
 *     through the real `src/composition/context_knowledge.ts` adapter;
 *   · Phase 2 DISPOSES the first installation and composes a SECOND one over the same durable
 *     stores, with no shared in-memory state — a genuine session replacement;
 *   · the selection travels the STANDARD execution path (`makeWorkDelegationService.start`), which
 *     is prepare → `workWorkerAttemptContext` → worker.run → settle. There is no side-channel
 *     compile between preparation and delivery.
 *
 * The worker is a DETERMINISTIC host fixture (§31: "prefer deterministic host fixtures over an
 * unnecessary stochastic LLM call"). It edits, commits, and RECORDS the context it received, so
 * "the worker was handed the handle" is an observed fact rather than an inference.
 *
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { gateRepoRoot, gateRoot } from "./env.mjs";

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/e1k-live`;
const PROJECT = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;

/**
 * The modules are imported ONCE at module scope, because the policy factories below close over their
 * digest helpers and are defined before `main()` runs.
 */
const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);
const proofModule = await import(pathToFileURL(`${REPO}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const { reasoningVerificationDigestOf, invalidationVerificationDigestOf, reasoningAdmissionDigestOf, invalidationAdmissionDigestOf } = reasoningModule;

const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
const project = "e1klive";

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

/* ------------------------------------------------------------------ fixture */

function setupProject() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(join(PROJECT, "src"), { recursive: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(PROJECT, "src", "a.js"), "// The alpha helper.\nexport const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: PROJECT });
  execFileSync("git", ["add", "-A"], { cwd: PROJECT });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: PROJECT });
  return git(PROJECT, ["rev-parse", "HEAD"]);
}

/* ------------------------------------------------------------------ policies */

const policyRef = (policyId) => ({ policyId, version: "v1" });

/**
 * A MUTABLE proof-verification script, so Phase 4 can move the owner's standing AFTER a compile
 * without reinstalling. Every install's Proof service closes over this same object.
 */
const proofScript = { forced: undefined };

/** Proof verification: the scripted standing when set, else SUPPORTED for supported evidence. */
function proofVerification() {
  return {
    policyRef: policyRef("e1k-verification"),
    async verify({ candidate }) {
      const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
      const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
      return {
        standing: proofScript.forced ?? (supporting.length > 0 && contradicting.length === 0 ? "SUPPORTED" : "INCONCLUSIVE"),
        supportingEvidenceIds: supporting,
        contradictingEvidenceIds: contradicting,
      };
    },
  };
}

/** Publication admission: publish a SUPPORTED/PARTIALLY_SUPPORTED claim. */
function proofAdmission() {
  return {
    policyRef: policyRef("e1k-publication"),
    async decide({ verification }) {
      return {
        decision: verification.standing === "SUPPORTED" || verification.standing === "PARTIALLY_SUPPORTED" ? "PUBLISH" : "UNRESOLVED",
        provenanceDigest: verification.provenanceDigest,
      };
    },
  };
}

/** Reasoning verification: everything SUPPORTED, so the admission below can ADMIT it. */
function reasoningVerification() {
  return {
    async verify({ definition, candidate, frontierBasis }) {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED",
        supportingEvidenceIds: ["ev-1"],
        contradictingEvidenceIds: [],
        provenanceDigest: "a".repeat(64),
      };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    async verifyInvalidation({ definition, request, frontierBasis }) {
      const base = {
        schemaVersion: 1,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED",
        evidenceIds: ["ev-9"],
        provenanceDigest: "b".repeat(64),
      };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
}

function reasoningAdmission() {
  return {
    async admit({ definition, candidate, verification, frontierBasis }) {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "ADMIT",
        provenanceDigest: "c".repeat(64),
      };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    async admitInvalidation({ definition, request, verification, frontierBasis }) {
      const base = {
        schemaVersion: 1,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "INVALIDATE",
        provenanceDigest: "d".repeat(64),
      };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
}

const STANDARD = Object.freeze({
  statement: "the commit exists and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["e1k-live fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/* ------------------------------------------------------------------ the run */

async function main() {
  const head = setupProject();
  process.stdout.write(`repo     ${PROJECT}\nhead     ${head}\nout      ${OUT}\n\n`);

  const proofPath = `${STATE}/proof.sqlite`;
  const cellPath = `${STATE}/cells.sqlite`;
  const assocPath = `${STATE}/assoc.sqlite`;
  const blobRoot = `${STATE}/proof-blobs`;
  const orchestrationPath = `${STATE}/orchestration.sqlite`;
  const ordariumPath = `${STATE}/ordarium.sqlite`;

  /** The store instances are PATH-BASED, so a new install over the same paths reads the same state. */
  const makeStores = () => ({
    proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(proofPath),
    proofBlobStore: proofModule.localProofBlobStore(blobRoot),
    reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(cellPath),
    projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(assocPath),
  });

  const installOptions = (stores, extra) => ({
    projectId: project,
    databasePath: orchestrationPath,
    ordariumDatabasePath: ordariumPath,
    repository: PROJECT,
    execution: "worktree",
    standard: STANDARD,
    policy: advanced.trustedDefaultPolicy({
      read_paths: ["src"],
      allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
    }),
    proofEvidenceStore: stores.proofEvidenceStore,
    proofBlobStore: stores.proofBlobStore,
    proofVerificationPolicy: proofVerification(),
    proofPublicationAdmission: proofAdmission(),
    reasoningCellStore: stores.reasoningCellStore,
    reasoningCellStoreOwned: false,
    reasoningVerificationPolicy: reasoningVerification(),
    reasoningAdmissionPolicy: reasoningAdmission(),
    projectAssociationStore: stores.projectAssociationStore,
    ...extra,
  });

  /* ---------------------------------------------------------------- Phase 1 */

  process.stdout.write("PHASE 1 — create durable project knowledge\n");
  const first = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, installOptions(makeStores(), {}));
  const firstController = first.controller;
  firstController.start({
    projectId: project,
    goal: "keep the alpha helper honest",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "record the alpha constant", depends_on: [], write_paths: ["src/a.js"], required_artifacts: [] }],
  });

  // A Proof claim: import a source, select evidence, prepare a candidate, verify, publish.
  const proof = first.proof;
  if (proof === undefined) throw new Error("the packaged install composed no Proof plane");
  const imported = await proof.importSource({
    bytes: new TextEncoder().encode("alpha is one"),
    mediaType: "text/plain",
    label: "alpha-source",
    provenance: "LOCAL_IMPORT",
    sourceId: "alpha",
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: "alpha", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: "the alpha helper exports the constant one" },
    supportingEvidenceIds: [evidence.evidenceId],
    origin: "MANUAL",
  });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  const proofClaimId = published.claimId;
  if (proofClaimId === undefined) throw new Error("the fixture's Proof claim was not published");
  record("1. published Proof claim", proofClaimId);

  // A Reasoning claim: open a cell, admit one claim.
  const reasoning = first.reasoningCells;
  if (reasoning === undefined) throw new Error("the packaged install composed no Reasoning plane");
  await reasoning.service.openCell({
    cellId: "cell-alpha",
    objective: "what is the alpha constant",
    verificationPolicyRef: policyRef("e1k-rv"),
    admissionPolicyRef: policyRef("e1k-ra"),
  });
  const branch = await reasoning.service.openBranch({ cellId: "cell-alpha", question: "is alpha one?" });
  const submitted = await reasoning.service.submitCandidate({
    cellId: "cell-alpha",
    branchId: branch.branch.ref.branchId,
    type: reasoningModule.REASONING_STATEMENT_TYPE,
    content: { statement: "alpha is one" },
  });
  const evaluation = await reasoning.service.evaluateCandidate({ cellId: "cell-alpha", candidateDigest: submitted.candidate.candidateDigest });
  record("1b. Reasoning evaluation outcome", evaluation.status);
  const frontier = await reasoning.service.frontier({ cellId: "cell-alpha" });
  const reasoningClaimId = frontier.claims[0]?.ref.claimId;
  if (reasoningClaimId === undefined) throw new Error(`the fixture's Reasoning claim was not admitted (evaluation=${JSON.stringify(evaluation)})`);
  record("2. admitted Reasoning claim", reasoningClaimId);

  // Associate BOTH with the project — the eligibility precondition (§10).
  const workspace = first.projectWorkspace;
  if (workspace === undefined) throw new Error("the packaged install composed no ProjectWorkspace");
  await workspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: proofClaimId }, associationKind: "MANUAL", provenance: "e1k-live" });
  await workspace.associateAsset({ projectId: project, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: "cell-alpha" }, associationKind: "MANUAL", provenance: "e1k-live" });
  record("3. both assets project-associated", "PROOF_CLAIM + REASONING_CELL");

  const manifestBefore = countManifests(firstController);
  record("4. manifests before the restart", manifestBefore);

  // CLOSE the first session. Nothing of it survives except the durable stores.
  await first.dispose();
  record("5. first installation disposed", "session replaced");

  /* ---------------------------------------------------------------- Phase 2 */

  process.stdout.write("\nPHASE 2 — cold restart, new session, standard worker path\n");
  const second = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, installOptions(makeStores(), {}));
  const controller = second.controller;

  // The worker records the context it was handed, then commits — the real discipline.
  const workerContextPath = `${OUT}/worker-context.json`;
  const workerPort = () => ({
    adapterId: "e1k-live-committing-worker",
    async run({ workDir, context }) {
      writeFileSync(workerContextPath, JSON.stringify(context, null, 2), "utf8");
      writeFileSync(join(workDir, "src", "a.js"), "// The alpha helper.\nexport const a = 2;\n");
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "worker commit"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  });

  const service = delegation.makeWorkDelegationService({ controller, workerFor: workerPort });
  const start = await service.start({
    expectedTaskId: "t1",
    knowledge: { proof: [{ claimId: proofClaimId }], reasoning: [{ cellId: "cell-alpha", claimId: reasoningClaimId }] },
  });
  record("6. delegation job started", `${start.jobId} (resumed=${start.resumed})`);

  // Await the terminal phase by polling the READ-ONLY view (never a command channel).
  let view = await service.followup({ jobId: start.jobId });
  for (let i = 0; i < 600 && view.phase === "QUEUED"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    view = await service.followup({ jobId: start.jobId });
  }
  for (let i = 0; i < 600 && view.phase === "RUNNING"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    view = await service.followup({ jobId: start.jobId });
  }
  if (view.phase !== "FINISHED") throw new Error(`the delegation job did not finish: ${view.phase} ${view.hostError ?? ""}`);
  const attemptId = view.attemptId;
  record("7. attempt settled through the standard path", `${attemptId} (${view.phase})`);

  /* ---------------------------------------------------------------- Phase 3 */

  process.stdout.write("\nPHASE 3 — worker delivery: handles, not bodies\n");
  if (!existsSync(workerContextPath)) throw new Error("the worker recorded no context — the standard path did not deliver one");
  const delivered = JSON.parse(readFileSync(workerContextPath, "utf8"));
  const bootKinds = delivered.compiled.boot.map((entry) => entry.kind);
  const handleKinds = delivered.compiled.handles.map((entry) => entry.kind);
  const proofHandle = `@ctx/proof/${proofClaimId}`;
  const reasoningHandle = `@ctx/reasoning/cell-alpha/${reasoningClaimId}`;
  record("8. boot kinds seen by the worker", bootKinds.join(", ") || "(none)");
  record("9. knowledge handles seen by the worker", handleKinds.filter((kind) => kind === "proof" || kind === "reasoning").join(", ") || "(none)");

  // The worker/host PULLS both handles: the canonical body resolves, and the CURRENT view is
  // reported separately from the IMMUTABLE compile-time binding.
  const pulledProof = await controller.fetchContext(attemptId, proofHandle);
  const pulledReasoning = await controller.fetchContext(attemptId, reasoningHandle);
  record("10. Proof body pulled", pulledProof === undefined ? "MISSING" : `standingAtCompile=${pulledProof.binding.standing_at_compile} body=${pulledProof.body === undefined ? "unresolved" : "resolved"}`);
  record("11. Reasoning body pulled", pulledReasoning === undefined ? "MISSING" : `activeAtCompile=${pulledReasoning.binding.active_at_compile} body=${pulledReasoning.body === undefined ? "unresolved" : "resolved"}`);
  record("12. current view is distinct from compile-time", pulledProof === undefined ? "MISSING" : `${JSON.stringify(pulledProof.current)} vs ${pulledProof.binding.standing_at_compile}`);

  const manifestAfterRun = manifestOf(controller, attemptId);
  const boundBefore = JSON.stringify(manifestAfterRun?.knowledge ?? null);

  /* ---------------------------------------------------------------- Phase 4 */

  process.stdout.write("\nPHASE 4 — temporal mutation: history holds, current moves\n");
  // The SECOND installation's Proof/Reasoning services are the LIVE ones — the first install was
  // disposed in Phase 1, so its services are closed. Mutating through a disposed owner would be a
  // rig bug, not a product finding.
  const liveProof = second.proof;
  const liveReasoning = second.reasoningCells;
  if (liveProof === undefined || liveReasoning === undefined) throw new Error("the restarted install composed no knowledge owners");
  proofScript.forced = "CONTRADICTED";
  await liveProof.reassess({ claimId: proofClaimId, policyRef: policyRef("e1k-verification") });
  const invalidation = await liveReasoning.service.requestInvalidation({ cellId: "cell-alpha", targetClaimId: reasoningClaimId, reason: "superseded in the live gate" });
  record("12b. Reasoning invalidation outcome", invalidation.status);

  const manifestAfterMutation = manifestOf(controller, attemptId);
  const boundAfter = JSON.stringify(manifestAfterMutation?.knowledge ?? null);
  record("13. manifest binding unchanged by mutation", boundBefore === boundAfter ? "UNCHANGED" : "CHANGED");

  const repulled = await controller.fetchContext(attemptId, proofHandle);
  record("14. re-pull reports CURRENT alongside COMPILE-TIME", repulled === undefined ? "MISSING" : `compile=${repulled.binding.standing_at_compile} current=${repulled.current?.effectiveStanding ?? "none"}`);

  /* ---------------------------------------------------------------- Phase 5 */

  process.stdout.write("\nPHASE 5 — a new attempt cannot inherit now-ineligible knowledge\n");
  /**
   * A FRESH project lifecycle over the SAME durable knowledge stores. This is the honest shape of the
   * negative case: the knowledge is still durably visible (same proof/cell/association stores, same
   * project scope), yet a NEW attempt that explicitly requests the now-INVALIDATED Reasoning claim must
   * be refused at compile time. `t1` in the Phase-1 lifecycle is already settled and the scheduler's
   * next decision is its verification, so the fresh lifecycle is what makes the task schedulable — the
   * scheduler's fence is a different rule and must not be mistaken for the knowledge refusal.
   */
  const third = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      ...installOptions(makeStores(), {}),
      databasePath: `${STATE}/orchestration-b.sqlite`,
      ordariumDatabasePath: `${STATE}/ordarium-b.sqlite`,
    },
  );
  const controllerB = third.controller;
  /**
   * The fresh lifecycle must start where the REPOSITORY actually is. Phase 2's worker committed and its
   * result was exported, so the repo head moved past the genesis commit; a project that still named the
   * genesis head would refuse at PREPARE with HEAD_BASIS_MISMATCH — a world-basis rule, which would
   * again mask the knowledge refusal this phase exists to measure.
   */
  controllerB.start({
    projectId: project,
    goal: "keep the alpha helper honest",
    headCommit: git(PROJECT, ["rev-parse", "HEAD"]),
    tasks: [{ task_id: "tb", objective: "a new attempt that must not inherit invalid knowledge", depends_on: [], write_paths: ["src/a.js"], required_artifacts: [] }],
  });

  const attemptsBefore = countManifests(controllerB);
  let refusalKind = null;
  let refusalMessage = "";
  let workerRanForB = false;
  const workerB = () => ({
    adapterId: "e1k-live-should-not-run",
    async run() {
      workerRanForB = true;
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  });
  const serviceB = delegation.makeWorkDelegationService({ controller: controllerB, workerFor: workerB });
  try {
    const startedB = await serviceB.start({
      expectedTaskId: "tb",
      // The INVALIDATED Reasoning claim: ineligible because it is no longer in the active frontier.
      knowledge: { reasoning: [{ cellId: "cell-alpha", claimId: reasoningClaimId }] },
    });
    let viewB = await serviceB.followup({ jobId: startedB.jobId });
    for (let i = 0; i < 100 && (viewB.phase === "QUEUED" || viewB.phase === "RUNNING"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      viewB = await serviceB.followup({ jobId: startedB.jobId });
    }
    refusalKind = viewB.hostError === null ? viewB.phase : "HOST_ERROR";
    refusalMessage = viewB.hostError ?? "";
    record("15b. refused job terminal phase", `${viewB.phase} / ${viewB.hostError ?? "no host error"}`);
  } catch (error) {
    refusalKind = error?.kind ?? error?.name ?? "threw";
    refusalMessage = error?.message ?? String(error);
  }
  record("15. ineligible knowledge refused", `${refusalKind} — ${refusalMessage}`);
  record("16. the refused attempt wrote no manifest", countManifests(controllerB) === attemptsBefore ? "ZERO new manifests" : "A MANIFEST WAS WRITTEN");
  record("17. the refused attempt's worker never ran", workerRanForB ? "RAN (WRONG)" : "did not run");
  const refusedManifestsAtClose = countManifests(controllerB);
  await third.dispose();

  /* ---------------------------------------------------------------- Phase 6 */

  process.stdout.write("\nPHASE 6 — knowledge granted zero authority\n");
  const attempt = controller.attemptWorkRecord(attemptId);
  record("18. attempt state after knowledge binding", attempt?.state ?? "unknown");
  const authorization = controller.store.connection
    .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type IN ('PROMOTION_COMMITTED','PROMOTION_PREPARED')")
    .get(project).c;
  record("19. promotions caused by knowledge selection", String(authorization));

  const report = { proofClaimId, reasoningClaimId, attemptId, proofHandle, reasoningHandle };
  writeFileSync(`${OUT}/e1k-live-report.json`, JSON.stringify(report, null, 2), "utf8");

  /**
   * Capture every store read the verdict needs BEFORE disposing: `dispose()` closes the ledger, and a
   * verdict that queries a closed database reports "database is not open" — a harness bug masquerading
   * as a product finding.
   */
  const attemptAtClose = controller.attemptWorkRecord(attemptId);

  await second.dispose();

  /* ---------------------------------------------------------------- verdict */

  const required = [
    ["session replacement happened", () => true],
    ["durable project knowledge survived the restart", () => pulledProof !== undefined && pulledReasoning !== undefined],
    ["knowledge reached a new worker", () => handleKinds.includes("proof") && handleKinds.includes("reasoning")],
    ["the body was pull-only (no proof/reasoning boot content)", () => !bootKinds.includes("proof") && !bootKinds.includes("reasoning")],
    ["the Proof body resolved through the canonical owner", () => pulledProof?.body !== undefined],
    ["the Reasoning body resolved through the canonical owner", () => pulledReasoning?.body !== undefined],
    ["the historical binding stayed immutable", () => boundBefore === boundAfter],
    ["the current standing was re-derived on pull", () => repulled?.current !== undefined && repulled?.current !== null],
    ["the compile-time snapshot is still the frozen one", () => repulled?.binding?.standing_at_compile === pulledProof?.binding?.standing_at_compile],
    ["invalid current knowledge was refused for a new attempt", () => refusalMessage.includes("KNOWLEDGE_REASONING_INACTIVE")],
    ["the refused attempt wrote zero manifests", () => refusedManifestsAtClose === attemptsBefore],
    ["the refused attempt's worker never ran", () => workerRanForB === false],
    ["knowledge granted zero promotion authority", () => authorization === 0],
    ["the attempt completed on the ordinary path", () => attemptAtClose?.state === "COMPLETED"],
  ];
  let ok = true;
  process.stdout.write("\n");
  for (const [label, check] of required) {
    let value = false;
    try {
      value = check();
    } catch (error) {
      process.stdout.write(`FAIL  ${label} — ${String(error)}\n`);
      ok = false;
      continue;
    }
    process.stdout.write(`${value ? "PASS" : "FAIL"}  ${label}\n`);
    if (!value) ok = false;
  }
  process.stdout.write(`\n§E1-K-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  if (process.env.PALIMPSEST_GATE_FINDINGS === "1") {
    for (const [key, value] of findings) process.stdout.write(`  ${key}: ${value}\n`);
  }
  process.stdout.write("\n");
  process.exit(ok ? 0 : 1);
}

/** How many CONTEXT_MANIFEST_ADDED events the project has — the "zero write" evidence. */
function countManifests(controller) {
  return controller.store.connection
    .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='CONTEXT_MANIFEST_ADDED'")
    .get(project).c;
}

/** The projected manifest for one attempt, or null. */
function manifestOf(controller, attemptId) {
  const row = controller.store.connection
    .prepare("SELECT manifest_json FROM context_manifests WHERE project_id=? AND task_id=(SELECT task_id FROM attempts WHERE project_id=? AND attempt_id=?)")
    .get(project, project, attemptId);
  return row === undefined ? null : JSON.parse(new TextDecoder().decode(row.manifest_json));
}

main().catch((error) => {
  process.stderr.write(`e1k-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
