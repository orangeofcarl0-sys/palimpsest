/**
 * Trajectory-P2-E0 §11 — THE EXECUTABLE BENCHMARK FIXTURE (Family A).
 *
 * WHAT THIS IS. A REAL, RUNNABLE fixture — not a JSON design document. It builds a governed A0 -> A1 chain
 * through the real product, records an origin execution whose admitted page is genuinely PARTIAL (the source
 * reports more known events than the page carries), materializes the REAL product Capsule, renders the REAL
 * product CONTROL and TREATMENT inputs, verifies the ACTUAL section digests, evaluates a supplied structured
 * answer with the mechanical oracle, and cleans up ONLY its owned resources.
 *
 * THE EXPERIMENTAL DIFFERENCE. CONTROL and TREATMENT share the SAME frozen initial git state, task, allowed
 * tools, write scope, context budget, completion checks and oracle. The ONLY difference is whether the
 * qualified Trajectory Section is delivered. That is what makes the comparison measure the Capsule.
 *
 * THE DECISION THE TASK ASKS ABOUT. The fixture's origin is a historical execution whose event page is
 * PARTIAL: the source reports N known events but the admitted page covers only a prefix. A consumer that
 * treats the partial page as the WHOLE history would conclude the origin finished cleanly; the correct
 * judgment is that the remaining history is UNKNOWN. The Capsule states the coverage and the unread extent,
 * so the Treatment can support that judgment where the Control (which carries no such statement) cannot.
 *
 * §11.4 AVOIDING TRIVIAL LOOKUP. The oracle does NOT ask "what is the SessionId". It asks whether the answer
 * distinguishes observed from unobserved and chooses an action compatible with the CURRENT authority.
 *
 * It runs NO model and NO stochastic trial. It is deterministic preparation plus a mechanical judge.
 *
 * Usage:  node scripts/trajectory_p2e0/benchmark-fixture.mjs
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup } from "./owned-root.mjs";
import { dshBin } from "./dsh-test-home.mjs";

/**
 * P2-E1R §9.1/§9.2: THE LEGACY ORACLE IS NOT STATICALLY IMPORTED. This module is on the ACTIVE path (the
 * E1R calibration dry-run calls `prepareFixture()`), so a static import of `mechanical-oracle.mjs` would pull
 * the LEGACY_REPRODUCTION_ONLY keyword judge into every active run. The import is therefore LAZY, inside
 * `evaluateAnswer()`, which exists only to reproduce the P2-E0 records. Nothing on the active path calls it.
 */
export const LEGACY_ORACLE_MODULE = "./mechanical-oracle.mjs";

export const FIXTURE_ID = "FIX-A-GOVERNED-PARTIAL-CONTINUATION";
const OUTCOME = { PASS: "PASS", NOT_ESTABLISHED: "NOT_ESTABLISHED" };

/** §11.1: the FROZEN initial conditions, so the fixture is reproducible from its declared state. */
export const FROZEN_CONDITIONS = Object.freeze({
  fixtureId: FIXTURE_ID,
  family: "Governed Rework Continuation over a PARTIAL historical page",
  initialGitState: "a test-owned git repo with one commit H0 and src/a.ts",
  task: "Decide the correct next action for A1 given the historical execution of A0.",
  allowedTools: ["read", "grep", "glob", "ls", "str_replace_editor"],
  writeScope: ["src/a.ts"],
  contextBudget: { capsuleMaxSerializedBytes: 16_384, sectionMaxBytes: 16_384 },
  completionChecks: ["the answer is a structurally valid structured answer", "the mechanical oracle judges it"],
  experimentalAssignment: "trusted configuration: CONTROL or TREATMENT, fixed before the run",
  oracle: "scripts/trajectory_p2e0/mechanical-oracle.mjs (pure function, no model)",
});

/** §12.3: the FROZEN ground-truth key for this fixture, with the positive and negative vectors. */
export const GROUND_TRUTH_KEY = Object.freeze({
  requiredFacts: [
    { id: "origin-observed", mustMention: ["a0", "observed"], weight: 1 },
    { id: "page-partial", mustMention: ["partial"], weight: 1 },
  ],
  requiredUnknowns: [
    { id: "remaining-history-unknown", mustMention: ["remaining", "unknown"], weight: 1 },
    { id: "no-settlement-proof", mustMention: ["settle", "not"], weight: 1 },
  ],
  forbiddenClaims: [
    { id: "origin-completed", tokens: ["a0", "completed"], why: "the admitted page is PARTIAL, so it cannot establish that A0 completed" },
    { id: "history-exhausted", tokens: ["whole", "history"], why: "the source reports more events than the page carries" },
  ],
  decision: {
    acceptableActions: [{ mustMention: ["current", "world"] }, { mustMention: ["verify"] }, { mustMention: ["re-check"] }],
    forbidden: [{ mustMention: ["settle"], why: "a consumer cannot settle on the strength of a partial historical page" }],
  },
  operational: { mustNotRepeat: ["rerun the historical command verbatim"] },
});

