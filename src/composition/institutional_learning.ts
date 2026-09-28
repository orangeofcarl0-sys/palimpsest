/**
 * E4-L §8/§24/§30 — the INSTITUTIONAL-LEARNING composition adapter.
 *
 *     composition knows wiring;  institutional_learning knows intervention-projection semantics.
 *
 * This module is the ONE place that may see the concrete evolution stores, the OrganizationMemory service
 * and the runtime-scope store, and adapt their READS into the learning owner's ports. It holds NO policy:
 * every judgement (is this case activated? was a proposal bound? is this lane which?) belongs to
 * `src/institutional_learning/`.
 *
 * The single WRITE is `memory.record`, which routes to the EXISTING `OrganizationMemory.recordIntervention`
 * — no new store, and no mutation of any structure. There is deliberately NO port onto
 * `OrganizationEvolution.advanceEvolution`, `RuntimeEvolution.advanceRuntimeEvolution`, an Organization or
 * a RuntimeScope: the learning layer observes structural change, it never makes it (§23/§25).
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import type { OrganizationMemoryService } from "../organization_memory/index.js";
import { materializeIntervention } from "../organization_memory/index.js";
import { interventionContentDigestOfRecord, makeInstitutionalLearningService } from "../institutional_learning/index.js";
import type {
  EvaluationQueryPort,
  InstitutionalLearningService,
  InterventionMemoryPort,
  StructuralCaseView,
  StructuralHistoryPort,
  StructuralLane,
  StructuralInterventionProjection,
} from "../institutional_learning/index.js";

/**
 * The narrow evolution-history surface this adapter reads, declared STRUCTURALLY.
 *
 * Naming the concrete stores would add importer edges for three method shapes; here the shapes are spelled
 * out, so this module depends on the capabilities rather than on the classes — the same discipline
 * `project_intent.ts` and `project_collaboration.ts` follow.
 */
interface EvolutionHistoryStore {
  cases(): Promise<readonly { readonly caseRef: string }[]>;
  case(caseRef: string): Promise<{ readonly caseRef: string } | undefined>;
  replay(caseRef: string): Promise<readonly { readonly type: string; readonly payload: unknown }[]>;
}

export interface InstitutionalLearningCompositionInput {
  readonly organizationEvolutionStore: EvolutionHistoryStore | undefined;
  readonly runtimeEvolutionStore: EvolutionHistoryStore | undefined;
  readonly organizationMemory: OrganizationMemoryService | undefined;
  readonly clock?: (() => string) | undefined;
}

/**
 * Adapt the composed owners into the learning owner's ports.
 *
 * Every capability is present EXACTLY when its owner is composed — no stub stands in for an absent owner.
 * `undefined` is returned only when the minimum (an evolution history AND the empirical memory to record
 * into) is absent.
 */
