/**
 * E5-P §7/§10/§11 — the AUTHORING seam, the ADMISSION seam and their consumer-owned READ ports.
 *
 *     authoring model  ≠  admission authority
 *     Candidate        ≠  Published procedure
 *
 * §7: authoring is UNTRUSTED COGNITION. `ProcedureAuthoringPort.propose` may reason about a set
 * of empirical grounds and return a method body — and nothing else. It cannot publish, grant
 * standing, associate an asset, change Work or execute anything, because none of those
 * capabilities exist on the port's shape. Its output is strict-parsed; a malformed proposal is
 * a refusal, never a partial publication.
 *
 * §10: admission is an INDEPENDENT authority. `ProcedureAdmissionPort.decide` must name the
 * EXACT candidate digest it is deciding about, so a decision cannot be replayed onto a different
 * candidate. There is deliberately no caller boolean (`published: true`), no `managementMode`
 * shortcut and no self-publication by the authoring model: the authority is the caller's and
 * its absence is reported honestly as `admission_unresolved`.
 *
 * §11: admission does NOT mean "universally optimal". It means only "this method is admitted as
 * a reusable project procedure under its recorded applicability and provenance". The decision
 * carries a note saying so, and the revision keeps the scope and limitations verbatim.
 *
 * Layer: L2 (`src/procedures/`). This module declares shapes and parsers only — it owns no
 * store, no authority and no policy.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { ProcedureGround } from "./candidate.js";
import {
  procedureDigest,
  procedureFail,
  procedureKeys,
  procedureObject,
  procedureText,
  type ProcedureContent,
} from "./content.js";

/* ------------------------------------------------------------------ *
 * §7 — the UNTRUSTED authoring seam
 * ------------------------------------------------------------------ */

/**
 * What the authoring seam is given. Both halves are READ-ONLY facts: the empirical grounds it
 * must reason from, and the project context it may tailor applicability to.
 *
 * There is deliberately no `authority`, no `publish` flag and no `scope` field: a proposal that
 * could name its own authority would make the seam an authority.
 */
export interface ProcedureAuthoringInput {
  readonly grounds: readonly ProcedureGround[];
  readonly projectContext: {
    readonly projectId: string;
    readonly projectRevision: number;
    /** The objective/requirement statements that make this project's methods specific to it. */
    readonly objective: string;
  };
}

/**
 * The proposal outcome union. `NO_PROCEDURE` is a first-class answer: experience frequently
 * teaches nothing reusable, and an authoring seam that had to invent a method would violate §6.
 * `UNRESOLVED` is the honest "I could not decide" — it is never treated as approval.
 */
export type ProcedureAuthoringResult =
  | { readonly outcome: "proposal"; readonly content: unknown }
  | { readonly outcome: "NO_PROCEDURE" }
  | { readonly outcome: "UNRESOLVED" };

export interface ProcedureAuthoringPort {
  /** Provenance label recorded on the candidate (a model id, a host, or the first-party default). */
  readonly origin: string;
  propose(input: ProcedureAuthoringInput): Promise<ProcedureAuthoringResult>;
}

/** §7: strict-parse the authoring seam's outcome. An unknown `outcome` fails closed. */
export function assertProcedureAuthoringResult(raw: unknown): ProcedureAuthoringResult {
  const object = procedureObject(raw, "ProcedureAuthoringResult");
  procedureKeys(object, ["outcome", "content"], ["outcome"], "ProcedureAuthoringResult");
  const outcome = object.outcome;
  if (outcome === "NO_PROCEDURE" || outcome === "UNRESOLVED") return Object.freeze({ outcome });
  if (outcome === "proposal") {
    if (!Object.hasOwn(object, "content") || object.content === undefined) {
      procedureFail("malformed_artifact", "ProcedureAuthoringResult.proposal must carry content");
    }
    return Object.freeze({ outcome: "proposal" as const, content: object.content });
  }
  return procedureFail("invalid_value", `ProcedureAuthoringResult.outcome must be proposal, NO_PROCEDURE or UNRESOLVED`);
}

/* ------------------------------------------------------------------ *
 * §10 — the INDEPENDENT admission seam
 * ------------------------------------------------------------------ */

export const PROCEDURE_ADMISSION_DECISIONS = ["PUBLISH", "REJECT", "UNRESOLVED"] as const;
export type ProcedureAdmissionDecision = (typeof PROCEDURE_ADMISSION_DECISIONS)[number];

export interface ProcedureAdmissionInput {
  /** The EXACT candidate digest the decision is about (§10). Never a name, never a revision. */
  readonly candidateDigest: string;
  readonly candidateId: string;
  readonly content: ProcedureContent;
  readonly empiricalGrounds: readonly ProcedureGround[];
  /**
   * §10: the validation the authority may consider. It is READ-ONLY input — the authority
   * decides, this owner does not compute a verdict.
   */
  readonly validation: {
    readonly groundsResolved: boolean;
    readonly groundCount: number;
    /** §20: an existing ACTIVE procedure this candidate would supersede, when one applies. */
    readonly supersedes?: { readonly procedureId: string; readonly revision: number; readonly digest: string } | undefined;
  };
}

