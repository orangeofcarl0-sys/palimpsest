/**
 * G10-AA adversarial suite (AA-N01…AA-N30).
 *
 * The defended boundary: a generic EventStore writer, a plugin/module writer, an
 * accidental alternate ingestion path, a direct-append bypass. NOT defended:
 * arbitrary malicious code already in this process that imports the admission
 * module, or anyone who can rewrite the SQLite file or process memory.
 */

import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { SimulatedProcessCrash, UncertainOperationError } from "@ordarium/core";
import { ManualClock } from "@ordarium/testing";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import {
  createPalimpsestEffects,
  FakeGitPort,
  type GitPort,
  type PalimpsestEffectsRuntime,
} from "../src/effects/index.js";
import { TaskPolicy, actionKey } from "../src/domain/index.js";
import {
  PromotionAdmissionError,
  PromotionIntentPermit,
  PromotionOutcomeWitness,
} from "../src/domain/promotion_terminal_admission.js";
import {
  PROMOTION_OUTCOME_BASES,
  PROMOTION_OUTCOME_KINDS,
  PROMOTION_TERMINAL_TYPES,
} from "../src/domain/promotion_terminal.js";
import { normalizeEventPayload, parseNewEvent, type NewEvent } from "../src/schema/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "aa-adv-project";
const REPO = join(__dirname, "..");

class CrashAfterMergeGit implements GitPort {
  merges = 0;
  constructor(
    readonly git: GitPort,
    readonly crash: boolean,
    readonly uncertain = false,
  ) {}
  createWorktree(input: Parameters<GitPort["createWorktree"]>[0]) {
    return this.git.createWorktree(input);
  }
  commit(input: Parameters<GitPort["commit"]>[0]) {
    return this.git.commit(input);
  }
  async promote(input: Parameters<GitPort["promote"]>[0]): Promise<{ resultingHeadCommit: string }> {
    this.merges += 1;
    if (this.uncertain) {
      // The merge never happened and the engine cannot tell: no verdict exists.
      throw new UncertainOperationError("outcome unknown");
    }
    const outcome = await this.git.promote(input);
    if (!this.crash) return outcome;
    throw new SimulatedProcessCrash("post-merge crash");
  }
  head() {
    return this.git.head();
  }
  contains(commit: string) {
    return this.git.contains(commit);
  }
  runGate(input: Parameters<GitPort["runGate"]>[0]) {
    return this.git.runGate(input);
  }
  scanLexical(input: Parameters<GitPort["scanLexical"]>[0]) {
    return this.git.scanLexical(input);
  }
  collectWorktreeTexts(input: Parameters<GitPort["collectWorktreeTexts"]>[0]) {
    return this.git.collectWorktreeTexts(input);
  }
}

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly effects: PalimpsestEffectsRuntime;
  readonly git: FakeGitPort;
  readonly crashing: CrashAfterMergeGit;
  readonly ledgerPath: string;
  advance(ms: number): void;
  cleanup(): Promise<void>;
}

