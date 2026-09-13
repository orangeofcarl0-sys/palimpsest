/**
 * G10-GC3 — unified next-action admission.
 *
 *   Compile ≠ Admit ≠ Execute ≠ Complete
 *
 * ONE admission boundary accepts a COMPLETE `CompiledCampaignAction` and
 * dispatches internally on `compiled.action.kind`. A caller can never choose the
 * arm, supply a `reason`/`watches`, a `compilationId`, a `reconciliationDigest`,
 * or a `wakeCycleId` as independent semantic inputs — every WAIT semantic is
 * derived from the compiled candidate.
 *
 *   Candidate ≠ canonical truth   (the compiler stays untrusted)
 *   Admission ⇒ a complete, strictly parsed, fresh candidate
 *
 * For a wake-bound Project the service drives the existing idempotent Work saga
 * and then completes the wake; for a wake-bound WAIT it performs the single-store
 * prospective-memory transition. Both yield an `AdmittedCampaignActionRef` and a
 * `WAKE_CYCLE_COMPLETED` bound to that exact action.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { CampaignProjectRef } from "./intervention.js";
import type { AdmittedCampaignActionRef } from "./production.js";
import {
  checkpointDigestOf,
  committedReconciliationOf,
  evaluateCompiledCampaignActionFreshness,
  inFlightWake,
  lifecycleStateFromEvents,
} from "./production.js";
import type { Knowledge } from "./production.js";
import type { CampaignCheckpoint, CampaignLifecycleState } from "./lifecycle.js";
import type { WaitAdmission } from "./prospective.js";
import { parseWaitAdmission } from "./prospective.js";
import type { CompiledCampaignAction } from "./compiler.js";
import { compiledCampaignActionDigestOf, parseCompiledCampaignAction } from "./compiler.js";
import { campaignEventId } from "./service.js";
import type { CampaignEventType } from "./artifacts.js";
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";

export const CAMPAIGN_WAIT_ADMISSION_ID_DOMAIN = "palimpsest.campaign-wait-admission-id.v1";

export type CampaignNextActionAdmissionResult =
  | {
      readonly status: "admitted";
      /** The exact admitted action; null only for a legitimate non-wake Project. */
      readonly action: AdmittedCampaignActionRef | null;
      readonly lifecycle: CampaignLifecycleState;
      readonly project?: CampaignProjectRef | undefined;
    }
  | { readonly status: "stale"; readonly detail: string }
  | { readonly status: "conflict"; readonly detail: string }
  | { readonly status: "incomplete"; readonly detail: string };

/** Narrow Project-admission port (backed by the existing CompilerService saga). */
export interface CampaignProjectAdmissionPort {
  admit(input: { readonly campaignId: string; readonly compiled: CompiledCampaignAction }): Promise<
    | { readonly status: "admitted"; readonly project: CampaignProjectRef; readonly completion: AdmittedCampaignActionRef | null }
    | { readonly status: "stale" | "conflict"; readonly detail: string }
  >;
}

/** The Campaign production primitives the unified boundary needs. */
export interface CampaignNextActionProductionPort {
  buildCurrentCampaignCheckpoint(
    campaignId: string,
    options?: { readonly additionalWatchIds?: readonly string[] },
  ): Promise<Knowledge<CampaignCheckpoint>>;
  completeWakeWithAction(input: {
    readonly campaignId: string;
    readonly wakeCycleId: string;
    readonly action: AdmittedCampaignActionRef;
  }): Promise<void>;
  lifecycleState(campaignId: string): Promise<CampaignLifecycleState>;
}

export interface NextActionAdmissionDeps {
  readonly store: CampaignStore;
  /** Absent ⇒ Project candidates cannot be admitted; WAIT candidates still can. */
  readonly projectAdmission?: CampaignProjectAdmissionPort | undefined;
  readonly production: CampaignNextActionProductionPort;
  readonly allocateWatchId: () => string;
  readonly knownGateIds?: ReadonlySet<string> | undefined;
}

export interface NextActionAdmissionService {
  admitCompiledNextAction(input: {
    readonly campaignId: string;
    readonly compiled: unknown;
  }): Promise<CampaignNextActionAdmissionResult>;
}

function request(type: CampaignEventType, campaignId: string, payload: unknown): CampaignAppendRequest {
  return { eventId: campaignEventId(type, campaignId, payload), type, payload };
}