export function composeInstitutionalLearningPorts(
  input: InstitutionalLearningCompositionInput,
): {
  readonly history: StructuralHistoryPort;
  readonly memory: InterventionMemoryPort;
  readonly evaluations: EvaluationQueryPort;
} | undefined {
  const { organizationEvolutionStore, runtimeEvolutionStore, organizationMemory } = input;
  if (organizationMemory === undefined) return undefined;
  if (organizationEvolutionStore === undefined && runtimeEvolutionStore === undefined) return undefined;

  const storeFor = (lane: StructuralLane): EvolutionHistoryStore | undefined =>
    lane === "organization_evolution" ? organizationEvolutionStore : runtimeEvolutionStore;

  /** §8: the durable evolution-history READ. A lane with no store honestly reports no cases. */
  const history: StructuralHistoryPort = {
    async cases(lane: StructuralLane): Promise<readonly StructuralCaseView[]> {
      const store = storeFor(lane);
      if (store === undefined) return Object.freeze([]);
      const records = await store.cases();
      const views: StructuralCaseView[] = [];
      for (const record of records) {
        views.push(await viewOf(store, lane, record.caseRef));
      }
      return Object.freeze(views);
    },
    async case(lane: StructuralLane, caseRef: string): Promise<StructuralCaseView | undefined> {
      const store = storeFor(lane);
      if (store === undefined) return undefined;
      const record = await store.case(caseRef);
      return record === undefined ? undefined : viewOf(store, lane, record.caseRef);
    },
  };

  /**
   * §9: the ONE write. It maps a projection onto the EXISTING `InterventionRecord` shape and calls the
   * memory owner's own `recordIntervention` — the learning layer never writes an event itself.
   *
   * `existing()` reports the records already held, so reconciliation can compare content and be idempotent
   * without a second index.
   */
  const memory: InterventionMemoryPort = {
    async existing() {
      const records = await organizationMemory.interventions();
      return Object.freeze(
        records.map((record) =>
          Object.freeze({
            interventionRef: record.interventionRef,
            ...(record.evolutionCaseRef === undefined ? {} : { evolutionCaseRef: record.evolutionCaseRef }),
            // The content fingerprint reconciliation compares: the fields the projection derives, in the
            // same canonical order the projection digests. Recomputed from the STORED record, so a
            // differing interpretation is detected rather than assumed away.
            contentDigest: interventionContentDigestOfRecord(record),
          }),
        ),
      );
    },
    async record(projection: StructuralInterventionProjection) {
      const record = materializeIntervention({
        subjectRefs: projection.subjectRefs,
        rationale: projection.rationale,
        observationBasis: projection.observationBasis,
        recordedAt: (input.clock ?? (() => new Date().toISOString()))(),
        proposalDigest: projection.proposalDigest,
        evolutionCaseRef: projection.evolutionCaseRef,
        beforeRef: projection.beforeRef,
        // §19: an absent immediate post-observation stays absent — never synthesized.
        ...(projection.afterRef === null ? {} : { afterRef: projection.afterRef }),
      });
      const stored = await organizationMemory.recordIntervention(record);
      return Object.freeze({ interventionRef: stored.interventionRef });
    },
  };

  /**
   * §17: the derived evaluation join. Both halves come from the ordinary memory history — the intervention
   * from the interventions scope, the experiments from their own scopes — so no new truth is introduced.
   */
  const evaluations: EvaluationQueryPort = {
    async intervention(interventionRef: string) {
      const record = await organizationMemory.intervention(interventionRef);
      if (record === undefined) return undefined;
      return Object.freeze({
        interventionRef: record.interventionRef,
        evolutionCaseRef: record.evolutionCaseRef ?? null,
        proposalDigest: record.proposalDigest ?? null,
      });
    },
    async experimentsFor(interventionRef: string) {
      const definitions = await organizationMemory.experimentsForIntervention(interventionRef);
      const views = [];
      for (const definition of definitions) {
        const evaluations = await organizationMemory.evaluations(definition.experimentId);
        views.push(
          Object.freeze({
            experimentRef: definition.experimentId,
            objective: definition.objective,
            evaluationRefs: Object.freeze(evaluations.map((evaluation) => evaluation.evaluationRef)),
          }),
        );
      }
      return Object.freeze(views);
    },
  };

  return Object.freeze({ history, memory, evaluations });
}

/** Read one case's events through its OWN store, as a lane-tagged view. */
async function viewOf(store: EvolutionHistoryStore, lane: StructuralLane, caseRef: string): Promise<StructuralCaseView> {
  const events = await store.replay(caseRef);
  return Object.freeze({
    lane,
    caseRef,
    events: Object.freeze(events.map((event) => Object.freeze({ type: event.type, payload: event.payload }))),
  });
}

/**
 * Compose the packaged learning surface: adapt the owners into the ports AND build the service.
 *
 * This wrapper exists so the composition ROOT never names `src/institutional_learning/` directly.
 * `install.ts` is a composition root with a §25 ceiling on how many capability families it may import, and
 * the honest response is to keep the family behind the adapter that already knows how to wire it.
 */
export function composeInstitutionalLearningCapability(
  input: InstitutionalLearningCompositionInput,
): InstitutionalLearningService | undefined {
  const ports = composeInstitutionalLearningPorts(input);
  if (ports === undefined) return undefined;
  return makeInstitutionalLearningService({
    ...ports,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });
}
