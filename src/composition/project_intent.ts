/**
 * E2-I §9/§30 — the PROJECT-INTENT composition adapter.
 *
 *     composition knows wiring;  project_intent knows intent semantics.
 *
 * This module is the ONE place that may see the concrete Proof owner, Reasoning owner, ProjectWorkspace
 * (associations + journal) and the Work owner, and adapt their READS into `ProjectIntentPorts`. It holds
 * NO policy: every eligibility judgement (is it associated? is it fresh? is the claim active? is this
 * journal entry a NEGATIVE_RESULT?) belongs to `src/project_intent/`.
 *
 * The single WRITE is `applyAcceptedRevision`, which is a port over the EXISTING revision owner —
 * `controller.planReconciled`. Nothing here mutates a task, an attempt or a project directly; the
 * existing quiescence, promotion-fence, head-sync-fence, Evidence-invalidation and revision-CAS
 * protections all still apply because the call goes through the one sanctioned seam.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import type { ProofEvidenceService } from "../proof_asset/index.js";
import type { ReasoningCellService } from "../reasoning_cell/index.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type { ProjectIr } from "../schema/index.js";
import { makeProjectIntentService } from "../project_intent/index.js";
import type {
  IntentJournalEntryView,
  IntentProjectFacts,
  IntentProofBasis,
  IntentProofObservation,
  IntentReasoningFrontier,
  ProjectIntentAdmissionPort,
  ProjectIntentPorts,
  ProjectIntentService,
} from "../project_intent/index.js";

/**
 * The narrow Work-owner surface this adapter reads and revises, declared STRUCTURALLY.
 *
 * Naming `ProjectController` would add a new importer edge to the measured hotspot for two method
 * shapes — the same reason `work_delegation.ts` declares its controller dependency as a `Pick` rather
 * than reaching for the class. Here the shapes are spelled out, so this module depends on the two
 * capabilities and not on the façade.
 */
interface IntentWorkOwner {
  readonly work: {
    project(): ProjectIr;
    taskStates(): readonly { readonly taskId: string; readonly state: string }[];
  };
  planReconciled(
    input: {
      readonly goal: string;
      readonly requirements: readonly ProjectIr["requirements"][number][];
      readonly decisions: readonly ProjectIr["decisions"][number][];
      readonly tasks: readonly ProjectIr["tasks"][number][];
      readonly reason: string;
      readonly changeClass: "behavior_change" | "contract_breaking";
      readonly changedIds: readonly string[];
    },
    trusted: { readonly acceptedIntentReconciliation: unknown },
  ): { readonly result: { readonly revision: number; readonly digest: string } };
}

export interface ProjectIntentCompositionInput {
  readonly projectId: string;
  readonly controller: IntentWorkOwner;
  readonly proof: ProofEvidenceService | undefined;
  readonly reasoning: ReasoningCellService | undefined;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
}

/**
 * Adapt the composed owners into the intent owner's read ports plus the one governed write.
 *
 * Every capability is present EXACTLY when its owner is composed — no stub stands in for an absent
 * owner, so a refusal is a fact about this deployment. `undefined` is returned only when the minimum
 * (a Work owner to read the project from and to revise) is absent.
 */
