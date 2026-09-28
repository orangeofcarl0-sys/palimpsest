/**
 * E2-I §14/§16/§17 — the ACCEPTED RECONCILIATION RECEIPT, the CURRENTNESS assessment, and the
 * independent SEMANTIC AUTHORITY seam.
 *
 * ## Why a receipt at all (§14)
 *
 * A transient proposal is not enough. `PlanInput.reason` is a free string and cannot answer, later:
 * which proposal was accepted, against which basis, on which grounded observations, admitted by which
 * authority, and why. So the ACCEPTED revision carries an optional receipt.
 *
 * The receipt is an `EXISTING_OWNER_SEMANTIC_EXTENSION` of the ProjectIR revision path — NOT a new store
 * and NOT a second ProjectIR. It deliberately does NOT duplicate the resulting ProjectIR: the resulting
 * IR is already in the same `PROJECT_REVISED` event and the parent IR is in prior history, so the change
 * set is reconstructible from `parent IR → resulting IR`. What the receipt adds is exactly what those two
 * documents cannot say — the grounding and the admission provenance.
 *
 * ## The authority seam is separate on purpose (§17)
 *
 * `ProjectIntentAdmissionPort` is a seam, not a default. There is no built-in policy that approves
 * anything, and no caller-supplied boolean can stand in for it: `approved: true`, an operator flag, or
 * `managementMode === "DELEGATE"` are all forbidden as semantic authority.
 *
 * Layer: L2 (`src/project_intent/`).
 */
import { canonicalDigest } from "../schema/canonical.js";

import type { IntentGround, ProjectIntentBasis, ProjectIntentProposal } from "./proposal.js";
import { intentRefuse } from "./proposal.js";

/* ------------------------------------------------------------------ *
 * §16 currentness
 * ------------------------------------------------------------------ */

export const INTENT_CURRENTNESS_STATUSES = [
  "CURRENT",
  "STALE_PROJECT",
  "STALE_GROUND",
  "UNRESOLVED",
] as const;
export type IntentCurrentnessStatus = (typeof INTENT_CURRENTNESS_STATUSES)[number];

export interface IntentCurrentnessAssessment {
  readonly status: IntentCurrentnessStatus;
  /** The specific reasons, so a refusal is inspectable rather than a bare status. */
  readonly details: readonly string[];
  /** The project basis observed at assessment time, for the record. */
  readonly observedBasis: ProjectIntentBasis;
}

/* ------------------------------------------------------------------ *
 * §17 the independent semantic authority
 * ------------------------------------------------------------------ */

/**
 * §17: the decision vocabulary. It reuses the repository's established epistemic admission idiom
 * (`ADMIT`/`REJECT`/`UNRESOLVED` in the Reasoning plane) rather than inventing a second one — the
 * question "may this become canonical?" has one vocabulary in this codebase.
 *
 * `UNRESOLVED` is a legitimate outcome, not an error: an authority that cannot decide must say so, and
 * the caller gets `authority_unresolved` with zero writes rather than an accidental approval.
 */
export const INTENT_ADMISSION_DECISIONS = ["ADMIT", "REJECT", "UNRESOLVED"] as const;
export type IntentAdmissionDecision = (typeof INTENT_ADMISSION_DECISIONS)[number];

/**
 * What the authority is asked. It receives the WHOLE proposal (so it can see the typed grounds and the
 * rationale) and the currentness assessment — never a pre-chewed boolean.
 */
export interface IntentAdmissionInput {
  readonly proposal: ProjectIntentProposal;
  readonly currentness: IntentCurrentnessAssessment;
}

export interface IntentAdmissionOutcome {
  readonly decision: IntentAdmissionDecision;
  /** §19: the authority must approve the EXACT proposal digest, never "something like this". */
  readonly proposalDigest: string;
  /** The policy identity that decided, so the receipt can name it. */
  readonly policyRef: { readonly policyId: string; readonly version: string };
  /** The policy's own provenance digest (its decision record), distinct from the proposal digest. */
  readonly provenanceDigest: string;
  readonly detail?: string | undefined;
}

/**
 * §17: the authority seam. There is deliberately NO default implementation that admits: a deployment
 * that composes no authority gets `authority_unresolved`, never an implicit approval.
 */
export interface ProjectIntentAdmissionPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  decide(input: IntentAdmissionInput): Promise<IntentAdmissionOutcome>;
}

/** §17: refuse a caller-supplied boolean/string standing in for a decision. */
export function assertAuthorityOutcomeShape(raw: unknown): IntentAdmissionOutcome {
  if (typeof raw !== "object" || raw === null) intentRefuse("INTENT_CHANGE_INVALID", "an intent admission outcome object is required");
  const value = raw as Record<string, unknown>;
  const decision = value.decision;
  if (decision !== "ADMIT" && decision !== "REJECT" && decision !== "UNRESOLVED") {
    intentRefuse("INTENT_CHANGE_INVALID", "intent admission decision must be ADMIT, REJECT or UNRESOLVED");
  }
  if (typeof value.proposalDigest !== "string" || value.proposalDigest === "") {
    intentRefuse("INTENT_CHANGE_INVALID", "an intent admission outcome must name the exact proposal digest it decided");
  }
  const policyRef = value.policyRef;
  if (typeof policyRef !== "object" || policyRef === null) {
    intentRefuse("INTENT_CHANGE_INVALID", "an intent admission outcome must carry its policy reference");
  }
  const ref = policyRef as Record<string, unknown>;
  if (typeof ref.policyId !== "string" || typeof ref.version !== "string") {
    intentRefuse("INTENT_CHANGE_INVALID", "intent admission policyRef needs policyId and version");
  }
  if (typeof value.provenanceDigest !== "string" || value.provenanceDigest === "") {
    intentRefuse("INTENT_CHANGE_INVALID", "an intent admission outcome must carry a provenance digest");
  }
  return Object.freeze({
    decision,
    proposalDigest: value.proposalDigest,
    policyRef: Object.freeze({ policyId: ref.policyId, version: ref.version }),
    provenanceDigest: value.provenanceDigest,
    ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
  });
}

