/**
 * G10-G4 prospective memory, watchers, and WAIT (§103–§123).
 *
 * Prospective memory = durable conditions under which a dormant Campaign
 * becomes eligible for wake/reconsideration. It is NOT a background
 * RuntimeAgent, a timer process identity, or a context reminder string.
 *
 *   watch firing  → "reconsider the Campaign"  (never "claim true", never
 *                   "commitment satisfied", never "Project needed") (§107)
 *   WAIT          → a first-class legitimate action, never failure (§121)
 *   unknown ≠ triggered; error ≠ false          (§110)
 *
 * Watch evaluation is READ-ONLY (§120): it never creates Work, modifies
 * Evidence, advances an Institution, or changes beliefs. Trigger recording is
 * a separate Campaign write.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { CampaignEventParsers } from "./artifacts.js";
import type { ProjectOperationalStanding, WorkKnowledge } from "./intervention.js";
import type { CampaignProjectRef } from "./intervention.js";
import { parseCampaignProjectRef } from "./intervention.js";
import { requireCanonicalDigest } from "./digest.js";
import type { CampaignEvidencePort, EvidenceClaimRef } from "./epistemic.js";
import { parseEvidenceClaimRef } from "./epistemic.js";
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";

export type WatchId = string;

export type CampaignWatchCondition =
  | { readonly kind: "not_before"; readonly at: string }
  | { readonly kind: "claim_changed"; readonly claim: EvidenceClaimRef; readonly baselineDigest: string }
  | { readonly kind: "institution_epoch_changed"; readonly institutionId: string; readonly baselineEpoch: number }
  | { readonly kind: "project_terminal"; readonly project: CampaignProjectRef }
  | { readonly kind: "external_signal"; readonly signalKey: string };

export interface CampaignWatch {
  readonly watchId: WatchId;
  readonly campaignId: string;
  readonly condition: CampaignWatchCondition;
  readonly reason: string;
}

export interface CampaignWatchDraft {
  readonly condition: CampaignWatchCondition;
  readonly reason: string;
}

/** Read-only external-signal source (§109). */
export interface CampaignExternalSignalPort {
  inspect(signalKey: string): Promise<WorkKnowledge<boolean>>;
}

/** Read-only institution epoch source (§111). */
export interface CampaignInstitutionEpochPort {
  currentEpoch(institutionId: string): Promise<WorkKnowledge<number>>;
}

/** Read-only Work project-state source (reused from G3) (§113). */
export interface CampaignProjectStandingPort {
  inspectProject(project: CampaignProjectRef): Promise<WorkKnowledge<ProjectOperationalStanding>>;
}

export type WaitAdmissionId = string;

/**
 * GC2 §84/§85 + GC3 §48/§49: a wake-origin WAIT admission is an explicit
 * identity bound to the exact COMPILED CANDIDATE (by digest), the WakeCycle,
 * the reconciliation, and the newly installed watches + prospective checkpoint.
 * A historical WAIT can never satisfy a later wake. The admission must be able
 * to answer "which complete candidate was admitted?" — hence `candidateDigest`
 * is mandatory.
 */
export interface WaitAdmission {
  readonly waitAdmissionId: WaitAdmissionId;
  readonly campaignId: string;
  readonly compilationId: string;
  readonly candidateDigest: string;
  readonly wakeCycleId: string;
  readonly reconciliationDigest: string;
  readonly watchIds: readonly string[];
  readonly checkpointDigest: string;
}

export function parseWaitAdmission(raw: unknown, what = "WaitAdmission"): WaitAdmission {
  const object = asRecord(raw, what);
  exactKeys(
    object,
    ["waitAdmissionId", "campaignId", "compilationId", "candidateDigest", "wakeCycleId", "reconciliationDigest", "watchIds", "checkpointDigest"],
    what,
  );
  if (!Array.isArray(object.watchIds)) throw new CampaignStoreError("malformed_record", `${what}.watchIds must be an array`);
  // §52: WatchIds are a semantic set — valid ids, duplicates rejected, sorted.
  const watchIds = object.watchIds.map((entry) => stableId(entry, "watchId"));
  if (new Set(watchIds).size !== watchIds.length) {
    throw new CampaignStoreError("malformed_record", `${what}.watchIds must not contain duplicates`);
  }
  return Object.freeze({
    waitAdmissionId: stableId(object.waitAdmissionId, `${what}.waitAdmissionId`),
    campaignId: stableId(object.campaignId, `${what}.campaignId`),
    compilationId: stableId(object.compilationId, `${what}.compilationId`),
    candidateDigest: requireCanonicalDigest(object.candidateDigest, `${what}.candidateDigest`),
    wakeCycleId: stableId(object.wakeCycleId, `${what}.wakeCycleId`),
    reconciliationDigest: requireCanonicalDigest(object.reconciliationDigest, `${what}.reconciliationDigest`),
    watchIds: Object.freeze(watchIds.sort()),
    checkpointDigest: requireCanonicalDigest(object.checkpointDigest, `${what}.checkpointDigest`),
  });
}

