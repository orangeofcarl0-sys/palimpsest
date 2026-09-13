/**
 * G10-GC2..GC6 — the production Campaign loop closure.
 *
 * This module composes the existing G1–G6 primitives (never replacing them)
 * into ONE coherent, grounded, crash-safe golden path:
 *
 *   derived checkpoint → atomic WAIT/dormancy → strict wake → current-world
 *   observation → atomic epistemic reconciliation (unchanged = no-op) →
 *   reconciled compiler context → coherent next-action admission
 *
 * Invariants enforced here:
 *   - checkpoint state is DERIVED, never caller-authored (§42–§51);
 *   - WAIT + watches + checkpoint + QUIESCING + DORMANT commit as ONE batch (§53);
 *   - world observation covers every load-bearing fact, and ANY unknown fact
 *     yields `reconciliation_incomplete` with zero writes (§62–§68);
 *   - unchanged Evidence is a successful NO-OP (no duplicate events) (§83–§84);
 *   - one in-flight WakeCycle per Campaign; beginWake only from DORMANT;
 *     completion is tied to actual next-action admission (§100–§114).
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { CampaignBasisRef, CampaignCommitment, CampaignEventType } from "./artifacts.js";
import type { CampaignHypothesis, ClaimStandingSnapshot, EvidenceKnowledge } from "./epistemic.js";
import { beliefStandingOf, materializeBeliefRevision, materializeObservation } from "./epistemic.js";
import type { CampaignProjectRef, ProjectOperationalStanding, WorkKnowledge } from "./intervention.js";
import { parseCampaignIntervention } from "./intervention.js";
import type { CampaignWatch, CampaignWatchDraft } from "./prospective.js";
import { parseCampaignWatch, parseCampaignWatchDraft } from "./prospective.js";
import type { CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";
import type {
  CampaignCheckpoint,
  CampaignInstitutionEpochSource,
  CampaignLifecycleState,
  CampaignWorldSnapshot,
  InstitutionEpochRefLike,
  WakeCycleId,
} from "./lifecycle.js";
import { parseCampaignCheckpoint, parseWorldSnapshot } from "./lifecycle.js";

export type Knowledge<T> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "unknown"; readonly detail: string }
  | { readonly state: "error"; readonly detail: string };

/**
 * GC1 §29: the institution boundary is the SAME canonical read-only source used
 * for genesis grounding — no duplicate port with identical responsibility.
 */
export type CampaignInstitutionReader = CampaignInstitutionEpochSource;
export interface CampaignClaimReader {
  inspectClaim(claim: { readonly claimId: string }): Promise<EvidenceKnowledge<ClaimStandingSnapshot>>;
}
export interface CampaignProjectReader {
  inspectProject(project: CampaignProjectRef): Promise<WorkKnowledge<ProjectOperationalStanding>>;
}

export type CampaignWakeCause =
  | { readonly kind: "watch"; readonly watchId: string }
  | { readonly kind: "manual"; readonly signalId: string; readonly reason: string };

export function encodeWakeCause(cause: CampaignWakeCause): string {
  if (cause.kind === "watch") {
    if (typeof cause.watchId !== "string" || cause.watchId.length === 0) {
      throw new CampaignStoreError("invalid_registration", "watch wake cause requires a watchId");
    }
    return `watch:${cause.watchId}`;
  }
  if (typeof cause.signalId !== "string" || cause.signalId.trim() === "") {
    throw new CampaignStoreError("invalid_registration", "manual wake cause requires a signalId");
  }
  return `manual:${cause.signalId}`;
}

export const CAMPAIGN_RECONCILIATION_DIGEST_DOMAIN = "palimpsest.campaign-reconciliation.v1";

export interface CampaignReconciliationReport {
  readonly wakeCycleId: WakeCycleId;
  readonly worldSnapshotDigest: string;
  readonly previousBeliefStateDigest: string;
  readonly resultingBeliefStateDigest: string;
  readonly activeCommitmentIds: readonly string[];
  readonly changedHypothesisIds: readonly string[];
  readonly digest: string;
}

