/**
 * G10-GC2 production Campaign loop closure — causally auditable edition.
 *
 * This module composes the existing G1–G6 primitives (never replacing them)
 * into ONE coherent, grounded, crash-safe, provenance-complete golden path:
 *
 *   derived checkpoint → atomic WAIT/dormancy → strict wake → current-world
 *   observation → atomic epistemic reconciliation (unchanged = no-op) →
 *   reconciled compilation → causally bound admission → wake completion
 *
 * GC2 invariants enforced here:
 *
 *   - a Campaign-linked Project is the COMPLETE ref (projectId, revision,
 *     digest), never a projectId with a synthesised revision/digest (§§4/§13);
 *   - every linked Project is load-bearing: a missing Work source, or any
 *     unknown/error Project, yields `reconciliation_incomplete` with zero
 *     writes (§§23–§31);
 *   - the reconciliation's before/after belief digests are the canonical
 *     `currentBeliefStateOf` digests, never a placeholder or a second
 *     algorithm (§§33–§41);
 *   - one in-flight WakeCycle per Campaign; observation and reconciliation are
 *     gated on the CURRENT incomplete wake; at most one committed
 *     reconciliation per wake (§§57–§62);
 *   - completion is bound to the exact admitted Project or WAIT admission
 *     (`AdmittedCampaignActionRef`), so no historical action can satisfy a
 *     later wake (§§71–§101).
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { CampaignBasisRef, CampaignCommitment, CampaignEventType } from "./artifacts.js";
import type { BeliefRevision, CampaignHypothesis, ClaimStandingSnapshot, EvidenceKnowledge } from "./epistemic.js";
import {
  beliefStandingOf,
  currentBeliefStateOf,
  materializeBeliefRevision,
  materializeObservation,
} from "./epistemic.js";
import type { CampaignProjectRef, ProjectOperationalStanding, WorkKnowledge } from "./intervention.js";
import { compareCampaignProjectRefs, parseCampaignProjectRef } from "./intervention.js";
import type { CampaignWatch, CampaignWatchDraft, WaitAdmission } from "./prospective.js";
import { parseCampaignWatchDraft, parseWaitAdmission } from "./prospective.js";
import { projectLinkedProjects } from "./project.js";
import type { CampaignLinkedProject } from "./project.js";
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
import { requireCanonicalDigest } from "./digest.js";

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
export const CAMPAIGN_CHECKPOINT_DIGEST_DOMAIN = "palimpsest.campaign-checkpoint.v1";

export interface CampaignReconciliationReport {
  readonly wakeCycleId: WakeCycleId;
  readonly worldSnapshotDigest: string;
  readonly previousBeliefStateDigest: string;
  readonly resultingBeliefStateDigest: string;
  readonly activeCommitmentIds: readonly string[];
  readonly changedHypothesisIds: readonly string[];
  readonly digest: string;
}

/* ------------------------------------------------------------------ *
 * Wake completion / admitted-action provenance (§§48/§73/§101/§140)
 * ------------------------------------------------------------------ */

export interface ProjectWakeActionRef {
  readonly kind: "project";
  readonly compilationId: string;
  readonly reconciliationDigest: string;
  readonly admissionKey: string;
  readonly project: CampaignProjectRef;
}

export interface WaitWakeActionRef {
  readonly kind: "wait";
  readonly compilationId: string;
  readonly reconciliationDigest: string;
  readonly waitAdmissionId: string;
  readonly checkpointDigest: string;
}

export type WakeCompletionActionRef = ProjectWakeActionRef | WaitWakeActionRef;
export type AdmittedCampaignActionRef =
  | (ProjectWakeActionRef & { readonly wakeCycleId: string })
  | (WaitWakeActionRef & { readonly wakeCycleId: string });

export interface ParsedWakeCycleCompleted {
  readonly wakeCycleId: string;
  readonly action: WakeCompletionActionRef;
}

/* ------------------------------------------------------------------ *
 * Strict parsers (§§40–§55/§92–§101)
 * ------------------------------------------------------------------ */

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

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.normalize("NFC"))) {
    throw new CampaignStoreError("malformed_record", `${what} must be a stable identifier`);
  }
  return value.normalize("NFC");
}

function requireStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) throw new CampaignStoreError("malformed_record", `${what} must be an array`);
  const ids = value.map((entry) => stableId(entry, `${what}[]`));
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new CampaignStoreError("malformed_record", `${what} must not contain duplicates`);
  return Object.freeze(ids.sort());
}

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

export function checkpointDigestOf(checkpoint: CampaignCheckpoint): string {
  const parsed = parseCampaignCheckpoint(checkpoint);
  return canonicalDigest({
    domain: CAMPAIGN_CHECKPOINT_DIGEST_DOMAIN,
    campaignId: parsed.campaignId,
    campaignBasisThroughSeq: parsed.campaignBasisThroughSeq,
    campaignBasisDigest: parsed.campaignBasisDigest,
    institutionEpoch: parsed.institutionEpoch,
    beliefStateDigest: parsed.beliefStateDigest,
    activeCommitmentIds: parsed.activeCommitmentIds,
    activeHypothesisIds: parsed.activeHypothesisIds,
    activeWatchIds: parsed.activeWatchIds,
    knownProjectRefs: parsed.knownProjectRefs,
  });
}

/** §40/§47: strict reconciliation-report parser — no coercion, no placeholders. */
export function parseReconciliationReport(raw: unknown, what = "CampaignReconciliationReport"): CampaignReconciliationReport {
  const object = asRecord(raw, what);
  exactKeys(
    object,
    [
      "wakeCycleId",
      "worldSnapshotDigest",
      "previousBeliefStateDigest",
      "resultingBeliefStateDigest",
      "activeCommitmentIds",
      "changedHypothesisIds",
      "digest",
    ],
    what,
  );
  const report = {
    wakeCycleId: stableId(object.wakeCycleId, `${what}.wakeCycleId`),
    worldSnapshotDigest: requireCanonicalDigest(object.worldSnapshotDigest, `${what}.worldSnapshotDigest`),
    previousBeliefStateDigest: requireCanonicalDigest(object.previousBeliefStateDigest, `${what}.previousBeliefStateDigest`),
    resultingBeliefStateDigest: requireCanonicalDigest(object.resultingBeliefStateDigest, `${what}.resultingBeliefStateDigest`),
    activeCommitmentIds: requireStringArray(object.activeCommitmentIds, `${what}.activeCommitmentIds`),
    changedHypothesisIds: requireStringArray(object.changedHypothesisIds, `${what}.changedHypothesisIds`),
  };
  const digest = requireCanonicalDigest(object.digest, `${what}.digest`);
  if (digest !== reconciliationDigestOf(report)) {
    throw new CampaignStoreError("malformed_record", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...report, digest });
}

export function parseWakeCompletionActionRef(raw: unknown, what = "WakeCompletionActionRef"): WakeCompletionActionRef {
  const object = asRecord(raw, what);
  if (object.kind === "project") {
    exactKeys(object, ["kind", "compilationId", "reconciliationDigest", "admissionKey", "project"], what);
    return Object.freeze({
      kind: "project" as const,
      compilationId: stableId(object.compilationId, `${what}.compilationId`),
      reconciliationDigest: requireCanonicalDigest(object.reconciliationDigest, `${what}.reconciliationDigest`),
      admissionKey: stableId(object.admissionKey, `${what}.admissionKey`),
      project: parseCampaignProjectRef(object.project, `${what}.project`),
    });
  }
  if (object.kind === "wait") {
    exactKeys(object, ["kind", "compilationId", "reconciliationDigest", "waitAdmissionId", "checkpointDigest"], what);
    return Object.freeze({
      kind: "wait" as const,
      compilationId: stableId(object.compilationId, `${what}.compilationId`),
      reconciliationDigest: requireCanonicalDigest(object.reconciliationDigest, `${what}.reconciliationDigest`),
      waitAdmissionId: stableId(object.waitAdmissionId, `${what}.waitAdmissionId`),
      checkpointDigest: requireCanonicalDigest(object.checkpointDigest, `${what}.checkpointDigest`),
    });
  }
  throw new CampaignStoreError("malformed_record", `${what}.kind must be project or wait`);
}

