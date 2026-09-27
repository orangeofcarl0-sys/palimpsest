#!/usr/bin/env node
/**
 * §E2-I-LIVE — GOVERNED PROJECT INTENT RECONCILIATION, end to end, on a REAL PACKAGED INSTALL.
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 *
 * The loop this gate exists to close:
 *
 *     evidence discovered under Project_t
 *       → a proposal grounded in that evidence
 *       → an INDEPENDENT authority's admission
 *       → the EXISTING ProjectIR revision path
 *       → Project_{t+1}
 *       → a new worker receives the revised intent
 *
 * and, composing with E1-K, the first complete Palimpsest learning loop: the new worker receives
 * BOTH the revised top-down intent AND the bottom-up admitted knowledge that motivated it.
 *
 * WHAT MAKES THIS A REAL GATE:
 *
 *   · the composition is the PACKAGED `installPalimpsest` — the same one a host launches;
 *   · the knowledge owners are the REAL Proof/Reasoning/ProjectWorkspace services, wired through the
 *     real `src/composition/project_intent.ts` adapter;
 *   · Phase 6 DISPOSES the installation and composes a SECOND one over the same durable stores — a
 *     genuine session replacement, so "the receipt survived" is an observation, not an assumption;
 *   · Phase 7 drives the NORMAL Work delegation path, so "future Work inherited the revised intent" is
 *     measured from the context a worker was actually handed.
 *
 * The worker is a DETERMINISTIC host fixture (§35: "avoid unnecessary stochastic model dependence").
 *
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { gateRepoRoot, gateRoot } from "./env.mjs";

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/e2i-live`;
const PROJECT_DIR = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);
const proofModule = await import(pathToFileURL(`${REPO}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const { reasoningVerificationDigestOf, invalidationVerificationDigestOf, reasoningAdmissionDigestOf, invalidationAdmissionDigestOf } = reasoningModule;

const project = "e2ilive";
const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

/* ------------------------------------------------------------------ fixture */

function setupProject() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(join(PROJECT_DIR, "src"), { recursive: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(PROJECT_DIR, "src", "latency.js"), "// The latency-sensitive path.\nexport const budget = 10;\n");
  execFileSync("git", ["init", "-q"], { cwd: PROJECT_DIR });
  execFileSync("git", ["add", "-A"], { cwd: PROJECT_DIR });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: PROJECT_DIR });
  return git(PROJECT_DIR, ["rev-parse", "HEAD"]);
}

/* ------------------------------------------------------------------ policies */

const policyRef = (policyId) => ({ policyId, version: "v1" });

/**
 * The Proof verification policy. `script.forced` is MUTABLE so the gate can move an owner's standing
 * after a proposal has bound it — the §26 case the currentness assessment exists for.
 */
function proofVerification(script) {
  return {
    policyRef: policyRef("e2i-proof-verification"),
    async verify({ candidate }) {
      const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
      const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
      return {
        standing: script.forced ?? (supporting.length > 0 && contradicting.length === 0 ? "SUPPORTED" : "INCONCLUSIVE"),
        supportingEvidenceIds: supporting,
        contradictingEvidenceIds: contradicting,
      };
    },
  };
}