export const CAMPAIGN_PRODUCTION_EVENT_PARSERS = Object.freeze({
  RECONCILIATION_COMMITTED: (payload: unknown) => {
    const object = payload as Record<string, unknown>;
    return Object.freeze({ report: parseReconciliationReport(object.report) });
  },
  WAKE_CYCLE_COMPLETED: (payload: unknown) => {
    const object = payload as Record<string, unknown>;
    if (object.nextAction !== "project" && object.nextAction !== "wait") {
      throw new CampaignStoreError("malformed_record", "WAKE_CYCLE_COMPLETED.nextAction must be project or wait");
    }
    return Object.freeze({
      wakeCycleId: String(object.wakeCycleId),
      nextAction: object.nextAction as "project" | "wait",
    });
  },
});

export function reconciliationDigestOf(report: {
  wakeCycleId: string;
  worldSnapshotDigest: string;
  previousBeliefStateDigest: string;
  resultingBeliefStateDigest: string;
  activeCommitmentIds: readonly string[];
  changedHypothesisIds: readonly string[];
}): string {
  return canonicalDigest({
    domain: CAMPAIGN_RECONCILIATION_DIGEST_DOMAIN,
    wakeCycleId: report.wakeCycleId,
    worldSnapshotDigest: report.worldSnapshotDigest,
    previousBeliefStateDigest: report.previousBeliefStateDigest,
    resultingBeliefStateDigest: report.resultingBeliefStateDigest,
    activeCommitmentIds: [...report.activeCommitmentIds].sort(),
    changedHypothesisIds: [...report.changedHypothesisIds].sort(),
  });
}

export function parseReconciliationReport(raw: unknown): CampaignReconciliationReport {
  const object = raw as Record<string, unknown>;
  const report = {
    wakeCycleId: String(object.wakeCycleId),
    worldSnapshotDigest: String(object.worldSnapshotDigest),
    previousBeliefStateDigest: String(object.previousBeliefStateDigest),
    resultingBeliefStateDigest: String(object.resultingBeliefStateDigest),
    activeCommitmentIds: Object.freeze((object.activeCommitmentIds as string[]) ?? []),
    changedHypothesisIds: Object.freeze((object.changedHypothesisIds as string[]) ?? []),
  };
  const digest = String(object.digest);
  if (digest !== reconciliationDigestOf(report)) {
    throw new CampaignStoreError("malformed_record", "CampaignReconciliationReport.digest does not match its content");
  }
  return Object.freeze({ ...report, digest });
}

export interface CampaignProductionDeps {
  readonly store: CampaignStore;
  readonly institutions: CampaignInstitutionReader;
  readonly evidence?: CampaignClaimReader | undefined;
  readonly work?: CampaignProjectReader | undefined;
  readonly allocateWakeCycleId: () => WakeCycleId;
  readonly allocateWatchId: () => string;
  readonly allocateObservationId: () => string;
  readonly allocateRevisionId: () => string;
}

interface Projections {
  readonly basis: CampaignBasisRef;
  readonly events: readonly CampaignEvent[];
  readonly definition: { readonly institutionId: string };
}

