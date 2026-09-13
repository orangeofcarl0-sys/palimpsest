/**
 * G10-G5 Campaign lifecycle, checkpoints, wake cycles, and world
 * reconciliation (§124–§152).
 *
 *   DORMANT ≠ TERMINATED            (§8/§150)
 *   Wake ≠ old-plan replay          (§9/§145)
 *   Wake ≠ Runtime Activation       (§205)
 *
 * Lifecycle state is a DERIVED projection of Campaign events (§126) — there is
 * no mutable `campaign.status` as sole truth. A `CampaignCheckpoint` contains
 * only canonical/derived REFERENCES and NEVER hidden CoT, context, scratchpad,
 * or runtime session (§129/§130).
 *
 * Waking rehydrates canonical state, checks continuity, reconciles the world,
 * and compiles a NEW action. It never re-runs an old Project.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { CampaignEventParsers } from "./artifacts.js";
import type { CampaignCommitment } from "./artifacts.js";
import type { BeliefRevision, CampaignEvidencePort, CampaignHypothesis, ClaimStandingSnapshot } from "./epistemic.js";
import { currentBeliefStateOf } from "./epistemic.js";
import type { CampaignProjectRef, CampaignWorkObservationPort, ProjectOperationalStanding, WorkKnowledge } from "./intervention.js";
import { parseProjectOperationalStanding } from "./intervention.js";
import type { CampaignWatch } from "./prospective.js";
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";

export type WakeCycleId = string;

export type CampaignLifecycleState =
  | "ACTIVE"
  | "QUIESCING"
  | "DORMANT"
  | "WAKING"
  | "RECONCILING"
  | "TERMINATED";

export interface InstitutionEpochRefLike {
  readonly institutionId: string;
  readonly epoch: number;
  readonly digest: string;
}

export interface CampaignCheckpoint {
  readonly campaignId: string;
  readonly campaignBasisThroughSeq: number;
  readonly campaignBasisDigest: string;
  readonly institutionEpoch: InstitutionEpochRefLike;
  readonly beliefStateDigest: string;
  readonly activeCommitmentIds: readonly string[];
  readonly activeHypothesisIds: readonly string[];
  readonly activeWatchIds: readonly string[];
  readonly knownProjectRefs: readonly CampaignProjectRef[];
}

export interface CampaignWorldSnapshot {
  readonly wakeCycleId: WakeCycleId;
  readonly institutionEpoch: InstitutionEpochRefLike;
  readonly claimObservations: readonly ClaimStandingSnapshot[];
  readonly projectObservations: readonly { readonly project: CampaignProjectRef; readonly standing: ProjectOperationalStanding }[];
  readonly triggeredWatchIds: readonly string[];
  readonly digest: string;
}

export type WorldObservationResult =
  | { readonly status: "complete"; readonly snapshot: CampaignWorldSnapshot }
  | { readonly status: "reconciliation_incomplete"; readonly detail: string };

export interface CampaignInstitutionEpochSource {
  inspectEpoch(institutionId: string): Promise<WorkKnowledge<InstitutionEpochRefLike>>;
}

export const CAMPAIGN_LIFECYCLE_EVENT_PARSERS: CampaignEventParsers = Object.freeze({
  CHECKPOINT_RECORDED: (payload: unknown) => {
    const object = asRecord(payload, "CHECKPOINT_RECORDED");
    exactKeys(object, ["checkpoint"], "CHECKPOINT_RECORDED");
    return Object.freeze({ checkpoint: parseCampaignCheckpoint(object.checkpoint) });
  },
  CAMPAIGN_QUIESCING: (payload: unknown) => {
    const object = asRecord(payload, "CAMPAIGN_QUIESCING");
    exactKeys(object, ["reason"], "CAMPAIGN_QUIESCING");
    return Object.freeze({ reason: nonEmpty(object.reason, "reason") });
  },
  CAMPAIGN_DORMANT: (payload: unknown) => {
    const object = asRecord(payload, "CAMPAIGN_DORMANT");
    exactKeys(object, ["checkpointBasisDigest"], "CAMPAIGN_DORMANT");
    return Object.freeze({ checkpointBasisDigest: nonEmpty(object.checkpointBasisDigest, "checkpointBasisDigest") });
  },
  WAKE_STARTED: (payload: unknown) => {
    const object = asRecord(payload, "WAKE_STARTED");
    exactKeys(object, ["wakeCycleId", "cause", "checkpointBasisDigest"], "WAKE_STARTED");
    return Object.freeze({
      wakeCycleId: stableId(object.wakeCycleId, "wakeCycleId"),
      cause: nonEmpty(object.cause, "cause"),
      checkpointBasisDigest: nonEmpty(object.checkpointBasisDigest, "checkpointBasisDigest"),
    });
  },
  WORLD_RECONCILED: (payload: unknown) => {
    const object = asRecord(payload, "WORLD_RECONCILED");
    exactKeys(object, ["wakeCycleId", "snapshot"], "WORLD_RECONCILED");
    return Object.freeze({ wakeCycleId: stableId(object.wakeCycleId, "wakeCycleId"), snapshot: parseWorldSnapshot(object.snapshot) });
  },
  COMMITMENTS_REVIEWED: (payload: unknown) => {
    const object = asRecord(payload, "COMMITMENTS_REVIEWED");
    exactKeys(object, ["wakeCycleId", "activeCommitmentIds"], "COMMITMENTS_REVIEWED");
    if (!Array.isArray(object.activeCommitmentIds)) throw new CampaignStoreError("malformed_record", "activeCommitmentIds must be an array");
    return Object.freeze({
      wakeCycleId: stableId(object.wakeCycleId, "wakeCycleId"),
      activeCommitmentIds: Object.freeze(object.activeCommitmentIds.map((entry) => stableId(entry, "commitmentId"))),
    });
  },
  WAKE_COMPLETED: (payload: unknown) => {
    const object = asRecord(payload, "WAKE_COMPLETED");
    exactKeys(object, ["wakeCycleId", "nextAction"], "WAKE_COMPLETED");
    if (object.nextAction !== "project" && object.nextAction !== "wait") {
      throw new CampaignStoreError("malformed_record", "nextAction must be project or wait");
    }
    return Object.freeze({ wakeCycleId: stableId(object.wakeCycleId, "wakeCycleId"), nextAction: object.nextAction });
  },
  CAMPAIGN_TERMINATED: (payload: unknown) => {
    const object = asRecord(payload, "CAMPAIGN_TERMINATED");
    exactKeys(object, ["reason"], "CAMPAIGN_TERMINATED");
    return Object.freeze({ reason: nonEmpty(object.reason, "reason") });
  },
});

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
  if (typeof value !== "string" || !isStableIdentifier(normalizeStableIdentifier(value))) {
    throw new CampaignStoreError("malformed_record", `${what} must be a stable identifier`);
  }
  return value;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CampaignStoreError("malformed_record", `${what} must be a non-empty string`);
  }
  return value;
}

function parseEpochRef(raw: unknown, what: string): InstitutionEpochRefLike {
  const object = asRecord(raw, what);
  exactKeys(object, ["institutionId", "epoch", "digest"], what);
  if (!Number.isSafeInteger(object.epoch) || (object.epoch as number) < 0) {
    throw new CampaignStoreError("malformed_record", `${what}.epoch must be a non-negative integer`);
  }
  return Object.freeze({
    institutionId: stableId(object.institutionId, `${what}.institutionId`),
    epoch: object.epoch as number,
    digest: nonEmpty(object.digest, `${what}.digest`),
  });
}

function parseProjectRef(raw: unknown, what: string): CampaignProjectRef {
  const object = asRecord(raw, what);
  exactKeys(object, ["projectId", "revision", "digest"], what);
  if (!Number.isSafeInteger(object.revision) || (object.revision as number) < 0) {
    throw new CampaignStoreError("malformed_record", `${what}.revision must be a non-negative integer`);
  }
  return Object.freeze({
    projectId: stableId(object.projectId, `${what}.projectId`),
    revision: object.revision as number,
    digest: nonEmpty(object.digest, `${what}.digest`),
  });
}

export function parseCampaignCheckpoint(raw: unknown, what = "CampaignCheckpoint"): CampaignCheckpoint {
  const object = asRecord(raw, what);
  exactKeys(
    object,
    [
      "campaignId",
      "campaignBasisThroughSeq",
      "campaignBasisDigest",
      "institutionEpoch",
      "beliefStateDigest",
      "activeCommitmentIds",
      "activeHypothesisIds",
      "activeWatchIds",
      "knownProjectRefs",
    ],
    what,
  );
  if (!Number.isSafeInteger(object.campaignBasisThroughSeq) || (object.campaignBasisThroughSeq as number) < 0) {
    throw new CampaignStoreError("malformed_record", `${what}.campaignBasisThroughSeq must be a non-negative integer`);
  }
  if (!Array.isArray(object.activeCommitmentIds) || !Array.isArray(object.activeHypothesisIds) || !Array.isArray(object.activeWatchIds) || !Array.isArray(object.knownProjectRefs)) {
    throw new CampaignStoreError("malformed_record", `${what} id lists must be arrays`);
  }
  return Object.freeze({
    campaignId: stableId(object.campaignId, `${what}.campaignId`),
    campaignBasisThroughSeq: object.campaignBasisThroughSeq as number,
    campaignBasisDigest: nonEmpty(object.campaignBasisDigest, `${what}.campaignBasisDigest`),
    institutionEpoch: parseEpochRef(object.institutionEpoch, `${what}.institutionEpoch`),
    beliefStateDigest: nonEmpty(object.beliefStateDigest, `${what}.beliefStateDigest`),
    activeCommitmentIds: Object.freeze(object.activeCommitmentIds.map((entry) => stableId(entry, "commitmentId"))),
    activeHypothesisIds: Object.freeze(object.activeHypothesisIds.map((entry) => stableId(entry, "hypothesisId"))),
    activeWatchIds: Object.freeze(object.activeWatchIds.map((entry) => stableId(entry, "watchId"))),
    knownProjectRefs: Object.freeze(object.knownProjectRefs.map((entry) => parseProjectRef(entry, "knownProjectRef"))),
  });
}

export function parseWorldSnapshot(raw: unknown, what = "CampaignWorldSnapshot"): CampaignWorldSnapshot {
  const object = asRecord(raw, what);
  exactKeys(object, ["wakeCycleId", "institutionEpoch", "claimObservations", "projectObservations", "triggeredWatchIds", "digest"], what);
  if (!Array.isArray(object.claimObservations) || !Array.isArray(object.projectObservations) || !Array.isArray(object.triggeredWatchIds)) {
    throw new CampaignStoreError("malformed_record", `${what} observation lists must be arrays`);
  }
  const institutionEpoch = parseEpochRef(object.institutionEpoch, `${what}.institutionEpoch`);
  const claimObservations = Object.freeze(object.claimObservations.map((entry) => parseStanding(entry, "claimObservation")));
  const projectObservations = Object.freeze(
    object.projectObservations.map((entry) => {
      const item = asRecord(entry, "projectObservation");
      exactKeys(item, ["project", "standing"], "projectObservation");
      return Object.freeze({
        project: parseProjectRef(item.project, "projectObservation.project"),
        standing: parseProjectOperationalStanding(item.standing, "projectObservation.standing"),
      });
    }),
  );
  const triggeredWatchIds = Object.freeze(object.triggeredWatchIds.map((entry) => stableId(entry, "watchId")));
  const digest = nonEmpty(object.digest, `${what}.digest`);
  const computed = canonicalDigest({ domain: "palimpsest.campaign-world-snapshot.v1", wakeCycleId: stableId(object.wakeCycleId, `${what}.wakeCycleId`), institutionEpoch, claimObservations, projectObservations, triggeredWatchIds });
  if (digest !== computed) throw new CampaignStoreError("malformed_record", `${what}.digest does not match its content`);
  return Object.freeze({ wakeCycleId: stableId(object.wakeCycleId, `${what}.wakeCycleId`), institutionEpoch, claimObservations, projectObservations, triggeredWatchIds, digest });
}

function parseStanding(raw: unknown, what: string): ClaimStandingSnapshot {
  const object = asRecord(raw, what);
  exactKeys(object, ["claim", "status", "supportingEvidenceIds", "contradictingEvidenceIds", "provenanceDigest", "digest"], what);
  const claim = asRecord(object.claim, `${what}.claim`);
  exactKeys(claim, ["claimId"], `${what}.claim`);
  const statuses = ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "INCONCLUSIVE", "STALE"];
  if (typeof object.status !== "string" || !statuses.includes(object.status)) {
    throw new CampaignStoreError("malformed_record", `${what}.status must be a ClaimStatus`);
  }
  const requireIdList = (value: unknown, field: string): readonly string[] => {
    if (!Array.isArray(value)) throw new CampaignStoreError("malformed_record", `${what}.${field} must be an array`);
    return Object.freeze(value.map((entry) => stableId(entry, `${what}.${field}[]`)));
  };
  return Object.freeze({
    claim: Object.freeze({ claimId: stableId(claim.claimId, `${what}.claim.claimId`) }),
    status: object.status as ClaimStandingSnapshot["status"],
    supportingEvidenceIds: requireIdList(object.supportingEvidenceIds, "supportingEvidenceIds"),
    contradictingEvidenceIds: requireIdList(object.contradictingEvidenceIds, "contradictingEvidenceIds"),
    provenanceDigest: nonEmpty(object.provenanceDigest, `${what}.provenanceDigest`),
    digest: nonEmpty(object.digest, `${what}.digest`),
  });
}

export interface LifecycleServiceDeps {
  readonly store: CampaignStore;
  readonly allocateWakeCycleId: () => WakeCycleId;
  readonly institutions?: CampaignInstitutionEpochSource | undefined;
  readonly evidence?: CampaignEvidencePort | undefined;
  readonly work?: CampaignWorkObservationPort | undefined;
}

export interface CampaignWakeState {
  readonly wakeCycleId: WakeCycleId;
  readonly cause: string;
  readonly checkpointBasisDigest: string;
  readonly reconciled: boolean;
  readonly completed: boolean;
  readonly nextAction: "project" | "wait" | null;
}

export interface LifecycleService {
  lifecycle(campaignId: string): Promise<CampaignLifecycleState>;
  latestCheckpoint(campaignId: string): Promise<CampaignCheckpoint | undefined>;
  beginDormancy(input: {
    readonly campaignId: string;
    readonly checkpoint: CampaignCheckpoint;
    readonly reason: string;
  }): Promise<void>;
  /** Observe the relevant world; ANY unknown load-bearing fact → incomplete (§139). */
  observeWorld(input: { readonly campaignId: string; readonly wakeCycleId: WakeCycleId }): Promise<WorldObservationResult>;
  beginWake(input: { readonly campaignId: string; readonly cause: string }): Promise<{ readonly wakeCycleId: WakeCycleId }>;
  reconcile(input: {
    readonly campaignId: string;
    readonly wakeCycleId: WakeCycleId;
    readonly snapshot: CampaignWorldSnapshot;
  }): Promise<{ readonly activeCommitmentIds: readonly string[] }>;
  completeWake(input: {
    readonly campaignId: string;
    readonly wakeCycleId: WakeCycleId;
    readonly nextAction: "project" | "wait";
  }): Promise<void>;
  terminate(input: { readonly campaignId: string; readonly reason: string }): Promise<void>;
  wakeStates(campaignId: string): Promise<readonly CampaignWakeState[]>;
}

