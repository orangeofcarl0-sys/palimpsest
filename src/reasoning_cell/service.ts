/**
 * G10-N collaborative reasoning cell service.
 *
 *   Frozen accepted frontier → independent local branches → structured candidates
 *   → verification → SEPARATE epistemic admission → composable accepted frontier
 *
 * The service is the only place that invokes verification/admission; a caller can never
 * supply a VerificationResult or AdmissionDecision. Accepted claims are CELL-LOCAL admitted
 * epistemic state: they are not Evidence, not truth, not commitment, not boundary
 * acceptance, and grant no effect authority.
 */

import type { ActivationRef } from "../coordination/index.js";
import type {
  ClaimInvalidationRequest,
  ExternalEvidenceRef,
  InvalidationAdmissionDecision,
  InvalidationVerificationResult,
  ReasoningAdmissionDecision,
  ReasoningBranch,
  ReasoningBranchBrief,
  ReasoningCandidate,
  ReasoningCellDefinition,
  ReasoningVerificationResult,
} from "./artifacts.js";
import {
  claimInvalidationRequestDigestOf,
  materializeReasoningCellDefinition,
  parseClaimInvalidationRequest,
  parseInvalidationAdmissionDecision,
  parseInvalidationVerificationResult,
  parseReasoningAdmissionDecision,
  parseReasoningVerificationResult,
  reasoningCandidateDigestOf,
  reasoningCellRefOf,
  reasoningEventIdOf,
} from "./artifacts.js";
import type { ReasoningClaim, ReasoningClaimTypeRegistry, ReasoningClaimTypeRef } from "./claims.js";
import { defaultReasoningClaimTypeRegistry, materializeReasoningClaim, reasoningClaimIdOf, reasoningClaimRefOf } from "./claims.js";
import type { ReasoningClaimId, ReasoningClaimRef, ReasoningFrontierBasis, ReasoningPolicyRef } from "./ref.js";
import {
  ReasoningCellError,
  frontierBasesEqual,
  frontierBasisOf,
  materializeReasoningBranchRef,
  rcStableId,
} from "./ref.js";
import type { ReasoningCellStore, ReasoningEvent, ReasoningStoreBasis } from "./store.js";
import { ReasoningStoreError } from "./store.js";

export interface AdmittedClaimView {
  readonly ref: ReasoningClaimRef;
  readonly claim: ReasoningClaim;
}

export interface ReasoningVerificationInput {
  readonly definition: ReasoningCellDefinition;
  readonly candidate: ReasoningCandidate;
  readonly frontierClaims: readonly AdmittedClaimView[];
  readonly frontierBasis: ReasoningFrontierBasis;
}

/** Verification policy seam. Implementation kind (test/formal/LLM/human) is irrelevant to the kernel. */
export interface ReasoningVerificationPolicyPort {
  verify(input: ReasoningVerificationInput): Promise<unknown>;
  verifyInvalidation?(input: {
    readonly definition: ReasoningCellDefinition;
    readonly target: AdmittedClaimView;
    readonly request: ClaimInvalidationRequest;
    readonly frontierClaims: readonly AdmittedClaimView[];
    readonly frontierBasis: ReasoningFrontierBasis;
  }): Promise<unknown>;
}

export interface ReasoningAdmissionInput {
  readonly definition: ReasoningCellDefinition;
  readonly candidate: ReasoningCandidate;
  readonly verification: ReasoningVerificationResult;
  readonly frontierClaims: readonly AdmittedClaimView[];
  readonly frontierBasis: ReasoningFrontierBasis;
}

/** Epistemic admission policy seam — SEPARATE from verification. */
export interface ReasoningEpistemicAdmissionPolicyPort {
  admit(input: ReasoningAdmissionInput): Promise<unknown>;
  admitInvalidation?(input: {
    readonly definition: ReasoningCellDefinition;
    readonly target: AdmittedClaimView;
    readonly request: ClaimInvalidationRequest;
    readonly verification: InvalidationVerificationResult;
    readonly frontierClaims: readonly AdmittedClaimView[];
    readonly frontierBasis: ReasoningFrontierBasis;
  }): Promise<unknown>;
}

export interface ReasoningCellDeps {
  readonly store: ReasoningCellStore;
  readonly claimTypes?: ReasoningClaimTypeRegistry | undefined;
  readonly verificationPolicy: ReasoningVerificationPolicyPort;
  readonly admissionPolicy: ReasoningEpistemicAdmissionPolicyPort;
}

export type CandidateStatus = "PENDING" | "UNRESOLVED" | "ADMITTED" | "REJECTED" | "DEDUPLICATED";

