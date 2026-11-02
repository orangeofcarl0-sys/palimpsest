/**
 * PC1 S03/S06 — the continuity/outcome composition.
 *
 * It is the ONE place that adapts the existing Work owner, the derived workspace/journal and the
 * promotion facts into the read-only continuity facade and the explicit domain-outcome service.
 * It owns no store and decides no authority; install.ts only decides to compose it.
 */
import { makeProjectContinuityService } from "../project_continuity/index.js";
import type { ProjectContinuityService } from "../project_continuity/index.js";
import { makeDomainOutcomeService } from "../domain_outcome/index.js";
import type { DomainOutcomeService } from "../domain_outcome/index.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type { ProjectIr } from "../schema/models.js";

interface ContinuityWorkOwner {
  project(): ProjectIr;
  status(): {
    revision: number;
    headCommit: string;
    schedulerState: string;
    tasks: readonly { task_id: string; state: string }[];
    attempts: readonly { attempt_id: string; task_id: string | null; state: string }[];
    evidence: readonly { evidence_id: string; status: string }[];
    promotions: readonly { promotion_id: string; state: string }[];
    promotionFence: readonly { promotion_id: string; attempt_id: string; task_id: string; state: string }[];
  };
  promotionFacts(): readonly {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    resultingHeadCommit: string;
  }[];
}

export interface ContinuityCompositionInput {
  readonly projectId: string;
  readonly controller: ContinuityWorkOwner;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  readonly repository?: string | undefined;
  readonly clock?: (() => string) | undefined;
  readonly operatorIntentAdmission: boolean;
}

export interface ContinuityComposition {
  readonly continuity: ProjectContinuityService;
  readonly domainOutcome: DomainOutcomeService | undefined;
}

export function composeContinuityCapability(input: ContinuityCompositionInput): ContinuityComposition {
  const workspace = input.projectWorkspace;
  const domainOutcome =
    workspace === undefined
      ? undefined
      : makeDomainOutcomeService({
          workspace: {
            journal: (projectId?: string) => workspace.journal(projectId),
            recordJournalEntry: (entry) => workspace.recordJournalEntry({ ...entry, projectId: input.projectId }),
          },
          ...(input.repository === undefined ? {} : { repository: input.repository }),
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        });

  const continuity = makeProjectContinuityService({
    work: {
      project: () => input.controller.project(),
      status: () => input.controller.status(),
      promotionFacts: () => input.controller.promotionFacts(),
    },
    ...(workspace === undefined
      ? {}
      : {
          workspace: {
            journal: (projectId?: string) => workspace.journal(projectId),
            openLoops: () => workspace.openLoops(),
          },
        }),
    ...(domainOutcome === undefined
      ? {}
      : {
          outcomes: async () =>
            (await domainOutcome.project()).map((evaluation) => ({
              taskId: evaluation.taskId,
              businessOutcome: evaluation.status,
              investigationComplete: evaluation.investigationComplete,
              unmetRequirements: evaluation.unmetRequirements,
              detail: evaluation.detail,
            })),
        }),
    authority: {
      operatorIntentAdmission: input.operatorIntentAdmission,
      sourceIntake: "operator_only",
      promotion: "operator_only",
    },
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });

  return Object.freeze({ continuity, domainOutcome });
}
