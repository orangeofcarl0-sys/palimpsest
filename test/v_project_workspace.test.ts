/**
 * G10-V Project Workspace — deterministic golden fixture + store semantics.
 *
 *   ProjectWorkspace ≠ CanonicalStore     ProjectAssetAssociation ≠ AssetContent
 *   OpenLoop ≠ WorkTask                   Opportunity ≠ Task
 *   Association ≠ Truth                   NegativeResult grants no truth
 *
 * Real `ProjectController` over real SQLite ledgers and the real
 * `SqliteProjectAssetAssociationStore` / `SqliteProjectJournalStore` over temp files.
 * Nothing is mocked except the injected read-only proof/memory ports.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import type { Decision, Requirement } from "../src/schema/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { decodeJsonBlob } from "../src/tools/controller.js";
import { parseProjectIr } from "../src/schema/models.js";

import {
  ASSET_ASSOCIATED,
  PROJECT_WORKSPACE_OPENED,
  ProjectWorkspaceError,
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  PROJECT_JOURNAL_KINDS,
  assetAssociatedEvent,
  makeProjectWorkspaceService,
  materializeProjectAssetAssociation,
  materializeProjectJournalEntry,
  parseProjectJournalEntry,
  type ProjectWorkspaceService,
} from "../src/project_workspace/index.js";
import {
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  defaultManagementProfile,
  makeProjectManagementService,
  materializeManagementProfile,
  type UserManagementControlPort,
} from "../src/project_management/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-08-13T00:00:00Z";
const PROJECT = "golden-project";
const GOAL = "Ship a deterministic project workspace over the canonical ledger.";
const CLAIM_ID = "claim-golden-1";
const EXPERIMENT_ID = "exp-golden-1";
const CLAIM_BODY = "the full claim body that must never be persisted in the association store";

const REQUIREMENTS: readonly Requirement[] = [
  { requirement_id: "req-1", statement: "The scheduler must be deterministic.", priority: "critical", acceptance_refs: ["acc-1"] },
  { requirement_id: "req-2", statement: "Failures must have a recoverable path.", priority: "high", acceptance_refs: ["acc-2"] },
];

const DECISION: Decision = {
  decision_id: "dec-genesis",
  statement: "Adopt an append-only ledger as the single project truth.",
  rationale: "Replayability and auditability.",
  evidence_ids: [],
  supersedes: null,
};

interface Rig {
  readonly root: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly associationsPath: string;
  readonly journalPath: string;
  readonly associations: SqliteProjectAssetAssociationStore;
  readonly journal: SqliteProjectJournalStore;
  cleanup(): Promise<void>;
}

function makeRig(): Rig {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-v-ws-"));
  const store = new EventStore(join(root, "palimpsest.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({ databasePath: join(root, "ops.sqlite"), git: new FakeGitPort(HEAD) });
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
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  const associationsPath = join(root, "project-workspace.sqlite");
  const journalPath = join(root, "project-journal.sqlite");
  const associations = new SqliteProjectAssetAssociationStore(associationsPath);
  const journal = new SqliteProjectJournalStore(journalPath);
  return {
    root,
    store,
    controller,
    associationsPath,
    journalPath,
    associations,
    journal,
    async cleanup() {
      // Stores may already be closed by a restart test; close defensively.
      for (const store0 of [associations, journal]) {
        try {
          store0.close();
        } catch {
          /* already closed */
        }
      }
      await controller.close();
      store.close();
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* windows handle lag */
      }
    },
  };
}

function readIr(controller: ProjectController) {
  const row = controller.store.connection
    .prepare("SELECT state_json FROM projects WHERE project_id=?")
    .get(PROJECT) as { state_json: unknown } | undefined;
  if (row === undefined) throw new Error("project is not initialized");
  return parseProjectIr(decodeJsonBlob(row.state_json));
}

function countEvents(controller: ProjectController): number {
  const row = controller.store.connection.prepare("SELECT COUNT(*) AS total FROM events").get() as { total: number };
  return Number(row.total);
}

interface ReadOnlyPorts {
  readonly claimCalls: { count: number };
  readonly proof: { publishedClaims(): Promise<readonly { claimRef: { claimId: string } }[]>; assetView(claimId: string): Promise<unknown> };
  readonly memory: { evaluations(experimentId: string): Promise<readonly unknown[]> };
}