export function composeProjectIntentPorts(
  input: ProjectIntentCompositionInput,
): ProjectIntentPorts | undefined {
  const { projectId, controller, proof, reasoning, projectWorkspace } = input;

  /**
   * The canonical project facts, read through the Work owner. The NONTERMINAL task set is exactly what
   * §20 retires, and it is read from the same projection the reconciliation itself will use — so the
   * changed-id set cannot drift from the tasks that actually exist.
   */
  const project = {
    async facts(): Promise<IntentProjectFacts> {
      const ir = controller.work.project();
      const taskStates = controller.work.taskStates();
      return Object.freeze({
        projectId: ir.project_id,
        revision: ir.revision,
        digest: ir.digest,
        headCommit: ir.head_commit,
        goal: ir.goal,
        requirements: Object.freeze(
          ir.requirements.map((requirement) =>
            Object.freeze({
              requirement_id: requirement.requirement_id,
              statement: requirement.statement,
              priority: requirement.priority,
              acceptance_refs: Object.freeze([...requirement.acceptance_refs]),
            }),
          ),
        ),
        decisions: Object.freeze(
          ir.decisions.map((decision) =>
            Object.freeze({
              decision_id: decision.decision_id,
              statement: decision.statement,
              rationale: decision.rationale,
              evidence_ids: Object.freeze([...decision.evidence_ids]),
              supersedes: decision.supersedes,
            }),
          ),
        ),
        nonterminalTaskIds: Object.freeze(
          taskStates
            .filter((task) => task.state !== "SATISFIED" && task.state !== "FAILED" && task.state !== "STALE")
            .map((task) => task.taskId)
            .sort(),
        ),
      });
    },
  };

  /** ProjectWorkspace READ: membership only — never standing, never activity. */
  const projectAssets = {
    async associated(kind: "PROOF_CLAIM" | "REASONING_CELL", id: string): Promise<boolean> {
      if (projectWorkspace === undefined) return false;
      let associations: readonly { readonly assetKind: string; readonly canonicalRef: { readonly id: string } }[];
      try {
        associations = await projectWorkspace.projectScopedAssets(projectId);
      } catch {
        // A refused scope is not an answer: fail closed rather than widening eligibility.
        return false;
      }
      return associations.some((association) => association.assetKind === kind && association.canonicalRef.id === id);
    },
  };

  /** Proof owner READ, mirroring the E1-K observation discipline. */
  const proofPort =
    proof === undefined
      ? undefined
      : {
          async observeBasis(): Promise<IntentProofBasis | undefined> {
            const basis = await proof.basis();
            return basis === undefined ? undefined : { scopeId: basis.scopeId, throughSeq: basis.throughSeq, chainDigest: basis.chainDigest };
          },
          async observeClaim(claimId: string): Promise<IntentProofObservation> {
            const published = await proof.publishedClaims();
            if (!published.some((claim) => claim.claimRef.claimId === claimId)) {
              const recorded = await candidateRecorded(proof, claimId);
              return recorded ? { classified: "NOT_PUBLISHED" } : { classified: "NOT_FOUND" };
            }
            const view = await proof.proofAssetView(claimId);
            return { classified: "observed", effectiveStanding: String(view.effectiveStanding), freshness: String(view.freshness) };
          },
        };

  /** Reasoning owner READ: ONE self-consistent frontier observation. */
  const reasoningPort =
    reasoning === undefined
      ? undefined
      : {
          async observeFrontier(cellId: string): Promise<IntentReasoningFrontier | undefined> {
            try {
              const frontier = await reasoning.frontier({ cellId });
              return {
                cellId: frontier.basis.cellId,
                frontierRevision: frontier.basis.frontierRevision,
                frontierDigest: frontier.basis.frontierDigest,
                activeClaimIds: frontier.claims.map((entry) => entry.ref.claimId),
              };
            } catch (error) {
              if (isUnknownCell(error)) return undefined;
              throw error;
            }
          },
        };

  /** ProjectJournal READ: one entry with its latest resolution merged, through the workspace façade. */
  const journalPort = {
    async entry(entryId: string): Promise<IntentJournalEntryView | undefined> {
      if (projectWorkspace === undefined) return undefined;
      const entries = await projectWorkspace.journal();
      const found = entries.find((entry) => entry.entry.entryId === entryId);
      if (found === undefined) return undefined;
      return Object.freeze({
        entryId: found.entry.entryId,
        projectId: found.entry.projectId,
        kind: found.entry.kind,
        digest: found.entry.digest,
        resolution:
          found.resolution === undefined
            ? null
            : Object.freeze({
                status: found.resolution.status,
                ...(found.resolution.detail === undefined ? {} : { detail: found.resolution.detail }),
              }),
      });
    },
  };

  /**
   * §21: the ONE governed write. It rebuilds the next ProjectIR intent from the CURRENT one plus the
   * proposal's changes and hands it to `planReconciled` with the DERIVED change class and changed-id
   * set, plus the accepted receipt through the trusted seam.
   *
   * Note what is NOT here: no task invention (§22), no direct task mutation, no bypass of the fence.
   */
  const applyAcceptedRevision: ProjectIntentPorts["applyAcceptedRevision"] = (revision) => {
    const ir = controller.work.project();
    let goal = ir.goal;
    const requirements = new Map(ir.requirements.map((requirement) => [requirement.requirement_id, requirement]));
    const decisions = new Map(ir.decisions.map((decision) => [decision.decision_id, decision]));

    for (const change of revision.changes) {
      switch (change.kind) {
        case "GOAL_REVISE":
          goal = change.goal;
          break;
        case "REQUIREMENT_ADD":
        case "REQUIREMENT_REVISE":
          requirements.set(change.requirement.requirement_id, change.requirement);
          break;
        case "REQUIREMENT_REMOVE":
          requirements.delete(change.requirementId);
          break;
        case "DECISION_APPEND":
        case "DECISION_SUPERSEDE":
          decisions.set(change.decision.decision_id, change.decision);
          break;
      }
    }

    // §4/§22: the TASK LIST IS RE-ASSERTED UNCHANGED. E2-I retires Work through the typed-invalidation
    // path (below); it does not author the next plan, so no task is added, removed or edited here.
    const tasks = ir.tasks.map((task) => ({
      ...task,
      depends_on: [...task.depends_on],
      write_paths: [...task.write_paths],
      required_artifacts: [...task.required_artifacts],
    }));

    const outcome = controller.planReconciled(
      {
        goal,
        requirements: [...requirements.values()],
        decisions: [...decisions.values()],
        tasks,
        reason: revision.reason,
        changeClass: revision.changeClass,
        changedIds: [...revision.changedIds],
      },
      { acceptedIntentReconciliation: revision.acceptedIntentReconciliation },
    );

    /**
     * §20: report the tasks this revision actually RETIRED.
     *
     * `outcome.result.removedStaled` names only the tasks the new ProjectIR DROPS, and E2-I re-asserts
     * the task list unchanged — so it is always empty here and would understate the effect. The tasks
     * E2-I retires are the ones its typed invalidation SETTLED, which is exactly the `changedIds` set
     * that are STALE after the batch. Reading them back from the projection reports what happened
     * rather than what was requested.
     */
    const staledNow = new Set(
      controller.work
        .taskStates()
        .filter((task) => task.state === "STALE")
        .map((task) => task.taskId),
    );

    return Object.freeze({
      revision: outcome.result.revision,
      digest: outcome.result.digest,
      staledTaskIds: Object.freeze([...revision.changedIds].filter((taskId) => staledNow.has(taskId)).sort()),
    });
  };

  if (proofPort === undefined && reasoningPort === undefined && projectWorkspace === undefined) {
    // Without any knowledge owner there is no ground to observe, so the capability is honestly absent.
    return undefined;
  }

  return Object.freeze({
    project,
    projectAssets,
    ...(proofPort === undefined ? {} : { proof: proofPort }),
    ...(reasoningPort === undefined ? {} : { reasoning: reasoningPort }),
    journal: journalPort,
    applyAcceptedRevision,
  }) as ProjectIntentPorts;
}

