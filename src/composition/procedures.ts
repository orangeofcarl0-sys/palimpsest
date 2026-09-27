/**
 * E5-P §24/§27 — the PROCEDURE composition adapter.
 *
 *     composition knows wiring;  procedures knows procedural-capital semantics.
 *
 * This module is the ONE place that may see the concrete OrganizationMemory owner, the
 * ProjectWorkspace owner and the Procedure store, and adapt their READS into the procedure owner's
 * ports. It holds NO policy: every judgement (is this ground real? is this revision associated? is
 * this procedure current?) belongs to `src/procedures/`.
 *
 * ## What this adapter deliberately cannot reach (§19/§34)
 *
 * There is NO port onto Work admission, task authorization, promotion eligibility, effect
 * authorization, commitment authority, intent authority or organization-evolution authority. A
 * procedure is cognitive infrastructure; wiring it to any of those would be the exact defect §19
 * exists to prevent. The only WRITE this module performs is the project association, and it goes
 * through the EXISTING `ProjectWorkspace.associateAsset` — the procedure owner never writes a
 * project's association chain itself.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import type { OrganizationMemoryService } from "../organization_memory/index.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type {
  ProcedureAssociationPort,
  ProcedureGroundKind,
  ProcedureGroundObservation,
  ProcedureGroundPort,
  ProcedurePorts,
} from "../procedures/index.js";
import { makeProcedureService, type ProcedureService } from "../procedures/index.js";
import type { ProcedureStore } from "../procedures/index.js";

/**
 * The narrow empirical-ground surface this adapter reads, declared STRUCTURALLY.
 *
 * Naming `OrganizationMemoryService` for these three reads would add importer edges for shapes
 * that are already spelled out here — the same discipline `institutional_learning.ts` and
 * `project_intent.ts` follow.
 */
interface GroundOwner {
  run(runRef: string): Promise<{ readonly runRef: string; readonly experimentRef: string; readonly digest: string } | undefined>;
  intervention(interventionRef: string): Promise<{ readonly interventionRef: string; readonly digest: string; readonly rationale: string } | undefined>;
  evaluations(experimentId: string): Promise<readonly { readonly evaluationRef: string; readonly digest: string; readonly experimentRef: string }[]>;
  experiments(): Promise<readonly { readonly experimentId: string; readonly objective: string }[]>;
}

export interface ProcedureCompositionInput {
  readonly projectId: string;
  readonly store: ProcedureStore;
  /** §6: the empirical-history owner. Absent ⇒ grounding cannot be proven and `prepare` refuses. */
  readonly organizationMemory: OrganizationMemoryService | undefined;
  /** §14: the project-association owner. Absent ⇒ `associate` honestly refuses. */
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  /** §7: the UNTRUSTED authoring seam. Absent ⇒ `prepare` refuses honestly. */
  readonly authoring?: import("../procedures/index.js").ProcedureAuthoringPort | undefined;
  /** §10: the INDEPENDENT admission authority. Absent ⇒ `publish` answers `admission_unresolved`. */
  readonly admission?: import("../procedures/index.js").ProcedureAdmissionPort | undefined;
  readonly clock?: (() => string) | undefined;
}

/**
 * Adapt the composed owners into the procedure owner's ports.
 *
 * Every capability is present EXACTLY when its owner is composed — no stub stands in for an absent
 * owner, so a refusal is a fact about this deployment rather than a guess.
 */
