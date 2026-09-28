/**
 * E4-L §8/§30 — the CONSUMER-OWNED READ PORTS.
 *
 * ## The port wall (§30)
 *
 * `src/institutional_learning/**` must not import an evolution MUTATION API, an Organization/RuntimeScope
 * mutation, or the OrganizationMemory concrete service. It READS durable evolution history, projects an
 * intervention, and writes it through OrganizationMemory's OWN `recordIntervention`.
 *
 * So it declares narrow capabilities and composition adapts the owners into them. There is deliberately
 * NO mutation method onto OrganizationEvolution, RuntimeEvolution, RuntimeScope or an Organization: the
 * learning layer observes structural change, it never makes it.
 *
 * Layer: L2 (`src/institutional_learning/`).
 */
import type { StructuralLane, StructuralInterventionProjection } from "./projection.js";

/** §8: one activated-or-not structural case, read from its OWN evolution history. */
export interface StructuralCaseView {
  readonly lane: StructuralLane;
  readonly caseRef: string;
  /** The case's events in order. The projection reads them; it does not interpret a store. */
  readonly events: readonly { readonly type: string; readonly payload: unknown }[];
}

/**
 * §8: the durable evolution-history READ. `cases()` enumerates every case this host holds for a lane —
 * the input to reconciliation.
 */
export interface StructuralHistoryPort {
  cases(lane: StructuralLane): Promise<readonly StructuralCaseView[]>;
  /** One case by ref, or undefined when this lane has no such case. */
  case(lane: StructuralLane, caseRef: string): Promise<StructuralCaseView | undefined>;
}

/**
 * §9/§10: the empirical-memory READ + the ONE write the learning layer performs.
 *
 * `record` routes to the EXISTING `OrganizationMemory.recordIntervention`; it is not a new store and
 * grants no authority. The projection's fields map onto the existing `InterventionRecord` shape.
 */
export interface InterventionMemoryPort {
  existing(): Promise<readonly { readonly interventionRef: string; readonly evolutionCaseRef?: string | undefined; readonly contentDigest: string }[]>;
  record(projection: StructuralInterventionProjection): Promise<{ readonly interventionRef: string }>;
}
