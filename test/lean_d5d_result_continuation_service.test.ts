/**
 * PLMP-LEAN-1 §D5-d — the PACKAGED RESULT CONTINUATION AUTHORITY, as machine proofs.
 *
 *     Caller chooses a route;  the service derives every authority-bearing fact.
 *
 * The mechanism parts all existed (D5-0/D3-a/D3-b/D3-c/D3-d/D5-a/D5-b2/G10-X/D2-d). This slice
 * packages them in the one order that closes the W.5 hole:
 *
 *     fresh observation  ≺  continuation assessment  ≺  permit mint  ≺  TASK_READY
 *
 * with no caller-supplied quantity anywhere in the chain. The end-to-end proofs run on the PACKAGED
 * install (`installPalimpsest` + the real git delegation path), because "slice green" and "packaged
 * product green" are different claims — the D2-LIVE lesson.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import type { InstalledPalimpsest } from "../src/composition/install_contract.js";
import type { ResultSubjectRef } from "../src/project_world/result_resolution.js";
import { makeResultContinuationService } from "../src/continuation/service.js";
import { makeObservationAuthority } from "../src/project_world/observation_authority.js";
import { makeCompatibilityIssuer } from "../src/project_world/issuance.js";
import { makeCrossBasisAdmissionRuntime, type CrossBasisAdmissionRuntime } from "../src/project_world/cross_basis.js";
import { SqliteAttemptWorldBasisStore } from "../src/project_world/basis_store.js";
import { SqliteDerivedResultCandidateStore } from "../src/project_world/candidate_store.js";
import { makeProjectWorldBasisRuntime } from "../src/project_world/runtime.js";
import { firstPartyProjectWorldObservation } from "../src/deployment/world_observation.js";
import { gitSourceChangeObserver, GIT_SOURCE_OBSERVER_ID, GIT_SOURCE_OBSERVER_VERSION, GIT_SOURCE_MECHANISM } from "../src/deployment/source_change_observer.js";
import { firstPartyResultResolver } from "../src/deployment/result_resolution.js";
import { firstPartyAttemptResultVerificationSource } from "../src/project_verification/index.js";
import { actionKey } from "../src/domain/idempotency.js";
import { normalizeEventPayload, parseNewEvent } from "../src/schema/index.js";
import { REPOSITORY_SOURCE } from "../src/project_world/dependency.js";
import type { IssuedCompatibilityAssessment } from "../src/project_world/issuance.js";
import type { ObservationRecorder } from "../src/project_world/observation_authority.js";
import type { AttemptWorldBasisStore } from "../src/project_world/basis_store.js";
import type { CompatibilityIssuer } from "../src/project_world/issuance.js";
import type { EventStore } from "../src/state/index.js";
import { taskSpec } from "./helpers.js";

const PROJECT = "d5d";
const TASKS = ["task-a", "task-b", "task-c"] as const;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const readSource = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

/** Strip comments so a source pin reads CODE, not prose that mentions the word. */
function stripComments(source: string): string {
  const blockStripped = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  const lines = blockStripped.split("\n").map((line) => {
    const commentStart = line.indexOf("//");
    // Keep `://` (a URL inside code) intact.
    if (commentStart === -1 || (commentStart > 0 && line[commentStart - 1] === ":")) return line;
    return line.slice(0, commentStart);
  });
  return lines.join("\n");
}

/* ================================================================== *
 * Rig: the PACKAGED install over a real repository
 * ================================================================== */

interface Rig {
  readonly installed: InstalledPalimpsest;
  readonly repo: string;
  readonly workerContexts: Array<Record<string, unknown>>;
  attempts: Record<string, string>;
  taskState(taskId: string): string;
  ir(): { head_commit: string; revision: number };
  events(): Array<{ event_id: number; event_type: string; entity_id: string; payload: Record<string, unknown> }>;
  reworkEvents(): Array<{ event_id: number; entity_id: string; ref: string; reason: string }>;
  resultCommitOf(attemptId: string): string;
  refOf(taskId: string): ResultSubjectRef;
  drive(taskId: string): Promise<string>;
  attemptState(attemptId: string): string | null;
  step(): string | null;
  close(): Promise<void>;
}