function activeHypothesisIds(events: readonly CampaignEvent[]): ReadonlySet<string> {
  const state = new Map<string, string>();
  for (const event of events) {
    if (event.type === "HYPOTHESIS_PROPOSED") {
      state.set((event.payload as { hypothesis: { hypothesisId: string } }).hypothesis.hypothesisId, "ACTIVE");
    } else if (event.type === "HYPOTHESIS_RETIRED") {
      state.set((event.payload as { hypothesisId: string }).hypothesisId, "RETIRED");
    }
  }
  return new Set([...state].filter(([, value]) => value === "ACTIVE").map(([id]) => id));
}

/** §50/§51: derived from the complete candidate digest, never from compilationId alone. */
export function campaignWaitAdmissionIdOf(input: {
  readonly campaignId: string;
  readonly candidateDigest: string;
  readonly wakeCycleId: string;
}): string {
  return `waitad-${canonicalDigest({
    domain: CAMPAIGN_WAIT_ADMISSION_ID_DOMAIN,
    campaignId: input.campaignId,
    candidateDigest: input.candidateDigest,
    wakeCycleId: input.wakeCycleId,
  }).slice(0, 24)}`;
}

export function waitCompletionActionRef(admission: WaitAdmission): AdmittedCampaignActionRef {
  return Object.freeze({
    kind: "wait" as const,
    wakeCycleId: admission.wakeCycleId,
    compilationId: admission.compilationId,
    reconciliationDigest: admission.reconciliationDigest,
    waitAdmissionId: admission.waitAdmissionId,
    checkpointDigest: admission.checkpointDigest,
  });
}