/** §101: the completion input carries the wake it justifies. */
export function parseAdmittedCampaignActionRef(raw: unknown, what = "AdmittedCampaignActionRef"): AdmittedCampaignActionRef {
  const object = asRecord(raw, what);
  const wakeCycleId = stableId(object.wakeCycleId, `${what}.wakeCycleId`);
  const action = parseWakeCompletionActionRef(
    Object.fromEntries(Object.entries(object).filter(([key]) => key !== "wakeCycleId")),
    what,
  );
  return Object.freeze({ ...action, wakeCycleId });
}

export function parseWakeCycleCompleted(raw: unknown, what = "WAKE_CYCLE_COMPLETED"): ParsedWakeCycleCompleted {
  const object = asRecord(raw, what);
  exactKeys(object, ["wakeCycleId", "action"], what);
  return Object.freeze({
    wakeCycleId: stableId(object.wakeCycleId, `${what}.wakeCycleId`),
    action: parseWakeCompletionActionRef(object.action, `${what}.action`),
  });
}

export const CAMPAIGN_PRODUCTION_EVENT_PARSERS = Object.freeze({
  RECONCILIATION_COMMITTED: (payload: unknown) => {
    const object = asRecord(payload, "RECONCILIATION_COMMITTED");
    exactKeys(object, ["report"], "RECONCILIATION_COMMITTED");
    return Object.freeze({ report: parseReconciliationReport(object.report) });
  },
  WAKE_CYCLE_COMPLETED: (payload: unknown) => parseWakeCycleCompleted(payload),
});

/* ------------------------------------------------------------------ *
 * Derived wake / reconciliation projections
 * ------------------------------------------------------------------ */

/** §8/§58/§95: the single incomplete WakeCycle, if any. */
export function inFlightWake(events: readonly CampaignEvent[]): WakeCycleId | undefined {
  const started = new Set<string>();
  const ended = new Set<string>();
  for (const event of events) {
    if (event.type === "WAKE_STARTED") started.add((event.payload as { wakeCycleId: string }).wakeCycleId);
    if (event.type === "WAKE_CYCLE_COMPLETED" || event.type === "WAKE_COMPLETED") {
      ended.add((event.payload as { wakeCycleId: string }).wakeCycleId);
    }
  }
  return [...started].filter((id) => !ended.has(id)).sort()[0];
}

/** §58/§61: the committed reconciliation for an exact wake. */
export function committedReconciliationOf(
  events: readonly CampaignEvent[],
  wakeCycleId: WakeCycleId,
): CampaignReconciliationReport | undefined {
  let report: CampaignReconciliationReport | undefined;
  for (const event of events) {
    if (event.type === "RECONCILIATION_COMMITTED") {
      const candidate = (event.payload as { report: CampaignReconciliationReport }).report;
      if (candidate.wakeCycleId === wakeCycleId) report = candidate;
    }
  }
  return report;
}

/** Derived lifecycle projection from canonical events (shared with GC3 admission). */
export function lifecycleStateFromEvents(events: readonly CampaignEvent[]): CampaignLifecycleState {
  let state: CampaignLifecycleState = "ACTIVE";
  for (const event of events) {
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
        state = (event.payload as { action: WakeCompletionActionRef }).action.kind === "project" ? "ACTIVE" : "DORMANT";
        break;
      default:
        break;
    }
  }
  return state;
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

export function beliefRevisionsFromEvents(events: readonly CampaignEvent[]): readonly BeliefRevision[] {
  return events.filter((event) => event.type === "BELIEF_REVISED").map((event) => (event.payload as { revision: BeliefRevision }).revision);
}

/* ------------------------------------------------------------------ *
 * GC3-2: the ONE read-only freshness evaluator for both admission arms
 * ------------------------------------------------------------------ */

