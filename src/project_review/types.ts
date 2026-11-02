/**
 * PC1 S04 — proposal / review metadata.
 *
 * This store is NON-AUTHORITATIVE. It records what was proposed, what an operator decided, and what
 * the existing owners then did. It has no power to accept a source, revise ProjectIR, start Work or
 * promote a result: those effects still travel through ProjectIntentAdmissionPort, the controller's
 * plan revision, Work and the Promotion path.
 */
import type { ProjectIntentChange, ProjectIntentProposal } from "../project_intent/proposal.js";
import type { TaskSpec } from "../schema/models.js";

export const PROPOSAL_KINDS = ["INTENT_REVISION", "PLAN_REVISION", "SOURCE_INTAKE"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = ["PROPOSED", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "STALE", "APPLIED", "APPLICATION_FAILED"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface ProposalBasis {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
}

export interface ProposalScope {
  readonly writePaths: readonly string[];
  readonly effects: readonly string[];
}

export interface SourceIntakePayload {
  readonly candidatePath: string;
  readonly targetPath: string;
  readonly sha256: string;
  readonly objective: string;
  readonly taskId: string;
}

export interface PlanRevisionPayload {
  readonly tasks: readonly TaskSpec[];
  readonly reason: string;
}

export interface IntentRevisionPayload {
  readonly prepared: ProjectIntentProposal;
  readonly changeClass: "behavior_change" | "contract_breaking";
  readonly changedIds: readonly string[];
}

export type ProposalPayload = SourceIntakePayload | PlanRevisionPayload | IntentRevisionPayload;

export interface ReviewDecision {
  readonly decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly proposalDigest: string;
  readonly basisAtDecision: ProposalBasis;
  readonly note: string;
}

export interface ApplicationRecord {
  readonly appliedBy: string;
  readonly appliedAt: string;
  readonly outcome: "APPLIED" | "FAILED";
  readonly detail: string;
  readonly canonicalRef: string | null;
  readonly revision: number | null;
  readonly digest: string | null;
}

export interface ProposalRecord {
  readonly schema: "pc1-proposal/v1";
  readonly projectId: string;
  readonly proposalId: string;
  readonly digest: string;
  readonly kind: ProposalKind;
  readonly createdAt: string;
  readonly proposedBy: string;
  readonly purpose: string;
  readonly proposedAction: string;
  readonly sources: readonly string[];
  readonly basis: ProposalBasis;
  readonly scope: ProposalScope;
  readonly risk: string;
  readonly dependencies: readonly string[];
  readonly expectedArtifact: string;
  readonly requiredAuthority: string;
  readonly payload: ProposalPayload;
  readonly status: ProposalStatus;
  readonly review?: ReviewDecision | undefined;
  readonly application?: ApplicationRecord | undefined;
  readonly execution?: { readonly attemptId: string; readonly taskId: string; readonly recordedAt: string } | undefined;
  readonly acceptance?: { readonly promotionId: string; readonly acceptedHead: string; readonly recordedAt: string } | undefined;
}

export interface ProposalDraft {
  readonly kind: ProposalKind;
  readonly proposedBy: string;
  readonly purpose: string;
  readonly proposedAction: string;
  readonly sources: readonly string[];
  readonly scope: ProposalScope;
  readonly risk?: string | undefined;
  readonly dependencies?: readonly string[] | undefined;
  readonly expectedArtifact?: string | undefined;
  readonly requiredAuthority?: string | undefined;
  readonly payload: ProposalPayload;
}

export interface OperatorAuthorityPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  authorize(actor: string): { readonly authorized: boolean; readonly role: "operator" | "agent" | "unknown"; readonly reason?: string | undefined };
}

export interface ReviewPreview {
  readonly schema: "pc1-review-preview/v1";
  readonly proposal: ProposalRecord;
  readonly current: ProposalBasis;
  readonly currentness: "CURRENT" | "STALE";
  readonly currentnessDetail: string;
  readonly applicable: boolean;
  readonly knownImpacts: readonly string[];
  readonly requiredAuthority: string;
  readonly effects: readonly string[];
}

export interface ReviewStore {
  put(record: ProposalRecord): void;
  get(projectId: string, proposalId: string): ProposalRecord | undefined;
  list(projectId: string): readonly ProposalRecord[];
  close(): void;
}

/** Re-exported for callers that build an intent proposal. */
export type { ProjectIntentChange };
