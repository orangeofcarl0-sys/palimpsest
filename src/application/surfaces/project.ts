/**
 * SR-1D R2 §7/§8/§9 — the project application-surface cluster.
 *
 * Owns BOTH the façade interfaces (ProjectWorkspaceApplicationSurface, ProjectManagementApplicationSurface, MonitorApplicationSurface, VerificationApplicationSurface, ExternalAssetsApplicationSurface, ExternalAssetPrepareReferenceCommand, ExternalAssetPrepareImportCommand, ExternalAssetPreparePublicationCommand) and the constructor that
 * implements them, from a NARROW input: this module can only see the 6 dependencies it
 * actually reads (controller, externalAssets, monitor, projectManagement, projectWorkspace, verification). Behaviour is unchanged.
 */

import type { ProjectController, ProjectHeadReconciliationResult } from "../../tools/controller.js";
import type { TaskSpec } from "../../schema/models.js";
import type { AppendDecisionResult, AssociationKind, CanonicalAssetRefInput, OpenLoop, ProjectAssetAssociation, ProjectAssetKind, ProjectJournalEntry, ProjectJournalKind, ProjectJournalRef, ProjectJournalResolution, ProjectJournalViewEntry, ProjectWorkspaceService, ProjectWorkspaceView, PromoteOpportunityResult, WorkspaceHistoryEntry } from "../../project_workspace/index.js";
import type { ManagementActionCandidate, ManagementAssessment, ManagementBoundedRun, ManagementInvolvement, ManagementStepPreview, ManagementStepResult, ProjectManagementService } from "../../project_management/index.js";
import type { CampaignMonitorStatus, CampaignMonitorTickResult } from "../../monitor/index.js";
import type { ProjectVerificationOutcome, ProjectVerificationRun, ProjectVerificationService, ProjectVerificationStatus } from "../../project_verification/index.js";
import type { ProjectOperatingPostureView } from "../../project_operating/posture.js";
import type { ManagementActivityRecord } from "../../project_operating/activity.js";
import type { ProjectOperatingHistory } from "../../project_operating/history.js";
import type { ExternalAssetImportCandidate, ExternalAssetImportCommit, ExternalAssetImportPreparation, ExternalAssetInspection, ExternalAssetInspectInput, ExternalAssetPrepareImportInput, ExternalAssetPreparePublicationInput, ExternalAssetPrepareReferenceInput, ExternalAssetProviderDescriptor, ExternalAssetPublicationPreview, ExternalAssetPublicationResult, ExternalAssetReferenceCandidate, ExternalAssetReferenceCommit, ExternalAssetReferencePreparation, ExternalAssetSearchInput, ExternalAssetSearchPage } from "../../external_assets/index.js";
import type { WorkModeBaseMode, WorkModeModifier } from "../../project_operating/work_mode_profile.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface ProjectSurfaceDeps {
  readonly controller: ProjectController;
  readonly externalAssets?: ExternalAssetsApplicationSurface | undefined;
  readonly monitor?: { status(): Promise<CampaignMonitorStatus>; previewTick(): Promise<CampaignMonitorTickResult>; } | undefined;
  readonly projectManagement?: ProjectManagementService | undefined;
  readonly projectWorkspace?: ProjectWorkspaceService | undefined;
  readonly verification?: { readonly service: Pick< ProjectVerificationService, "status" | "history" | "verifyCurrentHead" >; } | undefined;
}

/**
 * G10-V: the DERIVED project workspace as seen by products. Every read re-derives from the
 * canonical owner matrix plus the two narrowly-owned append-only histories; nothing here
 * copies a canonical fact. The `projectId` inputs default to this installation's project (a
 * caller cannot address another project's history through this surface).
 */
export interface ProjectWorkspaceApplicationSurface {
  view(): Promise<ProjectWorkspaceView>;
  assets(): Promise<readonly ProjectAssetAssociation[]>;
  openLoops(): Promise<readonly OpenLoop[]>;
  history(): Promise<readonly WorkspaceHistoryEntry[]>;
  journal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]>;
  associateAsset(input: {
    readonly projectId?: string | undefined;
    readonly assetKind: ProjectAssetKind;
    readonly canonicalRef: CanonicalAssetRefInput;
    readonly associationKind: AssociationKind;
    readonly provenance: string;
  }): Promise<ProjectAssetAssociation>;
  recordJournalEntry(input: {
    readonly projectId?: string | undefined;
    readonly kind: ProjectJournalKind;
    readonly title: string;
    readonly body: string;
    readonly provenance: string;
    readonly relatedRefs?: readonly ProjectJournalRef[] | undefined;
  }): Promise<ProjectJournalEntry>;
  resolveJournalEntry(input: {
    readonly projectId?: string | undefined;
    readonly entryId: string;
    readonly resolution: ProjectJournalResolution;
  }): Promise<ProjectJournalViewEntry>;
  appendDecision(input: {
    readonly projectId?: string | undefined;
    readonly statement: string;
    readonly rationale: string;
    readonly evidenceIds: readonly string[];
    readonly supersedes?: string | undefined;
  }): Promise<AppendDecisionResult>;
  promoteOpportunity(input: {
    readonly projectId?: string | undefined;
    readonly entryId: string;
    readonly taskSpec: TaskSpec;
  }): Promise<PromoteOpportunityResult>;
}

