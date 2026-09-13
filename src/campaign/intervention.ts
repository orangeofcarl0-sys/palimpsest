/**
 * G10-G3 epistemic intervention (§86–§102).
 *
 * An intervention is a finite operational experiment within a long-horizon
 * Campaign. It observes canonical Work state (read-only) and derives an
 * EPISTEMIC outcome from the pre/post belief states of its target hypotheses.
 *
 *   OperationalOutcome ≠ EpistemicOutcome  (§7/§87)
 *   Intervention ≠ Attempt                 (§89)
 *
 * Operational status NEVER changes belief (§98): only admitted evidence
 * observations (recorded by G2) can revise CurrentBeliefState. A completed
 * Project that refutes a hypothesis is legitimate information gain; a failed
 * Project that still changed the belief records that transition too.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { CampaignEventParsers } from "./artifacts.js";
import type { CampaignBeliefStanding, CampaignEvidencePort, CurrentBeliefState, EvidenceClaimRef } from "./epistemic.js";
import { currentBeliefStateOf } from "./epistemic.js";
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";
import type { BeliefRevision } from "./epistemic.js";

export type InterventionId = string;

export interface CampaignProjectRef {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
}

export type WorkKnowledge<T> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "unknown"; readonly detail: string }
  | { readonly state: "error"; readonly detail: string };

export type ProjectOperationalStanding = "completed" | "failed" | "cancelled" | "partial" | "running";

export interface CampaignWorkObservationPort {
  inspectProject(project: CampaignProjectRef): Promise<WorkKnowledge<ProjectOperationalStanding>>;
}

export type InterventionPurpose = "test" | "measure" | "explore";

export interface PreBeliefStanding {
  readonly hypothesisId: string;
  readonly standing: CampaignBeliefStanding;
}

export interface CampaignIntervention {
  readonly interventionId: InterventionId;
  readonly campaignId: string;
  readonly project: CampaignProjectRef;
  readonly purpose: InterventionPurpose;
  readonly targetHypothesisIds: readonly string[];
  readonly preBeliefStateDigest: string;
  /** Per-target pre-intervention standing — the basis for epistemic delta (§95). */
  readonly preBeliefStandings: readonly PreBeliefStanding[];
}

export type EpistemicOutcome = "supporting" | "refuting" | "mixed" | "inconclusive" | "stale" | "unchanged";

export interface EpistemicClassification {
  readonly hypothesisId: string;
  readonly before: CampaignBeliefStanding;
  readonly after: CampaignBeliefStanding;
  readonly classification: EpistemicOutcome;
}

export function materializeCampaignProjectRef(input: { readonly projectId: string; readonly revision: number; readonly digest: string }): CampaignProjectRef {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new CampaignStoreError("invalid_registration", "project revision must be a safe non-negative integer");
  }
  return Object.freeze({
    projectId: stableId(input.projectId, "projectId"),
    revision: input.revision,
    digest: nonEmpty(input.digest, "digest"),
  });
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isStableIdentifier(normalizeStableIdentifier(value))) {
    throw new CampaignStoreError("invalid_registration", `${what} must be a stable identifier`);
  }
  return value;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CampaignStoreError("invalid_registration", `${what} must be a non-empty string`);
  }
  return value;
}