function readOnlyPorts(): ReadOnlyPorts {
  const claimCalls = { count: 0 };
  return {
    claimCalls,
    proof: {
      publishedClaims: async () => {
        claimCalls.count += 1;
        return [{ claimRef: { claimId: CLAIM_ID } }];
      },
      assetView: async () => ({ effectiveStanding: "PUBLISHED", freshness: "fresh", body: CLAIM_BODY }),
    },
    memory: { evaluations: async (experimentId: string) => (experimentId === EXPERIMENT_ID ? [{ run: 1 }, { run: 2 }] : []) },
  };
}

function workspaceService(
  rig: Rig,
  ports: ReadOnlyPorts,
  overrides: {
    readonly associations?: SqliteProjectAssetAssociationStore | undefined;
    readonly journal?: SqliteProjectJournalStore | undefined;
  } = {},
): ProjectWorkspaceService {
  const associations = "associations" in overrides ? overrides.associations : rig.associations;
  const journal = "journal" in overrides ? overrides.journal : rig.journal;
  return makeProjectWorkspaceService({
    controller: rig.controller,
    ...(associations === undefined ? {} : { associations }),
    ...(journal === undefined ? {} : { journal }),
    proof: ports.proof,
    memory: ports.memory,
    clock: () => CLOCK,
  });
}

function managementControl(): UserManagementControlPort {
  return {
    get: async (projectId: string) => defaultManagementProfile(projectId, "operator:unset"),
    set: async (input) =>
      materializeManagementProfile({
        projectId: input.projectId,
        involvement: input.involvement,
        budgets: { maxStepsPerRun: 5 },
        allowedActionClasses: defaultAllowedActionClasses(input.involvement),
        confirmationBoundaries: defaultConfirmationBoundaries(input.involvement),
        updatedAt: CLOCK,
        updatedBy: input.updatedBy,
      }),
  };
}

interface Golden {
  readonly failedAttemptId: string;
  readonly openQuestionId: string;
  readonly negativeResultId: string;
  readonly opportunityId: string;
  readonly decisionResult: { revision: number; decision: { decision_id: string; supersedes: string | null } };
  readonly promotion: { revision: number; taskId: string };
}

/**
 * Build the golden project-as-asset fixture:
 * goal + 2 requirements + 1 decision + 3 tasks, a reported FAILED attempt with a
 * produced artifact, one associated PROOF_CLAIM and one associated EXPERIMENT,
 * a journal OPEN_QUESTION and NEGATIVE_RESULT, an appended decision and an
 * explicitly promoted opportunity, plus an active hold (a blocker).
 */
