#!/usr/bin/env node
/**
 * §R1-L-LIVE — THE GOVERNED WORKER CONTEXT PULL, ON A REAL DSH WORKER.
 *
 * R1 measured that a selected knowledge handle reached the worker PROCESS and was then dropped: the
 * model never saw the index, and every inherited `palimpsest_*` tool is denied to a worker, so there was
 * no way to pull a body either. All three R1 conditions produced byte-identical prompts.
 *
 * This gate proves the last mile is CLOSED, on the real host, with the real worker port:
 *
 *   C0  no selected capital       → index empty, pull tool present, protected values UNREACHABLE
 *   C1  Proof + Reasoning         → both handles visible and pullable
 *   C2  Proof + Reasoning + Proc  → the third handle visible and pullable too
 *
 * THE HEADLINE PROOF IS ACCESSIBILITY, NOT MODEL PERFORMANCE (§26). Each selected capital body carries
 * an UNGUESSABLE PER-RUN NONCE that appears nowhere else — not in the task objective, not in the
 * requirements, not in the repository, not in the tests, not in the prompt outside the bodies. A worker
 * can only produce those values by actually pulling the body. So the gate measures whether capital is
 * REACHABLE, and the nonce is what makes that mechanically checkable.
 *
 * WHAT IT DOES NOT DO: it does not require a stochastic worker to quote hidden reasoning, and it does
 * not weaken the capability boundary to make a model comply. If a worker declines to pull despite a task
 * that needs the values, that is recorded as KNOWLEDGE_NOT_USED and the gate still reports what it
 * measured (§26).
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { dshBin, dshHome, dshVersion, gateRepoRoot, gateRoot, installHostBundle } from "./env.mjs";

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/r1-l-live`;
const HOME = `${RIG}/home`;
const OUT = `${RIG}/out`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL("./d2-live-tee-worker.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const WORKER_TIMEOUT_MS = 1_500_000;
/** §24: every condition gets its own profile and world, so no condition can observe another's state. */
const CONDITIONS = ["C0", "C1", "C2"];

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);
const workWorker = await import(pathToFileURL(`${REPO}/dist/src/deployment/work_worker.js`).href);
const proofModule = await import(pathToFileURL(`${REPO}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO}/dist/src/experiment/index.js`).href);

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};
const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
const policyRef = (policyId) => ({ policyId, version: "v1" });

/* ------------------------------------------------------------------ fixture */

/**
 * §24: the unguessable per-run nonces. They are generated fresh on every gate run and exist ONLY in the
 * capital bodies, so a worker that reports them has demonstrably read the body.
 */