export function classifyEpistemicChange(before: CampaignBeliefStanding, after: CampaignBeliefStanding): EpistemicOutcome {
  if (before === after) return "unchanged";
  if (after === "stale") return "stale";
  if (after === "contradicted") return "refuting";
  if (after === "supported") return "supporting";
  if (after === "inconclusive") return "inconclusive";
  return "mixed";
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

const INTERVENTION_KEYS = [
  "interventionId",
  "campaignId",
  "project",
  "purpose",
  "targetHypothesisIds",
  "preBeliefStateDigest",
  "preBeliefStandings",
] as const;

export function parseCampaignIntervention(raw: unknown): CampaignIntervention {
  const object = asRecord(raw, "CampaignIntervention");
  exactKeys(object, INTERVENTION_KEYS, "CampaignIntervention");
  const project = asRecord(object.project, "CampaignIntervention.project");
  exactKeys(project, ["projectId", "revision", "digest"], "CampaignIntervention.project");
  const purpose = object.purpose;
  if (purpose !== "test" && purpose !== "measure" && purpose !== "explore") {
    throw new CampaignStoreError("malformed_record", "intervention purpose must be test, measure, or explore");
  }
  if (!Array.isArray(object.targetHypothesisIds)) throw new CampaignStoreError("malformed_record", "targetHypothesisIds must be an array");
  if (!Array.isArray(object.preBeliefStandings)) throw new CampaignStoreError("malformed_record", "preBeliefStandings must be an array");
  return Object.freeze({
    interventionId: stableId(object.interventionId, "interventionId"),
    campaignId: stableId(object.campaignId, "campaignId"),
    project: materializeCampaignProjectRef({ projectId: project.projectId as string, revision: project.revision as number, digest: project.digest as string }),
    purpose,
    targetHypothesisIds: Object.freeze(object.targetHypothesisIds.map((entry) => stableId(entry, "targetHypothesisId"))),
    preBeliefStateDigest: nonEmpty(object.preBeliefStateDigest, "preBeliefStateDigest"),
    preBeliefStandings: Object.freeze(
      object.preBeliefStandings.map((entry) => {
        const standing = asRecord(entry, "preBeliefStanding");
        exactKeys(standing, ["hypothesisId", "standing"], "preBeliefStanding");
        return Object.freeze({
          hypothesisId: stableId(standing.hypothesisId, "hypothesisId"),
          standing: standing.standing as CampaignBeliefStanding,
        });
      }),
    ),
  });
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignStoreError("malformed_record", `${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new CampaignStoreError("malformed_record", `unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) throw new CampaignStoreError("malformed_record", `${what}: field "${key}" is required`);
  }
}

export const CAMPAIGN_INTERVENTION_EVENT_PARSERS: CampaignEventParsers = Object.freeze({
  INTERVENTION_REGISTERED: (payload: unknown) => {
    const object = asRecord(payload, "INTERVENTION_REGISTERED");
    exactKeys(object, ["intervention"], "INTERVENTION_REGISTERED");
    return Object.freeze({ intervention: parseCampaignIntervention(object.intervention) });
  },
  INTERVENTION_OPERATIONAL_OBSERVED: (payload: unknown) => {
    const object = asRecord(payload, "INTERVENTION_OPERATIONAL_OBSERVED");
    exactKeys(object, ["interventionId", "knowledge", "standing"], "INTERVENTION_OPERATIONAL_OBSERVED");
    return Object.freeze({
      interventionId: stableId(object.interventionId, "interventionId"),
      knowledge: object.knowledge as string,
      standing: (object.standing ?? null) as string | null,
    });
  },
  INTERVENTION_EPISTEMIC_ASSESSED: (payload: unknown) => {
    const object = asRecord(payload, "INTERVENTION_EPISTEMIC_ASSESSED");
    exactKeys(object, ["interventionId", "classifications", "aggregate"], "INTERVENTION_EPISTEMIC_ASSESSED");
    if (!Array.isArray(object.classifications)) throw new CampaignStoreError("malformed_record", "classifications must be an array");
    return Object.freeze({
      interventionId: stableId(object.interventionId, "interventionId"),
      classifications: Object.freeze(
        object.classifications.map((entry) => {
          const item = asRecord(entry, "classification");
          exactKeys(item, ["hypothesisId", "before", "after", "classification"], "classification");
          return Object.freeze({
            hypothesisId: item.hypothesisId as string,
            before: item.before as CampaignBeliefStanding,
            after: item.after as CampaignBeliefStanding,
            classification: item.classification as EpistemicOutcome,
          });
        }),
      ),
      aggregate: object.aggregate as EpistemicOutcome,
    });
  },
});

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export interface InterventionServiceDeps {
  readonly store: CampaignStore;
  readonly allocateInterventionId: () => InterventionId;
  readonly work?: CampaignWorkObservationPort | undefined;
  readonly evidence?: CampaignEvidencePort | undefined;
}

