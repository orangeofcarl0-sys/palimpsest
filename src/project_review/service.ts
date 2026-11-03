/**
 * PC1 S04 — the review service.
 *
 * It validates proposals, records decisions and drives the EXISTING owner for the approved effect.
 * It has no canonical effect of its own: `apply` calls the controller's plan revision or the composed
 * ProjectIntentService, and a source intake is only a Work task; the worker writes the bytes and
 * `verifySourceIntake` checks the resulting Git blob independently.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { canonicalDigest } from "../schema/canonical.js";
import type { ProjectIr, TaskSpec } from "../schema/models.js";
import type { PromotionSourceIntakeAdmission } from "../domain/promotion_eligibility.js";
import type { ProjectIntentService } from "../project_intent/service.js";
import type { ProjectIntentProposal } from "../project_intent/proposal.js";
import type {
  ActionPayload,
  ApplicationRecord,
  JournalAdoption,
  JournalProposalEntry,
  OperatorAuthorityPort,
  PlanRevisionPayload,
  ProposalBasis,
  ProposalDraft,
  ProposalKind,
  ProposalPayload,
  ProposalRecord,
  ReviewDecision,
  ReviewJournalPort,
  ReviewPreview,
  ReviewStore,
  SourceIntakePayload,
} from "./types.js";

export class ReviewError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "AUTHORITY_UNRESOLVED"
      | "NOT_APPROVED"
      | "STALE"
      | "CONFLICT"
      | "INVALID_INPUT"
      | "INTENT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export interface ReviewWorkOwner {
  project(): ProjectIr;
  plan(input: {
    readonly tasks: readonly TaskSpec[];
    readonly reason?: string | undefined;
  }): { readonly event_id: number; readonly payload?: unknown };
}

export interface ReviewServiceDeps {
  readonly projectId: string;
  readonly store: ReviewStore;
  readonly work: ReviewWorkOwner;
  readonly intent?: ProjectIntentService | undefined;
  readonly repository?: string | undefined;
  readonly operatorAuthority?: OperatorAuthorityPort | undefined;
  readonly clock?: (() => string) | undefined;
  /** Test/host seam for the candidate bytes; defaults to `readFileSync`. */
  readonly readCandidate?: ((path: string) => Buffer) | undefined;
  /**
   * R5: the ONE verified Journal adoption path. Absent means a Journal proposal cannot be adopted,
   * never that a second proposal store exists.
   */
  readonly journal?: ReviewJournalPort | undefined;
}

