/**
 * E3-C §30/§31 — the PROJECT-COLLABORATION composition adapter.
 *
 *     composition knows wiring;  project_collaboration knows collaboration-need semantics.
 *
 * This module is the ONE place that may see the concrete Work owner and the concrete Federation service,
 * and adapt their READS into `ProjectCollaborationPorts`. It holds NO policy: every judgement (is this
 * task BLOCKED? is this attempt failed? was this need declared?) belongs to the owners, and the admission
 * authority is the CALLER's, never invented here.
 *
 * The two writes are ports over EXISTING owners:
 *
 *   · `declaration.declare` → the Federation service's `declareContactNeed`, which now appends the
 *     durable `CONTACT_NEED_DECLARED` event (§11/§12);
 *   · nothing else. There is deliberately no Work mutation here — a collaboration need is not an
 *     assignment and grants no authority over any Work ledger.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import type { FederationService } from "../federation/index.js";
import type { ContactNeedOrigin } from "../federation/index.js";
import { attemptReportDigestOf, parseAttemptReport } from "../schema/index.js";
import { makeProjectCollaborationService } from "../project_collaboration/index.js";
import type {
  BlockedTaskObservation,
  CollaborationNeedAuthoringPort,
  ContactNeedAdmissionPort,
  FailedAttemptObservation,
  ProjectCollaborationPorts,
  ProjectCollaborationService,
} from "../project_collaboration/index.js";
import type { ProjectIr } from "../schema/index.js";

/**
 * The narrow Work-owner surface this adapter reads, declared STRUCTURALLY.
 *
 * Naming `ProjectController` would add an importer edge to the measured hotspot for a handful of method
 * shapes. Here the shapes are spelled out, so this module depends on the capabilities and not on the
 * façade — the same discipline `project_intent.ts` and `work_delegation.ts` follow.
 *
 * The task OBJECTIVE and its declared hints come from the canonical TaskEnvelope (the authority the task
 * carries), not from a re-derivation, and the attempt identity comes from `attemptWorkRecord` — the SAME
 * row the verification plane reads.
 */
interface CollaborationWorkOwner {
  readonly work: {
    project(): ProjectIr;
    taskStates(): readonly { readonly taskId: string; readonly state: string }[];
    task(taskId: string): { readonly taskId: string; readonly state: string } | null;
    taskEnvelope(taskId: string): {
      readonly objective: string;
      readonly write_paths: readonly string[];
      readonly required_artifacts: readonly string[];
    } | null;
  };
  attemptWorkRecord(attemptId: string): {
    readonly state: string;
    readonly taskId: string | null;
    readonly report: unknown;
  } | null;
}

export interface ProjectCollaborationCompositionInput {
  readonly projectId: string;
  readonly controller: CollaborationWorkOwner;
  readonly federation: FederationService | undefined;
  readonly authoring: CollaborationNeedAuthoringPort | undefined;
  readonly admission: ContactNeedAdmissionPort | undefined;
  readonly clock?: (() => string) | undefined;
}

/**
 * Adapt the composed owners into the collaboration owner's ports.
 *
 * Every capability is present EXACTLY when its owner is composed — no stub stands in for an absent owner,
 * so a refusal is a fact about this deployment. `undefined` is returned only when the minimum (a Work
 * owner to read reality from AND a Federation service to declare through) is absent.
 */