async function buildGolden(rig: Rig, service: ProjectWorkspaceService): Promise<Golden> {
  rig.controller.start({
    projectId: PROJECT,
    goal: GOAL,
    requirements: [...REQUIREMENTS],
    decisions: [{ ...DECISION }],
    tasks: [taskSpec("task-1"), taskSpec("task-2"), taskSpec("task-3")],
    committedAt: CLOCK,
  });

  rig.controller.step(); // TASK_STARTED
  const created = rig.controller.step()!; // ATTEMPT_CREATED
  const failedAttemptId = created.entity_id;
  await rig.controller.claim(failedAttemptId);
  rig.controller.report(failedAttemptId, {
    workerStatus: "failed",
    summary: "the first approach failed",
    producedArtifacts: ["reports/failure-report.md"],
  });
  // G10-W contract change: a plan revision now requires quiescence. A reported
  // FAILED batch is still ACTIVE until the scheduler's own TASK_READY
  // transition settles it, so the mechanical step below must run BEFORE the
  // first revision (appendDecision). This is the normal settle-then-revise path.
  expect(rig.controller.step()!.event_type).toBe("TASK_READY");

  const openQuestion = await service.recordJournalEntry({
    projectId: PROJECT,
    kind: "OPEN_QUESTION",
    title: "Which retry budget is correct?",
    body: "Two candidates disagree; no canonical owner exists.",
    provenance: "planning",
  });
  const negative = await service.recordJournalEntry({
    projectId: PROJECT,
    kind: "NEGATIVE_RESULT",
    title: "Direct sqlite replication does not converge",
    body: "A failed direction; it grants no truth to its negation.",
    provenance: "experiment",
  });
  const opportunity = await service.recordJournalEntry({
    projectId: PROJECT,
    kind: "OPPORTUNITY",
    title: "Extract the view builder",
    body: "The pure view builder can be reused by another surface.",
    provenance: "review",
  });

  const decisionResult = await service.appendDecision({
    projectId: PROJECT,
    statement: "Adopt journal-backed project knowledge.",
    rationale: "No other canonical owner exists for it.",
    evidenceIds: [],
    supersedes: DECISION.decision_id,
  });

  const promotion = await service.promoteOpportunity({
    projectId: PROJECT,
    entryId: opportunity.entryId,
    taskSpec: {
      task_id: "task-promoted",
      objective: "Extract the pure view builder.",
      depends_on: [],
      write_paths: ["src/view_extract.ts"],
      required_artifacts: ["src/view_extract.ts"],
    },
  });

  await service.associateAsset({
    projectId: PROJECT,
    assetKind: "PRODUCED_ARTIFACT",
    canonicalRef: { kind: "report", id: "reports/failure-report.md" },
    associationKind: "DERIVED_FROM_WORK",
    provenance: "attempt report",
  });
  await service.associateAsset({
    projectId: PROJECT,
    assetKind: "PROOF_CLAIM",
    canonicalRef: { kind: "proof_claim", id: CLAIM_ID },
    associationKind: "PUBLISHED",
    provenance: "published claim",
  });
  await service.associateAsset({
    projectId: PROJECT,
    assetKind: "EXPERIMENT",
    canonicalRef: { kind: "experiment", id: EXPERIMENT_ID },
    associationKind: "MANUAL",
    provenance: "empirical memory",
  });

  // A hold is a scheduling gate: set it AFTER the last plan revision so it stays active.
  rig.controller.setHold("task-3", { reason: "waiting on external review", declaredBy: "operator" });

  return {
    failedAttemptId,
    openQuestionId: openQuestion.entryId,
    negativeResultId: negative.entryId,
    opportunityId: opportunity.entryId,
    decisionResult,
    promotion,
  };
}