/**
 * G10-V: graduated project-management autonomy as seen by AGENTS. It can inspect, recommend,
 * preview, execute one bounded local step, run bounded, or REQUEST a mode change. It deliberately
 * has NO `setModeUpward`/`grantAuthority`/`approveDisclosure`/`forceCommitment`: a mode is never
 * authority and the agent-facing path can never escalate its own involvement.
 */
export interface ProjectManagementApplicationSurface {
  status(): Promise<ManagementAssessment>;
  recommend(): Promise<readonly ManagementActionCandidate[]>;
  preview(): Promise<ManagementStepPreview>;
  step(input?: { readonly confirmed?: boolean | undefined }): Promise<ManagementStepResult>;
  run(input?: { readonly maxSteps?: number | undefined }): Promise<ManagementBoundedRun>;
  requestModeChange(input: { readonly to: ManagementInvolvement }): Promise<{ readonly status: "requested"; readonly detail: string }>;
  /**
   * G10-X: the mechanical project-head reconciliation (advance the ProjectIR
   * head onto the proven effect head through the ordinary revision batch). It
   * never promotes an attempt, never accepts a caller head, and is a mechanical
   * consistency step - not a plan revision and not an authority act.
   */
  reconcileProjectHead(): Promise<ProjectHeadReconciliationResult>;
  /**
   * G10-AB (additive): the DERIVED operating posture and the durable management
   * activity history. Both are read-only over non-authoritative stores, and a
   * Work Mode change is a REQUEST only - the agent-facing path never persists
   * the user-level project default.
   */
  posture(): Promise<ProjectOperatingPostureView>;
  activity(limit?: number): Promise<readonly ManagementActivityRecord[]>;
  operatingHistory(): Promise<ProjectOperatingHistory>;
  requestWorkModeChange(input: {
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
  }): Promise<{ readonly status: "requested"; readonly detail: string }>;
}

/**
 * G10-AC: the read-only monitor face. A force-tick is deliberately NOT here: the
 * operator/debug tick lives on the installed runtime only - a host calls
 * `installed.monitor.tick()` directly, never an agent-facing or
 * HTTP-authenticated surface, so no such caller can bypass the project's MONITOR
 * preference. The CLI deliberately has NO monitor command (carry-forward
 * CF-AC-01): this CLI composes no Campaign store, so there is no runtime for a
 * `palimpsest monitor ...` command to drive.
 */
export interface MonitorApplicationSurface {
  status(): Promise<CampaignMonitorStatus>;
  /** READ-ONLY: what a tick would do. Never ticks. */
  preview(): Promise<CampaignMonitorTickResult>;
}

/**
 * The explicit Project Verification face.
 *
 *   VerificationResult ≠ Truth   ≠ WorkEvidence   ≠ ProofPublication
 *   ≠ ReasoningAdmission         ≠ TaskState      ≠ Authority
 *
 * An agent/user can request verification of the CURRENT project through a
 * REGISTERED verifier and read the derived status and the append-only history. It
 * can NEVER: register a verifier, change an independence class, supply an arbitrary
 * command, or claim its own context is independent. There is deliberately no
 * `registerVerifier`/`setIndependenceClass`/`runCommand` here, and `requestedBy` is
 * filled by the surface, never supplied by the caller.
 */
export interface VerificationApplicationSurface {
  /** §13: the DERIVED current-head verification status (pure; runs no verifier). */
  status(): Promise<ProjectVerificationStatus>;
  /** §12: the append-only run history, newest first (references only). */
  history(limit?: number): Promise<readonly ProjectVerificationRun[]>;
  /**
   * §4/§14/§22: verify the EXACT current ProjectIR head under a registered
   * `verifierRef` (or the deployment default). A caller may only SELECT a
   * registered ref; an unknown ref is refused with a typed reason and nothing runs.
   */
  verifyCurrentHead(input?: {
    readonly verifierRef?: string | undefined;
    readonly reason?: string | undefined;
  }): Promise<ProjectVerificationOutcome>;
}

