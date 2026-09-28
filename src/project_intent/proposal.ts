/**
 * E2-I §5/§11/§12 — the PROJECT INTENT PROPOSAL: a content-addressed, basis-bound, NON-CANONICAL
 * description of a proposed top-level intent change.
 *
 *     Proposal  ≠  ProjectIR
 *     Proposal  ≠  authority
 *
 * This module owns the PROPOSAL ARTIFACT and nothing else. It declares no store, no identity for any
 * existing fact, and no authority: an accepted proposal only becomes intent when the EXISTING ProjectIR
 * revision path (`PROJECT_REVISED`) commits it, and only after an independent authority has admitted the
 * exact proposal digest.
 *
 * ## The change vocabulary is a strict discriminated union
 *
 * There is deliberately NO JSON Patch and NO arbitrary path mutation. A proposal says "revise
 * requirement R to THIS complete next Requirement", never "set /requirements/2/statement". A path-based
 * edit would let a caller express a change no schema validates, and it would make the proposal's meaning
 * depend on the document it happens to be applied to.
 *
 * ## Determinism is part of the identity (§12)
 *
 * Same project basis + same change set + same ground snapshots + same rationale ⇒ byte-identical
 * proposal identity. Every array is normalized into a deterministic order BEFORE the digest, so input
 * order can never create two semantic proposals that are the same change.
 *
 * Layer: L2 (`src/project_intent/`). It consumes owners through its own READ ports and imports no
 * concrete owner module.
 */
import { canonicalDigest } from "../schema/canonical.js";
import { DomainValidationError } from "../domain/errors.js";

import type { Decision, Requirement } from "../schema/models.js";

/* ------------------------------------------------------------------ *
 * Basis (§10)
 * ------------------------------------------------------------------ */

/**
 * §10: the project state a proposal is frozen against. A proposal prepared against revision N can never
 * silently become a proposal against N+1 — the basis is part of the identity, and application
 * REVALIDATES it.
 */
export interface ProjectIntentBasis {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
}

/* ------------------------------------------------------------------ *
 * The change union (§5)
 * ------------------------------------------------------------------ */

export const INTENT_CHANGE_KINDS = [
  "GOAL_REVISE",
  "REQUIREMENT_ADD",
  "REQUIREMENT_REVISE",
  "REQUIREMENT_REMOVE",
  "DECISION_APPEND",
  "DECISION_SUPERSEDE",
] as const;
export type IntentChangeKind = (typeof INTENT_CHANGE_KINDS)[number];

/**
 * §5: a goal revision carries the COMPLETE next goal. At most one per proposal — two goal revisions are
 * not a change set, they are a contradiction.
 */
export interface GoalRevisionChange {
  readonly kind: "GOAL_REVISE";
  readonly goal: string;
}

/** §5: the requirement id must NOT already exist. */
export interface RequirementAdditionChange {
  readonly kind: "REQUIREMENT_ADD";
  readonly requirement: Requirement;
}

/** §5: the id must already exist, and the change carries the COMPLETE next Requirement. */
export interface RequirementRevisionChange {
  readonly kind: "REQUIREMENT_REVISE";
  readonly requirement: Requirement;
}

/** §5: the id must exist. */
export interface RequirementRemovalChange {
  readonly kind: "REQUIREMENT_REMOVE";
  readonly requirementId: string;
}

/** §5: the decision id must be new. */
export interface DecisionAppendChange {
  readonly kind: "DECISION_APPEND";
  readonly decision: Decision;
}

/** §5: the new decision must be new AND `decision.supersedes === targetDecisionId`, which must exist. */
export interface DecisionSupersessionChange {
  readonly kind: "DECISION_SUPERSEDE";
  readonly decision: Decision;
  readonly targetDecisionId: string;
}

export type ProjectIntentChange =
  | GoalRevisionChange
  | RequirementAdditionChange
  | RequirementRevisionChange
  | RequirementRemovalChange
  | DecisionAppendChange
  | DecisionSupersessionChange;

