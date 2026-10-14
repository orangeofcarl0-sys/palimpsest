/**
 * Trajectory-P2-E0 §9 — SOURCE-QUALIFIED PRODUCT-TO-DSH DELIVERY ATTESTATION (E0-C).
 *
 * THE TARGET CHAIN, IN ONE ATTRIBUTABLE RUN:
 *
 *   Canonical Origin Attempt A0  ->  governed Rework  ->  Consumer Attempt A1
 *        ->  Context Owner authorization  ->  real Association Qualification
 *        ->  capsuleForConsumer(A1)  ->  Qualified Capsule
 *        ->  product Presentation  ->  trusted trial assignment
 *        ->  first-party DSH Worker Host  ->  actual DSH user/message
 *        ->  digest/basis reconciliation
 *
 * WHAT IS REAL HERE, STATED PRECISELY:
 *   · the consumer A1 is a REAL canonical attempt created by the REAL governed rework admission;
 *   · the origin A0's Execution Association is a CONTROLLED FIXTURE built through the REAL Recorder and
 *     read through a controlled DSH reader fixture (NOT a first-party DSH origin execution);
 *   · the Capsule is the REAL product materialization (`capsuleForConsumer`), the Section is the REAL
 *     product renderer (`buildTrajectoryPresentation`), and the UserMessage is the REAL first-party DSH
 *     Host's own `agent.followup()` under a test-owned deterministic local adapter (no provider request);
 *   · the persisted `user/message` is read through DSH's OWN persistence and compared by digest.
 *
 * EVIDENCE LEVEL. This qualifies E0-L1 (controlled integration). It does NOT qualify E0-L2, which requires a
 * first-party DSH ORIGIN execution whose Result is genuinely admitted by Work settlement.
 *
 * SAFETY. Test-owned owned root, git fixture, DSH home and session root; no personal profile, no credential,
 * no paid model, PRIMARY disabled. The owned root is released through the no-follow lifecycle.
 *
 * Usage:  node scripts/trajectory_p2e0/source-to-dsh-gate.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup, snapshotDependencyRoot } from "./owned-root.mjs";
import { REAL_DSH_HOME, REAL_MODULES, dshBin, findSessionFile, hasBuiltDist, hasFirstPartyDsh, installHostBundle, readSessionByExactId, shareDshModules, writeDeterministicProfile } from "./dsh-test-home.mjs";

const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];
const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};

const sha256 = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

if (!hasBuiltDist(REPO)) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E0_SOURCE_TO_DSH", outcome: "BLOCKED", blocker: "dist/src/advanced.js is absent; build first" }, null, 2)}\n`);
  process.exit(1);
}
if (!hasFirstPartyDsh()) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E0_SOURCE_TO_DSH", outcome: "SKIPPED", blocker: "no installed first-party DSH tree" }, null, 2)}\n`);
  process.exit(0);
}

const PROJECT_ID = "p2e0int";
const PROFILE = "p2e0-int";
const depRoot = join(REPO, "node_modules");
const depBefore = snapshotDependencyRoot(depRoot);

/** A frozen git fixture so the A0/A1 chain is reproducible from a known state. */
function prepareFixture(repoFix) {
  mkdirSync(join(repoFix, "src"), { recursive: true });
  writeFileSync(join(repoFix, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repoFix });
  execFileSync("git", ["add", "-A"], { cwd: repoFix });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repoFix });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoFix, encoding: "utf8" }).trim();
}