export type WatchStatus = "ACTIVE" | "TRIGGERED" | "CANCELLED";

export type WatchEvaluation =
  | { readonly watchId: WatchId; readonly status: "pending"; readonly detail: string }
  | { readonly watchId: WatchId; readonly status: "triggered"; readonly detail: string }
  | { readonly watchId: WatchId; readonly status: "incomplete"; readonly detail: string };

export const CAMPAIGN_PROSPECTIVE_EVENT_PARSERS: CampaignEventParsers = Object.freeze({
  WATCH_INSTALLED: (payload: unknown) => {
    const object = asRecord(payload, "WATCH_INSTALLED");
    exactKeys(object, ["watch"], "WATCH_INSTALLED");
    return Object.freeze({ watch: parseCampaignWatch(object.watch) });
  },
  WATCH_TRIGGERED: (payload: unknown) => {
    const object = asRecord(payload, "WATCH_TRIGGERED");
    exactKeys(object, ["watchId", "cause"], "WATCH_TRIGGERED");
    return Object.freeze({ watchId: stableId(object.watchId, "watchId"), cause: nonEmpty(object.cause, "cause") });
  },
  WATCH_CANCELLED: (payload: unknown) => {
    const object = asRecord(payload, "WATCH_CANCELLED");
    exactKeys(object, ["watchId", "reason"], "WATCH_CANCELLED");
    return Object.freeze({ watchId: stableId(object.watchId, "watchId"), reason: nonEmpty(object.reason, "reason") });
  },
  WAIT_DECIDED: (payload: unknown) => {
    const object = asRecord(payload, "WAIT_DECIDED");
    exactKeys(object, ["reason", "watchIds"], "WAIT_DECIDED");
    if (!Array.isArray(object.watchIds)) throw new CampaignStoreError("malformed_record", "watchIds must be an array");
    return Object.freeze({
      reason: nonEmpty(object.reason, "reason"),
      watchIds: Object.freeze(object.watchIds.map((entry) => stableId(entry, "watchId")).sort()),
    });
  },
  WAIT_ADMITTED: (payload: unknown) => {
    const object = asRecord(payload, "WAIT_ADMITTED");
    exactKeys(object, ["waitAdmission"], "WAIT_ADMITTED");
    return Object.freeze({ waitAdmission: parseWaitAdmission(object.waitAdmission) });
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

export function parseWatchCondition(raw: unknown, what = "CampaignWatchCondition"): CampaignWatchCondition {
  const object = asRecord(raw, what);
  switch (object.kind) {
    case "not_before": {
      exactKeys(object, ["kind", "at"], what);
      return Object.freeze({ kind: "not_before" as const, at: nonEmpty(object.at, `${what}.at`) });
    }
    case "claim_changed": {
      exactKeys(object, ["kind", "claim", "baselineDigest"], what);
      return Object.freeze({
        kind: "claim_changed" as const,
        claim: parseEvidenceClaimRef(object.claim, `${what}.claim`),
        baselineDigest: nonEmpty(object.baselineDigest, `${what}.baselineDigest`),
      });
    }
    case "institution_epoch_changed": {
      exactKeys(object, ["kind", "institutionId", "baselineEpoch"], what);
      if (!Number.isSafeInteger(object.baselineEpoch) || (object.baselineEpoch as number) < 0) {
        throw new CampaignStoreError("malformed_record", `${what}.baselineEpoch must be a non-negative integer`);
      }
      return Object.freeze({
        kind: "institution_epoch_changed" as const,
        institutionId: stableId(object.institutionId, `${what}.institutionId`),
        baselineEpoch: object.baselineEpoch as number,
      });
    }
    case "project_terminal": {
      exactKeys(object, ["kind", "project"], what);
      return Object.freeze({ kind: "project_terminal" as const, project: parseCampaignProjectRef(object.project, `${what}.project`) });
    }
    case "external_signal": {
      exactKeys(object, ["kind", "signalKey"], what);
      return Object.freeze({ kind: "external_signal" as const, signalKey: nonEmpty(object.signalKey, `${what}.signalKey`) });
    }
    default:
      throw new CampaignStoreError("malformed_record", `${what}.kind is not a supported watch condition`);
  }
}

export function parseCampaignWatch(raw: unknown, what = "CampaignWatch"): CampaignWatch {
  const object = asRecord(raw, what);
  exactKeys(object, ["watchId", "campaignId", "condition", "reason"], what);
  return Object.freeze({
    watchId: stableId(object.watchId, `${what}.watchId`),
    campaignId: stableId(object.campaignId, `${what}.campaignId`),
    condition: parseWatchCondition(object.condition, `${what}.condition`),
    reason: nonEmpty(object.reason, `${what}.reason`),
  });
}

/** Strict CampaignWatchDraft parser — rejects unknown fields (§20). */
export function parseCampaignWatchDraft(raw: unknown, what = "CampaignWatchDraft"): CampaignWatchDraft {
  const object = asRecord(raw, what);
  exactKeys(object, ["condition", "reason"], what);
  return Object.freeze({
    condition: parseWatchCondition(object.condition, `${what}.condition`),
    reason: nonEmpty(object.reason, `${what}.reason`),
  });
}

export interface ProspectiveServiceDeps {
  readonly store: CampaignStore;
  readonly allocateWatchId: () => WatchId;
  /** Injected clock — `not_before` never calls Date.now() (§108). */
  readonly clock: () => string;
  readonly evidence?: CampaignEvidencePort | undefined;
  readonly signals?: CampaignExternalSignalPort | undefined;
  readonly institutions?: CampaignInstitutionEpochPort | undefined;
  readonly projects?: CampaignProjectStandingPort | undefined;
}

export interface CampaignWatchState {
  readonly watch: CampaignWatch;
  readonly status: WatchStatus;
}

export interface ProspectiveService {
  installWatch(input: { readonly campaignId: string; readonly condition: CampaignWatchCondition; readonly reason: string }): Promise<CampaignWatch>;
  /** READ-ONLY evaluation (§120). */
  scanWatches(campaignId: string): Promise<readonly WatchEvaluation[]>;
  recordTrigger(input: { readonly campaignId: string; readonly watchId: WatchId; readonly cause: string }): Promise<void>;
  /**
   * G10-AC §14: record SEVERAL triggered watches in ONE atomic write, so
   * reconciliation can truthfully see the complete triggered-watch set. Returns
   * the watch ids actually recorded (already-triggered watches are idempotent
   * and excluded), in deterministic order. Additive: `recordTrigger` is a
   * one-element case of this and stays for compatibility.
   */
  recordTriggers(input: {
    readonly campaignId: string;
    readonly triggers: readonly { readonly watchId: WatchId; readonly cause: string }[];
  }): Promise<readonly WatchId[]>;
  cancelWatch(input: { readonly campaignId: string; readonly watchId: WatchId; readonly reason: string }): Promise<void>;
  /** A WAIT admission must install at least one wake route (§117). */
  wait(input: {
    readonly campaignId: string;
    readonly reason: string;
    readonly watches: readonly CampaignWatchDraft[];
  }): Promise<{ readonly reason: string; readonly watchIds: readonly WatchId[] }>;
  watchStates(campaignId: string): Promise<readonly CampaignWatchState[]>;
}

export function makeProspectiveService(deps: ProspectiveServiceDeps): ProspectiveService {
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

  function materializeWatch(campaignId: string, draft: CampaignWatchDraft, watchId: WatchId): CampaignWatch {
    return Object.freeze({
      watchId,
      campaignId,
      condition: draft.condition,
      reason: draft.reason,
    });
  }

  async function installWatch(input: {
    readonly campaignId: string;
    readonly condition: CampaignWatchCondition;
    readonly reason: string;
  }): Promise<CampaignWatch> {
    const basis = await currentBasis(input.campaignId);
    const watch = materializeWatch(input.campaignId, { condition: input.condition, reason: input.reason }, deps.allocateWatchId());
    await deps.store.appendAtomic({ expectedBasis: basis, events: [request("WATCH_INSTALLED", input.campaignId, { watch })] });
    return watch;
  }

  async function activeWatches(campaignId: string): Promise<readonly CampaignWatch[]> {
    const events = await deps.store.replay(campaignId);
    const byId = new Map<WatchId, CampaignWatch>();
    const ended = new Set<WatchId>();
    for (const event of events) {
      if (event.type === "WATCH_INSTALLED") {
        const watch = (event.payload as { watch: CampaignWatch }).watch;
        byId.set(watch.watchId, watch);
      } else if (event.type === "WATCH_TRIGGERED") {
        ended.add((event.payload as { watchId: WatchId }).watchId);
      } else if (event.type === "WATCH_CANCELLED") {
        ended.add((event.payload as { watchId: WatchId }).watchId);
      }
    }
    return Object.freeze([...byId.values()].filter((watch) => !ended.has(watch.watchId)));
  }

  async function evaluate(watch: CampaignWatch): Promise<WatchEvaluation> {
    const condition = watch.condition;
    switch (condition.kind) {
      case "not_before": {
        const now = deps.clock();
        return now >= condition.at
          ? { watchId: watch.watchId, status: "triggered", detail: `clock ${now} reached ${condition.at}` }
          : { watchId: watch.watchId, status: "pending", detail: `waiting until ${condition.at}` };
      }
      case "claim_changed": {
        if (deps.evidence === undefined) return { watchId: watch.watchId, status: "incomplete", detail: "no evidence port" };
        const knowledge = await deps.evidence.inspectClaim(condition.claim);
        if (knowledge.state !== "known") return { watchId: watch.watchId, status: "incomplete", detail: `claim ${knowledge.state}` };
        return knowledge.value.digest !== condition.baselineDigest
          ? { watchId: watch.watchId, status: "triggered", detail: "claim standing changed" }
          : { watchId: watch.watchId, status: "pending", detail: "claim standing unchanged" };
      }
      case "institution_epoch_changed": {
        if (deps.institutions === undefined) return { watchId: watch.watchId, status: "incomplete", detail: "no institution port" };
        const knowledge = await deps.institutions.currentEpoch(condition.institutionId);
        if (knowledge.state !== "known") return { watchId: watch.watchId, status: "incomplete", detail: `institution ${knowledge.state}` };
        return knowledge.value !== condition.baselineEpoch
          ? { watchId: watch.watchId, status: "triggered", detail: `epoch ${knowledge.value} != ${condition.baselineEpoch}` }
          : { watchId: watch.watchId, status: "pending", detail: "epoch unchanged" };
      }
      case "project_terminal": {
        if (deps.projects === undefined) return { watchId: watch.watchId, status: "incomplete", detail: "no project port" };
        const knowledge = await deps.projects.inspectProject(condition.project);
        if (knowledge.state !== "known") return { watchId: watch.watchId, status: "incomplete", detail: `project ${knowledge.state}` };
        return knowledge.value !== "running"
          ? { watchId: watch.watchId, status: "triggered", detail: `project ${knowledge.value}` }
          : { watchId: watch.watchId, status: "pending", detail: "project running" };
      }
      case "external_signal": {
        if (deps.signals === undefined) return { watchId: watch.watchId, status: "incomplete", detail: "no signal port" };
        const knowledge = await deps.signals.inspect(condition.signalKey);
        if (knowledge.state !== "known") return { watchId: watch.watchId, status: "incomplete", detail: `signal ${knowledge.state}` };
        return knowledge.value
          ? { watchId: watch.watchId, status: "triggered", detail: "signal set" }
          : { watchId: watch.watchId, status: "pending", detail: "signal unset" };
      }
      default:
        return { watchId: watch.watchId, status: "incomplete", detail: "unknown condition" };
    }
  }

  async function scanWatches(campaignId: string): Promise<readonly WatchEvaluation[]> {
    const watches = await activeWatches(campaignId);
    const results: WatchEvaluation[] = [];
    for (const watch of watches) results.push(await evaluate(watch));
    return Object.freeze(results);
  }

  async function recordTrigger(input: { readonly campaignId: string; readonly watchId: WatchId; readonly cause: string }): Promise<void> {
    const basis = await currentBasis(input.campaignId);
    // Trigger recording is idempotent: a watch already triggered does not gain
    // a second semantic trigger for the same condition instance (§115).
    const events = await deps.store.replay(input.campaignId);
    const already = events.some(
      (event: CampaignEvent) => event.type === "WATCH_TRIGGERED" && (event.payload as { watchId: WatchId }).watchId === input.watchId,
    );
    if (already) return;
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("WATCH_TRIGGERED", input.campaignId, { watchId: input.watchId, cause: input.cause })],
    });
  }

  /**
   * Atomic multi-trigger. The whole set lands in ONE `appendAtomic` batch against
   * the SAME basis, so a crash cannot leave a partially-recorded trigger set and
   * the reconciliation that follows sees every trigger of this condition epoch.
   */
  async function recordTriggers(input: {
    readonly campaignId: string;
    readonly triggers: readonly { readonly watchId: WatchId; readonly cause: string }[];
  }): Promise<readonly WatchId[]> {
    if (input.triggers.length === 0) return Object.freeze([]);
    const basis = await currentBasis(input.campaignId);
    const events = await deps.store.replay(input.campaignId);
    const already = new Set(
      events
        .filter((event: CampaignEvent) => event.type === "WATCH_TRIGGERED")
        .map((event: CampaignEvent) => (event.payload as { watchId: WatchId }).watchId),
    );
    // Deterministic order, deduplicated, and idempotent per watch.
    const fresh = [...new Set(input.triggers.map((trigger) => trigger.watchId))]
      .filter((watchId) => !already.has(watchId))
      .sort();
    if (fresh.length === 0) return Object.freeze([]);
    const causeOf = new Map(input.triggers.map((trigger) => [trigger.watchId, trigger.cause]));
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: fresh.map((watchId) =>
        request("WATCH_TRIGGERED", input.campaignId, { watchId, cause: causeOf.get(watchId) ?? "condition satisfied" }),
      ),
    });
    return Object.freeze(fresh);
  }

  async function cancelWatch(input: { readonly campaignId: string; readonly watchId: WatchId; readonly reason: string }): Promise<void> {
    const basis = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: basis,
      events: [request("WATCH_CANCELLED", input.campaignId, { watchId: input.watchId, reason: input.reason })],
    });
  }

  async function wait(input: {
    readonly campaignId: string;
    readonly reason: string;
    readonly watches: readonly CampaignWatchDraft[];
  }): Promise<{ readonly reason: string; readonly watchIds: readonly WatchId[] }> {
    // §117: a WAIT admission must have at least one wake route.
    if (input.watches.length === 0) {
      throw new CampaignStoreError("invalid_registration", "WAIT requires at least one prospective wake route");
    }
    const basis = await currentBasis(input.campaignId);
    const installed = input.watches.map((draft) => materializeWatch(input.campaignId, draft, deps.allocateWatchId()));
    const events: CampaignAppendRequest[] = installed.map((watch) => request("WATCH_INSTALLED", input.campaignId, { watch }));
    events.push(request("WAIT_DECIDED", input.campaignId, { reason: input.reason, watchIds: installed.map((watch) => watch.watchId) }));
    await deps.store.appendAtomic({ expectedBasis: basis, events });
    return Object.freeze({ reason: input.reason, watchIds: Object.freeze(installed.map((watch) => watch.watchId)) });
  }

  async function watchStates(campaignId: string): Promise<readonly CampaignWatchState[]> {
    const events = await deps.store.replay(campaignId);
    const byId = new Map<WatchId, CampaignWatchState>();
    for (const event of events) {
      if (event.type === "WATCH_INSTALLED") {
        const watch = (event.payload as { watch: CampaignWatch }).watch;
        byId.set(watch.watchId, { watch, status: "ACTIVE" });
      } else if (event.type === "WATCH_TRIGGERED") {
        const { watchId } = event.payload as { watchId: WatchId };
        const existing = byId.get(watchId);
        if (existing !== undefined) byId.set(watchId, { ...existing, status: "TRIGGERED" });
      } else if (event.type === "WATCH_CANCELLED") {
        const { watchId } = event.payload as { watchId: WatchId };
        const existing = byId.get(watchId);
        if (existing !== undefined) byId.set(watchId, { ...existing, status: "CANCELLED" });
      }
    }
    return Object.freeze([...byId.values()]);
  }

  return { installWatch, scanWatches, recordTrigger,
    recordTriggers, cancelWatch, wait, watchStates };
}
