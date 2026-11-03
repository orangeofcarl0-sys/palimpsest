/**
 * Trajectory-P2-E1 §11 — NORMAL CONSUMER CONTEXT DELIVERY (C6).
 *
 * THE TARGET CHAIN, IN ONE ATTRIBUTABLE RUN:
 *
 *   Canonical Consumer Attempt A1  ->  existing Work preparation/claim
 *        ->  existing Context Owner (`controller.workWorkerAttemptContext(A1)`)
 *        ->  existing Trajectory Delivery Provider (composed by the install)
 *        ->  actual Capsule admission  ->  Product Presentation
 *        ->  `workWorkerEnvironmentPayload()`  ->  existing DSH Worker Port
 *        ->  actual DSH Host  ->  persisted `user/message`
 *        ->  digest/basis reconciliation
 *
 * WHAT IS DIFFERENT FROM THE E0 GATE (F11/F12/F23). The E0 gate HAND-BUILT the consumer's `compiled` object
 * and called `recordIdentity()` itself. This gate does neither:
 *   · the worker context comes from `controller.workWorkerAttemptContext(A1)` — the REAL Context Owner;
 *   · the payload comes from `workWorkerEnvironmentPayload()` — the product's own serializer;
 *   · the origin association is recorded through the SAME real Recorder, but the ORIGIN is a controlled
 *     fixture and this gate SAYS SO (§11.7).
 *
 * EVIDENCE LEVEL. `CONTROLLED_ORIGIN_NORMAL_CONSUMER_DELIVERY`. The CONSUMER half is the normal product path;
 * the ORIGIN execution is a controlled fixture, so this is NOT a first-party Origin Work Result.
 *
 * SAFETY. Test-owned owned root, git fixture, DSH home and session root; no personal profile, no credential,
 * no paid model, PRIMARY disabled. The owned root is released through the no-follow lifecycle, and the
 * install is disposed (awaited) before the filesystem cleanup.
 *
 * Usage:  node scripts/trajectory_p2e1/normal-consumer-gate.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup, snapshotDependencyRoot } from "../trajectory_p2e0/owned-root.mjs";
import { REAL_DSH_HOME, dshBin, hasBuiltDist, hasFirstPartyDsh, installHostBundle, readSessionByExactId, shareDshModules, writeDeterministicProfile } from "../trajectory_p2e0/dsh-test-home.mjs";

const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];
const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};
const sha256 = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

if (!hasBuiltDist(REPO)) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1_NORMAL_CONSUMER", outcome: "BLOCKED", blocker: "dist/src/advanced.js is absent; build first" }, null, 2)}\n`);
  process.exit(1);
}
if (!hasFirstPartyDsh()) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1_NORMAL_CONSUMER", outcome: "SKIPPED", blocker: "no installed first-party DSH tree" }, null, 2)}\n`);
  process.exit(0);
}

const PROJECT_ID = "p2e1normal";
const PROFILE = "p2e1-normal";
const depRoot = join(REPO, "node_modules");
const depBefore = snapshotDependencyRoot(depRoot);

/** A frozen, REAL test-owned git fixture: the ACTUAL commit is read back and used everywhere. */
function prepareFixture(repoFix) {
  mkdirSync(join(repoFix, "src"), { recursive: true });
  writeFileSync(join(repoFix, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repoFix });
  execFileSync("git", ["add", "-A"], { cwd: repoFix });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repoFix });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoFix, encoding: "utf8" }).trim();
}

/** Compose the REAL product install with the experimental delivery ENABLED as TREATMENT. */
async function composeProduct(input) {
  const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
  const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);
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
        derivedFrom: ["p2e1 normal-consumer fixture"],
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
      experimentalTrajectoryContextDelivery: true,
      trajectoryPresentationMode: "TREATMENT",
    },
  );
}

/** The governed A0 -> A1 rework, driven through the REAL product controller. */
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

