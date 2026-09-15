/**
 * G10-T CF-T-02 — evidence-grounded Explore extraction.
 *
 *   SelectorOnly access   EvidenceRef ⊆ allowlist   Extraction ≠ Publication
 *
 * This is the EXECUTION-layer seam that lets an EPHEMERAL Explore branch reason
 * over the EXACT materialized bytes of recorded evidence selections. It is NOT
 * ReasoningCell canonical truth: the context built here is opaque to the cell
 * (the cell only ever sees structured candidate claims and opaque evidence ids).
 *
 * FAIL CLOSED, ALWAYS:
 *   - an unknown evidence id or unavailable source content throws (never an empty
 *     or whole-source context);
 *   - a branch-supplied evidence ref outside the allowlist is a structural
 *     violation (`EvidenceAllowlistViolation`), so a branch can never cite
 *     unrelated evidence;
 *   - the service never verifies with the proof plane, never publishes, and never
 *     approves disclosure — it only submits/evaluates reasoning candidates.
 *
 * BINARY SAFETY: for a non-textual media type the branch receives a placeholder
 * (digest + byte count), NEVER raw binary in a prompt.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { ReasoningBranchExecutionPort } from "../reasoning_cell/branch_execution.js";
import { REASONING_STATEMENT_TYPE } from "../reasoning_cell/claims.js";
import type { ReasoningPolicyRef } from "../reasoning_cell/ref.js";
import type { ReasoningCellService } from "../reasoning_cell/service.js";
import type { MaterializationKind } from "./materialize_selector.js";
import { materializeSelection } from "./materialize_selector.js";
import type { ProofEvidenceService } from "./service.js";
import type { ProofSourceContentPort } from "./source_content_port.js";

export const EVIDENCE_BOUND_CONTEXT_DOMAIN = "palimpsest.proof.evidence-bound-reasoning-context.v1";
export const EVIDENCE_EXTRACTION_CELL_DOMAIN = "palimpsest.proof.evidence-extraction-cell.v1";

/** Policy refs used only when the execution layer opens a cell on the caller's behalf. */
export const EVIDENCE_EXTRACTION_VERIFICATION_POLICY: ReasoningPolicyRef = Object.freeze({
  policyId: "evidence.extraction.verification",
  version: "v1",
});
export const EVIDENCE_EXTRACTION_ADMISSION_POLICY: ReasoningPolicyRef = Object.freeze({
  policyId: "evidence.extraction.admission",
  version: "v1",
});

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type EvidenceExtractionErrorKind = "unknown_evidence" | "content_unavailable" | "selection_mismatch";

export class EvidenceExtractionError extends Error {
  constructor(
    readonly kind: EvidenceExtractionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceExtractionError";
  }
}

/** Thrown when a branch cites an evidence id the frozen allowlist does not permit. */
export class EvidenceAllowlistViolation extends Error {
  constructor(
    readonly disallowedRefs: readonly string[],
    message: string,
  ) {
    super(message);
    this.name = "EvidenceAllowlistViolation";
  }
}

/* ------------------------------------------------------------------ *
 * Evidence-bound reasoning context (EXECUTION layer, not canonical truth)
 * ------------------------------------------------------------------ */

export interface EvidenceBoundSelection {
  readonly evidenceId: string;
  readonly kind: MaterializationKind;
  readonly mediaType: string;
  readonly digest: string;
  /** The materialized selection decoded as UTF-8, or a safe placeholder for binary media. */
  readonly text: string;
}

export interface EvidenceBoundReasoningContext {
  readonly schemaVersion: 1;
  readonly allowedEvidenceRefs: readonly { readonly evidenceId: string }[];
  readonly sourceAccessPolicy: "SELECTOR_ONLY";
  readonly selections: readonly EvidenceBoundSelection[];
  readonly digest: string;
}

function isTextualMediaType(mediaType: string): boolean {
  const normalized = mediaType.split(";")[0]!.trim().toLowerCase();
  return normalized.startsWith("text/") || normalized === "application/json" || normalized.endsWith("+json") || normalized === "application/x-ndjson";
}