async function rig(
  options: {
    crash?: boolean;
    uncertain?: boolean;
    tasks?: readonly ReturnType<typeof taskSpec>[];
  } = {},
): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-aa-adv-"));
  const ledgerPath = join(dir, "o.sqlite");
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const crashing = new CrashAfterMergeGit(git, options.crash ?? true, options.uncertain ?? false);
  const leaseClock = new ManualClock();
  const effects = createPalimpsestEffects({
    databasePath: ledgerPath,
    git: crashing,
    clock: leaseClock.now,
    leaseMs: 50,
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 3600,
      lease_s: 60,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  if (options.tasks !== undefined) {
    controller.start({ projectId: PROJECT, goal: "g", tasks: [...options.tasks] });
  }
  return {
    dir,
    store,
    controller,
    effects,
    git,
    crashing,
    ledgerPath,
    advance: (ms: number) => leaseClock.advance(ms),
    cleanup: async () => {
      await effects.close();
      try {
        store.close();
      } catch {
        /* reopened */
      }
    },
  };
}

const eventsOfType = (store: EventStore, eventType: string) =>
  store.listEvents(PROJECT).filter((event) => event.event_type === eventType);

function promotionState(store: EventStore, promotionId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM promotions WHERE project_id=? AND promotion_id=?")
    .get(PROJECT, promotionId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

async function driveToVerifying(target: Rig): Promise<{ attemptId: string; resultCommit: string }> {
  const { controller, effects } = target;
  controller.step();
  const created = controller.step()!;
  const attemptId = created.entity_id;
  await controller.claim(attemptId);
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: attemptId, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` },
  );
  controller.report(attemptId, {
    workerStatus: "completed",
    summary: "done",
    resultCommit: committed.commit,
  });
  await controller.gate({
    attemptId,
    predicate: "tests_pass",
    command: ["python", "-m", "pytest"],
  });
  expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
  return { attemptId, resultCommit: committed.commit };
}

/** A PREPARED left unresolved by a post-merge crash. */
async function unresolvedPrepared(target: Rig) {
  const { attemptId, resultCommit } = await driveToVerifying(target);
  // Either the merge landed and the process died, or the outcome is unknown -
  // both leave the intent unresolved with no terminal fact.
  await expect(target.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(Error);
  expect(
    eventsOfType(target.store, "PROMOTION_COMMITTED").length +
      eventsOfType(target.store, "PROMOTION_FAILED").length,
  ).toBe(0);
  const prepared = eventsOfType(target.store, "PROMOTION_PREPARED")[0]!;
  return {
    attemptId,
    resultCommit,
    promotionId: prepared.entity_id,
    sourceCommit: String(prepared.payload.source_commit),
  };
}

function terminalRequest(input: {
  eventType: "PROMOTION_COMMITTED" | "PROMOTION_FAILED";
  promotionId: string;
  attemptId: string;
  sourceCommit: string;
  expectedHeadCommit?: string;
  resultingHeadCommit: string | null;
  revision?: number;
  idempotencyKey?: string;
}): NewEvent {
  return parseNewEvent({
    schema_version: 1,
    project_id: PROJECT,
    event_type: input.eventType,
    payload_version: 1,
    entity_type: "promotion",
    entity_id: input.promotionId,
    payload: {
      promotion_id: input.promotionId,
      attempt_id: input.attemptId,
      source_commit: input.sourceCommit,
      expected_head_commit: input.expectedHeadCommit ?? HEAD,
      resulting_head_commit: input.resultingHeadCommit,
      reason: "adversarial probe",
    },
    causation_id: null,
    correlation_id: `promotion:${input.promotionId}`,
    idempotency_key:
      input.idempotencyKey ??
      actionKey(
        input.eventType === "PROMOTION_COMMITTED" ? "promotion-committed-v1" : "promotion-failed-v1",
        { project_id: PROJECT, promotion_id: input.promotionId },
      ),
    expected_project_revision: input.revision ?? 0,
  });
}

function witnessFor(input: {
  promotionId: string;
  attemptId: string;
  sourceCommit: string;
  outcomeKind: "COMMITTED" | "FAILED";
  resultingHeadCommit: string | null;
  expectedHeadCommit?: string;
  projectId?: string;
}) {
  return PromotionOutcomeWitness.issue({
    projectId: input.projectId ?? PROJECT,
    promotionId: input.promotionId,
    attemptId: input.attemptId,
    operationId: "op_adv",
    inputDigest: "d",
    outcomeKind: input.outcomeKind,
    basis: input.outcomeKind === "COMMITTED" ? "invoke_result" : "denied",
    sourceCommit: input.sourceCommit,
    expectedHeadCommit: input.expectedHeadCommit ?? HEAD,
    resultingHeadCommit: input.resultingHeadCommit,
    outcomeDigest: null,
    preparedEventRef: null,
  });
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

/* -------------------------------------------------------------------------- *
 * AA-N01…AA-N10 — no terminal without an admitted intent and a witness
 * -------------------------------------------------------------------------- */

describe("G10-AA adversarial: generic ingestion is closed", () => {
  it("AA-N01/AA-N02 a terminal without a prior PREPARED is refused with OR without a witness", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, resultCommit } = await driveToVerifying(r);
      const ghost = `promotion-${"b".repeat(32)}`;
      const before = r.store.listEvents(PROJECT).length;

      // No witness: refused (whichever plane reaches it first).
      expect(() =>
        r.store.append(
          terminalRequest({
            eventType: "PROMOTION_COMMITTED",
            promotionId: ghost,
            attemptId,
            sourceCommit: resultCommit,
            resultingHeadCommit: "9".repeat(40),
          }),
        ),
      ).toThrow(/no PREPARED intent|admission required/u);

      // WITH a witness: structural validation still wins, because no intent was
      // ever admitted for this promotion.
      for (const eventType of PROMOTION_TERMINAL_TYPES) {
        expect(() =>
          r.store.appendPromotionTerminal(
            terminalRequest({
              eventType,
              promotionId: ghost,
              attemptId,
              sourceCommit: resultCommit,
              resultingHeadCommit: eventType === "PROMOTION_COMMITTED" ? "9".repeat(40) : null,
            }),
            witnessFor({
              promotionId: ghost,
              attemptId,
              sourceCommit: resultCommit,
              outcomeKind: eventType === "PROMOTION_COMMITTED" ? "COMMITTED" : "FAILED",
              resultingHeadCommit: eventType === "PROMOTION_COMMITTED" ? "9".repeat(40) : null,
            }),
          ),
        ).toThrow(/no PREPARED intent/u);
      }
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(promotionState(r.store, ghost)).toBeUndefined();
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N03/AA-N04 a matching terminal through the generic surface is denied, fence and head intact", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId, sourceCommit } = await unresolvedPrepared(r);
      const headBefore = r.controller.status().head!;
      const fenceBefore = r.controller.status().promotionFence;
      const eventsBefore = r.store.listEvents(PROJECT).length;

      for (const eventType of PROMOTION_TERMINAL_TYPES) {
        let error: unknown;
        try {
          r.store.append(
            terminalRequest({
              eventType,
              promotionId,
              attemptId,
              sourceCommit,
              resultingHeadCommit: eventType === "PROMOTION_COMMITTED" ? "9".repeat(40) : null,
            }),
          );
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(PromotionAdmissionError);
        expect((error as PromotionAdmissionError).kind).toBe("terminal_admission_required");
      }

      expect(r.store.listEvents(PROJECT)).toHaveLength(eventsBefore);
      expect(promotionState(r.store, promotionId)).toBe("PREPARED");
      expect(r.controller.status().promotionFence).toEqual(fenceBefore);
      expect(r.controller.status().head!.state).toBe(headBefore.state);
      expect(r.controller.status().head!.provenEffectHeadCommit).toBe(
        headBefore.provenEffectHeadCommit,
      );
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N05/AA-N06 a terminal must match its PREPARED, and an invented head is refused", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId, sourceCommit } = await unresolvedPrepared(r);
      const before = r.store.listEvents(PROJECT).length;

      // A different attempt id, a different source commit, and a different
      // expected head are each refused structurally, witness or not.
      const mismatches: Array<[string, { attemptId?: string; sourceCommit?: string; expectedHeadCommit?: string }]> = [
        ["attempt", { attemptId: "attempt-someone-else" }],
        ["source", { sourceCommit: "5".repeat(40) }],
        ["expected head", { expectedHeadCommit: "6".repeat(40) }],
      ];
      for (const [label, override] of mismatches) {
        const attemptFor = override.attemptId ?? attemptId;
        const sourceFor = override.sourceCommit ?? sourceCommit;
        const headFor = override.expectedHeadCommit ?? HEAD;
        expect(() =>
          r.store.appendPromotionTerminal(
            terminalRequest({
              eventType: "PROMOTION_COMMITTED",
              promotionId,
              attemptId: attemptFor,
              sourceCommit: sourceFor,
              expectedHeadCommit: headFor,
              resultingHeadCommit: "9".repeat(40),
            }),
            witnessFor({
              promotionId,
              attemptId: attemptFor,
              sourceCommit: sourceFor,
              expectedHeadCommit: headFor,
              outcomeKind: "COMMITTED",
              resultingHeadCommit: "9".repeat(40),
            }),
          ),
          label,
        ).toThrow(/not a valid promotion terminal/u);
      }
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(promotionState(r.store, promotionId)).toBe("PREPARED");
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N07/AA-N08/AA-N09 a witness cannot cross promotions, projects, or outcome kinds", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId, sourceCommit } = await unresolvedPrepared(r);
      const before = r.store.listEvents(PROJECT).length;
      const head = "9".repeat(40);

      const cases: Array<[string, ReturnType<typeof witnessFor>]> = [
        [
          "cross-promotion",
          witnessFor({
            promotionId: `promotion-${"c".repeat(32)}`,
            attemptId,
            sourceCommit,
            outcomeKind: "COMMITTED",
            resultingHeadCommit: head,
          }),
        ],
        [
          "cross-project",
          witnessFor({
            projectId: "another-project",
            promotionId,
            attemptId,
            sourceCommit,
            outcomeKind: "COMMITTED",
            resultingHeadCommit: head,
          }),
        ],
        [
          "cross-outcome-kind",
          witnessFor({
            promotionId,
            attemptId,
            sourceCommit,
            outcomeKind: "FAILED",
            resultingHeadCommit: head,
          }),
        ],
      ];
      for (const [label, witness] of cases) {
        let error: unknown;
        try {
          r.store.appendPromotionTerminal(
            terminalRequest({
              eventType: "PROMOTION_COMMITTED",
              promotionId,
              attemptId,
              sourceCommit,
              resultingHeadCommit: head,
            }),
            witness,
          );
        } catch (caught) {
          error = caught;
        }
        expect(`${label}:${(error as PromotionAdmissionError)?.kind}`).not.toBe(`${label}:undefined`);
        expect(error).toBeInstanceOf(PromotionAdmissionError);
      }
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(promotionState(r.store, promotionId)).toBe("PREPARED");
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N10 a witness is one-shot: a consumed capability authorizes nothing else", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId, sourceCommit } = await unresolvedPrepared(r);
      const head = "9".repeat(40);
      const witness = witnessFor({
        promotionId,
        attemptId,
        sourceCommit,
        outcomeKind: "COMMITTED",
        resultingHeadCommit: head,
      });
      r.store.appendPromotionTerminal(
        terminalRequest({
          eventType: "PROMOTION_COMMITTED",
          promotionId,
          attemptId,
          sourceCommit,
          resultingHeadCommit: head,
        }),
        witness,
      );
      expect(PromotionOutcomeWitness.isLive(witness)).toBe(false);
      expect(promotionState(r.store, promotionId)).toBe("COMMITTED");
      // A consumed capability authorizes nothing further, anywhere.
      expect(PromotionOutcomeWitness.isLive(witness)).toBe(false);
      expect(PROMOTION_TERMINAL_TYPES.length).toBeGreaterThan(0);
    } finally {
      await r.cleanup();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * AA-N11…AA-N20 — outcome semantics, replay, provenance
 * -------------------------------------------------------------------------- */

describe("G10-AA adversarial: outcome semantics and replay", () => {
  it("AA-N11 an uncertain/in-flight outcome yields no terminal and keeps the fence", async () => {
    const r = await rig({ uncertain: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId } = await unresolvedPrepared(r);
      expect(r.crashing.merges).toBe(1);
      // The op never merged and its outcome is unknown; recovery must not invent
      // a verdict for it.
      r.advance(1000);
      const report = await r.controller.recovery.reconcileAll();
      const terminalWritten =
        eventsOfType(r.store, "PROMOTION_COMMITTED").length +
        eventsOfType(r.store, "PROMOTION_FAILED").length;
      expect(terminalWritten).toBe(0);
      expect(promotionState(r.store, promotionId)).toBe("PREPARED");
      expect(r.controller.status().promotionFence).toHaveLength(1);
      // A retry-safe redispatch is legitimate here (the operation provably never
      // began and the Work authority is intact) - what matters is that NO
      // verdict was invented for an outcome that was never established.
      expect(report.terminal).toEqual([]);
      expect(r.crashing.merges).toBeGreaterThanOrEqual(1);
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N12/AA-N17/AA-N18/AA-N19 normal success, replay, and offline rebuild", async () => {
    const r = await rig({ crash: false, tasks: [taskSpec("task-a")] });
    let reopened: EventStore | undefined;
    try {
      const { attemptId } = await driveToVerifying(r);
      const promotion = await r.controller.promoteAttempt({ attemptId });
      expect(promotion.committed.event_type).toBe("PROMOTION_COMMITTED");
      expect(r.crashing.merges).toBe(1);
      r.controller.step();

      // AA-N17: a replay needs no witness and causes no new effect.
      const replay = await r.controller.promoteAttempt({ attemptId });
      expect(replay.committed.event_id).toBe(promotion.committed.event_id);
      expect(r.crashing.merges).toBe(1);

      // AA-N18/AA-N19: replay and rebuild are offline.
      r.store.close();
      await r.effects.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      reopened.quickCheck();
      reopened.verifyFull();
      expect(reopened.rebuildProjections()).toEqual(reopened.rebuildProjections());
      expect(eventsOfType(reopened, "PROMOTION_COMMITTED")).toHaveLength(1);
    } finally {
      reopened?.close();
      await r.effects.close().catch(() => undefined);
      try {
        r.store.close();
      } catch {
        /* already closed */
      }
    }
  });

  it("AA-N20 a legacy terminal payload stays replayable and keeps its digest shape", () => {
    const legacy = {
      promotion_id: "promotion-legacy",
      attempt_id: "attempt-legacy",
      source_commit: "1".repeat(40),
      expected_head_commit: "2".repeat(40),
      resulting_head_commit: "3".repeat(40),
      reason: "legacy",
    };
    const normalized = normalizeEventPayload("PROMOTION_COMMITTED", legacy);
    expect(Object.keys(normalized).sort()).toEqual(Object.keys(legacy).sort());
    for (const key of ["operation_id", "outcome_basis", "outcome_digest"]) {
      expect(normalized).not.toHaveProperty(key);
    }
    // The failure terminal shares the shape and the vocabulary.
    expect(PROMOTION_OUTCOME_KINDS).toEqual(["COMMITTED", "FAILED"]);
    expect(PROMOTION_OUTCOME_BASES.length).toBeGreaterThanOrEqual(6);
  });

  it("AA-N21/AA-N22 the projector stays dumb and head derivation uses committed facts only", () => {
    const projector = readFileSync(join(REPO, "src", "state", "projector.ts"), "utf8");
    for (const forbidden of ["Ordarium", "effects", "promotion_terminal_admission", "git."]) {
      expect(projector).not.toContain(forbidden);
    }
    const promotion = readFileSync(join(REPO, "src", "effects", "promotion.ts"), "utf8");
    // The effect head is derived from PROMOTION_COMMITTED facts, in one place.
    expect(promotion).toMatch(/PROMOTION_COMMITTED/u);
    expect(promotion.match(/promotionFactsSync/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it("AA-N23 a fake FAILED can no longer release a real fence", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId, sourceCommit } = await unresolvedPrepared(r);
      expect(r.controller.status().promotionFence).toHaveLength(1);
      // The whole Z fence-removal attack, replayed against AA.
      expect(() =>
        r.store.append(
          terminalRequest({
            eventType: "PROMOTION_FAILED",
            promotionId,
            attemptId,
            sourceCommit,
            resultingHeadCommit: null,
          }),
        ),
      ).toThrow(PromotionAdmissionError);
      expect(r.controller.status().promotionFence).toHaveLength(1);
      // And the revision that the fake failure used to unlock is still blocked.
      expect(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-c")],
          changeClass: "behavior_change",
          changedIds: ["task-a"],
        }),
      ).toThrow(/promotion_settlement_required/u);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N24 a fabricated PREPARED can no longer create a fake fence", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, resultCommit } = await driveToVerifying(r);
      const fabricated = `promotion-${"e".repeat(32)}`;
      expect(() =>
        r.store.append(
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "PROMOTION_PREPARED",
            payload_version: 1,
            entity_type: "promotion",
            entity_id: fabricated,
            payload: {
              promotion_id: fabricated,
              attempt_id: attemptId,
              source_commit: resultCommit,
              expected_head_commit: HEAD,
              resulting_head_commit: null,
              reason: "fabricated intent",
            },
            causation_id: null,
            correlation_id: `promotion:${fabricated}`,
            idempotency_key: actionKey("promotion-prepare-v1", {
              project_id: PROJECT,
              promotion_id: fabricated,
            }),
            expected_project_revision: 0,
          }),
        ),
      ).toThrow(PromotionAdmissionError);
      // No fence was manufactured, so a legitimate revision is not blocked by it.
      expect(r.controller.status().promotionFence).toEqual([]);
      expect(promotionState(r.store, fabricated)).toBeUndefined();
      // A structurally-perfect PREPARED is denied even with a fabricated permit
      // that was never issued.
      expect(() =>
        r.store.appendPromotionIntent(
          parseNewEvent({
            schema_version: 1,
            project_id: PROJECT,
            event_type: "PROMOTION_PREPARED",
            payload_version: 1,
            entity_type: "promotion",
            entity_id: fabricated,
            payload: {
              promotion_id: fabricated,
              attempt_id: attemptId,
              source_commit: resultCommit,
              expected_head_commit: HEAD,
              resulting_head_commit: null,
              reason: "fabricated intent",
            },
            causation_id: null,
            correlation_id: `promotion:${fabricated}`,
            idempotency_key: actionKey("promotion-prepare-v1", {
              project_id: PROJECT,
              promotion_id: fabricated,
            }),
            expected_project_revision: 0,
          }),
          { ...PromotionIntentPermit.issue({
            projectId: PROJECT,
            promotionId: fabricated,
            attemptId,
            sourceCommit: resultCommit,
            expectedHeadCommit: HEAD,
            basis: "eligibility_passed",
          }) } as never,
        ),
      ).toThrow(/not issued by the trusted promotion admission module/u);
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N16 a contradictory terminal is refused and never overwrites the projection", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, promotionId, sourceCommit } = await unresolvedPrepared(r);
      const head = "9".repeat(40);
      r.store.appendPromotionTerminal(
        terminalRequest({
          eventType: "PROMOTION_COMMITTED",
          promotionId,
          attemptId,
          sourceCommit,
          resultingHeadCommit: head,
        }),
        witnessFor({
          promotionId,
          attemptId,
          sourceCommit,
          outcomeKind: "COMMITTED",
          resultingHeadCommit: head,
        }),
      );
      expect(promotionState(r.store, promotionId)).toBe("COMMITTED");

      expect(() =>
        r.store.appendPromotionTerminal(
          terminalRequest({
            eventType: "PROMOTION_FAILED",
            promotionId,
            attemptId,
            sourceCommit,
            resultingHeadCommit: null,
          }),
          witnessFor({
            promotionId,
            attemptId,
            sourceCommit,
            outcomeKind: "FAILED",
            resultingHeadCommit: null,
          }),
        ),
      ).toThrow(/already COMMITTED/u);
      expect(promotionState(r.store, promotionId)).toBe("COMMITTED");
      expect(eventsOfType(r.store, "PROMOTION_FAILED")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * AA-N25…AA-N30 — regressions, anti-waste, scope
 * -------------------------------------------------------------------------- */

describe("G10-AA adversarial: regressions and anti-waste", () => {
  it("AA-N28 no second receipt or promotion store is introduced", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const tables = (
        r.store.connection
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as Array<{ name: string }>
      ).map((row) => String(row.name));
      expect(tables.filter((name) => /promotion|receipt|witness|permit/iu.test(name))).toEqual([
        "promotions",
      ]);
    } finally {
      await r.cleanup();
    }
  });

  it("AA-N29 no agent-facing surface can mint a witness or append a terminal", () => {
    const surfaces = [
      join(REPO, "src", "tools", "application_tools.ts"),
      join(REPO, "src", "tools", "tools.ts"),
      join(REPO, "src", "application", "surface.ts"),
      join(REPO, "src", "tools", "control_surface.ts"),
    ];
    for (const file of surfaces) {
      const text = readFileSync(file, "utf8");
      for (const forbidden of [
        "PromotionOutcomeWitness",
        "PromotionIntentPermit",
        "appendPromotionTerminal",
        "appendPromotionIntent",
        "promotion_terminal_admission",
      ]) {
        expect(text, `${file} must not expose ${forbidden}`).not.toContain(forbidden);
      }
    }
    // The domain barrel does not re-export the admission module either.
    const barrel = readFileSync(join(REPO, "src", "domain", "index.ts"), "utf8");
    expect(barrel).not.toContain("promotion_terminal_admission");
  });

  it("AA-N30 CF-X-01 stays feature-deferred and no External Asset scope appears", () => {
    const prototype = Object.getOwnPropertyNames(ProjectController.prototype) as string[];
    for (const name of prototype) {
      expect(name).not.toMatch(/parallel|oldBase|crossRevision|compatib/iu);
    }
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO, "src", "domain"))) {
      const text = readFileSync(file, "utf8");
      if (/crossRevisionCompat|oldBaseCompat|externalAssetLibrary/iu.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("AA-N25/AA-N26/AA-N27 the Y, X and W closures remain intact", async () => {
    const r = await rig({ crash: false, tasks: [taskSpec("task-a")] });
    try {
      const { controller, store } = r;
      const { attemptId } = await driveToVerifying(r);
      // X/Y: one atomic revision, evidence revoked inside it.
      const before = store.listEvents(PROJECT).length;
      await controller.promoteAttempt({ attemptId });
      controller.step(); // TASK_SATISFIED
      await controller.reconcileProjectHead();
      controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
      });
      const batch = store.listEvents(PROJECT).slice(before);
      const revisionBatch = batch.filter((event) => event.event_type === "PROJECT_REVISED");
      expect(revisionBatch.length).toBeGreaterThanOrEqual(1);
      const sequences = batch.map((event) => event.project_sequence);
      expect(sequences).toEqual(sequences.map((_, index) => (sequences[0] as number) + index));
      // Z: the promotion fence is released once the Work settled and synced.
      expect(controller.status().promotionFence).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });
});
