/**
 * UX-A §18/§19/§20/§28/§29 — the user-facing projection of a collaboration run.
 *
 *   CollaborationResult != Evidence        CollaborationResult != ProofClaim
 *   CollaborationResult != Decision        CollaborationFinding != Truth
 *   PASS (protocol passed) != the world is true
 *
 * This module owns NO store and NO authority: every field is DERIVED from an
 * existing owner's own read (the accepted ReasoningCell frontier, the recipe
 * outcome, the Project Verification run summary). It is a projection, and it is
 * deliberately the only thing a user has to read: primary copy answers the five
 * §18 questions, and the ids live under `details` (§18: "branch/cell/run ids go
 * under `details`, not primary UX").
 *
 * §19/UXA-N16: NO chain-of-thought can be projected here because the kernel has
 * no such field. The accepted frontier carries ADMITTED CLAIMS ONLY; branch
 * briefs, sibling candidates, scratchpads and cell events are never read into a
 * finding, and this file imports no store so it could not do so by accident.
 */

import type { AdmittedClaimView } from "../reasoning_cell/service.js";
import type { ReasoningClaimTypeRef } from "../reasoning_cell/claims.js";
import type { RecipeVerificationSummary } from "../recipes/execution.js";
import type { CollaborationExecutionKind } from "./intent.js";

/* ------------------------------------------------------------------ *
 * Findings (§19) and their EXPLORATORY standing (§13)
 * ------------------------------------------------------------------ */

/**
 * UX-C §13/SC-10: the mandated sentence for ANY reasoning-cell finding in a
 * user-facing result. A cell-local admitted claim is a structured hypothesis — it
 * is never Evidence, Proof, truth, a commitment or authority, regardless of how
 * strong the cell's own verification policy is. The user must read this, not infer
 * it from architecture docs.
 */
export const EXPLORATORY_FINDING_NOTE =
  "These are exploratory cell-local findings. They are not Evidence and were not independently verified as true.";

/**
 * The typed standing of a result's findings. `EXPLORATORY_CELL_LOCAL` is the ONLY
 * value today: an admitted claim is a hypothesis for collaborative composition, so
 * no result may claim a stronger standing without a finding-specific verifier.
 */
export const EXPLORATORY_CELL_LOCAL = "EXPLORATORY_CELL_LOCAL" as const;
export type CollaborationFindingStanding = typeof EXPLORATORY_CELL_LOCAL;

export interface CollaborationFinding {
  readonly claimId: string;
  /** The claim TYPE ref (typeId + version) — a structured label, not prose. */
  readonly type: ReasoningClaimTypeRef;
  /** The claim's structured content, exactly as the kernel validated it. */
  readonly content: unknown;
  readonly source: "reasoning_cell";
}

/**
 * §19: derive findings from the EXISTING current accepted frontier.
 *
 * `ReasoningCellService.activeClaims(cellId)` is the currency recomputation over
 * the append-only cell history (a claim is inactive if it was root-invalidated or
 * transitively depends on an inactive claim), so this returns the admitted,
 * CURRENT claims only — never pending candidates, never rejected ones, never a
 * branch's private state.
 */
export function collaborationFindingsFrom(claims: readonly AdmittedClaimView[]): readonly CollaborationFinding[] {
  return Object.freeze(
    claims.map((entry) =>
      Object.freeze({
        claimId: entry.ref.claimId,
        type: Object.freeze({ typeId: entry.claim.type.typeId, version: entry.claim.type.version }),
        content: entry.claim.content,
        source: "reasoning_cell" as const,
      }),
    ),
  );
}

/** A bounded, plain-language rendering of one finding's content (for the summary). */
function describeFinding(finding: CollaborationFinding): string {
  const content = finding.content;
  if (typeof content === "string") return content;
  if (typeof content === "object" && content !== null && !Array.isArray(content)) {
    const statement = (content as { readonly statement?: unknown }).statement;
    if (typeof statement === "string" && statement.trim() !== "") return statement;
    const description = (content as { readonly description?: unknown }).description;
    if (typeof description === "string" && description.trim() !== "") return description;
  }
  return JSON.stringify(content) ?? String(content);
}

/* ------------------------------------------------------------------ *
 * Verification projection (§20)
 * ------------------------------------------------------------------ */

/**
 * §20: the mandated plain-language note. It is part of the RESULT, not a doc
 * comment: a user reading a PASS must be told what it is.
 */
