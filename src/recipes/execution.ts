/**
 * G10-S recipe execution — the DESCRIPTIVE compiled plan meets EXISTING governed
 * services.
 *
 *   Execution ≠ Authority      Branch execution ≠ PeerRef ≠ PersistentPoint
 *   CandidateClaim ≠ AcceptedClaim      Verification ≠ Admission
 *
 * This layer owns no store and no mutator beyond the injected services. EXPLORE
 * opens a ReasoningCell (only when the caller did not supply one), opens N branches
 * against the SAME accepted frontier, runs the injected host branch execution port,
 * submits structured candidates through the REAL ReasoningCell service, and lets
 * that service evaluate them — it never admits a claim directly and never bypasses
 * verification. A branch stays ephemeral: this layer creates NO PeerRef and NO
 * PersistentPoint. COORDINATE surfaces an existing independent peer set and never
 * accepts a commitment or boundary revision, and never creates a peer.
 */

import type { FederationService } from "../federation/federation_service.js";
import type { PeerRef } from "../federation/peer.js";
import type { ReasoningBranchBrief } from "../reasoning_cell/artifacts.js";
import { REASONING_STATEMENT_TYPE } from "../reasoning_cell/claims.js";
import type { ReasoningPolicyRef } from "../reasoning_cell/ref.js";
import type { ReasoningCellService } from "../reasoning_cell/service.js";
import type { ExperimentValidatorPort } from "../experiment/validators.js";
import type { CompiledRecipePlan, CompiledStep } from "./artifacts.js";

/**
 * Structural port satisfied by the real DSH branch runner. `brief` is opaque on
 * purpose: this layer never inspects chain-of-thought, and a branch produces only
 * an external result that is then turned into a structured candidate.
 */
export interface ReasoningBranchExecutionPort {
  readonly adapterId: string;
  run(input: { readonly brief: unknown; readonly executionBudget?: unknown }): Promise<unknown>;
}

export interface RecipeExecutionDeps {
  readonly localPeer: PeerRef;
  readonly reasoning?: ReasoningCellService | undefined;
  readonly branchExecution?: ReasoningBranchExecutionPort | undefined;
  readonly federation?: FederationService | undefined;
  readonly validators?: readonly ExperimentValidatorPort[] | undefined;
  readonly campaign?: unknown;
}