export interface ExternalAssetsApplicationSurface {
  /** Deployment config descriptors (capabilities). Never asset truth. */
  providers(): Promise<readonly ExternalAssetProviderDescriptor[]>;
  /** §8: an EPHEMERAL page of hits. Zero project mutation, zero persistence. */
  search(input: ExternalAssetSearchInput): Promise<ExternalAssetSearchPage>;
  /** §9: an EXACT-digest snapshot (never a silent "latest"). */
  inspect(input: ExternalAssetInspectInput): Promise<ExternalAssetInspection>;
  /** §11: a read-only reference candidate bound to the exact external digest. */
  prepareReference(input: ExternalAssetPrepareReferenceCommand): Promise<ExternalAssetReferencePreparation>;
  /** §14/§15: an explicit Journal kind + exact materialized text, read-only. */
  prepareImport(input: ExternalAssetPrepareImportCommand): Promise<ExternalAssetImportPreparation>;
  /** §20: the EXACT outbound payload, with zero external effect. */
  preparePublication(input: ExternalAssetPreparePublicationCommand): Promise<ExternalAssetPublicationPreview>;
  /** OPERATOR-EXPLICIT: one `EXTERNAL_ASSET` association (copies no content). */
  commitReference(candidate: ExternalAssetReferenceCandidate): Promise<ExternalAssetReferenceCommit>;
  /** OPERATOR-EXPLICIT: one Journal entry with structured external provenance. */
  commitImport(candidate: ExternalAssetImportCandidate): Promise<ExternalAssetImportCommit>;
  /**
   * OPERATOR-EXPLICIT approval + governed publication. The decision itself comes
   * from the separate admission port (or the call returns `NOT_APPROVED`).
   */
  approveAndPublish(preview: ExternalAssetPublicationPreview): Promise<ExternalAssetPublicationResult>;
}

export type ExternalAssetPrepareReferenceCommand = Omit<ExternalAssetPrepareReferenceInput, "projectId"> & {
  readonly projectId?: string | undefined;
};

export type ExternalAssetPrepareImportCommand = Omit<ExternalAssetPrepareImportInput, "projectId"> & {
  readonly projectId?: string | undefined;
};

export type ExternalAssetPreparePublicationCommand = Omit<ExternalAssetPreparePublicationInput, "projectId"> & {
  readonly projectId?: string | undefined;
};