export function composeProjectCollaborationPorts(
  input: ProjectCollaborationCompositionInput,
): ProjectCollaborationPorts | undefined {
  const { controller, federation } = input;
  if (federation === undefined) return undefined;

  /** §5: the canonical project facts, read through the Work owner. */
  const project = {
    async facts(): Promise<{ projectId: string; revision: number; digest: string; headCommit: string }> {
      const ir = controller.work.project();
      return Object.freeze({
        projectId: ir.project_id,
        revision: ir.revision,
        digest: ir.digest,
        headCommit: ir.head_commit,
      });
    },
  };

  /**
   * §5 `BLOCKED_TASK`: observe the condition from the canonical task projection. A task that is not
   * BLOCKED is reported as `undefined` — never coerced into a ground.
   *
   * The objective comes from the task's canonical ENVELOPE (the authority it carries) and the declared
   * hints are the artifacts the Work itself requires. Nothing here is invented, and the dependency set is
   * the envelope's write-path set — the concrete Work facts a peer would need to judge the condition.
   */
  const blockedTask = {
    async observe(taskId: string): Promise<BlockedTaskObservation | undefined> {
      const state = controller.work.taskStates().find((entry) => entry.taskId === taskId);
      if (state === undefined || state.state !== "BLOCKED") return undefined;
      const envelope = controller.work.taskEnvelope(taskId);
      if (envelope === null) return undefined;
      return Object.freeze({
        taskId,
        objective: envelope.objective,
        dependsOn: Object.freeze([...envelope.write_paths]),
        declaredHints: Object.freeze([...envelope.required_artifacts]),
      });
    },
  };

  /**
   * §5 `FAILED_ATTEMPT`: observe the attempt's report identity from the Work owner. A non-failed attempt
   * is `undefined`, so the ground can only ever describe a real failure.
   *
   * The report DIGEST is derived from the canonical report body with the repository's own digest
   * function, so a later reader can tell whether the attempt in history is still the one observed.
   */
  const failedAttempt = {
    async observe(attemptId: string): Promise<FailedAttemptObservation | undefined> {
      const record = controller.attemptWorkRecord(attemptId);
      if (record === null || record.taskId === null) return undefined;
      const report = record.report as
        | { readonly worker_status?: string; readonly task_id?: string; readonly summary?: string }
        | null
        | undefined;
      if (report === null || report === undefined) return undefined;
      // `worker_status` is the canonical field on an AttemptReport; only a real failure is a ground.
      if (report.worker_status !== "failed") return undefined;
      const envelope = controller.work.taskEnvelope(record.taskId);
      return Object.freeze({
        taskId: record.taskId,
        attemptId,
        reportDigest: attemptReportDigestOf(parseAttemptReport(report)),
        objective: envelope?.objective ?? "",
      });
    },
  };

  /**
   * §11: the declaration write, over the EXISTING Federation owner. The candidate digest rides through as
   * the §13 retry correlation, so a retried admission returns the SAME durable need.
   */
  const declaration = {
    async declare(input: {
      readonly origin: ContactNeedOrigin;
      readonly competenceTags: readonly string[];
      readonly reason: string;
      readonly candidateDigest: string;
      readonly accepted: unknown;
    }): Promise<{ readonly contactNeedId: string }> {
      const need = await federation.declareContactNeed({
        origin: input.origin,
        competenceTags: input.competenceTags,
        reason: input.reason,
        provenance: Object.freeze({
          kind: "candidate" as const,
          candidateDigest: input.candidateDigest,
          projectBasis: (input.accepted as { readonly projectBasis: { readonly projectId: string; readonly revision: number; readonly digest: string; readonly headCommit: string } }).projectBasis,
          ground: (input.accepted as { readonly ground: unknown }).ground,
          admission: (input.accepted as { readonly admission: { readonly decision: "ADMIT"; readonly policyRef: { readonly policyId: string; readonly version: string }; readonly provenanceDigest: string } }).admission,
        }),
      });
      return Object.freeze({ contactNeedId: need.contactNeedId });
    },
  };

  return Object.freeze({
    project,
    blockedTask,
    failedAttempt,
    declaration,
  }) as ProjectCollaborationPorts;
}

/**
 * Compose the packaged collaboration surface: adapt the owners into the ports AND build the service.
 *
 * This wrapper exists so the composition ROOT never names `src/project_collaboration/` directly.
 * `install.ts` is a composition root with a §25 ceiling on how many capability families it may import,
 * and the honest response is to keep the family behind the adapter that already knows how to wire it —
 * not to raise the ceiling.
 */
export function composeProjectCollaborationCapability(
  input: ProjectCollaborationCompositionInput,
): ProjectCollaborationService | undefined {
  const ports = composeProjectCollaborationPorts(input);
  if (ports === undefined) return undefined;
  return makeProjectCollaborationService({
    ports,
    ...(input.authoring === undefined ? {} : { authoring: input.authoring }),
    ...(input.admission === undefined ? {} : { admission: input.admission }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
}