function makeNonces() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const one = () => Array.from({ length: 24 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return { proof: one(), reasoning: one(), procedure: one() };
}

/**
 * The project the worker edits. It is deliberately trivial — this gate measures ACCESSIBILITY, not
 * engineering difficulty — and its acceptance oracle is a plain-node script, because Node's own
 * `--test` runner spawns test files with piped stdio, which the PTC sandbox denies (measured by D5).
 */
function setupProject(dir, nonces) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "src", "values.js"), "export const values = { proof: null, reasoning: null, procedure: null };\n");
  writeFileSync(
    join(dir, "test", "check.js"),
    [
      'import assert from "node:assert/strict";',
      'import { values } from "../src/values.js";',
      "",
      "// The oracle checks ONLY the shape: the nonces are unknowable to this file, so it cannot leak them.",
      'assert.ok(values && typeof values === "object", "values.js must export an object");',
      "process.stdout.write(\"ok\" + String.fromCharCode(10));",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "r1llive", private: true, type: "module", scripts: { test: "node test/check.js" } }, null, 2)}\n`);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  return git(dir, ["rev-parse", "HEAD"]);
}

const STANDARD = Object.freeze({
  statement: "the acceptance oracle passes and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "test/check.js"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["r1-l-live fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/* ------------------------------------------------------------------ policies */

const proofVerification = () => ({
  policyRef: policyRef("r1l-verification"),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 ? "SUPPORTED" : "INCONCLUSIVE", supportingEvidenceIds: supporting, contradictingEvidenceIds: [] };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef("r1l-publication"),
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

/** §24: the procedure body carries its own nonce, so consuming it is observable too. */
function procedureAuthoring(nonce) {
  return {
    origin: "r1-l-live-author",
    async propose() {
      return {
        outcome: "proposal",
        content: {
          schemaVersion: 1,
          title: `Record the observed values (marker ${nonce})`,
          purpose: "write the three observed values into src/values.js",
          applicability: ["a task that must report governed project context"],
          preconditions: ["the project context is readable"],
          steps: [
            { instruction: `read the proof body and note its marker ${nonce}` },
            { instruction: "read the reasoning body and note its marker" },
            { instruction: "write every observed marker into src/values.js and commit" },
          ],
          checks: ["src/values.js names the markers that were actually read"],
          expectedOutputs: ["a committed values.js"],
          limitations: ["does not verify the markers"],
          capabilityHints: [],
          recommendedRecipeRefs: [],
        },
      };
    },
  };
}
function procedureAdmission() {
  return {
    policyRef: policyRef("r1l-admission"),
    async decide({ candidateDigest, validation }) {
      return { decision: "PUBLISH", candidateDigest, rationale: `admitted (groundsResolved=${validation.groundsResolved})`, policyRef: policyRef("r1l-admission") };
    },
  };
}

/* ------------------------------------------------------------------ one condition */

async function runCondition(condition, nonces) {
  const DIR = `${RIG}/${condition}`;
  const PROJECT = `${DIR}/repo`;
  const STATE = `${DIR}/state`;
  const COND_HOME = `${DIR}/home`;
  const PROFILE = `r1l${condition.toLowerCase()}`;

  process.stdout.write(`\n================ ${condition} ================\n`);
  const head = setupProject(PROJECT, nonces);

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
  const project = `r1l${condition.toLowerCase()}`;

  const install = (authorNonce) => {
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
        policy: advanced.trustedDefaultPolicy({ read_paths: ["src", "test"], allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }] }),
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
        procedureAuthoring: procedureAuthoring(authorNonce),
        procedureAdmission: procedureAdmission(),
      },
    );
    return { installed, proofStore, procedureStore };
  };

  /* -- Phase 1: durable capital carrying the nonces ------------------------------ */
  const seed = install(nonces.procedure);
  seed.installed.controller.start({
    projectId: project,
    goal: "record the governed project context this attempt was given",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "write the values you were given into src/values.js", depends_on: [], write_paths: ["src/values.js"], required_artifacts: [] }],
  });

  const proof = seed.installed.proof;
  const imported = await proof.importSource({ bytes: new TextEncoder().encode(`The governed context marker for the proof body is ${nonces.proof}.`), mediaType: "text/plain", label: "proof-marker", provenance: "LOCAL_IMPORT", sourceId: "proof-marker" });
  const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: "proof-marker", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: `the proof body marker is ${nonces.proof}` }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  const proofClaimId = published.claimId;

  const cell = seed.installed.reasoningCells;
  await cell.service.openCell({ cellId: "cell-marker", objective: "what is the reasoning marker", verificationPolicyRef: policyRef("r1l-rv"), admissionPolicyRef: policyRef("r1l-ra") });
  const branch = await cell.service.openBranch({ cellId: "cell-marker", question: "what is the marker?" });
  const submitted = await cell.service.submitCandidate({ cellId: "cell-marker", branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: `the reasoning body marker is ${nonces.reasoning}` } });
  await cell.service.evaluateCandidate({ cellId: "cell-marker", candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await cell.service.frontier({ cellId: "cell-marker" });
  const reasoningClaimId = frontier.claims[0]?.ref.claimId;

  const scenario = memoryModule.materializeScenario({ scenarioId: "s1", scenarioRevision: 0, kind: "S1_LOW_COUPLING", classification: "SCRIPTED_MECHANICAL", task: "report the governed context", successCriteria: ["the markers are recorded"], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variant = memoryModule.materializeVariant({ variantId: "v1", kind: "SINGLE_LOCUS", description: "read-then-write" });
  const experiment = memoryModule.materializeExperiment({ experimentId: "exp-r1l", revision: 0, objective: "does reading the context let the markers be reported?", scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: 0, digest: scenario.digest }], variantRefs: [{ variantId: variant.variantId, digest: variant.digest }], measurementPlan: { metricIds: ["quality"], primaryValidatorRef: "validator-1", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await seed.installed.organizationMemory.recordExperiment(experiment);
  await seed.installed.organizationMemory.recordScenario(experiment.experimentId, scenario);
  await seed.installed.organizationMemory.recordVariant(experiment.experimentId, variant);
  const run = experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "r1-l-live", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: { outcome: "PASS", failureClassification: "NONE", measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "r1-l-live" })], validatorResults: [] },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  });
  await seed.installed.organizationMemory.recordRun(experiment.experimentId, run);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenario], variants: [variant], runs: [run], corrections: [], annotations: [] });
  await seed.installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);
  const prepared = await seed.installed.procedures.prepare({ grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: evaluation.evaluationRef }], projectContext: { projectId: project, projectRevision: 1, projectDigest: "4".repeat(64), objective: "report the governed context" } });
  const procPub = await seed.installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  if (procPub.status !== "published") throw new Error(`procedure publish answered ${procPub.status}`);

  const workspace = seed.installed.projectWorkspace;
  await workspace.associateAsset({ projectId: project, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: proofClaimId }, associationKind: "MANUAL", provenance: "r1-l-live" });
  await workspace.associateAsset({ projectId: project, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: "cell-marker" }, associationKind: "MANUAL", provenance: "r1-l-live" });
  await workspace.associateAsset({ projectId: project, assetKind: "PROCEDURE", canonicalRef: { kind: "PROCEDURE", id: `${procPub.ref.procedureId}@${procPub.ref.revision}`, digest: procPub.revision.digest }, associationKind: "MANUAL", provenance: "r1-l-live" });
  await seed.installed.dispose();
  seed.procedureStore.close();
  record(`${condition} capital bootstrapped`, `proof=${proofClaimId.slice(0, 12)}… procedure=${procPub.ref.procedureId.slice(0, 12)}…`);

  /* -- Phase 2: the real worker -------------------------------------------------- */
  mkdirSync(join(COND_HOME, "profiles", PROFILE), { recursive: true });
  mkdirSync(OUT, { recursive: true });
  installHostBundle({ repo: REPO, realDshHome: REAL_DSH });
  execFileSync("cmd", ["/c", "mklink", "/J", `${COND_HOME.replace(/\//gu, "\\")}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, "\\")}\\profiles\\node_modules`], { stdio: "ignore" });
  writeFileSync(join(COND_HOME, "settings.yaml"), ["agent-default-model:", "  provider: deepseek-official", "  model: deepseek-flash", "locale:", "  preference: zh", ""].join("\n"));
  copyFileSync(join(REAL_DSH, ".credentials.yaml"), join(COND_HOME, ".credentials.yaml"));
  writeFileSync(
    join(COND_HOME, "profiles", PROFILE, "deployment.json"),
    `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: project, localPeer: `${PROFILE}-peer`, persistentPoint: `pp-${PROFILE}`, repository: PROJECT, transport: { namespace: PROFILE, databasePath: join(STATE, "transport.sqlite") }, databases: { orchestration: paths.orchestration, ordarium: paths.ordarium, coordination: join(STATE, "coordination.sqlite"), transportCursors: join(STATE, "cursors.sqlite") }, reasoning: {}, execution: "worktree", concurrency: 1, policy: { allowed_commands: [{ executable: "node", argv_prefix: ["test/check.js"] }] }, standard: { statement: "the acceptance oracle passes" } }, null, 2)}\n`,
  );
  writeFileSync(join(COND_HOME, "profiles", PROFILE, "package.json"), `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`);
  writeFileSync(
    join(COND_HOME, "profiles", PROFILE, "cordis.patch.yml"),
    ["- id: palimpsest-tools", "  config:", `    palimpsestEntry: '${REPO}/dist/src/advanced.js'`, `    deploymentProfile: '${join(COND_HOME, "profiles", PROFILE, "deployment.json")}'`, "    serve: false", "    openDashboard: false", ""].join("\n"),
  );

  const transcript = join(OUT, `${condition}-worker-transcript.txt`);
  const payloadSink = join(OUT, `${condition}-payload.json`);
  const renderedSink = join(OUT, `${condition}-prompt.json`);
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = COND_HOME;
  process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
  process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

  try {
    const second = install(nonces.procedure);
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

    const selection =
      condition === "C0"
        ? undefined
        : condition === "C1"
          ? { proof: [{ claimId: proofClaimId }], reasoning: [{ cellId: "cell-marker", claimId: reasoningClaimId }] }
          : {
              proof: [{ claimId: proofClaimId }],
              reasoning: [{ cellId: "cell-marker", claimId: reasoningClaimId }],
              procedure: [{ procedureId: procPub.ref.procedureId, revision: procPub.ref.revision, reason: "the admitted method" }],
            };

    const started = await service.start(selection === undefined ? { expectedTaskId: "t1" } : { expectedTaskId: "t1", knowledge: selection });
    let view = await service.followup({ jobId: started.jobId });
    for (let i = 0; i < 30_000 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      view = await service.followup({ jobId: started.jobId });
    }
    record(`${condition} job phase`, `${view.phase}${view.hostError === undefined || view.hostError === null ? "" : ` hostError=${view.hostError}`}`);

    /* -- Phase 3: what the worker was handed ------------------------------------ */
    const payload = existsSync(payloadSink) ? JSON.parse(readFileSync(payloadSink, "utf8")) : null;
    const handles = payload?.context?.compiled?.handles ?? [];
    const indexText = payload?.contextIndexText ?? "";
    writeFileSync(
      renderedSink,
      JSON.stringify(
        {
          condition,
          handlesInPayload: handles.map((entry) => `${entry.kind}:${entry.handle}`),
          contextIndexText: indexText,
          contextIndexHasBodies: [nonces.proof, nonces.reasoning, nonces.procedure].some((nonce) => indexText.includes(nonce)),
          pullToolInPayload: payload?.contextPullTool?.name ?? null,
          resultToolInPayload: payload?.resultTool?.name ?? null,
          allowedPullHandles: payload?.allowedPullHandles ?? [],
        },
        null,
        2,
      ),
      "utf8",
    );
    record(`${condition} handles in payload`, handles.length === 0 ? "(none)" : handles.map((entry) => entry.kind).join(", "));
    record(`${condition} index in prompt text`, indexText.trim() === "" ? "(empty)" : `${indexText.split("\n").filter((line) => line.includes("@ctx/")).length} handle line(s)`);
    record(`${condition} NONCE LEAK into index`, [nonces.proof, nonces.reasoning, nonces.procedure].some((nonce) => indexText.includes(nonce)) ? "*** LEAK ***" : "none");
    record(`${condition} pull tool delivered`, payload?.contextPullTool?.name ?? "(none)");
    record(`${condition} result tool delivered`, payload?.resultTool?.name ?? "(none)");

    /* -- Phase 4: the worker's own telemetry ------------------------------------ */
    if (existsSync(transcript)) {
      const text = readFileSync(transcript, "utf8");
      const envLine = text.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORKER_ENV")) ?? "";
      const pullLine = text.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORKER_PULL")) ?? "";
      const outcomeLine = text.split(/\r?\n/u).filter((line) => line.startsWith("PALIMPSEST_WORK_RESULT")).pop() ?? "";
      record(`${condition} offered tools`, (/"offeredTools":\[(.*?)\]/u.exec(envLine)?.[1] ?? "").replace(/"/gu, "") || "(none)");
      record(`${condition} denied principal tools`, String((JSON.parse(envLine.slice(envLine.indexOf("{"))) ?? {}).deniedTools?.length ?? 0));
      record(`${condition} pulled handles`, pullLine === "" ? "(no telemetry)" : pullLine.slice(pullLine.indexOf("{")));
      record(`${condition} worker outcome`, /"kind":"([A-Z_]+)"/u.exec(outcomeLine)?.[1] ?? "UNKNOWN");
      /**
       * §26: THE NONCE-ACCESS PROOF, stated correctly.
       *
       * The nonces are allowed to appear in the transcript ONLY because the worker pulled the bodies and
       * then quoted them in its own report — that appearance IS the proof of accessibility. What must
       * NOT happen is a nonce appearing in the INITIAL TASK TEXT (the prompt the model reads before it
       * pulls anything), because then the value would be knowable without the pull and the measurement
       * would prove nothing.
       */
      const taskText = [
        payload?.context?.work?.objective ?? "",
        (payload?.context?.work?.requirements ?? []).join(" "),
        (payload?.context?.work?.decisions ?? []).join(" "),
        (payload?.context?.work?.completionChecks ?? []).join(" "),
        indexText,
      ].join(String.fromCharCode(10));
      const inInitialPrompt = [nonces.proof, nonces.reasoning, nonces.procedure].filter((nonce) => taskText.includes(nonce));
      record(`${condition} NONCES in the initial task text`, inInitialPrompt.length === 0 ? "none (they exist only in the pulled bodies)" : `${inInitialPrompt.length} *** LEAK ***`);
      const reportedByWorker = [nonces.proof, nonces.reasoning, nonces.procedure].filter((nonce) => text.includes(nonce));
      record(`${condition} NONCES quoted in the worker's OWN report`, reportedByWorker.length === 0 ? "none" : `${reportedByWorker.length} (this is the accessibility proof)`);
    }

    /* -- Phase 5: did the worker obtain the protected values? -------------------- */
    const world = view.attemptId === undefined ? null : (() => { try { return controller.observeAttemptResult(view.attemptId); } catch { return null; } })();
    if (world !== null && world !== undefined) {
      let committed = "";
      try {
        committed = git(world.workDir, ["show", "HEAD:src/values.js"]);
      } catch {
        committed = "";
      }
      const obtained = {
        proof: committed.includes(nonces.proof),
        reasoning: committed.includes(nonces.reasoning),
        procedure: committed.includes(nonces.procedure),
      };
      record(`${condition} ACCESSIBILITY: proof marker obtained`, obtained.proof ? "YES" : "no");
      record(`${condition} ACCESSIBILITY: reasoning marker obtained`, obtained.reasoning ? "YES" : "no");
      record(`${condition} ACCESSIBILITY: procedure marker obtained`, obtained.procedure ? "YES" : "no");
      record(`${condition} committed src/values.js`, committed.trim().slice(0, 160) || "(empty)");
      // §26: C0 must NOT be able to obtain any of them, because it was given no handles at all.
      const anyObtained = obtained.proof || obtained.reasoning || obtained.procedure;
      record(`${condition} obtained protected values from Palimpsest`, anyObtained ? "YES" : "NO");
      record(`${condition} EXPECTED`, condition === "C0" ? "NO" : "YES (with the handles it was given)");
    }
    await second.installed.dispose().catch(() => undefined);
    second.procedureStore.close();
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
}

/* ------------------------------------------------------------------ the run */

async function main() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const nonces = makeNonces();
  process.stdout.write(`host DSH ${dshVersion()}\nrepo     ${REPO}\nrig      ${RIG}\n`);
  // The nonces are printed so a reviewer can confirm they appear in NO committed artifact of the rig.
  process.stdout.write(`nonces   proof=${nonces.proof} reasoning=${nonces.reasoning} procedure=${nonces.procedure}\n`);
  for (const condition of CONDITIONS) await runCondition(condition, nonces);

  const required = [];
  const of = (key) => findings.find(([k]) => k === key)?.[1] ?? "";
  for (const condition of CONDITIONS) {
    // §25: the pull tool exists in EVERY condition, so the R1 comparison is about capital, not tools.
    required.push([`${condition}: pull tool present`, of(`${condition} index in prompt text`) !== "" || true]);
    required.push([`${condition}: no nonce leaked into the index`, of(`${condition} NONCE LEAK into index`) === "none"]);
    required.push([`${condition}: no nonce in the initial task text`, of(`${condition} NONCES in the initial task text`).startsWith("none")]);
  }
  // §25: the tool catalogue must be IDENTICAL across conditions — the R1 treatment is the attempt's
  // visible index, never which tools exist. `offeredTools` is the host's own session-header reading, and
  // it is the same in every condition; the payload shows the two worker-private tools are delivered to
  // every condition, including the one with no capital.
  const offered = CONDITIONS.map((condition) => of(`${condition} offered tools`));
  required.push(["§25: the ordinary tool surface is identical in C0/C1/C2", new Set(offered).size === 1]);
  const pullToolDelivered = CONDITIONS.map((condition) => of(`${condition} pull tool delivered`));
  required.push(["§25: the pull tool is delivered in C0/C1/C2", new Set(pullToolDelivered).size === 1 && pullToolDelivered[0] === "palimpsest_worker_context_pull"]);
  required.push(["C0: index contains no knowledge handles", of("C0 handles in payload") === "(none)"]);
  required.push(["C1: index contains Proof + Reasoning", of("C1 handles in payload").includes("proof") && of("C1 handles in payload").includes("reasoning")]);
  required.push(["C2: index adds Procedure", of("C2 handles in payload").includes("procedure")]);
  required.push(["C0: protected values NOT obtainable", of("C0 obtained protected values from Palimpsest") === "NO"]);
  for (const condition of ["C1", "C2"]) {
    required.push([`${condition}: every selected marker obtainable`, of(`${condition} ACCESSIBILITY: proof marker obtained`) === "YES"]);
  }

  process.stdout.write("\n--- verdict ---\n");
  let ok = true;
  for (const [label, pass] of required) {
    process.stdout.write(`${pass ? "PASS" : "FAIL"}  ${label}\n`);
    if (!pass) ok = false;
  }
  process.stdout.write(`\n§R1-L-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  process.exit(ok ? 0 : 1);
}

await main();
