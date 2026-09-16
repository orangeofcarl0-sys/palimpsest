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
 *
 * G10-AD §18: a plan containing the VERIFY modifier no longer ignores it. The BASE
 * mode runs first, and THEN the exact current Project Head is verified through the
 * Project Verification runtime:
 *
 *   FOCUS+VERIFY       replay the principal, then verify the current project head
 *   EXPLORE+VERIFY     ReasoningCell keeps its OWN verification/admission; the
 *                      project-head verification afterwards is about the PROJECT
 *                      HEAD, never about the reasoning claims
 *   COORDINATE+VERIFY  the coordination step still only surfaces EXISTING peers;
 *                      verification checks the project head and accepts NO
 *                      commitment
 *
 *   VerificationResult ≠ ReasoningAdmission ≠ ProofPublication ≠ WorkEvidence
 *
 * With no verification runtime configured the plan returns `capability_required`
 * (the compiled plan declared a capability this deployment does not have) — never
 * a fake success. A runtime that exists but produces no recorded run leaves the
 * base outcome visible and carries a typed unresolved reason.
 */

import type { FederationService } from "../federation/federation_service.js";
import type { PeerRef } from "../federation/peer.js";
import { projectVerificationRunRef } from "../project_verification/artifacts.js";
import type { ReasoningBranchBrief } from "../reasoning_cell/artifacts.js";
import { REASONING_STATEMENT_TYPE } from "../reasoning_cell/claims.js";
import type { ReasoningPolicyRef } from "../reasoning_cell/ref.js";
import type { ReasoningCellService } from "../reasoning_cell/service.js";
import type { ExperimentValidatorPort } from "../experiment/validators.js";
import type { CompiledRecipePlan, CompiledStep } from "./artifacts.js";
import { PROJECT_DEFAULT_VERIFIER_REF } from "./compiler.js";

/**
 * Structural port satisfied by the real DSH branch runner. `brief` is opaque on
 * purpose: this layer never inspects chain-of-thought, and a branch produces only
 * an external result that is then turned into a structured candidate.
 */
export interface ReasoningBranchExecutionPort {
  readonly adapterId: string;
  run(input: { readonly brief: unknown; readonly executionBudget?: unknown }): Promise<unknown>;
}

/* -------------------------------------------------------------------------- *
 * G10-AD §18: the project-head verification port
 * -------------------------------------------------------------------------- */

/**
 * The ONE run shape this layer reads back. The real `ProjectVerificationRun`
 * (and the real `ProjectVerificationOutcome`) are structurally assignable, so the
 * install passes `installed.verification.service` directly — this layer never
 * copies the verification plane's semantics, and it can never mint a verdict.
 */
export interface RecipeVerificationRunSummary {
  readonly runId: string;
  readonly verifierRef: string;
  readonly verdict: string | null;
  readonly status: string;
  readonly freshness: string;
  readonly independence: string;
}

export interface RecipeProjectVerificationOutcome {
  readonly status: "recorded" | "blocked";
  readonly typedReasonCode: string;
  readonly detail: string;
  readonly run: RecipeVerificationRunSummary | null;
}

/**
 * The narrow execution seam. It verifies ONLY the exact current ProjectIR head
 * under a REGISTERED verifier protocol; the caller may select a registered ref
 * (or leave it unresolved so the deployment default applies) and can never inject
 * a command, a commit or an independence class.
 */
export interface RecipeProjectVerificationPort {
  verifyCurrentHead(input: {
    readonly verifierRef?: string | undefined;
    readonly requestedBy: string;
    readonly reason: string;
    readonly signal?: AbortSignal | undefined;
  }): Promise<RecipeProjectVerificationOutcome>;
}

/**
 * Resolved at CALL time. The install composes the Project Verification runtime
 * after the recipe execution service (the verification runtime itself is composed
 * with the operating stores), so a thunk is the honest way to hand over the live
 * port without pretending it existed at construction.
 */
export type RecipeProjectVerificationProvider =
  | RecipeProjectVerificationPort
  | (() => RecipeProjectVerificationPort | undefined);

/** The verification result a completed recipe outcome carries (§18, additive). */
export interface RecipeVerificationSummary {
  readonly verifierRef: string;
  readonly runId: string;
  /** §21: the canonical/product ref of the durable run. */
  readonly runRef: string;
  readonly verdict: string | null;
  readonly status: string;
  readonly freshness: string;
  readonly independence: string;
  readonly detail: string;
}

/** A VERIFY step that was instructed but produced NO recorded run (§18). */
export interface RecipeVerificationUnresolved {
  readonly typedReasonCode: string;
  readonly detail: string;
}

export interface RecipeExecutionDeps {
  readonly localPeer: PeerRef;
  readonly reasoning?: ReasoningCellService | undefined;
  readonly branchExecution?: ReasoningBranchExecutionPort | undefined;
  readonly federation?: FederationService | undefined;
  readonly validators?: readonly ExperimentValidatorPort[] | undefined;
  readonly campaign?: unknown;
  /** G10-AD §18: the Project Verification runtime, when the install composed one. */
  readonly verification?: RecipeProjectVerificationProvider | undefined;
}