export interface RecipeExecutionContext {
  readonly cellId?: string | undefined;
  readonly branchQuestion?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export type RecipeExecutionOutcome =
  | { readonly status: "reused_principal" }
  | {
      readonly status: "explored";
      readonly cellId: string;
      readonly branchIds: readonly string[];
      readonly admittedClaimIds: readonly string[];
      /** Candidate evaluations that did not yield a new admission and were not a clean rejection. */
      readonly unresolved: number;
      readonly branchExecutions: number;
    }
  | { readonly status: "coordination_surfaced"; readonly contactNeedId?: string; readonly peerRefs: readonly PeerRef[] }
  | { readonly status: "capability_required"; readonly capability: string; readonly detail: string };

export interface RecipeExecutionService {
  execute(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeExecutionOutcome>;
}

/**
 * Policy refs used only when opening a cell on the caller's behalf. The configured
 * ReasoningCellService verification/admission policies must emit results bound to
 * these refs; otherwise evaluateCandidate will honestly report an invalid evaluation.
 */
const RECIPE_VERIFICATION_POLICY: ReasoningPolicyRef = Object.freeze({ policyId: "recipe.explore.verification", version: "v1" });
const RECIPE_ADMISSION_POLICY: ReasoningPolicyRef = Object.freeze({ policyId: "recipe.explore.admission", version: "v1" });

function capabilityRequired(capability: string, detail: string): RecipeExecutionOutcome {
  return Object.freeze({ status: "capability_required" as const, capability, detail });
}

function stepOf<K extends CompiledStep["kind"]>(
  compiled: CompiledRecipePlan,
  kind: K,
): Extract<CompiledStep, { readonly kind: K }> | undefined {
  return compiled.steps.find((step): step is Extract<CompiledStep, { readonly kind: K }> => step.kind === kind);
}

function derivedCellId(planDigest: string): string {
  return `recipe-${planDigest.slice(0, 32)}`;
}

/** Extract a structured statement from an opaque branch result; unknown shapes stay unresolved. */
function statementFromOutput(output: unknown): string | undefined {
  if (typeof output === "string") {
    return output.trim() === "" ? undefined : output;
  }
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    const statement = (output as { readonly statement?: unknown }).statement;
    if (typeof statement === "string" && statement.trim() !== "") return statement;
  }
  return undefined;
}

export function makeRecipeExecutionService(deps: RecipeExecutionDeps): RecipeExecutionService {
  async function executeExplore(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeExecutionOutcome> {
    const step = stepOf(compiled, "open_reasoning_cell");
    if (step === undefined) return capabilityRequired("reasoning_cell", "compiled EXPLORE plan has no open_reasoning_cell step");
    const reasoning = deps.reasoning;
    if (reasoning === undefined) return capabilityRequired("reasoning_cell", "no ReasoningCellService is configured");
    const branchExecution = deps.branchExecution;
    if (branchExecution === undefined) return capabilityRequired("branch_execution", "no ReasoningBranchExecutionPort is configured");

    const cellId = context.cellId ?? derivedCellId(compiled.planDigest);
    if (context.cellId === undefined) {
      // Deterministic definition (objective = compiled question), so opening is idempotent.
      await reasoning.openCell({
        cellId,
        objective: step.question,
        verificationPolicyRef: RECIPE_VERIFICATION_POLICY,
        admissionPolicyRef: RECIPE_ADMISSION_POLICY,
      });
    }

    const branchQuestion = context.branchQuestion ?? step.question;
    const branchIds: string[] = [];
    const admittedClaimIds: string[] = [];
    let unresolved = 0;
    let branchExecutions = 0;

    // All branches are opened sequentially with NO admission in between, so each is
    // opened against the SAME frozen accepted frontier.
    for (let index = 0; index < step.branchCount; index += 1) {
      if (context.signal?.aborted === true) break;
      const question = step.branchCount === 1 ? branchQuestion : `${branchQuestion} [branch ${index + 1}/${step.branchCount}]`;
      const opened = await reasoning.openBranch({ cellId, question });
      branchIds.push(opened.branch.ref.branchId);
      const brief: ReasoningBranchBrief = await reasoning.branchBrief({ cellId, branchId: opened.branch.ref.branchId });

      let output: unknown;
      try {
        output = await branchExecution.run({ brief });
      } catch {
        // A host branch failure is an unresolved branch, never a fabricated claim.
        unresolved += 1;
        continue;
      }
      branchExecutions += 1;

      const statement = statementFromOutput(output);
      if (statement === undefined) {
        unresolved += 1;
        continue;
      }
      const submitted = await reasoning.submitCandidate({
        cellId,
        branchId: opened.branch.ref.branchId,
        type: REASONING_STATEMENT_TYPE,
        content: { statement },
      });
      if (submitted.status !== "PENDING") continue; // DEDUPLICATED converges on an existing claim.

      const evaluation = await reasoning.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
      if (evaluation.status === "admitted") {
        admittedClaimIds.push(evaluation.claimId);
      } else {
        // rejected / unresolved / blocked / stale / verification error all stay honest.
        unresolved += 1;
      }
    }

    return Object.freeze({
      status: "explored" as const,
      cellId,
      branchIds: Object.freeze(branchIds),
      admittedClaimIds: Object.freeze(admittedClaimIds),
      unresolved,
      branchExecutions,
    });
  }

  async function executeCoordinate(compiled: CompiledRecipePlan): Promise<RecipeExecutionOutcome> {
    const step = stepOf(compiled, "surface_contact_need") ?? stepOf(compiled, "prepare_boundary_context");
    if (step === undefined) return capabilityRequired("federation_contact", "compiled COORDINATE plan has no contact step");
    const peerRefs = step.peerRefs;
    // Surfacing references EXISTING peers only. Declaring a ContactNeed requires an
    // explicit, pre-existing origin that this descriptive layer must not invent; the
    // caller (or the federation service) owns that. No commitment, boundary revision,
    // or peer identity is created here.
    return Object.freeze({ status: "coordination_surfaced" as const, peerRefs });
  }

  return {
    async execute(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeExecutionOutcome> {
      switch (compiled.baseMode) {
        case "FOCUS":
          return Object.freeze({ status: "reused_principal" as const });
        case "EXPLORE":
          return executeExplore(compiled, context);
        case "COORDINATE":
          return executeCoordinate(compiled);
      }
    },
  };
}