describe("G10-V project workspace — golden project-as-asset fixture", () => {
  it("answers the workspace questions the view exists for", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      const golden = await buildGolden(rig, service);
      const view = await service.view();

      // What the project is trying to do.
      expect(view.projectId).toBe(PROJECT);
      expect(view.project.goal).toBe(GOAL);
      expect(view.project.requirements.map((r) => r.requirement_id)).toEqual(["req-1", "req-2"]);
      expect(view.project.headCommit).toBe(HEAD);
      expect(view.project.revision).toBe(2); // appendDecision → 1, promoteOpportunity → 2

      // Decisions made and why.
      expect(view.project.decisions.map((d) => d.decision_id)).toContain(DECISION.decision_id);
      expect(view.project.decisions.find((d) => d.decision_id === DECISION.decision_id)?.rationale).toBe(DECISION.rationale);

      // What is blocked.
      expect(view.work.blockers).toContain("task task-3 is held: waiting on external review");

      // What assets exist.
      expect(view.assets.associations).toHaveLength(3);
      expect(view.assets.byKind).toEqual({ EXPERIMENT: 1, PRODUCED_ARTIFACT: 1, PROOF_CLAIM: 1 });

      // What failed before.
      expect(view.work.attempts.find((attempt) => attempt.attempt_id === golden.failedAttemptId)).toMatchObject({
        state: "FAILED",
      });
      const journal = await service.journal(PROJECT);
      expect(journal.find((entry) => entry.entry.entryId === golden.negativeResultId)?.entry.kind).toBe("NEGATIVE_RESULT");

      // What can be reused (associated artifacts / published claim / experiment).
      const reusable = view.assets.associations.filter((association) =>
        ["PRODUCED_ARTIFACT", "PROOF_CLAIM", "EXPERIMENT"].includes(association.assetKind),
      );
      expect(reusable).toHaveLength(3);

      // What needs attention next.
      expect(view.openLoops.some((loop) => loop.kind === "JOURNAL_OPEN_QUESTION")).toBe(true);
      expect(view.openLoops.some((loop) => loop.kind === "READY_WORK")).toBe(true);
      // The promoted opportunity is resolved, so it is no longer an open loop.
      expect(view.openLoops.some((loop) => loop.kind === "JOURNAL_OPPORTUNITY")).toBe(false);
      // NEGATIVE_RESULT produces no open loop (it is not a prompt to look).
      expect(view.openLoops.every((loop) => loop.subjectRef?.id !== golden.negativeResultId)).toBe(true);

      // The view is a deep-frozen read model (not a store).
      expect(Object.isFrozen(view)).toBe(true);
      expect(view.knowledgeWarnings.some((warning) => warning.includes("proof plane not configured"))).toBe(false);
      expect(view.knowledgeWarnings.some((warning) => warning.includes("campaign plane not configured"))).toBe(true);

      // Management involvement (read through the composed management service).
      const management = makeProjectManagementService({ workspace: service, control: managementControl(), controller: rig.controller, clock: () => CLOCK });
      const assessment = await management.assess();
      expect(assessment.profile.involvement).toBe("DIRECT");
      expect(assessment.view.projectId).toBe(PROJECT);
    } finally {
      await rig.cleanup();
    }
  });

  it("stores no asset content: only the opaque ref/kind/provenance reaches the association payload", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      await buildGolden(rig, service);

      const probe = new DatabaseSync(rig.associationsPath);
      let payloads: string[];
      try {
        payloads = (
          probe.prepare("SELECT payload_json FROM project_asset_association_events ORDER BY seq").all() as { payload_json: string }[]
        ).map((row) => row.payload_json);
      } finally {
        probe.close();
      }
      // Definition + three associations.
      expect(payloads).toHaveLength(4);

      const raw = payloads.join("\n");
      expect(raw).not.toContain(CLAIM_BODY);
      expect(raw).not.toContain("the first approach failed");
      expect(raw).not.toContain("Direct sqlite replication");

      const associationPayloads = payloads
        .map((payload) => JSON.parse(payload))
        .filter((payload: Record<string, unknown>) => "association" in payload);
      expect(associationPayloads).toHaveLength(3);
      for (const payload of associationPayloads as { association: Record<string, unknown> }[]) {
        expect(Object.keys(payload.association).sort()).toEqual(
          ["assetKind", "associationId", "associationKind", "canonicalRef", "digest", "projectId", "provenance", "recordedAt", "schemaVersion"],
        );
        expect(Object.keys(payload.association.canonicalRef as Record<string, unknown>).sort()).toEqual(["id", "kind"]);
      }
      // The published claim's body lives on the proof plane; the association only names it.
      const proofAssociation = (associationPayloads as { association: { assetKind: string; canonicalRef: { kind: string; id: string } } }[]).find(
        (payload) => payload.association.assetKind === "PROOF_CLAIM",
      )!;
      expect(proofAssociation.association.canonicalRef).toEqual({ kind: "proof_claim", id: CLAIM_ID });
    } finally {
      await rig.cleanup();
    }
  });

  it("is definition-first, idempotent on replay, and CAS-guarded", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      await buildGolden(rig, service);

      // Definition-first: the first event of a project scope is PROJECT_WORKSPACE_OPENED.
      const chain = await rig.associations.replay(PROJECT);
      expect(chain[0]?.type).toBe(PROJECT_WORKSPACE_OPENED);
      expect(chain.slice(1).every((event) => event.type === ASSET_ASSOCIATED)).toBe(true);

      // A scope cannot be opened by an association: definition-first is enforced by the store.
      const stray = new SqliteProjectAssetAssociationStore(join(rig.root, "stray.sqlite"));
      try {
        const association = await service.associateAsset({
          projectId: PROJECT,
          assetKind: "REASONING_CELL",
          canonicalRef: { kind: "reasoning_cell", id: "cell-1" },
          associationKind: "MANUAL",
          provenance: "probe",
        });
        // `service` writes to a DIFFERENT store, so craft the same association-shaped draft directly.
        const draft = assetAssociatedEvent({ ...association, projectId: "other-project" });
        await expect(
          stray.appendAtomic({ expectedBasis: { scopeId: "other-project", throughSeq: 0, chainDigest: "" }, events: [draft] }),
        ).rejects.toMatchObject({ kind: "invalid_registration" });
      } finally {
        stray.close();
      }

      // Idempotent replay: the same content-addressed event replayed converges, adding no row.
      const before = (await rig.associations.replay(PROJECT)).length;
      const second = await service.associateAsset({
        projectId: PROJECT,
        assetKind: "PRODUCED_ARTIFACT",
        canonicalRef: { kind: "report", id: "reports/failure-report.md" },
        associationKind: "DERIVED_FROM_WORK",
        provenance: "attempt report",
      });
      expect((await rig.associations.replay(PROJECT)).length).toBe(before);
      expect(second.associationId).toBe(
        (await service.projectScopedAssets(PROJECT)).find((association) => association.assetKind === "PRODUCED_ARTIFACT")!.associationId,
      );

      // A stale basis replay of an already-present batch is still idempotent (no false conflict).
      const opened = chain[0]!;
      const firstAssociation = chain[1]!;
      const replayed = await rig.associations.appendAtomic({
        expectedBasis: { scopeId: PROJECT, throughSeq: 0, chainDigest: "" },
        events: [
          { eventId: opened.eventId, type: PROJECT_WORKSPACE_OPENED, payload: opened.payload },
          { eventId: firstAssociation.eventId, type: ASSET_ASSOCIATED, payload: firstAssociation.payload },
        ],
      });
      expect(replayed.map((event) => event.eventId)).toEqual([opened.eventId, firstAssociation.eventId]);

      // basis_mismatch: a brand-new (never persisted) event against a stale basis is refused.
      const currentBasis = (await rig.associations.basis(PROJECT))!;
      const freshAssociation = materializeProjectAssetAssociation({
        projectId: PROJECT,
        assetKind: "CAMPAIGN",
        canonicalRef: { kind: "campaign", id: "camp-1" },
        associationKind: "MANUAL",
        provenance: "campaign link",
        recordedAt: CLOCK,
      });
      await expect(
        rig.associations.appendAtomic({
          expectedBasis: { scopeId: PROJECT, throughSeq: currentBasis.throughSeq - 1, chainDigest: currentBasis.chainDigest },
          events: [assetAssociatedEvent(freshAssociation)],
        }),
      ).rejects.toMatchObject({ kind: "basis_mismatch" });
    } finally {
      await rig.cleanup();
    }
  });

  it("never shows an unassociated global item as a project asset", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const associated = workspaceService(rig, ports);
    try {
      await buildGolden(rig, associated);

      // The proof plane exists and publishes a claim, but NO association store is configured.
      const unassociated = workspaceService(rig, ports, { associations: undefined, journal: undefined });
      const view = await unassociated.view();
      expect(view.assets.associations).toEqual([]);
      expect(view.assets.byKind).toEqual({});
      expect(await unassociated.assets()).toEqual([]);
      expect(await unassociated.projectScopedAssets(PROJECT)).toEqual([]);
      expect(view.knowledgeWarnings).toContain("project association store not configured: project assets cannot be associated or read");
      // The global claim still exists on its own plane...
      expect((await ports.proof.publishedClaims()).length).toBe(1);
      // ...and is never rendered as this project's asset merely because it exists.
      expect(view.openLoops.some((loop) => loop.kind === "STALE_PROOF")).toBe(false);
    } finally {
      await rig.cleanup();
    }
  });

  it("appendDecision appends through controller.plan (revision increments, old decision retained)", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      rig.controller.start({
        projectId: PROJECT,
        goal: GOAL,
        requirements: [...REQUIREMENTS],
        decisions: [{ ...DECISION }],
        tasks: [taskSpec("task-1")],
        committedAt: CLOCK,
      });
      const before = readIr(rig.controller);

      const result = await service.appendDecision({
        projectId: PROJECT,
        statement: "Supersede the genesis decision.",
        rationale: "The first decision was too narrow.",
        evidenceIds: [],
        supersedes: DECISION.decision_id,
      });

      // A NEW ProjectIR revision; the old decision is retained.
      expect(result.revision).toBe(before.revision + 1);
      const after = readIr(rig.controller);
      expect(after.revision).toBe(result.revision);
      expect(after.decisions.map((d) => d.decision_id)).toContain(DECISION.decision_id);
      expect(after.decisions).toHaveLength(2);
      expect(after.decisions.find((d) => d.decision_id === result.decision.decision_id)?.rationale).toBe("The first decision was too narrow.");

      // Naming an undeclared decision is refused (no decision store is invented).
      await expect(
        service.appendDecision({
          projectId: PROJECT,
          statement: "Supersede an unknown decision.",
          rationale: "The target must already be declared.",
          evidenceIds: [],
          supersedes: "dec-does-not-exist",
        }),
      ).rejects.toMatchObject({ kind: "invalid_registration" });
    } finally {
      await rig.cleanup();
    }
  });

  /**
   * Spec (PROJECT-AS-ASSET-ARCHITECTURE §4.2): "A `supersedes` pointer is recorded
   * on the NEW decision". The implementation composes the new decision with
   * `supersedes: null`, so the lineage is not recorded anywhere. This assertion is
   * deliberately NOT weakened: it is the evidence for the reported src defect.
   */
  it("records the supersedes pointer on the NEW decision (spec; current src defect)", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      rig.controller.start({
        projectId: PROJECT,
        goal: GOAL,
        requirements: [...REQUIREMENTS],
        decisions: [{ ...DECISION }],
        tasks: [taskSpec("task-1")],
        committedAt: CLOCK,
      });

      const result = await service.appendDecision({
        projectId: PROJECT,
        statement: "Supersede the genesis decision.",
        rationale: "The first decision was too narrow.",
        evidenceIds: [],
        supersedes: DECISION.decision_id,
      });
      const after = readIr(rig.controller);

      expect(result.decision.supersedes).toBe(DECISION.decision_id);
      expect(after.decisions.find((d) => d.decision_id === result.decision.decision_id)?.supersedes).toBe(DECISION.decision_id);

      // The same defect weakens the one-successor rule: because no successor is
      // recorded, the decision can be "superseded" again without refusal.
      await expect(
        service.appendDecision({
          projectId: PROJECT,
          statement: "Supersede again.",
          rationale: "A decision has at most one successor.",
          evidenceIds: [],
          supersedes: DECISION.decision_id,
        }),
      ).rejects.toMatchObject({ kind: "invalid_registration" });
    } finally {
      await rig.cleanup();
    }
  });

  it("promoteOpportunity is explicit, goes through controller.plan, and a rejected task graph records no promotion", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      rig.controller.start({
        projectId: PROJECT,
        goal: GOAL,
        requirements: [...REQUIREMENTS],
        decisions: [{ ...DECISION }],
        tasks: [taskSpec("task-1")],
        committedAt: CLOCK,
      });
      const opportunity = await service.recordJournalEntry({
        projectId: PROJECT,
        kind: "OPPORTUNITY",
        title: "Extract the view builder",
        body: "Reusable.",
        provenance: "review",
      });

      // A rejected task graph (unknown dependency) never records a PROMOTED resolution.
      const revisionBefore = readIr(rig.controller).revision;
      await expect(
        service.promoteOpportunity({
          projectId: PROJECT,
          entryId: opportunity.entryId,
          taskSpec: {
            task_id: "task-promoted",
            objective: "Extract.",
            depends_on: ["task-does-not-exist"],
            write_paths: ["src/view_extract.ts"],
            required_artifacts: ["src/view_extract.ts"],
          },
        }),
      ).rejects.toThrow();
      expect(readIr(rig.controller).revision).toBe(revisionBefore);
      const stillOpen = (await service.journal(PROJECT)).find((entry) => entry.entry.entryId === opportunity.entryId);
      expect(stillOpen?.resolution).toBeUndefined();

      // The explicit promotion appends a task through controller.plan (revision increments).
      const promotion = await service.promoteOpportunity({
        projectId: PROJECT,
        entryId: opportunity.entryId,
        taskSpec: {
          task_id: "task-promoted",
          objective: "Extract the pure view builder.",
          depends_on: [],
          write_paths: ["src/view_extract.ts"],
          required_artifacts: ["src/view_extract.ts"],
        },
      });
      expect(promotion.revision).toBe(revisionBefore + 1);
      expect(promotion.taskId).toBe("task-promoted");
      const after = readIr(rig.controller);
      expect(after.tasks.map((task) => task.task_id)).toContain("task-promoted");
      const resolved = (await service.journal(PROJECT)).find((entry) => entry.entry.entryId === opportunity.entryId);
      expect(resolved?.resolution?.status).toBe("PROMOTED");

      // A non-OPPORTUNITY entry is never promotable.
      const note = await service.recordJournalEntry({ projectId: PROJECT, kind: "REFERENCE_NOTE", title: "n", body: "b", provenance: "p" });
      await expect(
        service.promoteOpportunity({
          projectId: PROJECT,
          entryId: note.entryId,
          taskSpec: taskSpec("task-from-note"),
        }),
      ).rejects.toMatchObject({ kind: "invalid_registration" });
    } finally {
      await rig.cleanup();
    }
  });

  it("restart reconstructs the view, associations and journal identically", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      await buildGolden(rig, service);
      const viewBefore = await service.view();
      const assetsBefore = await service.assets();
      const journalBefore = await service.journal(PROJECT);
      const scopedBefore = await service.projectScopedAssets(PROJECT);

      rig.associations.close();
      rig.journal.close();
      const associations2 = new SqliteProjectAssetAssociationStore(rig.associationsPath);
      const journal2 = new SqliteProjectJournalStore(rig.journalPath);
      try {
        const reopened = workspaceService(rig, ports, { associations: associations2, journal: journal2 });
        expect(await reopened.view()).toEqual(viewBefore);
        expect(await reopened.assets()).toEqual(assetsBefore);
        expect(await reopened.journal(PROJECT)).toEqual(journalBefore);
        expect(await reopened.projectScopedAssets(PROJECT)).toEqual(scopedBefore);
      } finally {
        associations2.close();
        journal2.close();
      }
    } finally {
      await rig.cleanup();
    }
  });
});