/* ------------------------------------------------------------------ *
 * §14 the accepted reconciliation receipt
 * ------------------------------------------------------------------ */

export const ACCEPTED_INTENT_RECONCILIATION_DOMAIN = "palimpsest.project-intent.accepted-reconciliation.v1";

/**
 * §14: the durable provenance of an ACCEPTED intent revision. It answers, later, the five questions the
 * resulting ProjectIR cannot: which proposal, which basis, which grounded observations, which authority,
 * and why.
 */
export interface AcceptedIntentReconciliationReceipt {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly proposalBasis: ProjectIntentBasis;
  readonly groundBindings: readonly IntentGround[];
  readonly rationale: string;
  readonly admission: {
    readonly decision: "ADMIT";
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly provenanceDigest: string;
  };
  readonly acceptedAt: string;
  readonly digest: string;
}

export function acceptedIntentReceiptDigestOf(
  input: Omit<AcceptedIntentReconciliationReceipt, "digest">,
): string {
  return canonicalDigest({ domain: ACCEPTED_INTENT_RECONCILIATION_DOMAIN, ...input });
}

export function materializeAcceptedIntentReconciliation(input: {
  readonly proposal: ProjectIntentProposal;
  readonly admission: IntentAdmissionOutcome;
  readonly acceptedAt: string;
}): AcceptedIntentReconciliationReceipt {
  const base = {
    schemaVersion: 1 as const,
    proposalId: input.proposal.proposalId,
    proposalDigest: input.proposal.digest,
    proposalBasis: input.proposal.projectBasis,
    groundBindings: input.proposal.grounds,
    rationale: input.proposal.rationale,
    admission: Object.freeze({
      decision: "ADMIT" as const,
      policyRef: input.admission.policyRef,
      provenanceDigest: input.admission.provenanceDigest,
    }),
    acceptedAt: input.acceptedAt,
  };
  return Object.freeze({ ...base, digest: acceptedIntentReceiptDigestOf(base) });
}

/**
 * §29: parse a receipt from a stored `PROJECT_REVISED` payload. Strict: the digest is RE-DERIVED, so a
 * tampered receipt is refused rather than believed.
 */
export function parseAcceptedIntentReconciliation(raw: unknown): AcceptedIntentReconciliationReceipt {
  if (typeof raw !== "object" || raw === null) {
    intentRefuse("INTENT_CHANGE_INVALID", "an accepted intent reconciliation receipt must be an object");
  }
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!["schemaVersion", "proposalId", "proposalDigest", "proposalBasis", "groundBindings", "rationale", "admission", "acceptedAt", "digest"].includes(key)) {
      intentRefuse("INTENT_CHANGE_INVALID", `accepted intent reconciliation: unknown field "${key}"`);
    }
  }
  if (value.schemaVersion !== 1) intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation schemaVersion must be 1");
  if (typeof value.proposalId !== "string" || typeof value.proposalDigest !== "string") {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation needs proposalId and proposalDigest");
  }
  if (typeof value.rationale !== "string") intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation needs a rationale string");
  if (typeof value.acceptedAt !== "string") intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation needs acceptedAt");
  if (!Array.isArray(value.groundBindings)) intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation needs groundBindings");
  const admission = value.admission;
  if (typeof admission !== "object" || admission === null) {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation needs an admission block");
  }
  const admissionRecord = admission as Record<string, unknown>;
  if (admissionRecord.decision !== "ADMIT") {
    intentRefuse("INTENT_CHANGE_INVALID", "an accepted receipt records only an ADMIT decision");
  }
  const policyRef = admissionRecord.policyRef as Record<string, unknown> | undefined;
  if (policyRef === undefined || typeof policyRef.policyId !== "string" || typeof policyRef.version !== "string") {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation admission needs a policyRef");
  }
  if (typeof admissionRecord.provenanceDigest !== "string") {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation admission needs a provenanceDigest");
  }
  const proposalBasis = value.proposalBasis;
  if (typeof proposalBasis !== "object" || proposalBasis === null) {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation needs a proposalBasis");
  }
  const basisRecord = proposalBasis as Record<string, unknown>;
  if (typeof basisRecord.projectId !== "string" || typeof basisRecord.revision !== "number" || typeof basisRecord.digest !== "string" || typeof basisRecord.headCommit !== "string") {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation proposalBasis is malformed");
  }
  const base = {
    schemaVersion: 1 as const,
    proposalId: value.proposalId,
    proposalDigest: value.proposalDigest,
    proposalBasis: Object.freeze({
      projectId: basisRecord.projectId,
      revision: basisRecord.revision,
      digest: basisRecord.digest,
      headCommit: basisRecord.headCommit,
    }),
    groundBindings: Object.freeze(value.groundBindings as readonly IntentGround[]),
    rationale: value.rationale,
    admission: Object.freeze({
      decision: "ADMIT" as const,
      policyRef: Object.freeze({ policyId: policyRef.policyId, version: policyRef.version }),
      provenanceDigest: admissionRecord.provenanceDigest,
    }),
    acceptedAt: value.acceptedAt,
  };
  const digest = acceptedIntentReceiptDigestOf(base);
  if (typeof value.digest === "string" && value.digest !== digest) {
    intentRefuse("INTENT_CHANGE_INVALID", "accepted intent reconciliation digest does not match its content");
  }
  return Object.freeze({ ...base, digest });
}