function binaryPlaceholder(input: { readonly evidenceId: string; readonly kind: MaterializationKind; readonly mediaType: string; readonly byteLength: number; readonly digest: string }): string {
  return `<binary ${input.kind} selection: mediaType=${input.mediaType}, bytes=${input.byteLength}, sha256=${input.digest}>`;
}

/**
 * Resolve each evidence item + its source revision + content, materialize by its
 * recorded selector, and digest the resulting context. Unknown evidence or
 * unavailable content fails closed (throws) — it never yields a partial context.
 */
export async function buildEvidenceBoundReasoningContext(
  deps: { readonly proof: ProofEvidenceService; readonly content: ProofSourceContentPort },
  input: { readonly evidenceIds: readonly string[] },
): Promise<EvidenceBoundReasoningContext> {
  const ids = Object.freeze([...new Set(input.evidenceIds)].sort());
  const selections: EvidenceBoundSelection[] = [];

  for (const evidenceId of ids) {
    const item = await deps.proof.evidence(evidenceId);
    if (item === undefined) throw new EvidenceExtractionError("unknown_evidence", `evidence "${evidenceId}" is not recorded on the proof plane`);
    const revision = await deps.proof.sourceRevision(item.sourceRevision);
    if (revision === undefined) {
      throw new EvidenceExtractionError("content_unavailable", `the source revision selected by evidence "${evidenceId}" is not recorded`);
    }
    let content: Uint8Array | undefined;
    try {
      content = await deps.content.readContent({
        sourceId: item.sourceRevision.sourceId,
        revision: item.sourceRevision.revision,
        contentDigest: item.sourceRevision.contentDigest,
      });
    } catch (error) {
      throw new EvidenceExtractionError("content_unavailable", `content for evidence "${evidenceId}" could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (content === undefined) {
      throw new EvidenceExtractionError("content_unavailable", `content for evidence "${evidenceId}" is unavailable (explicit selector-only read returned nothing)`);
    }
    const materialized = materializeSelection({ evidence: item, sourceRevision: revision, content });
    if (materialized.contentDigest !== item.selectionDigest) {
      throw new EvidenceExtractionError(
        "selection_mismatch",
        `the materialized selection for evidence "${evidenceId}" does not reproduce its recorded selection digest`,
      );
    }
    const text = isTextualMediaType(materialized.mediaType)
      ? new TextDecoder().decode(materialized.bytes)
      : binaryPlaceholder({ evidenceId, kind: materialized.kind, mediaType: materialized.mediaType, byteLength: materialized.bytes.length, digest: materialized.contentDigest });
    selections.push(
      Object.freeze({
        evidenceId,
        kind: materialized.kind,
        mediaType: materialized.mediaType,
        digest: materialized.contentDigest,
        text,
      }),
    );
  }

  const allowedEvidenceRefs = Object.freeze(ids.map((evidenceId) => Object.freeze({ evidenceId })));
  const frozenSelections = Object.freeze(selections);
  const digest = canonicalDigest({
    domain: EVIDENCE_BOUND_CONTEXT_DOMAIN,
    schemaVersion: 1,
    allowedEvidenceRefs,
    sourceAccessPolicy: "SELECTOR_ONLY",
    selections: frozenSelections.map((selection) => ({
      evidenceId: selection.evidenceId,
      kind: selection.kind,
      mediaType: selection.mediaType,
      digest: selection.digest,
      text: selection.text,
    })),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    allowedEvidenceRefs,
    sourceAccessPolicy: "SELECTOR_ONLY" as const,
    selections: frozenSelections,
    digest,
  });
}

/**
 * Structural allowlist guard. Throws `EvidenceAllowlistViolation` when ANY ref is
 * outside the allowlist. Used by both the service path and the host.
 */
export function assertEvidenceRefsAllowlisted(allowlist: readonly string[], refs: readonly string[]): void {
  const allowed = new Set(allowlist);
  const disallowed = [...new Set(refs.filter((ref) => !allowed.has(ref)))].sort();
  if (disallowed.length > 0) {
    throw new EvidenceAllowlistViolation(disallowed, `candidate cited evidence outside the frozen allowlist: ${disallowed.join(", ")}`);
  }
}

/* ------------------------------------------------------------------ *
 * Extraction service
 * ------------------------------------------------------------------ */

export interface AnalyzeEvidenceOutcome {
  readonly status: "analyzed" | "capability_required" | "blocked";
  readonly cellId?: string;
  readonly branchCount?: number;
  readonly admittedClaimIds?: readonly string[];
  readonly candidateDigests?: readonly string[];
  readonly detail?: string;
}

export interface EvidenceExtractionService {
  analyzeEvidence(input: { readonly evidenceIds: readonly string[]; readonly objective: string; readonly branchCount?: number }): Promise<AnalyzeEvidenceOutcome>;
}

interface NormalizedBranchOutput {
  readonly status: string;
  readonly statement?: string;
  readonly evidenceRefs: readonly string[];
  readonly candidateDigest?: string;
  readonly detail?: string;
}

function normalizeEvidenceRefs(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return Object.freeze([]);
  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry === "string" && entry.length > 0) out.add(entry);
    else if (typeof entry === "object" && entry !== null && typeof (entry as { readonly evidenceId?: unknown }).evidenceId === "string") {
      const evidenceId = (entry as { readonly evidenceId: string }).evidenceId;
      if (evidenceId.length > 0) out.add(evidenceId);
    }
  }
  return Object.freeze([...out].sort());
}

/** Normalize whatever an (untrusted) branch execution returned into a readable shape. */
function normalizeBranchOutput(output: unknown): NormalizedBranchOutput {
  const object = typeof output === "object" && output !== null && !Array.isArray(output) ? (output as Record<string, unknown>) : undefined;
  const statement =
    object !== undefined && typeof object.statement === "string" && object.statement.trim() !== ""
      ? object.statement
      : typeof output === "string" && output.trim() !== ""
        ? output
        : undefined;
  const status = object !== undefined && typeof object.status === "string" ? object.status : statement === undefined ? "failed" : "completed";
  const evidenceRefs = normalizeEvidenceRefs(object?.evidenceRefs);
  const candidateDigest = object !== undefined && typeof object.candidateDigest === "string" && object.candidateDigest.length > 0 ? object.candidateDigest : undefined;
  const detail = object !== undefined && typeof object.detail === "string" && object.detail.trim() !== "" ? object.detail : undefined;
  return {
    status,
    ...(statement === undefined ? {} : { statement }),
    evidenceRefs,
    ...(candidateDigest === undefined ? {} : { candidateDigest }),
    ...(detail === undefined ? {} : { detail }),
  };
}

function derivedCellId(objective: string, evidenceIds: readonly string[]): string {
  return `extract-${canonicalDigest({ domain: EVIDENCE_EXTRACTION_CELL_DOMAIN, objective, evidenceIds: [...evidenceIds].sort() }).slice(0, 32)}`;
}

function capabilityRequired(capability: string, detail: string): AnalyzeEvidenceOutcome {
  return Object.freeze({ status: "capability_required" as const, detail: `${capability}: ${detail}` });
}

export interface EvidenceExtractionDeps {
  readonly proof: ProofEvidenceService;
  readonly reasoning?: ReasoningCellService | undefined;
  readonly branchExecution?: ReasoningBranchExecutionPort | undefined;
  readonly content?: ProofSourceContentPort | undefined;
  readonly clock?: (() => string) | undefined;
}

/**
 * Build the evidence-grounded extraction service. Wiring is honest: a missing
 * reasoning cell / branch execution / content port yields `capability_required`,
 * and an unbuildable context yields `blocked` — never a fabricated analysis.
 */
export function makeEvidenceExtractionService(deps: EvidenceExtractionDeps): EvidenceExtractionService {
  return Object.freeze({
    async analyzeEvidence(input: {
      readonly evidenceIds: readonly string[];
      readonly objective: string;
      readonly branchCount?: number;
    }): Promise<AnalyzeEvidenceOutcome> {
      const evidenceIds = [...new Set(input.evidenceIds)];
      if (evidenceIds.length === 0) return Object.freeze({ status: "blocked" as const, detail: "at least one evidence id is required" });
      if (input.objective.trim() === "") return Object.freeze({ status: "blocked" as const, detail: "an objective is required" });
      if (deps.reasoning === undefined) return capabilityRequired("reasoning_cell", "no ReasoningCellService is configured for extraction");
      if (deps.branchExecution === undefined) return capabilityRequired("branch_execution", "no ReasoningBranchExecutionPort is configured for extraction");
      if (deps.content === undefined) return capabilityRequired("source_content", "no source content port is configured for extraction");

      let context: EvidenceBoundReasoningContext;
      try {
        context = await buildEvidenceBoundReasoningContext({ proof: deps.proof, content: deps.content }, { evidenceIds });
      } catch (error) {
        return Object.freeze({
          status: "blocked" as const,
          detail: `evidence context could not be built: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      const cellId = derivedCellId(input.objective, evidenceIds);
      try {
        await deps.reasoning.openCell({
          cellId,
          objective: input.objective,
          verificationPolicyRef: EVIDENCE_EXTRACTION_VERIFICATION_POLICY,
          admissionPolicyRef: EVIDENCE_EXTRACTION_ADMISSION_POLICY,
        });
      } catch (error) {
        return Object.freeze({ status: "blocked" as const, cellId, detail: `reasoning cell could not be opened: ${error instanceof Error ? error.message : String(error)}` });
      }

      const count = Math.max(1, input.branchCount ?? 2);
      const branches: { readonly branchId: string; readonly brief: unknown }[] = [];
      try {
        // ALL branches are opened BEFORE any evaluation so every branch is opened
        // against the SAME frozen accepted frontier.
        for (let index = 0; index < count; index += 1) {
          const question = `Which admissible claim does the allowed evidence support for the objective: ${input.objective} [branch ${index + 1}/${count}]`;
          const opened = await deps.reasoning.openBranch({ cellId, question });
          branches.push(Object.freeze({ branchId: opened.branch.ref.branchId, brief: opened.brief }));
        }
      } catch (error) {
        return Object.freeze({ status: "blocked" as const, cellId, detail: `reasoning branches could not be opened: ${error instanceof Error ? error.message : String(error)}` });
      }

      const admittedClaimIds: string[] = [];
      const candidateDigests: string[] = [];
      let executed = 0;

      for (const branch of branches) {
        let output: unknown;
        try {
          output = await deps.branchExecution.run({ brief: branch.brief, evidenceContext: context });
        } catch {
          // A host failure is an unresolved branch, never a fabricated claim.
          continue;
        }
        executed += 1;
        const normalized = normalizeBranchOutput(output);
        // Structural enforcement: refs ⊆ allowlist. A violation blocks the WHOLE
        // analysis rather than silently dropping the branch.
        try {
          assertEvidenceRefsAllowlisted(evidenceIds, normalized.evidenceRefs);
        } catch (error) {
          return Object.freeze({
            status: "blocked" as const,
            cellId,
            branchCount: executed,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        if (normalized.status !== "completed" || normalized.statement === undefined) continue;

        const submitted = await deps.reasoning.submitCandidate({
          cellId,
          branchId: branch.branchId,
          type: REASONING_STATEMENT_TYPE,
          content: { statement: normalized.statement },
          externalEvidenceRefs: normalized.evidenceRefs.map((evidenceId) => Object.freeze({ evidenceId })),
        });
        candidateDigests.push(submitted.candidate.candidateDigest);
        if (submitted.status !== "PENDING") continue; // DEDUPLICATED converges on an existing claim.

        const evaluation = await deps.reasoning.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
        if (evaluation.status === "admitted") admittedClaimIds.push(evaluation.claimId);
      }

      return Object.freeze({
        status: "analyzed" as const,
        cellId,
        branchCount: executed,
        admittedClaimIds: Object.freeze(admittedClaimIds),
        candidateDigests: Object.freeze(candidateDigests),
      });
    },
  });
}