/** Build the REAL product install over the fixture, with the experimental delivery ENABLED as TREATMENT. */
async function composeProduct(input) {
  const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
  const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);
  /**
   * §9.5: the governed chain is driven with the repository's OWN deterministic git port (`FakeGitPort`),
   * exactly as the shipped governed-rework tests do. A REAL `git` CLI is unnecessary here and its
   * Ordarium-backed effect layer refuses an uncertain external retry, which is orthogonal to this gate's
   * claim: the gate is about the Trajectory delivery chain, not about git CLI behaviour.
   */
  return install.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: PROJECT_ID,
      databasePath: join(input.repoFix, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(input.repoFix, ".palimpsest", "o.sqlite"),
      repository: input.repoFix,
      git: new effects.FakeGitPort(input.head),
      execution: "worktree",
      standard: {
        statement: "tests pass and scope respected",
        clauses: [
          { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
          { kind: "scope_respected" },
        ],
        derivedFrom: ["p2e0 integration fixture"],
        confirmed: true,
        notes: [],
      },
      policy: install.trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      workWorkerBin: dshBin(),
      workWorkerProfile: PROFILE,
      executionAssociationSourceKind: "FIRST_PARTY_DSH_HOST",
      dshHomePath: REAL_DSH_HOME,
      dshSessionsRoot: join(input.home, "sessions"),
      sessionReaderModule: pathToFileURL(join(REPO, "host", "deployment", "runtime", "session_reader.js")).href,
      /** §9.2: the trusted experimental assignment — fixed before any worker runs. */
      experimentalTrajectoryContextDelivery: true,
      trajectoryPresentationMode: "TREATMENT",
    },
  );
}