export function makeNextActionAdmissionService(deps: NextActionAdmissionDeps): NextActionAdmissionService {
  async function admitWait(campaignId: string, compiled: CompiledCampaignAction): Promise<CampaignNextActionAdmissionResult> {
    if (compiled.action.kind !== "wait") throw new CampaignStoreError("invalid_registration", "expected a WAIT candidate");
    const candidateDigest = compiledCampaignActionDigestOf(compiled);
    const events = await deps.store.replay(campaignId);
    // §112/§115: idempotent retry — an identical candidate converges on the SAME
    // admission even after the wake completed; a different candidate under the
    // same identity conflicts.
    if (compiled.wake !== undefined) {
      const wakeCycleId = compiled.wake.wakeCycleId;
      const waitAdmissionId = campaignWaitAdmissionIdOf({ campaignId, candidateDigest, wakeCycleId });
      const existing = events.find(
        (event) =>
          event.type === "WAIT_ADMITTED" &&
          (event.payload as { waitAdmission: WaitAdmission }).waitAdmission.waitAdmissionId === waitAdmissionId,
      );
      if (existing !== undefined) {
        const admission = parseWaitAdmission((existing.payload as { waitAdmission: unknown }).waitAdmission);
        if (admission.candidateDigest !== candidateDigest) {
          return { status: "conflict", detail: "wait admission identity already used with a different candidate" };
        }
        return { status: "admitted", action: waitCompletionActionRef(admission), lifecycle: await deps.production.lifecycleState(campaignId) };
      }
      // §114/N10: one compilation may admit at most ONE candidate within a wake.
      const sameCompilation = events.find(
        (event) =>
          event.type === "WAIT_ADMITTED" &&
          (event.payload as { waitAdmission: WaitAdmission }).waitAdmission.compilationId === compiled.compilationId &&
          (event.payload as { waitAdmission: WaitAdmission }).waitAdmission.wakeCycleId === wakeCycleId,
      );
      if (sameCompilation !== undefined) {
        return { status: "conflict", detail: "this compilation already admitted a different WAIT candidate for this wake" };
      }
    }

    // §115/§30: the ONE shared freshness validator runs for both arms. A
    // non-wake candidate while WAKING/RECONCILING is stale here (§33), before the
    // structural "must be wake-bound" refusal.
    const freshness = await evaluateCompiledCampaignActionFreshness({ store: deps.store, campaignId, compiled });
    if (freshness.status !== "fresh") return { status: "stale", detail: freshness.detail };
    // GC3-5 §115: wake-bound admission only (a non-wake WAIT is out of GC3 scope).
    if (compiled.wake === undefined) {
      return { status: "incomplete", detail: "a WAIT candidate must be wake-bound (compiled.wake is required)" };
    }
    const wakeCycleId = compiled.wake.wakeCycleId;
    const waitAdmissionId = campaignWaitAdmissionIdOf({ campaignId, candidateDigest, wakeCycleId });

    const watches = compiled.action.watches.map((draft) =>
      Object.freeze({ watchId: deps.allocateWatchId(), campaignId, condition: draft.condition, reason: draft.reason }),
    );
    // §53–§56: the checkpoint represents the dormant Campaign — it INCLUDES the
    // watches this WAIT is installing, and excludes ended watches.
    const checkpoint = await deps.production.buildCurrentCampaignCheckpoint(campaignId, {
      additionalWatchIds: watches.map((watch) => watch.watchId),
    });
    if (checkpoint.state !== "known") return { status: "incomplete", detail: `checkpoint ${checkpoint.state}: ${checkpoint.detail}` };
    const checkpointDigest = checkpointDigestOf(checkpoint.value);

    const admission: WaitAdmission = Object.freeze({
      waitAdmissionId,
      campaignId,
      compilationId: compiled.compilationId,
      candidateDigest,
      wakeCycleId,
      reconciliationDigest: compiled.wake.reconciliationDigest,
      watchIds: Object.freeze(watches.map((watch) => watch.watchId).sort()),
      checkpointDigest,
    });
    const batch: CampaignAppendRequest[] = [
      ...watches.map((watch) => request("WATCH_INSTALLED", campaignId, { watch })),
      request("WAIT_ADMITTED", campaignId, { waitAdmission: admission }),
      request("CHECKPOINT_RECORDED", campaignId, { checkpoint: checkpoint.value }),
      request("CAMPAIGN_QUIESCING", campaignId, { reason: compiled.action.reason, checkpointBasisDigest: checkpoint.value.campaignBasisDigest, wakeCycleId }),
      request("WAKE_CYCLE_COMPLETED", campaignId, {
        wakeCycleId,
        action: {
          kind: "wait" as const,
          compilationId: admission.compilationId,
          reconciliationDigest: admission.reconciliationDigest,
          waitAdmissionId: admission.waitAdmissionId,
          checkpointDigest: admission.checkpointDigest,
        },
      }),
      request("CAMPAIGN_DORMANT", campaignId, { checkpointBasisDigest: checkpoint.value.campaignBasisDigest }),
    ];
    const basis = await deps.store.basis(campaignId);
    if (basis === undefined) return { status: "incomplete", detail: `campaign "${campaignId}" does not exist` };
    await deps.store.appendAtomic({ expectedBasis: basis, events: batch });
    return { status: "admitted", action: waitCompletionActionRef(admission), lifecycle: "DORMANT" };
  }

  async function admitProject(campaignId: string, compiled: CompiledCampaignAction): Promise<CampaignNextActionAdmissionResult> {
    if (deps.projectAdmission === undefined) {
      // §98: a Project candidate fails explicitly without a Work admission port.
      return { status: "incomplete", detail: "no CampaignWorkAdmissionPort is configured — Project candidates cannot be admitted" };
    }
    const result = await deps.projectAdmission.admit({ campaignId, compiled });
    if (result.status !== "admitted") return { status: result.status, detail: result.detail };
    let action = result.completion;
    if (compiled.wake !== undefined) {
      // GC3-5 §63: unified admission drives the wake completion itself.
      if (action === null) return { status: "incomplete", detail: "wake-bound Project admission produced no completion reference" };
      await deps.production.completeWakeWithAction({ campaignId, wakeCycleId: compiled.wake.wakeCycleId, action });
    }
    return { status: "admitted", action, lifecycle: await deps.production.lifecycleState(campaignId), project: result.project };
  }

  async function admitCompiledNextAction(input: { readonly campaignId: string; readonly compiled: unknown }): Promise<CampaignNextActionAdmissionResult> {
    const events = await deps.store.replay(input.campaignId);
    let compiled: CompiledCampaignAction;
    try {
      compiled = parseCompiledCampaignAction(input.compiled, {
        knownHypothesisIds: activeHypothesisIds(events),
        ...(deps.knownGateIds === undefined ? {} : { knownGateIds: deps.knownGateIds }),
      });
    } catch (error) {
      // A candidate that is not a complete, strictly valid artifact is not admitted.
      return { status: "incomplete", detail: error instanceof Error ? error.message : String(error) };
    }
    // §16/§82: the ARM is chosen by the candidate, never by the caller.
    return compiled.action.kind === "project" ? admitProject(input.campaignId, compiled) : admitWait(input.campaignId, compiled);
  }

  return { admitCompiledNextAction };
}

/** Used by the checkpoint/candidate audit to prove the wake cycle is the current one. */
export function currentIncompleteWake(events: readonly CampaignEvent[]): string | undefined {
  return inFlightWake(events);
}

/** Used by audit tooling to read the committed reconciliation of a wake. */
export function committedReconciliationFor(events: readonly CampaignEvent[], wakeCycleId: string) {
  return committedReconciliationOf(events, wakeCycleId);
}

/** Derived lifecycle state (re-exported for audit tooling). */
export function campaignLifecycleStateOf(events: readonly CampaignEvent[]): CampaignLifecycleState {
  return lifecycleStateFromEvents(events);
}
