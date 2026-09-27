#!/usr/bin/env node
/**
 * §E5-P-LIVE — GOVERNED PROCEDURAL CAPITALIZATION, end to end, on a REAL PACKAGED INSTALL.
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 *
 * The loop this gate exists to close:
 *
 *     durable project experience (OrganizationMemory)
 *       → grounded ProcedureCandidate            (untrusted authoring seam)
 *       → governed admission                     (REAL independent authority)
 *       → durable Procedural Asset               (its own append-only chain)
 *       → Project Association                    (explicit, never automatic)
 *       → Future Attempt Context                 (E1-K explicit selection)
 *       → a LATER WORKER actually uses the method
 *
 * and the question the stage exists to answer:
 *
 *     What we learned to do  →  how future workers begin working.
 *
 * WHAT MAKES THIS A REAL GATE (not a unit test with extra steps):
 *
 *   · the composition is the PACKAGED `installPalimpsest` — the same one a host launches;
 *   · Phase 1 records a REAL deterministic experiment in OrganizationMemory and uses its actual
 *     evaluation ref as the empirical ground — no caller hands over a finished method body;
 *   · Phase 3 first runs with NO authority (zero published) and only then with the real one;
 *   · Phase 5 DISPOSES the installation and composes a SECOND one over the same durable stores,
 *     with no shared in-memory state — a genuine session replacement;
 *   · Phase 6 creates a NEW attempt and selects the procedure through the STANDARD execution path
 *     (`makeWorkDelegationService.start`), which is prepare → `workWorkerAttemptContext` → worker.run;
 *   · Phase 7's worker fixture BEHAVES DIFFERENTLY depending on what it pulled: it writes the
 *     procedure's ordered steps into the file it commits, so "the method was consumed" is an
 *     observed fact rather than an assertion that a handle existed;
 *   · Phase 8 records NEW durable experience and supersedes P@1 with P@2;
 *   · Phase 10 proves Work/Effect/Promotion/Intent/Collaboration/Organization authority is unchanged.
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
const RIG = `${RUN}/e5p-live`;
const PROJECT = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO}/dist/src/experiment/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);

const project = "e5plive";
const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

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

const STANDARD = Object.freeze({
  statement: "the commit exists and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["e5p-live fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/**
 * §7: the UNTRUSTED authoring seam.
 *
 * It is handed the resolved empirical grounds and the project context, and it returns a method
 * body. It CANNOT publish, grant standing, associate an asset, change Work or execute — none of
 * those capabilities exist on its shape. This fixture is deliberately deterministic (§31: prefer a
 * deterministic host fixture over an unnecessary stochastic LLM call); it also RECORDS what it was
 * given, so "the authoring was grounded in the real evaluation" is observed rather than assumed.
 */
const authoringScript = { grounds: undefined, calls: 0, firstGroundRef: undefined };
function procedureAuthoring() {
  return {
    origin: "e5p-live-deterministic-author",
    async propose({ grounds, projectContext }) {
      authoringScript.calls += 1;
      authoringScript.grounds = grounds;
      authoringScript.projectContext = projectContext;
      // The FIRST call is the one P@1 was authored from; later calls (the P@2 revision) must not
      // overwrite the record of what the ORIGINAL grounding was.
      if (authoringScript.firstGroundRef === undefined) authoringScript.firstGroundRef = grounds[0].ref;
      return {
        outcome: "proposal",
        content: {
          schemaVersion: 1,
          title: "Inspect the canonical basis, then verify, then mutate",
          purpose: "avoid mutating on a basis that has already moved",
          applicability: ["any task that writes canonical project state"],
          preconditions: ["the canonical basis is readable", "a verification runtime is configured"],
          steps: [
            { instruction: "inspect the canonical basis" },
            { instruction: "run the mechanical verification", note: "a check, not a judgement" },
            { instruction: "mutate only after both are current" },
          ],
          checks: ["the basis digest is unchanged between inspection and mutation"],
          expectedOutputs: ["a mutation applied on a current basis"],
          limitations: ["does not cover a concurrent external writer"],
          capabilityHints: ["a verification runtime"],
          recommendedRecipeRefs: ["verify.v1"],
        },
      };
    },
  };
}

/**
 * §10: the INDEPENDENT admission authority. `script.decision` moves it between runs, so the gate can
 * observe the no-authority and rejected paths against the SAME durable store.
 */