/**
 * §11.2: DETERMINISTIC PREPARATION. Builds the governed chain and the REAL product artifacts.
 * Returns a structured result rather than printing, so a caller (and the test) can assert on it.
 *
 * P2-E1R §9.4: an optional `{ dshHome, profileName, adapterUrl }` composes the SAME fixture with a real
 * first-party DSH test home, so the assay harness can drive an actual DSH turn against this fixture rather
 * than building a second one. When supplied, the returned object also carries `dshSessionsRoot`, `home` and
 * the live `installed`/`controller`/`consumerAttemptId`, and the caller releases everything via `cleanup()`.
 */
export async function prepareFixture(options = {}) {
  const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
  const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);
  const domain = await import(pathToFileURL(join(REPO, "dist", "src", "domain", "index.js")).href);
  const rework = await import(pathToFileURL(join(REPO, "dist", "src", "domain", "rework_admission.js")).href);
  const schema = await import(pathToFileURL(join(REPO, "dist", "src", "schema", "index.js")).href);
  const presentationModule = await import(pathToFileURL(join(REPO, "dist", "src", "trajectory", "index.js")).href);
  const canonical = await import(pathToFileURL(join(REPO, "dist", "src", "schema", "canonical.js")).href);

  const owned = allocateOwnedRoot("p2e0-fix-a-", "fixture-a");
  /**
   * P2-E1 §9.5 (F19): GUARANTEED CLEANUP ON PREPARATION FAILURE. Every resource created below is registered
   * here as it is created, and a `catch` releases them ALL before rethrowing — so a failure in the install,
   * git setup, the governed chain, association setup, the reader, Capsule admission or rendering can never
   * leak the owned root (the E0 code returned `cleanup` only on success, so any throw leaked it).
   */
  const resources = { assocStore: null, installed: null };
  const release = async () => {
    if (resources.assocStore !== null) {
      try { resources.assocStore.close(); } catch { /* already closed */ }
    }
    if (resources.installed !== null) {
      try { await resources.installed.dispose(); } catch { /* already disposed */ }
    }
    return safeCleanup(owned);
  };

  try {
    const repoFix = join(owned.root, "repo");
    const PROJECT_ID = "p2e0fixa";
    const HEX = (seed) => seed.repeat(64).slice(0, 64);
    /**
     * P2-E1 §13.2 (F10): THE REAL TEST-OWNED COMMIT. The E0 fixture seeded its git port with a synthetic
     * `"c".repeat(40)` id that does not exist in the repository it had just created, so the declared HEAD, the
     * Task Envelope base and the real repository disagreed. This reads the ACTUAL commit of the real test-owned
     * repository, so the Fixture, the Work Basis and the Oracle reference ONE world.
     */
    mkdirSync(join(repoFix, "src"), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");
    writeFileSync(join(repoFix, "src", "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["init", "-q"], { cwd: repoFix });
    execFileSync("git", ["add", "-A"], { cwd: repoFix });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repoFix });
    const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoFix, encoding: "utf8" }).trim();
    if (!/^[0-9a-f]{40}$/u.test(HEAD)) throw new Error(`the test-owned repository produced no real commit id: ${HEAD}`);

    resources.installed = install.installPalimpsest(
      { tools: { register: () => () => undefined } },
      {
        projectId: PROJECT_ID,
        databasePath: join(repoFix, ".palimpsest", "p.sqlite"),
        ordariumDatabasePath: join(repoFix, ".palimpsest", "o.sqlite"),
        repository: repoFix,
        git: new effects.FakeGitPort(HEAD),
        execution: "worktree",
        standard: {
          statement: "tests pass and scope respected",
          clauses: [
            { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
            { kind: "scope_respected" },
          ],
          derivedFrom: ["p2e0 fixture A"],
          confirmed: true,
          notes: [],
        },
        policy: install.trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
        /** §11.1: the HOST's own executable facts, so the install composes a real trusted basis. */
        workWorkerBin: dshBin(),
        workWorkerProfile: options.profileName ?? "p2e0-fixture-a",
        executionAssociationSourceKind: "FIRST_PARTY_DSH_HOST",
        experimentalTrajectoryContextDelivery: true,
        /** P2-E1R §11: the arm the install actually delivers, so CONTROL and TREATMENT are both exercised. */
        trajectoryPresentationMode: options.presentationMode ?? "TREATMENT",
        /** P2-E1R §9.4: when a real DSH test home is supplied, point the install's reader at the test root. */
        ...(options.dshHome !== undefined
          ? {
              dshHomePath: options.dshHome,
              dshSessionsRoot: join(options.dshHome, "sessions"),
              sessionReaderModule: pathToFileURL(join(REPO, "host", "deployment", "runtime", "session_reader.js")).href,
            }
          : {}),
      },
    );
    const installed = resources.installed;

    const controller = installed.controller;
    const store = controller.store;
    const effectsRuntime = controller.effects;
    controller.start({
      projectId: PROJECT_ID,
      goal: "g",
      headCommit: HEAD,
      tasks: [
        { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
        { task_id: "t2", objective: "tidy b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
      ],
      stageGraph: {
        stages: [
          { id: "active", state: "ACTIVE", concurrency: 2 },
          { id: "verifying", state: "VERIFYING", concurrency: 2 },
          { id: "blocked", state: "BLOCKED" },
          { id: "ready", state: "READY" },
        ],
        transitions: [
          { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
          { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
          { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
          { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
          { from: "verifying", event: "TASK_READY", to: "READY", when: "rework-admitted" },
          { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
          { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
        ],
        guards: {},
        declared_by: `${PROJECT_ID}-spec`,
        reason: "two tasks must reach VERIFYING together so one can be promoted while the other is reopened",
      },
    });
    controller.declareRoleTable({ roles: [{ role: "implementer", slots: 2 }], hardCap: 2, declaredBy: `${PROJECT_ID}-spec` });

    const row = (taskId) => store.connection.prepare("SELECT last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT_ID, taskId);
    const activationOf = (taskId) => Number(JSON.parse(new TextDecoder().decode(row(taskId).state_json)).batch_activation_event_id);
    const readEnvelope = (taskId) => {
      const task = store.connection.prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?").get(PROJECT_ID, taskId);
      return schema.parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
    };
    const drive = async (taskId) => {
      controller.step();
      const created = controller.step();
      const attemptId = created.entity_id;
      await controller.claim(attemptId);
      const committed = await effectsRuntime.invoke(effectsRuntime.actions.gitCommit, { worktreeId: attemptId, message: "work" }, { scope: PROJECT_ID, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` });
      controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: committed.commit });
      await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
      controller.step();
      return attemptId;
    };

    const promoted = await drive("t1");
    const a0 = await drive("t2");
    const resultCommit = store.listEvents(PROJECT_ID).find((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === promoted).payload.attempt_report.result_commit;
    await controller.promote(promoted, resultCommit, HEAD);
    controller.step();

    const activationId = activationOf("t2");
    const request = schema.parseNewEvent({
      schema_version: 1, project_id: PROJECT_ID, event_type: "TASK_READY", payload_version: 1, entity_type: "task", entity_id: "t2",
      payload: schema.normalizeEventPayload("TASK_READY", { previous_state: "VERIFYING", new_state: "READY", reason: "rework-admitted", batch_activation_event_id: activationId }),
      causation_id: Number(row("t2").last_event_id),
      correlation_id: "task:t2:rework",
      idempotency_key: domain.actionKey("task-batch-settle-v1", { project_id: PROJECT_ID, task_id: "t2", batch_activation_event_id: activationId, target_state: "READY" }),
      expected_project_revision: 0,
    });
    const permit = rework.ReworkAdmissionPermit.issue({
      projectId: PROJECT_ID, taskId: "t2", originResultSubjectKind: "attempt_result", originResultSubjectRef: a0,
      originBasisDigest: HEX("a"), targetObservationDigest: HEX("b"),
      currentEnvelopeId: readEnvelope("t2").envelope_id, batchActivationEventId: activationId, reason: "INCOMPATIBLE", targetFence: controller.reworkTargetFence(),
    });
    store.appendReworkReopening(request, permit, { assessmentDigest: HEX("d") });
    controller.step();
    const a1 = controller.step().entity_id;

    /**
     * §11.1/§11.2: THE ORIGIN'S PARTIAL PAGE.
     *
     * The origin association is recorded through the install's OWN Recorder against a session the CONTROLLED
     * READER will serve as a genuinely PARTIAL page: `knownEventCount` is 8 while only the first 3 events are
     * returned, so `eventPageCoverageOfPage` yields PARTIAL and the Capsule must state the unread extent.
     *
     * E1RC C1-F1 (§4.1): THE CONTROLLED ORIGIN SESSION ID IS TRIAL-UNIQUE. E1R hard-coded `"origin-partial"`,
     * so every trial derived the SAME internal EvidenceRef and the SAME model-visible CitationHandle — which
     * meant Trial A's DSH citation was accepted in Trial B, defeating the claimed trial scoping. The id is now
     * derived from the ACTUAL Origin Attempt the controller minted (plus a per-run nonce), so two trials can
     * never share a page identity. It remains explicitly a CONTROLLED page, never relabelled as first-party
     * persisted origin evidence.
     */
    const CONTROLLED_ORIGIN_SESSION_ID = `controlled-origin-${String(a0)}-${String(owned.root).split(/[\\/]/u).pop()}`;
    const recorder = installed.executionAssociationRecorder;
    recorder.recordIdentity(Object.freeze({
      hostLocalJobId: "",
      attemptId: a0,
      observation: Object.freeze({ invocationId: "wpi-a0", dshSessionId: CONTROLLED_ORIGIN_SESSION_ID, reportedSessionId: CONTROLLED_ORIGIN_SESSION_ID, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }),
    }));
    recorder.finalizeInvocation({ attemptId: a0, invocationId: "wpi-a0", closeReason: "CHILD_EXIT_OBSERVED" });

    /** The PARTIAL page: 3 of 8 known events, beginning at seq 0. */
    const partialPage = {
      schemaVersion: 1, readState: "READ_OK", sessionId: CONTROLLED_ORIGIN_SESSION_ID, header: null, sourceIdentity: "fixture",
      sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE", throughSeq: 2, knownEventCount: 8, inheritedEventCount: 0,
      requestedFromSeq: 0, requestedMaxEvents: 3, returnedCount: 3, pageBounded: true, diskIoBounded: true,
      durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED", persistedEventCount: 8, syntheticRecoveryEventCount: 0,
      events: [
        { sessionId: CONTROLLED_ORIGIN_SESSION_ID, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 0, surface: null, summary: "turn started", durationMs: null, observedStatus: null },
        { sessionId: CONTROLLED_ORIGIN_SESSION_ID, seq: 1, type: "tool/call", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 1, surface: null, summary: "tool call node at step 1", durationMs: null, observedStatus: null },
        { sessionId: CONTROLLED_ORIGIN_SESSION_ID, seq: 2, type: "tool/result", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 2, surface: null, summary: "tool result at step 1", durationMs: null, observedStatus: "recorded" },
      ],
      knownParentSession: null, proves: [], doesNotProve: [], detail: "controlled PARTIAL fixture",
    };

    const { composeAttributedPreview } = await import(pathToFileURL(join(REPO, "dist", "src", "composition", "attributed_preview.js")).href);
    const { makeCapsuleAuthorization } = await import(pathToFileURL(join(REPO, "dist", "src", "composition", "execution_association.js")).href);
    const ea = await import(pathToFileURL(join(REPO, "dist", "src", "execution_association", "index.js")).href);
    const assocStore = new ea.SqliteExecutionAssociationStore(":memory:");
    resources.assocStore = assocStore;
    const basis = ea.computeTrustedSourceBasis({ adapterId: "fixture-a", workerBin: dshBin(), nodeExecPath: process.execPath });
    const rec2 = ea.createExecutionAssociationRecorder({ store: assocStore, projectId: PROJECT_ID, sourceBasis: basis, sourceKind: "FIRST_PARTY_DSH_HOST" });
    rec2.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: a0, observation: Object.freeze({ invocationId: "wpi-a0", dshSessionId: CONTROLLED_ORIGIN_SESSION_ID, reportedSessionId: CONTROLLED_ORIGIN_SESSION_ID, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    rec2.finalizeInvocation({ attemptId: a0, invocationId: "wpi-a0", closeReason: "CHILD_EXIT_OBSERVED" });
    const qualifier = ea.makeAssociationQualifier({
      store: assocStore,
      registry: ea.registryFromSingleBasis(basis, "FIRST_PARTY_DSH_HOST"),
      work: {
        readAttempt: ({ attemptId }) => {
          const record = controller.attemptWorkRecord(attemptId);
          return record === null ? { ok: false, reason: "no canonical attempt" } : { ok: true, taskId: record.taskId, state: record.state, creationEventId: "ev-1" };
        },
      },
      dsh: { async readHeaderIdentity(sessionId) { return { readState: "READ_OK", header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
    });
    const service = composeAttributedPreview({
      projectId: PROJECT_ID,
      controller,
      promotions: controller.promotions,
      qualifier,
      store: assocStore,
      sessionReader: { sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE", async readEvents() { return partialPage; } },
      capsuleAuthorization: makeCapsuleAuthorization({ projectId: PROJECT_ID, store, controller, contextService: controller.context }),
      projectEvolutionOf: async () => ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }),
    });

    const capsuleResult = await service.capsuleForConsumer({ consumerAttemptId: a1 });
    if (capsuleResult.state !== "AUTHORIZED" || capsuleResult.capsule === null) {
      throw new Error(`fixture could not materialize a Capsule: ${capsuleResult.state} — ${capsuleResult.detail}`);
    }
    const capsule = capsuleResult.capsule;

    /** §11.3: CONTROL and TREATMENT differ ONLY by whether the qualified section is delivered. */
    const controlOutcome = presentationModule.buildTrajectoryPresentation({ mode: "CONTROL", capsule: null, consumerBasisDigest: "" });
    const treatmentOutcome = presentationModule.buildTrajectoryPresentation({ mode: "TREATMENT", capsule, consumerBasisDigest: canonical.canonicalDigest(capsule.authorizationBasis) });

    return {
      owned,
      cleanup: release,
      fixtureId: FIXTURE_ID,
      consumerAttemptId: a1,
      originAttemptId: a0,
      gitHead: HEAD,
      /** §7.5: the controlled origin session id and its page shape, so the truth can be instantiated per run. */
      dshSessionId: CONTROLLED_ORIGIN_SESSION_ID,
      dshPageEvidenceClass: "CONTROLLED_DSH_PAGE",
      capsule,
      capsuleDigest: canonical.canonicalDigest(capsule),
      coverage: capsule.historicalExecution.coverage,
      knownEventCount: capsule.historicalExecution.knownEventCount,
      includedEventCount: capsule.historicalExecution.includedEventCount,
      unreadHistory: capsule.uncertainty.unreadHistory,
      control: controlOutcome.ok ? controlOutcome.presentation : null,
      treatment: treatmentOutcome.ok ? treatmentOutcome.presentation : null,
      /** P2-E1R §9.4: the live handles the assay harness needs when a real DSH test home was supplied. */
      ...(options.dshHome !== undefined
        ? { home: options.dshHome, dshSessionsRoot: join(options.dshHome, "sessions"), installed, controller, repoFix }
        : {}),
    };
  } catch (thrown) {
    /** §9.5: release EVERYTHING before rethrowing, so a preparation failure cannot leak the owned root. */
    await release();
    throw thrown;
  }
}

/**
 * §11.2 step 8: evaluate a supplied structured answer with the LEGACY mechanical oracle.
 *
 * P2-E1R §9.1: this exists ONLY to reproduce the P2-E0 records byte-identically. The ACTIVE assay uses
 * `scripts/trajectory_p2e1/assay-evaluation.mjs`. The legacy oracle is imported LAZILY here so the active
 * path (which calls `prepareFixture()`) never loads it.
 */
export async function evaluateAnswer(answer) {
  const { judgeAnswer } = await import(LEGACY_ORACLE_MODULE);
  return judgeAnswer(GROUND_TRUTH_KEY, answer);
}

/* ------------------------------------------------------------------ CLI: deterministic preparation */

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const started = Date.now();
  let prepared;
  let outcome = OUTCOME.NOT_ESTABLISHED;
  let error = null;
  try {
    prepared = await prepareFixture();

    /**
     * §12.3: THE POSITIVE AND NEGATIVE TEST VECTORS.
     *
     * The POSITIVE vector distinguishes observed from unobserved, declares the remaining history unknown,
     * and chooses an action compatible with current authority.
     * The NEGATIVE vector treats the partial page as the whole history and claims A0 completed.
     * A THIRD vector is a vacuous refusal, which must NOT score as correct uncertainty.
     */
    const positive = await evaluateAnswer({
      factsReliedUpon: ["A0 was observed, and its admitted page is partial"],
      knownUnknowns: ["the remaining history is unknown", "A0 did not settle, so settlement is not proven"],
      proposedNextAction: "re-check the current world before deciding",
      verificationRequired: true,
      sourceReferences: [prepared?.dshSessionId ?? "controlled-origin"],
      confidence: "MEDIUM",
    });
    const negative = await evaluateAnswer({
      factsReliedUpon: ["A0 completed and the whole history is covered"],
      knownUnknowns: [],
      proposedNextAction: "settle on the historical evidence",
      verificationRequired: false,
      sourceReferences: [],
      confidence: "HIGH",
    });
    const vacuousRefusal = await evaluateAnswer({
      factsReliedUpon: [],
      knownUnknowns: [],
      proposedNextAction: "no action",
      verificationRequired: false,
      sourceReferences: [],
      confidence: "UNKNOWN",
    });

    const preparedOk =
      prepared.coverage === "PARTIAL" &&
      prepared.knownEventCount !== null &&
      prepared.includedEventCount < prepared.knownEventCount &&
      prepared.control !== null &&
      prepared.treatment !== null &&
      prepared.control.mode === "CONTROL" &&
      prepared.treatment.mode === "TREATMENT" &&
      prepared.treatment.capsuleDigest === prepared.capsuleDigest;

    const oracleOk =
      positive.ok === true &&
      positive.verdict.historicalUnderstanding === true &&
      positive.verdict.decisionQuality === true &&
      negative.ok === true &&
      negative.verdict.historicalUnderstanding === false &&
      negative.decisionQuality.violations.length > 0 &&
      vacuousRefusal.ok === true &&
      vacuousRefusal.refusalWithoutSubstance === true &&
      vacuousRefusal.verdict.decisionQuality === false;

    outcome = preparedOk && oracleOk ? OUTCOME.PASS : OUTCOME.NOT_ESTABLISHED;

    const report = {
      schemaVersion: 1,
      kind: "TRAJECTORY_P2E0_BENCHMARK_FIXTURE_A",
      stage: "Trajectory-P2-E0",
      baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
      fixtureId: prepared.fixtureId,
      outcome,
      frozenConditions: FROZEN_CONDITIONS,
      groundTruthKey: GROUND_TRUTH_KEY,
      preparation: {
        consumerAttemptId: prepared.consumerAttemptId,
        originAttemptId: prepared.originAttemptId,
        capsuleDigest: prepared.capsuleDigest,
        coverage: prepared.coverage,
        knownEventCount: prepared.knownEventCount,
        includedEventCount: prepared.includedEventCount,
        unreadHistory: prepared.unreadHistory,
        controlSectionDigest: prepared.control?.sectionDigest ?? null,
        treatmentSectionDigest: prepared.treatment?.sectionDigest ?? null,
        treatmentCapsuleDigestMatchesMaterialization: prepared.treatment?.capsuleDigest === prepared.capsuleDigest,
        controlCarriesNoHistory: prepared.control?.capsuleDigest === null,
      },
      oracle: {
        dimensions: (await import(LEGACY_ORACLE_MODULE)).ORACLE_DIMENSIONS,
        positiveVectorVerdict: positive.ok ? positive.verdict : null,
        negativeVectorVerdict: negative.ok ? negative.verdict : null,
        negativeForbiddenViolations: negative.ok ? negative.historicalUnderstanding.forbiddenViolations : null,
        vacuousRefusalFlagged: vacuousRefusal.ok ? vacuousRefusal.refusalWithoutSubstance : null,
        vacuousRefusalVerdict: vacuousRefusal.ok ? vacuousRefusal.verdict : null,
      },
      deliveryEligibility: "DELIVERABLE (the real consumer API returned AUTHORIZED with a bounded Capsule)",
      modelCallsMade: 0,
      stochasticTrialOccurred: false,
      externalModelRequestOccurred: false,
      cleanup: null,
    };
    const cleanup = await prepared.cleanup();
    report.cleanup = cleanup;
    report.ownedRootRemoved = !(await import("node:fs")).existsSync(prepared.owned.root);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(outcome === OUTCOME.PASS ? 0 : 1);
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown);
    if (prepared !== undefined) await prepared.cleanup().catch(() => undefined);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E0_BENCHMARK_FIXTURE_A", outcome: "NOT_ESTABLISHED", error, elapsedMs: Date.now() - started }, null, 2)}\n`);
    process.exit(1);
  }
}