/* ------------------------------------------------------------------ *
 * Ground request + bindings (§6/§7/§8)
 * ------------------------------------------------------------------ */

/**
 * §7: the proposal author supplies TYPED IDENTITY ONLY. There is no field for standing, freshness, basis,
 * activity, digest, authority or a truth label — those are derived by the canonical owners during
 * preparation, so a caller cannot assert them.
 */
export interface IntentGroundRequest {
  readonly proof?: readonly { readonly claimId: string }[] | undefined;
  readonly reasoning?: readonly { readonly cellId: string; readonly claimId: string }[] | undefined;
  readonly negativeResults?: readonly { readonly entryId: string }[] | undefined;
}

/** §6: three ground classes with three DIFFERENT epistemic statuses, never flattened into one list. */
export const INTENT_GROUND_KINDS = ["proof", "reasoning", "negative_result"] as const;
export type IntentGroundKind = (typeof INTENT_GROUND_KINDS)[number];

/** §8: the Proof owner's own basis. Never a derived view digest. */
export interface ProofBasisAtProposal {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface ReasoningFrontierBasisAtProposal {
  readonly cellId: string;
  readonly frontierRevision: number;
  readonly frontierDigest: string;
}

export interface ProofIntentGround {
  readonly kind: "proof";
  readonly claimId: string;
  readonly standingAtProposal: string;
  readonly freshnessAtProposal: string;
  readonly proofBasisAtProposal: ProofBasisAtProposal;
  readonly projectAssociation: "PROOF_CLAIM";
}

export interface ReasoningIntentGround {
  readonly kind: "reasoning";
  readonly cellId: string;
  readonly claimId: string;
  readonly frontierBasisAtProposal: ReasoningFrontierBasisAtProposal;
  readonly activeAtProposal: true;
  readonly projectAssociation: "REASONING_CELL";
}

/**
 * §8/§28: a negative result binds identity + a status snapshot. It is NOT Evidence and it grants no
 * truth to its negation; the body stays owned by ProjectJournal.
 */
export interface NegativeResultIntentGround {
  readonly kind: "negative_result";
  readonly entryId: string;
  readonly entryDigest: string;
  readonly projectId: string;
  readonly journalKind: "NEGATIVE_RESULT";
  readonly resolutionAtProposal: { readonly status: string; readonly detail?: string | undefined } | null;
}

export type IntentGround =
  | ProofIntentGround
  | ReasoningIntentGround
  | NegativeResultIntentGround;

/* ------------------------------------------------------------------ *
 * The proposal artifact (§11)
 * ------------------------------------------------------------------ */

export const PROJECT_INTENT_PROPOSAL_DOMAIN = "palimpsest.project-intent.proposal.v1";
export const PROJECT_INTENT_PROPOSAL_ID_DOMAIN = "palimpsest.project-intent.proposal-id.v1";

export interface ProjectIntentProposalContent {
  readonly schemaVersion: 1;
  readonly projectBasis: ProjectIntentBasis;
  readonly changes: readonly ProjectIntentChange[];
  readonly grounds: readonly IntentGround[];
  /** §11: explanatory proposal content. `Rationale ≠ Evidence` — it carries no authority. */
  readonly rationale: string;
}

export interface ProjectIntentProposal extends ProjectIntentProposalContent {
  readonly proposalId: string;
  readonly digest: string;
}

/* ------------------------------------------------------------------ *
 * Typed refusal (§13)
 * ------------------------------------------------------------------ */

export const INTENT_REFUSAL_REASONS = [
  "INTENT_GROUND_NOT_PROJECT_ASSOCIATED",
  "INTENT_GROUND_NOT_FOUND",
  "INTENT_PROOF_STALE",
  "INTENT_REASONING_INACTIVE",
  "INTENT_NEGATIVE_RESULT_WRONG_KIND",
  "INTENT_GROUND_OBSERVATION_RACED",
  "INTENT_CHANGE_INVALID",
  "INTENT_PROJECT_BASIS_STALE",
  "INTENT_NO_GROUNDS",
  "INTENT_CAPABILITY_UNAVAILABLE",
] as const;
export type IntentRefusalReason = (typeof INTENT_REFUSAL_REASONS)[number];

/** §13: preparation is ATOMIC — any failing ground means zero proposal and zero ProjectIR write. */
export class ProjectIntentRefusal extends Error {
  constructor(
    readonly kind: IntentRefusalReason,
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "ProjectIntentRefusal";
  }
}

export function intentRefuse(kind: IntentRefusalReason, detail: string): never {
  throw new ProjectIntentRefusal(kind, detail);
}

/* ------------------------------------------------------------------ *
 * Strict parsing
 * ------------------------------------------------------------------ */

function obj(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    intentRefuse("INTENT_CHANGE_INVALID", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function str(raw: unknown, what: string): string {
  if (typeof raw !== "string" || raw === "") intentRefuse("INTENT_CHANGE_INVALID", `${what} must be a non-empty string`);
  return raw;
}

function keys(raw: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) intentRefuse("INTENT_CHANGE_INVALID", `${what}: unknown field "${key}"`);
  }
}

const REQUIREMENT_PRIORITIES = ["critical", "high", "normal", "low"] as const;

function parseRequirement(raw: unknown, what: string): Requirement {
  const value = obj(raw, what);
  keys(value, ["requirement_id", "statement", "priority", "acceptance_refs"], what);
  const priority = str(value.priority, `${what}.priority`);
  if (!(REQUIREMENT_PRIORITIES as readonly string[]).includes(priority)) {
    intentRefuse("INTENT_CHANGE_INVALID", `${what}.priority: invalid literal`);
  }
  if (!Array.isArray(value.acceptance_refs)) intentRefuse("INTENT_CHANGE_INVALID", `${what}.acceptance_refs must be an array`);
  return {
    requirement_id: str(value.requirement_id, `${what}.requirement_id`),
    statement: str(value.statement, `${what}.statement`),
    priority: priority as Requirement["priority"],
    acceptance_refs: value.acceptance_refs.map((entry) => str(entry, `${what}.acceptance_refs[]`)),
  };
}

function parseDecision(raw: unknown, what: string): Decision {
  const value = obj(raw, what);
  keys(value, ["decision_id", "statement", "rationale", "evidence_ids", "supersedes"], what);
  if (!Array.isArray(value.evidence_ids)) intentRefuse("INTENT_CHANGE_INVALID", `${what}.evidence_ids must be an array`);
  const supersedes = value.supersedes;
  if (supersedes !== null && supersedes !== undefined && typeof supersedes !== "string") {
    intentRefuse("INTENT_CHANGE_INVALID", `${what}.supersedes must be a string or null`);
  }
  return {
    decision_id: str(value.decision_id, `${what}.decision_id`),
    statement: str(value.statement, `${what}.statement`),
    rationale: str(value.rationale, `${what}.rationale`),
    evidence_ids: value.evidence_ids.map((entry) => str(entry, `${what}.evidence_ids[]`)),
    supersedes: typeof supersedes === "string" ? supersedes : null,
  };
}

/**
 * §5: parse ONE change against its kind. Unknown keys are refused in every branch, so a change carrying
 * a stray field (a caller trying to smuggle in a standing, say) fails rather than being ignored.
 */
export function parseIntentChange(raw: unknown): ProjectIntentChange {
  const value = obj(raw, "intent change");
  const kind = str(value.kind, "intent change.kind");
  switch (kind) {
    case "GOAL_REVISE":
      keys(value, ["kind", "goal"], "GOAL_REVISE");
      return Object.freeze({ kind: "GOAL_REVISE" as const, goal: str(value.goal, "GOAL_REVISE.goal") });
    case "REQUIREMENT_ADD":
      keys(value, ["kind", "requirement"], "REQUIREMENT_ADD");
      return Object.freeze({ kind: "REQUIREMENT_ADD" as const, requirement: parseRequirement(value.requirement, "REQUIREMENT_ADD.requirement") });
    case "REQUIREMENT_REVISE":
      keys(value, ["kind", "requirement"], "REQUIREMENT_REVISE");
      return Object.freeze({ kind: "REQUIREMENT_REVISE" as const, requirement: parseRequirement(value.requirement, "REQUIREMENT_REVISE.requirement") });
    case "REQUIREMENT_REMOVE":
      keys(value, ["kind", "requirementId"], "REQUIREMENT_REMOVE");
      return Object.freeze({ kind: "REQUIREMENT_REMOVE" as const, requirementId: str(value.requirementId, "REQUIREMENT_REMOVE.requirementId") });
    case "DECISION_APPEND":
      keys(value, ["kind", "decision"], "DECISION_APPEND");
      return Object.freeze({ kind: "DECISION_APPEND" as const, decision: parseDecision(value.decision, "DECISION_APPEND.decision") });
    case "DECISION_SUPERSEDE":
      keys(value, ["kind", "decision", "targetDecisionId"], "DECISION_SUPERSEDE");
      return Object.freeze({
        kind: "DECISION_SUPERSEDE" as const,
        decision: parseDecision(value.decision, "DECISION_SUPERSEDE.decision"),
        targetDecisionId: str(value.targetDecisionId, "DECISION_SUPERSEDE.targetDecisionId"),
      });
    default:
      intentRefuse("INTENT_CHANGE_INVALID", `unknown intent change kind "${kind}"`);
  }
}

/* ------------------------------------------------------------------ *
 * §5 semantic validation against the current ProjectIR
 * ------------------------------------------------------------------ */

export interface IntentCurrentIntent {
  readonly goal: string;
  readonly requirements: readonly Requirement[];
  readonly decisions: readonly Decision[];
}

/**
 * §5: validate a change set against the CURRENT intent. This is where "the id must already exist" and
 * "the id must be new" are enforced, together with the duplicate/conflict rules — a proposal that adds
 * and removes the same requirement is refused rather than resolved by array order.
 */
export function validateIntentChanges(
  changes: readonly ProjectIntentChange[],
  current: IntentCurrentIntent,
): void {
  if (changes.length === 0) intentRefuse("INTENT_CHANGE_INVALID", "a proposal must carry at least one change");

  const requirementIds = new Set(current.requirements.map((requirement) => requirement.requirement_id));
  const decisionIds = new Set(current.decisions.map((decision) => decision.decision_id));

  const goalRevisions = changes.filter((change) => change.kind === "GOAL_REVISE").length;
  if (goalRevisions > 1) intentRefuse("INTENT_CHANGE_INVALID", "at most one GOAL_REVISE is allowed per proposal");

  // Per-kind uniqueness: one change per requirement id and per decision id, so a proposal never
  // contains two conflicting statements about the same subject.
  const touchedRequirements = new Set<string>();
  const touchedDecisions = new Set<string>();

  for (const change of changes) {
    switch (change.kind) {
      case "GOAL_REVISE":
        break;
      case "REQUIREMENT_ADD": {
        const id = change.requirement.requirement_id;
        if (requirementIds.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `REQUIREMENT_ADD: requirement "${id}" already exists`);
        if (touchedRequirements.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `duplicate change for requirement "${id}"`);
        touchedRequirements.add(id);
        requirementIds.add(id);
        break;
      }
      case "REQUIREMENT_REVISE": {
        const id = change.requirement.requirement_id;
        if (!requirementIds.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `REQUIREMENT_REVISE: requirement "${id}" does not exist`);
        if (touchedRequirements.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `duplicate change for requirement "${id}"`);
        touchedRequirements.add(id);
        break;
      }
      case "REQUIREMENT_REMOVE": {
        if (!requirementIds.has(change.requirementId)) {
          intentRefuse("INTENT_CHANGE_INVALID", `REQUIREMENT_REMOVE: requirement "${change.requirementId}" does not exist`);
        }
        if (touchedRequirements.has(change.requirementId)) {
          intentRefuse("INTENT_CHANGE_INVALID", `duplicate change for requirement "${change.requirementId}"`);
        }
        touchedRequirements.add(change.requirementId);
        requirementIds.delete(change.requirementId);
        break;
      }
      case "DECISION_APPEND": {
        const id = change.decision.decision_id;
        if (decisionIds.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `DECISION_APPEND: decision "${id}" already exists`);
        if (touchedDecisions.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `duplicate change for decision "${id}"`);
        touchedDecisions.add(id);
        decisionIds.add(id);
        break;
      }
      case "DECISION_SUPERSEDE": {
        const id = change.decision.decision_id;
        if (decisionIds.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `DECISION_SUPERSEDE: decision "${id}" already exists`);
        if (!decisionIds.has(change.targetDecisionId)) {
          intentRefuse("INTENT_CHANGE_INVALID", `DECISION_SUPERSEDE: target decision "${change.targetDecisionId}" does not exist`);
        }
        if (change.decision.supersedes !== change.targetDecisionId) {
          intentRefuse(
            "INTENT_CHANGE_INVALID",
            `DECISION_SUPERSEDE: decision.supersedes must equal targetDecisionId ("${change.targetDecisionId}")`,
          );
        }
        if (touchedDecisions.has(id)) intentRefuse("INTENT_CHANGE_INVALID", `duplicate change for decision "${id}"`);
        touchedDecisions.add(id);
        decisionIds.add(id);
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * §12 deterministic normalization + identity
 * ------------------------------------------------------------------ */

/**
 * §12: the ONE documented dedup rule — grounds are deduplicated by their typed identity, and the FIRST
 * occurrence wins. Duplicates are not an error (the same claim named twice is still one claim) but they
 * must not create two distinct proposals.
 */
function groundKey(ground: IntentGround): string {
  switch (ground.kind) {
    case "proof":
      return `proof\u0000${ground.claimId}`;
    case "reasoning":
      return `reasoning\u0000${ground.cellId}\u0000${ground.claimId}`;
    case "negative_result":
      return `negative_result\u0000${ground.entryId}`;
  }
}

function normalizeGrounds(grounds: readonly IntentGround[]): readonly IntentGround[] {
  const seen = new Set<string>();
  const out: IntentGround[] = [];
  for (const ground of grounds) {
    const key = groundKey(ground);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ground);
  }
  return Object.freeze(
    out.slice().sort((left, right) => {
      const leftKey = groundKey(left);
      const rightKey = groundKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );
}

/** A total order over changes, so the same change set always serializes identically. */
function changeKey(change: ProjectIntentChange): string {
  switch (change.kind) {
    case "GOAL_REVISE":
      return `0\u0000${change.goal}`;
    case "REQUIREMENT_ADD":
      return `1\u0000${change.requirement.requirement_id}`;
    case "REQUIREMENT_REVISE":
      return `2\u0000${change.requirement.requirement_id}`;
    case "REQUIREMENT_REMOVE":
      return `3\u0000${change.requirementId}`;
    case "DECISION_APPEND":
      return `4\u0000${change.decision.decision_id}`;
    case "DECISION_SUPERSEDE":
      return `5\u0000${change.decision.decision_id}`;
  }
}

function normalizeChanges(changes: readonly ProjectIntentChange[]): readonly ProjectIntentChange[] {
  return Object.freeze(
    changes.slice().sort((left, right) => {
      const leftKey = changeKey(left);
      const rightKey = changeKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );
}

/** The canonical digest input: normalized changes + normalized grounds + rationale + basis. */
function proposalDigestOf(content: ProjectIntentProposalContent): string {
  return canonicalDigest({
    domain: PROJECT_INTENT_PROPOSAL_DOMAIN,
    schemaVersion: 1,
    projectBasis: content.projectBasis,
    changes: normalizeChanges(content.changes),
    grounds: normalizeGrounds(content.grounds),
    rationale: content.rationale,
  });
}

/**
 * §11: materialize the content-addressed proposal. `proposalId` derives from the digest — no random
 * UUID, no clock in semantic identity, so the same change set over the same basis is the same proposal.
 */
export function materializeProjectIntentProposal(input: {
  readonly projectBasis: ProjectIntentBasis;
  readonly changes: readonly ProjectIntentChange[];
  readonly grounds: readonly IntentGround[];
  readonly rationale: string;
}): ProjectIntentProposal {
  const content: ProjectIntentProposalContent = Object.freeze({
    schemaVersion: 1 as const,
    projectBasis: Object.freeze({ ...input.projectBasis }),
    changes: normalizeChanges(input.changes),
    grounds: normalizeGrounds(input.grounds),
    rationale: input.rationale,
  });
  const digest = proposalDigestOf(content);
  const proposalId = `pip-${canonicalDigest({ domain: PROJECT_INTENT_PROPOSAL_ID_DOMAIN, digest }).slice(0, 32)}`;
  return Object.freeze({ ...content, proposalId, digest });
}

/** §16: two proposals are the same proposal iff their content digests match. */
export function intentProposalDigestOf(proposal: ProjectIntentProposal): string {
  return proposalDigestOf(proposal);
}

export function parseProjectIntentBasis(raw: unknown, what = "ProjectIntentBasis"): ProjectIntentBasis {
  const value = obj(raw, what);
  keys(value, ["projectId", "revision", "digest", "headCommit"], what);
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0) {
    intentRefuse("INTENT_CHANGE_INVALID", `${what}.revision must be a non-negative integer`);
  }
  return Object.freeze({
    projectId: str(value.projectId, `${what}.projectId`),
    revision: value.revision,
    digest: str(value.digest, `${what}.digest`),
    headCommit: str(value.headCommit, `${what}.headCommit`),
  });
}

/**
 * Parse a complete proposal (used by the trusted apply path and by tests). The digest and id are
 * RE-DERIVED from the content rather than trusted: a supplied identity that disagrees with its own
 * content is a forgery attempt, not a proposal.
 */
export function parseProjectIntentProposal(raw: unknown): ProjectIntentProposal {
  const value = obj(raw, "ProjectIntentProposal");
  keys(value, ["schemaVersion", "proposalId", "digest", "projectBasis", "changes", "grounds", "rationale"], "ProjectIntentProposal");
  if (value.schemaVersion !== 1) intentRefuse("INTENT_CHANGE_INVALID", "ProjectIntentProposal.schemaVersion must be 1");
  if (!Array.isArray(value.changes)) intentRefuse("INTENT_CHANGE_INVALID", "ProjectIntentProposal.changes must be an array");
  if (!Array.isArray(value.grounds)) intentRefuse("INTENT_CHANGE_INVALID", "ProjectIntentProposal.grounds must be an array");
  const materialized = materializeProjectIntentProposal({
    projectBasis: parseProjectIntentBasis(value.projectBasis),
    changes: value.changes.map((change) => parseIntentChange(change)),
    grounds: value.grounds as readonly IntentGround[],
    rationale: typeof value.rationale === "string" ? value.rationale : "",
  });
  if (value.proposalId !== undefined && value.proposalId !== materialized.proposalId) {
    intentRefuse("INTENT_CHANGE_INVALID", "ProjectIntentProposal.proposalId does not match its content");
  }
  if (value.digest !== undefined && value.digest !== materialized.digest) {
    intentRefuse("INTENT_CHANGE_INVALID", "ProjectIntentProposal.digest does not match its content");
  }
  return materialized;
}

/** A tiny assertion helper shared by the service and the composition adapters. */
export function assertIntentProposal(value: unknown): ProjectIntentProposal {
  if (typeof value !== "object" || value === null) {
    throw new DomainValidationError("an intent proposal object is required");
  }
  return value as ProjectIntentProposal;
}
