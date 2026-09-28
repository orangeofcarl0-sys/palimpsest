/**
 * E4-L — GOVERNED INSTITUTIONAL LEARNING: the reconciliation + evaluation-read service.
 *
 *     Structural Observation → Dynamics Proposal → Governed Evolution → Durable Intervention Record
 *       → Later Empirical Experiment / Evaluation → Reusable Institutional Experience
 *
 * ## What this service is
 *
 * A STATELESS orchestrator over existing owners. It owns:
 *
 *     NO store    NO Organization    NO RuntimeScope    NO DynamicsProposal    NO authority
 *
 * It has exactly two responsibilities:
 *
 *   · `reconcileInterventions()` — scan durable evolution history and ensure every ACTIVATED structural
 *     change has exactly ONE `InterventionRecord` in OrganizationMemory;
 *   · `interventionEvaluations(ref)` — the derived join from an intervention to the ordinary experiments
 *     and evaluations that studied it.
 *
 * ## §11/§12 cross-store failure semantics
 *
 * Evolution canonical mutation and the OrganizationMemory write live in DIFFERENT stores, so this service
 * claims NO atomicity. If a structural activation succeeded and the empirical write failed, the
 * structural change REMAINS VALID — reconciliation is what repairs the missing record, and that is the
 * crash window §12 requires to work.
 *
 * ## §23 no self-modification
 *
 * Nothing here can mutate a structure. A historical evaluation is CONTEXT, never authority: the only
 * structural path remains `DynamicsProposal → independent authority → Evolution`.
 *
 * Layer: L2 (`src/institutional_learning/`).
 */
import {
  projectActivatedCase,
  structuralSourceKey,
  structuralSourceRefOf,
  interventionContentDigest,
  type StructuralInterventionProjection,
  type StructuralLane,
} from "./projection.js";
import type { InterventionMemoryPort, StructuralHistoryPort } from "./ports.js";

/** §24: what reconciliation did, per case. Reported, never hidden. */
export type ReconciliationAction = "recorded" | "already_recorded" | "not_activated" | "incomplete";

export interface ReconciliationEntry {
  readonly lane: StructuralLane;
  readonly caseRef: string;
  readonly action: ReconciliationAction;
  readonly interventionRef: string | null;
  readonly detail: string;
}

export interface ReconciliationReport {
  readonly entries: readonly ReconciliationEntry[];
  readonly recorded: number;
  readonly alreadyRecorded: number;
  readonly incomplete: number;
  readonly notActivated: number;
}

/** §17: one linked experiment and its ordinary evaluations, as derived from memory. */
export interface InterventionEvaluationView {
  readonly interventionRef: string;
  readonly experiments: readonly {
    readonly experimentRef: string;
    readonly objective: string;
    readonly evaluationRefs: readonly string[];
  }[];
}

/**
 * §17: the empirical-memory READ for the evaluation join. Derived from `ExperimentDefinition.interventionRef`
 * joined to existing memory history — no new store and no index truth.
 */
export interface EvaluationQueryPort {
  intervention(interventionRef: string): Promise<
    | { readonly interventionRef: string; readonly evolutionCaseRef: string | null; readonly proposalDigest: string | null }
    | undefined
  >;
  experimentsFor(interventionRef: string): Promise<
    readonly { readonly experimentRef: string; readonly objective: string; readonly evaluationRefs: readonly string[] }[]
  >;
}

export interface InstitutionalLearningServiceDeps {
  readonly history: StructuralHistoryPort;
  readonly memory: InterventionMemoryPort;
  readonly evaluations: EvaluationQueryPort;
  /** §24: an OPTIONAL thin route to the EXISTING experiment owner. It grants no authority of its own. */
  readonly clock?: (() => string) | undefined;
}

export interface InstitutionalLearningService {
  /** §8/§12: ensure every activated structural change has exactly one intervention record. */
  reconcileInterventions(): Promise<ReconciliationReport>;
  /** §17: the experiments + evaluations linked to one intervention. Derived. */
  interventionEvaluations(interventionRef: string): Promise<InterventionEvaluationView>;
  /** §24: the interventions this host holds, for one lane or all of them. */
  interventions(lane?: StructuralLane): Promise<readonly ReconciliationEntry[]>;
  /** §24: one intervention's projection, reconstructed from durable evolution history. */
  intervention(lane: StructuralLane, caseRef: string): Promise<StructuralInterventionProjection | null>;
}

