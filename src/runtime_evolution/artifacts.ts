/**
 * G10-M Runtime Structural Evolution — candidate / authority vocabulary.
 *
 *   RuntimeScope topology evolution ≠ Organization transformation
 *   ENCAPSULATE ≠ Organization SPLIT        COLLAPSE ≠ Organization MERGE
 *   Proposal ≠ Candidate ≠ Assessment ≠ Authority ≠ Activation
 *
 * A runtime topology mutation is NEVER expressed as a `CompleteEvolutionCandidate`
 * (that vocabulary carries F3 OrganizationTransformation semantics). It has its own
 * strictly-parsed tagged union: ENCAPSULATE | COLLAPSE | RETIRE_SCOPE.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { RuntimeScopeBasis, RuntimeScopeDefinition, RuntimeScopeMember } from "../runtime_scope/index.js";
import {
  parseRuntimeScopeBasis,
  parseRuntimeScopeDefinition,
  parseRuntimeScopeMember,
} from "../runtime_scope/index.js";
import type { RuntimeScopeRef } from "../runtime_scope/index.js";
import { parseRuntimeScopeRef } from "../runtime_scope/index.js";
import type { OrganizationDynamicsProposal, ProposalImpactReport } from "../organization_dynamics/index.js";
import type { RuntimeScopeState } from "../runtime_scope/index.js";

export const RUNTIME_EVOLUTION_CANDIDATE_DOMAIN = "palimpsest.runtime-evolution-candidate.v1";
export const RUNTIME_EVOLUTION_CASE_DOMAIN = "palimpsest.runtime-evolution-case.v1";
export const RUNTIME_EVOLUTION_CHAIN_DOMAIN = "palimpsest.runtime-evolution-chain.v1";

export class RuntimeEvolutionArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeEvolutionArtifactError";
  }
}

function fail(message: string): never {
  throw new RuntimeEvolutionArtifactError(message);
}

export function reObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

export function reExactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  for (const key of keys) if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

function literal<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) fail(`${what} must be one of ${allowed.join(", ")}`);
  return value as T;
}

/* ------------------------------------------------------------------ *
 * Candidate
 * ------------------------------------------------------------------ */

export type RuntimeEvolutionTargetKind = "ENCAPSULATE" | "COLLAPSE" | "RETIRE_SCOPE";

/** An exact scope + basis pair used as a source of a structural transition. */
export interface RuntimeScopeBasisRef {
  readonly ref: RuntimeScopeRef;
  readonly basis: RuntimeScopeBasis;
}

export function parseRuntimeScopeBasisRef(raw: unknown, what = "RuntimeScopeBasisRef"): RuntimeScopeBasisRef {
  const object = reObject(raw, what);
  reExactKeys(object, ["ref", "basis"], what);
  const basis = parseRuntimeScopeBasis(object.basis, `${what}.basis`);
  const ref = parseRuntimeScopeRef(object.ref, `${what}.ref`);
  if (ref.scopeId !== basis.scopeId) fail(`${what}.ref and ${what}.basis must denote the same scope`);
  return Object.freeze({ ref, basis });
}

export interface CompleteEncapsulateCandidate {
  readonly schemaVersion: 1;
  readonly kind: "ENCAPSULATE";
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly sourceParent: RuntimeScopeBasisRef;
  readonly newChild: RuntimeScopeDefinition;
  readonly membersToMove: readonly RuntimeScopeMember[];
  readonly compilerProvenance: string;
  readonly digest: string;
}

export interface CompleteCollapseCandidate {
  readonly schemaVersion: 1;
  readonly kind: "COLLAPSE";
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly child: RuntimeScopeBasisRef;
  readonly parent: RuntimeScopeBasisRef;
  readonly compilerProvenance: string;
  readonly digest: string;
}

export interface CompleteRetireCandidate {
  readonly schemaVersion: 1;
  readonly kind: "RETIRE_SCOPE";
  readonly proposalDigest: string;
  readonly proposalBasisDigest: string;
  readonly scope: RuntimeScopeBasisRef;
  readonly compilerProvenance: string;
  readonly digest: string;
}

export type CompleteRuntimeEvolutionCandidate = CompleteEncapsulateCandidate | CompleteCollapseCandidate | CompleteRetireCandidate;

/** Distributive omit so each union member keeps its own fields. */
type CandidateBody<T> = T extends unknown ? Omit<T, "digest"> : never;
export type RuntimeEvolutionCandidateBody = CandidateBody<CompleteRuntimeEvolutionCandidate>;

export function runtimeEvolutionCandidateDigestOf(candidate: RuntimeEvolutionCandidateBody): string {
  return canonicalDigest({ domain: RUNTIME_EVOLUTION_CANDIDATE_DOMAIN, ...candidate });
}