async function rig(options: { readonly withWorkerPort?: boolean } = {}): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5d-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "shared.js"), "export const base = 0;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const head0 = git(repo, ["rev-parse", "HEAD"]);

  /** The packaged worker port: derives its target from the delivered context's own write scope. */
  const workerContexts: Array<Record<string, unknown>> = [];
  const packagedWorkerPort = () => (worldPath: string) => ({
    adapterId: "d5d-packaged",
    run: async (input: { readonly workDir: string; readonly context: unknown }) => {
      workerContexts.push(input.context as Record<string, unknown>);
      const context = input.context as { work: { writeScope: readonly string[] } };
      const target = context.work.writeScope[0];
      if (target === undefined) throw new Error("packaged worker got no write scope");
      writeFileSync(join(worldPath, target), "export const base = 1; // packaged\n");
      execFileSync("git", ["add", "-A"], { cwd: worldPath });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "packaged work"], {
        cwd: worldPath,
      });
      return { kind: "READY_FOR_SETTLEMENT" as const };
    },
  });

  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: PROJECT,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: Object.freeze({
        statement: "tests pass and scope respected",
        clauses: Object.freeze([
          Object.freeze({
            kind: "command_succeeds" as const,
            command: Object.freeze(["node", "-e", "process.exit(0)"]),
            predicate: "tests_pass" as const,
          }),
          Object.freeze({ kind: "scope_respected" as const }),
        ]),
        derivedFrom: Object.freeze(["d5d fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      }),
      ...(options.withWorkerPort === true ? { workWorkerPort: packagedWorkerPort() } : {}),
    } as never,
  );
  const controller = installed.controller;
  const store = controller.store;
  controller.start({
    projectId: PROJECT,
    goal: "g",
    tasks: TASKS.map((taskId) => taskSpec(taskId)),
    stageGraph: {
      stages: [
        { id: "active", state: "ACTIVE", concurrency: 3 },
        { id: "verifying", state: "VERIFYING", concurrency: 3 },
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
      declared_by: "d5d-spec",
      reason: "three tasks reach VERIFYING together so quiescence and freshness can be proven separately",
    },
    headCommit: head0,
  });
  controller.declareRoleTable({
    roles: [{ role: "implementer", slots: 3 }],
    hardCap: 3,
    declaredBy: "d5d-spec",
  });

  const attempts: Record<string, string> = {};

  const drive = async (taskId: string): Promise<string> => {
    let hostError: string | null = null;
    const service = makeWorkDelegationService({
      controller,
      workerFor: (worldPath: string) => ({
        adapterId: "d5d-drive",
        run: async (input: { readonly context: unknown }) => {
          const context = input.context as { work: { writeScope: readonly string[] } };
          const target = context.work.writeScope[0];
          if (target === undefined) throw new Error("drive worker got no write scope");
          writeFileSync(join(worldPath, target), `export const base = 1; // ${taskId}\n`);
          execFileSync("git", ["add", "-A"], { cwd: worldPath });
          execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `work ${taskId}`], {
            cwd: worldPath,
          });
          return { kind: "READY_FOR_SETTLEMENT" as const };
        },
      }),
      onTerminal: (terminal) => {
        hostError = terminal.hostError;
      },
    });
    await service.start({ expectedTaskId: taskId });
    for (let i = 0; i < 600; i += 1) {
      const row = store.connection
        .prepare("SELECT state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
        .get(PROJECT, taskId) as { state: string } | undefined;
      if (row !== undefined && row.state === "COMPLETED") break;
      if (hostError !== null) throw new Error(`delegation host error: ${hostError}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (i === 599) throw new Error(`attempt for ${taskId} never completed`);
    }
    const attemptId = (
      store.connection
        .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
        .get(PROJECT, taskId) as { attempt_id: string }
    ).attempt_id;
    // The drive settles its OWN batch before returning: the next mutating start must find the
    // scheduler's next decision pointing at fresh work, not at a pending settlement.
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    attempts[taskId] = attemptId;
    return attemptId;
  };

  return {
    installed,
    repo,
    workerContexts,
    attempts,
    drive,
    taskState: (taskId) =>
      String(
        (
          store.connection
            .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
            .get(PROJECT, taskId) as { state: string }
        ).state,
      ),
    attemptState: (attemptId) => {
      const row = store.connection
        .prepare("SELECT state FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(PROJECT, attemptId) as { state: string } | undefined;
      return row === undefined ? null : row.state;
    },
    ir: () => {
      const row = store.connection
        .prepare("SELECT state_json FROM projects WHERE project_id=?")
        .get(PROJECT) as { state_json: Uint8Array };
      return JSON.parse(new TextDecoder().decode(row.state_json)) as { head_commit: string; revision: number };
    },
    events: () =>
      store.listEvents(PROJECT).map((event) => ({
        event_id: Number(event.event_id),
        event_type: event.event_type,
        entity_id: event.entity_id,
        payload: event.payload as Record<string, unknown>,
      })),
    reworkEvents: () =>
      store
        .listEvents(PROJECT)
        .filter((event) => event.event_type === "TASK_READY")
        .filter((event) => (event.payload as { rework_provenance?: unknown }).rework_provenance !== undefined)
        .map((event) => {
          const provenance = (
            event.payload as { rework_provenance: { origin_result_subject: { ref: string }; reason: string } }
          ).rework_provenance;
          return {
            event_id: Number(event.event_id),
            entity_id: event.entity_id,
            ref: provenance.origin_result_subject.ref,
            reason: provenance.reason,
          };
        }),
    resultCommitOf: (attemptId) => {
      const event = store
        .listEvents(PROJECT)
        .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
      if (event === undefined) throw new Error(`attempt ${attemptId} has no completion`);
      return (event.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
    },
    refOf: (taskId) => {
      const attemptId = attempts[taskId];
      if (attemptId === undefined) throw new Error(`no driven attempt for ${taskId}`);
      return { kind: "ATTEMPT_RESULT" as const, ref: attemptId };
    },
    step: () => {
      const event = controller.step();
      return event === null ? null : event.event_type;
    },
    close: async () => {
      await installed.dispose();
    },
  };
}

/**
 * The standard drift line: three attempts reach VERIFYING at H0; promoting task-a moves the head to
 * H1, which makes task-b and task-c stale — and after it, `inspect(b)` is INCOMPATIBLE (the honest
 * first-party whole-repository read collides with the observed source change).
 */
async function driftLine(r: Rig): Promise<void> {
  await r.drive("task-a");
  await r.drive("task-b");
  await r.drive("task-c");
  await r.installed.controller.promote(r.attempts["task-a"]!, r.resultCommitOf(r.attempts["task-a"]!), r.ir().head_commit);
  expect(r.step()).toBe("TASK_SATISFIED");
}

/* ================================================================== *
 * The probe: the REAL service factory over the REAL owners, with a
 * controllable cross-basis observation — for the guards the packaged kernel
 * cannot be interrupted in (it is synchronous by design).
 * ================================================================== */

async function probeService(
  r: Rig,
  options: {
    readonly mutateTargetFromCall?: number;
    readonly omitSourceObserver?: boolean;
  } = {},
): Promise<{ readonly service: ReturnType<typeof makeResultContinuationService>; readonly calls: () => number }> {
  const controller = r.installed.controller;
  const store = controller.store;
  const repo = r.repo;
  const envelopeOf = (taskId: string): unknown | null => {
    const row = store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { envelope_json: Uint8Array | null } | undefined;
    if (row === undefined || row.envelope_json === null) return null;
    return JSON.parse(new TextDecoder().decode(row.envelope_json));
  };
  const observation = firstPartyProjectWorldObservation({
    owner: {
      taskEnvelope: envelopeOf,
      projectRevision: () =>
        Number(
          (store.connection.prepare("SELECT revision FROM projects WHERE project_id=?").get(PROJECT) as { revision: number })
            .revision,
        ),
    },
    repository: repo,
  });
  const basisStore = new SqliteAttemptWorldBasisStore(join(repo, ".palimpsest", "attempt_world_basis.sqlite"));
  const basisRuntime = makeProjectWorldBasisRuntime({ projectId: PROJECT, store: basisStore, observation });
  const observations = makeObservationAuthority({ databasePath: ":memory:" });
  const issuer = makeCompatibilityIssuer({ issuerId: "probe-issuer", observations, databasePath: ":memory:" });
  const sourceRecorder = observations.registerObserver({
    observerId: GIT_SOURCE_OBSERVER_ID,
    observerVersion: GIT_SOURCE_OBSERVER_VERSION,
    mechanism: GIT_SOURCE_MECHANISM,
  });
  const conservative = observations.registerObserver({ observerId: "world-materializer", observerVersion: "1", mechanism: "CONSERVATIVE_DOMAIN" });
  const candidates = new SqliteDerivedResultCandidateStore(":memory:");
  const results = firstPartyResultResolver({
    owner: {
      projectId: PROJECT,
      attemptBasis: (attemptId) => {
        const record = basisStore.read({ projectId: PROJECT, attemptId });
        return record === null ? null : { basis: record.basis, taskId: record.taskId };
      },
    },
    attemptResultSource: firstPartyAttemptResultVerificationSource(controller),
    candidates,
  });
  const realCrossBasis: CrossBasisAdmissionRuntime = makeCrossBasisAdmissionRuntime({ issuer, observation });
  let calls = 0;
  const crossBasis: CrossBasisAdmissionRuntime = Object.freeze({
    adapterId: realCrossBasis.adapterId,
    issuer: realCrossBasis.issuer,
    observeTarget: (taskId: string) => {
      calls += 1;
      const real = realCrossBasis.observeTarget(taskId);
      if (options.mutateTargetFromCall !== undefined && calls >= options.mutateTargetFromCall) {
        return { digest: `${real.digest}:moved`, detail: real.detail };
      }
      return real;
    },
    admit: (input: Parameters<CrossBasisAdmissionRuntime["admit"]>[0]) => realCrossBasis.admit(input),
  });
  /**
   * SR-2 §八: the probe now implements the FIVE PORTS, exactly as the composition does — the
   * service on the other side knows none of the concrete wiring this function builds.
   */
  const service = makeResultContinuationService({
    projectId: PROJECT,
    work: {
      task: (taskId: string) => {
        const row = store.connection
          .prepare("SELECT state, state_json, last_event_id FROM tasks WHERE project_id=? AND task_id=?")
          .get(PROJECT, taskId) as { state: string; state_json: Uint8Array; last_event_id: number } | undefined;
        if (row === undefined) return null;
        const parsed = JSON.parse(new TextDecoder().decode(row.state_json)) as { batch_activation_event_id: number | null };
        const envelope = envelopeOf(taskId) as { envelope_id: string } | null;
        return {
          state: row.state,
          batchActivationEventId: parsed.batch_activation_event_id === null ? null : Number(parsed.batch_activation_event_id),
          lastEventId: Number(row.last_event_id),
          envelopeId: envelope === null ? null : envelope.envelope_id,
        };
      },
      attempt: (attemptId: string) => {
        const row = store.connection
          .prepare("SELECT task_id, state, state_json FROM attempts WHERE project_id=? AND attempt_id=?")
          .get(PROJECT, attemptId) as { task_id: string; state: string; state_json: Uint8Array } | undefined;
        if (row === undefined) return null;
        const parsed = JSON.parse(new TextDecoder().decode(row.state_json)) as { batch_activation_event_id: number | null };
        return {
          taskId: String(row.task_id),
          state: row.state,
          batchActivationEventId: parsed.batch_activation_event_id === null ? null : Number(parsed.batch_activation_event_id),
        };
      },
      openAttempt: () => null,
      reworkLineage: ({ taskId, resultRef }) => {
        for (const event of store.listEvents(PROJECT)) {
          if (event.event_type !== "TASK_READY" || event.entity_id !== taskId) continue;
          const provenance = (
            event.payload as { rework_provenance?: { origin_result_subject?: { ref?: unknown } } }
          ).rework_provenance;
          const ref = provenance?.origin_result_subject?.ref;
          if (typeof ref === "string" && ref === resultRef) return { eventId: Number(event.event_id) };
        }
        return null;
      },
      reopen: ({ taskId, batchActivationEventId, lastEventId, permit, assessmentDigest }) => {
        const appended = store.appendReworkReopening(
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "TASK_READY",
            payload_version: 1,
            entity_type: "task",
            entity_id: taskId,
            payload: normalizeEventPayload("TASK_READY", {
              previous_state: "VERIFYING",
              new_state: "READY",
              reason: "rework-admitted",
              batch_activation_event_id: batchActivationEventId,
            }),
            causation_id: lastEventId,
            correlation_id: `task:${taskId}:rework`,
            idempotency_key: actionKey("task-batch-settle-v1", {
              project_id: PROJECT,
              task_id: taskId,
              batch_activation_event_id: batchActivationEventId,
              target_state: "READY",
            }),
            expected_project_revision: 0,
          }),
          permit,
          { assessmentDigest },
        );
        return Number(appended.event_id);
      },
    },
    world: {
      inspect: ({ result }) => {
        const resolved = results.resolve(result);
        if (resolved === null) {
          return { resolved: null, currentness: null, targetObservation: null, compatibility: null };
        }
        const currentness = basisRuntime.assessCurrentness({ attemptId: result.ref });
        const target = crossBasis.observeTarget(resolved.taskId);
        const certificate = issueCertificateForProbe({ resolved, currentness, target, store, basisStore, repo, sourceRecorder, conservative, issuer });
        return {
          resolved,
          currentness: currentness === null ? null : currentness.currentness,
          targetObservation: target,
          compatibility:
            certificate === null
              ? null
              : { outcome: certificate.assessment.outcome, issuanceDigest: certificate.issuanceDigest },
        };
      },
      observeTarget: (taskId: string) => crossBasis.observeTarget(taskId),
      rematerializationAvailable: false,
      hasCapturedBasis: ({ attemptId }) => basisStore.read({ projectId: PROJECT, attemptId }) !== null,
    },
    result: {
      admitAndRematerialize: async () => ({
        state: "EFFECT_CAPABILITY_UNAVAILABLE" as const,
        admissionRef: null,
        candidateRef: null,
        detail: "the probe composes no rematerialization capability",
      }),
    },
    canonical: {
      targetFence: () => controller.reworkTargetFence(),
      reconcileHead: async () => {
        const outcome = await controller.reconcileProjectHead();
        return outcome.status === "blocked"
          ? { status: "blocked" as const, blockers: outcome.blockers }
          : { status: outcome.status, blockers: [] };
      },
    },
    execution: null,
  });

  return { service, calls: () => calls };
}

/**
 * The fresh-facts certificate, for the probe's world port.
 *
 * This is the same D3-R chain the composition wires (D3-a → authority-bearing observations →
 * the existing issuer). It lives here because the probe stands in for the composition on the
 * consumer side of the ports; the SERVICE never sees any of it.
 */
function issueCertificateForProbe(input: {
  readonly resolved: { readonly resultSubjectRef: { readonly kind: string; readonly ref: string }; readonly resultManifestDigest: string; readonly originBasisDigest: string; readonly taskId: string; readonly sourceResult: { readonly resultRevision: string } | null };
  readonly currentness: { readonly currentness: string } | null;
  readonly target: { readonly digest: string; readonly detail: string };
  readonly store: EventStore;
  readonly basisStore: AttemptWorldBasisStore;
  readonly repo: string;
  readonly sourceRecorder: ObservationRecorder;
  readonly conservative: ObservationRecorder;
  readonly issuer: CompatibilityIssuer;
}): IssuedCompatibilityAssessment | null {
  const { resolved, currentness, target } = input;
  const record = input.basisStore.read({ projectId: PROJECT, attemptId: resolved.resultSubjectRef.ref });
  const source = record?.basis.source;
  const originSourceRevision = source !== undefined && source.state === "BOUND" ? source.value.revision : null;
  const currentSource = (() => {
    try {
      return { ok: true as const, revision: execFileSync("git", ["-C", input.repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
    } catch {
      return { ok: false as const, detail: "unreadable" };
    }
  })();
  const scopeOf = (from: string, to: string) => ({ domain: "source" as const, scopeRef: input.repo, from, to });
  const unavailable = (domain: "project_semantic" | "source" | "assets" | "environment", detail: string) =>
    input.conservative.unavailable({ domain, detail });
  const changeRef =
    originSourceRevision !== null && currentSource.ok
      ? input.sourceRecorder.record({
          scope: scopeOf(originSourceRevision, currentSource.revision),
          selectors: [],
        })
      : unavailable("source", "the basis-to-current source change could not be observed");
  const writeRef =
    originSourceRevision !== null && resolved.sourceResult !== null
      ? input.sourceRecorder.record({
          scope: scopeOf(originSourceRevision, resolved.sourceResult.resultRevision),
          selectors: [],
        })
      : unavailable("source", "the result's write footprint could not be observed");
  const readRef =
    originSourceRevision === null
      ? null
      : input.conservative.record({ scope: scopeOf(originSourceRevision, originSourceRevision), selectors: [REPOSITORY_SOURCE] });
  return input.issuer.issue({
    resultManifestDigest: resolved.resultManifestDigest,
    originBasisDigest: resolved.originBasisDigest,
    targetObservationDigest: target.digest,
    exactlyCurrent: currentness?.currentness === "CURRENT",
    observationRefs: {
      projectSemantic: unavailable("project_semantic", "no first-party observer exists for the project semantic change domain"),
      source: changeRef,
      assets: unavailable("assets", "no first-party observer exists for the asset change domain"),
      environment: unavailable("environment", "no first-party observer exists for the environment change domain"),
      resultReads: readRef,
      resultWrites: writeRef,
    },
  });
}

/* ================================================================== *
 * 1–4. The mint discipline
 * ================================================================== */

describe("§D5-d the mint discipline", () => {
  it("1. CALLER-FACT FIREWALL: the route inputs carry only result identity + assessment digest; inspect mints nothing", async () => {
    const r = await rig();
    try {
      await driftLine(r);
      const inspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      expect(inspection.resolved).toBe(true);
      expect(inspection.compatibility.outcome).toBe("INCOMPATIBLE");
      expect(inspection.availableActions.rework).toBe(true);
      // Inspection is assessment, never effect:
      expect(r.reworkEvents()).toHaveLength(0);
      expect(r.taskState("task-b")).toBe("VERIFYING");
      // And the packaged surface's own type names no authority fact a caller could pass:
      const source = readSource("src/continuation/service.ts");
      const start = source.indexOf("startRework(input: {");
      const end = source.indexOf("}): Promise<ReworkContinuationResult>", start);
      const inputType = source.slice(start, end);
      for (const forbidden of ["targetObservationDigest", "currentEnvelopeId", "batchActivationEventId", "reason", "originBasisDigest", "targetFence"]) {
        expect(inputType).not.toContain(forbidden);
      }
    } finally {
      await r.close();
    }
  }, 240_000);

  it("2. FRESH ASSESS BEFORE MINT: a world move after the choice is STALE_INSPECTION — zero events, zero permits", async () => {
    const r = await rig();
    try {
      await r.drive("task-a");
      await r.drive("task-b");
      await r.drive("task-c");
      // The caller inspects while task-b is EXACTLY current (world H0, its own basis H0):
      const inspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      expect(inspection.assessment!.currentness).toBe("CURRENT");
      const digest = inspection.assessment!.assessmentDigest;
      // The world moves: task-a's result is promoted (H0 → H1).
      await r.installed.controller.promote(r.attempts["task-a"]!, r.resultCommitOf(r.attempts["task-a"]!), r.ir().head_commit);
      expect(r.step()).toBe("TASK_SATISFIED");
      // The baseline is taken AFTER the world moved: from here, the refused route must write NOTHING.
      const eventsBefore = r.events().length;
      const outcome = await r.installed.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: digest });
      expect(outcome.state).toBe("STALE_INSPECTION");
      expect(r.events().length).toBe(eventsBefore);
      expect(r.reworkEvents()).toHaveLength(0);
      expect(r.taskState("task-b")).toBe("VERIFYING");
    } finally {
      await r.close();
    }
  }, 240_000);

  it("3. FINAL REOBSERVE: a target that moves between the assessment and the mint cannot be minted against", async () => {
    const r = await rig();
    try {
      await driftLine(r);
      // Calls 1–2 observe the real target (test inspect + the kernel's assessment); call 3 — the
      // FINAL re-observe before the mint — sees a moved world.
      const probe = await probeService(r, { mutateTargetFromCall: 3 });
      const inspection = probe.service.inspect({ result: r.refOf("task-b") });
      expect(probe.calls()).toBe(1);
      const outcome = await probe.service.startRework({
        result: r.refOf("task-b"),
        expectedAssessmentDigest: inspection.assessment!.assessmentDigest,
      });
      expect(probe.calls()).toBe(3);
      expect(outcome.state).toBe("STALE_INSPECTION");
      expect(r.reworkEvents()).toHaveLength(0);
      expect(r.taskState("task-b")).toBe("VERIFYING");
      // Companion: WITHOUT the mutation the same route mints (the guard is the mutation, not the route).
      const clean = await probeService(r);
      const cleanInspection = clean.service.inspect({ result: r.refOf("task-b") });
      const minted = await clean.service.startRework({
        result: r.refOf("task-b"),
        expectedAssessmentDigest: cleanInspection.assessment!.assessmentDigest,
      });
      expect(["REOPENED_WAITING_FOR_QUIESCENCE", "READY_FOR_DELEGATION"]).toContain(minted.state);
      expect(r.reworkEvents()).toHaveLength(1);
    } finally {
      await r.close();
    }
  }, 240_000);

  it("4. NO NOT_ASSESSED LAUNDERING: the packaged inspection actually runs D3-b — thin evidence reads UNKNOWN, not NOT_ASSESSED", async () => {
    const r = await rig();
    try {
      await driftLine(r);
      // The same real stack with the source observer ABSENT: the change facet cannot be observed, so
      // the authoritative D3-b must answer UNKNOWN — and the packaged inspection must surface exactly
      // that (never the "nobody tried" NOT_ASSESSED), with rework still honestly offered.
      const probe = await probeService(r, { omitSourceObserver: true });
      const inspection = probe.service.inspect({ result: r.refOf("task-b") });
      expect(inspection.resolved).toBe(true);
      expect(inspection.compatibility.outcome).toBe("UNKNOWN");
      expect(inspection.assessment!.compatibility).toBe("UNKNOWN");
      expect(inspection.compatibility.outcome).not.toBe("NOT_ASSESSED");
      expect(inspection.availableActions.rework).toBe(true);
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * 5/7/8/14. The governed opening: origin binding, replay, quiescence
 * ================================================================== */

describe("§D5-d the governed opening", () => {
  it("8+7+14a. QUIESCENCE HONEST + DURABLE REPLAY: one command acts on one result; the record decides the retry", async () => {
    const r = await rig();
    try {
      await driftLine(r);
      const inspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      const digest = inspection.assessment!.assessmentDigest;
      const first = await r.installed.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: digest });
      // task-c still VERIFYING → the head reconciliation is blocked, and the service says so:
      expect(first.state).toBe("REOPENED_WAITING_FOR_QUIESCENCE");
      expect(first.blockers.join(" ")).toContain("quiescence");
      expect(first.headSynced).toBe(false);
      expect(first.reopenedEventId).not.toBeNull();
      // The reopening landed, exactly once, and the blocking task is UNTOUCHED:
      expect(r.reworkEvents()).toHaveLength(1);
      expect(r.taskState("task-b")).toBe("READY");
      expect(r.taskState("task-c")).toBe("VERIFYING");
      const eventsAfterFirst = r.events().length;
      // THE RECORD DECIDES REPLAY: the retry mints nothing and reports the same position.
      const second = await r.installed.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: digest });
      expect(second.state).toBe("REOPENED_WAITING_FOR_QUIESCENCE");
      expect(second.reopenedEventId).toBeNull();
      expect(r.reworkEvents()).toHaveLength(1);
      expect(r.events().length).toBe(eventsAfterFirst);
      // A restart sees the same durable truth: a fresh install over the same ledger reconstructs the
      // phase from the record and still mints nothing.
      const dir = r.repo;
      const restarted = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
        projectId: PROJECT,
        databasePath: join(dir, ".palimpsest", "p.sqlite"),
        ordariumDatabasePath: join(dir, ".palimpsest", "o.sqlite"),
        repository: dir,
        git: new GitCliPort(dir, join(dir, ".palimpsest", "worlds")),
      } as never);
      try {
        const eventsBeforeRestart = r.events().length;
        const retry = await restarted.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: "0".repeat(64) });
        // The replay path does not need the digest — the record decides — and it reports the same
        // quiescence position with no second reopening.
        expect(retry.state).toBe("REOPENED_WAITING_FOR_QUIESCENCE");
        expect(retry.reopenedEventId).toBeNull();
        expect(r.events().length).toBe(eventsBeforeRestart);
        expect(r.reworkEvents()).toHaveLength(1);
      } finally {
        await restarted.dispose();
      }
    } finally {
      await r.close();
    }
  }, 300_000);

  it("5. ORIGIN BINDING: an older attempt cannot authorize the newer batch's rework", async () => {
    const r = await rig({ withWorkerPort: true });
    try {
      await driftLine(r);
      // Reopen b (blocked by c), then reopen c — the second command reconciles the head. The
      // delegation half of either command may honestly report READY_FOR_DELEGATION: the D2-d
      // scheduler boots the task IT makes next, one mutating lane at a time.
      const bInspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      const first = await r.installed.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: bInspection.assessment!.assessmentDigest });
      expect(first.state).toBe("REOPENED_WAITING_FOR_QUIESCENCE");
      const cInspection = r.installed.continuation!.inspect({ result: r.refOf("task-c") });
      const second = await r.installed.continuation!.startRework({ result: r.refOf("task-c"), expectedAssessmentDigest: cInspection.assessment!.assessmentDigest });
      expect(second.headSynced).toBe(true);
      // b's re-execution takes the lane:
      const delegated = await driveReworkToDelegation(r, "task-b", bInspection.assessment!.assessmentDigest);
      expect(delegated.reopenedEventId).toBeNull();
      const a1 = await waitAttemptCompleted(r, "task-b", r.attempts["task-b"]!);
      await r.installed.controller.gate({ attemptId: a1, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
      expect(r.step()).toBe("TASK_VERIFYING");
      expect(r.taskState("task-b")).toBe("VERIFYING");
      // The OLD result (A0 of task-b) must not be able to authorize THIS batch's rework:
      const before = r.reworkEvents().length;
      const refused = await r.installed.continuation!.startRework({
        result: r.refOf("task-b"),
        expectedAssessmentDigest: bInspection.assessment!.assessmentDigest,
      });
      expect(refused.state).toBe("REFUSED");
      expect(refused.detail).toContain("batch");
      expect(r.reworkEvents().length).toBe(before);
    } finally {
      await r.close();
    }
  }, 420_000);
});

/* ================================================================== *
 * 11/12/16/17/18. The packaged chain end to end
 * ================================================================== */

describe("§D5-d the packaged chain end to end", () => {
  it("reopen → head sync → D2-d delegation → A1 on the current basis → verified → promoted; the worker receives M+C and no authority", async () => {
    const r = await rig({ withWorkerPort: true });
    try {
      await driftLine(r);
      const h1 = r.ir().head_commit;
      const bInspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      const first = await r.installed.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: bInspection.assessment!.assessmentDigest });
      expect(first.state).toBe("REOPENED_WAITING_FOR_QUIESCENCE");
      const cInspection = r.installed.continuation!.inspect({ result: r.refOf("task-c") });
      const second = await r.installed.continuation!.startRework({ result: r.refOf("task-c"), expectedAssessmentDigest: cInspection.assessment!.assessmentDigest });
      // task-c's command found quiescence (b left VERIFYING) and synced the head; its delegation
      // half reports honestly against the scheduler's own next decision.
      expect(second.headSynced).toBe(true);
      // b's re-execution runs the lane, completes, verifies and promotes the ordinary way:
      const delegatedB = await driveReworkToDelegation(r, "task-b", bInspection.assessment!.assessmentDigest);
      expect(delegatedB.state).toBe("DELEGATED");
      expect(delegatedB.reopenedEventId).toBeNull();
      const a1 = await waitAttemptCompleted(r, "task-b", r.attempts["task-b"]!);
      await r.installed.controller.gate({ attemptId: a1, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
      expect(r.step()).toBe("TASK_VERIFYING");
      await r.installed.controller.promote(a1, r.resultCommitOf(a1), r.ir().head_commit);
      expect(r.step()).toBe("TASK_SATISFIED");
      const h2 = r.ir().head_commit;
      expect(h2).not.toBe(h1);
      // Then task-c's re-execution: the record decides replay, the head syncs to H2's basis, and
      // the lane is free.
      const delegatedC = await driveReworkToDelegation(r, "task-c", cInspection.assessment!.assessmentDigest);
      expect(delegatedC.state).toBe("DELEGATED");
      const c1 = await waitAttemptCompleted(r, "task-c", r.attempts["task-c"]!);
      await r.installed.controller.gate({ attemptId: c1, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
      expect(r.step()).toBe("TASK_VERIFYING");
      await r.installed.controller.promote(c1, r.resultCommitOf(c1), r.ir().head_commit);
      expect(r.step()).toBe("TASK_SATISFIED");
      const h3 = r.ir().head_commit;
      expect(h3).not.toBe(h2);

      // Both rework events, each for its own origin result:
      const reworks = r.reworkEvents();
      expect(reworks).toHaveLength(2);
      expect(reworks.map((entry) => entry.entity_id).sort()).toEqual(["task-b", "task-c"]);

      // THE WORKER DELIVERY: attempt-centric {work, compiled}, with the read-only continuation and
      // NO authority object of any kind.
      expect(r.workerContexts.length).toBe(2);
      for (const context of r.workerContexts) {
        expect(Object.keys(context).sort()).toEqual(["compiled", "work"]);
        const compiled = context.compiled as {
          manifestId: string;
          continuation: {
            lineage: { reason: string };
            prior_execution: { worker_summary: string };
            world_transition: { from_head: string; to_head: string };
          };
        };
        expect(typeof compiled.manifestId).toBe("string");
        // §D5-c2 regressions (16/17): the prior execution rides as a labelled presentation bound to
        // the world transition — never as an authority.
        expect(compiled.continuation.lineage.reason).toBe("INCOMPATIBLE");
        expect(compiled.continuation.prior_execution.worker_summary).toBeTruthy();
        expect(compiled.continuation.world_transition.from_head).not.toBe(compiled.continuation.world_transition.to_head);
      }
      // §24 proof 18: no permit, no certificate, no fence, no observation refs reach the worker or the caller.
      const serialized = JSON.stringify({ contexts: r.workerContexts, first, second, delegatedB, delegatedC });
      for (const forbidden of ["permitDigest", "targetFence", "target_fence", "issuanceDigest", "observationRefs", "ReworkAdmissionPermit", "reworkPermit"]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      await r.close();
    }
  }, 600_000);

  it("12. NO AUTO FALLBACK: rematerialize refuses an INCOMPATIBLE result and writes nothing", async () => {
    const r = await rig();
    try {
      await driftLine(r);
      const inspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      const before = r.events().length;
      const outcome = await r.installed.continuation!.rematerialize({
        result: r.refOf("task-b"),
        expectedAssessmentDigest: inspection.assessment!.assessmentDigest,
      });
      expect(outcome.state).toBe("REFUSED");
      expect(r.events().length).toBe(before);
      expect(r.reworkEvents()).toHaveLength(0);
      // The freshness fence holds on this route too:
      const stale = await r.installed.continuation!.rematerialize({ result: r.refOf("task-b"), expectedAssessmentDigest: "0".repeat(64) });
      expect(stale.state).toBe("STALE_INSPECTION");
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * 6/9/10/13/15. The structural pins
 * ================================================================== */

describe("§D5-d the structural pins", () => {
  it("6. PERMIT UNIQUE MINT SURFACE: in product code, only the continuation service calls ReworkAdmissionPermit.issue", () => {
    const hits = execFileSync("grep", ["-rl", "--include=*.ts", "ReworkAdmissionPermit.issue", "src"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((line) => line !== "");
    expect(hits.sort()).toEqual(["src/continuation/service.ts"]);
  });

  it("9+10. OWNER BOUNDARIES: the service touches neither the head machinery nor the execution kernel", () => {
    const source = stripComments(readSource("src/continuation/service.ts"));
    for (const forbidden of [
      "planReconciled",
      "headAdvance",
      "advanceBasisForRework",
      "reconcileHeadIgnoringVerifying",
      "ATTEMPT_CREATED",
      "TASK_STARTED",
      "prepareMutatingWork",
      "compileTaskContext",
      "workWorkerAttemptContext",
      "settleMutatingWork",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // The only head call is the G10-X owner; the only attempt starter is the D2-d owner — and
    // SR-2 §八 made this STRONGER: the service no longer names the delegation service at all,
    // it calls the execution port's one verb.
    expect(source).toContain("deps.canonical.reconcileHead");
    expect(source).toContain("deps.execution.startOrResume");
    expect(source).not.toContain("workDelegation");
  });

    it("13. NO NEW CANONICAL VOCABULARY OR STORE: the continuation layer creates no event type and no database", () => {
    const service = stripComments(readSource("src/continuation/service.ts"));
    expect(service).not.toMatch(/CREATE TABLE/);
    expect(service).not.toMatch(/sqlite/i);
    // SR-2 §八 made this STRONGER still: the service no longer names ANY event type, because
    // building the governed TASK_READY payload is the work port's job now (the composition
    // owns that wire shape). The vocabulary check therefore asserts the absence itself.
    const eventLiterals = [...service.matchAll(/"(TASK_[A-Z_]+)"/g)].map((match) => match[1]);
    expect([...new Set(eventLiterals)]).toEqual([]);
  });

  it("15. PACKAGE CAPABILITY HONESTY: no repository ⇒ no continuation face; no worker port ⇒ READY_FOR_DELEGATION, never a stub", async () => {
    // (a) an install with no repository cannot observe a world, so the face is absent.
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5d-bare-"));
    cleanups.push(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows keeps the directory busy while a handle is open; the OS reaps it.
      }
    });
    const bare = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
      projectId: "d5d-bare",
      databasePath: join(dir, "p.sqlite"),
      ordariumDatabasePath: join(dir, "o.sqlite"),
    } as never);
    try {
      expect(bare.continuation).toBeUndefined();
    } finally {
      await bare.dispose();
    }
    // (b) the worker-less packaged install reopens, reconciles, and honestly reports the absence.
    const r = await rig({ withWorkerPort: false });
    try {
      await driftLine(r);
      const bInspection = r.installed.continuation!.inspect({ result: r.refOf("task-b") });
      const first = await r.installed.continuation!.startRework({ result: r.refOf("task-b"), expectedAssessmentDigest: bInspection.assessment!.assessmentDigest });
      expect(first.state).toBe("REOPENED_WAITING_FOR_QUIESCENCE");
      const cInspection = r.installed.continuation!.inspect({ result: r.refOf("task-c") });
      const second = await r.installed.continuation!.startRework({ result: r.refOf("task-c"), expectedAssessmentDigest: cInspection.assessment!.assessmentDigest });
      // task-c's own command finds quiescence and syncs the head, then reports the missing
      // delegation capability as what it is — never a stub, never a fabricated attempt.
      expect(second.state).toBe("READY_FOR_DELEGATION");
      expect(second.headSynced).toBe(true);
      expect(second.attemptId).toBeNull();
      expect(second.jobId).toBeNull();
      expect(r.taskState("task-c")).toBe("READY");
      expect(r.taskState("task-b")).toBe("READY");
    } finally {
      await r.close();
    }
  }, 300_000);
});

/**
 * Retry the record-decided replay until the D2-d lane takes this task's re-execution. The intermediate
 * READY_FOR_DELEGATION states are the honest "the scheduler boots the task IT makes next / the single
 * mutating lane is held" — never fabricated delegation.
 */
async function driveReworkToDelegation(
  r: Rig,
  taskId: string,
  digest: string,
): Promise<Awaited<ReturnType<NonNullable<InstalledPalimpsest["continuation"]>["startRework"]>>> {
  for (let i = 0; i < 15; i += 1) {
    const outcome = await r.installed.continuation!.startRework({
      result: r.refOf(taskId),
      expectedAssessmentDigest: digest,
    });
    if (outcome.state === "DELEGATED") return outcome;
    expect(["READY_FOR_DELEGATION", "REOPENED_WAITING_FOR_QUIESCENCE"]).toContain(outcome.state);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (i === 14) throw new Error(`the rework delegation for ${taskId} never took the lane; last=${outcome.state}`);
  }
  throw new Error("unreachable");
}

/** Wait for a task's NEXT attempt (≠ previous) to reach COMPLETED; returns its id. */
async function waitAttemptCompleted(r: Rig, taskId: string, previousAttemptId: string): Promise<string> {
  const { store } = r.installed.controller;
  for (let i = 0; i < 900; i += 1) {
    const row = store.connection
      .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(PROJECT, taskId) as { attempt_id: string; state: string } | undefined;
    if (row !== undefined && row.attempt_id !== previousAttemptId && row.state === "COMPLETED") return row.attempt_id;
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (i === 899) throw new Error(`the re-executed attempt for ${taskId} never completed`);
  }
  throw new Error("unreachable");
}