/** Did the Proof owner ever record a candidate under this id? Read through the owner's own replay. */
async function candidateRecorded(proof: ProofEvidenceService, candidateId: string): Promise<boolean> {
  const events = await proof.replay();
  return events.some((event) => {
    if (event.type !== "CANDIDATE_RECORDED") return false;
    const payload = event.payload as { readonly candidate?: { readonly candidateId?: unknown } } | undefined;
    return payload?.candidate?.candidateId === candidateId;
  });
}

function isUnknownCell(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { readonly kind?: unknown }).kind === "unknown_cell"
  );
}

/**
 * Compose the packaged intent surface: adapt the owners into the ports AND build the service.
 *
 * This wrapper exists so the composition ROOT never names `src/project_intent/` directly. `install.ts`
 * is a composition root with a §25 ceiling on how many capability families it may import, and the honest
 * response is to keep the family behind the adapter that already knows how to wire it — not to raise the
 * ceiling.
 */
export function composeProjectIntentCapability(input: {
  readonly projectId: string;
  readonly controller: IntentWorkOwner;
  readonly proof: ProofEvidenceService | undefined;
  readonly reasoning: ReasoningCellService | undefined;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  readonly admission: ProjectIntentAdmissionPort | undefined;
  readonly clock?: (() => string) | undefined;
}): ProjectIntentService | undefined {
  const ports = composeProjectIntentPorts({
    projectId: input.projectId,
    controller: input.controller,
    proof: input.proof,
    reasoning: input.reasoning,
    projectWorkspace: input.projectWorkspace,
  });
  if (ports === undefined) return undefined;
  return makeProjectIntentService({
    ports,
    ...(input.admission === undefined ? {} : { admission: input.admission }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
}