export const VERIFICATION_PROTOCOL_NOTE =
  "PASS means the named verifier protocol passed for this exact project head; it is a protocol result, not truth, and it admits no claim, publishes no proof and grants no authority.";

export interface CollaborationVerificationView {
  readonly verifierRef: string;
  /** The canonical/product ref of the durable run. */
  readonly runRef: string;
  readonly runId: string;
  readonly verdict: string | null;
  readonly status: string;
  readonly freshness: string;
  readonly independence: string;
  readonly detail: string;
  /** §20: the mandatory "a PASS is a protocol result, not truth" statement. */
  readonly protocolNote: string;
}

/** Project the EXISTING `RecipeVerificationSummary`; no field is reinterpreted. */
export function collaborationVerificationFrom(summary: RecipeVerificationSummary): CollaborationVerificationView {
  return Object.freeze({
    verifierRef: summary.verifierRef,
    runRef: summary.runRef,
    runId: summary.runId,
    verdict: summary.verdict,
    status: summary.status,
    freshness: summary.freshness,
    independence: summary.independence,
    detail: summary.detail,
    protocolNote: VERIFICATION_PROTOCOL_NOTE,
  });
}

/* ------------------------------------------------------------------ *
 * Result (§18/§28)
 * ------------------------------------------------------------------ */

export const COLLABORATION_STATUSES = [
  "COMPLETED",
  "PRINCIPAL_CONTINUES",
  "CAPABILITY_REQUIRED",
  "CROSS_PROJECT_REQUIRED",
  "PARTIAL",
  "ERROR",
] as const;
export type CollaborationStatus = (typeof COLLABORATION_STATUSES)[number];

/**
 * §18: the ids and refs a user should NOT have to read. Everything here is
 * derived from the run; nothing here is authoritative.
 */
export interface CollaborationDetails {
  readonly cellId?: string | undefined;
  readonly branchIds: readonly string[];
  readonly branchExecutions?: number | undefined;
  readonly planId?: string | undefined;
  readonly planDigest?: string | undefined;
  /** Recipe ids the plan was built from (`focus.v1`, `explore.v1`, `verify.v1`). */
  readonly recipeIds: readonly string[];
  /** The durable run refs this request produced (currently the verification run). */
  readonly runRefs: readonly string[];
  /** `existingSubjectRefs` of a recommendation that needs another project. */
  readonly peers?: readonly string[] | undefined;
  /** The capability a `CAPABILITY_REQUIRED` outcome names. */
  readonly capability?: string | undefined;
}

export interface CollaborationResult {
  readonly status: CollaborationStatus;
  /** §24: the user-visible verb (mirrors the plan view). */
  readonly verb: string;
  readonly executionKind: CollaborationExecutionKind;
  /** §18: the five questions, in plain language. */
  readonly summary: string;
  readonly findings: readonly CollaborationFinding[];
  /**
   * UX-C §13/SC-10: the typed standing of `findings`, present iff this result
   * projects reasoning-cell findings. Always `EXPLORATORY_CELL_LOCAL`.
   */
  readonly findingStanding?: CollaborationFindingStanding | undefined;
  /** UX-C §13/SC-10: the mandated primary-text sentence for `findingStanding`. */
  readonly findingNote?: string | undefined;
  /** §18/§19: what did not converge (unresolved evaluations, a refused check). */
  readonly unresolved: readonly string[];
  /** Present iff an independent verification run was actually RECORDED. */
  readonly verification?: CollaborationVerificationView | undefined;
  /** §5 of the audit: derived availability quotes, naming the capability. */
  readonly capabilityWarnings: readonly string[];
  /** §18: ids/refs, deliberately OUT of the primary UX. */
  readonly details: CollaborationDetails;
  /** §28: the infrastructure-failure message, ONLY for `status: "ERROR"`. */
  readonly message?: string | undefined;
  /** Non-authoritative timestamp from the injected clock. */
  readonly at: string;
}