export interface ProcedureAdmissionOutcome {
  readonly decision: ProcedureAdmissionDecision;
  /** The digest the authority was asked about — echoed so a mismatch is detectable (§10). */
  readonly candidateDigest: string;
  /** Why. Required for REJECT; recorded for PUBLISH so the admission is reviewable later. */
  readonly rationale: string;
  /** The authority's own policy identity, so a decision is attributable to a versioned policy. */
  readonly policyRef: { readonly policyId: string; readonly version: string };
}

export interface ProcedureAdmissionPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  decide(input: ProcedureAdmissionInput): Promise<ProcedureAdmissionOutcome>;
}

export const PROCEDURE_ADMISSION_OUTCOME_KEYS = ["decision", "candidateDigest", "rationale", "policyRef"] as const;

/** §10: strict-parse the authority's answer. A missing or mistyped decision fails closed. */
export function assertProcedureAdmissionOutcomeShape(raw: unknown): ProcedureAdmissionOutcome {
  const object = procedureObject(raw, "ProcedureAdmissionOutcome");
  procedureKeys(object, PROCEDURE_ADMISSION_OUTCOME_KEYS, PROCEDURE_ADMISSION_OUTCOME_KEYS, "ProcedureAdmissionOutcome");
  const decision = object.decision;
  if (typeof decision !== "string" || !(PROCEDURE_ADMISSION_DECISIONS as readonly string[]).includes(decision)) {
    procedureFail("invalid_value", `ProcedureAdmissionOutcome.decision must be one of ${PROCEDURE_ADMISSION_DECISIONS.join(", ")}`);
  }
  const policyRef = procedureObject(object.policyRef, "ProcedureAdmissionOutcome.policyRef");
  procedureKeys(policyRef, ["policyId", "version"], ["policyId", "version"], "ProcedureAdmissionOutcome.policyRef");
  return Object.freeze({
    decision: decision as ProcedureAdmissionDecision,
    candidateDigest: procedureDigest(object.candidateDigest, "ProcedureAdmissionOutcome.candidateDigest"),
    rationale: procedureText(object.rationale, "ProcedureAdmissionOutcome.rationale"),
    policyRef: Object.freeze({
      policyId: procedureText(policyRef.policyId, "ProcedureAdmissionOutcome.policyRef.policyId"),
      version: procedureText(policyRef.version, "ProcedureAdmissionOutcome.policyRef.version"),
    }),
  });
}

/* ------------------------------------------------------------------ *
 * §11 — the admission provenance carried on a published revision
 * ------------------------------------------------------------------ */

export const PROCEDURE_ADMISSION_PROVENANCE_DOMAIN = "palimpsest.procedures.admission.v1";

/**
 * §11: the record that a method was admitted — and the explicit statement of what admission
 * does NOT mean. `scope` and `limitations` are echoed from the content so a reader of the
 * revision never has to open the body to see the method's bounds.
 */
export interface ProcedureAdmissionProvenance {
  readonly decision: "PUBLISH";
  readonly candidateDigest: string;
  readonly policyRef: { readonly policyId: string; readonly version: string };
  readonly rationale: string;
  /** §11: admission is contextual, never a claim of universal optimality. */
  readonly admissionNote: "contextual_reusable_project_procedure_not_universal_optimum";
  readonly scope: readonly string[];
  readonly limitations: readonly string[];
  readonly provenanceDigest: string;
}

type AdmissionProvenanceIdentity = Omit<ProcedureAdmissionProvenance, "provenanceDigest">;

export function procedureAdmissionProvenanceDigestOf(identity: AdmissionProvenanceIdentity): string {
  return canonicalDigest({ domain: PROCEDURE_ADMISSION_PROVENANCE_DOMAIN, admission: identity });
}

export function materializeProcedureAdmissionProvenance(input: {
  readonly candidateDigest: string;
  readonly policyRef: { readonly policyId: string; readonly version: string };
  readonly rationale: string;
  readonly scope: readonly string[];
  readonly limitations: readonly string[];
}): ProcedureAdmissionProvenance {
  const identity: AdmissionProvenanceIdentity = Object.freeze({
    decision: "PUBLISH" as const,
    candidateDigest: procedureDigest(input.candidateDigest, "ProcedureAdmissionProvenance.candidateDigest"),
    policyRef: Object.freeze({
      policyId: procedureText(input.policyRef.policyId, "ProcedureAdmissionProvenance.policyRef.policyId"),
      version: procedureText(input.policyRef.version, "ProcedureAdmissionProvenance.policyRef.version"),
    }),
    rationale: procedureText(input.rationale, "ProcedureAdmissionProvenance.rationale"),
    admissionNote: "contextual_reusable_project_procedure_not_universal_optimum" as const,
    scope: Object.freeze([...input.scope]),
    limitations: Object.freeze([...input.limitations]),
  });
  return Object.freeze({ ...identity, provenanceDigest: procedureAdmissionProvenanceDigestOf(identity) });
}