export type EvaluationOutcome =
  | { readonly status: "admitted"; readonly candidateDigest: string; readonly claimId: ReasoningClaimId; readonly frontierBasis: ReasoningFrontierBasis }
  | { readonly status: "rejected"; readonly candidateDigest: string; readonly frontierBasis: ReasoningFrontierBasis }
  | { readonly status: "unresolved"; readonly candidateDigest: string; readonly frontierBasis: ReasoningFrontierBasis }
  | { readonly status: "deduplicated"; readonly candidateDigest: string; readonly existingClaimId: ReasoningClaimId }
  | { readonly status: "stale_evaluation"; readonly detail: string }
  | { readonly status: "blocked"; readonly detail: string }
  | { readonly status: "verification_error"; readonly detail: string }
  | { readonly status: "invalid_evaluation"; readonly detail: string };

export type InvalidationOutcome =
  | { readonly status: "invalidated"; readonly claimId: ReasoningClaimId; readonly frontierBasis: ReasoningFrontierBasis; readonly inactiveClaimIds: readonly string[] }
  | { readonly status: "kept"; readonly claimId: ReasoningClaimId; readonly frontierBasis: ReasoningFrontierBasis }
  | { readonly status: "unresolved"; readonly claimId: ReasoningClaimId; readonly frontierBasis: ReasoningFrontierBasis }
  | { readonly status: "already_invalidated"; readonly claimId: ReasoningClaimId }
  | { readonly status: "stale_evaluation"; readonly detail: string }
  | { readonly status: "not_admitted"; readonly detail: string }
  | { readonly status: "verification_error"; readonly detail: string }
  | { readonly status: "invalid_evaluation"; readonly detail: string };

export interface ReasoningFrontierView {
  readonly basis: ReasoningFrontierBasis;
  readonly claims: readonly AdmittedClaimView[];
}

export interface ReasoningClaimGraphView {
  readonly basis: ReasoningFrontierBasis;
  readonly nodes: readonly { readonly ref: ReasoningClaimRef; readonly claim: ReasoningClaim; readonly active: boolean }[];
  readonly edges: readonly { readonly dependent: ReasoningClaimRef; readonly dependency: ReasoningClaimRef }[];
}

export interface ReasoningCellView {
  readonly definition: ReasoningCellDefinition;
  readonly lifecycle: "OPEN" | "CLOSED";
  readonly storeBasis: ReasoningStoreBasis;
  readonly frontierBasis: ReasoningFrontierBasis;
  readonly branches: readonly { readonly ref: ReasoningBranch["ref"]; readonly question: string; readonly closed: boolean; readonly atFrontier: ReasoningFrontierBasis }[];
  readonly candidates: readonly { readonly candidateDigest: string; readonly branchId: string; readonly status: CandidateStatus }[];
  readonly admittedClaimIds: readonly string[];
  readonly activeClaimIds: readonly string[];
  readonly inactiveClaimIds: readonly string[];
  readonly rootInvalidatedClaimIds: readonly string[];
}

export interface ReasoningCellService {
  /**
   * Every cell this deployment owns.
   *
   * The store could always do this; the service never exposed it, so nothing could show a user what
   * had already been explored — the only way to reach a cell was to type an id somebody else
   * printed. This is the read that makes an index possible.
   */
  listCells(): Promise<readonly ReasoningCellDefinition[]>;
  openCell(input: { readonly cellId: string; readonly objective: string; readonly verificationPolicyRef: ReasoningPolicyRef; readonly admissionPolicyRef: ReasoningPolicyRef }): Promise<ReasoningCellDefinition>;
  closeCell(input: { readonly cellId: string; readonly reason: string }): Promise<void>;
  openBranch(input: { readonly cellId: string; readonly question: string; readonly attribution?: ActivationRef | null | undefined }): Promise<{ readonly branch: ReasoningBranch; readonly brief: ReasoningBranchBrief }>;
  closeBranch(input: { readonly cellId: string; readonly branchId: string; readonly reason: string }): Promise<void>;
  branchBrief(input: { readonly cellId: string; readonly branchId: string }): Promise<ReasoningBranchBrief>;
  submitCandidate(input: {
    readonly cellId: string;
    readonly branchId: string;
    readonly type: ReasoningClaimTypeRef;
    readonly content: unknown;
    readonly dependencies?: readonly ReasoningClaimRef[] | undefined;
    readonly externalEvidenceRefs?: readonly ExternalEvidenceRef[] | undefined;
  }): Promise<{ readonly candidate: ReasoningCandidate; readonly status: CandidateStatus }>;
  evaluateCandidate(input: { readonly cellId: string; readonly candidateDigest: string }): Promise<EvaluationOutcome>;
  requestInvalidation(input: { readonly cellId: string; readonly targetClaimId: string; readonly reason: string }): Promise<InvalidationOutcome>;
  frontier(input: { readonly cellId: string }): Promise<ReasoningFrontierView>;
  activeClaims(input: { readonly cellId: string }): Promise<readonly AdmittedClaimView[]>;
  claimGraph(input: { readonly cellId: string }): Promise<ReasoningClaimGraphView>;
  cellView(input: { readonly cellId: string }): Promise<ReasoningCellView>;
  events(input: { readonly cellId: string }): Promise<readonly ReasoningEvent[]>;
}