export interface CampaignInterventionState {
  readonly intervention: CampaignIntervention;
  readonly operational: ProjectOperationalStanding | null;
  readonly knowledge: "known" | "unknown" | "error" | "unobserved";
  readonly epistemic: EpistemicOutcome | null;
}

export interface InterventionService {
  register(input: {
    readonly campaignId: string;
    readonly project: CampaignProjectRef;
    readonly purpose: InterventionPurpose;
    readonly targetHypothesisIds: readonly string[];
  }): Promise<CampaignIntervention>;
  observeOperational(interventionId: InterventionId): Promise<WorkKnowledge<ProjectOperationalStanding>>;
  assessEpistemic(interventionId: InterventionId): Promise<{ readonly classifications: readonly EpistemicClassification[]; readonly aggregate: EpistemicOutcome }>;
  interventions(campaignId: string): Promise<readonly CampaignInterventionState[]>;
}

export function makeInterventionService(deps: InterventionServiceDeps): InterventionService {
  async function replay(campaignId: string): Promise<readonly CampaignEvent[]> {
    return deps.store.replay(campaignId);
  }

  async function beliefRevisions(campaignId: string): Promise<readonly BeliefRevision[]> {
    return (await replay(campaignId))
      .filter((event) => event.type === "BELIEF_REVISED")
      .map((event) => (event.payload as { revision: BeliefRevision }).revision);
  }

  async function beliefState(campaignId: string): Promise<CurrentBeliefState> {
    return currentBeliefStateOf(campaignId, await beliefRevisions(campaignId));
  }

  async function interventionById(campaignId: string, interventionId: InterventionId): Promise<CampaignIntervention | undefined> {
    for (const event of await replay(campaignId)) {
      if (event.type === "INTERVENTION_REGISTERED") {
        const intervention = (event.payload as { intervention: CampaignIntervention }).intervention;
        if (intervention.interventionId === interventionId) return intervention;
      }
    }
    return undefined;
  }

  async function currentBasis(campaignId: string) {
    const basis = await deps.store.basis(campaignId);
    if (basis === undefined) throw new CampaignStoreError("unknown_campaign", `campaign "${campaignId}" does not exist`);
    return basis;
  }

  function request(type: string, campaignId: string, payload: unknown): CampaignAppendRequest {
    return {
      eventId: `evt-${canonicalDigest({ domain: "palimpsest.campaign-event.v1", type, campaignId, payload }).slice(0, 24)}`,
      type: type as CampaignAppendRequest["type"],
      payload,
    };
  }

  async function register(input: {
    readonly campaignId: string;
    readonly project: CampaignProjectRef;
    readonly purpose: InterventionPurpose;
    readonly targetHypothesisIds: readonly string[];
  }): Promise<CampaignIntervention> {
    const basis = await currentBasis(input.campaignId);
    const state = await beliefState(input.campaignId);
    const preBeliefStandings = input.targetHypothesisIds.map((hypothesisId) => {
      const entry = state.entries.find((candidate) => candidate.hypothesisId === hypothesisId);
      return Object.freeze({ hypothesisId, standing: entry?.standing ?? ("inconclusive" as CampaignBeliefStanding) });
    });
    const intervention: CampaignIntervention = Object.freeze({
      interventionId: deps.allocateInterventionId(),
      campaignId: input.campaignId,
      project: materializeCampaignProjectRef(input.project),
      purpose: input.purpose,
      targetHypothesisIds: Object.freeze([...input.targetHypothesisIds]),
      preBeliefStateDigest: state.digest,
      preBeliefStandings: Object.freeze(preBeliefStandings),
    });
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("INTERVENTION_REGISTERED", input.campaignId, { intervention })],
    });
    return intervention;
  }

  async function findCampaign(interventionId: InterventionId): Promise<{ campaignId: string; intervention?: CampaignIntervention } | undefined> {
    // Interventions are looked up by scanning known campaigns.
    for (const definition of await deps.store.campaigns()) {
      const intervention = await interventionById(definition.campaignId, interventionId);
      if (intervention !== undefined) return { campaignId: definition.campaignId, intervention };
    }
    return undefined;
  }

  async function observeOperational(interventionId: InterventionId): Promise<WorkKnowledge<ProjectOperationalStanding>> {
    const located = await findCampaign(interventionId);
    if (located === undefined || located.intervention === undefined) {
      throw new CampaignStoreError("invalid_registration", `intervention "${interventionId}" was never registered`);
    }
    if (deps.work === undefined) {
      return Object.freeze({ state: "unknown", detail: "no CampaignWorkObservationPort is configured" });
    }
    const knowledge = await deps.work.inspectProject(located.intervention.project);
    if (knowledge.state === "known") {
      // Operational outcome is OBSERVED, never set (§93); it never touches belief.
      const basis = await currentBasis(located.campaignId);
      await deps.store.appendAtomic({
        expectedBasis: basis,
        events: [
          request("INTERVENTION_OPERATIONAL_OBSERVED", located.campaignId, {
            interventionId,
            knowledge: "known",
            standing: knowledge.value,
          }),
        ],
      });
    }
    return knowledge;
  }

  async function assessEpistemic(
    interventionId: InterventionId,
  ): Promise<{ readonly classifications: readonly EpistemicClassification[]; readonly aggregate: EpistemicOutcome }> {
    const located = await findCampaign(interventionId);
    if (located === undefined || located.intervention === undefined) {
      throw new CampaignStoreError("invalid_registration", `intervention "${interventionId}" was never registered`);
    }
    const state = await beliefState(located.campaignId);
    const classifications: EpistemicClassification[] = located.intervention.preBeliefStandings.map((pre) => {
      const after = state.entries.find((entry) => entry.hypothesisId === pre.hypothesisId)?.standing ?? pre.standing;
      return Object.freeze({
        hypothesisId: pre.hypothesisId,
        before: pre.standing,
        after,
        classification: classifyEpistemicChange(pre.standing, after),
      });
    });
    const kinds = new Set(classifications.map((entry) => entry.classification));
    const aggregate: EpistemicOutcome =
      kinds.size === 1 ? [...kinds][0]! : kinds.has("refuting") ? "mixed" : kinds.has("supporting") ? "mixed" : "inconclusive";
    const basis = await currentBasis(located.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("INTERVENTION_EPISTEMIC_ASSESSED", located.campaignId, { interventionId, classifications, aggregate })],
    });
    return Object.freeze({ classifications: Object.freeze(classifications), aggregate });
  }

  async function interventions(campaignId: string): Promise<readonly CampaignInterventionState[]> {
    const events = await replay(campaignId);
    const byId = new Map<InterventionId, CampaignInterventionState>();
    for (const event of events) {
      switch (event.type) {
        case "INTERVENTION_REGISTERED": {
          const intervention = (event.payload as { intervention: CampaignIntervention }).intervention;
          byId.set(intervention.interventionId, { intervention, operational: null, knowledge: "unobserved", epistemic: null });
          break;
        }
        case "INTERVENTION_OPERATIONAL_OBSERVED": {
          const payload = event.payload as { interventionId: InterventionId; knowledge: "known" | "unknown" | "error"; standing: ProjectOperationalStanding | null };
          const existing = byId.get(payload.interventionId);
          if (existing !== undefined) {
            byId.set(payload.interventionId, {
              ...existing,
              operational: payload.standing,
              knowledge: payload.knowledge,
            });
          }
          break;
        }
        case "INTERVENTION_EPISTEMIC_ASSESSED": {
          const payload = event.payload as { interventionId: InterventionId; aggregate: EpistemicOutcome };
          const existing = byId.get(payload.interventionId);
          if (existing !== undefined) byId.set(payload.interventionId, { ...existing, epistemic: payload.aggregate });
          break;
        }
        default:
          break;
      }
    }
    return Object.freeze([...byId.values()]);
  }

  return { register, observeOperational, assessEpistemic, interventions };
}

export type { EvidenceClaimRef };
export type { CampaignEvent };