function parseMembersToMove(raw: unknown): readonly RuntimeScopeMember[] {
  if (!Array.isArray(raw)) fail("membersToMove must be an array");
  const members = raw.map((entry) => parseRuntimeScopeMember(entry, "membersToMove[]"));
  const seen = new Set<string>();
  const key = (member: RuntimeScopeMember): string => (member.kind === "activation" ? `activation:${member.activation.activationId}` : `child_scope:${member.scope.scopeId}`);
  for (const member of members) {
    const memberKey = key(member);
    if (seen.has(memberKey)) fail(`membersToMove: duplicate member "${memberKey}"`);
    seen.add(memberKey);
  }
  if (members.length === 0) fail("membersToMove must not be empty");
  return Object.freeze(members);
}

export function parseCompleteRuntimeEvolutionCandidate(raw: unknown): CompleteRuntimeEvolutionCandidate {
  const object = reObject(raw, "CompleteRuntimeEvolutionCandidate");
  const kind = literal(object.kind, ["ENCAPSULATE", "COLLAPSE", "RETIRE_SCOPE"], "kind");
  if (object.schemaVersion !== 1) fail("CompleteRuntimeEvolutionCandidate.schemaVersion must be 1");
  let base: RuntimeEvolutionCandidateBody;
  if (kind === "ENCAPSULATE") {
    reExactKeys(object, ["schemaVersion", "kind", "proposalDigest", "proposalBasisDigest", "sourceParent", "newChild", "membersToMove", "compilerProvenance", "digest"], "EncapsulateCandidate");
    base = {
      schemaVersion: 1 as const,
      kind,
      proposalDigest: nonEmpty(object.proposalDigest, "proposalDigest"),
      proposalBasisDigest: nonEmpty(object.proposalBasisDigest, "proposalBasisDigest"),
      sourceParent: parseRuntimeScopeBasisRef(object.sourceParent, "sourceParent"),
      newChild: parseRuntimeScopeDefinition(object.newChild, "newChild"),
      membersToMove: parseMembersToMove(object.membersToMove),
      compilerProvenance: nonEmpty(object.compilerProvenance, "compilerProvenance"),
    };
  } else if (kind === "COLLAPSE") {
    reExactKeys(object, ["schemaVersion", "kind", "proposalDigest", "proposalBasisDigest", "child", "parent", "compilerProvenance", "digest"], "CollapseCandidate");
    base = {
      schemaVersion: 1 as const,
      kind,
      proposalDigest: nonEmpty(object.proposalDigest, "proposalDigest"),
      proposalBasisDigest: nonEmpty(object.proposalBasisDigest, "proposalBasisDigest"),
      child: parseRuntimeScopeBasisRef(object.child, "child"),
      parent: parseRuntimeScopeBasisRef(object.parent, "parent"),
      compilerProvenance: nonEmpty(object.compilerProvenance, "compilerProvenance"),
    };
  } else {
    reExactKeys(object, ["schemaVersion", "kind", "proposalDigest", "proposalBasisDigest", "scope", "compilerProvenance", "digest"], "RetireCandidate");
    base = {
      schemaVersion: 1 as const,
      kind,
      proposalDigest: nonEmpty(object.proposalDigest, "proposalDigest"),
      proposalBasisDigest: nonEmpty(object.proposalBasisDigest, "proposalBasisDigest"),
      scope: parseRuntimeScopeBasisRef(object.scope, "scope"),
      compilerProvenance: nonEmpty(object.compilerProvenance, "compilerProvenance"),
    };
  }
  const digest = nonEmpty(object.digest, "digest");
  if (digest !== runtimeEvolutionCandidateDigestOf(base)) fail("runtime evolution candidate digest does not match its content");
  return Object.freeze({ ...base, digest }) as CompleteRuntimeEvolutionCandidate;
}

/* ------------------------------------------------------------------ *
 * Compiler
 * ------------------------------------------------------------------ */

export interface RuntimeStructuralEvolutionCompilerInput {
  readonly proposal: OrganizationDynamicsProposal;
  readonly impact: ProposalImpactReport;
  /** Exact current state of the scopes the proposal concerns (source of truth for completeness). */
  readonly scopes: readonly RuntimeScopeState[];
}

/** Untrusted host-injected authoring seam. No store, authority, activation, or effects. */
export interface RuntimeStructuralEvolutionCompilerPort {
  compile(input: RuntimeStructuralEvolutionCompilerInput): Promise<unknown>;
}

/* ------------------------------------------------------------------ *
 * Authority
 * ------------------------------------------------------------------ */

export interface RuntimeStructuralEvolutionAdmissionInput {
  readonly proposalDigest: string;
  readonly candidateDigest: string;
  readonly assessmentDigest: string;
  readonly kind: RuntimeEvolutionTargetKind;
  readonly touchedScopes: readonly RuntimeScopeBasisRef[];
  readonly impact: ProposalImpactReport;
}