export function makeInstitutionalLearningService(
  deps: InstitutionalLearningServiceDeps,
): InstitutionalLearningService {
  /**
   * §10: the ONE reconciliation pass. For each case:
   *
   *   not activated            → nothing to record (there was no structural change)
   *   activated, no bound body → reported incomplete, NEVER guessed (§27)
   *   activated, no record     → record it
   *   activated, same content  → idempotent: return the existing record
   *   activated, DIFFERENT     → fail closed: one activation has ONE interpretation
   */
  async function reconcileInterventions(): Promise<ReconciliationReport> {
    const existing = await deps.memory.existing();
    const byCase = new Map<string, { interventionRef: string; contentDigest: string }>();
    for (const record of existing) {
      if (record.evolutionCaseRef === undefined) continue;
      byCase.set(record.evolutionCaseRef, { interventionRef: record.interventionRef, contentDigest: record.contentDigest });
    }

    const entries: ReconciliationEntry[] = [];
    for (const lane of ["organization_evolution", "runtime_evolution"] as const) {
      const cases = await deps.history.cases(lane);
      for (const view of cases) {
        const outcome = projectActivatedCase({ lane, caseRef: view.caseRef, events: view.events });
        if (outcome.status === "not_activated") {
          entries.push(Object.freeze({ lane, caseRef: view.caseRef, action: "not_activated" as const, interventionRef: null, detail: outcome.detail }));
          continue;
        }
        if (outcome.status === "incomplete") {
          entries.push(Object.freeze({ lane, caseRef: view.caseRef, action: "incomplete" as const, interventionRef: null, detail: outcome.detail }));
          continue;
        }
        const projection = outcome.projection;
        const digest = interventionContentDigest(projection);
        const prior = byCase.get(projection.evolutionCaseRef);
        if (prior !== undefined) {
          if (prior.contentDigest !== digest) {
            // §10: a conflicting interpretation of ONE structural activation is refused, not overwritten.
            throw new Error(
              `intervention "${prior.interventionRef}" for structural case "${projection.evolutionCaseRef}" already exists with different content — one activation has one interpretation`,
            );
          }
          entries.push(Object.freeze({ lane, caseRef: view.caseRef, action: "already_recorded" as const, interventionRef: prior.interventionRef, detail: "idempotent: the recorded intervention matches this projection" }));
          continue;
        }
        const recorded = await deps.memory.record(projection);
        byCase.set(projection.evolutionCaseRef, { interventionRef: recorded.interventionRef, contentDigest: digest });
        entries.push(Object.freeze({ lane, caseRef: view.caseRef, action: "recorded" as const, interventionRef: recorded.interventionRef, detail: "reconstructed from durable evolution history" }));
      }
    }

    return Object.freeze({
      entries: Object.freeze(entries),
      recorded: entries.filter((entry) => entry.action === "recorded").length,
      alreadyRecorded: entries.filter((entry) => entry.action === "already_recorded").length,
      incomplete: entries.filter((entry) => entry.action === "incomplete").length,
      notActivated: entries.filter((entry) => entry.action === "not_activated").length,
    });
  }

  /** §17: the derived join. An unknown intervention is an empty view, never a fabricated one. */
  async function interventionEvaluations(interventionRef: string): Promise<InterventionEvaluationView> {
    const experiments = await deps.evaluations.experimentsFor(interventionRef);
    return Object.freeze({
      interventionRef,
      experiments: Object.freeze(
        experiments.map((experiment) =>
          Object.freeze({
            experimentRef: experiment.experimentRef,
            objective: experiment.objective,
            evaluationRefs: Object.freeze([...experiment.evaluationRefs]),
          }),
        ),
      ),
    });
  }

  /** §24: the interventions this host holds. Derived from memory, filtered by lane when asked. */
  async function interventions(lane?: StructuralLane): Promise<readonly ReconciliationEntry[]> {
    const existing = await deps.memory.existing();
    const entries: ReconciliationEntry[] = [];
    for (const record of existing) {
      if (record.evolutionCaseRef === undefined) continue;
      const source = parseSourceOrNull(record.evolutionCaseRef);
      if (source === null) continue;
      if (lane !== undefined && source.lane !== lane) continue;
      entries.push(
        Object.freeze({
          lane: source.lane,
          caseRef: source.caseRef,
          action: "already_recorded" as const,
          interventionRef: record.interventionRef,
          detail: "derived from OrganizationMemory",
        }),
      );
    }
    return Object.freeze(entries);
  }

  /** §24: reconstruct one case's projection from durable history, or null when it cannot be projected. */
  async function intervention(lane: StructuralLane, caseRef: string): Promise<StructuralInterventionProjection | null> {
    const view = await deps.history.case(lane, caseRef);
    if (view === undefined) return null;
    const outcome = projectActivatedCase({ lane, caseRef, events: view.events });
    return outcome.status === "projected" ? outcome.projection : null;
  }

  return { reconcileInterventions, interventionEvaluations, interventions, intervention };
}

/** Parse a stored `lane:caseRef` key back into its parts; a foreign key is ignored rather than guessed. */
function parseSourceOrNull(key: string): { readonly lane: StructuralLane; readonly caseRef: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const lane = key.slice(0, separator);
  if (lane !== "organization_evolution" && lane !== "runtime_evolution") return null;
  return structuralSourceRefOf(lane, key.slice(separator + 1));
}

export { structuralSourceKey };
