/**
 * SR-1D R2 §7/§8/§9 — the work application-surface cluster.
 *
 * Owns BOTH the façade interfaces (WorkApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 1 dependencies it
 * actually reads (controller). Behaviour is unchanged.
 */

import type { ProjectController } from "../../tools/controller.js";
import type { HostDeploymentFactsPort } from "../common.js";
import type { ProjectStandard } from "../../domain/standard.js";
import { definePalimpsestControl } from "../../tools/control_surface.js";

/**
 * PLMP-LEAN-1 §B.15: the narrow verification face the finish composition needs. Structural on
 * purpose — the application layer composes the two owners without depending on the verification
 * plane's own types, and `ProjectController` never imports it at all.
 */
export interface FinishVerificationFace {
  readonly service: {
    verifyAttemptResult(input: { readonly attemptId: string; readonly requestedBy: string }): Promise<{
      readonly run: { readonly verdict: string | null; readonly status: string } | null;
      readonly detail: string;
    }>;
  };
}

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface WorkSurfaceDeps {
  readonly controller: ProjectController;
  /** Host facts about the running deployment; absent means no dashboard is known of. */
  readonly hostFacts?: HostDeploymentFactsPort | undefined;
  /** §B.15: present when this deployment composes an attempt-result verification runtime. */
  readonly verification?: FinishVerificationFace | undefined;
}

export interface WorkApplicationSurface {
  /**
   * Where a human can watch this project, or null when no dashboard is known.
   *
   * The agent is the primary surface, so the person it is talking to needs the way to the dashboard.
   * Only the host can answer this, and only once it has served; the adapter reports null rather than
   * inventing a url.
   */
  dashboardUrl(): string | null;
  /**
   * How the dashboard is guarded, or null when none is served. This is what makes the agent's answer
   * complete: fence ⇒ the address alone opens it; token ⇒ the person needs the handoff link, which
   * is at {@link dashboardHandoffFile} — never in this conversation.
   */
  dashboardAuth(): "fence" | "token" | null;
  /** Token mode only: the file holding the person's handoff link. Null otherwise. */
  dashboardHandoffFile(): string | null;
  /**
   * PLMP-LEAN-1 §1/§4: the project's confirmed done-ness, or null when the operator has not stated
   * one (a derivation candidate is NOT a standard). This is what lets a user-facing surface show
   * "what counts as done here" instead of asking a person to choose predicates.
   */
  standard(): ProjectStandard | undefined;
  /** The commands this deployment authorizes — the options a gate form may offer, and nothing else. */
  authorizedCommands(): readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
  /** The gate ids already declared, so a promotion control offers real ids instead of a text box. */
  declaredGateIds(): readonly string[];
  /**
   * PLMP-LEAN-1 appendix A: the agent says "this piece is done" ONCE and the product derives the
   * rest — which commands to run, what the write scope was, whether the declared artifacts exist,
   * and what the attempt's report must say. The caller supplies no attempt id, predicate, command,
   * exit code or changed-file list. Every failure leaves the attempt RUNNING.
   */
  finish(input?: { readonly summary?: string | undefined } | undefined): Promise<{
    readonly attemptId: string;
    readonly state: "COMPLETED";
    readonly changedFiles: readonly string[];
    readonly evidenceRecorded: readonly string[];
    readonly nextEvidenceNeeded: readonly string[];
    /**
     * §B.15: the verification conclusion, when this attempt's contract requires one. A verification
     * FAILURE is reported here and NEVER as a thrown error — the attempt really is COMPLETED, and
     * pretending otherwise would leave the principal editing a settled attempt.
     */
    readonly verification: {
      readonly required: boolean;
      readonly satisfied: boolean;
      readonly verdict: string | null;
      readonly detail: string | null;
    };
  }>;
  /**
   * PLMP-LEAN-1 appendix E (2A-B): the **begin** protocol, symmetric with `finish`. The agent states
   * what the work is (a goal and the write scope it intends to touch) and the product MECHANICALLY
   * establishes the single managed work position — project, task, envelope, attempt, claim — so the
   * principal can just start working. The agent never operates the scheduler and never sees an
   * attempt id. Every precondition is checked before anything is written.
   */
  begin(input: {
    readonly goal: string;
    readonly writePaths: readonly string[];
    readonly requiredArtifacts?: readonly string[] | undefined;
  }): Promise<{
    readonly state: "READY" | "RESUMED";
    readonly goal: string;
    readonly writeScope: readonly string[];
    readonly requiredArtifacts: readonly string[];
    readonly completion: {
      readonly mechanicalChecks: readonly string[];
      readonly independentVerificationRequired: boolean;
    };
  }>;
  /**
   * PLMP-LEAN-1 §5 / 2A-Q: readiness in two layers — what the DEPLOYMENT can do, and what the
   * CURRENT task requires. The deployment layer is answerable at startup; the task layer only once a
   * task exists. A deployment gap ("no independent verifier") is a task blocker only when this task
   * actually needs one, so a project is never marked NOT READY for a requirement it does not have.
   */
  completionReadiness(): import("../../domain/completion_contract.js").CompletionReadiness;
  status(): unknown;
  graph(): unknown;
  preview(): unknown;
  /** Work control verbs (pause/resume/next/run/claim/gate/report/plan/promote/holdSet/holdClear). */
  control(op: string, args: readonly unknown[]): unknown;
}