export type RuntimeStructuralEvolutionAuthorityOutcome =
  | { readonly outcome: "authorized" }
  | { readonly outcome: "denied"; readonly detail: string }
  | { readonly outcome: "unresolved"; readonly detail: string };

/**
 * Independent runtime-structural authority seam. It answers ONLY whether an assessed
 * runtime topology candidate may activate — never representation admission,
 * organization evolution, continuation authority, or effect authority.
 */
export interface RuntimeStructuralEvolutionAdmissionPort {
  admit(input: RuntimeStructuralEvolutionAdmissionInput): Promise<RuntimeStructuralEvolutionAuthorityOutcome>;
}

/* ------------------------------------------------------------------ *
 * Case
 * ------------------------------------------------------------------ */

export type RuntimeEvolutionCaseRef = string;

export function runtimeEvolutionCaseRefOf(input: { readonly proposalDigest: string; readonly candidateDigest: string }): RuntimeEvolutionCaseRef {
  return `re-${canonicalDigest({ domain: RUNTIME_EVOLUTION_CASE_DOMAIN, proposalDigest: input.proposalDigest, candidateDigest: input.candidateDigest }).slice(0, 24)}`;
}

export type RuntimeEvolutionEventType =
  | "RUNTIME_EVOLUTION_CASE_OPENED"
  | "RUNTIME_EVOLUTION_CANDIDATE_COMPILED"
  | "RUNTIME_EVOLUTION_ASSESSED"
  | "RUNTIME_EVOLUTION_BLOCKED"
  | "RUNTIME_EVOLUTION_AUTHORIZED"
  | "RUNTIME_EVOLUTION_DENIED"
  | "RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED"
  | "RUNTIME_EVOLUTION_ACTIVATED"
  | "RUNTIME_EVOLUTION_POST_OBSERVED"
  | "RUNTIME_EVOLUTION_CLOSED";

export type RuntimeEvolutionCaseState =
  | "PROPOSED"
  | "COMPILED"
  | "BLOCKED"
  | "DENIED"
  | "AUTHORITY_UNRESOLVED"
  | "AUTHORIZED"
  | "ACTIVATED"
  | "POST_OBSERVED"
  | "CLOSED";

export type RuntimeEvolutionEventPayloadParser = (payload: unknown) => unknown;
export type RuntimeEvolutionEventParsers = Readonly<Record<string, RuntimeEvolutionEventPayloadParser>>;