export const PROCEDURE_ADMISSION_PROVENANCE_KEYS = [
  "decision",
  "candidateDigest",
  "policyRef",
  "rationale",
  "admissionNote",
  "scope",
  "limitations",
  "provenanceDigest",
] as const;

export function parseProcedureAdmissionProvenance(raw: unknown, what = "ProcedureAdmissionProvenance"): ProcedureAdmissionProvenance {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_ADMISSION_PROVENANCE_KEYS, PROCEDURE_ADMISSION_PROVENANCE_KEYS, what);
  if (object.decision !== "PUBLISH") procedureFail("invalid_value", `${what}.decision must be PUBLISH`);
  if (object.admissionNote !== "contextual_reusable_project_procedure_not_universal_optimum") {
    procedureFail("invalid_value", `${what}.admissionNote must state that admission is contextual, not universal`);
  }
  const policyRef = procedureObject(object.policyRef, `${what}.policyRef`);
  procedureKeys(policyRef, ["policyId", "version"], ["policyId", "version"], `${what}.policyRef`);
  const identity: AdmissionProvenanceIdentity = Object.freeze({
    decision: "PUBLISH" as const,
    candidateDigest: procedureDigest(object.candidateDigest, `${what}.candidateDigest`),
    policyRef: Object.freeze({
      policyId: procedureText(policyRef.policyId, `${what}.policyRef.policyId`),
      version: procedureText(policyRef.version, `${what}.policyRef.version`),
    }),
    rationale: procedureText(object.rationale, `${what}.rationale`),
    admissionNote: "contextual_reusable_project_procedure_not_universal_optimum" as const,
    scope: procedureStringList(object.scope, `${what}.scope`),
    limitations: procedureStringList(object.limitations, `${what}.limitations`),
  });
  const provenanceDigest = procedureDigest(object.provenanceDigest, `${what}.provenanceDigest`);
  if (procedureAdmissionProvenanceDigestOf(identity) !== provenanceDigest) {
    procedureFail("invalid_value", `${what}.provenanceDigest does not match its content`);
  }
  return Object.freeze({ ...identity, provenanceDigest });
}

function procedureStringList(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) procedureFail("malformed_artifact", `${what} must be an array`);
  const list = value as readonly unknown[];
  return Object.freeze(list.map((entry, index) => procedureText(entry, `${what}[${index}]`)));
}

/* ------------------------------------------------------------------ *
 * The consumer-owned READ ports (§6/§10) — no mutation is visible
 * ------------------------------------------------------------------ */

/**
 * §6: the EMPIRICAL GROUND read. The procedures owner must be able to prove that a referenced
 * evaluation/run/intervention still resolves, and read its exact digest — but it must NOT own
 * empirical history, so this port is read-only and narrow.
 *
 * `observe` returns `undefined` for a ref the owner does not hold: an unknown ground is a
 * refusal, never a silently accepted reference.
 */
export interface ProcedureGroundObservation {
  readonly kind: ProcedureGround["kind"];
  readonly ref: string;
  readonly digest: string;
  readonly experimentRef?: string | undefined;
  /** A short human-readable subject, for review — never authority. */
  readonly subject: string;
}

export interface ProcedureGroundPort {
  observe(kind: ProcedureGround["kind"], ref: string): Promise<ProcedureGroundObservation | undefined>;
}

/**
 * §14/§15: the PROJECT ASSOCIATION read/write port. The procedures owner does not own the
 * project↔asset link — `ProjectAssetAssociation` does — so it reaches it through this narrow
 * port, which exposes only the two operations the procedure lifecycle needs.
 */
export interface ProcedureAssociationPort {
  /** §14: is this exact revision explicitly associated with the project? */
  associated(projectId: string, procedureId: string, revision: number): Promise<boolean>;
  /** §14: associate the exact revision. Idempotent at the owner; never injects context. */
  associate(input: {
    readonly projectId: string;
    readonly procedureRef: { readonly procedureId: string; readonly revision: number; readonly digest: string };
    readonly provenance: string;
  }): Promise<void>;
}

export interface ProcedurePorts {
  /** §6: the empirical-ground READ. Absent ⇒ grounding cannot be proven and admission refuses. */
  readonly grounds?: ProcedureGroundPort | undefined;
  /** §14: the project-association read/write. Absent ⇒ `associate` honestly refuses. */
  readonly association?: ProcedureAssociationPort | undefined;
}