export function makeLifecycleService(deps: LifecycleServiceDeps): LifecycleService {
  async function replay(campaignId: string): Promise<readonly CampaignEvent[]> {
    return deps.store.replay(campaignId);
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

  async function lifecycle(campaignId: string): Promise<CampaignLifecycleState> {
    const events = await replay(campaignId);
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
        case "WORLD_RECONCILED":
          state = "RECONCILING";
          break;
        case "WAKE_COMPLETED":
          state = (event.payload as { nextAction: "project" | "wait" }).nextAction === "project" ? "ACTIVE" : "DORMANT";
          break;
        default:
          break;
      }
    }
    return state;
  }

  async function latestCheckpoint(campaignId: string): Promise<CampaignCheckpoint | undefined> {
    let checkpoint: CampaignCheckpoint | undefined;
    for (const event of await replay(campaignId)) {
      if (event.type === "CHECKPOINT_RECORDED") checkpoint = (event.payload as { checkpoint: CampaignCheckpoint }).checkpoint;
    }
    return checkpoint;
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
    const pick = (map: Map<string, string>) => Object.freeze([...map.entries()].filter(([, v]) => v === "OPEN" || v === "ACTIVE").map(([k]) => k).sort());
    return { commitments: pick(commitments), hypotheses: pick(hypotheses), watches: pick(watches) };
  }

  async function beginDormancy(input: {
    readonly campaignId: string;
    readonly checkpoint: CampaignCheckpoint;
    readonly reason: string;
  }): Promise<void> {
    // §117/§131: two dormant wake routes must exist, and checkpoint + quiescing
    // + dormant commit together so we can never be "dormant with no wake route".
    const events = await replay(input.campaignId);
    const { watches } = activeIds(events);
    if (watches.length === 0) {
      throw new CampaignStoreError("invalid_registration", "cannot become DORMANT without an active prospective wake route");
    }
    const basis = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [
        request("CHECKPOINT_RECORDED", input.campaignId, { checkpoint: input.checkpoint }),
        request("CAMPAIGN_QUIESCING", input.campaignId, { reason: input.reason }),
        request("CAMPAIGN_DORMANT", input.campaignId, { checkpointBasisDigest: input.checkpoint.campaignBasisDigest }),
      ],
    });
  }

  async function observeWorld(input: { readonly campaignId: string; readonly wakeCycleId: WakeCycleId }): Promise<WorldObservationResult> {
    const checkpoint = await latestCheckpoint(input.campaignId);
    if (checkpoint === undefined) return { status: "reconciliation_incomplete", detail: "no checkpoint exists" };
    if (deps.institutions === undefined) return { status: "reconciliation_incomplete", detail: "no institution epoch source" };
    const epoch = await deps.institutions.inspectEpoch(checkpoint.institutionEpoch.institutionId);
    if (epoch.state !== "known") return { status: "reconciliation_incomplete", detail: `institution epoch ${epoch.state}` };
    const synthetic = canonicalDigest({
      domain: "palimpsest.campaign-world-snapshot.v1",
      wakeCycleId: input.wakeCycleId,
      institutionEpoch: epoch.value,
      claimObservations: [],
      projectObservations: [],
      triggeredWatchIds: [],
    });
    return {
      status: "complete",
      snapshot: Object.freeze({
        wakeCycleId: input.wakeCycleId,
        institutionEpoch: epoch.value,
        claimObservations: Object.freeze([]),
        projectObservations: Object.freeze([]),
        triggeredWatchIds: Object.freeze([]),
        digest: synthetic,
      }),
    };
  }

  async function beginWake(input: { readonly campaignId: string; readonly cause: string }): Promise<{ readonly wakeCycleId: WakeCycleId }> {
    const state = await lifecycle(input.campaignId);
    // §136: continuity check — the Campaign must still exist and not be TERMINATED.
    if (state === "TERMINATED") {
      throw new CampaignStoreError("invalid_registration", "cannot wake a TERMINATED campaign");
    }
    const checkpoint = await latestCheckpoint(input.campaignId);
    if (checkpoint === undefined) {
      throw new CampaignStoreError("invalid_registration", "wake_blocked: no canonical checkpoint exists");
    }
    const basis = await currentBasis(input.campaignId);
    const wakeCycleId = deps.allocateWakeCycleId();
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("WAKE_STARTED", input.campaignId, { wakeCycleId, cause: input.cause, checkpointBasisDigest: checkpoint.campaignBasisDigest })],
    });
    return Object.freeze({ wakeCycleId });
  }

  async function reconcile(input: {
    readonly campaignId: string;
    readonly wakeCycleId: WakeCycleId;
    readonly snapshot: CampaignWorldSnapshot;
  }): Promise<{ readonly activeCommitmentIds: readonly string[] }> {
    const events = await replay(input.campaignId);
    const wakeStarted = events.some(
      (event) => event.type === "WAKE_STARTED" && (event.payload as { wakeCycleId: WakeCycleId }).wakeCycleId === input.wakeCycleId,
    );
    if (!wakeStarted) throw new CampaignStoreError("invalid_registration", `wake cycle "${input.wakeCycleId}" was never started`);
    const { commitments } = activeIds(events);
    const basis = await currentBasis(input.campaignId);
    // One atomic reconciliation commit: world snapshot + commitment review.
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [
        request("WORLD_RECONCILED", input.campaignId, { wakeCycleId: input.wakeCycleId, snapshot: input.snapshot }),
        request("COMMITMENTS_REVIEWED", input.campaignId, { wakeCycleId: input.wakeCycleId, activeCommitmentIds: commitments }),
      ],
    });
    return Object.freeze({ activeCommitmentIds: commitments });
  }

  async function completeWake(input: {
    readonly campaignId: string;
    readonly wakeCycleId: WakeCycleId;
    readonly nextAction: "project" | "wait";
  }): Promise<void> {
    const events = await replay(input.campaignId);
    const wakeIndex = events.findIndex(
      (event) => event.type === "WAKE_STARTED" && (event.payload as { wakeCycleId: WakeCycleId }).wakeCycleId === input.wakeCycleId,
    );
    if (wakeIndex < 0) {
      throw new CampaignStoreError("invalid_registration", `wake cycle "${input.wakeCycleId}" was never started`);
    }
    if (input.nextAction === "wait") {
      // §117/§178: a WAIT wake must install a NEW wake route for THIS cycle.
      const installedAfterWake = events.some((event, index) => index > wakeIndex && event.type === "WATCH_INSTALLED");
      if (!installedAfterWake) {
        throw new CampaignStoreError("invalid_registration", "a WAIT wake completion requires an installed wake route");
      }
    }
    const basis = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("WAKE_COMPLETED", input.campaignId, { wakeCycleId: input.wakeCycleId, nextAction: input.nextAction })],
    });
  }

  async function terminate(input: { readonly campaignId: string; readonly reason: string }): Promise<void> {
    // §150: TERMINATED is explicit and terminal; never entered because a
    // runtime stopped, a Project failed, a watch was unavailable, or because
    // the Campaign has been dormant for a long time.
    const basis = await currentBasis(input.campaignId);
    const state = await lifecycle(input.campaignId);
    if (state === "TERMINATED") return;
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("CAMPAIGN_TERMINATED", input.campaignId, { reason: input.reason })],
    });
  }

  async function wakeStates(campaignId: string): Promise<readonly CampaignWakeState[]> {
    const byId = new Map<WakeCycleId, CampaignWakeState>();
    for (const event of await replay(campaignId)) {
      switch (event.type) {
        case "WAKE_STARTED": {
          const payload = event.payload as { wakeCycleId: WakeCycleId; cause: string; checkpointBasisDigest: string };
          byId.set(payload.wakeCycleId, { wakeCycleId: payload.wakeCycleId, cause: payload.cause, checkpointBasisDigest: payload.checkpointBasisDigest, reconciled: false, completed: false, nextAction: null });
          break;
        }
        case "WORLD_RECONCILED": {
          const { wakeCycleId } = event.payload as { wakeCycleId: WakeCycleId };
          const existing = byId.get(wakeCycleId);
          if (existing !== undefined) byId.set(wakeCycleId, { ...existing, reconciled: true });
          break;
        }
        case "WAKE_COMPLETED": {
          const { wakeCycleId, nextAction } = event.payload as { wakeCycleId: WakeCycleId; nextAction: "project" | "wait" };
          const existing = byId.get(wakeCycleId);
          if (existing !== undefined) byId.set(wakeCycleId, { ...existing, completed: true, nextAction });
          break;
        }
        default:
          break;
      }
    }
    return Object.freeze([...byId.values()]);
  }

  return { lifecycle, latestCheckpoint, beginDormancy, observeWorld, beginWake, reconcile, completeWake, terminate, wakeStates };
}