/** The governed A0 -> A1 rework, driven through the REAL product controller (same idiom as the tests). */
async function buildGovernedChain(installed, head) {
  const domain = await import(pathToFileURL(join(REPO, "dist", "src", "domain", "index.js")).href);
  const rework = await import(pathToFileURL(join(REPO, "dist", "src", "domain", "rework_admission.js")).href);
  const schema = await import(pathToFileURL(join(REPO, "dist", "src", "schema", "index.js")).href);
  const controller = installed.controller;
  const store = controller.store;
  const effects = controller.effects;

  controller.start({
    projectId: PROJECT_ID,
    goal: "g",
    headCommit: head,
    tasks: [
      { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      { task_id: "t2", objective: "tidy b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
    ],
    /** The SAME declared graph the shipped governed-rework tests use, so two tasks reach VERIFYING together. */
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

  const HEX = (seed) => seed.repeat(64).slice(0, 64);
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
    const committed = await effects.invoke(effects.actions.gitCommit, { worktreeId: attemptId, message: "work" }, { scope: PROJECT_ID, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` });
    controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: committed.commit });
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
    const stepped = controller.step();
    if (stepped.event_type !== "TASK_VERIFYING") throw new Error(`expected TASK_VERIFYING, got ${stepped.event_type}`);
    return attemptId;
  };

  const promoted = await drive("t1");
  const a0 = await drive("t2");
  const resultCommit = store.listEvents(PROJECT_ID).find((event) => event.event_type === "ATTEMPT_COMPLETED" && event.entity_id === promoted).payload.attempt_report.result_commit;
  await controller.promote(promoted, resultCommit, head);
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
  return { a0, a1 };
}

const owned = allocateOwnedRoot("p2e0-src-to-dsh-", "source-to-dsh");
let finalOutcome = "NOT_ESTABLISHED";
let extra = {};
try {
  const repoFix = join(owned.root, "repo");
  const home = join(owned.root, "home");
  mkdirSync(repoFix, { recursive: true });
  mkdirSync(join(home, "profiles"), { recursive: true });
  const head = prepareFixture(repoFix);

  installHostBundle(home, REPO);
  const share = shareDshModules(home, { strategy: "junction" });
  record("moduleShareStrategy", share.strategy);
  const adapterUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2e0", "deterministic-llm-plugin.mjs")).href;
  writeDeterministicProfile({ home, repo: REPO, root: owned.root, profileName: PROFILE, adapterUrl, withModel: true });

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let sessionId = null;
  let capsuleDigest = null;
  let sectionDigest = null;
  let presentationMode = null;
  try {
    let installed;
    try {
      installed = await composeProduct({ repoFix, home, head });
      if (installed.trajectory === undefined) throw new Error("the install composed no attributed-preview surface");
      /** §9.3: the governed A0 -> A1 chain. */
      const { a0, a1 } = await buildGovernedChain(installed, head);
    record("originAttemptId", a0);
    record("consumerAttemptId", a1);

    const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
    const sessionsRoot = join(home, "sessions");
    const { readdirSync, lstatSync } = await import("node:fs");
    const { basename, dirname } = await import("node:path");

    /** §9.6: every session file currently under the test-owned root, so each turn can be told apart. */
    const sessionFiles = () => {
      const all = [];
      const walk = (dir) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
          const path = join(dir, entry);
          if (lstatSync(path).isDirectory()) walk(path);
          else if (entry.includes("session.v") && entry.includes("jsonl")) all.push(path);
        }
      };
      walk(sessionsRoot);
      return all;
    };

    /**
     * §9.3/§9.6: THE REAL FIRST-PARTY ORIGIN TURN.
     *
     * A0 runs through the real DSH subprocess port under the test-owned deterministic adapter, so it creates
     * a REAL DSH Session. Its SessionId is captured from the port's OWN identity sink — the host's observed
     * child IPC report, never a name we invented — and THAT is the session the association records.
     */
    const originWorld = join(owned.root, "world-origin");
    mkdirSync(originWorld, { recursive: true });
    const originContext = {
      work: { projectGoal: "g", requirements: [], decisions: [], objective: "origin turn", writeScope: [], requiredArtifacts: [], baseCommit: head, completionChecks: [], independentVerificationRequired: false },
      compiled: { manifestId: "origin-m", boot: [], handles: [] },
    };
    let observedOriginSession = null;
    const originPort = workWorker.dshSubprocessWorkWorkerPort({ dshBin: dshBin(), profile: PROFILE, timeoutMs: 180_000 });
    const originOutcome = await originPort.run({
      workDir: originWorld,
      context: originContext,
      sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
      observeSessionIdentity: (observation) => {
        const id = observation?.dshSessionId ?? observation?.reportedSessionId ?? null;
        if (id !== null) observedOriginSession = id;
      },
    });
    record("originWorkerOutcome", originOutcome?.kind ?? null);
    record("originWorkerDetail", originOutcome?.detail ?? null);
    const afterOrigin = sessionFiles();
    if (observedOriginSession === null) throw new Error("the origin turn reported no DSH session identity");
    record("originDshSessionId", observedOriginSession);
    if (!afterOrigin.some((path) => path.includes(observedOriginSession))) {
      throw new Error(`the origin session ${observedOriginSession} was not persisted under the test-owned root`);
    }

    /**
     * §9.2: the origin's execution association, recorded through the install's OWN Recorder against the
     * REAL session the origin turn just produced. The execution is still a CONTROLLED FIXTURE in the sense
     * that no genuine Work Result was admitted (the deterministic adapter performs no git work), but the
     * SESSION is genuinely first-party DSH.
     */
    const recorder = installed.executionAssociationRecorder;
    if (recorder === undefined) throw new Error("the install composed no execution-association recorder");
    recorder.recordIdentity(Object.freeze({
      hostLocalJobId: "",
      attemptId: a0,
      observation: Object.freeze({ invocationId: "wpi-a0", dshSessionId: observedOriginSession, reportedSessionId: observedOriginSession, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }),
    }));
    recorder.finalizeInvocation({ attemptId: a0, invocationId: "wpi-a0", closeReason: "CHILD_EXIT_OBSERVED" });

    /**
     * §9.2/§9.7: THE REAL PRODUCT CAPSULE. `capsuleForConsumer(A1)` resolves A1's OWN governed lineage and
     * materializes the origin's Capsule through the product admission path — reading the REAL origin session
     * through the product's own DSH reader.
     */
    const capsuleResult = await installed.trajectory.attributedPreview.capsuleForConsumer({ consumerAttemptId: a1 });
    record("capsuleState", capsuleResult.state);
    if (capsuleResult.state !== "AUTHORIZED" || capsuleResult.capsule === null) {
      throw new Error(`the product did not authorize a Capsule for A1: ${capsuleResult.state} — ${capsuleResult.detail}`);
    }
    const capsule = capsuleResult.capsule;
    const canonical = await import(pathToFileURL(join(REPO, "dist", "src", "schema", "canonical.js")).href);
    capsuleDigest = canonical.canonicalDigest(capsule);
    record("capsuleOriginAttemptId", capsule.originAttemptId);
    record("capsuleConsumerAttemptId", capsule.consumerAttemptId);
    record("capsuleEventCount", capsule.historicalExecution.events.length);
    record("capsuleContentDigest", capsuleDigest);
    record("capsuleReadOriginSession", capsule.attribution?.dshSessionId ?? null);

    /** §9.7: the REAL product renderer, on the SAME arm the trusted configuration froze. */
    const presentationModule = await import(pathToFileURL(join(REPO, "dist", "src", "trajectory", "index.js")).href);
    const presentationOutcome = presentationModule.buildTrajectoryPresentation({
      mode: "TREATMENT",
      capsule,
      consumerBasisDigest: canonical.canonicalDigest(capsule.authorizationBasis),
    });
    if (!presentationOutcome.ok) throw new Error(`the product refused to render the section: ${presentationOutcome.state}`);
    const presentation = presentationOutcome.presentation;
    if (presentation === null) throw new Error("TREATMENT produced no presentation");
    presentationMode = presentation.mode;
    sectionDigest = presentation.sectionDigest;
    record("presentationMode", presentationMode);
    record("sectionBytes", presentation.sectionBytes);
    record("sectionDigest", sectionDigest);
    record("presentationCapsuleDigestMatchesMaterialization", presentation.capsuleDigest === capsuleDigest);

    /**
     * §9.3: THE REAL FIRST-PARTY DSH CONSUMER TURN. The SAME worker environment the product builds —
     * carrying the product's own trial record — is run through the real subprocess port.
     */
    const context = {
      work: { projectGoal: "g", requirements: [], decisions: [], objective: "attest the source-qualified delivery", writeScope: [], requiredArtifacts: [], baseCommit: head, completionChecks: [], independentVerificationRequired: false },
      compiled: {
        manifestId: "m",
        boot: [],
        handles: [],
        trajectoryCapsule: {
          schemaVersion: capsule.schemaVersion,
          capsule,
          serializedBytes: Buffer.byteLength(JSON.stringify(capsule), "utf8"),
          contentDigest: capsuleDigest,
          originAttemptId: capsule.originAttemptId,
          framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS",
          authority: "READ_ONLY_INSPECTION",
          presentation,
          deliveryState: "SECTION_RENDERED",
          assignedArm: "TREATMENT",
          eligibility: "QUALIFIED",
          failureReason: null,
        },
      },
    };
    const world = join(owned.root, "world-consumer");
    mkdirSync(world, { recursive: true });
    let observedConsumerSession = null;
    const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: dshBin(), profile: PROFILE, timeoutMs: 180_000 });
    const outcome = await port.run({
      workDir: world,
      context,
      sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
      observeSessionIdentity: (observation) => {
        const id = observation?.dshSessionId ?? observation?.reportedSessionId ?? null;
        if (id !== null) observedConsumerSession = id;
      },
    });
    record("workerOutcome", outcome?.kind ?? null);

    /** §9.6: the consumer session is the NEW one this turn produced — never the origin's. */
    const afterConsumer = sessionFiles();
    const newFiles = afterConsumer.filter((path) => !afterOrigin.includes(path));
    if (observedConsumerSession === null) throw new Error("the consumer turn reported no DSH session identity");
    if (!newFiles.some((path) => path.includes(observedConsumerSession))) {
      throw new Error(`the consumer session ${observedConsumerSession} was not the newly persisted one`);
    }
    sessionId = observedConsumerSession;
    record("dshSessionId", sessionId);
    record("consumerSessionDiffersFromOrigin", sessionId !== observedOriginSession);

    const events = await readSessionByExactId({ sessionsRoot, sessionId });
    const userMessages = [];
    for (const event of events) {
      if (event.type !== "user/message") continue;
      const content = event.data?.content ?? [];
      const text = content.filter((block) => block.type === "text").map((block) => block.text).join("");
      userMessages.push({ seq: event.seq, sourceKind: event.data?.source?.kind ?? null, text, bytes: Buffer.byteLength(text, "utf8"), digest: sha256(text) });
    }
    const engineering = userMessages.find((entry) => entry.text.includes("Palimpsest WORK WORKER")) ?? null;
    record("dshUserMessageCount", userMessages.length);
    record("dshEngineeringUserMessage", engineering === null ? null : { seq: engineering.seq, sourceKind: engineering.sourceKind, bytes: engineering.bytes, hasSection: engineering.text.includes(presentation.sectionText), digest: engineering.digest });

    /**
     * §9.7: DIGEST RECONCILIATION. The section text found in the persisted user/message must hash to the
     * product-rendered section digest, and the Capsule's origin must be the governed origin.
     */
    const sectionInMessage = engineering !== null && engineering.text.includes(presentation.sectionText);
    record("persistedMessageContainsSection", sectionInMessage);
    record("persistedSectionDigestMatchesProduct", sectionInMessage && sha256(presentation.sectionText) === sectionDigest);
    record("capsuleOriginMatchesGovernedOrigin", capsule.originAttemptId === a0);
    record("capsuleConsumerMatchesCanonicalA1", capsule.consumerAttemptId === a1);

    const qualified =
      capsuleResult.state === "AUTHORIZED" &&
      capsule.originAttemptId === a0 &&
      capsule.consumerAttemptId === a1 &&
      capsule.historicalExecution.events.length > 0 &&
      presentationMode === "TREATMENT" &&
      presentation.capsuleDigest === capsuleDigest &&
      sectionInMessage &&
      sha256(presentation.sectionText) === sectionDigest &&
      engineering !== null &&
      engineering.sourceKind === "user";

    record("evidenceLevel", qualified ? "E0_L1_CONTROLLED_SOURCE_TO_DSH_INPUT" : "NOT_ESTABLISHED");
    finalOutcome = qualified ? "PASS" : "NOT_ESTABLISHED";
    } finally {
      /** §7.2: dispose the install BEFORE the owned root is cleaned, so handles are closed first. */
      installed.dispose();
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
} catch (error) {
  record("error", error instanceof Error ? `${error.message}` : String(error));
  finalOutcome = "NOT_ESTABLISHED";
}

const cleanup = await safeCleanup(owned);
const depAfter = snapshotDependencyRoot(depRoot);

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E0_SOURCE_TO_DSH",
  stage: "Trajectory-P2-E0",
  baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
  outcome: finalOutcome,
  permittedOutcomes: OUTCOMES,
  ...findings,
  ownedRoot: { root: owned.root, containmentProven: owned.containmentProven, cleanup },
  ownedRootRemoved: !existsSync(owned.root),
  dependencyRootPreserved: depBefore.canonical === depAfter.canonical && depBefore.entries === depAfter.entries,
  realCanonicalWorkRan: true,
  realGovernedReworkOccurred: true,
  originExecutionIsControlledFixture: true,
  realFirstPartyDshOriginRan: false,
  realProductCapsuleAdmissionSucceeded: findings.capsuleState === "AUTHORIZED",
  realProductPresentationRan: true,
  realDshUserMessageInspected: findings.dshEngineeringUserMessage !== null && findings.dshEngineeringUserMessage !== undefined,
  realFirstPartyDshHostRan: true,
  localDeterministicGenerationOccurred: true,
  externalModelRequestOccurred: false,
  paidModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
  protectedFilesAffected: false,
  evidenceLevels: {
    e0L1_controlledSourceToDshInput: finalOutcome === "PASS" ? "ESTABLISHED" : "NOT_ESTABLISHED",
    e0L2_realFirstPartyOriginChain: "NOT_ESTABLISHED",
  },
  note: "§9.3/§9.8: the consumer A1 is a REAL canonical attempt produced by the REAL governed rework admission, the Capsule and Section are REAL product artifacts, and the user/message is the REAL first-party DSH Host's own persisted message. The ORIGIN execution is a CONTROLLED FIXTURE, so this qualifies E0-L1 and explicitly NOT E0-L2.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(finalOutcome === "PASS" || finalOutcome === "SKIPPED" ? 0 : 1);