describe("G10-V project journal — knowledge with no other canonical owner", () => {
  it("structurally excludes the kinds owned elsewhere", async () => {
    expect([...PROJECT_JOURNAL_KINDS]).toEqual(["IDEA", "OPEN_QUESTION", "NEGATIVE_RESULT", "OPPORTUNITY", "REFERENCE_NOTE"]);
    for (const forbidden of ["PROOF", "DECISION", "TASK", "EXPERIMENT", "COMMITMENT", "BOUNDARY", "SOURCE"]) {
      expect(() =>
        materializeProjectJournalEntry({
          projectId: PROJECT,
          kind: forbidden as never,
          title: "t",
          body: "b",
          provenance: "p",
          createdAt: CLOCK,
        }),
      ).toThrow(ProjectWorkspaceError);
    }

    // A fabricated stored entry with kind "PROOF" fails to parse.
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      const entry = await service.recordJournalEntry({ projectId: PROJECT, kind: "IDEA", title: "t", body: "b", provenance: "p" });
      expect(() => parseProjectJournalEntry({ ...entry, kind: "PROOF" })).toThrow(/must be one of/u);
    } finally {
      await rig.cleanup();
    }
  });

  it("treats a resolution as a NEW append-only event and rejects a double resolve", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      rig.controller.start({ projectId: PROJECT, goal: GOAL, requirements: [], decisions: [], tasks: [taskSpec("task-1")], committedAt: CLOCK });
      const question = await service.recordJournalEntry({
        projectId: PROJECT,
        kind: "OPEN_QUESTION",
        title: "Which retry budget is correct?",
        body: "Two candidates disagree.",
        provenance: "planning",
      });

      const resolved = await service.resolveJournalEntry({ projectId: PROJECT, entryId: question.entryId, resolution: { status: "RESOLVED", detail: "budget 3" } });
      expect(resolved.resolution?.status).toBe("RESOLVED");

      // The recorded entry artifact itself is never edited.
      const events = await rig.journal.replay(PROJECT);
      const recorded = events.find((event) => event.type === "JOURNAL_ENTRY_RECORDED")!;
      expect((recorded.payload as { entry: { resolution?: unknown } }).entry.resolution).toBeUndefined();
      expect(events.filter((event) => event.type === "JOURNAL_ENTRY_RESOLVED")).toHaveLength(1);

      // A second resolution of the same entry is rejected (append-only, not an edit).
      await expect(
        service.resolveJournalEntry({ projectId: PROJECT, entryId: question.entryId, resolution: { status: "DISMISSED" } }),
      ).rejects.toMatchObject({ kind: "invalid_registration" });
      expect((await rig.journal.replay(PROJECT)).filter((event) => event.type === "JOURNAL_ENTRY_RESOLVED")).toHaveLength(1);
    } finally {
      await rig.cleanup();
    }
  });

  it("keeps Opportunity ≠ Task and NegativeResult truth-free", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports);
    try {
      rig.controller.start({
        projectId: PROJECT,
        goal: GOAL,
        requirements: [...REQUIREMENTS],
        decisions: [],
        tasks: [taskSpec("task-1")],
        committedAt: CLOCK,
      });
      const before = readIr(rig.controller);
      const statusBefore = rig.controller.status();
      const assetCountBefore = (await service.assets()).length;

      const opportunity = await service.recordJournalEntry({
        projectId: PROJECT,
        kind: "OPPORTUNITY",
        title: "Extract the view builder",
        body: "Reusable elsewhere.",
        provenance: "review",
      });
      expect(opportunity.kind).toBe("OPPORTUNITY");

      // Recording an OPPORTUNITY creates no Work task and revises nothing.
      const afterOpportunity = readIr(rig.controller);
      expect(afterOpportunity.tasks).toHaveLength(before.tasks.length);
      expect(afterOpportunity.revision).toBe(before.revision);
      expect(rig.controller.status().tasks).toHaveLength(statusBefore.tasks.length);

      // NEGATIVE_RESULT grants no truth: no evidence, no promotion, no asset, no revision.
      const claimCallsBefore = ports.claimCalls.count;
      const negative = await service.recordJournalEntry({
        projectId: PROJECT,
        kind: "NEGATIVE_RESULT",
        title: "Direct sqlite replication does not converge",
        body: "A failed direction.",
        provenance: "experiment",
      });
      expect(negative.kind).toBe("NEGATIVE_RESULT");
      const afterNegative = readIr(rig.controller);
      expect(afterNegative.revision).toBe(before.revision);
      expect(afterNegative.tasks).toHaveLength(before.tasks.length);
      const statusAfter = rig.controller.status();
      expect(statusAfter.evidence).toHaveLength(statusBefore.evidence.length);
      expect(statusAfter.promotions).toHaveLength(statusBefore.promotions.length);
      expect(await service.assets()).toHaveLength(assetCountBefore);
      // No proof plane read happened for the negative result (no standing was produced).
      expect(ports.claimCalls.count).toBe(claimCallsBefore);
    } finally {
      await rig.cleanup();
    }
  });

  it("fails closed when the service has no scoped store", async () => {
    const rig = makeRig();
    const ports = readOnlyPorts();
    const service = workspaceService(rig, ports, { associations: undefined, journal: undefined });
    try {
      rig.controller.start({ projectId: PROJECT, goal: GOAL, requirements: [], decisions: [], tasks: [taskSpec("task-1")], committedAt: CLOCK });
      await expect(
        service.associateAsset({
          projectId: PROJECT,
          assetKind: "PROOF_CLAIM",
          canonicalRef: { kind: "proof_claim", id: CLAIM_ID },
          associationKind: "MANUAL",
          provenance: "p",
        }),
      ).rejects.toMatchObject({ kind: "invalid_registration" });
      await expect(service.recordJournalEntry({ projectId: PROJECT, kind: "IDEA", title: "t", body: "b", provenance: "p" })).rejects.toMatchObject({
        kind: "invalid_registration",
      });
      // Another project is never addressable through this workspace.
      // G10-AE-R §7/§15: a foreign id must FAIL CLOSED with the typed scope violation
      // — the previous expectation (`.resolves.toEqual([])`) encoded exactly the
      // empty-list-hides-the-violation answer the spec forbids: an A-bound facade
      // silently answering "no data" for B looks like a correct empty scope.
      await expect(service.projectScopedAssets("some-other-project")).rejects.toMatchObject({
        kind: "invalid_registration",
      });
    } finally {
      await rig.cleanup();
    }
  });
});