export function composeProcedurePorts(input: ProcedureCompositionInput): ProcedurePorts | undefined {
  const { projectId, organizationMemory, projectWorkspace } = input;
  if (organizationMemory === undefined && projectWorkspace === undefined) return undefined;

  /**
   * §6: the empirical-ground READ. Each kind resolves through the owner that actually holds it —
   * an evaluation and a run both live in OrganizationMemory, but a run is reached by its own
   * `run(runRef)` read while an evaluation is reached by scanning the experiment it belongs to.
   *
   * A ref the owner does not hold returns `undefined`, which the procedure owner reports as an
   * unresolvable ground rather than accepting a dangling reference.
   */
  const grounds: ProcedureGroundPort | undefined =
    organizationMemory === undefined
      ? undefined
      : {
          async observe(kind: ProcedureGroundKind, ref: string): Promise<ProcedureGroundObservation | undefined> {
            const owner = organizationMemory as unknown as GroundOwner;
            if (kind === "RUN_RESULT") {
              const run = await owner.run(ref);
              return run === undefined
                ? undefined
                : Object.freeze({ kind, ref: run.runRef, digest: run.digest, experimentRef: run.experimentRef, subject: `run ${run.runRef}` });
            }
            if (kind === "INTERVENTION_RECORD") {
              const intervention = await owner.intervention(ref);
              return intervention === undefined
                ? undefined
                : Object.freeze({ kind, ref: intervention.interventionRef, digest: intervention.digest, subject: intervention.rationale });
            }
            // ORGANIZATION_EVALUATION: an evaluation ref does not name its experiment, so the
            // owner's own experiment list is scanned. The ref is an exact identity, so this is a
            // lookup rather than a heuristic search.
            for (const experiment of await owner.experiments()) {
              const evaluations = await owner.evaluations(experiment.experimentId);
              const found = evaluations.find((evaluation) => evaluation.evaluationRef === ref);
              if (found !== undefined) {
                return Object.freeze({
                  kind,
                  ref: found.evaluationRef,
                  digest: found.digest,
                  experimentRef: found.experimentRef,
                  subject: experiment.objective,
                });
              }
            }
            return undefined;
          },
        };

  /**
   * §14: the project-association read/write. The WRITE goes through the EXISTING workspace
   * `associateAsset`, which is the only writer of a project's association chain; this adapter
   * pins `assetKind` to `PROCEDURE` and carries the exact revision digest in the canonical ref.
   *
   * §15: association is NOT context injection. Nothing here reaches the context compiler.
   */
  const association: ProcedureAssociationPort | undefined =
    projectWorkspace === undefined
      ? undefined
      : {
          async associated(targetProjectId: string, procedureId: string, revision: number): Promise<boolean> {
            if (targetProjectId !== projectId) return false;
            let associations: readonly { readonly assetKind: string; readonly canonicalRef: { readonly id: string; readonly digest?: string | undefined } }[];
            try {
              associations = await projectWorkspace.projectScopedAssets(targetProjectId);
            } catch {
              // The workspace refused the scope (it is not this workspace's project). A refusal is
              // not an answer, so it fails CLOSED: "not associated" can never widen eligibility.
              return false;
            }
            return associations.some(
              (entry) => entry.assetKind === "PROCEDURE" && entry.canonicalRef.id === procedureRefIdOf(procedureId, revision),
            );
          },
          async associate(request): Promise<void> {
            if (request.projectId !== projectId) {
              throw new Error(`the procedure may only be associated with this workspace's project "${projectId}"`);
            }
            await projectWorkspace.associateAsset({
              projectId: request.projectId,
              assetKind: "PROCEDURE",
              canonicalRef: {
                kind: "PROCEDURE",
                id: procedureRefIdOf(request.procedureRef.procedureId, request.procedureRef.revision),
                digest: request.procedureRef.digest,
              },
              associationKind: "MANUAL",
              provenance: request.provenance,
            });
          },
        };

  return Object.freeze({
    ...(grounds === undefined ? {} : { grounds }),
    ...(association === undefined ? {} : { association }),
  });
}

/**
 * §13: the `canonicalRef.id` a procedure association carries.
 *
 * `ProcedureRef` has three parts, but `CanonicalAssetRef.id` is one string. The id is therefore the
 * `<procedureId>@<revision>` pair — the digest, which is the part that must be EXACT, travels in
 * `canonicalRef.digest` where `requireExactRevisionDigest` enforces it. Splitting it this way keeps
 * the association readable while making the revision identity unforgeable.
 */
export function procedureRefIdOf(procedureId: string, revision: number): string {
  return `${procedureId}@${revision}`;
}

/**
 * Compose the packaged procedure surface: adapt the owners into the ports AND build the service.
 *
 * This wrapper exists so the composition ROOT never names `src/procedures/` directly. `install.ts`
 * is a composition root with a §25 ceiling on how many capability families it may import, and the
 * honest response is to keep the family behind the adapter that already knows how to wire it.
 */
export function composeProcedureCapability(input: ProcedureCompositionInput): ProcedureService | undefined {
  const ports = composeProcedurePorts(input);
  return makeProcedureService({
    store: input.store,
    ...(input.authoring === undefined ? {} : { authoring: input.authoring }),
    ...(input.admission === undefined ? {} : { admission: input.admission }),
    ...(ports === undefined ? {} : { ports }),
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
}