export interface ReviewService {
  proposePlan(input: Omit<ProposalDraft, "kind" | "payload"> & { readonly payload: PlanRevisionPayload }): ProposalRecord;
  proposeSourceIntake(input: Omit<ProposalDraft, "kind" | "payload"> & { readonly payload: Omit<SourceIntakePayload, "sha256"> & { readonly expectedSha256?: string | undefined } }): ProposalRecord;
  proposeIntent(input: {
    readonly changes: readonly unknown[];
    readonly grounds: unknown;
    readonly rationale: string;
    readonly proposedBy: string;
    readonly purpose: string;
    readonly proposedAction: string;
    readonly sources: readonly string[];
    readonly scope: { readonly writePaths: readonly string[]; readonly effects: readonly string[] };
    readonly risk?: string | undefined;
    readonly dependencies?: readonly string[] | undefined;
    readonly expectedArtifact?: string | undefined;
    readonly requiredAuthority?: string | undefined;
  }): Promise<ProposalRecord>;
  list(): readonly ProposalRecord[];
  /** R5: adopt every structured Journal proposal and return the resulting reviewable records. */
  listJournalProposals(): Promise<readonly ProposalRecord[]>;
  /** R5: adopt one exact Journal entry; idempotent by the entry's proposal digest. */
  adoptJournalProposal(entryId: string): Promise<ProposalRecord>;
  /** R5: the operator-facing list over both the review store and adopted Journal proposals. */
  listAll(): Promise<readonly ProposalRecord[]>;
  preview(proposalId: string): ReviewPreview;
  decide(proposalId: string, input: { readonly decision: ReviewDecision["decision"]; readonly actor: string; readonly note?: string | undefined }): ReviewPreview;
  apply(proposalId: string, input: { readonly actor: string }): Promise<{ readonly record: ProposalRecord; readonly outcome: "APPLIED" | "FAILED"; readonly detail: string }>;
  /**
   * R6: the exact admission read for one Work attempt. `null` means this task is not bound to an
   * approved source intake, so ordinary promotion is unchanged.
   */
  sourceIntakeAdmissionForAttempt(input: {
    readonly attemptId: string;
    readonly taskId: string | null;
    readonly resultCommit: string | null;
  }): PromotionSourceIntakeAdmission | null;
  verifySourceIntake(proposalId: string, input: { readonly resultCommit: string }): {
    readonly verified: boolean;
    readonly actualDigest: string | null;
    readonly changedFiles: readonly string[];
    readonly outOfScope: readonly string[];
    readonly detail: string;
  };
  recordExecution(proposalId: string, input: { readonly attemptId: string; readonly taskId: string }): ProposalRecord;
  recordAcceptance(proposalId: string, input: { readonly promotionId: string; readonly acceptedHead: string }): ProposalRecord;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeTarget(path: string): string {
  const normalized = path.replace(/\\/gu, "/").replace(/^\.\//u, "");
  if (normalized === "" || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new ReviewError("INVALID_INPUT", `target path "${path}" must be a relative path inside the project`);
  }
  return normalized;
}

const PROPOSAL_CONTENT_SCHEMA = "pc1-proposal-content/v1";
const ADOPTION_CONTENT_SCHEMA = "pc1-proposal-adoption/v1";
const PROPOSAL_MARKER = "<!-- palimpsest-proposal:v1 -->";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function parseTaskSpec(value: unknown): TaskSpec | null {
  if (!isRecord(value)) return null;
  if (typeof value.task_id !== "string" || value.task_id.trim() === "") return null;
  if (typeof value.objective !== "string" || value.objective.trim() === "") return null;
  return {
    task_id: value.task_id,
    objective: value.objective,
    depends_on: stringList(value.depends_on),
    write_paths: stringList(value.write_paths),
    required_artifacts: stringList(value.required_artifacts),
  };
}

function actionClassOf(value: unknown): ActionPayload["actionClass"] {
  return value === "INVESTIGATE" ||
    value === "CHANGE" ||
    value === "ACCEPT_SOURCE" ||
    value === "REVISE_PLAN" ||
    value === "OTHER"
    ? value
    : "OTHER";
}

export function makeReviewService(deps: ReviewServiceDeps): ReviewService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();
  const projectId = deps.projectId;

  const basis = (): ProposalBasis => {
    const ir = deps.work.project();
    return { projectId: ir.project_id, revision: ir.revision, digest: ir.digest, headCommit: ir.head_commit };
  };

  const materialize = (draft: ProposalDraft): ProposalRecord => {
    const content = {
      schema: PROPOSAL_CONTENT_SCHEMA,
      projectId,
      kind: draft.kind,
      proposedBy: draft.proposedBy,
      purpose: draft.purpose,
      proposedAction: draft.proposedAction,
      sources: draft.sources,
      basis: basis(),
      scope: draft.scope,
      risk: draft.risk ?? "",
      dependencies: draft.dependencies ?? [],
      expectedArtifact: draft.expectedArtifact ?? "",
      requiredAuthority: draft.requiredAuthority ?? "operator",
      payload: draft.payload,
    };
    const digest = canonicalDigest(content);
    return {
      schema: "pc1-proposal/v1",
      projectId,
      proposalId: `review-${digest.slice(0, 24)}`,
      digest,
      kind: draft.kind,
      createdAt: now(),
      proposedBy: draft.proposedBy,
      purpose: draft.purpose,
      proposedAction: draft.proposedAction,
      sources: draft.sources,
      basis: content.basis,
      scope: draft.scope,
      risk: content.risk,
      dependencies: content.dependencies,
      expectedArtifact: content.expectedArtifact,
      requiredAuthority: content.requiredAuthority,
      payload: draft.payload,
      status: "PROPOSED",
    };
  };

  /**
   * R5: adopt ONE structured Journal entry.
   *
   * The Journal remains the origin record; this writes only NON-AUTHORITATIVE review metadata. The
   * proposal digest binds the exact entry identity/content and the exact adoption basis, so an
   * approval at one digest cannot authorize a different proposal or a changed basis.
   */
  const adoptEntry = (entry: JournalProposalEntry): ProposalRecord => {
    const markerIndex = entry.body.lastIndexOf(PROPOSAL_MARKER);
    let raw: Record<string, unknown> | null = null;
    if (markerIndex >= 0) {
      try {
        const parsed: unknown = JSON.parse(entry.body.slice(markerIndex + PROPOSAL_MARKER.length).trim());
        if (isRecord(parsed)) raw = parsed;
      } catch {
        raw = null;
      }
    }
    const missing: string[] = [];
    if (raw === null) missing.push("pc1-proposal/v1 JSON");
    const purpose =
      raw !== null && typeof raw.purpose === "string" && raw.purpose.trim() !== "" ? raw.purpose : entry.title;
    const proposedAction = raw !== null && typeof raw.action === "string" ? raw.action : "";
    if (proposedAction.trim() === "") missing.push("proposedAction");
    const sources = raw === null ? [] : stringList(raw.sources);
    const declaredWritePaths = raw === null ? [] : stringList(raw.writePaths);
    const risk = raw !== null && typeof raw.risk === "string" ? raw.risk : "";
    const requiredAuthority =
      raw !== null && typeof raw.requiredAuthority === "string" && raw.requiredAuthority.trim() !== ""
        ? raw.requiredAuthority
        : "operator";
    const expectedArtifact = raw !== null && typeof raw.expectedArtifact === "string" ? raw.expectedArtifact : "";
    const proposedBy =
      raw !== null && typeof raw.proposedBy === "string" && raw.proposedBy.trim() !== ""
        ? raw.proposedBy
        : "agent:journal-proposal";
    const actionClass = actionClassOf(raw?.actionClass);

    let kind: ProposalKind = "ACTION";
    let payload: ProposalPayload = {
      journalEntryId: entry.entryId,
      journalDigest: entry.digest,
      actionClass,
      changedPlanRef: null,
    };
    let writePaths = declaredWritePaths;
    let effect = "operator_approved_action";
    const rawTasks = raw?.tasks;
    let mapped = false;
    if (Array.isArray(rawTasks) && rawTasks.length > 0) {
      const tasks = rawTasks.map(parseTaskSpec);
      if (tasks.every((task): task is TaskSpec => task !== null)) {
        kind = "PLAN_REVISION";
        payload = { tasks, reason: proposedAction };
        writePaths = [...new Set(tasks.flatMap((task) => task.write_paths))];
        effect = "projectir_revision";
        mapped = true;
      } else {
        missing.push("tasks[].task_id/objective");
      }
    }
    if (!mapped && raw !== null && typeof raw.sourcePath === "string" && typeof raw.targetPath === "string") {
      if (
        deps.repository === undefined ||
        typeof raw.taskId !== "string" ||
        raw.taskId.trim() === "" ||
        typeof raw.objective !== "string" ||
        raw.objective.trim() === ""
      ) {
        missing.push("sourcePath/targetPath/taskId/objective");
      } else {
        try {
          const candidatePath = isAbsolute(raw.sourcePath) ? raw.sourcePath : resolve(deps.repository, raw.sourcePath);
          const bytes = (deps.readCandidate ?? readFileSync)(candidatePath);
          const targetPath = normalizeTarget(raw.targetPath);
          kind = "SOURCE_INTAKE";
          payload = {
            candidatePath,
            targetPath,
            sha256: sha256(bytes),
            objective: raw.objective,
            taskId: raw.taskId,
          };
          writePaths = [targetPath];
          effect = "work_task_creation";
          mapped = true;
        } catch (error) {
          missing.push(`sourcePath (${error instanceof Error ? error.message : String(error)})`);
        }
      }
    }
    if (!mapped) {
      kind = "ACTION";
      payload = { journalEntryId: entry.entryId, journalDigest: entry.digest, actionClass, changedPlanRef: null };
      if (actionClass !== "INVESTIGATE") {
        if (writePaths.length === 0) missing.push("scope.writePaths");
        if (sources.length === 0) missing.push("sources");
      }
    }

    const content = {
      schema: ADOPTION_CONTENT_SCHEMA,
      projectId,
      journalEntryId: entry.entryId,
      journalDigest: entry.digest,
      proposal: raw ?? entry.body,
    };
    const digest = canonicalDigest(content);
    const proposalId = `journal-${digest.slice(0, 24)}`;
    const existing = deps.store.get(projectId, proposalId);
    if (existing !== undefined) return existing;
    const adoption: JournalAdoption = {
      journalEntryId: entry.entryId,
      journalDigest: entry.digest,
      adoptedAt: now(),
      repairRequired: missing.length > 0,
      missingFields: Object.freeze([...new Set(missing)]),
    };
    return save({
      schema: "pc1-proposal/v1",
      projectId,
      proposalId,
      digest,
      kind,
      createdAt: now(),
      proposedBy,
      purpose,
      proposedAction: proposedAction === "" ? "(missing proposedAction)" : proposedAction,
      sources,
      basis: basis(),
      scope: { writePaths, effects: [effect] },
      risk,
      dependencies: [],
      expectedArtifact,
      requiredAuthority,
      payload,
      status: "PROPOSED",
      adoption,
    });
  };

  const journalProposals = async (): Promise<readonly ProposalRecord[]> => {
    if (deps.journal === undefined) return [];
    const entries = await deps.journal.entries();
    const adopted: ProposalRecord[] = [];
    let index = 0;
    for (const entry of entries) {
      index += 1;
      if (!entry.body.includes(PROPOSAL_MARKER)) continue;
      adopted.push(adoptEntry(entry));
      // A bounded per-call read: the Journal owner already returns the whole view, so this only keeps
      // the review projection ordered like the operator's journal.
      if (index > 500) break;
    }
    return Object.freeze(adopted);
  };

  const requireStore = (proposalId: string): ProposalRecord => {
    const record = deps.store.get(projectId, proposalId);
    if (record === undefined) throw new ReviewError("NOT_FOUND", `no proposal "${proposalId}" exists in this project`);
    return record;
  };

  const save = (record: ProposalRecord): ProposalRecord => {
    deps.store.put(record);
    return record;
  };

  const operator = (actor: string): void => {
    const port = deps.operatorAuthority;
    if (port === undefined) {
      throw new ReviewError("AUTHORITY_UNRESOLVED", "this deployment composes no operator authority, so a review decision or application cannot be attributed");
    }
    const outcome = port.authorize(actor);
    if (!outcome.authorized || outcome.role !== "operator") {
      throw new ReviewError(
        "AUTHORITY_UNRESOLVED",
        `actor "${actor}" is not an authorized operator (${outcome.reason ?? outcome.role}); a model or unconfigured identity cannot decide or apply`,
      );
    }
  };

  const currentness = (record: ProposalRecord): { status: "CURRENT" | "STALE"; detail: string } => {
    const current = basis();
    if (
      current.revision !== record.basis.revision ||
      current.digest !== record.basis.digest ||
      current.headCommit !== record.basis.headCommit
    ) {
      return {
        status: "STALE",
        detail: `proposal basis ${record.basis.revision}/${record.basis.headCommit.slice(0, 12)} is not the current basis ${current.revision}/${current.headCommit.slice(0, 12)}`,
      };
    }
    if (record.kind === "INTENT_REVISION") {
      const intent = deps.intent;
      if (intent === undefined) return { status: "STALE", detail: "this deployment composes no intent service" };
      // `assess` is async, so the synchronous preview reports the basis check and leaves the deeper
      // assessment to `apply`/the async caller. The basis check is the same one the intent owner uses.
    }
    if (record.kind === "SOURCE_INTAKE") {
      const payload = record.payload as SourceIntakePayload;
      try {
        const bytes = (deps.readCandidate ?? readFileSync)(payload.candidatePath);
        if (sha256(bytes) !== payload.sha256) {
          return { status: "STALE", detail: "the candidate bytes changed since the proposal was created" };
        }
      } catch (error) {
        return { status: "STALE", detail: `the candidate bytes cannot be read: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    return { status: "CURRENT", detail: "the proposal basis and its bound source still match the current project" };
  };

  const previewOf = (record: ProposalRecord): ReviewPreview => {
    const freshness = currentness(record);
    const impacts: string[] = [];
    if (record.kind === "SOURCE_INTAKE") {
      const payload = record.payload as SourceIntakePayload;
      impacts.push(`adds a Work task that must write exactly ${payload.targetPath} with sha256 ${payload.sha256}`);
      impacts.push("the canonical source does not change until the result is promoted and the bytes are verified");
    } else if (record.kind === "PLAN_REVISION") {
      impacts.push(`replaces the plan with ${(record.payload as PlanRevisionPayload).tasks.length} task(s)`);
    } else if (record.kind === "ACTION") {
      impacts.push("records an operator-approved Journal note; it creates no Work, no ProjectIR revision and no source acceptance by itself");
      if (record.adoption?.repairRequired === true) {
        impacts.push(`not ready for approval: missing ${record.adoption.missingFields.join(", ")}`);
      }
    } else {
      impacts.push("applies a ProjectIR revision through the existing intent admission authority");
    }
    return {
      schema: "pc1-review-preview/v1",
      proposal: record,
      current: basis(),
      currentness: freshness.status,
      currentnessDetail: freshness.detail,
      applicable: record.status === "APPROVED" && freshness.status === "CURRENT",
      knownImpacts: impacts,
      requiredAuthority: record.requiredAuthority,
      effects: record.scope.effects,
    };
  };

  const service: ReviewService = {
    proposePlan(input) {
      return save(materialize({ ...input, kind: "PLAN_REVISION" }));
    },
    proposeSourceIntake(input) {
      const targetPath = normalizeTarget(input.payload.targetPath);
      const candidatePath = isAbsolute(input.payload.candidatePath) ? input.payload.candidatePath : resolve(input.payload.candidatePath);
      const bytes = (deps.readCandidate ?? readFileSync)(candidatePath);
      const actual = sha256(bytes);
      if (input.payload.expectedSha256 !== undefined && input.payload.expectedSha256 !== actual) {
        throw new ReviewError(
          "INVALID_INPUT",
          `the candidate bytes hash to ${actual}, not the proposed ${input.payload.expectedSha256}; a proposal cannot carry a digest it did not observe`,
        );
      }
      return save(
        materialize({
          ...input,
          kind: "SOURCE_INTAKE",
          payload: {
            candidatePath,
            targetPath,
            sha256: actual,
            objective: input.payload.objective,
            taskId: input.payload.taskId,
          },
        }),
      );
    },
    async proposeIntent(input) {
      const intent = deps.intent;
      if (intent === undefined) {
        throw new ReviewError("INTENT_UNAVAILABLE", "this deployment composes no project intent service, so an intent proposal cannot be prepared");
      }
      const prepared = await intent.prepare({
        changes: input.changes as never,
        grounds: input.grounds as never,
        rationale: input.rationale,
      });
      const proposal = materialize({
        kind: "INTENT_REVISION",
        proposedBy: input.proposedBy,
        purpose: input.purpose,
        proposedAction: input.proposedAction,
        sources: input.sources,
        scope: input.scope,
        risk: input.risk,
        dependencies: input.dependencies,
        expectedArtifact: input.expectedArtifact,
        requiredAuthority: input.requiredAuthority,
        payload: {
          prepared: prepared.proposal as ProjectIntentProposal,
          changeClass: prepared.changeClass,
          changedIds: prepared.changedIds,
        },
      });
      return save(proposal);
    },
    list() {
      return deps.store.list(projectId);
    },
    async listJournalProposals() {
      return journalProposals();
    },
    async adoptJournalProposal(entryId) {
      if (deps.journal === undefined) {
        throw new ReviewError("INVALID_INPUT", "this deployment composes no project journal, so no Journal proposal can be adopted");
      }
      const entry = (await deps.journal.entries()).find((candidate) => candidate.entryId === entryId);
      if (entry === undefined) throw new ReviewError("NOT_FOUND", `no Journal entry "${entryId}" exists in this project`);
      if (!entry.body.includes(PROPOSAL_MARKER)) {
        throw new ReviewError("INVALID_INPUT", `Journal entry "${entryId}" is not a structured proposal`);
      }
      return adoptEntry(entry);
    },
    async listAll() {
      const byId = new Map<string, ProposalRecord>();
      for (const record of deps.store.list(projectId)) byId.set(record.proposalId, record);
      for (const record of await journalProposals()) {
        if (!byId.has(record.proposalId)) byId.set(record.proposalId, record);
      }
      return Object.freeze(
        [...byId.values()].sort((left, right) =>
          left.createdAt === right.createdAt
            ? left.proposalId.localeCompare(right.proposalId)
            : left.createdAt.localeCompare(right.createdAt),
        ),
      );
    },
    preview(proposalId) {
      return previewOf(requireStore(proposalId));
    },
    decide(proposalId, input) {
      operator(input.actor);
      const record = requireStore(proposalId);
      const freshness = currentness(record);
      if (record.status === "APPLIED") {
        throw new ReviewError("CONFLICT", `proposal ${proposalId} was already applied; a decision cannot reopen it`);
      }
      if (input.decision === "APPROVE" && record.adoption?.repairRequired === true) {
        throw new ReviewError(
          "INVALID_INPUT",
          `proposal ${proposalId} is not ready for approval: it is missing ${record.adoption.missingFields.join(", ")} — request changes or reject it`,
        );
      }
      if (record.review !== undefined) {
        if (record.review.decision === input.decision && record.review.decidedBy === input.actor) {
          return previewOf(record);
        }
        throw new ReviewError("CONFLICT", `proposal ${proposalId} already has a ${record.review.decision} decision by ${record.review.decidedBy}`);
      }
      if (freshness.status !== "CURRENT") {
        const stale: ProposalRecord = {
          ...record,
          status: "STALE",
          review: {
            decision: input.decision,
            decidedBy: input.actor,
            decidedAt: now(),
            proposalDigest: record.digest,
            basisAtDecision: basis(),
            note: `refused as stale: ${freshness.detail}`,
          },
        };
        return previewOf(save(stale));
      }
      const status =
        input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
      const decided: ProposalRecord = {
        ...record,
        status,
        review: {
          decision: input.decision,
          decidedBy: input.actor,
          decidedAt: now(),
          proposalDigest: record.digest,
          basisAtDecision: basis(),
          note: input.note ?? "",
        },
      };
      return previewOf(save(decided));
    },
    async apply(proposalId, input) {
      operator(input.actor);
      const record = requireStore(proposalId);
      if (record.application !== undefined && record.application.outcome === "APPLIED") {
        return { record, outcome: "APPLIED" as const, detail: `already applied: ${record.application.detail}` };
      }
      if (record.status !== "APPROVED") {
        throw new ReviewError("NOT_APPROVED", `proposal ${proposalId} is ${record.status}; only an APPROVED proposal can be applied`);
      }
      const freshness = currentness(record);
      if (freshness.status !== "CURRENT") {
        const stale: ProposalRecord = {
          ...record,
          status: "STALE",
          application: {
            appliedBy: input.actor,
            appliedAt: now(),
            outcome: "FAILED",
            detail: `refused as stale: ${freshness.detail}`,
            canonicalRef: null,
            revision: null,
            digest: null,
          },
        };
        save(stale);
        return { record: stale, outcome: "FAILED" as const, detail: freshness.detail };
      }
      try {
        if (record.kind === "PLAN_REVISION") {
          const payload = record.payload as PlanRevisionPayload;
          const event = deps.work.plan({ tasks: payload.tasks, reason: payload.reason });
          const applied: ApplicationRecord = {
            appliedBy: input.actor,
            appliedAt: now(),
            outcome: "APPLIED",
            detail: `plan revision committed as event ${String(event.event_id)}`,
            canonicalRef: `event:${String(event.event_id)}`,
            revision: deps.work.project().revision,
            digest: deps.work.project().digest,
          };
          const saved = save({ ...record, status: "APPLIED", application: applied });
          return { record: saved, outcome: "APPLIED" as const, detail: applied.detail };
        }
        if (record.kind === "SOURCE_INTAKE") {
          const payload = record.payload as SourceIntakePayload;
          // Re-verify the exact approved bytes before creating any task.
          const bytes = (deps.readCandidate ?? readFileSync)(payload.candidatePath);
          if (sha256(bytes) !== payload.sha256) {
            throw new ReviewError("STALE", "the candidate bytes changed after approval; the approved digest no longer describes the file");
          }
          const ir = deps.work.project();
          const tasks: TaskSpec[] = ir.tasks.map((task) => ({
            task_id: task.task_id,
            objective: task.objective,
            depends_on: [...task.depends_on],
            write_paths: [...task.write_paths],
            required_artifacts: [...task.required_artifacts],
          }));
          if (tasks.some((task) => task.task_id === payload.taskId)) {
            throw new ReviewError("CONFLICT", `task "${payload.taskId}" already exists; the intake proposal is stale`);
          }
          tasks.push({
            task_id: payload.taskId,
            objective: payload.objective,
            depends_on: [],
            write_paths: [payload.targetPath],
            required_artifacts: [payload.targetPath],
          });
          const event = deps.work.plan({ tasks, reason: `approved source intake ${record.proposalId}` });
          const applied: ApplicationRecord = {
            appliedBy: input.actor,
            appliedAt: now(),
            outcome: "APPLIED",
            detail: `source-intake Work task "${payload.taskId}" created as event ${String(event.event_id)}; bytes are still the worker's job`,
            canonicalRef: `event:${String(event.event_id)}`,
            revision: deps.work.project().revision,
            digest: deps.work.project().digest,
          };
          const saved = save({ ...record, status: "APPLIED", application: applied });
          return { record: saved, outcome: "APPLIED", detail: applied.detail };
        }
        if (record.kind === "ACTION") {
          const journal = deps.journal;
          if (journal === undefined) {
            throw new ReviewError("INVALID_INPUT", "this deployment composes no project journal, so an approved action cannot be recorded");
          }
          if (record.adoption?.repairRequired === true) {
            throw new ReviewError(
              "INVALID_INPUT",
              `proposal ${proposalId} is incomplete (${record.adoption.missingFields.join(", ")}), so it cannot be applied`,
            );
          }
          const payload = record.payload as ActionPayload;
          const current = basis();
          const note = await journal.recordApprovedAction({
            title: `Approved action: ${record.purpose}`.slice(0, 120),
            body: [
              "## Operator-approved action (non-canonical)",
              "",
              record.proposedAction,
              "",
              `- proposal: ${record.proposalId}`,
              `- proposal digest: ${record.digest}`,
              `- origin journal entry: ${payload.journalEntryId}`,
              `- decided by: ${record.review?.decidedBy ?? input.actor}`,
              `- basis at decision: revision ${record.review?.basisAtDecision.revision ?? current.revision}, head ${(record.review?.basisAtDecision.headCommit ?? current.headCommit).slice(0, 12)}`,
              "",
              "This note records an operator's decision about the exact proposal above. It does not accept a source, promote a result, revise ProjectIR or create Work by itself; any consequential action still travels through the existing Work/Review/Promotion owners.",
            ].join("\n"),
            provenance: `review:${record.proposalId}`,
          });
          const applied: ApplicationRecord = {
            appliedBy: input.actor,
            appliedAt: now(),
            outcome: "APPLIED",
            detail: `operator-approved action recorded as Journal entry ${note.entryId}; no canonical effect was created by the note`,
            canonicalRef: `journal:${note.entryId}`,
            revision: current.revision,
            digest: current.digest,
          };
          const saved = save({ ...record, status: "APPLIED", application: applied });
          return { record: saved, outcome: "APPLIED" as const, detail: applied.detail };
        }
        // INTENT_REVISION: the existing intent service owns admission and revision.
        const intent = deps.intent;
        if (intent === undefined) throw new ReviewError("INTENT_UNAVAILABLE", "this deployment composes no intent service");
        const payload = record.payload as { prepared: ProjectIntentProposal };
        const outcome = await intent.apply({ proposal: payload.prepared });
        const applied =
          outcome.status === "APPLIED"
            ? ({
                appliedBy: input.actor,
                appliedAt: now(),
                outcome: "APPLIED" as const,
                detail: `intent revision ${String(outcome.revision)} applied through the existing admission path`,
                canonicalRef: outcome.receipt === null ? null : `intent-receipt:${outcome.receipt.proposalDigest}`,
                revision: outcome.revision,
                digest: outcome.digest,
              } satisfies ApplicationRecord)
            : ({
                appliedBy: input.actor,
                appliedAt: now(),
                outcome: "FAILED" as const,
                detail: `${outcome.status}: ${outcome.detail}`,
                canonicalRef: null,
                revision: null,
                digest: null,
              } satisfies ApplicationRecord);
        const saved = save({
          ...record,
          status: outcome.status === "APPLIED" ? "APPLIED" : "APPLICATION_FAILED",
          application: applied,
        });
        return { record: saved, outcome: applied.outcome as "APPLIED" | "FAILED", detail: applied.detail };
      } catch (error) {
        const failed: ProposalRecord = {
          ...record,
          status: "APPLICATION_FAILED",
          application: {
            appliedBy: input.actor,
            appliedAt: now(),
            outcome: "FAILED",
            detail: error instanceof Error ? error.message : String(error),
            canonicalRef: null,
            revision: null,
            digest: null,
          },
        };
        save(failed);
        if (error instanceof ReviewError) throw error;
        throw new ReviewError("CONFLICT", failed.application!.detail);
      }
    },
    sourceIntakeAdmissionForAttempt(input) {
      if (input.taskId === null) return null;
      const bound = deps.store
        .list(projectId)
        .filter(
          (record) =>
            record.kind === "SOURCE_INTAKE" &&
            record.status === "APPLIED" &&
            (record.payload as SourceIntakePayload).taskId === input.taskId,
        );
      if (bound.length === 0) return null;
      if (bound.length > 1) {
        return {
          required: true,
          verified: false,
          proposalId: null,
          targetPath: null,
          approvedDigest: null,
          actualDigest: null,
          detail: `task ${input.taskId} is bound to ${bound.length} approved source intakes; exactly one exact binding is required`,
        };
      }
      const record = bound[0]!;
      const payload = record.payload as SourceIntakePayload;
      if (input.resultCommit === null) {
        return {
          required: true,
          verified: false,
          proposalId: record.proposalId,
          targetPath: payload.targetPath,
          approvedDigest: payload.sha256,
          actualDigest: null,
          detail: "the attempt has no result commit, so the approved source bytes cannot be verified",
        };
      }
      if (deps.repository === undefined) {
        return {
          required: true,
          verified: false,
          proposalId: record.proposalId,
          targetPath: payload.targetPath,
          approvedDigest: payload.sha256,
          actualDigest: null,
          detail: "this deployment has no repository, so the approved source bytes cannot be verified",
        };
      }
      const current = basis();
      /**
       * The application itself creates the Work task, so the proposal's PRE-application revision is
       * necessarily stale. The binding is current when the current plan is the one the application
       * recorded; a later plan change still makes it stale.
       */
      const boundRevision = record.application?.revision ?? record.basis.revision;
      const boundDigest = record.application?.digest ?? record.basis.digest;
      if (current.revision !== boundRevision || current.digest !== boundDigest) {
        return {
          required: true,
          verified: false,
          proposalId: record.proposalId,
          targetPath: payload.targetPath,
          approvedDigest: payload.sha256,
          actualDigest: null,
          detail: `the approved source intake was bound at revision ${boundRevision}, not the current revision ${current.revision}`,
        };
      }
      try {
        const bytes = execFileSync("git", ["show", `${input.resultCommit}:${payload.targetPath}`], {
          cwd: deps.repository,
          encoding: "buffer",
        });
        const actualDigest = sha256(bytes);
        const changedRaw = execFileSync(
          "git",
          ["diff", "--name-only", record.basis.headCommit, input.resultCommit],
          { cwd: deps.repository, encoding: "utf8" },
        );
        const changedFiles = changedRaw.split("\n").map((path) => path.trim()).filter((path) => path !== "");
        const outOfScope = changedFiles.filter(
          (path) =>
            !record.scope.writePaths.some(
              (allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/u, "")}/`),
            ),
        );
        const verified = actualDigest === payload.sha256 && outOfScope.length === 0;
        return {
          required: true,
          verified,
          proposalId: record.proposalId,
          targetPath: payload.targetPath,
          approvedDigest: payload.sha256,
          actualDigest,
          detail: verified
            ? "the result blob matches the approved source digest and every changed path is in the approved scope"
            : actualDigest !== payload.sha256
              ? `the result blob hashes to ${actualDigest}, not the approved ${payload.sha256}`
              : `the result changes paths outside the approved scope: ${outOfScope.join(", ")}`,
        };
      } catch (error) {
        return {
          required: true,
          verified: false,
          proposalId: record.proposalId,
          targetPath: payload.targetPath,
          approvedDigest: payload.sha256,
          actualDigest: null,
          detail: `the result commit or approved path cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    verifySourceIntake(proposalId, input) {
      const record = requireStore(proposalId);
      if (record.kind !== "SOURCE_INTAKE") throw new ReviewError("INVALID_INPUT", `proposal ${proposalId} is not a source intake`);
      if (deps.repository === undefined) {
        return { verified: false, actualDigest: null, changedFiles: [], outOfScope: [], detail: "this deployment has no repository to verify against" };
      }
      const payload = record.payload as SourceIntakePayload;
      try {
        const bytes = execFileSync("git", ["show", `${input.resultCommit}:${payload.targetPath}`], { cwd: deps.repository, encoding: "buffer" });
        const actualDigest = sha256(bytes);
        const changedRaw = execFileSync("git", ["diff", "--name-only", record.basis.headCommit, input.resultCommit], { cwd: deps.repository, encoding: "utf8" });
        const changedFiles = changedRaw.split("\n").map((path) => path.trim()).filter((path) => path !== "");
        const outOfScope = changedFiles.filter((path) => !record.scope.writePaths.some((allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/u, "")}/`)));
        return {
          verified: actualDigest === payload.sha256 && outOfScope.length === 0,
          actualDigest,
          changedFiles,
          outOfScope,
          detail:
            actualDigest === payload.sha256
              ? outOfScope.length === 0
                ? "the result blob matches the approved digest and every changed path is in scope"
                : `the result blob matches but paths changed outside the approved scope: ${outOfScope.join(", ")}`
              : `the result blob hashes to ${actualDigest}, not the approved ${payload.sha256}`,
        };
      } catch (error) {
        return { verified: false, actualDigest: null, changedFiles: [], outOfScope: [], detail: `the result commit or path cannot be read: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    recordExecution(proposalId, input) {
      const record = requireStore(proposalId);
      return save({ ...record, execution: { attemptId: input.attemptId, taskId: input.taskId, recordedAt: now() } });
    },
    recordAcceptance(proposalId, input) {
      const record = requireStore(proposalId);
      return save({ ...record, acceptance: { promotionId: input.promotionId, acceptedHead: input.acceptedHead, recordedAt: now() } });
    },
  };
  return Object.freeze(service);
}