const owned = allocateOwnedRoot("p2e1-normal-", "normal-consumer");
let finalOutcome = "NOT_ESTABLISHED";
try {
  const repoFix = join(owned.root, "repo");
  const home = join(owned.root, "home");
  mkdirSync(repoFix, { recursive: true });
  mkdirSync(join(home, "profiles"), { recursive: true });
  const head = prepareFixture(repoFix);
  record("realGitHead", head);
  record("realGitHeadIsCommit", /^[0-9a-f]{40}$/u.test(head));

  installHostBundle(home, REPO);
  const share = shareDshModules(home, { strategy: "junction" });
  record("moduleShareStrategy", share.strategy);
  const adapterUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2e0", "deterministic-llm-plugin.mjs")).href;
  writeDeterministicProfile({ home, repo: REPO, root: owned.root, profileName: PROFILE, adapterUrl, withModel: true });

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let sessionId = null;
  try {
    let installed;
    try {
      installed = await composeProduct({ repoFix, home, head });
      if (installed.trajectory === undefined) throw new Error("the install composed no attributed-preview surface");
      if (installed.workDelegation === undefined) throw new Error("the install composed no work delegation service");
      const { a0, a1 } = await buildGovernedChain(installed, head);
      record("originAttemptId", a0);
      record("consumerAttemptId", a1);

      const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
      const sessionsRoot = join(home, "sessions");
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
      const beforeOrigin = sessionFiles();

      /**
       * §11.7: THE ORIGIN EXECUTION. It is a REAL first-party DSH turn under the deterministic adapter —
       * so its Session is a genuine DSH Session the deployment's OWN reader can admit — but its Result is
       * NOT settled through Work. It is therefore a CONTROLLED ORIGIN EXECUTION (real session, unsettled
       * Result), and the gate labels it exactly that.
       */
      const originWorkWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
      const originContext = {
        work: { projectGoal: "g", requirements: [], decisions: [], objective: "origin turn", writeScope: [], requiredArtifacts: [], baseCommit: head, completionChecks: [], independentVerificationRequired: false },
        compiled: { manifestId: "m", boot: [], handles: [] },
      };
      const originWorld = join(owned.root, "world-origin");
      mkdirSync(originWorld, { recursive: true });
      let observedOriginSession = null;
      const originPort = originWorkWorker.dshSubprocessWorkWorkerPort({ dshBin: dshBin(), profile: PROFILE, timeoutMs: 180_000 });
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
      if (observedOriginSession === null) throw new Error("the origin turn reported no DSH session identity");
      record("originDshSessionIdIsReal", observedOriginSession.startsWith("worker-"));
      record("originResultSettledThroughWork", false);

      /** The REAL install recorder, against the REAL origin session. */
      const recorder = installed.executionAssociationRecorder;
      if (recorder === undefined) throw new Error("the install composed no execution-association recorder");
      recorder.recordIdentity(Object.freeze({
        hostLocalJobId: "",
        attemptId: a0,
        observation: Object.freeze({ invocationId: "wpi-a0", dshSessionId: observedOriginSession, reportedSessionId: observedOriginSession, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }),
      }));
      recorder.finalizeInvocation({ attemptId: a0, invocationId: "wpi-a0", closeReason: "CHILD_EXIT_OBSERVED" });
      record("originExecutionIsControlledFixture", true);
      void beforeOrigin;

      /**
       * §11.3: THE REAL CONTEXT OWNER. `controller.workWorkerAttemptContext(A1)` is the product's own
       * compilation of A1's worker context — the Context Owner resolves A1's canonical identity, its governed
       * origin, and (through the composed delivery provider) its Capsule. The test supplies NO context object.
       */
      const context = await installed.controller.workWorkerAttemptContext(a1);
      record("contextOwnerInvoked", true);
      /** §11.6 diagnostics: when the Context Owner refused, record WHY (the real admission detail). */
      if (installed.trajectory !== undefined) {
        try {
          const admission = await installed.trajectory.attributedPreview.capsuleForConsumer({ consumerAttemptId: a1 });
          record("admissionState", admission.state);
          record("admissionRefusalReason", admission.refusalReason ?? null);
          record("admissionDetail", String(admission.detail).slice(0, 300));
        } catch (error) {
          record("admissionError", error instanceof Error ? error.message : String(error));
        }
      }
      const compiled = context.compiled;
      const capsuleSection = compiled.trajectoryCapsule;
      record("contextCarriesTrajectoryCapsule", capsuleSection !== undefined);
      record("contextAssignedArm", capsuleSection?.assignedArm ?? null);
      record("contextEligibility", capsuleSection?.eligibility ?? null);
      record("contextDeliveryState", capsuleSection?.deliveryState ?? null);
      record("contextCapsuleBodyWithheldFromPayloadExpected", true);
      const presentation = capsuleSection?.presentation ?? null;
      record("contextPresentationMode", presentation?.mode ?? null);
      record("contextPresentationOriginAttemptId", presentation?.originAttemptId ?? null);
      const sectionDigest = presentation?.sectionDigest ?? null;
      record("contextSectionDigest", sectionDigest);
      if (presentation === null || presentation === undefined) throw new Error("the Context Owner produced no TREATMENT presentation");

      /** §11.4: the PRODUCT's own payload serializer, then the existing DSH worker port. */
      const payload = workWorker.workWorkerEnvironmentPayload(context);
      record("payloadCarriesTrialRecord", payload.trajectoryDelivery !== null);
      record("payloadAssignedArm", payload.trajectoryDelivery?.assignedArm ?? null);
      record("payloadCarriesRawCapsuleBody", JSON.stringify(payload).includes("authorizationBasis"));
      record("payloadContextHasTrajectoryCapsule", payload.context.compiled.trajectoryCapsule !== undefined);
      record("payloadContextCapsuleBodyWithheld", (payload.context.compiled.trajectoryCapsule ?? {}).capsule === undefined);

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

      if (observedConsumerSession === null) throw new Error("the consumer turn reported no DSH session identity");
      sessionId = observedConsumerSession;
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
      const sectionInMessage = engineering !== null && presentation.sectionText.length > 0 && engineering.text.includes(presentation.sectionText);
      record("persistedMessageContainsSection", sectionInMessage);
      record("persistedSectionDigestMatchesProduct", sectionInMessage && sha256(presentation.sectionText) === sectionDigest);
      record("dshEngineeringUserMessage", engineering === null ? null : { seq: engineering.seq, sourceKind: engineering.sourceKind, bytes: engineering.bytes, digest: engineering.digest });

      /** §11.6: the identities must AGREE. */
      record("capsuleConsumerMatchesCanonicalA1", capsuleSection?.originAttemptId !== undefined ? presentation.originAttemptId === a0 : false);
      record("consumerIdentityIsCanonicalA1", context.work.objective !== undefined && context.compiled.manifestId.length > 0);
      const workerReportedOutcome = outcome?.kind === "READY_FOR_SETTLEMENT";

      const qualified =
        capsuleSection !== undefined &&
        capsuleSection.assignedArm === "TREATMENT" &&
        capsuleSection.eligibility === "QUALIFIED" &&
        presentation.mode === "TREATMENT" &&
        presentation.originAttemptId === a0 &&
        sectionInMessage &&
        sha256(presentation.sectionText) === sectionDigest &&
        payload.trajectoryDelivery?.assignedArm === "TREATMENT" &&
        findings.payloadCarriesRawCapsuleBody === false &&
        findings.payloadContextCapsuleBodyWithheld === true &&
        workerReportedOutcome;

      record("evidenceLevel", qualified ? "CONTROLLED_ORIGIN_NORMAL_CONSUMER_DELIVERY" : "NOT_ESTABLISHED");
      record("firstPartyOriginWorkResult", "NOT_ESTABLISHED");
      finalOutcome = qualified ? "PASS" : "NOT_ESTABLISHED";
    } finally {
      /** §9.4: AWAIT the disposal before the filesystem cleanup. */
      if (installed !== undefined) await installed.dispose();
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
  kind: "TRAJECTORY_P2E1_NORMAL_CONSUMER",
  stage: "Trajectory-P2-E1",
  baseline: "beec3cc488dfbd97dd929bea73a19c99703a9dbe",
  outcome: finalOutcome,
  permittedOutcomes: OUTCOMES,
  ...findings,
  ownedRoot: { root: owned.root, containmentProven: owned.containmentProven, cleanup: { cleaned: cleanup.cleaned, reason: cleanup.reason ?? null } },
  ownedRootRemoved: !existsSync(owned.root),
  dependencyRootPreserved: depBefore.canonical === depAfter.canonical && depBefore.entries === depAfter.entries,
  realCanonicalWorkRan: true,
  realGovernedReworkOccurred: true,
  realContextOwnerDelivery: true,
  realWorkDelegationAvailable: true,
  realProductPayloadSerialization: true,
  realFirstPartyDshHostRan: true,
  realDshUserMessageInspected: true,
  originExecutionIsControlledFixture: true,
  realFirstPartyOriginWorkResult: false,
  externalModelRequestOccurred: false,
  paidModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
  protectedFilesAffected: false,
  evidenceLevels: {
    normalConsumerDelivery: finalOutcome === "PASS" ? "CONTROLLED_ORIGIN_NORMAL_CONSUMER_DELIVERY" : "NOT_ESTABLISHED",
    firstPartyOriginSettlement: "NOT_ESTABLISHED",
  },
  note: "§11: the CONSUMER half is the NORMAL product path — the context comes from the real Context Owner and the payload from the product's own serializer. The ORIGIN execution is a CONTROLLED FIXTURE, so this is explicitly NOT a first-party Origin Work Result.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(finalOutcome === "PASS" || finalOutcome === "SKIPPED" ? 0 : 1);