export function makeProjectSurfaces(deps: ProjectSurfaceDeps): { readonly projectWorkspace: ProjectWorkspaceApplicationSurface | undefined; readonly projectManagement: ProjectManagementApplicationSurface | undefined; readonly monitor: MonitorApplicationSurface | undefined; readonly verification: VerificationApplicationSurface | undefined; readonly externalAssets: ExternalAssetsApplicationSurface | undefined } {
    const projectWorkspace: ProjectWorkspaceApplicationSurface | undefined =
      deps.projectWorkspace === undefined
        ? undefined
        : (() => {
            const service = deps.projectWorkspace!;
            // The installation's project: a caller can address a projectId only if it names THIS
            // project (the service asserts it), so the default is the truthful local scope.
            const projectId = deps.controller.projectId;
            return {
              view: () => service.view(),
              assets: () => service.assets(),
              openLoops: () => service.openLoops(),
              history: () => service.history(),
              journal: (id) => service.journal(id),
              associateAsset: (input) =>
                service.associateAsset({
                  projectId: input.projectId ?? projectId,
                  assetKind: input.assetKind,
                  canonicalRef: input.canonicalRef,
                  associationKind: input.associationKind,
                  provenance: input.provenance,
                }),
              recordJournalEntry: (input) =>
                service.recordJournalEntry({
                  projectId: input.projectId ?? projectId,
                  kind: input.kind,
                  title: input.title,
                  body: input.body,
                  provenance: input.provenance,
                  ...(input.relatedRefs === undefined ? {} : { relatedRefs: input.relatedRefs }),
                }),
              resolveJournalEntry: (input) =>
                service.resolveJournalEntry({ projectId: input.projectId ?? projectId, entryId: input.entryId, resolution: input.resolution }),
              appendDecision: (input) =>
                service.appendDecision({
                  projectId: input.projectId ?? projectId,
                  statement: input.statement,
                  rationale: input.rationale,
                  evidenceIds: input.evidenceIds,
                  ...(input.supersedes === undefined ? {} : { supersedes: input.supersedes }),
                }),
              promoteOpportunity: (input) =>
                service.promoteOpportunity({ projectId: input.projectId ?? projectId, entryId: input.entryId, taskSpec: input.taskSpec }),
            };
          })();


    const projectManagement: ProjectManagementApplicationSurface | undefined =
      deps.projectManagement === undefined
        ? undefined
        : {
            status: () => deps.projectManagement!.assess(),
            recommend: () => deps.projectManagement!.recommend(),
            preview: () => deps.projectManagement!.previewStep(),
            step: (input) => deps.projectManagement!.step(input),
            run: (input) => deps.projectManagement!.runBounded(input),
            // A REQUEST only: `requestedBy` is filled here, never supplied by the caller, and the
            // service never applies an upward change on the agent-facing path.
            requestModeChange: (input) => deps.projectManagement!.requestModeChange({ to: input.to, requestedBy: "agent" }),
            // G10-X mechanical consistency: no caller head, no raw plan, no promotion.
            reconcileProjectHead: () => deps.projectManagement!.reconcileProjectHead(),
            // G10-AB: derived reads plus a Work Mode REQUEST (never a mutation).
            posture: () => deps.projectManagement!.posture(),
            activity: (limit) => deps.projectManagement!.activity(limit),
            operatingHistory: () => deps.projectManagement!.operatingHistory(),
            requestWorkModeChange: (input) =>
              deps.projectManagement!.requestWorkModeChange({
                baseMode: input.baseMode,
                modifiers: input.modifiers,
                requestedBy: "agent",
              }),
          };

    // G10-AC-R §11/§12: the READ-ONLY monitor face. `deps.monitor` was already
    // declared and already supplied by the install, but this factory never mapped
    // it onto the returned surface, so `GET /api/monitor/status` and
    // `GET /api/monitor/preview` always answered 501 ("surface_absent") and no UI
    // could ever observe a runtime that really exists. The mapping is one-to-one
    // with the driver's read-only members: there is no force-tick here, because the
    // operator/debug tick lives on the installed runtime only.

    const monitor: MonitorApplicationSurface | undefined =
      deps.monitor === undefined
        ? undefined
        : {
            status: () => deps.monitor!.status(),
            preview: () => deps.monitor!.previewTick(),
          };

    // G10-AD §22: the explicit Project Verification face. `requestedBy` is filled
    // HERE, never by the caller, and the only thing a caller may choose is a
    // REGISTERED verifier ref: the runtime refuses an unknown ref with a typed reason
    // and executes nothing. There is no way to register a verifier, change an
    // independence class, inject a command or claim a caller's context is independent.

    const verification: VerificationApplicationSurface | undefined =
      deps.verification === undefined
        ? undefined
        : (() => {
            const service = deps.verification!.service;
            return {
              status: () => service.status(),
              history: (limit?: number) => service.history(limit),
              verifyCurrentHead: (input?: {
                readonly verifierRef?: string | undefined;
                readonly reason?: string | undefined;
              }) =>
                service.verifyCurrentHead({
                  requestedBy: "agent:application",
                  reason:
                    input?.reason ??
                    "explicit request to verify the exact current project head through a registered verifier",
                  ...(input?.verifierRef === undefined ? {} : { verifierRef: input.verifierRef }),
                }),
            };
          })();

    // G10-AE §28: the External Asset Library face. The read/search/inspect verbs are
    // pure reads; the prepare verbs return read-only candidates; the three
    // operator-explicit verbs are the ONLY mutation/approval entries and they still
    // run through the plane's own re-checks (exact digest, provider definition,
    // project scope) and — for publication — the SEPARATE admission port. Ordinary
    // HTTP authentication never stands in for that approval.

    const externalAssets: ExternalAssetsApplicationSurface | undefined =
      deps.externalAssets === undefined
        ? undefined
        : (() => {
            const bridge = deps.externalAssets!;
            // The installation's project. A caller may name a projectId, but the plane
            // refuses one this deployment does not hold (unknown_project), so naming
            // another project can never widen the bridge's scope.
            const localProjectId = deps.controller.projectId;
            return {
              providers: () => bridge.providers(),
              search: (input: ExternalAssetSearchInput) => bridge.search(input),
              inspect: (input: ExternalAssetInspectInput) => bridge.inspect(input),
              prepareReference: (input: ExternalAssetPrepareReferenceCommand) =>
                bridge.prepareReference({ ...input, projectId: input.projectId ?? localProjectId }),
              prepareImport: (input: ExternalAssetPrepareImportCommand) =>
                bridge.prepareImport({ ...input, projectId: input.projectId ?? localProjectId }),
              preparePublication: (input: ExternalAssetPreparePublicationCommand) =>
                bridge.preparePublication({ ...input, projectId: input.projectId ?? localProjectId }),
              commitReference: (candidate: ExternalAssetReferenceCandidate) =>
                bridge.commitReference(candidate),
              commitImport: (candidate: ExternalAssetImportCandidate) =>
                bridge.commitImport(candidate),
              approveAndPublish: (preview: ExternalAssetPublicationPreview) =>
                bridge.approveAndPublish(preview),
            };
          })();


  return { projectWorkspace, projectManagement, monitor, verification, externalAssets };
}