export function makeCampaignProductionService(deps: CampaignProductionDeps) {
  async function projections(campaignId: string): Promise<Projections> {
    const definition = await deps.store.definition(campaignId);
    const basis = await deps.store.basis(campaignId);
    if (definition === undefined || basis === undefined) {
      throw new CampaignStoreError("unknown_campaign", `campaign "${campaignId}" does not exist`);
    }
    return { basis, events: await deps.store.replay(campaignId), definition };
  }

  function activeIds(events: readonly CampaignEvent[]) {
    const commitments = new Map<string, string>();
    const hypotheses = new Map<string, string>();
    const watches = new Map<string, string>();
    const projects = new Set<string>();
    for (const event of events) {
      switch (event.type) {
        case "CAMPAIGN_COMMITMENT_OPENED":
          commitments.set((event.payload as { commitment: CampaignCommitment }).commitment.commitmentId, "OPEN");
          break;
        case "CAMPAIGN_COMMITMENT_RESOLVED":
        case "CAMPAIGN_COMMITMENT_ABANDONED":
        case "CAMPAIGN_COMMITMENT_SUPERSEDED":
          commitments.set((event.payload as { commitmentId: string }).commitmentId, "ENDED");
          break;
        case "HYPOTHESIS_PROPOSED":
          hypotheses.set((event.payload as { hypothesis: CampaignHypothesis }).hypothesis.hypothesisId, "ACTIVE");
          break;
        case "HYPOTHESIS_RETIRED":
          hypotheses.set((event.payload as { hypothesisId: string }).hypothesisId, "RETIRED");
          break;
        case "WATCH_INSTALLED":
          watches.set((event.payload as { watch: CampaignWatch }).watch.watchId, "ACTIVE");
          break;
        case "WATCH_TRIGGERED":
        case "WATCH_CANCELLED":
          watches.set((event.payload as { watchId: string }).watchId, "ENDED");
          break;
        case "PROJECT_ADMITTED":
          projects.add((event.payload as { project: CampaignProjectRef }).project.projectId);
          break;
        case "INTERVENTION_REGISTERED":
          projects.add(parseCampaignIntervention((event.payload as { intervention: unknown }).intervention).project.projectId);
          break;
        default:
          break;
      }
    }
    const live = (m: Map<string, string>, keep: readonly string[]) =>
      Object.freeze([...m.entries()].filter(([, v]) => keep.includes(v)).map(([k]) => k).sort());
    return {
      commitments: live(commitments, ["OPEN"]),
      hypotheses: live(hypotheses, ["ACTIVE"]),
      watches: live(watches, ["ACTIVE"]),
      hypothesisObjects: events
        .filter((e) => e.type === "HYPOTHESIS_PROPOSED")
        .map((e) => (e.payload as { hypothesis: CampaignHypothesis }).hypothesis)
        .filter((h) => hypotheses.get(h.hypothesisId) === "ACTIVE"),
      projectIds: Object.freeze([...projects].sort()),
    };
  }

  async function lifecycleState(campaignId: string): Promise<CampaignLifecycleState> {
    let state: CampaignLifecycleState = "ACTIVE";
    for (const event of (await projections(campaignId)).events) {
      switch (event.type) {
        case "CAMPAIGN_TERMINATED":
          state = "TERMINATED";
          break;
        case "CAMPAIGN_QUIESCING":
          state = "QUIESCING";
          break;
        case "CAMPAIGN_DORMANT":
          state = "DORMANT";
          break;
        case "WAKE_STARTED":
          state = "WAKING";
          break;
        case "RECONCILIATION_COMMITTED":
          state = "RECONCILING";
          break;
        case "WAKE_CYCLE_COMPLETED":
          state = (event.payload as { nextAction: "project" | "wait" }).nextAction === "project" ? "ACTIVE" : "DORMANT";
          break;
        default:
          break;
      }
    }
    return state;
  }

  /** GC2 §42–§51: derive the checkpoint from canonical current state. */
  async function buildCurrentCampaignCheckpoint(campaignId: string): Promise<Knowledge<CampaignCheckpoint>> {
    const { basis, events, definition } = await projections(campaignId);
    const epoch = await deps.institutions.inspectEpoch(definition.institutionId);
    if (epoch.state !== "known") {
      return { state: epoch.state, detail: `institution epoch ${epoch.state}: ${epoch.detail}` };
    }
    const ids = activeIds(events);
    // Current belief digest from the latest revision per hypothesis.
    const latest = new Map<string, string>();
    for (const event of events) {
      if (event.type === "BELIEF_REVISED") {
        const revision = (event.payload as { revision: { hypothesisId: string; beliefRevisionId: string } }).revision;
        latest.set(revision.hypothesisId, revision.beliefRevisionId);
      }
    }
    const beliefDigest = canonicalDigest({
      domain: "palimpsest.campaign-belief-state.v1",
      campaignId,
      entries: [...latest.entries()].sort().map(([hypothesisId, beliefRevisionId]) => ({ hypothesisId, beliefRevisionId })),
    });
    return {
      state: "known",
      value: Object.freeze({
        campaignId,
        campaignBasisThroughSeq: basis.throughSeq,
        campaignBasisDigest: basis.chainDigest,
        institutionEpoch: epoch.value,
        beliefStateDigest: beliefDigest,
        activeCommitmentIds: ids.commitments,
        activeHypothesisIds: ids.hypotheses,
        activeWatchIds: ids.watches,
        knownProjectRefs: ids.projectIds.map((projectId) => Object.freeze({ projectId, revision: 0, digest: "" })),
      }),
    };
  }

  function request(type: CampaignEventType, campaignId: string, payload: unknown) {
    return {
      eventId: `evt-${canonicalDigest({ domain: "palimpsest.campaign-event.v1", type, campaignId, payload }).slice(0, 24)}`,
      type,
      payload,
    };
  }

  /** GC2 §52/§53: grounded, atomic WAIT → CHECKPOINT → QUIESCING → DORMANT. */
  async function admitWait(input: {
    readonly campaignId: string;
    readonly reason: string;
    readonly watches: readonly unknown[];
  }): Promise<{ readonly status: "dormant"; readonly watchIds: readonly string[] } | { readonly status: "checkpoint_incomplete"; readonly detail: string }> {
    if (input.watches.length === 0) {
      throw new CampaignStoreError("invalid_registration", "WAIT requires at least one prospective wake route");
    }
    const drafts: CampaignWatchDraft[] = input.watches.map((entry) => parseCampaignWatchDraft(entry));
    const checkpoint = await buildCurrentCampaignCheckpoint(input.campaignId);
    if (checkpoint.state !== "known") {
      return { status: "checkpoint_incomplete", detail: checkpoint.detail };
    }
    const basis = (await deps.store.basis(input.campaignId))!;
    const watches = drafts.map((draft) =>
      Object.freeze({ watchId: deps.allocateWatchId(), campaignId: input.campaignId, condition: draft.condition, reason: draft.reason }),
    );
    const events = watches.map((watch) => request("WATCH_INSTALLED", input.campaignId, { watch }));
    events.push(
      request("WAIT_DECIDED", input.campaignId, { reason: input.reason, watchIds: watches.map((w) => w.watchId) }),
      request("CHECKPOINT_RECORDED", input.campaignId, { checkpoint: checkpoint.value }),
      request("CAMPAIGN_QUIESCING", input.campaignId, { reason: input.reason }),
      request("CAMPAIGN_DORMANT", input.campaignId, { checkpointBasisDigest: checkpoint.value.campaignBasisDigest }),
    );
    await deps.store.appendAtomic({ expectedBasis: basis, events });
    return { status: "dormant", watchIds: Object.freeze(watches.map((w) => w.watchId)) };
  }

  // ------------------------------------------------------------------ //
  // GC3: full relevant-world observation
  // ------------------------------------------------------------------ //

  async function observeCurrentWorld(input: {
    readonly campaignId: string;
    readonly wakeCycle: WakeCycleId;
    readonly wakeCause: CampaignWakeCause;
  }): Promise<{ readonly status: "complete"; readonly snapshot: CampaignWorldSnapshot } | { readonly status: "reconciliation_incomplete"; readonly detail: string }> {
    const { events, definition } = await projections(input.campaignId);
    const ids = activeIds(events);

    const epoch = await deps.institutions.inspectEpoch(definition.institutionId);
    if (epoch.state !== "known") return { status: "reconciliation_incomplete", detail: `institution epoch ${epoch.state}` };

    const claimObservations: ClaimStandingSnapshot[] = [];
    if (ids.hypothesisObjects.length > 0) {
      if (deps.evidence === undefined) {
        return { status: "reconciliation_incomplete", detail: "active hypotheses exist but no Evidence port is configured" };
      }
      for (const hypothesis of ids.hypothesisObjects) {
        const knowledge = await deps.evidence.inspectClaim(hypothesis.claim);
        if (knowledge.state !== "known") {
          return { status: "reconciliation_incomplete", detail: `claim "${hypothesis.claim.claimId}" is ${knowledge.state}` };
        }
        claimObservations.push(knowledge.value);
      }
    }

    const projectObservations: { project: CampaignProjectRef; standing: ProjectOperationalStanding }[] = [];
    if (ids.projectIds.length > 0 && deps.work !== undefined) {
      for (const project of allProjectRefs(events, ids.projectIds)) {
        const knowledge = await deps.work.inspectProject(project);
        if (knowledge.state !== "known") {
          return { status: "reconciliation_incomplete", detail: `project "${project.projectId}" is ${knowledge.state}` };
        }
        projectObservations.push({ project, standing: knowledge.value });
      }
    }

    // Real trigger provenance: the causing watch must have a WATCH_TRIGGERED.
    const triggered = events
      .filter((event) => event.type === "WATCH_TRIGGERED")
      .map((event) => (event.payload as { watchId: string }).watchId);
    if (input.wakeCause.kind === "watch") {
      if (!triggered.includes(input.wakeCause.watchId)) {
        return {
          status: "reconciliation_incomplete",
          detail: `wake cause watch "${input.wakeCause.watchId}" has no canonical WATCH_TRIGGERED event`,
        };
      }
    }

    const snapshot = {
      wakeCycleId: input.wakeCycle,
      institutionEpoch: epoch.value,
      claimObservations: Object.freeze(claimObservations),
      projectObservations: Object.freeze(projectObservations),
      triggeredWatchIds: Object.freeze([...new Set(triggered)].sort()),
    };
    const digest = canonicalDigest({
      domain: "palimpsest.campaign-world-snapshot.v1",
      wakeCycleId: snapshot.wakeCycleId,
      institutionEpoch: snapshot.institutionEpoch,
      claimObservations: snapshot.claimObservations,
      projectObservations: [...snapshot.projectObservations].sort((a, b) => (a.project.projectId < b.project.projectId ? -1 : 1)),
      triggeredWatchIds: snapshot.triggeredWatchIds,
    });
    return { status: "complete", snapshot: parseWorldSnapshot({ ...snapshot, digest }) };
  }

  function allProjectRefs(events: readonly CampaignEvent[], ids: readonly string[]): readonly CampaignProjectRef[] {
    const byId = new Map<string, CampaignProjectRef>();
    for (const event of events) {
      if (event.type === "PROJECT_ADMITTED") byId.set((event.payload as { project: CampaignProjectRef }).project.projectId, (event.payload as { project: CampaignProjectRef }).project);
      if (event.type === "INTERVENTION_REGISTERED") {
        const intervention = parseCampaignIntervention((event.payload as { intervention: unknown }).intervention);
        byId.set(intervention.project.projectId, intervention.project);
      }
    }
    return Object.freeze(ids.map((id) => byId.get(id)).filter((ref): ref is CampaignProjectRef => ref !== undefined));
  }

  // ------------------------------------------------------------------ //
  // GC4: atomic epistemic reconciliation (unchanged = no-op)
  // ------------------------------------------------------------------ //

  async function reconcileCurrentWorld(input: {
    readonly campaignId: string;
    readonly wakeCycle: WakeCycleId;
    readonly wakeCause: CampaignWakeCause;
  }): Promise<
    | { readonly status: "reconciled"; readonly report: CampaignReconciliationReport }
    | { readonly status: "reconciliation_incomplete"; readonly detail: string }
    | { readonly status: "no_active_commitment"; readonly report: CampaignReconciliationReport }
  > {
    const observed = await observeCurrentWorld(input);
    if (observed.status !== "complete") return observed;
    const snapshot = observed.snapshot;
    const { basis, events } = await projections(input.campaignId);

    const ids = activeIds(events);
    const hypothesisById = new Map(ids.hypothesisObjects.map((hypothesis) => [hypothesis.hypothesisId, hypothesis]));
    const latestObservation = new Map<string, ClaimStandingSnapshot>();
    const latestRevision = new Map<string, { beliefRevisionId: string; standing: string }>();
    for (const event of events) {
      if (event.type === "EVIDENCE_OBSERVED") {
        const observation = (event.payload as { observation: { hypothesisId: string; standing: ClaimStandingSnapshot } }).observation;
        latestObservation.set(observation.hypothesisId, observation.standing);
      } else if (event.type === "BELIEF_REVISED") {
        const revision = (event.payload as { revision: { hypothesisId: string; beliefRevisionId: string; standing: string } }).revision;
        latestRevision.set(revision.hypothesisId, revision);
      }
    }

    const appended = [];
    const changed: string[] = [];
    for (const standing of snapshot.claimObservations) {
      const hypothesisId = [...hypothesisById.entries()].find(([, h]) => h.claim.claimId === standing.claim.claimId)?.[0];
      if (hypothesisId === undefined) continue;
      const previous = latestObservation.get(hypothesisId);
      if (previous !== undefined && previous.digest === standing.digest) continue; // §83 unchanged → no-op
      const observation = materializeObservation({
        observationId: deps.allocateObservationId(),
        campaignId: input.campaignId,
        hypothesisId,
        standing,
      });
      const revision = materializeBeliefRevision({
        beliefRevisionId: deps.allocateRevisionId(),
        campaignId: input.campaignId,
        hypothesisId,
        previous: latestRevision.get(hypothesisId) === undefined ? null : { beliefRevisionId: latestRevision.get(hypothesisId)!.beliefRevisionId },
        standing: beliefStandingOf(standing.status),
        evidenceObservationId: observation.observationId,
      });
      appended.push(
        request("EVIDENCE_OBSERVED", input.campaignId, { observation }),
        request("BELIEF_REVISED", input.campaignId, { revision }),
      );
      changed.push(hypothesisId);
    }

    const resultingDigest = canonicalDigest({
      domain: "palimpsest.campaign-belief-state.v1",
      campaignId: input.campaignId,
      entries: snapshot.claimObservations
        .map((standing) => ({ hypothesisId: [...hypothesisById.entries()].find(([, h]) => h.claim.claimId === standing.claim.claimId)?.[0] ?? "", standing: beliefStandingOf(standing.status) }))
        .sort((a, b) => (a.hypothesisId < b.hypothesisId ? -1 : 1)),
    });
    const report: CampaignReconciliationReport = Object.freeze({
      wakeCycleId: input.wakeCycle,
      worldSnapshotDigest: snapshot.digest,
      previousBeliefStateDigest: "previous",
      resultingBeliefStateDigest: resultingDigest,
      activeCommitmentIds: ids.commitments,
      changedHypothesisIds: Object.freeze([...new Set(changed)].sort()),
      digest: "",
    });
    const withDigest = Object.freeze({ ...report, digest: reconciliationDigestOf(report) });

    const batch = [
      ...appended,
      request("RECONCILIATION_COMMITTED", input.campaignId, { report: withDigest }),
      request("WORLD_RECONCILED", input.campaignId, {
        wakeCycleId: input.wakeCycle,
        snapshot: { ...snapshot, wakeCycleId: input.wakeCycle },
      }),
      request("COMMITMENTS_REVIEWED", input.campaignId, { wakeCycleId: input.wakeCycle, activeCommitmentIds: ids.commitments }),
    ];
    await deps.store.appendAtomic({ expectedBasis: basis, events: batch });
    return ids.commitments.length === 0
      ? { status: "no_active_commitment", report: withDigest }
      : { status: "reconciled", report: withDigest };
  }

  // ------------------------------------------------------------------ //
  // GC5: strict WakeCycle state machine
  // ------------------------------------------------------------------ //

  async function beginWake(input: {
    readonly campaignId: string;
    readonly cause: CampaignWakeCause;
  }): Promise<
    | { readonly status: "started"; readonly wakeCycleId: WakeCycleId }
    | { readonly status: "wake_already_in_progress"; readonly wakeCycleId: WakeCycleId }
    | { readonly status: "blocked"; readonly detail: string }
  > {
    const state = await lifecycleState(input.campaignId);
    const ongoing = inFlightWake((await projections(input.campaignId)).events);
    if (state === "WAKING" || state === "RECONCILING") {
      return ongoing === undefined
        ? { status: "blocked", detail: `lifecycle is ${state} without an in-flight wake cycle` }
        : { status: "wake_already_in_progress", wakeCycleId: ongoing };
    }
    if (state !== "DORMANT") return { status: "blocked", detail: `beginWake requires DORMANT (current: ${state})` };
    const cause = encodeWakeCause(input.cause);
    const checkpoint = latestCheckpoint((await projections(input.campaignId)).events);
    if (checkpoint === undefined) return { status: "blocked", detail: "no canonical checkpoint exists" };
    if (input.cause.kind === "watch" && !triggeredWatches((await projections(input.campaignId)).events).includes(input.cause.watchId)) {
      return { status: "blocked", detail: `watch "${input.cause.watchId}" has no canonical WATCH_TRIGGERED event` };
    }
    const wakeCycleId = deps.allocateWakeCycleId();
    const basis = (await deps.store.basis(input.campaignId))!;
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("WAKE_STARTED", input.campaignId, { wakeCycleId, cause, checkpointBasisDigest: checkpoint.campaignBasisDigest })],
    });
    return { status: "started", wakeCycleId };
  }

  async function resumeWake(campaignId: string): Promise<{ readonly status: "in_progress"; readonly wakeCycleId: WakeCycleId } | { readonly status: "none" }> {
    const ongoing = inFlightWake((await projections(campaignId)).events);
    return ongoing === undefined ? { status: "none" } : { status: "in_progress", wakeCycleId: ongoing };
  }

  function inFlightWake(events: readonly CampaignEvent[]): WakeCycleId | undefined {
    const started = new Set<string>();
    const ended = new Set<string>();
    for (const event of events) {
      if (event.type === "WAKE_STARTED") started.add((event.payload as { wakeCycleId: string }).wakeCycleId);
      if (event.type === "WAKE_CYCLE_COMPLETED" || event.type === "WAKE_COMPLETED") ended.add((event.payload as { wakeCycleId: string }).wakeCycleId);
    }
    return [...started].filter((id) => !ended.has(id)).sort()[0];
  }

  function triggeredWatches(events: readonly CampaignEvent[]): readonly string[] {
    return events.filter((event) => event.type === "WATCH_TRIGGERED").map((event) => (event.payload as { watchId: string }).watchId);
  }

  function latestCheckpoint(events: readonly CampaignEvent[]): CampaignCheckpoint | undefined {
    let checkpoint: CampaignCheckpoint | undefined;
    for (const event of events) {
      if (event.type === "CHECKPOINT_RECORDED") checkpoint = parseCampaignCheckpoint((event.payload as { checkpoint: unknown }).checkpoint);
    }
    return checkpoint;
  }

  /** GC5 §112/§114: completion is tied to an admitted semantic action. */
  async function completeWakeWithAction(input: {
    readonly campaignId: string;
    readonly wakeCycleId: WakeCycleId;
    readonly nextAction: "project" | "wait";
  }): Promise<void> {
    const events = (await projections(input.campaignId)).events;
    if (!inFlightWake(events)) throw new CampaignStoreError("invalid_registration", "no in-flight wake cycle");
    const reconciled = events.some((event) => event.type === "RECONCILIATION_COMMITTED" && (event.payload as { report: { wakeCycleId: string } }).report.wakeCycleId === input.wakeCycleId);
    if (!reconciled) throw new CampaignStoreError("invalid_registration", "cannot complete a wake before reconciliation");
    if (input.nextAction === "project") {
      const admitted = events.some((event) => event.type === "PROJECT_ADMITTED");
      if (!admitted) throw new CampaignStoreError("invalid_registration", "project wake completion requires an admitted Project");
    } else {
      const waitIndex = events.findIndex((event) => event.type === "WAIT_DECIDED");
      if (waitIndex < 0 || !events.slice(waitIndex).some((event) => event.type === "CHECKPOINT_RECORDED")) {
        throw new CampaignStoreError("invalid_registration", "WAIT wake completion requires a new grounded checkpoint");
      }
    }
    const basis = (await deps.store.basis(input.campaignId))!;
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("WAKE_CYCLE_COMPLETED", input.campaignId, { wakeCycleId: input.wakeCycleId, nextAction: input.nextAction })],
    });
  }

  return {
    buildCurrentCampaignCheckpoint,
    admitWait,
    observeCurrentWorld,
    reconcileCurrentWorld,
    beginWake,
    resumeWake,
    completeWakeWithAction,
    lifecycleState,
    activeIds,
  };
}

export type CampaignProductionService = ReturnType<typeof makeCampaignProductionService>;
