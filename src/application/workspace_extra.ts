/**
 * PC1 S03/S06 — the extra derived reads attached to the project workspace surface.
 *
 * They are separated from `project.ts` only to keep that composition cluster under its size ratchet;
 * they own no store and compose the derived continuity/domain-outcome services.
 */
import type { ProjectContinuityService } from "../project_continuity/index.js";
import type { DomainOutcomeService } from "../domain_outcome/index.js";
import { HARD_CONSTRAINT_KINDS } from "../domain/hard_constraints.js";

export interface ContinuityFaces {
  readonly continuity?: ProjectContinuityService | undefined;
  readonly domainOutcome?: DomainOutcomeService | undefined;
}

export interface WorkspaceExtraSurface {
  summary(): Promise<import("../project_continuity/index.js").ProjectSummary>;
  explain(subject: string): Promise<import("../project_continuity/index.js").ProjectExplanation>;
  contextCapsule(input?: { readonly maxBytes?: number | undefined }): Promise<import("../project_continuity/index.js").ContextCapsule>;
  outcomeContracts(): readonly { readonly contractId: string; readonly version: string; readonly question: string; readonly requiredInputs: readonly string[] }[];
  outcomeProject(): Promise<readonly import("../domain_outcome/index.js").DomainEvaluation[]>;
  evaluateOutcome(input: {
    readonly taskId: string;
    readonly contractId: string;
    readonly artifactPath?: string | null | undefined;
    readonly parameters?: Readonly<Record<string, unknown>> | undefined;
  }): Promise<import("../domain_outcome/index.js").DomainEvaluation>;
  /** R7: the closed hard-constraint vocabulary, exposed so adapters do not import the domain. */
  hardConstraintKinds(): readonly import("../domain/hard_constraints.js").HardConstraintKind[];
  /** R7: a deterministic hard-constraint check over explicit inputs. */
  checkHardConstraint(input: {
    readonly kind: import("../domain/hard_constraints.js").HardConstraintKind;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly taskId?: string | null | undefined;
  }): Promise<import("../domain/hard_constraints.js").HardConstraintResult>;
}

export function makeWorkspaceExtraSurface(deps: ContinuityFaces): WorkspaceExtraSurface {
  return {
    summary: () => {
      if (deps.continuity === undefined) throw new Error("this deployment composes no project continuity facade");
      return deps.continuity.summary();
    },
    explain: (subject) => {
      if (deps.continuity === undefined) throw new Error("this deployment composes no project continuity facade");
      return deps.continuity.explain(subject);
    },
    contextCapsule: (input) => {
      if (deps.continuity === undefined) throw new Error("this deployment composes no project continuity facade");
      return deps.continuity.contextCapsule(input);
    },
    outcomeContracts: () => {
      if (deps.domainOutcome === undefined) throw new Error("this deployment composes no domain-outcome service");
      return deps.domainOutcome.contracts();
    },
    outcomeProject: () => {
      if (deps.domainOutcome === undefined) throw new Error("this deployment composes no domain-outcome service");
      return deps.domainOutcome.project();
    },
    evaluateOutcome: (input) => {
      if (deps.domainOutcome === undefined) throw new Error("this deployment composes no domain-outcome service");
      return deps.domainOutcome.evaluate(input);
    },
    hardConstraintKinds: () => [...HARD_CONSTRAINT_KINDS],
    checkHardConstraint: (input) => {
      if (deps.domainOutcome === undefined) throw new Error("this deployment composes no domain-outcome service");
      return deps.domainOutcome.checkHardConstraint(input);
    },
  };
}