/** The admission-relevant fields a compiled candidate exposes (structural). */
export interface CampaignActionFreshnessCandidate {
  readonly campaignBasisThroughSeq: number;
  readonly campaignBasisDigest: string;
  readonly beliefStateDigest: string;
  readonly wake?: { readonly wakeCycleId: string; readonly reconciliationDigest: string } | undefined;
}

export type CampaignActionFreshness =
  | { readonly status: "fresh" }
  | { readonly status: "stale"; readonly detail: string };

/**
 * GC3-2 §§29–33: ONE pure, read-only validator shared by the Project and WAIT
 * arms. It never appends events. A mismatched wake correlation is stale — it is
 * never repaired by "whatever wake is current now"; a non-wake candidate is
 * refused while the Campaign is WAKING/RECONCILING.
 */
export async function evaluateCompiledCampaignActionFreshness(input: {
  readonly store: CampaignStore;
  readonly campaignId: string;
  readonly compiled: CampaignActionFreshnessCandidate;
}): Promise<CampaignActionFreshness> {
  const basis = await input.store.basis(input.campaignId);
  if (basis === undefined) return { status: "stale", detail: "campaign_action_stale_unknown_campaign" };
  if (basis.throughSeq !== input.compiled.campaignBasisThroughSeq || basis.chainDigest !== input.compiled.campaignBasisDigest) {
    return { status: "stale", detail: "campaign_action_stale" };
  }
  const events = await input.store.replay(input.campaignId);
  const belief = currentBeliefStateOf(input.campaignId, beliefRevisionsFromEvents(events));
  if (belief.digest !== input.compiled.beliefStateDigest) {
    return { status: "stale", detail: "campaign_action_stale_belief" };
  }
  const state = lifecycleStateFromEvents(events);
  if (input.compiled.wake !== undefined) {
    if (inFlightWake(events) !== input.compiled.wake.wakeCycleId) {
      return { status: "stale", detail: "campaign_action_stale_wake" };
    }
    if (state !== "RECONCILING") {
      return { status: "stale", detail: "campaign_action_stale_lifecycle" };
    }
    const reconciliation = committedReconciliationOf(events, input.compiled.wake.wakeCycleId);
    if (reconciliation === undefined || reconciliation.digest !== input.compiled.wake.reconciliationDigest) {
      return { status: "stale", detail: "campaign_action_stale_reconciliation" };
    }
  } else if (state === "WAKING" || state === "RECONCILING") {
    return { status: "stale", detail: "campaign_action_stale_unbound_during_wake" };
  }
  return { status: "fresh" };
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
        .filter((h) => hypotheses.get(h.hypothesisId) === "ACTIVE")
        .sort((a, b) => (a.hypothesisId < b.hypothesisId ? -1 : 1)),
      linkedProjects: projectLinkedProjects(events),
    };
  }

  async function lifecycleState(campaignId: string): Promise<CampaignLifecycleState> {
    return lifecycleStateFromEvents((await projections(campaignId)).events);
  }

  async function currentBelief(campaignId: string, events: readonly CampaignEvent[]) {
    return currentBeliefStateOf(campaignId, beliefRevisionsFromEvents(events));
  }

  /**
   * GC2 §18/§19/§34 + GC3 §53–§56: derive the checkpoint from canonical current
   * state. `additionalWatchIds` lets a WAIT admission record the watches it is
   * ABOUT to install as already-active, so the checkpoint honestly represents the
   * dormant Campaign (never "old active watches" while claiming otherwise).
   */
  async function buildCurrentCampaignCheckpoint(
    campaignId: string,
    options?: { readonly additionalWatchIds?: readonly string[] },
  ): Promise<Knowledge<CampaignCheckpoint>> {
    const { basis, events, definition } = await projections(campaignId);
    const epoch = await deps.institutions.inspectEpoch(definition.institutionId);
    if (epoch.state !== "known") {
      return { state: epoch.state, detail: `institution epoch ${epoch.state}: ${epoch.detail}` };
    }
    const ids = activeIds(events);
    if (ids.linkedProjects.status !== "known") {
      return { state: "error", detail: ids.linkedProjects.detail };
    }
    const additional = (options?.additionalWatchIds ?? []).map((watchId) => stableId(watchId, "additionalWatchId"));
    const activeWatchIds =
      additional.length === 0
        ? ids.watches
        : Object.freeze([...new Set([...ids.watches, ...additional])].sort());
    const belief = await currentBelief(campaignId, events);
    return {
      state: "known",
      value: parseCampaignCheckpoint({
        campaignId,
        campaignBasisThroughSeq: basis.throughSeq,
        campaignBasisDigest: basis.chainDigest,
        institutionEpoch: epoch.value,
        beliefStateDigest: belief.digest,
        activeCommitmentIds: ids.commitments,
        activeHypothesisIds: ids.hypotheses,
        activeWatchIds,
        knownProjectRefs: ids.linkedProjects.projects.map((entry) => entry.project),
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
      request("CAMPAIGN_QUIESCING", input.campaignId, { reason: input.reason, checkpointBasisDigest: checkpoint.value.campaignBasisDigest }),
      request("CAMPAIGN_DORMANT", input.campaignId, { checkpointBasisDigest: checkpoint.value.campaignBasisDigest }),
    );
    await deps.store.appendAtomic({ expectedBasis: basis, events });
    return { status: "dormant", watchIds: Object.freeze(watches.map((w) => w.watchId)) };
  }

  // ------------------------------------------------------------------ //
  // GC2-B: full relevant-world observation, every linked Project is load-bearing
  // ------------------------------------------------------------------ //

  async function observeCurrentWorld(input: {
    readonly campaignId: string;
    readonly wakeCycle: WakeCycleId;
    readonly wakeCause: CampaignWakeCause;
  }): Promise<
    | { readonly status: "complete"; readonly snapshot: CampaignWorldSnapshot }
    | { readonly status: "reconciliation_incomplete"; readonly detail: string }
    | { readonly status: "wake_cycle_mismatch"; readonly detail: string }
  > {
    const { events, definition } = await projections(input.campaignId);
    // §95: observation is only ever for the CURRENT incomplete wake cycle.
    const inFlight = inFlightWake(events);
    if (inFlight === undefined || inFlight !== input.wakeCycle) {
      return {
        status: "wake_cycle_mismatch",
        detail: `wake cycle "${input.wakeCycle}" is not the current in-flight wake${inFlight === undefined ? " (none in flight)" : ` (in flight: ${inFlight})`}`,
      };
    }
    const ids = activeIds(events);
    if (ids.linkedProjects.status !== "known") {
      return { status: "reconciliation_incomplete", detail: ids.linkedProjects.detail };
    }
    const linked: readonly CampaignLinkedProject[] = ids.linkedProjects.projects;

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

    // §23–§30: linked Projects are LOAD-BEARING. Zero linked → no Work source
    // required; any linked → the source MUST exist and must know EVERY project.
    const projectObservations: { project: CampaignProjectRef; standing: ProjectOperationalStanding }[] = [];
    if (linked.length > 0) {
      if (deps.work === undefined) {
        return {
          status: "reconciliation_incomplete",
          detail: "linked Projects exist but no Work observation source is configured",
        };
      }
      for (const entry of linked) {
        const knowledge = await deps.work.inspectProject(entry.project);
        if (knowledge.state !== "known") {
          return {
            status: "reconciliation_incomplete",
            detail: `project "${entry.project.projectId}" (revision ${entry.project.revision}) is ${knowledge.state}`,
          };
        }
        projectObservations.push({ project: entry.project, standing: knowledge.value });
      }
    }
    projectObservations.sort((a, b) => compareCampaignProjectRefs(a.project, b.project));

    // Real trigger provenance: the causing watch must have a WATCH_TRIGGERED.
    const triggered = [
      ...new Set(events.filter((event) => event.type === "WATCH_TRIGGERED").map((event) => (event.payload as { watchId: string }).watchId)),
    ].sort();
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
      triggeredWatchIds: Object.freeze(triggered),
    };
    const digest = canonicalDigest({
      domain: "palimpsest.campaign-world-snapshot.v1",
      wakeCycleId: snapshot.wakeCycleId,
      institutionEpoch: snapshot.institutionEpoch,
      claimObservations: snapshot.claimObservations,
      projectObservations: snapshot.projectObservations,
      triggeredWatchIds: snapshot.triggeredWatchIds,
    });
    return { status: "complete", snapshot: parseWorldSnapshot({ ...snapshot, digest }) };
  }

  // ------------------------------------------------------------------ //
  // GC2-C/E: atomic epistemic reconciliation with canonical provenance
  // ------------------------------------------------------------------ //

  async function reconcileCurrentWorld(input: {
    readonly campaignId: string;
    readonly wakeCycle: WakeCycleId;
    readonly wakeCause: CampaignWakeCause;
  }): Promise<
    | { readonly status: "reconciled"; readonly report: CampaignReconciliationReport }
    | { readonly status: "no_active_commitment"; readonly report: CampaignReconciliationReport }
    | { readonly status: "reconciliation_incomplete"; readonly detail: string }
    | { readonly status: "wake_cycle_mismatch"; readonly detail: string }
  > {
    const { events } = await projections(input.campaignId);
    // §§8/§59/§96: reconcile only the CURRENT incomplete wake, and only while WAKING.
    const inFlight = inFlightWake(events);
    if (inFlight === undefined || inFlight !== input.wakeCycle) {
      return {
        status: "wake_cycle_mismatch",
        detail: `wake cycle "${input.wakeCycle}" is not the current in-flight wake`,
      };
    }
    // §61/§62: at most one committed reconciliation per wake — identical retry
    // returns the existing commit and a different one is never silently written.
    const existing = committedReconciliationOf(events, input.wakeCycle);
    if (existing !== undefined) {
      return existing.activeCommitmentIds.length === 0
        ? { status: "no_active_commitment", report: existing }
        : { status: "reconciled", report: existing };
    }
    const state = lifecycleStateFromEvents(events);
    if (state !== "WAKING") {
      return { status: "wake_cycle_mismatch", detail: `reconciliation requires lifecycle WAKING (current: ${state})` };
    }

    const observed = await observeCurrentWorld(input);
    if (observed.status !== "complete") return observed;
    const snapshot = observed.snapshot;

    const ids = activeIds(events);
    const hypothesisByClaim = new Map<string, string[]>();
    for (const hypothesis of ids.hypothesisObjects) {
      const list = hypothesisByClaim.get(hypothesis.claim.claimId) ?? [];
      list.push(hypothesis.hypothesisId);
      hypothesisByClaim.set(hypothesis.claim.claimId, list);
    }
    const latestObservation = new Map<string, ClaimStandingSnapshot>();
    const latestRevision = new Map<string, BeliefRevision>();
    for (const event of events) {
      if (event.type === "EVIDENCE_OBSERVED") {
        const observation = (event.payload as { observation: { hypothesisId: string; standing: ClaimStandingSnapshot } }).observation;
        latestObservation.set(observation.hypothesisId, observation.standing);
      } else if (event.type === "BELIEF_REVISED") {
        const revision = (event.payload as { revision: BeliefRevision }).revision;
        latestRevision.set(revision.hypothesisId, revision);
      }
    }

    const existingRevisions = beliefRevisionsFromEvents(events);
    // §35: the canonical previous belief state — the SAME function that derives
    // CurrentBeliefState elsewhere, never a placeholder and never a second hash.
    const previousBelief = currentBeliefStateOf(input.campaignId, existingRevisions);

    const appended = [];
    const newRevisions: BeliefRevision[] = [];
    const changed = new Set<string>();
    for (const standing of snapshot.claimObservations) {
      for (const hypothesisId of hypothesisByClaim.get(standing.claim.claimId) ?? []) {
        const previous = latestObservation.get(hypothesisId);
        if (previous !== undefined && previous.digest === standing.digest) continue; // §83 unchanged → no-op
        const observation = materializeObservation({
          observationId: deps.allocateObservationId(),
          campaignId: input.campaignId,
          hypothesisId,
          standing,
        });
        const prior = latestRevision.get(hypothesisId);
        const revision = materializeBeliefRevision({
          beliefRevisionId: deps.allocateRevisionId(),
          campaignId: input.campaignId,
          hypothesisId,
          previous: prior === undefined ? null : { beliefRevisionId: prior.beliefRevisionId },
          standing: beliefStandingOf(standing.status),
          evidenceObservationId: observation.observationId,
        });
        appended.push(
          request("EVIDENCE_OBSERVED", input.campaignId, { observation }),
          request("BELIEF_REVISED", input.campaignId, { revision }),
        );
        newRevisions.push(revision);
        changed.add(hypothesisId);
      }
    }

    // §36: materialize the resulting belief state from the same canonical function.
    const resultingBelief = currentBeliefStateOf(input.campaignId, [...existingRevisions, ...newRevisions]);
    const report: CampaignReconciliationReport = Object.freeze({
      wakeCycleId: input.wakeCycle,
      worldSnapshotDigest: snapshot.digest,
      previousBeliefStateDigest: previousBelief.digest,
      resultingBeliefStateDigest: resultingBelief.digest,
      activeCommitmentIds: ids.commitments,
      changedHypothesisIds: Object.freeze([...changed].sort()),
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
    const basis = (await deps.store.basis(input.campaignId))!;
    await deps.store.appendAtomic({ expectedBasis: basis, events: batch });
    return ids.commitments.length === 0
      ? { status: "no_active_commitment", report: withDigest }
      : { status: "reconciled", report: withDigest };
  }

  // ------------------------------------------------------------------ //
  // GC2-E/H: strict WakeCycle state machine
  // ------------------------------------------------------------------ //

  async function beginWake(input: {
    readonly campaignId: string;
    readonly cause: CampaignWakeCause;
  }): Promise<
    | { readonly status: "started"; readonly wakeCycleId: WakeCycleId }
    | { readonly status: "wake_already_in_progress"; readonly wakeCycleId: WakeCycleId }
    | { readonly status: "blocked"; readonly detail: string }
  > {
    const { events } = await projections(input.campaignId);
    const state = lifecycleStateFromEvents(events);
    const ongoing = inFlightWake(events);
    if (state === "WAKING" || state === "RECONCILING") {
      return ongoing === undefined
        ? { status: "blocked", detail: `lifecycle is ${state} without an in-flight wake cycle` }
        : { status: "wake_already_in_progress", wakeCycleId: ongoing };
    }
    if (state === "TERMINATED") return { status: "blocked", detail: "cannot wake a TERMINATED campaign" };
    if (state !== "DORMANT") return { status: "blocked", detail: `beginWake requires DORMANT (current: ${state})` };
    const cause = encodeWakeCause(input.cause);
    const checkpoint = latestCheckpoint(events);
    if (checkpoint === undefined) return { status: "blocked", detail: "no canonical checkpoint exists" };
    if (input.cause.kind === "watch" && !triggeredWatches(events).includes(input.cause.watchId)) {
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

  // ------------------------------------------------------------------ //
  // GC3: wake-origin WAIT admission moved to next_action.ts — it now requires a
  // complete compiled candidate (never caller-supplied semantic fields).
  // ------------------------------------------------------------------ //

  // ------------------------------------------------------------------ //
  // GC2-F: completion bound to the exact admitted action
  // ------------------------------------------------------------------ //

  async function completeWakeWithAction(input: {
    readonly campaignId: string;
    readonly wakeCycleId: WakeCycleId;
    readonly action: AdmittedCampaignActionRef;
  }): Promise<void> {
    if (input.action.wakeCycleId !== input.wakeCycleId) {
      throw new CampaignStoreError("invalid_registration", "admitted action does not belong to this wake cycle");
    }
    const { events } = await projections(input.campaignId);
    // §61/§89: an identical completion retry is an idempotent no-op even after
    // the wake has left flight; a different action for the same wake conflicts.
    const existing = events.find(
      (event) => event.type === "WAKE_CYCLE_COMPLETED" && (event.payload as { wakeCycleId: string }).wakeCycleId === input.wakeCycleId,
    );
    if (existing !== undefined) {
      const completed = existing.payload as ParsedWakeCycleCompleted;
      if (completed.action.kind === input.action.kind && JSON.stringify(completed.action) === JSON.stringify(stripWake(input.action))) {
        return; // identical retry → idempotent no-op
      }
      throw new CampaignStoreError("event_conflict", "wake cycle was already completed with a different action");
    }
    if (inFlightWake(events) !== input.wakeCycleId) {
      throw new CampaignStoreError("invalid_registration", `wake cycle "${input.wakeCycleId}" is not in flight`);
    }

    if (input.action.kind === "project") {
      const action = input.action as Extract<AdmittedCampaignActionRef, { kind: "project" }>;
      const admitted = events.find((event) => event.type === "PROJECT_ADMITTED" && matchesProjectAdmission(event.payload, action));
      if (admitted === undefined) {
        throw new CampaignStoreError(
          "invalid_registration",
          "project wake completion requires a PROJECT_ADMITTED bound to THIS wake, compilation, reconciliation, and admission key",
        );
      }
    } else {
      const action = input.action as Extract<AdmittedCampaignActionRef, { kind: "wait" }>;
      const admitted = events.find((event) => event.type === "WAIT_ADMITTED" && matchesWaitAdmission(event.payload, action));
      if (admitted === undefined) {
        throw new CampaignStoreError(
          "invalid_registration",
          "WAIT wake completion requires a WAIT_ADMITTED bound to THIS wake, compilation, reconciliation, and checkpoint",
        );
      }
    }
    const basis = (await deps.store.basis(input.campaignId))!;
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [
        request("WAKE_CYCLE_COMPLETED", input.campaignId, {
          wakeCycleId: input.wakeCycleId,
          action: stripWake(input.action),
        }),
      ],
    });
  }

  function stripWake(action: AdmittedCampaignActionRef): WakeCompletionActionRef {
    if (action.kind === "project") {
      return Object.freeze({ kind: "project", compilationId: action.compilationId, reconciliationDigest: action.reconciliationDigest, admissionKey: action.admissionKey, project: action.project });
    }
    return Object.freeze({ kind: "wait", compilationId: action.compilationId, reconciliationDigest: action.reconciliationDigest, waitAdmissionId: action.waitAdmissionId, checkpointDigest: action.checkpointDigest });
  }

  function matchesProjectAdmission(payload: unknown, action: Extract<AdmittedCampaignActionRef, { kind: "project" }>): boolean {
    const admitted = payload as { admissionKey?: unknown; compilationId?: unknown; wakeCycleId?: unknown; reconciliationDigest?: unknown; project?: unknown };
    if (admitted.admissionKey !== action.admissionKey || admitted.compilationId !== action.compilationId) return false;
    if (admitted.wakeCycleId !== action.wakeCycleId) return false;
    if (admitted.reconciliationDigest !== action.reconciliationDigest) return false;
    try {
      const project = parseCampaignProjectRef(admitted.project, "PROJECT_ADMITTED.project");
      return compareCampaignProjectRefs(project, action.project) === 0;
    } catch {
      return false;
    }
  }

  function matchesWaitAdmission(payload: unknown, action: Extract<AdmittedCampaignActionRef, { kind: "wait" }>): boolean {
    const admitted = payload as { waitAdmission?: unknown };
    let admission: WaitAdmission;
    try {
      admission = parseWaitAdmission(admitted.waitAdmission);
    } catch {
      return false;
    }
    return (
      admission.waitAdmissionId === action.waitAdmissionId &&
      admission.compilationId === action.compilationId &&
      admission.wakeCycleId === action.wakeCycleId &&
      admission.reconciliationDigest === action.reconciliationDigest &&
      admission.checkpointDigest === action.checkpointDigest
    );
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
    checkpointDigestOf,
  };
}

export type CampaignProductionService = ReturnType<typeof makeCampaignProductionService>;