export const RUNTIME_EVOLUTION_EVENT_PARSERS: RuntimeEvolutionEventParsers = Object.freeze({
  RUNTIME_EVOLUTION_CASE_OPENED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_CASE_OPENED");
    reExactKeys(o, ["proposalDigest", "subjectKey"], "RUNTIME_EVOLUTION_CASE_OPENED");
    return Object.freeze({ proposalDigest: nonEmpty(o.proposalDigest, "proposalDigest"), subjectKey: nonEmpty(o.subjectKey, "subjectKey") });
  },
  RUNTIME_EVOLUTION_CANDIDATE_COMPILED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_CANDIDATE_COMPILED");
    reExactKeys(o, ["candidate"], "RUNTIME_EVOLUTION_CANDIDATE_COMPILED");
    return Object.freeze({ candidate: parseCompleteRuntimeEvolutionCandidate(o.candidate) });
  },
  RUNTIME_EVOLUTION_ASSESSED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_ASSESSED");
    reExactKeys(o, ["kind", "status", "assessmentDigest", "obligations"], "RUNTIME_EVOLUTION_ASSESSED");
    if (!Array.isArray(o.obligations)) fail("obligations must be an array");
    return Object.freeze({
      kind: literal(o.kind, ["ENCAPSULATE", "COLLAPSE", "RETIRE_SCOPE"], "kind"),
      status: literal(o.status, ["admissible", "blocked"], "status"),
      assessmentDigest: nonEmpty(o.assessmentDigest, "assessmentDigest"),
      obligations: Object.freeze(
        o.obligations.map((entry) => {
          const item = reObject(entry, "obligation");
          reExactKeys(item, ["obligationId", "kind", "status", "detail"], "obligation");
          return Object.freeze({
            obligationId: nonEmpty(item.obligationId, "obligationId"),
            kind: nonEmpty(item.kind, "kind"),
            status: literal(item.status, ["satisfied", "unresolved"], "status"),
            detail: nonEmpty(item.detail, "detail"),
          });
        }),
      ),
    });
  },
  RUNTIME_EVOLUTION_BLOCKED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_BLOCKED");
    reExactKeys(o, ["unresolvedObligations"], "RUNTIME_EVOLUTION_BLOCKED");
    if (!Array.isArray(o.unresolvedObligations)) fail("unresolvedObligations must be an array");
    return Object.freeze({ unresolvedObligations: Object.freeze(o.unresolvedObligations.map((entry) => nonEmpty(entry, "obligationId"))) });
  },
  RUNTIME_EVOLUTION_AUTHORIZED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_AUTHORIZED");
    reExactKeys(o, ["candidateDigest", "assessmentDigest"], "RUNTIME_EVOLUTION_AUTHORIZED");
    return Object.freeze({ candidateDigest: nonEmpty(o.candidateDigest, "candidateDigest"), assessmentDigest: nonEmpty(o.assessmentDigest, "assessmentDigest") });
  },
  RUNTIME_EVOLUTION_DENIED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_DENIED");
    reExactKeys(o, ["detail"], "RUNTIME_EVOLUTION_DENIED");
    return Object.freeze({ detail: nonEmpty(o.detail, "detail") });
  },
  RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED");
    reExactKeys(o, ["detail"], "RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED");
    return Object.freeze({ detail: nonEmpty(o.detail, "detail") });
  },
  RUNTIME_EVOLUTION_ACTIVATED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_ACTIVATED");
    reExactKeys(o, ["kind", "touchedScopes", "createdScopes"], "RUNTIME_EVOLUTION_ACTIVATED");
    if (!Array.isArray(o.touchedScopes) || !Array.isArray(o.createdScopes)) fail("touchedScopes/createdScopes must be arrays");
    return Object.freeze({
      kind: literal(o.kind, ["ENCAPSULATE", "COLLAPSE", "RETIRE_SCOPE"], "kind"),
      touchedScopes: Object.freeze(o.touchedScopes.map((entry) => parseRuntimeScopeRef(entry, "touchedScopes[]"))),
      createdScopes: Object.freeze(o.createdScopes.map((entry) => parseRuntimeScopeRef(entry, "createdScopes[]"))),
    });
  },
  RUNTIME_EVOLUTION_POST_OBSERVED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_POST_OBSERVED");
    reExactKeys(o, ["beforeSnapshotDigest", "afterSnapshotDigest"], "RUNTIME_EVOLUTION_POST_OBSERVED");
    return Object.freeze({ beforeSnapshotDigest: nonEmpty(o.beforeSnapshotDigest, "beforeSnapshotDigest"), afterSnapshotDigest: nonEmpty(o.afterSnapshotDigest, "afterSnapshotDigest") });
  },
  RUNTIME_EVOLUTION_CLOSED: (payload: unknown) => {
    const o = reObject(payload, "RUNTIME_EVOLUTION_CLOSED");
    reExactKeys(o, ["reason"], "RUNTIME_EVOLUTION_CLOSED");
    return Object.freeze({ reason: nonEmpty(o.reason, "reason") });
  },
});

export function runtimeEvolutionChainDigest(input: {
  readonly caseRef: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: RUNTIME_EVOLUTION_CHAIN_DOMAIN,
    caseRef: input.caseRef,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/* ------------------------------------------------------------------ *
 * Routing / disposition matrix
 * ------------------------------------------------------------------ */

export type RuntimeProposalDisposition = "EXECUTABLE_RUNTIME" | "ROUTED_ORGANIZATION_RETIREMENT" | "UNSUPPORTED_SUBJECT";

/**
 * G10-M routing matrix. `subjectKind` is
 * "runtime_scope" | "organization" | "boundary_workspace".
 */
export function runtimeDispositionFor(proposalKind: string, subjectKind: string): RuntimeProposalDisposition {
  if (proposalKind === "ENCAPSULATE_RUNTIME_SCOPE" || proposalKind === "COLLAPSE_RUNTIME_STRUCTURE") {
    return subjectKind === "runtime_scope" ? "EXECUTABLE_RUNTIME" : "UNSUPPORTED_SUBJECT";
  }
  if (proposalKind === "DISSOLVE_OR_RETIRE_CANDIDATE") {
    if (subjectKind === "runtime_scope") return "EXECUTABLE_RUNTIME";
    if (subjectKind === "organization") return "ROUTED_ORGANIZATION_RETIREMENT";
    return "UNSUPPORTED_SUBJECT";
  }
  return "UNSUPPORTED_SUBJECT";
}

export const RUNTIME_KIND_TO_TARGET: Readonly<Record<string, RuntimeEvolutionTargetKind>> = Object.freeze({
  ENCAPSULATE_RUNTIME_SCOPE: "ENCAPSULATE",
  COLLAPSE_RUNTIME_STRUCTURE: "COLLAPSE",
  DISSOLVE_OR_RETIRE_CANDIDATE: "RETIRE_SCOPE",
});

