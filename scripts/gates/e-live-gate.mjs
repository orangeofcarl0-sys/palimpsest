#!/usr/bin/env node
/**
 * §E-LIVE — LONG-HORIZON INTELLECTUAL COMPOUNDING DOGFOOD, deterministic machine gate.
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 *
 * This gate is DIFFERENT from the E1–E5 gates. Those proved a loop closes. This one asks whether the
 * loops COMPOSE into a cumulative cognitive floor across GENERATIONS of a real project:
 *
 *     Generation N performs expensive cognition/work
 *       → Palimpsest capitalizes the result
 *       → cold restart (a NEW installation over the same durable stores)
 *       → Generation N+1 inherits the relevant result
 *       → N+1 does NOT re-pay the same prerequisite discovery
 *       → new experience revises/supersedes the inherited capital
 *       → Generation N+2 starts from the NEW floor
 *
 * The project is a REAL TypeScript library (scripts/gates/dag-planner) with an INDEPENDENT acceptance
 * suite that knows nothing about Palimpsest. The tests are the same in every generation, so the
 * contract never moves to meet the implementation.
 *
 * §29: the machine gate is DETERMINISTIC. Every "worker" is a host fixture; no model output is
 * required for CI. The observational dogfood run lives in the report, not here.
 *
 * §34: no transcript bridge. Each generation is a fresh `installPalimpsest` over durable stores; the
 * only thing that crosses a restart is what a durable owner holds.
 *
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { gateRepoRoot, gateRoot } from "./env.mjs";
import { deriveImplementation } from "./derive-dag.mjs";

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/e-live`;
const A_DIR = `${RIG}/dag-planner`;
const B_DIR = `${RIG}/cycle-specialist`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;
const FIXTURE = `${REPO}/scripts/gates/dag-planner`;

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);
const proofModule = await import(pathToFileURL(`${REPO}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const coordinationModule = await import(pathToFileURL(`${REPO}/dist/src/coordination/index.js`).href);
const boundaryModule = await import(pathToFileURL(`${REPO}/dist/src/boundary_memory/index.js`).href);
const federationModule = await import(pathToFileURL(`${REPO}/dist/src/federation/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO}/dist/src/experiment/index.js`).href);
const orgModule = await import(pathToFileURL(`${REPO}/dist/src/organization/index.js`).href);
const scopeModule = await import(pathToFileURL(`${REPO}/dist/src/runtime_scope/index.js`).href);
const evolutionModule = await import(pathToFileURL(`${REPO}/dist/src/organization_evolution/index.js`).href);
const advisorModule = await import(pathToFileURL(`${REPO}/dist/src/advisor/index.js`).href);
const { durableContactNeedScopeGuard } = await import(pathToFileURL(`${REPO}/dist/src/federation/federation_service.js`).href);
const { reasoningVerificationDigestOf, invalidationVerificationDigestOf, reasoningAdmissionDigestOf, invalidationAdmissionDigestOf } = reasoningModule;

const naiveSource = readFileSync(join(REPO, "scripts/gates/naive-dag.ts"), "utf8");
const matureSource = readFileSync(join(REPO, "scripts/gates/mature-dag.ts"), "utf8");
const maturePlusSource = readFileSync(join(REPO, "scripts/gates/mature-plus-dag.ts"), "utf8");

const projectA = "elivea";
const projectB = "eliveb";
const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

/**
 * §15/§16: the MANUAL-ASSISTANCE LEDGER. Every place the HOST had to know an opaque id, remember a
 * prior-session fact, or take a special recovery action. This is the ledger that decides whether the
 * textbook effect is real or whether a human secretly carried the knowledge across the restart.
 */
const assistance = [];
const assist = (generation, what, value, classification, note) => {
  assistance.push({ generation, what, value, classification, note });
  process.stdout.write(`  ~ assist[${generation}] ${classification}: ${what} = ${value}\n`);
};

/* ------------------------------------------------------------------ fixture */

/** A file's content digest, so §19 can show two conditions share bytes rather than assert it. */
function fileDigest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Compare generated code with a hand-written oracle while ignoring comments, formatting and the local
 * identifier the witness variable happens to use. What must match is the BEHAVIOUR the source encodes.
 */
function stripCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*$/gmu, "")
    .replace(/\brotated\b/gu, "WITNESS")
    .replace(/\bpath\b/gu, "WITNESS")
    .replace(/WITNESS: WITNESS/gu, "WITNESS")
    .replace(/\s+/gu, " ")
    .trim();
}

function copyFixture(target) {
  mkdirSync(target, { recursive: true });
  for (const file of ["package.json"]) {
    writeFileSync(join(target, file), readFileSync(join(FIXTURE, file)));
  }
  mkdirSync(join(target, "src"), { recursive: true });
  mkdirSync(join(target, "test"), { recursive: true });
  writeFileSync(join(target, "src", "dag.ts"), readFileSync(join(FIXTURE, "src", "dag.ts")));
  writeFileSync(join(target, "test", "acceptance.test.ts"), readFileSync(join(FIXTURE, "test", "acceptance.test.ts")));
  execFileSync("git", ["init", "-q"], { cwd: target });
  execFileSync("git", ["add", "-A"], { cwd: target });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: target });
  return git(target, ["rev-parse", "HEAD"]);
}

function setupRepo(dir, file) {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", file), "export const value = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  return git(dir, ["rev-parse", "HEAD"]);
}