export interface CollaborationSummaryInput {
  /** What Palimpsest did, in one plain sentence. */
  readonly didWhat: string;
  /** Why that structure was chosen (the plan's own plain-language reasons). */
  readonly why: readonly string[];
  /**
   * Ids THIS request admitted, from the existing outcome. §19's projection reads the
   * cell's CURRENT accepted frontier, and a cell id is derived from the plan — so a
   * repeated request reuses the cell and its earlier claims are still in that
   * frontier. Without this count the summary told a caller that N findings "emerged"
   * from a run that admitted fewer, i.e. it took credit for pre-existing work.
   */
  readonly admittedByThisRun?: readonly string[] | undefined;
  /** How many branch host executions actually ran (for the dedup/unresolved wording). */
  readonly branchExecutions?: number | undefined;
  /**
   * TRUE only when the verification plane ESTABLISHED this run as independent
   * (`status.independentVerifierRefs` contains the protocol that actually ran).
   * Absent/FALSE ⇒ the summary states the independence class instead of asserting
   * that an independent check happened (UX-A review MAJOR-1).
   */
  readonly independentVerification?: boolean | undefined;
  readonly findings: readonly CollaborationFinding[];
  unresolved: readonly string[];
  /**
   * UX-C §13/SC-10: the exploratory-standing sentence, appended to the primary
   * summary immediately after the findings sentence when the result projects
   * reasoning-cell findings. The result ALSO carries it as a typed field.
   */
  readonly findingNote?: string | undefined;
  readonly verification?: CollaborationVerificationView | undefined;
}

/**
 * §18: compose the summary so it answers the five questions in order —
 * what happened, why this structure, what emerged, what is unresolved, and
 * whether an independent verification ran.
 */
export function collaborationSummaryOf(input: CollaborationSummaryInput): string {
  const parts: string[] = [input.didWhat];
  parts.push(input.why.length === 0 ? "The structure was chosen without an additional reason." : `Why: ${input.why.join(" ")}`);
  const findings = input.findings;
  const admitted = input.admittedByThisRun?.length ?? 0;
  const branchExecutions = input.branchExecutions ?? 0;
  const preExisting = Math.max(0, findings.length - admitted);
  if (findings.length === 0) {
    parts.push(
      branchExecutions === 0
        ? "No admitted finding emerged."
        : `${branchExecutions} branch(es) executed but admitted no new claim, so no finding emerged.`,
    );
  } else {
    parts.push(
      `${findings.length} admitted finding${findings.length === 1 ? "" : "s"} in this cell's current accepted ` +
        `frontier${admitted > 0 ? ` (${admitted} admitted by this request` : " (none admitted by this request"}` +
        `${preExisting > 0 ? `, ${preExisting} already admitted by an earlier request against the same cell` : ""}): ` +
        findings.map((finding) => `"${describeFinding(finding)}"`).join("; ") +
        ".",
    );
    // §19/§26: a deduplicated branch produces no distinct claim; saying so is more
    // honest than reporting "nothing unresolved" as if every branch had converged.
    if (branchExecutions > admitted) {
      parts.push(
        `${branchExecutions - admitted} of the ${branchExecutions} branch(es) produced no distinct claim ` +
          "(a candidate that converges on an existing claim is deduplicated, not lost).",
      );
    }
  }
  // UX-C §13: the exploratory standing of the findings is PRIMARY user-visible text.
  if (input.findingNote !== undefined) parts.push(input.findingNote);
  parts.push(input.unresolved.length === 0 ? "Nothing is left unresolved." : `Still unresolved: ${input.unresolved.join(" ")}`);
  if (input.verification === undefined) {
    parts.push("Verification did not run, so nothing about the project head is being claimed as checked.");
  } else if (input.independentVerification === true) {
    // UX-C §14: an INDEPENDENT fact, stated separately: it is about the exact current
    // Project Head, never about the exploratory findings above.
    parts.push(
      `Separately: Independent verification ran: the registered protocol "${input.verification.verifierRef}" returned ${String(
        input.verification.verdict ?? input.verification.status,
      )} for the exact current project head (freshness ${input.verification.freshness}, independence ${input.verification.independence}). This is a check of the current project head, not a verification of the exploratory findings. ${input.verification.protocolNote}`,
    );
  } else {
    // The deployment-wide availability gate only proves SOME verifier is independent;
    // a caller may name one whose own independence class does not count. Reporting
    // that as "independent verification ran" would be false, so the sentence says
    // exactly what happened.
    parts.push(
      `Separately, a verification ran, but it is NOT an independent check: the protocol "${input.verification.verifierRef}" ` +
        `returned ${String(input.verification.verdict ?? input.verification.status)} with independence ` +
        `${input.verification.independence}, which does not count as independent verification. It concerns the current project head, not the exploratory findings. ` +
        `${input.verification.protocolNote}`,
    );
  }
  return parts.join(" ");
}