export function makeWorkSurfaces(deps: WorkSurfaceDeps): { readonly work: WorkApplicationSurface } {
    const work: WorkApplicationSurface = {
      dashboardUrl: () => deps.hostFacts?.dashboardUrl() ?? null,
      dashboardAuth: () => deps.hostFacts?.dashboardAuth() ?? null,
      dashboardHandoffFile: () => deps.hostFacts?.dashboardHandoffFile() ?? null,
      standard: () => deps.controller.standard(),
      authorizedCommands: () => deps.controller.authorizedCommands(),
      declaredGateIds: () => deps.controller.declaredGateIds(),
      finish: async (input) => {
        // The WORK half first: once this returns, the attempt really is COMPLETED.
        const completed = await deps.controller.finish(input ?? {});
        // §B.15: the two owners meet HERE, in the product layer. `ProjectController` must not import
        // Verification, so the orchestration lives in the application composition instead.
        const contract = deps.controller.completionContract(completed.attemptId);
        if (contract === null || !contract.verification.required) {
          return {
            ...completed,
            verification: { required: false, satisfied: false, verdict: null, detail: null },
          };
        }
        if (deps.verification === undefined) {
          return {
            ...completed,
            verification: {
              required: true,
              satisfied: false,
              verdict: null,
              detail:
                "this attempt's contract requires independent verification and this deployment composes no runtime for it",
            },
          };
        }
        const outcome = await deps.verification.service.verifyAttemptResult({
          attemptId: completed.attemptId,
          requestedBy: "agent:palimpsest_finish",
        });
        const verdict = outcome.run?.verdict ?? null;
        return {
          ...completed,
          verification: {
            required: true,
            satisfied: verdict === "PASS",
            verdict,
            detail: outcome.detail,
          },
        };
      },
      begin: (input) => deps.controller.begin(input),
      completionReadiness: () => deps.controller.completionReadiness(),
      status: () => deps.controller.status(),
      graph: () => deps.controller.orchestrationGraph(),
      preview: () => deps.controller.preview(),
      control: (op, args) => {
        // Reuse the existing Work control surface — Work stays Work-scoped.
        const surface = definePalimpsestControl(deps.controller) as unknown as Record<string, (...a: readonly unknown[]) => unknown>;
        const verb = surface[op];
        if (verb === undefined) throw new Error(`unknown work control verb "${op}"`);
        return verb(...args);
      },
    };


  return { work };
}