export interface RecipeExecutionContext {
  readonly cellId?: string | undefined;
  readonly branchQuestion?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The base-mode outcomes: what the mode itself did, before any VERIFY step. */
export type RecipeBaseOutcome =
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
  | { readonly status: "coordination_surfaced"; readonly contactNeedId?: string; readonly peerRefs: readonly PeerRef[] };

/** The base outcome plus the additive §18 verification result, when one ran. */
export type RecipeCompletedOutcome = RecipeBaseOutcome & {
  readonly verification?: RecipeVerificationSummary | undefined;
  readonly verificationUnresolved?: RecipeVerificationUnresolved | undefined;
};

/** What a base-mode helper may return: it ran, or a capability it needs is absent. */
export type RecipeModeOutcome =
  | RecipeBaseOutcome
  | { readonly status: "capability_required"; readonly capability: string; readonly detail: string };

export type RecipeExecutionOutcome =
  | RecipeCompletedOutcome
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
  async function executeExplore(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeModeOutcome> {
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

  async function executeCoordinate(compiled: CompiledRecipePlan): Promise<RecipeModeOutcome> {
    const step = stepOf(compiled, "surface_contact_need") ?? stepOf(compiled, "prepare_boundary_context");
    if (step === undefined) return capabilityRequired("federation_contact", "compiled COORDINATE plan has no contact step");
    const peerRefs = step.peerRefs;
    // Surfacing references EXISTING peers only. Declaring a ContactNeed requires an
    // explicit, pre-existing origin that this descriptive layer must not invent; the
    // caller (or the federation service) owns that. No commitment, boundary revision,
    // or peer identity is created here.
    return Object.freeze({ status: "coordination_surfaced" as const, peerRefs });
  }

  /** Resolve the §18 verification port at CALL time (see the provider type). */
  function resolveVerificationPort(): RecipeProjectVerificationPort | undefined {
    const configured = deps.verification;
    if (configured === undefined) return undefined;
    return typeof configured === "function" ? configured() : configured;
  }

  /**
   * G10-AD §18: verify ONLY the exact current Project Head under the registered
   * protocol the compiled plan bound. The result is additive metadata on the base
   * outcome; it can never admit a claim, publish proof or write Work Evidence.
   */
  async function verifyProjectHead(
    base: RecipeBaseOutcome,
    compiled: CompiledRecipePlan,
    step: Extract<CompiledStep, { readonly kind: "bind_verification" }>,
    context: RecipeExecutionContext,
  ): Promise<RecipeCompletedOutcome> {
    const port = resolveVerificationPort();
    if (port === undefined) {
      // Unreachable through `execute` (the port is resolved before the base mode
      // runs), kept total for a caller that invokes this helper directly.
      return Object.freeze({
        ...base,
        verificationUnresolved: Object.freeze({
          typedReasonCode: "verification_runtime_unavailable",
          detail: "no Project Verification runtime is configured for this installation",
        }),
      });
    }
    // `project-default` is resolved by the RUNTIME against its registry: an absent
    // verifier is never silently bound to an invented ref.
    const selected = step.verifierRef === PROJECT_DEFAULT_VERIFIER_REF ? undefined : step.verifierRef;
    try {
      const outcome = await port.verifyCurrentHead({
        ...(selected === undefined ? {} : { verifierRef: selected }),
        requestedBy: "recipe:execution",
        reason: `recipe ${compiled.baseMode}+VERIFY over the exact current project head`,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
      if (outcome.status !== "recorded" || outcome.run === null) {
        // The runtime refused to execute (an unregistered ref, a head that is not
        // materialized, no bound runtime). The base outcome stays visible and the
        // verification is honestly UNRESOLVED - never a fabricated success.
        return Object.freeze({
          ...base,
          verificationUnresolved: Object.freeze({
            typedReasonCode: outcome.typedReasonCode,
            detail: outcome.detail,
          }),
        });
      }
      const run = outcome.run;
      return Object.freeze({
        ...base,
        verification: Object.freeze({
          verifierRef: run.verifierRef,
          runId: run.runId,
          runRef: projectVerificationRunRef(run.runId),
          verdict: run.verdict,
          status: run.status,
          freshness: run.freshness,
          independence: run.independence,
          detail: outcome.detail,
        }),
      });
    } catch (error) {
      // An infrastructure fault is UNRESOLVED, never a verdict and never a success.
      return Object.freeze({
        ...base,
        verificationUnresolved: Object.freeze({
          typedReasonCode: "verification_runtime_error",
          detail: `the verification runtime threw before a run could be recorded: ${error instanceof Error ? error.message : String(error)}`,
        }),
      });
    }
  }

  return {
    async execute(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeExecutionOutcome> {
      const verificationInstructed = compiled.modifiers.includes("VERIFY");
      const verificationStep = verificationInstructed
        ? stepOf(compiled, "bind_verification")
        : undefined;
      if (verificationInstructed && verificationStep === undefined) {
        return capabilityRequired(
          "project.verification",
          "the compiled plan declares VERIFY but carries no bind_verification step, so no registered protocol is named",
        );
      }
      if (verificationInstructed && resolveVerificationPort() === undefined) {
        // §18: no fake success. The mode asked for the project-head verification
        // capability and this deployment does not have it.
        return capabilityRequired(
          "project.verification",
          "no Project Verification runtime is configured; a registered, versioned verifier protocol cannot execute here",
        );
      }

      let base: RecipeModeOutcome;
      switch (compiled.baseMode) {
        case "FOCUS":
          base = Object.freeze({ status: "reused_principal" as const });
          break;
        case "EXPLORE":
          base = await executeExplore(compiled, context);
          break;
        case "COORDINATE":
          base = await executeCoordinate(compiled);
          break;
      }
      if (base.status === "capability_required") return base;
      if (verificationStep === undefined) return base;
      return verifyProjectHead(base, compiled, verificationStep, context);
    },
  };
}