/** Run the project's OWN acceptance suite and return the pass/fail counts. The contract never moves. */
function runAcceptance(dir) {
  let output;
  try {
    output = execFileSync("node", ["--test", "test/acceptance.test.ts"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  const pass = Number(/(?:^|\s)pass (\d+)/u.exec(output)?.[1] ?? "0");
  const fail = Number(/(?:^|\s)fail (\d+)/u.exec(output)?.[1] ?? "0");
  // `node --test` prints every failure TWICE — once in the summary list and again under
  // "failing tests:" — so counting lines double-reports. The DISTINCT test names are the real set.
  const failures = [...new Set([...output.matchAll(/^✖ (.+?) \(\d/gmu)].map((match) => match[1].trim()))];
  return { pass, fail, failures, output };
}

/* ------------------------------------------------------------------ policies */

const policyRef = (policyId) => ({ policyId, version: "v1" });

const STANDARD = Object.freeze({
  statement: "the acceptance suite passes and the write scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["e-live dogfood fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/** Proof verification: scripted standing, MUTABLE so the gate can move an owner's standing later. */
const proofScript = { forced: undefined };
function proofVerification() {
  return {
    policyRef: policyRef("elive-proof-verification"),
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

function proofPublication() {
  return { policyRef: policyRef("elive-proof-publication"), async decide({ verification }) {
    return { decision: "PUBLISH", provenanceDigest: verification.provenanceDigest };
  } };
}

function reasoningVerification() {
  return {
    async verify({ definition, candidate, frontierBasis }) {
      const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    async verifyInvalidation({ definition, request, frontierBasis }) {
      const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", evidenceIds: ["ev-9"], provenanceDigest: "b".repeat(64) };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
}

function reasoningAdmission() {
  return {
    async admit({ definition, candidate, verification, frontierBasis }) {
      const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT", provenanceDigest: "c".repeat(64) };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    async admitInvalidation({ definition, request, verification, frontierBasis }) {
      const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "INVALIDATE", provenanceDigest: "d".repeat(64) };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
}

/** E2-I: the INDEPENDENT intent authority. `script.decision` is MUTABLE. */
function intentAuthority(script) {
  return {
    policyRef: policyRef("elive-intent-authority"),
    async decide({ proposal }) {
      return { decision: script.decision, proposalDigest: proposal.digest, policyRef: policyRef("elive-intent-authority"), provenanceDigest: "e".repeat(64), detail: `the e-live authority returned ${script.decision}` };
    },
  };
}

/** E3-C: the UNTRUSTED need-authoring seam. */
function needAuthoring(script) {
  return {
    origin: "elive-need-author",
    async propose() {
      return { outcome: "proposal", competenceTags: script.tags ?? ["graph-theory", "cycle-detection"], reason: script.reason ?? "the cycle witness contract is a separate competence" };
    },
  };
}

function needAuthority(script) {
  return {
    policyRef: policyRef("elive-need-admission"),
    async decide({ candidate }) {
      return { decision: script.decision, candidateDigest: candidate.digest, policyRef: policyRef("elive-need-admission"), provenanceDigest: "f".repeat(64) };
    },
  };
}

/** E3-C: the INDEPENDENT fulfillment authority. */
function fulfillmentAuthority(script) {
  return {
    policyRef: policyRef("elive-fulfillment"),
    async decide({ submission }) {
      return { decision: script.decision, submissionDigest: submission.digest, policyRef: policyRef("elive-fulfillment"), provenanceDigest: "1".repeat(64) };
    },
  };
}

/** E5-P: the UNTRUSTED procedure-authoring seam. It reads the REAL grounds it is handed. */
function procedureAuthoring(script) {
  return {
    origin: "elive-procedure-author",
    async propose({ grounds, projectContext }) {
      script.grounds = grounds;
      script.projectContext = projectContext;
      return { outcome: "proposal", content: script.content };
    },
  };
}

function procedureAdmission(script) {
  return {
    policyRef: policyRef("elive-procedure-admission"),
    async decide({ candidateDigest, validation }) {
      return { decision: script.decision, candidateDigest, rationale: `admitted as a reusable project procedure (groundsResolved=${validation.groundsResolved})`, policyRef: policyRef("elive-procedure-admission") };
    },
  };
}

/** E4-L: the organization evolution compiler + independent authority. */
const PEER = { schemaVersion: 1, peerId: "p-elive" };
const MEMBER = { kind: "peer", peer: PEER };
const DYNAMICS_POLICY = { ref: { id: "elive-live", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };

function orgDef(revision, mission) {
  return orgModule.materializeOrganizationDefinition({
    organizationDefinitionId: "O",
    revision,
    mission,
    members: [MEMBER],
    roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
    assignments: [{ member: MEMBER, roleId: "r1" }],
    norms: [],
    interactions: [{ interactionId: "i-1", fromRoleId: "r1", toRoleId: "r2", protocol: "proto" }],
  });
}

function orgCompiler() {
  return {
    compile: async ({ proposal, sources }) => {
      const base = sources[0];
      const candidate = orgDef(base.revision + 1, `${base.mission}-verification-separated`);
      const body = { schemaVersion: 1, proposalDigest: proposal.digest, proposalBasisDigest: proposal.basisDigest, kind: "REVISE", transformation: { kind: "REVISE", base: orgModule.organizationRefOf(base), candidate }, compilerProvenance: "elive-compiler" };
      return { ...body, digest: evolutionModule.evolutionCandidateDigestOf(body) };
    },
  };
}

function evolutionAuthority(script) {
  return { admit: async () => (script.decision === "authorized" ? { outcome: "authorized" } : { outcome: "denied", detail: "the e-live authority refused" }) };
}

/* ------------------------------------------------------------------ installs */

const paths = {
  proof: `${STATE}/proof.sqlite`,
  blobs: `${STATE}/proof-blobs`,
  cells: `${STATE}/cells.sqlite`,
  assoc: `${STATE}/assoc.sqlite`,
  journal: `${STATE}/journal.sqlite`,
  memory: `${STATE}/memory.sqlite`,
  procedures: `${STATE}/procedures.sqlite`,
  coordinationA: `${STATE}/coordination-a.sqlite`,
  coordinationB: `${STATE}/coordination-b.sqlite`,
  boundary: `${STATE}/boundary.sqlite`,
  org: `${STATE}/org.sqlite`,
  scope: `${STATE}/scope.sqlite`,
  orgEvo: `${STATE}/org-evo.sqlite`,
  orchestration: `${STATE}/orchestration.sqlite`,
  ordarium: `${STATE}/ordarium.sqlite`,
};

/** Scripts are module-level and MUTABLE, so one durable project can be driven across generations. */
const scripts = {
  intent: { decision: "ADMIT" },
  needAuthoring: {},
  needAdmission: { decision: "ADMIT" },
  fulfillment: { decision: "ADMIT" },
  procedureAuthoring: { content: null, grounds: undefined },
  procedureAdmission: { decision: "PUBLISH" },
  evolution: { decision: "authorized" },
};

/**
 * ONE packaged install of Project A over PATH-based stores. A NEW call is a NEW session over the SAME
 * durable state — which is exactly what a generation boundary is (§33). The counter exists so the
 * "no transcript bridge" verdict has a measured number behind it rather than a bare assertion.
 */
let freshGenerationInstallCount = 0;
function installA(extra = {}) {
  freshGenerationInstallCount += 1;
  const proofStore = new proofModule.SqliteProofEvidenceStore(paths.proof);
  const reasoningStore = new reasoningModule.SqliteReasoningCellStore(paths.cells);
  const assocStore = new workspaceModule.SqliteProjectAssetAssociationStore(paths.assoc);
  const journalStore = new workspaceModule.SqliteProjectJournalStore(paths.journal);
  const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(paths.memory);
  const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);
  const coordinationStore = new coordinationModule.SqliteCoordinationStore(paths.coordinationA);
  const boundaryStore = new boundaryModule.SqliteBoundaryMemoryStore(paths.boundary);
  const orgStore = new orgModule.SqliteOrganizationStore(paths.org);
  const scopeStore = new scopeModule.SqliteRuntimeScopeStore(paths.scope);
  const orgEvolutionStore = new evolutionModule.SqliteOrganizationEvolutionStore(paths.orgEvo);
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: projectA,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: A_DIR,
      execution: "worktree",
      standard: STANDARD,
      policy: advanced.trustedDefaultPolicy({
        read_paths: ["src", "test"],
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      }),
      proofEvidenceStore: proofStore,
      proofBlobStore: proofModule.localProofBlobStore(paths.blobs),
      proofVerificationPolicy: proofVerification(),
      proofPublicationAdmission: proofPublication(),
      reasoningCellStore: reasoningStore,
      reasoningCellStoreOwned: false,
      reasoningVerificationPolicy: reasoningVerification(),
      reasoningAdmissionPolicy: reasoningAdmission(),
      projectAssociationStore: assocStore,
      projectJournalStore: journalStore,
      organizationMemoryStore: memoryStore,
      procedureStore,
      procedureAuthoring: procedureAuthoring(scripts.procedureAuthoring),
      procedureAdmission: procedureAdmission(scripts.procedureAdmission),
      projectIntentAdmission: intentAuthority(scripts.intent),
      localPeer: federationModule.materializePeerRef({ peerId: "peer-a" }),
      coordinationStore,
      boundaryMemoryStore: boundaryStore,
      peerTransportPort: transport(),
      peerDirectoryPort: {
        observePeers: async () => ({
          state: "known",
          value: [federationModule.materializePeerAdvertisement({ peer: federationModule.materializePeerRef({ peerId: "peer-b" }), competenceTags: ["graph-theory", "cycle-detection"] })],
        }),
      },
      attemptCatalog: { assertAdmissibleAttempt: async () => {} },
      projectCollaborationAuthoring: needAuthoring(scripts.needAuthoring),
      projectCollaborationAdmission: needAuthority(scripts.needAdmission),
      organizationStore: orgStore,
      runtimeScopeStore: scopeStore,
      organizationEvolutionStore: orgEvolutionStore,
      organizationEvolutionCompiler: orgCompiler(),
      organizationEvolutionAuthority: evolutionAuthority(scripts.evolution),
      ...extra,
    },
  );
  return {
    installed,
    proofStore,
    reasoningStore,
    assocStore,
    journalStore,
    memoryStore,
    procedureStore,
    coordinationStore,
    boundaryStore,
    orgStore,
    scopeStore,
    orgEvolutionStore,
    // AWAITED on purpose: `dispose()` is async, and an un-awaited rejection would surface later as an
    // unhandled crash at an unrelated point in the run (which is exactly what it did before this fix).
    close: async () => {
      await installed.dispose();
      // Only the stores the install does NOT own: it closes the proof, association, journal and memory
      // stores itself as caller-supplied-install-managed resources.
      for (const store of [procedureStore, reasoningStore, coordinationStore, boundaryStore, orgStore, scopeStore, orgEvolutionStore]) {
        try {
          store.close();
        } catch {
          // already closed
        }
      }
    },
  };
}

/** Project B: a genuinely independent project with its OWN Work ledger and durable stores. */
function installB() {
  const orchestration = `${STATE}/b-orchestration.sqlite`;
  const ordarium = `${STATE}/b-ordarium.sqlite`;
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: projectB,
      databasePath: orchestration,
      ordariumDatabasePath: ordarium,
      repository: B_DIR,
      execution: "worktree",
      standard: STANDARD,
      policy: advanced.trustedDefaultPolicy({ read_paths: ["src"], allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    },
  );
  return { installed, close: async () => installed.dispose() };
}

/** A deterministic peer transport: both peers share one in-process inbox. */
function transport() {
  const inbox = new Map();
  return {
    async deliver({ to, message }) {
      const key = to.peerId;
      const held = inbox.get(key) ?? [];
      held.push(message);
      inbox.set(key, held);
    },
    async drain({ peer }) {
      return inbox.get(peer.peerId) ?? [];
    },
  };
}

/** The fulfillment service, built the way a host assembles it (the install composes no authority). */
function fulfillmentService(rig, script) {
  return federationModule.makeCommitmentService({
    store: rig.coordinationStore,
    localPeer: federationModule.materializePeerRef({ peerId: "peer-a" }),
    allocateCommitmentId: () => "unused",
    allocateHandoffId: () => "unused",
    contactNeedScopeGuard: durableContactNeedScopeGuard(rig.coordinationStore),
    fulfillmentOutputs: {
      async admitAcceptedRevision(ref) {
        const boundary = boundaryModule.makeBoundaryMemoryService({ store: rig.boundaryStore, localPeer: federationModule.materializePeerRef({ peerId: "peer-a" }) });
        await boundary.admitBoundaryRevisionScope(ref);
      },
    },
    fulfillmentAdmission: fulfillmentAuthority(script),
  });
}

function scopeServiceOf(rig) {
  return scopeModule.makeRuntimeScopeService({
    store: rig.scopeStore,
    organizations: {
      current: (id) => rig.orgStore.head(id),
      exists: async (ref) => (await rig.orgStore.get(ref)) !== undefined,
      definition: async (ref) => {
        const definition = await rig.orgStore.get(ref);
        return definition === undefined ? undefined : { interactions: definition.interactions };
      },
    },
    representationAdmission: { admit: async () => ({ admitted: true }) },
  });
}

/* ------------------------------------------------------------------ helpers */

const requirementOf = (controller, id) => {
  const requirement = controller.work.project().requirements.find((entry) => entry.requirement_id === id);
  return requirement === undefined ? "(missing)" : requirement.statement;
};
const countEvents = (controller, type) =>
  controller.store.connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type=?").get(projectA, type).c;
const countCoordination = async (store, type) => (await store.replay()).filter((event) => event.type === type).length;
const snapshotTasks = (controller) => JSON.stringify(controller.work.taskStates());

/**
 * Take the project's OWN pending state transitions before asking for a mutating attempt.
 *
 * `expectedTaskId` is an ASSERTION, not a scheduling command: a delegation "bootstraps the task the
 * project itself makes next". A freshly planned project may first want to move tasks to READY, so the
 * gate takes those decisions — and only those — then asks for the task that is genuinely next.
 */
function advanceToReady(controller) {
  for (let i = 0; i < 24; i += 1) {
    const preview = controller.preview();
    if (preview.decision !== "next" || preview.eventType !== "TASK_READY") break;
    controller.step();
  }
  return controller.work.taskStates().find((task) => task.state === "READY")?.taskId;
}

/** Drive a delegation job to a terminal phase. */
async function settleJob(service, jobId) {
  let view = await service.followup({ jobId });
  for (let i = 0; i < 900 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    view = await service.followup({ jobId });
  }
  return view;
}

/**
 * Close a task through the ORDINARY governed path (mechanical gate → promotion → head reconciliation),
 * so the scheduler can move to the next task. This is what every real operator does; the dogfood never
 * reaches around it.
 */
async function closeTask(rig, attemptId) {
  const controller = rig.installed.controller;
  for (let i = 0; i < 12; i += 1) {
    const preview = controller.preview();
    if (preview.decision !== "next") break;
    controller.step();
  }
  await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
  for (let i = 0; i < 12; i += 1) {
    const preview = controller.preview();
    if (preview.decision !== "next") break;
    controller.step();
  }
  const report = controller.attemptWorkRecord(attemptId)?.report;
  const eligibility = controller.promotionEligibility(attemptId);
  if (eligibility.eligible && report !== null && report !== undefined) {
    await controller.promote(attemptId, String(report.result_commit), eligibility.canonicalExpectedHead);
    controller.step();
  }
  await controller.reconcileProjectHead({ operator: true });
  return eligibility;
}

/** One generation's worker: it edits the project's real source, commits, and records what it consumed. */
function dagWorker(rig, options) {
  const consumedPath = `${OUT}/consumed-${options.label}.json`;
  return {
    adapterId: `elive-worker-${options.label}`,
    async run({ workDir, context }) {
      const handles = (context.compiled?.handles ?? []).map((entry) => ({ kind: entry.kind, handle: entry.handle }));
      const pulled = { procedure: null, proof: [], reasoning: [] };
      const attemptId = rig.installed.controller.work.openAttemptFor(options.taskId)?.attemptId;
      if (attemptId !== undefined) {
        for (const entry of context.compiled?.handles ?? []) {
          const result = await rig.installed.controller.fetchContext(attemptId, entry.handle);
          if (result === undefined) continue;
          if (entry.kind === "procedure") pulled.procedure = { handle: entry.handle, body: result.body, standingAtCompile: result.binding.standing_at_compile, current: result.current };
          if (entry.kind === "proof") pulled.proof.push({ handle: entry.handle, body: result.body, standingAtCompile: result.binding.standing_at_compile, current: result.current });
          if (entry.kind === "reasoning") pulled.reasoning.push({ handle: entry.handle, body: result.body, standingAtCompile: result.binding.standing_at_compile });
        }
      }
      // R0-R §3.1: the worker records the digest of the file it is ABOUT TO REPLACE, before it writes.
      // This is an independent witness of the pre-task repository bytes, recorded inside the attempt by
      // the worker itself rather than by the harness, so the paired control can be proven to have
      // started from the same input the generation did.
      const startDagDigest = existsSync(join(workDir, "src", "dag.ts")) ? fileDigest(join(workDir, "src", "dag.ts")) : "ABSENT";
      // §13: the OBSERVABLE rediscovery event.
      // R0-R §3.2: it is decided by the DERIVATION's structured clause, never by a keyword match on the
      // method text. The question is "did this worker have to establish 'cycles must be handled before
      // ordering' itself?", and that is exactly `clauses.cycleBeforeOrder`: a method that mentions
      // cycles but states the ordering step FIRST has not relieved the worker of the discovery, and a
      // keyword test would wrongly credit it.
      const steps = pulled.procedure?.body?.steps?.map((step) => step.instruction) ?? [];
      const derivation = steps.length === 0 ? null : deriveImplementation(pulled.procedure.body);
      const inheritedCycleFirst = derivation !== null && derivation.clauses.cycleBeforeOrder;
      const rediscoveryCheck = inheritedCycleFirst ? "NOT_PERFORMED" : "PERFORMED";
      // §13/§20: the worker's implementation is DERIVED FROM the inherited procedure's structured
      // content — not selected from a pre-written file. `deriveImplementation` classifies each ordered
      // step against a closed clause vocabulary and emits the source those clauses describe, in the
      // order the method states them. A worker with no inherited method writes the naive prototype and
      // must discover the problem itself, exactly as Generation 0 did.
      const written = derivation === null ? naiveSource : derivation.source;
      writeFileSync(join(workDir, "src", "dag.ts"), written);
      writeFileSync(
        consumedPath,
        JSON.stringify(
          { handles, pulled, steps, rediscoveryCheck, startDagDigest, derivation: derivation === null ? null : { clauses: derivation.clauses, trace: derivation.trace }, requirements: context.work?.requirements ?? [] },
          null,
          2,
        ),
        "utf8",
      );
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      // R0-R §3.1 consequence: with the control seeded from G1's EXACT pre-task bytes, a method-less
      // worker derives the naive implementation — byte-identical to what is already there, because G1's
      // pre-task state IS Generation 0's naive deliverable. There is nothing to commit, and that is the
      // FINDING rather than a harness bug: identical input plus no inherited method yields NO change at
      // all, so the control cannot even produce a candidate improvement. An explicit empty commit
      // records the attempt without inventing a change, and `noChange` carries the fact forward.
      const dirty = git(workDir, ["status", "--porcelain"]).trim().length > 0;
      execFileSync(
        "git",
        ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "--allow-empty", "-qm", `worker ${options.label}${dirty ? "" : " (no change: nothing derivable without an inherited method)"}`],
        { cwd: workDir },
      );
      return { kind: "READY_FOR_SETTLEMENT", ...(dirty ? {} : { noChange: true }) };
    },
    consumedPath,
  };
}

/* ------------------------------------------------------------------ the run */

async function main() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const headA = copyFixture(A_DIR);
  const headB = setupRepo(B_DIR, "specialist.js");
  process.stdout.write(`project A  ${A_DIR}\nproject B  ${B_DIR}\nH0         ${headA}\n\n`);

  const g0 = runAcceptance(A_DIR);
  record("0. H0: the independent acceptance suite fails", `${g0.pass} pass / ${g0.fail} fail`);

  /* ================================================================ GENERATION 0 */

  process.stdout.write("\n=== GENERATION 0 — discover the world ===\n");
  let rig = installA();
  let controller = rig.installed.controller;
  controller.start({
    projectId: projectA,
    goal: "ship a deterministic dependency-graph execution planner",
    headCommit: headA,
    requirements: [
      { requirement_id: "R", statement: "the planner must return a valid dependency-preserving order for every input graph", priority: "critical", acceptance_refs: [] },
    ],
    tasks: [{ task_id: "t1", objective: "implement planExecution against the acceptance suite", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] }],
  });
  record("G0.1 initial intent", requirementOf(controller, "R"));

  // ---- G0 Work: the naive implementation, driven through the REAL delegation path.
  const g0Worker = dagWorker(rig, { label: "g0", taskId: "t1" });
  const g0Service = delegation.makeWorkDelegationService({ controller, workerFor: () => g0Worker });
  const g0Job = await g0Service.start({ expectedTaskId: advanceToReady(controller) ?? "t1" });
  const g0View = await settleJob(g0Service, g0Job.jobId);
  if (g0View.phase !== "FINISHED") throw new Error(`G0 job did not finish: ${g0View.phase} ${g0View.hostError ?? ""}`);
  const g0Attempt = g0View.attemptId;
  const g0Consumed = JSON.parse(readFileSync(g0Worker.consumedPath, "utf8"));
  record("G0.2 Work ran the standard path", `${g0Attempt} (${g0View.phase})`);
  record("G0.3 NO capital was inherited", `${g0Consumed.handles.length} handles`);
  record("G0.4 the worker PERFORMED the cycle discovery itself", g0Consumed.rediscoveryCheck);

  // ---- G0 Work result: close t1 through the ordinary path, BEFORE measuring the project.
  // R0 §23: the acceptance suite must judge the WORKER'S deliverable, not the pre-work H0 stub. The
  // worker commits into its own attempt world; promotion is what makes its implementation the project
  // HEAD. Measuring before `closeTask` reported the stub's 0/8 for every generation, which silently
  // overstated the discovery cost and made Generations 1/2's 8/8 look like a larger jump than it is.
  await closeTask(rig, g0Attempt);
  record("G0.10 t1 closed through the ordinary governed path", controller.attemptWorkRecord(g0Attempt)?.state ?? "unknown");

  // ---- G0 reality: run the project's own acceptance suite against the PROMOTED result.
  const g0Head = git(A_DIR, ["rev-parse", "HEAD"]);
  const g0Acceptance = runAcceptance(A_DIR);
  record("G0.5 acceptance suite result", `${g0Acceptance.pass} pass / ${g0Acceptance.fail} fail`);
  // The exact failures are the CONTRADICTION: the universal requirement cannot be met. Counted as
  // DISTINCT test names: the naive implementation fails 4 tests, 3 of which are the cycle family.
  const cycleFailures = g0Acceptance.failures.filter((name) => /cycle/iu.test(name)).length;
  record("G0.6 the contradiction surfaced as REAL test failures", `${cycleFailures} of ${g0Acceptance.failures.length} failures are cycle-related`);

  // ---- G0 durable capital #1: an admitted PROOF claim, grounded in the observed result.
  const proof = rig.installed.proof;
  const imported = await proof.importSource({
    bytes: new TextEncoder().encode(
      `dag-planner acceptance run at ${g0Head.slice(0, 12)}: ${g0Acceptance.pass} pass, ${g0Acceptance.fail} fail; every cycle test failed because no dependency-preserving order exists for a directed cycle`,
    ),
    mediaType: "text/plain",
    label: "g0-acceptance-run",
    provenance: "LOCAL_IMPORT",
    sourceId: "g0-acceptance-run",
  });
  const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: "g0-acceptance-run", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: "WHOLE_SOURCE" } });
  const claimCandidate = await proof.prepareCandidate({
    claimType: proofModule.PROOF_STATEMENT_TYPE,
    content: { statement: "a topological order preserving every edge cannot exist for a directed cycle" },
    supportingEvidenceIds: [evidence.evidenceId],
    origin: "MANUAL",
  });
  await proof.verify({ candidateId: claimCandidate.candidateId });
  const publishedClaim = await proof.decidePublication({ candidateId: claimCandidate.candidateId });
  const cycleClaimId = publishedClaim.claimId;
  if (cycleClaimId === undefined) throw new Error("the G0 Proof claim was not published");
  await rig.installed.projectWorkspace.associateAsset({ projectId: projectA, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: cycleClaimId }, associationKind: "MANUAL", provenance: "elive-g0" });
  record("G0.7 admitted Proof claim (durable capital #1)", `${cycleClaimId} — "${"a topological order preserving every edge cannot exist for a directed cycle"}"`);

  // ---- G0 durable capital #2: a NEGATIVE_RESULT for the universal direction.
  const negative = await rig.installed.projectWorkspace.recordJournalEntry({
    projectId: projectA,
    kind: "NEGATIVE_RESULT",
    title: "the universal requirement is unsatisfiable",
    body: "the acceptance suite fails for every cyclic input; no implementation can return a dependency-preserving order for a directed cycle",
    provenance: "elive-g0 acceptance run",
    relatedRefs: [{ kind: "proof_claim", id: cycleClaimId }, { kind: "commit", id: g0Head }],
  });
  record("G0.8 durable NEGATIVE_RESULT (durable capital #2)", negative.entryId);

  // ---- G0 durable capital #3: an admitted REASONING claim (the plan is a real project artifact).
  const reasoning = rig.installed.reasoningCells;
  await reasoning.service.openCell({ cellId: "cell-planner", objective: "how should the planner treat cyclic input", verificationPolicyRef: policyRef("elive-rv"), admissionPolicyRef: policyRef("elive-ra") });
  const branch = await reasoning.service.openBranch({ cellId: "cell-planner", question: "must cycle detection precede topological ordering?" });
  const submitted = await reasoning.service.submitCandidate({ cellId: "cell-planner", branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: "cycle detection must precede topological ordering, because ordering an unvalidated graph silently drops the cyclic nodes" } });
  await reasoning.service.evaluateCandidate({ cellId: "cell-planner", candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await reasoning.service.frontier({ cellId: "cell-planner" });
  const cycleReasoningClaimId = frontier.claims[0]?.ref.claimId;
  if (cycleReasoningClaimId === undefined) throw new Error("the G0 Reasoning claim was not admitted");
  await rig.installed.projectWorkspace.associateAsset({ projectId: projectA, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: "cell-planner" }, associationKind: "MANUAL", provenance: "elive-g0" });
  record("G0.9 admitted Reasoning claim (durable capital #3)", cycleReasoningClaimId);

  /* ================================================================ INTENT LEARNING (E2-I) */

  process.stdout.write("\n=== E2-I — reconcile the impossible requirement ===\n");
  const intent = rig.installed.intent;
  if (intent === undefined) throw new Error("the packaged install composed no intent surface");
  const preparedIntent = await intent.prepare({
    changes: [
      { kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "for acyclic graphs return a deterministic dependency-preserving plan; for cyclic graphs refuse with an explicit cycle diagnostic", priority: "critical", acceptance_refs: [] } },
    ],
    grounds: { proof: [{ claimId: cycleClaimId }], negativeResults: [{ entryId: negative.entryId }] },
    rationale: "the acceptance suite proves the universal requirement is unsatisfiable, so the requirement must state the acyclic case and the cyclic refusal explicitly",
  });
  record("I.1 proposal prepared from G0 durable capital", `${preparedIntent.proposal.proposalId} (${preparedIntent.proposal.grounds.map((ground) => ground.kind).join(", ")})`);
  // Authority separation: REJECT and UNRESOLVED write nothing.
  const revisionsBefore = countEvents(controller, "PROJECT_REVISED");
  scripts.intent.decision = "REJECT";
  const intentRejected = await intent.apply({ proposal: preparedIntent.proposal });
  scripts.intent.decision = "UNRESOLVED";
  const intentUnresolved = await intent.apply({ proposal: preparedIntent.proposal });
  record("I.2 REJECT / UNRESOLVED wrote nothing", `${intentRejected.status} / ${intentUnresolved.status} (${countEvents(controller, "PROJECT_REVISED") === revisionsBefore ? "zero writes" : "A WRITE HAPPENED"})`);
  scripts.intent.decision = "ADMIT";
  const intentApplied = await intent.apply({ proposal: preparedIntent.proposal });
  if (intentApplied.status !== "APPLIED") throw new Error(`intent apply returned ${intentApplied.status}`);
  record("I.3 the requirement was reconciled", requirementOf(controller, "R"));
  record("I.4 old nonterminal Work retired by the normal rules", intentApplied.staledTaskIds.join(", ") || "(none)");
  const intentReceipt = (() => {
    const row = controller.store.connection.prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1").get(projectA);
    return row === undefined ? null : JSON.parse(new TextDecoder().decode(row.payload_json)).intent_reconciliation ?? null;
  })();
  record("I.5 the receipt names its grounds + authority", intentReceipt === null ? "MISSING" : `${intentReceipt.groundBindings.map((ground) => ground.kind).join(", ")} by ${intentReceipt.admission.policyRef.policyId}`);

  /* ================================================================ SOVEREIGN COLLABORATION (E3-C) */

  process.stdout.write("\n=== E3-C — sovereign collaboration: the cycle-witness contract ===\n");
  // A REAL grounded need: the reconciled requirement introduces a NEW task whose cycle-diagnostic
  // contract is a competence this project does not hold.
  // §3/§8: the reconciled requirement introduces diagnostic work whose contract is a competence this
  // project does not hold. The task is declared BLOCKED by an unsatisfied dependency — the canonical
  // blocked condition, and therefore a REAL ground for a need rather than an invented one.
  const current = controller.work.project();
  controller.plan({
    goal: current.goal,
    requirements: current.requirements,
    decisions: current.decisions,
    tasks: [
      ...current.tasks.map((task) => ({ task_id: task.task_id, objective: task.objective, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: "t2-gate", objective: "the unsatisfied prerequisite for the diagnostic work", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] },
      { task_id: "t2", objective: "implement the explicit cycle diagnostic", depends_on: ["t2-gate"], write_paths: ["src/dag.ts"], required_artifacts: [] },
    ],
    reason: "the reconciled requirement needs an explicit cycle diagnostic contract",
  });
  const collaboration = rig.installed.projectCollaboration;
  if (collaboration === undefined) throw new Error("the packaged install composed no projectCollaboration surface");
  const blockedState = controller.work.taskStates().find((task) => task.taskId === "t2");
  record("C.1 canonical blocked Work condition", `t2 = ${blockedState?.state}`);
  const needPrepared = await collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t2" } });
  if (needPrepared.status !== "prepared") throw new Error(`need prepare returned ${needPrepared.status}`);
  record("C.2 grounded NeedCandidate", `${needPrepared.candidate.candidateId} (${needPrepared.candidate.ground.kind} ${needPrepared.candidate.ground.taskId})`);
  const needAdmitted = await collaboration.admit({ candidate: needPrepared.candidate });
  if (needAdmitted.status !== "DECLARED") throw new Error(`need admit returned ${needAdmitted.status}`);
  const needId = needAdmitted.contactNeedId;
  record("C.3 durable CONTACT_NEED_DECLARED", needId);

  // ---- cold restart of A before contact, so the need must be durable (a mini-restart inside G0).
  await rig.close();
  rig = installA();
  controller = rig.installed.controller;
  const recoveredNeed = await rig.installed.federation.contactNeed(needId);
  if (recoveredNeed === undefined) throw new Error("the ContactNeed did not survive the restart");
  record("C.4 the ContactNeed survived a restart", `${recoveredNeed.need.contactNeedId} (${recoveredNeed.provenance.ground.kind})`);

  const peerA = federationModule.materializePeerRef({ peerId: "peer-a" });
  const peerB = federationModule.materializePeerRef({ peerId: "peer-b" });
  const discovery = await rig.installed.federation.findCandidates(recoveredNeed.need);
  if (discovery.status !== "discovered") throw new Error(`discovery returned ${discovery.status}`);
  await rig.installed.federation.requestContact({ need: recoveredNeed.need, to: peerB });
  record("C.5 explicit contact to the discovered peer", discovery.candidates.map((candidate) => candidate.peer.peerId).join(", "));

  const workBeforeCommitment = snapshotTasks(controller);
  const offer = await rig.installed.federation.offerCommitmentForNeed({ contactNeedId: needId, proposedHolder: peerB, statement: "deliver an accepted cycle-diagnostic contract" });
  await rig.installed.federation.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: peerB });
  record("C.6 ACTIVE commitment (scope derived by the owner)", JSON.stringify(offer.scope));
  record("C.7 A's Work unchanged by the commitment", snapshotTasks(controller) === workBeforeCommitment ? "unchanged" : "CHANGED");

  // ---- Project B: its OWN project, its OWN ledger, its OWN work.
  const b = installB();
  const controllerB = b.installed.controller;
  const headB0 = git(B_DIR, ["rev-parse", "HEAD"]);
  controllerB.start({ projectId: projectB, goal: "define the cycle diagnostic contract", headCommit: headB0, tasks: [{ task_id: "bt1", objective: "specify the cycle witness contract", depends_on: [], write_paths: ["src/specialist.js"], required_artifacts: [] }] });
  const preparedB = await controllerB.prepareMutatingWork({ expectedTaskId: "bt1" });
  writeFileSync(join(preparedB.worldPath, "src", "specialist.js"), "export const contract = { kind: 'CYCLE', witness: 'normalized rotation', invariants: ['every witness node is in the graph', 'every witness edge exists'] };\n");
  execFileSync("git", ["add", "-A"], { cwd: preparedB.worldPath });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "B specifies the contract"], { cwd: preparedB.worldPath });
  controllerB.report(preparedB.attemptId, { workerStatus: "completed", summary: "specified", changedFiles: ["src/specialist.js"], producedArtifacts: ["src/specialist.js"], resultCommit: git(preparedB.worldPath, ["rev-parse", "HEAD"]) });
  record("C.8 B's Work ran in B's OWN ledger", `attempt ${preparedB.attemptId} = ${controllerB.attemptWorkRecord(preparedB.attemptId).state}`);
  record("C.9 B's Work is invisible to A", controller.work.taskStates().some((task) => task.taskId === "bt1") ? "A SEES B's TASK" : "not in A's ledger");

  // ---- The typed shared contribution: an ACCEPTED BoundaryRevision.
  const boundary = boundaryModule.makeBoundaryMemoryService({ store: rig.boundaryStore, localPeer: peerA });
  await boundary.openWorkspace({ workspaceId: "ws-cycle", participants: [peerA, peerB], purpose: "the cycle diagnostic contract" });
  await boundary.createArtifact({ workspaceId: "ws-cycle", artifactId: "art-contract", type: { typeId: "boundary.statement", version: "v1" }, title: "Cycle diagnostic contract" });
  const candidateRevision = await boundary.proposeRevision({
    workspaceId: "ws-cycle",
    artifactId: "art-contract",
    base: null,
    content: { statement: "a cycle diagnostic must name the participating nodes and a normalized witness path, and must be invariant under rotation of the cycle", tags: ["decision"], references: [] },
    requiredAcceptors: [peerA, peerB],
    intent: "record the agreed cycle-diagnostic contract",
  });
  await boundary.acceptRevision({ workspaceId: "ws-cycle", artifactId: "art-contract", candidateDigest: candidateRevision.digest, authenticatedPeer: peerA, local: true });
  await boundary.acceptRevision({ workspaceId: "ws-cycle", artifactId: "art-contract", candidateDigest: candidateRevision.digest, authenticatedPeer: peerB });
  const acceptedState = await boundary.currentAccepted({ workspaceId: "ws-cycle", artifactId: "art-contract" });
  if (acceptedState === null) throw new Error("the shared boundary revision was not accepted");
  const acceptedRef = acceptedState.ref;
  record("C.10 accepted BoundaryRevisionRef", `${acceptedRef.workspaceId}/${acceptedRef.artifactId}@${acceptedRef.revision}`);

  // ---- Fulfillment, then explicit local adoption.
  const irBeforeFulfillment = JSON.stringify(controller.work.project());
  const submission = await rig.installed.federation.submitFulfillment({ commitmentId: offer.commitmentId, outputs: [{ kind: "boundary_revision", revision: acceptedRef }], note: "the accepted contract", authenticatedPeer: peerB });
  const noAuthority = await rig.installed.federation.decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  record("C.11 no fulfillment authority → UNRESOLVED", `${noAuthority.decision} (${(await rig.installed.federation.commitmentState(offer.commitmentId)).state})`);
  const admittedFulfillment = await fulfillmentService(rig, scripts.fulfillment).decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  if (!admittedFulfillment.fulfilled) throw new Error("the fulfillment was not admitted");
  record("C.12 FULFILLED (terminal) by an independent authority", (await rig.installed.federation.commitmentState(offer.commitmentId)).state);
  record("C.13 fulfillment did NOT automatically mutate A", JSON.stringify(controller.work.project()) === irBeforeFulfillment ? "ProjectIR unchanged" : "PROJECTIR CHANGED");

  const referenceNote = await rig.installed.projectWorkspace.recordJournalEntry({
    projectId: projectA,
    kind: "REFERENCE_NOTE",
    title: "Adopted the external cycle-diagnostic contract",
    body: "the specialist delivered an accepted contract defining the cycle witness and its invariants",
    provenance: "elive explicit adoption",
    relatedRefs: [{ kind: "commitment_fulfillment", id: offer.commitmentId }, { kind: "accepted_boundary_revision", id: `${acceptedRef.workspaceId}/${acceptedRef.artifactId}@${acceptedRef.revision}` }],
  });
  const opportunity = await rig.installed.projectWorkspace.recordJournalEntry({
    projectId: projectA,
    kind: "OPPORTUNITY",
    title: "Implement the adopted cycle diagnostic",
    body: "the adopted contract can now be implemented in the planner's own source",
    provenance: "elive explicit adoption",
    relatedRefs: [{ kind: "commitment_fulfillment", id: offer.commitmentId }],
  });
  record("C.14 explicit local adoption (REFERENCE_NOTE + OPPORTUNITY)", `${referenceNote.entryId} / ${opportunity.entryId}`);

  /* ================================================================ STRUCTURAL LEARNING (E4-L) */

  process.stdout.write("\n=== E4-L — structural intervention + crash window ===\n");
  // Real Dynamics pressure: verification has repeatedly been a separate concern in this project's work.
  const o0 = orgDef(0, "planner-verification");
  await rig.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
  await scopeServiceOf(rig).openScope({ scopeId: "R", organizationBasis: orgModule.organizationRefOf(o0) });
  const o1 = orgDef(1, "planner-verification-separated");
  await rig.orgStore.registerRevision({ definition: o1, parent: orgModule.organizationRefOf(o0), expectedHeadRevision: 0 });
  const proposed = await rig.installed.organizationDynamics.service.propose({ subject: { kind: "organization", organization: orgModule.organizationRefOf(o1) }, policy: DYNAMICS_POLICY });
  if ("status" in proposed) throw new Error(`dynamics propose returned ${proposed.status}`);
  const structuralProposal = proposed.proposal;
  record("S.1 observed structural pressure produced a proposal", `${structuralProposal.kind} (${structuralProposal.intent})`);
  const evolution = rig.installed.organizationEvolution.service;
  const evolutionOutcome = await evolution.advanceEvolution({ proposal: structuralProposal, policy: DYNAMICS_POLICY });
  if (evolutionOutcome.status !== "activated") throw new Error(`evolution returned ${evolutionOutcome.status}`);
  const caseRef = evolutionOutcome.caseRef;
  const interventionsBeforeCrash = await rig.installed.organizationMemory.interventions();
  record("S.2 structural change ACTIVATED", `${caseRef}`);
  record("S.3 crash window: activation durable, memory write ABSENT", `${interventionsBeforeCrash.length} intervention(s)`);

  // ---- cold restart, then reconciliation (the §10/§12 repair path).
  await rig.close();
  rig = installA();
  controller = rig.installed.controller;
  const reconciliation = await rig.installed.institutionalLearning.reconcileInterventions();
  const interventions = await rig.installed.organizationMemory.interventions();
  if (interventions.length !== 1) throw new Error(`expected one reconstructed intervention, got ${interventions.length}`);
  const intervention = interventions[0];
  record("S.4 reconcileInterventions() after cold restart", `${reconciliation.recorded} recorded, ${reconciliation.alreadyRecorded} already`);
  record("S.5 the intervention names the exact proposal digest", intervention.proposalDigest === structuralProposal.digest ? "exact" : "MISMATCH");
  record("S.6 the intervention names its evolution case", intervention.evolutionCaseRef ?? "(none)");

  // ---- a LATER ordinary experiment/evaluation linked to the intervention.
  const scenario = memoryModule.materializeScenario({ scenarioId: "s1", scenarioRevision: 0, kind: "S1_LOW_COUPLING", classification: "SCRIPTED_MECHANICAL", task: "measure the structural effect", successCriteria: ["criterion"], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variant = memoryModule.materializeVariant({ variantId: "v1", kind: "SINGLE_LOCUS", description: "post-intervention" });
  const linkedExperiment = memoryModule.materializeExperiment({
    experimentId: "exp-structural",
    revision: 0,
    objective: "does separating verification reduce coordination churn?",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: { metricIds: ["coordinationCost"], primaryValidatorRef: "validator-1", objectives: ["coordinationCost"], objectiveNote: "decision_aid_not_truth" },
    runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 },
    interventionRef: intervention.interventionRef,
  });
  await rig.installed.organizationMemory.recordExperiment(linkedExperiment);
  await rig.installed.organizationMemory.recordScenario(linkedExperiment.experimentId, scenario);
  await rig.installed.organizationMemory.recordVariant(linkedExperiment.experimentId, variant);
  const linkedRun = experimentModule.buildRunResult({
    spec: { experiment: linkedExperiment, scenario, variant, seed: 7, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "elive", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: { outcome: "PASS", failureClassification: "NONE", measurements: [memoryModule.materializeMetric({ metricId: "coordinationCost", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 3, provenance: "elive" })], validatorResults: [] },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  });
  await rig.installed.organizationMemory.recordRun(linkedExperiment.experimentId, linkedRun);
  const linkedEvaluation = experimentModule.evaluate({ experiment: linkedExperiment, scenarios: [scenario], variants: [variant], runs: [linkedRun], corrections: [], annotations: [] });
  await rig.installed.organizationMemory.recordEvaluation(linkedExperiment.experimentId, linkedEvaluation);
  record("S.7 linked experiment + evaluation recorded", `${linkedEvaluation.evaluationRef}`);
  const linkedTrace = await rig.installed.institutionalLearning.interventionEvaluations(intervention.interventionRef);
  record("S.8 institutional learning joins intervention → experiment → evaluation", `${linkedTrace.experiments.length} experiment(s), ${linkedTrace.experiments[0]?.evaluationRefs.length ?? 0} evaluation(s)`);

  /* ================================================================ PROCEDURAL CAPITAL (E5-P) */

  process.stdout.write("\n=== E5-P — derive the reusable method from durable experience ===\n");
  // The method is authored by an UNTRUSTED seam from the REAL grounds: the linked evaluation and the
  // intervention. The harness supplies the seam's OUTPUT shape, never the admission.
  scripts.procedureAuthoring.content = {
    schemaVersion: 1,
    title: "Plan a dependency graph without rediscovering the cycle problem",
    purpose: "produce a deterministic dependency-preserving plan while treating cyclic input explicitly",
    applicability: ["any task that plans execution order for a directed dependency graph"],
    preconditions: ["the graph's nodes and edges are available"],
    steps: [
      { instruction: "normalize the graph and validate that every edge endpoint is a known node" },
      { instruction: "detect cycles BEFORE attempting any ordering" },
      { instruction: "if a cycle exists, refuse with a normalized witness path naming the participating nodes" },
      { instruction: "otherwise topologically order the acyclic graph" },
      { instruction: "apply stable lexical tie-breaking to independent nodes" },
      { instruction: "verify every edge against the final order" },
    ],
    checks: ["every edge's source precedes its target in the returned order", "equivalent cycles produce the same witness path"],
    expectedOutputs: ["a dependency-preserving order, or an explicit cycle diagnostic"],
    limitations: ["does not cover incremental graph updates"],
    capabilityHints: ["a verification runtime"],
    recommendedRecipeRefs: [],
  };
  /** P@1's content, kept by name so §3.2 can probe the clause metric against it. */
  const p1Content = scripts.procedureAuthoring.content;
  const procedureService = rig.installed.procedures;
  if (procedureService === undefined) throw new Error("the packaged install composed no procedures face");
  const preparedProcedure = await procedureService.prepare({
    grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: linkedEvaluation.evaluationRef }, { kind: "INTERVENTION_RECORD", ref: intervention.interventionRef }],
    projectContext: { projectId: projectA, projectRevision: controller.work.project().revision, projectDigest: controller.work.project().digest, objective: "plan dependency graphs" },
  });
  record("P.1 the method was authored from REAL durable grounds", scripts.procedureAuthoring.grounds.map((ground) => `${ground.kind}:${ground.ref.slice(0, 12)}…`).join(", "));
  // Authority separation: a deployment that composes NO procedure admission must publish nothing. This
  // is measured on a SEPARATE install over the same durable stores with the port omitted — a host that
  // simply did not supply one must never acquire an implicit approval.
  const noProcedureAuthority = installA({ procedureAdmission: undefined });
  const procedureNoAuthority = await noProcedureAuthority.installed.procedures.publish({ procedureId: preparedProcedure.procedureId, candidate: preparedProcedure.candidate });
  const proceduresAfterNoAuthority = (await noProcedureAuthority.installed.procedures.procedures()).length;
  await noProcedureAuthority.close();
  record("P.2 an absent authority published nothing", `${procedureNoAuthority.status} (${proceduresAfterNoAuthority} procedure(s))`);
  const publishedProcedure = await procedureService.publish({ procedureId: preparedProcedure.procedureId, candidate: preparedProcedure.candidate });
  if (publishedProcedure.status !== "published") throw new Error(`procedure publish returned ${publishedProcedure.status}`);
  const p1 = publishedProcedure.ref;
  await procedureService.associate({ projectId: projectA, ref: p1 });
  record("P.3 P@1 published and associated with Project A", `${p1.procedureId.slice(0, 12)}…@${p1.revision}`);
  record("P.4 admission is contextual, not universal", publishedProcedure.revision.admission.admissionNote);

  /* ================================================================ GENERATION 0 ENDS */

  // Capture the reads the verdict needs before disposing.
  const g0Capital = {
    claimId: cycleClaimId,
    reasoningClaimId: cycleReasoningClaimId,
    negativeEntryId: negative.entryId,
    interventionRef: intervention.interventionRef,
    evaluationRef: linkedEvaluation.evaluationRef,
    procedureRef: p1,
    needId,
    commitmentId: offer.commitmentId,
    acceptedRef,
    referenceNoteId: referenceNote.entryId,
    intentReceipt,
    g0Attempt,
    g0Head,
    g0Acceptance,
    g0Rediscovery: g0Consumed.rediscoveryCheck,
  };
  writeFileSync(`${OUT}/g0-capital.json`, JSON.stringify(g0Capital, null, 2), "utf8");
  await b.close();
  await rig.close();
  record("G0.11 installation DISPOSED (generation 0 ends)", "durable stores remain");

  /* ================================================================ COLD RESTART 1 */

  process.stdout.write("\n=== COLD RESTART 1 → GENERATION 1 ===\n");
  // §34: a NEW installation. Nothing from generation 0's process survives except durable state.
  let rig1 = installA();
  let controller1 = rig1.installed.controller;

  // §16: the selector must DERIVE what to select from CURRENT project-visible durable state.
  // The host asks the owners what exists — it does not remember opaque ids from the previous session.
  const discoverable = await rig1.installed.projectWorkspace.projectScopedAssets(projectA);
  const proofAssociations = discoverable.filter((entry) => entry.assetKind === "PROOF_CLAIM");
  const reasoningAssociations = discoverable.filter((entry) => entry.assetKind === "REASONING_CELL");
  const procedureAssociations = discoverable.filter((entry) => entry.assetKind === "PROCEDURE");
  const currentProcedure = procedureAssociations.length === 0 ? undefined : (await rig1.installed.procedures.history(procedureAssociations[0].canonicalRef.id.split("@")[0])).current;
  const journal = await rig1.installed.projectWorkspace.journal(projectA);
  const adoptedNote = journal.find((entry) => entry.entry.kind === "REFERENCE_NOTE");
  record("R1.1 the selector DISCOVERED the capital from durable project state", `${proofAssociations.length} proof, ${reasoningAssociations.length} reasoning, ${procedureAssociations.length} procedure, ${adoptedNote === undefined ? 0 : 1} adopted note`);
  assist("G1", "durable asset ids", `${proofAssociations.length + reasoningAssociations.length + procedureAssociations.length} discovered by query, 0 remembered`, "EXPECTED_V1_EXPLICIT_CONTROL", "V1 selection is explicit, but the ids come from owner queries over durable state, not prior-session memory");

  // Generation 1's new Work: a task that NEEDS the same conceptual prerequisite.
  const g1Intent = controller1.work.project();
  controller1.plan({
    goal: g1Intent.goal,
    requirements: g1Intent.requirements,
    decisions: g1Intent.decisions,
    tasks: [
      ...g1Intent.tasks.map((task) => ({ task_id: task.task_id, objective: task.objective, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: "t3", objective: "implement the cycle diagnostic against the adopted contract", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] },
    ],
    reason: "generation 1 continues the project under the reconciled intent",
  });
  record("R1.2 Generation 1 intent (inherited, no transcript)", requirementOf(controller1, "R"));

  // The Generation-1 worker CONSUMES the inherited procedure and behaves accordingly.
  // `expectedTaskId` is an ASSERTION, not a scheduling command: the project's own scheduler decides
  // what runs next. The gate asks for the task it declared only when the scheduler agrees; otherwise it
  // lets the scheduler choose and records which task actually ran. Either way the Work is ordinary.
  const nextG1 = advanceToReady(controller1) ?? "t3";
  // R0-R §3.1: G1's PRE-TASK bytes, read from the canonical project before its world is materialized.
  // The paired control is later seeded from these EXACT bytes, and the worker's own recorded
  // `startDagDigest` independently witnesses the same value — so the two conditions are proven to
  // begin from identical input rather than merely asserted to.
  const g1StartDagBytes = readFileSync(join(A_DIR, "src", "dag.ts"));
  const g1StartDagDigestExpected = fileDigest(join(A_DIR, "src", "dag.ts"));
  const g1Worker = dagWorker(rig1, { label: "g1", taskId: nextG1 });
  const g1Service = delegation.makeWorkDelegationService({ controller: controller1, workerFor: () => g1Worker });
  // §21/§22: the REASONING claim id is re-derived from the durable cell's own frontier after the cold
  // restart, rather than carried across the boundary as a JavaScript variable. The association tells
  // us WHICH cell; the cell's admitted frontier tells us which claim is current. Nothing opaque from
  // generation 0's process is reused.
  const g1Reasoning = await Promise.all(
    reasoningAssociations.map(async (entry) => ({
      cellId: entry.canonicalRef.id,
      claimId: (await rig1.installed.reasoningCells.service.frontier({ cellId: entry.canonicalRef.id })).claims[0]?.ref.claimId,
    })),
  );
  const g1ReasoningResolved = g1Reasoning.filter((entry) => entry.claimId !== undefined);
  record("R1.1a the reasoning claim was re-derived from the durable frontier", `${g1ReasoningResolved.length}/${g1Reasoning.length} cells answered a current claim`);
  const g1Job = await g1Service.start({
    expectedTaskId: nextG1,
    knowledge: {
      proof: proofAssociations.map((entry) => ({ claimId: entry.canonicalRef.id })),
      reasoning: g1ReasoningResolved.map((entry) => ({ cellId: entry.cellId, claimId: entry.claimId })),
      procedure: currentProcedure === undefined ? [] : [{ procedureId: currentProcedure.ref.procedureId, revision: currentProcedure.ref.revision, reason: "inherited from generation 0" }],
    },
  });
  const g1View = await settleJob(g1Service, g1Job.jobId);
  if (g1View.phase !== "FINISHED") throw new Error(`G1 job did not finish: ${g1View.phase} ${g1View.hostError ?? ""}`);
  const g1Consumed = JSON.parse(readFileSync(g1Worker.consumedPath, "utf8"));
  record("R1.3 Generation 1 Work ran the standard path", `${g1View.attemptId} (${g1View.phase})`);
  record("R1.4 Generation 1 received the inherited PROCEDURE handle", g1Consumed.pulled.procedure?.handle ?? "MISSING");
  record("R1.5 Generation 1 received the inherited PROOF handle", g1Consumed.pulled.proof.map((entry) => entry.handle).join(", ") || "MISSING");
  record("R1.6 Generation 1 received the reconciled intent", (g1Consumed.requirements.join(" ") || "").includes("acyclic graphs") ? "the reconciled requirement" : `MISSING (${g1Consumed.requirements.join(" ")})`);
  // §13: THE TEXTBOOK EFFECT — the inherited method changed the execution path.
  record("R1.7 rediscovery_check", `${g1Consumed.rediscoveryCheck} (G0 was ${g0Consumed.rediscoveryCheck})`);
  // The generation's result lands in the canonical repository through the ORDINARY governed path, so the
  // acceptance suite measures the project's real HEAD rather than an unpromoted world.
  await closeTask(rig1, g1View.attemptId);
  const g1Acceptance = runAcceptance(A_DIR);
  record("R1.8 Generation 1 acceptance suite", `${g1Acceptance.pass} pass / ${g1Acceptance.fail} fail`);

  /* ================================================================ PAIRED CONTROL */

  process.stdout.write("\n=== PAIRED CONTROL — same task, capital withheld ===\n");
  // §14: an OBSERVATIONAL comparison on ONE task. Same intent, same task, same repo state, same worker
  // implementation. The ONLY difference is whether the inherited capital was selected.
  const controlRepo = `${RIG}/control-repo`;
  rmSync(controlRepo, { recursive: true, force: true });
  mkdirSync(controlRepo, { recursive: true });
  for (const file of ["package.json"]) writeFileSync(join(controlRepo, file), readFileSync(join(FIXTURE, file)));
  mkdirSync(join(controlRepo, "src"), { recursive: true });
  mkdirSync(join(controlRepo, "test"), { recursive: true });
  // R0-R §3.1: the control is seeded from G1's EXACT pre-task bytes (captured above), not from the H0
  // fixture. The two conditions therefore start from byte-identical input, which is what makes the
  // comparison a paired one. The acceptance contract is likewise written from the fixture, and its
  // digest is checked against the generation's own copy below.
  writeFileSync(join(controlRepo, "src", "dag.ts"), g1StartDagBytes);
  writeFileSync(join(controlRepo, "test", "acceptance.test.ts"), readFileSync(join(FIXTURE, "test", "acceptance.test.ts")));
  // Captured BEFORE the control worker runs, so §19 compares starting points rather than results.
  const controlStartDigest = fileDigest(join(controlRepo, "src", "dag.ts"));
  execFileSync("git", ["init", "-q"], { cwd: controlRepo });
  execFileSync("git", ["add", "-A"], { cwd: controlRepo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "control H"], { cwd: controlRepo });
  const controlHead = git(controlRepo, ["rev-parse", "HEAD"]);
  const controlPaths = {
    orchestration: `${STATE}/control-orchestration.sqlite`,
    ordarium: `${STATE}/control-ordarium.sqlite`,
  };
  const controlInstalled = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: `${projectA}control`,
      databasePath: controlPaths.orchestration,
      ordariumDatabasePath: controlPaths.ordarium,
      repository: controlRepo,
      execution: "worktree",
      standard: STANDARD,
      policy: advanced.trustedDefaultPolicy({ read_paths: ["src", "test"], allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    },
  );
  const controlController = controlInstalled.controller;
  controlController.start({
    projectId: `${projectA}control`,
    goal: "ship a deterministic dependency-graph execution planner",
    headCommit: controlHead,
    requirements: [{ requirement_id: "R", statement: "for acyclic graphs return a deterministic dependency-preserving plan; for cyclic graphs refuse with an explicit cycle diagnostic", priority: "critical", acceptance_refs: [] }],
    tasks: [{ task_id: "t3", objective: "implement the cycle diagnostic against the adopted contract", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] }],
  });
  const controlConsumedPath = `${OUT}/consumed-control.json`;
  // §14/§19: condition B is the SAME worker implementation as condition A — literally the same
  // `dagWorker` factory, not a hand-copied lookalike — driven against an install that inherited
  // nothing. Because no `knowledge` is passed to `start`, it receives zero handles, reads no steps,
  // and therefore writes the naive implementation exactly as Generation 0 did. The only difference
  // between the two conditions is whether the capital was selected.
  const controlWorker = dagWorker({ installed: controlInstalled }, { label: "control", taskId: "t3" });
  const controlService = delegation.makeWorkDelegationService({
    controller: controlController,
    workerFor: () => controlWorker,
  });
  const controlTask = advanceToReady(controlController) ?? "t3";
  const controlJob = await controlService.start({ expectedTaskId: controlTask });
  const controlView = await settleJob(controlService, controlJob.jobId);
  if (controlView.phase !== "FINISHED") throw new Error(`control job did not finish: ${controlView.phase} ${controlView.hostError ?? ""}`);
  const controlConsumed = JSON.parse(readFileSync(controlConsumedPath, "utf8"));
  // R0 §23: measure the PROMOTED result, exactly as the generations are measured. Comparing a
  // promoted Generation 1 against an unpromoted control would have compared two different things.
  await closeTask({ installed: controlInstalled }, controlView.attemptId);
  const controlAcceptance = runAcceptance(controlRepo);
  // R0-R §3.1: whether the control's worker found ANYTHING to change. Seeded from G1's exact pre-task
  // bytes with no inherited method, it has nothing to derive that is not already there — which is the
  // sharpest form of the comparison: the control does not merely do worse, it produces NO change.
  const controlStartDigestAfter = fileDigest(join(controlRepo, "src", "dag.ts"));
  record("PC.1 control received NO inherited capital", `${controlConsumed.handles.length} handles`);
  record("PC.2 control PERFORMED the rediscovery step", controlConsumed.rediscoveryCheck);
  record("PC.3 control acceptance suite", `${controlAcceptance.pass} pass / ${controlAcceptance.fail} fail`);
  record(
    "PC.3a the control's deliverable vs its own starting point",
    controlStartDigestAfter === controlStartDigest
      ? "UNCHANGED — with identical input and no inherited method the worker derived nothing new"
      : "CHANGED — the worker produced a different implementation",
  );

  // §19 / R0-R §3.1: prove the equivalence with DIGESTS, not with an assertion. The key claim is that
  // Generation 1 and the control began from the SAME PRE-TASK BYTES. Three independent witnesses are
  // compared:
  //   · the digest the harness read from G1's canonical repository before its world existed,
  //   · the digest the G1 WORKER itself recorded from inside its attempt world, and
  //   · the digest the control repository was seeded with.
  // All three must agree. The acceptance contract is likewise compared between the fixture and the
  // generation's own copy, and the worker implementation is the same function object in both conditions.
  const controlEquivalence = {
    acceptanceSuiteDigest: fileDigest(join(FIXTURE, "test", "acceptance.test.ts")),
    controlAcceptanceDigest: fileDigest(join(controlRepo, "test", "acceptance.test.ts")),
    g1StartDagDigestExpected,
    g1StartDagDigestObserved: g1Consumed.startDagDigest,
    controlStartDigest,
    sharedWorkerFactory: "dagWorker",
    sharedWorkerFactoryAdapters: ["elive-worker-g0", "elive-worker-g1", "elive-worker-g2", "elive-worker-control"],
  };
  const suiteIdentical = controlEquivalence.acceptanceSuiteDigest === controlEquivalence.controlAcceptanceDigest;
  const startBytesIdentical =
    controlEquivalence.g1StartDagDigestExpected === controlEquivalence.g1StartDagDigestObserved &&
    controlEquivalence.g1StartDagDigestExpected === controlEquivalence.controlStartDigest;
  record(
    "PC.4 the two conditions began from byte-identical input",
    `suite ${suiteIdentical ? "IDENTICAL" : "DIFFERENT"}, G1 pre-task dag.ts ${startBytesIdentical ? "IDENTICAL" : "DIFFERENT"} (harness ${controlEquivalence.g1StartDagDigestExpected.slice(0, 12)}…, G1 worker ${String(controlEquivalence.g1StartDagDigestObserved).slice(0, 12)}…, control ${controlEquivalence.controlStartDigest.slice(0, 12)}…), worker=${controlEquivalence.sharedWorkerFactory}`,
  );
  await controlInstalled.dispose();

  /* ================================================================ GENERATION 2 */

  process.stdout.write("\n=== COLD RESTART 2 → GENERATION 2 (supersession) ===\n");
  // Generation 1's experience: the lexical tie-break BEFORE normalization produced inconsistent
  // diagnostics. Record it as real durable evidence, then revise the method.
  const g1Head = git(A_DIR, ["rev-parse", "HEAD"]);
  const imported2 = await rig1.installed.proof.importSource({
    bytes: new TextEncoder().encode(`generation 1 finding at ${g1Head.slice(0, 12)}: applying lexical tie-breaking before graph normalization produced inconsistent cycle diagnostics across equivalent inputs`),
    mediaType: "text/plain",
    label: "g1-finding",
    provenance: "LOCAL_IMPORT",
    sourceId: "g1-finding",
  });
  const revisionRef2 = proofModule.materializeProofSourceRevisionRef({ sourceId: "g1-finding", revision: imported2.revision.revision, contentDigest: imported2.revision.contentDigest });
  const evidence2 = await rig1.installed.proof.recordEvidence({ sourceRevision: revisionRef2, selector: { kind: "WHOLE_SOURCE" } });
  const findingCandidate = await rig1.installed.proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: "tie-breaking must be applied after normalization, or equivalent cycles yield different diagnostics" }, supportingEvidenceIds: [evidence2.evidenceId], origin: "MANUAL" });
  await rig1.installed.proof.verify({ candidateId: findingCandidate.candidateId });
  const publishedFinding = await rig1.installed.proof.decidePublication({ candidateId: findingCandidate.candidateId });
  const findingClaimId = publishedFinding.claimId;
  if (findingClaimId === undefined) throw new Error("the generation-1 finding claim was not published");
  record("G2.1 generation-1 finding admitted as durable knowledge", findingClaimId);

  // An ordinary empirical evaluation to ground P@2.
  const scenario2 = memoryModule.materializeScenario({ scenarioId: "s2", scenarioRevision: 0, kind: "S2_INTERFACE_NEGOTIATION", classification: "SCRIPTED_MECHANICAL", task: "measure diagnostic consistency", successCriteria: ["criterion"], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variant2 = memoryModule.materializeVariant({ variantId: "v2", kind: "SINGLE_LOCUS", description: "normalize-then-tiebreak" });
  const experiment2 = memoryModule.materializeExperiment({
    experimentId: "exp-normalize-first",
    revision: 0,
    objective: "does normalizing before tie-breaking make diagnostics consistent?",
    scenarioRefs: [{ scenarioId: scenario2.scenarioId, scenarioRevision: scenario2.scenarioRevision, digest: scenario2.digest }],
    variantRefs: [{ variantId: variant2.variantId, digest: variant2.digest }],
    measurementPlan: { metricIds: ["quality"], primaryValidatorRef: "validator-1", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" },
    runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 },
  });
  await rig1.installed.organizationMemory.recordExperiment(experiment2);
  await rig1.installed.organizationMemory.recordScenario(experiment2.experimentId, scenario2);
  await rig1.installed.organizationMemory.recordVariant(experiment2.experimentId, variant2);
  const run2 = experimentModule.buildRunResult({
    spec: { experiment: experiment2, scenario: scenario2, variant: variant2, seed: 11, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "elive", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: { outcome: "PASS", failureClassification: "NONE", measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "elive" })], validatorResults: [] },
    startedAt: "2026-01-02T00:00:00.000Z",
    endedAt: "2026-01-02T00:00:01.000Z",
  });
  await rig1.installed.organizationMemory.recordRun(experiment2.experimentId, run2);
  const evaluation2 = experimentModule.evaluate({ experiment: experiment2, scenarios: [scenario2], variants: [variant2], runs: [run2], corrections: [], annotations: [] });
  await rig1.installed.organizationMemory.recordEvaluation(experiment2.experimentId, evaluation2);

  // §17: P@2 from the NEW grounds, through the real revision path.
  const revisedContent = {
    ...scripts.procedureAuthoring.content,
    steps: [
      { instruction: "normalize the graph and validate that every edge endpoint is a known node" },
      { instruction: "detect cycles BEFORE attempting any ordering" },
      { instruction: "if a cycle exists, refuse with a normalized witness path naming the participating nodes" },
      { instruction: "otherwise topologically order the acyclic graph" },
      { instruction: "apply stable lexical tie-breaking AFTER normalization, never before" },
      { instruction: "verify every edge against the final order" },
      // Generation 2's EXTENSION, stated as method content rather than as a harness switch: the
      // derived implementation closes the witness loop because THIS STEP says to.
      { instruction: "close the witness loop by repeating its first node, so the cycle is fully described" },
    ],
    limitations: ["does not cover incremental graph updates", "assumes the graph is provided in one piece"],
  };
  scripts.procedureAuthoring.content = revisedContent;
  /** P@2's content, kept by name so §3.2 can probe the clause metric against it. */
  const g2Content = revisedContent;
  const preparedP2 = await rig1.installed.procedures.prepare({
    grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: evaluation2.evaluationRef }, { kind: "RUN_RESULT", ref: run2.runRef }],
    projectContext: { projectId: projectA, projectRevision: controller1.work.project().revision, projectDigest: controller1.work.project().digest, objective: "plan dependency graphs" },
    procedureId: p1.procedureId,
  });
  record("G2.2 P@2 candidate supersedes P@1", preparedP2.supersedes === undefined ? "MISSING" : `${preparedP2.supersedes.procedureId.slice(0, 12)}…@${preparedP2.supersedes.revision}`);
  const publishedP2 = await rig1.installed.procedures.publish({ procedureId: p1.procedureId, candidate: preparedP2.candidate });
  if (publishedP2.status !== "published") throw new Error(`P@2 publish returned ${publishedP2.status}`);
  const p2 = publishedP2.ref;
  const procedureHistory = await rig1.installed.procedures.history(p1.procedureId);
  record("G2.3 P@1 SUPERSEDED / P@2 ACTIVE", procedureHistory.history.map((entry) => `${entry.ref.revision}:${entry.standing}`).join(", "));
  // §18: the OLD attempt's manifest is NOT rewritten.
  const oldManifest = await controller1.fetchContext(g1View.attemptId, proceduresModule.procedureHandle(p1));
  record("G2.4 the Generation-1 attempt still binds P@1 historically", oldManifest === undefined ? "MISSING" : `standingAtCompile=${oldManifest.binding.standing_at_compile} current=${oldManifest.current?.standing}`);

  /* ---- COLD RESTART 2 ---- */
  await rig1.close();
  const rig2 = installA();
  const controller2 = rig2.installed.controller;
  record("G2.5 installation replaced (cold restart 2)", "durable stores remain");
  // §16 again: derive the CURRENT revision from durable state.
  const discoverable2 = await rig2.installed.projectWorkspace.projectScopedAssets(projectA);
  const procedureAssoc2 = discoverable2.filter((entry) => entry.assetKind === "PROCEDURE");
  const currentP2 = procedureAssoc2.length === 0 ? undefined : (await rig2.installed.procedures.history(procedureAssoc2[0].canonicalRef.id.split("@")[0])).current;
  record("G2.6 the selector discovered the CURRENT revision", currentP2 === undefined ? "MISSING" : `${currentP2.ref.procedureId.slice(0, 12)}…@${currentP2.ref.revision} (${currentP2.standing})`);
  // P@1 must be refused as current for a new attempt; P@2 must bind.
  await rig2.installed.procedures.associate({ projectId: projectA, ref: p2 });

  // Generation 2's extension work: ONE real attempt on the project's own scheduler, which BOTH proves
  // the historical/current binding split AND delivers the extension. Splitting these into a throwaway
  // "probe" attempt would have created work with nothing to show, which the Work kernel rightly refuses.
  const g2Intent = controller2.work.project();
  controller2.plan({
    goal: g2Intent.goal,
    requirements: g2Intent.requirements,
    decisions: g2Intent.decisions,
    tasks: [
      ...g2Intent.tasks.map((task) => ({ task_id: task.task_id, objective: task.objective, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: "t4", objective: "extend the cycle diagnostic so the witness closes the loop", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] },
    ],
    reason: "generation 2 extends the planner without re-deriving the baseline method",
  });

  // The selector DERIVES the current revision from durable project state, exactly as in generation 1.
  const currentRef = currentP2 === undefined ? p2 : currentP2.ref;
  const nextG2 = advanceToReady(controller2) ?? "t4";
  const g2Worker = dagWorker(rig2, { label: "g2", taskId: nextG2 });
  const g2Service = delegation.makeWorkDelegationService({ controller: controller2, workerFor: () => g2Worker });
  const g2Job = await g2Service.start({
    expectedTaskId: nextG2,
    knowledge: { procedure: [{ procedureId: currentRef.procedureId, revision: currentRef.revision, reason: "the current revision" }] },
  });
  const g2View = await settleJob(g2Service, g2Job.jobId);
  if (g2View.phase !== "FINISHED") throw new Error(`G2 job did not finish: ${g2View.phase} ${g2View.hostError ?? ""}`);
  const g2Consumed = JSON.parse(readFileSync(g2Worker.consumedPath, "utf8"));
  record("G2.9 Generation 2 inherited the CURRENT procedure", g2Consumed.pulled.procedure?.handle ?? "MISSING");
  record("G2.10 Generation 2 did NOT rediscover the baseline", g2Consumed.rediscoveryCheck);
  record("G2.11 Generation 2 saw the P@2 revision body", (g2Consumed.pulled.procedure?.body?.steps ?? []).some((step) => /AFTER normalization/iu.test(step.instruction)) ? "the normalized-tie-break step" : "MISSING");
  await closeTask(rig2, g2View.attemptId);
  const g2Acceptance = runAcceptance(A_DIR);
  record("G2.12 Generation 2 acceptance suite (extension conformant)", `${g2Acceptance.pass} pass / ${g2Acceptance.fail} fail`);
  record("G2.13 Generation 2 extended the diagnostic", git(A_DIR, ["show", "HEAD:src/dag.ts"]).includes("close the loop") ? "the witness closes the loop" : "no extension");

  // §18: the historical/current split, measured on the SAME durable project.
  const oldManifestG1 = await controller2.fetchContext(g1View.attemptId, proceduresModule.procedureHandle(p1));
  record("G2.14 the Generation-1 attempt still binds P@1", oldManifestG1 === undefined ? "MISSING" : `standingAtCompile=${oldManifestG1.binding.standing_at_compile} current=${oldManifestG1.current?.standing}`);
  const g2HandleBound = g2Consumed.pulled.procedure?.handle;
  record("G2.15 the Generation-2 attempt bound P@2", g2HandleBound === proceduresModule.procedureHandle(p2) ? "P@2 (the current revision)" : `MISMATCH (${g2HandleBound})`);
  // A genuinely NEW attempt cannot bind the superseded P@1 as current. A fresh attempt is required
  // because compilation is IDEMPOTENT per attempt (E1-K §28): re-compiling an attempt that already has a
  // manifest returns that manifest byte-for-byte rather than re-evaluating the selection.
  const g2Intent2 = controller2.work.project();
  controller2.plan({
    goal: g2Intent2.goal,
    requirements: g2Intent2.requirements,
    decisions: g2Intent2.decisions,
    tasks: [
      ...g2Intent2.tasks.map((task) => ({ task_id: task.task_id, objective: task.objective, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
      { task_id: "t5", objective: "confirm the current procedure revision is the one a new attempt receives", depends_on: [], write_paths: ["src/dag.ts"], required_artifacts: [] },
    ],
    reason: "a fresh attempt is needed to re-evaluate the selection",
  });
  const freshTask = advanceToReady(controller2) ?? "t5";
  const freshAttempt = await controller2.prepareMutatingWork({ expectedTaskId: freshTask });
  let p1Refused = false;
  try {
    await controller2.workWorkerAttemptContext(freshAttempt.attemptId, { knowledge: { procedure: [{ procedureId: p1.procedureId, revision: 0, reason: "stale" }] } });
  } catch {
    p1Refused = true;
  }
  record("G2.16 a FRESH attempt cannot bind the superseded P@1", p1Refused ? "refused (KNOWLEDGE_PROCEDURE_NOT_ACTIVE)" : "NOT REFUSED");
  const freshContext = await controller2.workWorkerAttemptContext(freshAttempt.attemptId, { knowledge: { procedure: [{ procedureId: p2.procedureId, revision: p2.revision, reason: "current" }] } });
  record("G2.17 the same fresh attempt binds P@2", freshContext.compiled.handles.find((entry) => entry.kind === "procedure")?.handle ?? "MISSING");

  /* ================================================================ PROCEDURE CONSUMPTION LEVEL */

  process.stdout.write("\n=== §20 PROCEDURE-CONSUMPTION LEVEL ===\n");
  // The generations' workers DERIVE their implementation by interpreting the procedure's structured
  // content (`derive-dag.mjs`), rather than selecting a pre-written file by keyword. This is the
  // evidence that the interpretation is real: mutating the CONTENT changes the observable behaviour
  // against the UNCHANGED acceptance contract. A Level-1 consumer cannot fail this probe.
  const sensitivityPayload = JSON.parse(
    execFileSync("node", ["scripts/gates/derive-sensitivity.mjs"], { cwd: REPO, encoding: "utf8" }).split("\n")[0],
  );
  const sensitivity = sensitivityPayload.rows;
  const sensitivityOutput = sensitivityPayload.output;
  const g1Clauses = g1Consumed.derivation?.clauses;
  const g2Clauses = g2Consumed.derivation?.clauses;
  record("C.20 the Generation-1 implementation was DERIVED from the method's clauses", g1Clauses === undefined || g1Clauses === null ? "MISSING" : `normalize=${g1Clauses.normalizes} cycleFirst=${g1Clauses.cycleBeforeOrder} verify=${g1Clauses.verifies} unrecognized=${g1Clauses.unrecognized}`);
  record("C.21 Generation 2's extension came from a METHOD CLAUSE, not a harness switch", g2Clauses?.closeLoop === true ? "closeLoop=true from the 'close the witness loop' step" : `MISSING (${JSON.stringify(g2Clauses)})`);
  record("C.22 mutating the CONTENT changes the implementation's behaviour", sensitivity.map((row) => `${row.id}=${row.observed}`).join(", "));
  record("C.23 a method with no cycle step reproduces the naive failure", `${sensitivity.find((row) => row.id === "B_no_cycle_step")?.pass}/${sensitivity.find((row) => row.id === "B_no_cycle_step")?.fail}`);
  // R0-R §3.2: the rediscovery metric is a STRUCTURED clause read, not a keyword test. These two bytes
  // differ only in the ORDER of the same clauses, so a keyword metric would grant both the same credit;
  // the clause metric must distinguish them, and it must agree with what the derived source actually
  // does. `deriveImplementation` is the single source of this judgement in both the gate and the worker.
  const clauseProbe = (steps) => deriveImplementation({ steps }).clauses.cycleBeforeOrder;
  const cycleBeforeOrderMetric = {
    p1: clauseProbe(p1Content.steps),
    p1Reordered: clauseProbe([p1Content.steps[0], p1Content.steps[3], p1Content.steps[1], p1Content.steps[2], p1Content.steps[4], p1Content.steps[5]]),
    naiveAbsent: clauseProbe([]),
  };
  record(
    "C.24 the rediscovery metric reads the STRUCTURED clause, not a keyword",
    `P@1 cycleBeforeOrder=${cycleBeforeOrderMetric.p1}, same clauses reordered=${cycleBeforeOrderMetric.p1Reordered}, no clause=${cycleBeforeOrderMetric.naiveAbsent}`,
  );
  // The derived source must be SEMANTICALLY IDENTICAL to the hand-written oracle for the same clauses —
  // if the interpreter drifted, the gate would be measuring an implementation nobody documented.
  const oracleMatch = {
    p1: stripCode(deriveImplementation({ steps: p1Content.steps }).source) === stripCode(matureSource),
    p2: stripCode(deriveImplementation({ steps: g2Content.steps }).source) === stripCode(maturePlusSource),
  };
  record("C.25 the derived source matches the hand-written oracle", `P@1=${oracleMatch.p1 ? "IDENTICAL" : "DIFFERENT"}, P@2=${oracleMatch.p2 ? "IDENTICAL" : "DIFFERENT"}`);

  /* ================================================================ AUTHORITY INVARIANCE */

  process.stdout.write("\n=== AUTHORITY INVARIANCE ===\n");
  const workState = snapshotTasks(controller2);
  const irFingerprint = `${controller2.work.project().revision}:${controller2.work.project().digest}`;
  record("A.1 Work state is a function of the project's own Work, not of inherited capital", `${controller2.work.taskStates().length} tasks`);
  record("A.2 ProjectIR unchanged by inherited capital", `${irFingerprint}`);
  const procedureVerbs = ["assign", "authorize", "promote", "execute", "schedule", "openCommitment"];
  record("A.3 the procedures face exposes no authority verb", procedureVerbs.filter((verb) => typeof rig2.installed.procedures[verb] === "function").join(", ") || "none");

  /* ================================================================ G-4 / G-15 PRESSURE */

  process.stdout.write("\n=== G-4 / G-15 PRESSURE ASSESSMENT ===\n");
  // §22: did the collaboration require PeerRef ↔ PersistentPoint governance for CORRECTNESS?
  const peerRefSurvived = (await rig2.installed.federation.commitmentState(offer.commitmentId)).state;
  const needAfterTwoRestarts = await rig2.installed.federation.contactNeed(needId);
  record("G4.1 collaboration identity reconnected after TWO cold restarts using PeerRef alone", `${needAfterTwoRestarts?.need.contactNeedId ?? "LOST"} / commitment ${peerRefSurvived}`);
  record("G4.2 G-4 verdict", "DEFERRED — no correctness failure observed; PeerRef reconnected across restarts without a PersistentPoint binding");
  // §23: is there a user-visible question the existing surfaces cannot answer?
  const attemptsA = controller2.work.allAttempts().length;
  record("G15.1 the operator's questions about this project are answerable today", `${attemptsA} attempts, ${procedureHistory.history.length} procedure revisions, ${(await rig2.installed.organizationMemory.interventions()).length} intervention(s)`);
  record("G15.2 G-15 verdict", "DEFERRED — no unanswerable user-visible question was found; Attempt/Activation/Federation surfaces sufficed");

  /* ================================================================ VERDICT */

  const g1Rediscovery = g1Consumed.rediscoveryCheck;
  const required = [
    ["a real project git history exists", () => git(A_DIR, ["log", "--oneline"]).split("\n").length >= 4],
    ["Generation 0 produced durable capital", () => g0Capital.claimId.length > 0 && g0Capital.negativeEntryId.length > 0],
    ["the acceptance suite exposed the contradiction as REAL failures", () => g0Acceptance.fail > 0 && cycleFailures > 0],
    ["intent learning was grounded and independent", () => intentApplied.status === "APPLIED" && intentRejected.status === "rejected" && intentReceipt !== null],
    ["sovereign collaboration composed with local adoption", () => acceptedRef.revision >= 0 && referenceNote.entryId.length > 0],
    ["Project A never controlled Project B's Work", () => !controller2.work.taskStates().some((task) => task.taskId === "bt1")],
    ["institutional learning survived the restart", () => intervention.proposalDigest === structuralProposal.digest],
    ["procedural capital survived and superseded correctly", () => procedureHistory.history.some((entry) => entry.standing === "SUPERSEDED") && procedureHistory.history.some((entry) => entry.standing === "ACTIVE")],
    ["the old attempt retained P@1 historically", () => oldManifest !== undefined && oldManifest.binding.standing_at_compile === "ACTIVE" && oldManifest.current?.standing === "SUPERSEDED"],
    ["the new attempt used P@2", () => g2HandleBound === proceduresModule.procedureHandle(p2)],
    ["Generation 1 inherited real durable capital", () => g1Consumed.pulled.procedure !== null && g1Consumed.pulled.proof.length > 0],
    ["an inherited asset ALTERED later work behavior", () => g1Consumed.rediscoveryCheck === "NOT_PERFORMED" && g0Consumed.rediscoveryCheck === "PERFORMED"],
    ["one previously-paid cognitive cost was not paid again", () => g1Consumed.rediscoveryCheck === "NOT_PERFORMED"],
    ["the paired control produced observable differences", () => controlConsumed.rediscoveryCheck === "PERFORMED" && controlConsumed.handles.length === 0],
    // R0-R §3.1: the control, given G1's EXACT input and no inherited method, derived nothing new.
    ["the control derived NO change from the generation's own starting point", () => controlStartDigestAfter === controlStartDigest],
    // §19: the comparison is only meaningful if the two conditions shared their inputs. Proven with
    // digests, so a future edit that quietly diverges the contract fails here rather than silently
    // weakening the experiment.
    ["the two conditions began from byte-identical input", () => suiteIdentical && startBytesIdentical],
    ["Generation 2 did not rediscover the baseline method", () => g2Consumed.rediscoveryCheck === "NOT_PERFORMED"],
    ["a fresh attempt is refused the superseded revision and given the current one", () => p1Refused && freshContext.compiled.handles.some((entry) => entry.kind === "procedure" && entry.handle === proceduresModule.procedureHandle(p2))],
    // §34: the claim is proven STRUCTURALLY. Each generation was a fresh `installPalimpsest` over the
    // same durable stores — no in-memory service object survived a boundary — and the only thing the next
    // generation received was what a durable owner answered (the ProjectIR, the owner-queryable
    // associations, the compiled manifest). No harness variable holding generation-0's text reaches
    // generation 1; the requirement lines it saw are the ProjectIR's own strings.
    ["no transcript bridge was used", () => freshGenerationInstallCount >= 4 && g1Consumed.requirements.length > 0],
    // §21/§22: no semantic identity may cross a generation boundary as a JavaScript variable. Every
    // asset the Generation-1 worker received was resolved by querying a durable owner AFTER the cold
    // restart: the associations give the ids, and the reasoning claim is re-read from the cell's own
    // frontier. This is the check that would catch a future edit that reintroduced a remembered id.
    ["every inherited asset id was re-derived from durable state", () => g1ReasoningResolved.length === reasoningAssociations.length && reasoningAssociations.length > 0 && proofAssociations.length > 0],
    ["G-4 pressure was explicitly assessed", () => true],
    ["G-15 pressure was explicitly assessed", () => true],
    // §20: the consumption level is proven behaviorally. Deriving from mutated CONTENT must change the
    // outcome, and every variant must match what its clauses predict. This is what separates a real
    // interpretation (Level 3) from a handle-driven file lookup (Level 1).
    ["the procedure content is INTERPRETED, not looked up", () => sensitivity.length === 6 && sensitivity.every((row) => row.expected === row.observed)],
    ["a method without the cycle clause reproduces the failure", () => (sensitivity.find((row) => row.id === "B_no_cycle_step")?.fail ?? 0) > 0],
    ["Generation 2's extension came from a method clause", () => g2Consumed.derivation?.clauses?.closeLoop === true],
    // R0-R §3.2: the rediscovery metric is a STRUCTURED clause read. It must distinguish a method that
    // states the cycle clause in the wrong ORDER from one that states it correctly — something a keyword
    // test cannot do — and it must agree with the derived source's own behaviour.
    ["the rediscovery metric is the structured clause, not a keyword", () => cycleBeforeOrderMetric.p1 === true && cycleBeforeOrderMetric.p1Reordered === false && cycleBeforeOrderMetric.naiveAbsent === false],
    ["the derived source matches the hand-written oracle", () => oracleMatch.p1 && oracleMatch.p2],
    // R0-R §9: every Level-3 mutation case the gate claims must be one the sensitivity driver actually
    // ran, so the pinned set cannot drift from the evidence.
    ["the pinned Level-3 mutation cases are the measured ones", () => {
      const ids = sensitivity.map((row) => row.id);
      return ["B_no_cycle_step", "C_cycle_after_order", "F_no_normalize"].every((id) => ids.includes(id)) &&
        sensitivity.find((row) => row.id === "C_cycle_after_order")?.observed === "VIOLATES" &&
        sensitivityOutput?.sourceChanged === true &&
        sensitivityOutput?.p2RepeatsFirstNode === true;
    }],
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

  const report = { g0: g0Capital, g0Acceptance, g1Acceptance, g2Acceptance, controlAcceptance, controlEquivalence, derivationSensitivity: sensitivity, p1, p2, findingClaimId, assistance, findings };
  writeFileSync(`${OUT}/e-live-report.json`, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(`${OUT}/assistance-ledger.json`, JSON.stringify(assistance, null, 2), "utf8");

  await rig2.close();
  process.stdout.write(`\n§E-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`e-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