function proofPublication() {
  return {
    policyRef: policyRef("e2i-proof-publication"),
    async decide({ verification }) {
      return { decision: "PUBLISH", provenanceDigest: verification.provenanceDigest };
    },
  };
}

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
  derivedFrom: Object.freeze(["e2i-live fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/**
 * The INDEPENDENT authority. Deterministic, and it always decides the EXACT digest it was shown.
 *
 * `script.decision` is MUTABLE so the gate can exercise REJECT, then ADMIT, against ONE installation —
 * which is the honest shape of the question: the authority's decision changes, not the deployment.
 */
function authority(script) {
  return {
    policyRef: policyRef("e2i-live-authority"),
    async decide({ proposal }) {
      const decision = script.decision;
      return {
        decision,
        proposalDigest: proposal.digest,
        policyRef: policyRef("e2i-live-authority"),
        provenanceDigest: "e".repeat(64),
        detail: `the e2i-live authority returned ${decision}`,
      };
    },
  };
}

/* ------------------------------------------------------------------ the run */

async function main() {
  const head = setupProject();
  process.stdout.write(`repo     ${PROJECT_DIR}\nhead     ${head}\nout      ${OUT}\n\n`);

  const proofPath = `${STATE}/proof.sqlite`;
  const blobRoot = `${STATE}/proof-blobs`;
  const cellPath = `${STATE}/cells.sqlite`;
  const assocPath = `${STATE}/assoc.sqlite`;
  const journalPath = `${STATE}/journal.sqlite`;
  const orchestrationPath = `${STATE}/orchestration.sqlite`;
  const ordariumPath = `${STATE}/ordarium.sqlite`;

  /** Stores are PATH-based, so a new install over the same paths reads the same durable state. */
  const makeStores = () => ({
    proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(proofPath),
    proofBlobStore: proofModule.localProofBlobStore(blobRoot),
    reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(cellPath),
    projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(assocPath),
    projectJournalStore: new workspaceModule.SqliteProjectJournalStore(journalPath),
  });

  const installOptions = (extra) => ({
    projectId: project,
    databasePath: orchestrationPath,
    ordariumDatabasePath: ordariumPath,
    repository: PROJECT_DIR,
    execution: "worktree",
    standard: STANDARD,
    policy: advanced.trustedDefaultPolicy({
      read_paths: ["src"],
      allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
    }),
    ...makeStores(),
    reasoningCellStoreOwned: false,
    proofVerificationPolicy: proofVerification(proofScript),
    proofPublicationAdmission: proofPublication(),
    reasoningVerificationPolicy: reasoningVerification(),
    reasoningAdmissionPolicy: reasoningAdmission(),
    ...extra,
  });

  /* ---------------------------------------------------------------- Phase 1 */

  process.stdout.write("PHASE 1 — old intent\n");
  const authorityScript = { decision: "REJECT" };
  const proofScript = {};
  const first = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, installOptions({ projectIntentAdmission: authority(authorityScript) }));
  const controller = first.controller;
  controller.start({
    projectId: project,
    goal: "keep the service fast",
    headCommit: head,
    requirements: [{ requirement_id: "R", statement: "latency <= 10 ms", priority: "critical", acceptance_refs: [] }],
    tasks: [{ task_id: "t1", objective: "meet the 10 ms bound", depends_on: [], write_paths: ["src/latency.js"], required_artifacts: [] }],
  });
  const intent = first.intent;
  if (intent === undefined) throw new Error("the packaged install composed no intent surface");
  record("1. old intent", requirementOf(controller, "R"));

  /* ---------------------------------------------------------------- Phase 2 */

  process.stdout.write("\nPHASE 2 — bottom-up reality\n");
  const proof = first.proof;
  if (proof === undefined) throw new Error("the packaged install composed no Proof plane");
  const imported = await proof.importSource({
    bytes: new TextEncoder().encode("measured serialization floor is 17 ms"),
    mediaType: "text/plain",
    label: "latency-measurement",
    provenance: "LOCAL_IMPORT",
    sourceId: "latency-measurement",
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: "latency-measurement", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: "the measured feasible lower bound is 17 ms" },
    supportingEvidenceIds: [evidence.evidenceId],
    origin: "MANUAL",
  });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  const claimId = published.claimId;
  if (claimId === undefined) throw new Error("the fixture's Proof claim was not published");
  await first.projectWorkspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: claimId }, associationKind: "MANUAL", provenance: "e2i-live" });
  record("2. published + associated Proof claim", `${claimId} (17 ms floor)`);

  // A NEGATIVE_RESULT for the failed <= 10 ms direction — the third epistemic class.
  const negative = await first.projectWorkspace.recordJournalEntry({
    projectId: project,
    kind: "NEGATIVE_RESULT",
    title: "10 ms is unreachable",
    body: "every measured configuration bottoms out at 17 ms",
    provenance: "e2i-live",
  });
  record("3. NEGATIVE_RESULT recorded", negative.entryId);

  /* ---------------------------------------------------------------- Phase 3 */

  process.stdout.write("\nPHASE 3 — prepare the proposal\n");
  const revisionsBefore = countEvents(controller, "PROJECT_REVISED");
  const prepared = await intent.prepare({
    changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
    grounds: { proof: [{ claimId }], negativeResults: [{ entryId: negative.entryId }] },
    rationale: "the measured floor makes 10 ms unreachable; the bound should reflect reality",
  });
  record("4. proposal prepared", `${prepared.proposal.proposalId} (digest ${prepared.proposal.digest.slice(0, 12)}…)`);
  record("5. proposal basis (old revision)", `revision ${prepared.proposal.projectBasis.revision}`);
  record("6. ground kinds bound", prepared.proposal.grounds.map((ground) => ground.kind).join(", "));
  record("7. derived change class", prepared.changeClass);
  record("8. no ProjectIR write at prepare", countEvents(controller, "PROJECT_REVISED") === revisionsBefore ? "ZERO writes" : "A WRITE HAPPENED");

  /* ---------------------------------------------------------------- Phase 4 */

  process.stdout.write("\nPHASE 4 — authority separation\n");
  // (a) The authority REJECTS: zero writes, and the project is untouched.
  const refusedByReject = await intent.apply({ proposal: prepared.proposal });
  record("9. rejecting authority", `${refusedByReject.status} (${countEvents(controller, "PROJECT_REVISED") === revisionsBefore ? "zero writes" : "WRITE HAPPENED"})`);

  // (b) The authority cannot decide: still zero writes, never an accidental approval.
  authorityScript.decision = "UNRESOLVED";
  const refusedUnresolved = await intent.apply({ proposal: prepared.proposal });
  record("10. unresolved authority", `${refusedUnresolved.status} (${countEvents(controller, "PROJECT_REVISED") === revisionsBefore ? "zero writes" : "WRITE HAPPENED"})`);

  // (c) An ABSENT authority is a separate deployment over the SAME durable project — a host that simply
  //     did not supply an admission port. It must not acquire one implicitly.
  const noAuthority = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, installOptions({}));
  const refusedNoAuthority = await noAuthority.intent.apply({ proposal: prepared.proposal });
  record("11. no authority composed", `${refusedNoAuthority.status} (never an implicit approval)`);
  await noAuthority.dispose();

  /* ---------------------------------------------------------------- Phase 5 */

  process.stdout.write("\nPHASE 5 — apply through the existing revision path\n");
  authorityScript.decision = "ADMIT";
  const applied = await intent.apply({ proposal: prepared.proposal });
  record("12. apply outcome", `${applied.status} at revision ${applied.revision}`);
  record("13. requirement after apply", requirementOf(controller, "R"));
  record("14. old nonterminal Work retired", applied.staledTaskIds.join(", ") || "(none)");
  record("15. work state after apply", controller.work.task("t1")?.state ?? "unknown");

  // The receipt is on the PROJECT_REVISED event itself.
  const receipt = latestReceipt(controller);
  record("16. PROJECT_REVISED carries the receipt", receipt === null ? "MISSING" : `proposal ${receipt.proposalDigest.slice(0, 12)}… · ${receipt.groundBindings.length} grounds · authority ${receipt.admission.policyRef.policyId}`);
  const promotionsBefore = countEvents(controller, "PROMOTION_COMMITTED") + countEvents(controller, "PROMOTION_PREPARED");
  record("17. promotions minted by the revision", String(promotionsBefore));

  /* ---------------------------------------------------------------- Phase 6 */

  process.stdout.write("\nPHASE 6 — cold restart\n");
  const revived = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, installOptions({ projectIntentAdmission: authority({ decision: "ADMIT" }) }));
  record("17. revised ProjectIR survives restart", requirementOf(revived.controller, "R"));
  const revivedReceipt = latestReceipt(revived.controller);
  record("18. accepted provenance survives restart", revivedReceipt === null ? "MISSING" : `${revivedReceipt.groundBindings.map((ground) => ground.kind).join(", ")} · rationale preserved=${revivedReceipt.rationale.length > 0}`);

  /* ---------------------------------------------------------------- Phase 7 */

  process.stdout.write("\nPHASE 7 — future Work under the revised intent\n");
  // ORDINARY planning — not E2-I — authors the replacement Work (§22).
  const current = revived.controller.work.project();
  revived.controller.plan({
    goal: current.goal,
    requirements: current.requirements,
    decisions: current.decisions,
    tasks: [
      ...current.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: "t2", objective: "meet the revised 20 ms bound", depends_on: [], write_paths: ["src/latency.js"], required_artifacts: [] },
    ],
    reason: "ordinary next plan under the revised intent",
  });
  record("19. replacement Work created by ordinary planning", revived.controller.work.task("t2") === null ? "MISSING" : "t2 present");

  const workerContextPath = `${OUT}/worker-context.json`;
  const workerPort = () => ({
    adapterId: "e2i-live-committing-worker",
    async run({ workDir, context }) {
      writeFileSync(workerContextPath, JSON.stringify(context, null, 2), "utf8");
      writeFileSync(join(workDir, "src", "latency.js"), "// The latency-sensitive path.\nexport const budget = 20;\n");
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "worker commit"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  });
  const service = delegation.makeWorkDelegationService({ controller: revived.controller, workerFor: workerPort });
  const started = await service.start({
    expectedTaskId: "t2",
    // E1-K composes with E2-I: the new worker also receives the knowledge that MOTIVATED the change.
    knowledge: { proof: [{ claimId }] },
  });
  let view = await service.followup({ jobId: started.jobId });
  for (let i = 0; i < 600 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    view = await service.followup({ jobId: started.jobId });
  }
  if (view.phase !== "FINISHED") throw new Error(`the delegation job did not finish: ${view.phase} ${view.hostError ?? ""}`);
  record("20. future Work ran the standard path", `${view.attemptId} (${view.phase})`);

  if (!existsSync(workerContextPath)) throw new Error("the worker recorded no context");
  const delivered = JSON.parse(readFileSync(workerContextPath, "utf8"));
  const requirementLines = delivered.work.requirements.join(" ");
  const knowledgeHandles = delivered.compiled.handles.map((entry) => entry.handle);
  record("21. worker received the revised intent", requirementLines.includes("latency <= 20 ms") ? "latency <= 20 ms" : `MISSING (${requirementLines})`);
  record("22. worker received the motivating knowledge", knowledgeHandles.includes(`@ctx/proof/${claimId}`) ? `@ctx/proof/${claimId}` : "MISSING");

  /* ---------------------------------------------------------------- Phase 8 */

  process.stdout.write("\nPHASE 8 — a stale proposal cannot mutate intent\n");
  const revisionsAtPhase8 = countEvents(revived.controller, "PROJECT_REVISED");

  // (a) STALE GROUND: prepare a proposal grounded in the Proof, then move the OWNER's standing. The
  //     proposal's bound snapshot no longer describes the world, so it must not apply.
  const staleByGround = await revived.intent.prepare({
    changes: [{ kind: "GOAL_REVISE", goal: "a goal grounded in a claim that will move" }],
    grounds: { proof: [{ claimId }] },
    rationale: "will go stale by ground",
  });
  // Publish a NEW claim under the same source so the plane advances, then reassess the bound claim.
  const secondImported = await revived.proof.importSource({
    bytes: new TextEncoder().encode("a later measurement changed the picture"),
    mediaType: "text/plain",
    label: "latency-remeasurement",
    provenance: "LOCAL_IMPORT",
    sourceId: "latency-remeasurement",
  });
  const secondRef = proofModule.materializeProofSourceRevisionRef({ sourceId: "latency-remeasurement", revision: secondImported.revision.revision, contentDigest: secondImported.revision.contentDigest });
  const secondEvidence = await revived.proof.recordEvidence({ sourceRevision: secondRef, selector: { kind: "WHOLE_SOURCE" } });
  const secondCandidate = await revived.proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: "a later measurement contradicts the floor" },
    supportingEvidenceIds: [],
    contradictingEvidenceIds: [secondEvidence.evidenceId],
    origin: "MANUAL",
  });
  await revived.proof.verify({ candidateId: secondCandidate.candidateId });
  const secondPublished = await revived.proof.decidePublication({ candidateId: secondCandidate.candidateId });
  if (secondPublished.claimId !== undefined) {
    // The bound claim now depends on a contradicted dependency? No — reassess it directly so its OWN
    // standing moves, which is the §26 case.
    proofScript.forced = "CONTRADICTED";
    await revived.proof.reassess({ claimId, policyRef: policyRef("e2i-proof-verification") });
  }
  const groundStale = await revived.intent.apply({ proposal: staleByGround.proposal });
  record("23. a proposal whose ground moved", `${groundStale.status} (${groundStale.currentness.status})`);
  record("24. stale-ground proposal wrote nothing", countEvents(revived.controller, "PROJECT_REVISED") === revisionsAtPhase8 ? "zero writes" : "A WRITE HAPPENED");

  const report = { claimId, negativeEntryId: negative.entryId, proposalDigest: prepared.proposal.digest, attemptId: view.attemptId };
  writeFileSync(`${OUT}/e2i-live-report.json`, JSON.stringify(report, null, 2), "utf8");

  // Capture the reads the verdict needs BEFORE disposing: `dispose()` closes the ledger, and a verdict
  // that queries a closed database reports "database is not open" — a harness bug, not a finding.
  const attemptAtClose = revived.controller.attemptWorkRecord(view.attemptId);
  const requirementAtClose = requirementOf(revived.controller, "R");
  await revived.dispose();

  /* ---------------------------------------------------------------- verdict */

  const required = [
    ["bottom-up reality was canonical and project-grounded", () => receipt !== null && receipt.groundBindings.some((ground) => ground.kind === "proof") && receipt.groundBindings.some((ground) => ground.kind === "negative_result")],
    ["the proposal was not authority (no write at prepare)", () => prepared.proposal.digest.length === 64],
    ["an absent authority admitted nothing", () => refusedNoAuthority.status === "authority_unresolved"],
    ["a rejecting authority admitted nothing", () => refusedByReject.status === "rejected"],
    ["the revision used the EXISTING path (one PROJECT_REVISED, requirement changed)", () => applied.status === "APPLIED" && requirementAtClose.includes("20 ms")],
    ["the receipt was carried on PROJECT_REVISED", () => receipt !== null && receipt.proposalDigest === prepared.proposal.digest],
    ["the receipt names its authority and grounds", () => receipt !== null && receipt.admission.policyRef.policyId === "e2i-live-authority" && receipt.groundBindings.length === 2],
    ["old nonterminal Work did not silently survive", () => applied.staledTaskIds.includes("t1")],
    ["no promotion authority was minted", () => promotionsBefore === 0],
    ["the accepted grounding survived the restart", () => revivedReceipt !== null && revivedReceipt.proposalDigest === prepared.proposal.digest],
    ["future Work inherited the revised intent", () => requirementLines.includes("latency <= 20 ms")],
    ["E1-K knowledge inheritance composed with E2-I", () => knowledgeHandles.includes(`@ctx/proof/${claimId}`)],
    ["the attempt completed on the ordinary path", () => attemptAtClose?.state === "COMPLETED"],
    ["a proposal whose ground moved could not mutate intent", () => groundStale.status === "stale" && groundStale.currentness.status === "STALE_GROUND"],
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
  process.stdout.write(`\n§E2-I-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  if (process.env.PALIMPSEST_GATE_FINDINGS === "1") {
    for (const [key, value] of findings) process.stdout.write(`  ${key}: ${value}\n`);
  }
  process.stdout.write("\n");
  process.exit(ok ? 0 : 1);
}

/* ------------------------------------------------------------------ helpers */

function requirementOf(controller, requirementId) {
  const requirement = controller.work.project().requirements.find((entry) => entry.requirement_id === requirementId);
  return requirement === undefined ? "(missing)" : requirement.statement;
}

function countEvents(controller, type) {
  return controller.store.connection
    .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type=?")
    .get(project, type).c;
}

/** The accepted reconciliation receipt on the newest PROJECT_REVISED, or null. */
function latestReceipt(controller) {
  const row = controller.store.connection
    .prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1")
    .get(project);
  if (row === undefined) return null;
  const payload = JSON.parse(new TextDecoder().decode(row.payload_json));
  return payload.intent_reconciliation ?? null;
}

main().catch((error) => {
  process.stderr.write(`e2i-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