interface CandidateRecord {
  readonly candidate: ReasoningCandidate;
  status: CandidateStatus;
  existingClaimId: string | null;
  verification: ReasoningVerificationResult | null;
}

interface AdmittedClaimRecord {
  readonly claim: ReasoningClaim;
  readonly admittedAtFrontier: ReasoningFrontierBasis;
  readonly verificationResultDigest: string;
  readonly admissionDecisionDigest: string;
  readonly seq: number;
}

interface BranchRecord {
  readonly branch: ReasoningBranch;
  readonly brief: ReasoningBranchBrief;
  closed: boolean;
}

interface CellState {
  definition: ReasoningCellDefinition;
  lifecycle: "OPEN" | "CLOSED";
  readonly branches: Map<string, BranchRecord>;
  readonly candidates: Map<string, CandidateRecord>;
  readonly claims: Map<string, AdmittedClaimRecord>;
  readonly rootInvalidated: Set<string>;
  readonly invalidationRequests: Map<string, ClaimInvalidationRequest>;
  frontierRevision: number;
}

function fail(kind: ConstructorParameters<typeof ReasoningStoreError>[0], message: string): never {
  throw new ReasoningStoreError(kind, message);
}

export function makeReasoningCellService(deps: ReasoningCellDeps): ReasoningCellService {
  const types = deps.claimTypes ?? defaultReasoningClaimTypeRegistry();

  function eventRequest(type: ReasoningEvent["type"], cellId: string, payload: unknown): { eventId: string; type: ReasoningEvent["type"]; payload: unknown } {
    return { eventId: reasoningEventIdOf(type, cellId, payload), type, payload };
  }

  async function append(cellId: string, events: readonly { eventId: string; type: ReasoningEvent["type"]; payload: unknown }[]): Promise<void> {
    const basis = await deps.store.basis(cellId);
    if (basis === undefined) fail("unknown_cell", `reasoning cell "${cellId}" does not exist`);
    await deps.store.appendAtomic({ cellId, expectedBasis: basis, events });
  }

  function derive(events: readonly ReasoningEvent[]): CellState | undefined {
    if (events.length === 0) return undefined;
    const opened = events[0]!;
    if (opened.type !== "REASONING_CELL_OPENED") fail("malformed_record", "a reasoning cell history must begin with REASONING_CELL_OPENED");
    const definition = (opened.payload as { definition: ReasoningCellDefinition }).definition;
    const state: CellState = {
      definition,
      lifecycle: "OPEN",
      branches: new Map(),
      candidates: new Map(),
      claims: new Map(),
      rootInvalidated: new Set(),
      invalidationRequests: new Map(),
      frontierRevision: 0,
    };
    for (const event of events.slice(1)) {
      switch (event.type) {
        case "REASONING_CELL_CLOSED":
          state.lifecycle = "CLOSED";
          break;
        case "BRANCH_OPENED": {
          const payload = event.payload as { branch: ReasoningBranch; brief: ReasoningBranchBrief };
          state.branches.set(payload.branch.ref.branchId, { branch: payload.branch, brief: payload.brief, closed: false });
          break;
        }
        case "BRANCH_CLOSED": {
          const record = state.branches.get((event.payload as { branchId: string }).branchId);
          if (record !== undefined) record.closed = true;
          break;
        }
        case "CANDIDATE_SUBMITTED": {
          const candidate = (event.payload as { candidate: ReasoningCandidate }).candidate;
          if (!state.candidates.has(candidate.candidateDigest)) {
            state.candidates.set(candidate.candidateDigest, { candidate, status: "PENDING", existingClaimId: null, verification: null });
          }
          break;
        }
        case "CANDIDATE_DEDUPLICATED": {
          const payload = event.payload as { candidateDigest: string; existingClaimId: string };
          const record = state.candidates.get(payload.candidateDigest);
          if (record !== undefined) {
            record.status = "DEDUPLICATED";
            record.existingClaimId = payload.existingClaimId;
          }
          break;
        }
        case "CANDIDATE_REJECTED": {
          const record = state.candidates.get((event.payload as { candidateDigest: string }).candidateDigest);
          if (record !== undefined) record.status = "REJECTED";
          break;
        }
        case "VERIFICATION_RECORDED": {
          const verification = (event.payload as { verification: ReasoningVerificationResult }).verification;
          const record = state.candidates.get(verification.candidateDigest);
          if (record !== undefined) record.verification = verification;
          break;
        }
        case "ADMISSION_DECIDED": {
          const decision = (event.payload as { decision: ReasoningAdmissionDecision }).decision;
          const record = state.candidates.get(decision.candidateDigest);
          if (record !== undefined) {
            if (decision.decision === "UNRESOLVED") record.status = "UNRESOLVED";
            else if (decision.decision === "ADMIT") record.status = "ADMITTED";
          }
          break;
        }
        case "CLAIM_ADMITTED": {
          const payload = event.payload as { claimId: string; claim: ReasoningClaim; admittedAtFrontier: ReasoningFrontierBasis; verificationResultDigest: string; admissionDecisionDigest: string };
          state.claims.set(payload.claimId, { claim: payload.claim, admittedAtFrontier: payload.admittedAtFrontier, verificationResultDigest: payload.verificationResultDigest, admissionDecisionDigest: payload.admissionDecisionDigest, seq: event.seq });
          // Candidate status is derived per-candidate from its OWN ADMISSION_DECIDED; a sibling
          // candidate proposing the same semantic claim converges through DEDUPLICATION instead.
          state.frontierRevision += 1;
          break;
        }
        case "CLAIM_INVALIDATION_REQUESTED": {
          const request = (event.payload as { request: ClaimInvalidationRequest }).request;
          state.invalidationRequests.set(request.requestDigest, request);
          break;
        }
        case "CLAIM_INVALIDATED": {
          const payload = event.payload as { claimId: string };
          if (!state.rootInvalidated.has(payload.claimId)) {
            state.rootInvalidated.add(payload.claimId);
            state.frontierRevision += 1;
          }
          break;
        }
        default:
          break;
      }
    }
    return state;
  }

  async function requireState(cellId: string): Promise<CellState> {
    const events = await deps.store.replay(cellId);
    const state = derive(events);
    if (state === undefined) fail("unknown_cell", `reasoning cell "${cellId}" does not exist`);
    return state;
  }

  function requireOpen(state: CellState, what: string): void {
    if (state.lifecycle === "CLOSED") fail("cell_closed", `cannot ${what}: reasoning cell "${state.definition.cellId}" is CLOSED`);
  }

  /** Dependency-cascade closure: a claim is INACTIVE if root-invalidated or depending on an inactive claim. */
  function inactiveClaimIds(state: CellState): readonly string[] {
    const inactive = new Set(state.rootInvalidated);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [claimId, record] of state.claims) {
        if (inactive.has(claimId)) continue;
        if (record.claim.dependencies.some((dependency) => inactive.has(dependency.claimId))) {
          inactive.add(claimId);
          changed = true;
        }
      }
    }
    return Object.freeze([...inactive].sort());
  }

  function frontierOf(state: CellState): { readonly basis: ReasoningFrontierBasis; readonly active: readonly AdmittedClaimView[]; readonly inactive: readonly string[] } {
    const inactive = inactiveClaimIds(state);
    const inactiveSet = new Set(inactive);
    const activeIds = [...state.claims.keys()].filter((claimId) => !inactiveSet.has(claimId)).sort();
    const active = activeIds.map((claimId) => {
      const record = state.claims.get(claimId)!;
      return Object.freeze({ ref: reasoningClaimRefOf(state.definition.cellId, record.claim), claim: record.claim });
    });
    return { basis: frontierBasisOf({ cellId: state.definition.cellId, frontierRevision: state.frontierRevision, activeClaimIds: activeIds }), active: Object.freeze(active), inactive };
  }

  function admittedClaimIds(state: CellState): readonly string[] {
    return Object.freeze([...state.claims.keys()].sort());
  }

  function wrapClaimError(error: unknown): never {
    if (error instanceof ReasoningCellError) {
      const message = error.message;
      if (message.includes("unknown reasoning claim type")) fail("unknown_type", message);
      fail("invalid_content", message);
    }
    throw error;
  }

  async function openCell(input: { readonly cellId: string; readonly objective: string; readonly verificationPolicyRef: ReasoningPolicyRef; readonly admissionPolicyRef: ReasoningPolicyRef }): Promise<ReasoningCellDefinition> {
    const definition = materializeReasoningCellDefinition(input);
    await deps.store.openCell(definition);
    return definition;
  }

  async function closeCell(input: { readonly cellId: string; readonly reason: string }): Promise<void> {
    const state = await requireState(input.cellId);
    if (state.lifecycle === "CLOSED") return;
    if (input.reason.trim() === "") fail("invalid_registration", "close reason must be a non-empty string");
    await append(input.cellId, [eventRequest("REASONING_CELL_CLOSED", input.cellId, { reason: input.reason })]);
  }

  async function openBranch(input: { readonly cellId: string; readonly question: string; readonly attribution?: ActivationRef | null | undefined }): Promise<{ readonly branch: ReasoningBranch; readonly brief: ReasoningBranchBrief }> {
    const state = await requireState(input.cellId);
    requireOpen(state, "open a branch");
    if (input.question.trim() === "") fail("invalid_registration", "branch question must be a non-empty string");
    const frontier = frontierOf(state);
    const branchId = `br-${reasoningClaimIdOf(input.cellId, input.question).slice(3)}`;
    const ref = materializeReasoningBranchRef({ cellId: input.cellId, branchId });
    const branch: ReasoningBranch = Object.freeze({
      schemaVersion: 1 as const,
      ref,
      question: input.question,
      attribution: input.attribution ?? null,
      atFrontier: frontier.basis,
    });
    // Blind-until-commit: the brief carries the ACCEPTED FRONTIER ONLY (frozen).
    const brief: ReasoningBranchBrief = Object.freeze({
      schemaVersion: 1 as const,
      cell: reasoningCellRefOf(input.cellId),
      branch: ref,
      objective: state.definition.objective,
      question: input.question,
      frontierBasis: frontier.basis,
      acceptedClaims: Object.freeze(frontier.active.map((claim) => claim.ref)),
    });
    await append(input.cellId, [eventRequest("BRANCH_OPENED", input.cellId, { branch, brief })]);
    return Object.freeze({ branch, brief });
  }

  async function closeBranch(input: { readonly cellId: string; readonly branchId: string; readonly reason: string }): Promise<void> {
    const state = await requireState(input.cellId);
    requireOpen(state, "close a branch");
    const record = state.branches.get(input.branchId);
    if (record === undefined) fail("unknown_branch", `branch "${input.branchId}" does not exist`);
    if (record.closed) return;
    if (input.reason.trim() === "") fail("invalid_registration", "close reason must be a non-empty string");
    await append(input.cellId, [eventRequest("BRANCH_CLOSED", input.cellId, { branchId: input.branchId, reason: input.reason })]);
  }

  async function branchBrief(input: { readonly cellId: string; readonly branchId: string }): Promise<ReasoningBranchBrief> {
    const state = await requireState(input.cellId);
    const record = state.branches.get(input.branchId);
    if (record === undefined) fail("unknown_branch", `branch "${input.branchId}" does not exist`);
    return record.brief;
  }

  async function submitCandidate(input: {
    readonly cellId: string;
    readonly branchId: string;
    readonly type: ReasoningClaimTypeRef;
    readonly content: unknown;
    readonly dependencies?: readonly ReasoningClaimRef[] | undefined;
    readonly externalEvidenceRefs?: readonly ExternalEvidenceRef[] | undefined;
  }): Promise<{ readonly candidate: ReasoningCandidate; readonly status: CandidateStatus }> {
    const state = await requireState(input.cellId);
    requireOpen(state, "submit a candidate");
    const branch = state.branches.get(input.branchId);
    if (branch === undefined) fail("unknown_branch", `branch "${input.branchId}" does not exist`);
    if (branch.closed) fail("branch_closed", `branch "${input.branchId}" is CLOSED`);
    let claim: ReasoningClaim;
    try {
      claim = materializeReasoningClaim(input.cellId, { type: input.type, content: input.content, dependencies: input.dependencies ?? [] }, types);
    } catch (error) {
      wrapClaimError(error);
    }
    // Dependencies may only reference currently ACTIVE admitted claims (§23/§49).
    const frontier = frontierOf(state);
    const activeIds = new Set(frontier.active.map((entry) => entry.ref.claimId));
    for (const dependency of claim.dependencies) {
      if (!activeIds.has(dependency.claimId)) {
        fail("invalid_dependency", `claim dependency "${dependency.claimId}" is not a currently ACTIVE admitted claim`);
      }
    }
    const externalEvidenceRefs = Object.freeze([...(input.externalEvidenceRefs ?? [])].map((entry) => Object.freeze({ evidenceId: rcStableId(entry.evidenceId, "externalEvidenceRefs[].evidenceId") })));
    const base = {
      schemaVersion: 1 as const,
      cell: reasoningCellRefOf(input.cellId),
      branch: branch.branch.ref,
      branchFrontierBasis: branch.branch.atFrontier,
      claim,
      externalEvidenceRefs,
    };
    const candidate: ReasoningCandidate = Object.freeze({ ...base, candidateDigest: reasoningCandidateDigestOf(base) });
    const claimId = reasoningClaimIdOf(input.cellId, claim.claimDigest);
    const existing = state.claims.get(claimId);
    const events: { eventId: string; type: ReasoningEvent["type"]; payload: unknown }[] = [eventRequest("CANDIDATE_SUBMITTED", input.cellId, { candidate })];
    if (existing !== undefined) {
      events.push(eventRequest("CANDIDATE_DEDUPLICATED", input.cellId, { candidateDigest: candidate.candidateDigest, existingClaimId: claimId }));
      await append(input.cellId, events);
      return Object.freeze({ candidate, status: "DEDUPLICATED" as const });
    }
    await append(input.cellId, events);
    return Object.freeze({ candidate, status: "PENDING" as const });
  }

  async function evaluateCandidate(input: { readonly cellId: string; readonly candidateDigest: string }): Promise<EvaluationOutcome> {
    const state = await requireState(input.cellId);
    requireOpen(state, "evaluate a candidate");
    const record = state.candidates.get(input.candidateDigest);
    if (record === undefined) fail("unknown_candidate", `candidate "${input.candidateDigest}" does not exist in this cell`);
    if (record.status === "ADMITTED") {
      const claimId = reasoningClaimIdOf(input.cellId, record.candidate.claim.claimDigest);
      return Object.freeze({ status: "admitted" as const, candidateDigest: record.candidate.candidateDigest, claimId, frontierBasis: frontierOf(state).basis });
    }
    if (record.status === "REJECTED") return Object.freeze({ status: "rejected" as const, candidateDigest: input.candidateDigest, frontierBasis: frontierOf(state).basis });
    if (record.status === "DEDUPLICATED") return Object.freeze({ status: "deduplicated" as const, candidateDigest: input.candidateDigest, existingClaimId: record.existingClaimId! });

    // Duplicate semantic claim convergence (§33): a claim identity already admitted anywhere in
    // this cell is NEVER admitted a second time; the candidate provenance is retained.
    const duplicateClaimId = reasoningClaimIdOf(input.cellId, record.candidate.claim.claimDigest);
    if (state.claims.has(duplicateClaimId)) {
      await append(input.cellId, [eventRequest("CANDIDATE_DEDUPLICATED", input.cellId, { candidateDigest: record.candidate.candidateDigest, existingClaimId: duplicateClaimId })]);
      return Object.freeze({ status: "deduplicated" as const, candidateDigest: input.candidateDigest, existingClaimId: duplicateClaimId });
    }

    // Dependencies must still be ACTIVE at the CURRENT frontier.
    const before = frontierOf(state);
    const activeIds = new Set(before.active.map((entry) => entry.ref.claimId));
    for (const dependency of record.candidate.claim.dependencies) {
      if (!activeIds.has(dependency.claimId)) return { status: "blocked", detail: `dependency "${dependency.claimId}" is no longer active` };
    }

    let verification: ReasoningVerificationResult;
    try {
      const raw = await deps.verificationPolicy.verify({ definition: state.definition, candidate: record.candidate, frontierClaims: before.active, frontierBasis: before.basis });
      verification = parseReasoningVerificationResult(raw);
    } catch (error) {
      if (error instanceof ReasoningStoreError) throw error;
      return { status: "verification_error", detail: `verification could not be completed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const verificationBound =
      verification.cell.cellId === input.cellId &&
      verification.candidateDigest === record.candidate.candidateDigest &&
      verification.verificationPolicyRef.policyId === state.definition.verificationPolicyRef.policyId &&
      verification.verificationPolicyRef.version === state.definition.verificationPolicyRef.version &&
      frontierBasesEqual(verification.frontierBasis, before.basis);
    if (!verificationBound) return { status: "invalid_evaluation", detail: "the verification result is not bound to this cell/candidate/policy/current frontier" };

    // Freshness: the frontier must not have moved since verification.
    const afterVerification = await requireState(input.cellId);
    const frontierAfterVerification = frontierOf(afterVerification);
    if (!frontierBasesEqual(frontierAfterVerification.basis, before.basis)) return { status: "stale_evaluation", detail: "the accepted frontier changed during verification — re-evaluate" };

    let decision: ReasoningAdmissionDecision;
    try {
      const raw = await deps.admissionPolicy.admit({ definition: state.definition, candidate: record.candidate, verification, frontierClaims: before.active, frontierBasis: before.basis });
      decision = parseReasoningAdmissionDecision(raw);
    } catch (error) {
      if (error instanceof ReasoningStoreError) throw error;
      return { status: "verification_error", detail: `admission could not be completed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const decisionBound =
      decision.cell.cellId === input.cellId &&
      decision.candidateDigest === record.candidate.candidateDigest &&
      decision.verificationResultDigest === verification.digest &&
      decision.admissionPolicyRef.policyId === state.definition.admissionPolicyRef.policyId &&
      decision.admissionPolicyRef.version === state.definition.admissionPolicyRef.version &&
      frontierBasesEqual(decision.frontierBasis, before.basis);
    if (!decisionBound) return { status: "invalid_evaluation", detail: "the admission decision is not bound to this cell/candidate/verification/policy/current frontier" };

    // Final commit freshness: zero frontier writes if the frontier moved.
    const afterDecision = await requireState(input.cellId);
    const frontierAfterDecision = frontierOf(afterDecision);
    if (!frontierBasesEqual(frontierAfterDecision.basis, before.basis)) return { status: "stale_evaluation", detail: "the accepted frontier changed before the admission commit — re-evaluate" };

    const claimId = reasoningClaimIdOf(input.cellId, record.candidate.claim.claimDigest);
    const verificationEvent = eventRequest("VERIFICATION_RECORDED", input.cellId, { verification });
    const decisionEvent = eventRequest("ADMISSION_DECIDED", input.cellId, { decision });
    if (decision.decision === "ADMIT") {
      // §49: a dependency may have been invalidated between the freshness checks above and this commit.
      const commitState = frontierOf(afterDecision);
      const commitActive = new Set(commitState.active.map((entry) => entry.ref.claimId));
      if (record.candidate.claim.dependencies.some((dependency) => !commitActive.has(dependency.claimId))) {
        return { status: "blocked", detail: "a dependency became inactive before admission" };
      }
      const admittedAtFrontier = before.basis;
      const batch = [
        verificationEvent,
        decisionEvent,
        eventRequest("CLAIM_ADMITTED", input.cellId, { claimId, claim: record.candidate.claim, admittedAtFrontier, verificationResultDigest: verification.digest, admissionDecisionDigest: decision.digest }),
      ];
      await append(input.cellId, batch);
      const committed = await requireState(input.cellId);
      return Object.freeze({ status: "admitted" as const, candidateDigest: record.candidate.candidateDigest, claimId, frontierBasis: frontierOf(committed).basis });
    }
    if (decision.decision === "REJECT") {
      await append(input.cellId, [verificationEvent, decisionEvent, eventRequest("CANDIDATE_REJECTED", input.cellId, { candidateDigest: record.candidate.candidateDigest, decisionDigest: decision.digest })]);
      return Object.freeze({ status: "rejected" as const, candidateDigest: record.candidate.candidateDigest, frontierBasis: frontierAfterDecision.basis });
    }
    await append(input.cellId, [verificationEvent, decisionEvent]);
    return Object.freeze({ status: "unresolved" as const, candidateDigest: record.candidate.candidateDigest, frontierBasis: frontierAfterDecision.basis });
  }

  async function requestInvalidation(input: { readonly cellId: string; readonly targetClaimId: string; readonly reason: string }): Promise<InvalidationOutcome> {
    const state = await requireState(input.cellId);
    requireOpen(state, "request an invalidation");
    const targetRecord = state.claims.get(input.targetClaimId);
    if (targetRecord === undefined) return { status: "not_admitted", detail: `claim "${input.targetClaimId}" was never admitted` };
    if (state.rootInvalidated.has(input.targetClaimId)) return Object.freeze({ status: "already_invalidated" as const, claimId: input.targetClaimId });
    const before = frontierOf(state);
    const target = Object.freeze({ ref: reasoningClaimRefOf(input.cellId, targetRecord.claim), claim: targetRecord.claim });
    const requestBase = { schemaVersion: 1 as const, cell: reasoningCellRefOf(input.cellId), targetClaimId: input.targetClaimId, frontierBasis: before.basis, reason: input.reason };
    if (input.reason.trim() === "") fail("invalid_registration", "invalidation reason must be a non-empty string");
    const request = Object.freeze({ ...requestBase, requestDigest: claimInvalidationRequestDigestOf(requestBase) });

    if (deps.verificationPolicy.verifyInvalidation === undefined) return { status: "verification_error", detail: "no invalidation verification is configured" };
    let verification: InvalidationVerificationResult;
    try {
      const raw = await deps.verificationPolicy.verifyInvalidation({ definition: state.definition, target, request, frontierClaims: before.active, frontierBasis: before.basis });
      verification = parseInvalidationVerificationResult(raw);
    } catch (error) {
      return { status: "verification_error", detail: `invalidation verification could not be completed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const verificationBound =
      verification.cell.cellId === input.cellId &&
      verification.targetClaimId === input.targetClaimId &&
      verification.requestDigest === request.requestDigest &&
      frontierBasesEqual(verification.frontierBasis, before.basis);
    if (!verificationBound) return { status: "invalid_evaluation", detail: "the invalidation verification is not bound to this cell/target/request/current frontier" };

    const afterVerification = await requireState(input.cellId);
    if (!frontierBasesEqual(frontierOf(afterVerification).basis, before.basis)) return { status: "stale_evaluation", detail: "the accepted frontier changed during invalidation verification" };

    if (deps.admissionPolicy.admitInvalidation === undefined) return { status: "verification_error", detail: "no invalidation admission is configured" };
    let decision: InvalidationAdmissionDecision;
    try {
      const raw = await deps.admissionPolicy.admitInvalidation({ definition: state.definition, target, request, verification, frontierClaims: before.active, frontierBasis: before.basis });
      decision = parseInvalidationAdmissionDecision(raw);
    } catch (error) {
      return { status: "verification_error", detail: `invalidation admission could not be completed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const decisionBound =
      decision.cell.cellId === input.cellId &&
      decision.targetClaimId === input.targetClaimId &&
      decision.requestDigest === request.requestDigest &&
      decision.verificationResultDigest === verification.digest &&
      frontierBasesEqual(decision.frontierBasis, before.basis);
    if (!decisionBound) return { status: "invalid_evaluation", detail: "the invalidation decision is not bound to this cell/target/verification/current frontier" };

    const afterDecision = await requireState(input.cellId);
    const frontierAfterDecision = frontierOf(afterDecision);
    if (!frontierBasesEqual(frontierAfterDecision.basis, before.basis)) return { status: "stale_evaluation", detail: "the accepted frontier changed before the invalidation commit" };

    const batch = [
      eventRequest("CLAIM_INVALIDATION_REQUESTED", input.cellId, { request }),
      eventRequest("INVALIDATION_VERIFICATION_RECORDED", input.cellId, { verification }),
      eventRequest("INVALIDATION_DECIDED", input.cellId, { decision }),
    ];
    if (decision.decision === "INVALIDATE") batch.push(eventRequest("CLAIM_INVALIDATED", input.cellId, { claimId: input.targetClaimId, requestDigest: request.requestDigest, decisionDigest: decision.digest }));
    await append(input.cellId, batch);
    if (decision.decision !== "INVALIDATE") {
      return Object.freeze({ status: decision.decision === "KEEP" ? ("kept" as const) : ("unresolved" as const), claimId: input.targetClaimId, frontierBasis: frontierAfterDecision.basis });
    }
    const committed = await requireState(input.cellId);
    const after = frontierOf(committed);
    return Object.freeze({ status: "invalidated" as const, claimId: input.targetClaimId, frontierBasis: after.basis, inactiveClaimIds: after.inactive });
  }

  async function frontier(input: { readonly cellId: string }): Promise<ReasoningFrontierView> {
    const state = await requireState(input.cellId);
    const view = frontierOf(state);
    return Object.freeze({ basis: view.basis, claims: view.active });
  }

  async function activeClaims(input: { readonly cellId: string }): Promise<readonly AdmittedClaimView[]> {
    return (await frontier(input)).claims;
  }

  async function claimGraph(input: { readonly cellId: string }): Promise<ReasoningClaimGraphView> {
    const state = await requireState(input.cellId);
    const view = frontierOf(state);
    const inactive = new Set(view.inactive);
    const nodes = admittedClaimIds(state).map((claimId) => {
      const record = state.claims.get(claimId)!;
      return Object.freeze({ ref: reasoningClaimRefOf(input.cellId, record.claim), claim: record.claim, active: !inactive.has(claimId) });
    });
    const edges: { dependent: ReasoningClaimRef; dependency: ReasoningClaimRef }[] = [];
    for (const node of nodes) {
      for (const dependency of node.claim.dependencies) edges.push(Object.freeze({ dependent: node.ref, dependency }));
    }
    return Object.freeze({ basis: view.basis, nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
  }

  async function cellView(input: { readonly cellId: string }): Promise<ReasoningCellView> {
    const state = await requireState(input.cellId);
    const basis = await deps.store.basis(input.cellId);
    if (basis === undefined) fail("unknown_cell", `reasoning cell "${input.cellId}" does not exist`);
    const view = frontierOf(state);
    const inactive = new Set(view.inactive);
    return Object.freeze({
      definition: state.definition,
      lifecycle: state.lifecycle,
      storeBasis: basis,
      frontierBasis: view.basis,
      branches: Object.freeze([...state.branches.values()].map((record) => Object.freeze({ ref: record.branch.ref, question: record.branch.question, closed: record.closed, atFrontier: record.branch.atFrontier }))),
      candidates: Object.freeze(
        [...state.candidates.values()].map((record) => Object.freeze({ candidateDigest: record.candidate.candidateDigest, branchId: record.candidate.branch.branchId, status: record.status })).sort((a, b) => (a.candidateDigest < b.candidateDigest ? -1 : 1)),
      ),
      admittedClaimIds: admittedClaimIds(state),
      activeClaimIds: Object.freeze(view.active.map((entry) => entry.ref.claimId)),
      inactiveClaimIds: view.inactive,
      rootInvalidatedClaimIds: Object.freeze([...state.rootInvalidated].sort()),
    });
  }

  async function events(input: { readonly cellId: string }): Promise<readonly ReasoningEvent[]> {
    return deps.store.replay(input.cellId);
  }

  return {
    openCell,
    closeCell,
    listCells: () => deps.store.cells(),
    openBranch,
    closeBranch,
    branchBrief,
    submitCandidate,
    evaluateCandidate,
    requestInvalidation,
    frontier,
    activeClaims,
    claimGraph,
    cellView,
    events,
  };
}