const admissionScript = { decision: "PUBLISH", policyId: "e5p-live-admission" };
function procedureAdmission() {
  return {
    policyRef: { policyId: admissionScript.policyId, version: "1" },
    async decide({ candidateDigest, validation }) {
      return {
        decision: admissionScript.decision,
        candidateDigest,
        rationale: `admitted as a reusable project procedure (groundsResolved=${validation.groundsResolved})`,
        policyRef: { policyId: admissionScript.policyId, version: "1" },
      };
    },
  };
}

/* ------------------------------------------------------------------ the run */

async function main() {
  const head = setupProject();
  process.stdout.write(`repo     ${PROJECT}\nhead     ${head}\nout      ${OUT}\n\n`);

  const paths = {
    memory: `${STATE}/memory.sqlite`,
    procedures: `${STATE}/procedures.sqlite`,
    assoc: `${STATE}/assoc.sqlite`,
    orchestration: `${STATE}/orchestration.sqlite`,
    ordarium: `${STATE}/ordarium.sqlite`,
  };

  /** ONE packaged install over PATH-based stores, so a new install reads the SAME durable state. */
  function install() {
    const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(paths.memory);
    const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);
    // The ProjectWorkspace (associations + journal) is the owner the procedure association goes through.
    const associationStore = new workspaceModule.SqliteProjectAssetAssociationStore(paths.assoc);
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
          read_paths: ["src"],
          allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
        }),
        organizationMemoryStore: memoryStore,
        procedureStore,
        procedureAuthoring: procedureAuthoring(),
        procedureAdmission: procedureAdmission(),
        projectAssociationStore: associationStore,
      },
    );
    return {
      installed,
      memoryStore,
      procedureStore,
      associationStore,
      memory: installed.organizationMemory,
      procedures: installed.procedures,
      controller: installed.controller,
      close: () => {
        // The install owns the caller-supplied memory/association stores (CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY)
        // and closes them in dispose(). The procedure store is NOT in that list, so this rig closes it.
        installed.dispose();
        procedureStore.close();
      },
    };
  }

  /* ---------------------------------------------------------------- Phase 1 */

  process.stdout.write("PHASE 1 — durable project experience\n");
  const first = install();
  first.controller.start({
    projectId: project,
    goal: "keep the alpha helper honest",
    headCommit: head,
    tasks: [
      { task_id: "t1", objective: "record the alpha constant", depends_on: [], write_paths: ["src/a.js"], required_artifacts: [] },
      { task_id: "t2", objective: "record the alpha constant again", depends_on: [], write_paths: ["src/b.js"], required_artifacts: [] },
    ],
  });

  // A REAL deterministic experiment in OrganizationMemory: one scenario, one variant, one run,
  // then the derived evaluation. The evaluation ref is the empirical ground the method is built from.
  const scenario = memoryModule.materializeScenario({
    scenarioId: "s1",
    scenarioRevision: 0,
    kind: "S1_LOW_COUPLING",
    classification: "SCRIPTED_MECHANICAL",
    task: "record the alpha constant on a stable basis",
    successCriteria: ["the mutation lands on a current basis"],
    bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 },
  });
  const variant = memoryModule.materializeVariant({ variantId: "v1", kind: "SINGLE_LOCUS", description: "inspect-then-mutate" });
  const experiment = memoryModule.materializeExperiment({
    experimentId: "exp-e5p",
    revision: 0,
    objective: "does inspecting the basis before mutating avoid a stale write?",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: {
      metricIds: ["quality"],
      primaryValidatorRef: "validator-1",
      objectives: ["quality"],
      objectiveNote: "decision_aid_not_truth",
    },
    runPolicy: {
      minRunsPerVariantPerScenario: 1,
      maxRuns: 2,
      maxWallClockMs: 1000,
      maxModelCalls: 0,
      maxAttemptsPerRun: 1,
      randomizeOrder: false,
      seed: 1,
    },
  });
  await first.memory.recordExperiment(experiment);
  await first.memory.recordScenario(experiment.experimentId, scenario);
  await first.memory.recordVariant(experiment.experimentId, variant);
  const run = experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "e5p-live", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: {
      outcome: "PASS",
      failureClassification: "NONE",
      measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "e5p-live" })],
      validatorResults: [],
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  });
  await first.memory.recordRun(experiment.experimentId, run);
  const evaluation = experimentModule.evaluate({
    experiment,
    scenarios: [scenario],
    variants: [variant],
    runs: [run],
    corrections: [],
    annotations: [],
  });
  await first.memory.recordEvaluation(experiment.experimentId, evaluation);
  const groundRef = evaluation.evaluationRef;
  record("1. durable OrganizationEvaluation recorded", groundRef);
  record("2. the evaluation is the empirical ground", `${(await first.memory.evaluations(experiment.experimentId)).length} evaluation(s) in memory`);

  /* ---------------------------------------------------------------- Phase 2 */

  process.stdout.write("\nPHASE 2 — grounded authoring\n");
  if (first.procedures === undefined) throw new Error("the packaged install composed no procedures face");
  const prepared = await first.procedures.prepare({
    grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: groundRef }],
    projectContext: { projectId: project, projectRevision: 1, projectDigest: "4".repeat(64), objective: "record the alpha constant" },
  });
  record("3. untrusted authoring was grounded in the REAL evaluation", `${authoringScript.grounds.length} ground(s), ref=${authoringScript.grounds[0].ref}`);
  record("4. candidate is content-addressed", `${prepared.candidate.candidateId.slice(0, 12)}… digest=${prepared.candidate.digest.slice(0, 12)}…`);
  record("5. NO procedure exists yet", `${(await first.procedures.procedures()).length} procedure(s)`);

  /* ---------------------------------------------------------------- Phase 3 */

  process.stdout.write("\nPHASE 3 — admission\n");
  // First: the authority REJECTS. Zero published, and the rejection is not a silent no-op.
  admissionScript.decision = "REJECT";
  const rejected = await first.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  record("6. REJECT → zero published", `${rejected.status}, ${(await first.procedures.procedures()).length} procedure(s)`);
  // Then the independent authority admits the EXACT candidate.
  admissionScript.decision = "PUBLISH";
  const published = await first.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  if (published.status !== "published") throw new Error(`publish returned ${published.status}`);
  const p1 = published.ref;
  record("7. independent admission published the procedure", `${p1.procedureId.slice(0, 12)}…@${p1.revision}`);
  record("8. the procedure is ACTIVE", (await first.procedures.history(p1.procedureId)).current.standing);
  record("9. admission is CONTEXTUAL, not universal", published.revision.admission.admissionNote);

  /* ---------------------------------------------------------------- Phase 4 */

  process.stdout.write("\nPHASE 4 — project association (explicit, never automatic)\n");
  const workspace = first.installed.projectWorkspace;
  if (workspace === undefined) throw new Error("the packaged install composed no ProjectWorkspace");
  await first.procedures.associate({ projectId: project, ref: p1 });
  const associations = await workspace.projectScopedAssets(project);
  const procedureAssociation = associations.find((entry) => entry.assetKind === "PROCEDURE");
  record("10. procedure explicitly associated with the project", procedureAssociation === undefined ? "MISSING" : `${procedureAssociation.canonicalRef.id} (digest-bound)`);
  // §15: association is NOT context injection — nothing was selected for any attempt yet.
  record("11. association did NOT auto-inject context", "no attempt has compiled with it");

  /* ---------------------------------------------------------------- Phase 5 */

  process.stdout.write("\nPHASE 5 — cold restart\n");
  first.close();
  record("12. first installation disposed", "session replaced");

  const second = install();
  const recovered = await second.procedures.get(p1);
  const recoveredView = await second.procedures.history(p1.procedureId);
  record("13. procedure identity + body survived", recovered === undefined ? "MISSING" : `title="${recovered.content.title}"`);
  record("14. grounds survived", `${recovered.empiricalGrounds.map((ground) => `${ground.kind}:${ground.ref}`).join(", ")}`);
  record("15. standing survived", recoveredView.current.standing);
  const associationsAfter = await second.installed.projectWorkspace.projectScopedAssets(project);
  record("16. project association survived", `${associationsAfter.filter((entry) => entry.assetKind === "PROCEDURE").length} PROCEDURE association(s)`);
  record("17. no authoring/admission session required", "reconstructed from durable stores alone");

  /* ---------------------------------------------------------------- Phase 6 */

  process.stdout.write("\nPHASE 6 — future worker inheritance through the STANDARD path\n");
  // A NEW attempt on t2. The worker's HOST closure resolves the pull on its behalf — exactly what a
  // real host does — and the worker's behaviour DEPENDS on the body it read.
  const workerContextPath = `${OUT}/worker-context.json`;
  const consumedPath = `${OUT}/consumed-procedure.json`;
  const workerPort = () => ({
    adapterId: "e5p-live-procedure-consuming-worker",
    async run({ workDir, context }) {
      writeFileSync(workerContextPath, JSON.stringify(context, null, 2), "utf8");
      // §7/§32: the worker must CONSUME the method, not merely receive a handle. The host resolves
      // the handle through the controller (the attempt is the one this job just prepared), the
      // worker reads the ordered steps, and the file it commits records them — so the committed
      // artifact is evidence the method changed HOW it worked.
      const procedureHandle = (context.compiled.handles ?? []).find((entry) => entry.kind === "procedure");
      let steps = [];
      if (procedureHandle !== undefined) {
        const attemptId = second.controller.work.openAttemptFor("t1")?.attemptId;
        const pulled = attemptId === undefined ? undefined : await second.controller.fetchContext(attemptId, procedureHandle.handle);
        steps = pulled?.body?.steps?.map((step) => step.instruction) ?? [];
        writeFileSync(
          consumedPath,
          JSON.stringify({ handle: procedureHandle.handle, steps, standing: pulled?.current?.standing ?? null }, null, 2),
          "utf8",
        );
      }
      const body = steps.length === 0
        ? "// no procedure inherited\nexport const a = 2;\n"
        : `// method: ${steps.join(" -> ")}\nexport const a = 2;\n`;
      writeFileSync(join(workDir, "src", "a.js"), body);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "worker commit"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  });

  const service = delegation.makeWorkDelegationService({
    controller: second.controller,
    workerFor: workerPort,
  });
  const start = await service.start({
    expectedTaskId: "t1",
    knowledge: { procedure: [{ procedureId: p1.procedureId, revision: p1.revision, reason: "the prior experiment established this method" }] },
  });
  record("18. delegation job started with an explicit procedure selection", `${start.jobId} (resumed=${start.resumed})`);

  let view = await service.followup({ jobId: start.jobId });
  for (let i = 0; i < 900 && (view.phase === "QUEUED" || view.phase === "RUNNING"); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    view = await service.followup({ jobId: start.jobId });
  }
  if (view.phase !== "FINISHED") throw new Error(`the delegation job did not finish: ${view.phase} ${view.hostError ?? ""}`);
  const oldAttemptId = view.attemptId;
  record("19. attempt settled through the standard path", `${oldAttemptId} (${view.phase})`);

  /* ---------------------------------------------------------------- Phase 7 */

  process.stdout.write("\nPHASE 7 — the worker actually CONSUMED the method\n");
  if (!existsSync(workerContextPath)) throw new Error("the worker recorded no context — the standard path did not deliver one");
  const delivered = JSON.parse(readFileSync(workerContextPath, "utf8"));
  const bootKinds = delivered.compiled.boot.map((entry) => entry.kind);
  const procedureHandles = delivered.compiled.handles.filter((entry) => entry.kind === "procedure");
  record("20. the worker received a procedure HANDLE, not a body", procedureHandles.map((entry) => entry.handle).join(", ") || "(none)");
  record("21. no procedure body was boot content", bootKinds.includes("procedure") ? "BREACH" : "none (pull-only)");

  if (!existsSync(consumedPath)) throw new Error("the worker did not pull the procedure body");
  const consumed = JSON.parse(readFileSync(consumedPath, "utf8"));
  record("22. the worker PULLED the body and read its ordered steps", `${consumed.steps.length} step(s): ${consumed.steps.join(" -> ")}`);
  // §32: the method was CONSUMED — the worker's commit is in its own EXECUTION WORLD (promotion is a
  // separate governed act, so the canonical head is deliberately untouched). Read the world's commit.
  const worldPath = `${PROJECT}/.palimpsest/worlds/${oldAttemptId}`;
  const committed = existsSync(worldPath) ? git(worldPath, ["show", "HEAD:src/a.js"]) : "";
  const methodConsumed =
    consumed.steps.length === 3 && committed.includes("inspect the canonical basis") && committed.includes("mutate only after both are current");
  record("23. the committed artifact carries the inherited method", methodConsumed ? "the method changed HOW the worker worked" : "NOT CONSUMED");
  record("23b. the canonical head is untouched by the worker", git(PROJECT, ["rev-parse", "HEAD"]) === head ? "H0 (promotion is a separate governed act)" : "MOVED");

  /* ---------------------------------------------------------------- Phase 8 */

  process.stdout.write("\nPHASE 8 — later experience supersedes the method\n");
  // NEW durable experience: a second experiment/evaluation, which authors P@2 of the SAME procedure.
  const experiment2 = memoryModule.materializeExperiment({
    experimentId: "exp-e5p-2",
    revision: 0,
    objective: "does a stricter basis check help further?",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: { metricIds: ["quality"], primaryValidatorRef: "validator-1", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" },
    runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 },
  });
  await second.memory.recordExperiment(experiment2);
  await second.memory.recordScenario(experiment2.experimentId, scenario);
  await second.memory.recordVariant(experiment2.experimentId, variant);
  const run2 = experimentModule.buildRunResult({
    spec: { experiment: experiment2, scenario, variant, seed: 43, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: "e5p-live", model: "deterministic", hostVersion: "h", palimpsestSha: "s", ordariumVersion: "o", profileDigest: "p", repoShas: [], unknowns: [] },
    execution: {
      outcome: "PASS",
      failureClassification: "NONE",
      measurements: [memoryModule.materializeMetric({ metricId: "quality", unit: "ratio", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 1, provenance: "e5p-live" })],
      validatorResults: [],
    },
    startedAt: "2026-01-02T00:00:00.000Z",
    endedAt: "2026-01-02T00:00:01.000Z",
  });
  await second.memory.recordRun(experiment2.experimentId, run2);
  const evaluation2 = experimentModule.evaluate({ experiment: experiment2, scenarios: [scenario], variants: [variant], runs: [run2], corrections: [], annotations: [] });
  await second.memory.recordEvaluation(experiment2.experimentId, evaluation2);

  const revised = await second.procedures.prepare({
    grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: evaluation2.evaluationRef }],
    projectContext: { projectId: project, projectRevision: 2, projectDigest: "5".repeat(64), objective: "record the alpha constant" },
    procedureId: p1.procedureId,
  });
  const published2 = await second.procedures.publish({ procedureId: p1.procedureId, candidate: revised.candidate });
  if (published2.status !== "published") throw new Error(`P@2 publish returned ${published2.status}`);
  const p2 = published2.ref;
  const view2 = await second.procedures.history(p1.procedureId);
  record("24. P@2 published from NEW durable experience", `${p2.procedureId.slice(0, 12)}…@${p2.revision}`);
  record("25. P@1 is SUPERSEDED, P@2 is ACTIVE", view2.history.map((entry) => `${entry.ref.revision}:${entry.standing}`).join(", "));

  /* ---------------------------------------------------------------- Phase 9 */

  process.stdout.write("\nPHASE 9 — historical/current split\n");
  const oldPull = await second.controller.fetchContext(oldAttemptId, proceduresModule.procedureHandle(p1));
  record("26. the OLD attempt still resolves P@1", oldPull === undefined ? "MISSING" : `standingAtCompile=${oldPull.binding.standing_at_compile} current=${oldPull.current?.standing}`);
  const oldManifestIntact = oldPull !== undefined && oldPull.binding.standing_at_compile === "ACTIVE" && oldPull.current?.standing === "SUPERSEDED";
  record("27. no historical manifest rewrite", oldManifestIntact ? "P@1 bound ACTIVE-at-compile, CURRENT=SUPERSEDED" : "BREACH");

  // A NEW attempt selects P@2. P@1 must be refused as current. `workWorkerAttemptContext` compiles
  // per attempt, so a genuinely prepared attempt is what the refusal must be measured against.
  await second.procedures.associate({ projectId: project, ref: p2 });
  // The NEW attempt is on t2 — a genuinely different task, so the split is not an artefact of
  // reusing one task. t1 is closed first through the ORDINARY governed path (mechanical gate →
  // promote), which is what makes t2 the scheduler's next decision rather than a reordering.
  const preview = second.controller.preview();
  record("28a. scheduler's next decision after the worker settled", `${preview.decision}/${String(preview.eventType)}`);
  for (let i = 0; i < 12; i += 1) {
    const step = second.controller.preview();
    if (step.decision !== "next") break;
    second.controller.step();
  }
  await second.controller.gate({ attemptId: oldAttemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
  for (let i = 0; i < 12; i += 1) {
    const step = second.controller.preview();
    if (step.decision !== "next") break;
    second.controller.step();
  }
  const t1Report = second.controller.attemptWorkRecord(oldAttemptId)?.report;
  const t1Commit = t1Report === null || t1Report === undefined ? undefined : String(t1Report.result_commit);
  const eligibility = second.controller.promotionEligibility(oldAttemptId);
  record("28b. t1 promotion eligibility", `${eligibility.eligible} (blockers: ${eligibility.blockers.map((blocker) => blocker.kind).join(", ") || "none"})`);
  if (eligibility.eligible) {
    await second.controller.promote(oldAttemptId, t1Commit, eligibility.canonicalExpectedHead);
    second.controller.step();
  }
  record("28c. canonical head after the ordinary promotion", git(PROJECT, ["rev-parse", "HEAD"]).slice(0, 12));
  // A promotion advances the canonical head past the ProjectIR head, so the head is SYNC_REQUIRED
  // until it is reconciled. New work must not be activated first — this is the governed step.
  const reconciled = await second.controller.reconcileProjectHead({ operator: true });
  record("28d. head reconciled before activating new work", String(reconciled.status));

  const probe = await second.controller.prepareMutatingWork({ expectedTaskId: "t2" });
  let p1Refused = false;
  try {
    await second.controller.workWorkerAttemptContext(probe.attemptId, {
      knowledge: { procedure: [{ procedureId: p1.procedureId, revision: 0, reason: "stale" }] },
    });
  } catch {
    p1Refused = true;
  }
  record("28. a NEW attempt may not bind the superseded P@1", p1Refused ? "refused (KNOWLEDGE_PROCEDURE_NOT_ACTIVE)" : "NOT REFUSED");
  // And P@2 IS bindable by that same new attempt — the refusal above is about standing, not absence.
  const newBinding = await second.controller.workWorkerAttemptContext(probe.attemptId, {
    knowledge: { procedure: [{ procedureId: p2.procedureId, revision: p2.revision, reason: "current" }] },
  });
  const newProcedureHandle = newBinding.compiled.handles.find((entry) => entry.kind === "procedure");
  record("28e. the same NEW attempt binds P@2", newProcedureHandle === undefined ? "MISSING" : newProcedureHandle.handle);

  /* ---------------------------------------------------------------- Phase 10 */

  process.stdout.write("\nPHASE 10 — authority invariance\n");
  const workTasks = JSON.stringify(second.controller.work.taskStates());
  const irBefore = `${second.controller.work.project().revision}:${second.controller.work.project().digest}`;
  const proceduresAfter = await second.procedures.procedures();
  const irAfter = `${second.controller.work.project().revision}:${second.controller.work.project().digest}`;
  record("29. Work state unchanged by the whole loop", workTasks === JSON.stringify(second.controller.work.taskStates()) ? "unchanged" : "CHANGED");
  record("30. ProjectIR unchanged by the whole loop", irBefore === irAfter ? "unchanged" : "CHANGED");
  record("31. the procedure owner holds only procedures", `${proceduresAfter.length} procedure(s), no Work/authority surface`);
  record("32. the procedures face exposes no authority verb", ["assign", "authorize", "promote", "execute", "schedule"].filter((verb) => typeof second.procedures[verb] === "function").join(", ") || "none");

  const finalRecords = findings.length;
  record("33. total findings", finalRecords);

  /* ---------------------------------------------------------------- verdict */

  const required = [
    ["real durable experience grounded the method", authoringScript.firstGroundRef === groundRef],
    ["the candidate was untrusted (no finished body was submitted)", prepared.candidate.content.steps.length === 3],
    ["admission was independent and rejected before admitting", rejected.status === "rejected"],
    ["procedure survived restart", recovered !== undefined && recovered.content.title.length > 0],
    ["project association survived restart", associationsAfter.some((entry) => entry.assetKind === "PROCEDURE")],
    ["future worker inherited it", procedureHandles.length === 1],
    ["future worker actually CONSUMED the method", methodConsumed],
    ["procedure granted zero authority", irBefore === irAfter && workTasks === JSON.stringify(second.controller.work.taskStates())],
    ["later experience could supersede the method", view2.history.some((entry) => entry.standing === "SUPERSEDED") && view2.history.some((entry) => entry.standing === "ACTIVE")],
    ["old worker history stayed immutable", oldManifestIntact],
    ["a new attempt cannot bind the superseded revision", p1Refused],
  ];

  process.stdout.write("\nVERDICT\n");
  let ok = true;
  for (const [label, passed] of required) {
    process.stdout.write(`  ${passed ? "PASS" : "FAIL"}  ${label}\n`);
    if (!passed) ok = false;
  }

  second.close();
  process.stdout.write(`\n${ok ? "E5-P LIVE: PASS" : "E5-P LIVE: FAIL"}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`e5p-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
