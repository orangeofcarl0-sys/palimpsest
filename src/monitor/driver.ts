/**
 * G10-AC — the Campaign monitor driver.
 *
 * The ONE automatic path that turns durable prospective memory into a wake, and
 * then STOPS.
 *
 *   CampaignMonitorDriver ≠ Scheduler      ≠ Planner      ≠ ManagerAgent
 *   MonitorPreference ≠ ActiveMonitoring   ≠ Watch        ≠ Campaign
 *   WatchEvaluation ≠ WatchTrigger
 *   WATCH_TRIGGERED ≠ ClaimTrue ≠ CommitmentSatisfied ≠ ProjectNeeded
 *   Wake ≠ Action ≠ Authority ≠ Work ≠ Commitment ≠ EvidenceAdmission
 *
 * What a tick may do:
 *
 *   read the project's Work Mode preference          (the opt-in gate)
 *   read the project's scoped Campaigns              (never a global scan)
 *   evaluate dormant watches READ-ONLY               (existing scanWatches)
 *   record canonical WATCH_TRIGGERED                 (existing prospective svc)
 *   start the existing single wake                   (existing beginWake)
 *   run existing deterministic reconciliation        (existing reconcileCurrentWorld)
 *   emit an at-least-once host wake signal           (deployment runtime port)
 *
 * What a tick may NEVER do: create a Campaign or a Watch, compile or admit a next
 * action, create Work, accept a commitment or a boundary, publish Proof, or grant
 * any authority. The driver stops before semantic next-action compilation.
 *
 * It owns no canonical store: it composes existing semantic services plus
 * deployment runtime ports, and it reads Campaign history through a narrow
 * read-only seam.
 */

import type { CampaignEvent } from "../campaign/store.js";
import type { CampaignWakeCause } from "../campaign/production.js";
import type { CampaignLifecycleState } from "../campaign/lifecycle.js";
import type { ProspectiveService } from "../campaign/prospective.js";
import type { UserWorkModeControlPort } from "../project_operating/work_mode_profile.js";
import {
  buildCampaignWakeActivationSignal,
  NULL_CAMPAIGN_WAKE_ACTIVATION_ADAPTER_ID,
  type CampaignWakeActivationPort,
  type CampaignWakeActivationSignal,
} from "./activation.js";
import { shouldDeliver, type SqliteMonitorDeliveryMarkStore } from "./delivery_marks.js";
import {
  deriveMonitorContinuation,
  pendingWakeCauseOf,
  type PendingWakeDerivation,
} from "./lifecycle_derivation.js";
import type { CampaignMonitorScopePort } from "./scope.js";
import type { MonitorTickSourcePort, MonitorTickTrigger } from "./tick_source.js";
// The ONE availability table lives in `project_operating` (see the re-export
// note below); the driver imports it so both sides share a single implementation.
import { monitorAvailabilityOf } from "../project_operating/posture.js";

/** The narrow READ-ONLY history seam the driver needs for crash recovery. */
export interface MonitorCampaignHistoryPort {
  readEvents(campaignId: string): Promise<readonly CampaignEvent[]>;
}

export interface CampaignMonitorPolicy {
  readonly maxCampaignsPerTick: number;
  readonly maxWakeAdvancesPerTick: number;
  readonly maxActivationsPerTick: number;
  readonly redeliveryAfterMs: number;
}

/** Conservative, explicit budgets. There is no hidden priority score (see §31). */
export const DEFAULT_CAMPAIGN_MONITOR_POLICY: CampaignMonitorPolicy = Object.freeze({
  maxCampaignsPerTick: 10,
  maxWakeAdvancesPerTick: 5,
  maxActivationsPerTick: 5,
  redeliveryAfterMs: 300_000,
});

/**
 * G10-AC-R §5: the lifecycle a monitor runtime can be in. It is deliberately a
 * small, closed set: "configured" is not the same as "running", and a driver with
 * only a scope is NOT a runtime at all.
 */
export const MONITOR_START_STATES = ["NOT_CONFIGURED", "MANUAL_ONLY", "STARTING", "RUNNING", "FAILED"] as const;
export type MonitorStartState = (typeof MONITOR_START_STATES)[number];

/**
 * The LIVE runtime capability of one composed driver. This is the single input
 * the posture's availability table reads, so a declaration can never drift from
 * the wiring that actually exists.
 */
export interface MonitorRuntimeCapability {
  /** A first-party driver object exists at all. */
  readonly driverComposed: boolean;
  /** A Campaign scope is bound (always true for a composed driver). */
  readonly scopeConfigured: boolean;
  /** An explicit tick source was supplied. */
  readonly tickSourceConfigured: boolean;
  /** A REAL host wake adapter is bound; FALSE for the null/pull adapter. */
  readonly activationConfigured: boolean;
  /** A delivery mark store is bound (duplicate suppression / backoff). */
  readonly deliveryMarksConfigured: boolean;
  /** True ONLY while the tick source is RUNNING (a start promise resolved). */
  readonly started: boolean;
  readonly startState: MonitorStartState;
  /** The start failure message when `startState === "FAILED"`; else null. */
  readonly startError: string | null;
  readonly provenance: "first_party" | "declared_external";
}

/** The outcome of the start orchestration. It never rejects (see `ready`). */
export interface MonitorStartOutcome {
  readonly status: "not_configured" | "running" | "failed";
  readonly detail: string;
  readonly error?: string | undefined;
}

export type MonitorAvailability = "AVAILABLE" | "CONDITIONAL" | "PREVIEW_ONLY" | "UNAVAILABLE";

/**
 * G10-AC-R §5/§14: the STABLE semantic cause recorded in the canonical
 * WATCH_TRIGGERED payload. The `watchId` is already canonical in that payload, so
 * the cause carries NO clock, epoch or other dynamic text: two logically identical
 * triggers at different clocks must produce the same canonical event identity.
 * (The old value interpolated the wall clock, minting a new canonical event per
 * clock tick.)
 */
export const MONITOR_TRIGGER_CAUSE = "monitor_condition_satisfied";

/**
 * G10-AC-R §5: the ONE availability table, shared by the driver and the
 * operating posture so the two can never disagree. It lives in
 * `project_operating/posture.ts` and is re-exported here: `project_operating`
 * must never import the monitor driver (the driver imports the work-mode port),
 * and the driver already depends on `project_operating`, so this direction is the
 * only one that avoids a `project_operating -> monitor -> project_operating`
 * cycle. The driver's stricter `MonitorRuntimeCapability` is structurally
 * assignable to the helper's `MonitorRuntimeCapabilityView` parameter.
 */
export { monitorAvailabilityOf };


export interface CampaignMonitorCampaignOutcome {
  readonly campaignId: string;
  readonly lifecycle: CampaignLifecycleState;
  readonly triggeredWatchIds: readonly string[];
  readonly beganWake: boolean;
  readonly wakeCycleId: string | null;
  readonly reconciled: boolean;
  readonly activationPhase: "RECONCILIATION_READY" | "RECONCILIATION_BLOCKED" | null;
  readonly delivered: boolean;
  readonly detail: string;
}

export interface CampaignMonitorTickResult {
  readonly trigger: MonitorTickTrigger;
  readonly enabled: boolean;
  readonly disabledReason: string | null;
  readonly scopedCampaignCount: number;
  readonly campaigns: readonly CampaignMonitorCampaignOutcome[];
  readonly wakeAdvances: number;
  readonly activations: number;
  readonly detail: string;
}

export interface CampaignMonitorStatus {
  readonly projectId: string;
  /** A real runtime (scope + services + history seam) is composed. */
  readonly runtimeConfigured: boolean;
  /**
   * True ONLY while the tick source is RUNNING. A configured-but-unstarted source
   * (or a scope-only composition) reports false: nothing autonomous is happening.
   */
  readonly driverStarted: boolean;
  /** G10-AC-R: the LIVE runtime capability availability derives from. */
  readonly capability: MonitorRuntimeCapability;
  /** The honest availability + reason, derived by the ONE shared table (§5). */
  readonly availability: { readonly availability: MonitorAvailability; readonly reason: string };
  /** G10-AC-R: whether duplicate suppression marks are defaulted, supplied or disabled. */
  readonly deliveryMarks: "default" | "supplied" | "disabled";
  readonly monitorPreferenceEnabled: boolean;
  readonly preferenceSource: "stored" | "safe_default" | "unavailable";
  readonly disabledReason: string | null;
  readonly scopeId: string;
  readonly scopedCampaignCount: number;
  readonly dormantCampaignCount: number;
  readonly activeWatchCount: number;
  readonly inFlightWakeCount: number;
  readonly lastTick: string | null;
  readonly lastActivation: CampaignWakeActivationSignal | null;
  readonly tickSource: {
    readonly kind: string;
    readonly running: boolean;
    /** How many times the source has fired (deployment-local diagnostic). */
    readonly fires: number;
    readonly intervalMs?: number | undefined;
  } | null;
}

export interface CampaignMonitorDriverDeps {
  readonly projectId: string;
  readonly workMode: UserWorkModeControlPort;
  readonly scope: CampaignMonitorScopePort;
  readonly prospective: Pick<ProspectiveService, "scanWatches" | "recordTriggers" | "watchStates">;
  readonly production: {
    lifecycleState(campaignId: string): Promise<CampaignLifecycleState>;
    beginWake(input: {
      readonly campaignId: string;
      readonly cause: CampaignWakeCause;
    }): Promise<
      | { readonly status: "started"; readonly wakeCycleId: string }
      | { readonly status: "wake_already_in_progress"; readonly wakeCycleId: string }
      | { readonly status: "blocked"; readonly detail: string }
    >;
    reconcileCurrentWorld(input: {
      readonly campaignId: string;
      readonly wakeCycle: string;
      readonly wakeCause: CampaignWakeCause;
    }): Promise<
      | { readonly status: "reconciled"; readonly report: { readonly digest: string } }
      | { readonly status: "no_active_commitment"; readonly report: { readonly digest: string } }
      | { readonly status: "reconciliation_incomplete"; readonly detail: string }
      | { readonly status: "wake_cycle_mismatch"; readonly detail: string }
    >;
  };
  readonly history: MonitorCampaignHistoryPort;
  readonly activation: CampaignWakeActivationPort;
  readonly marks?: SqliteMonitorDeliveryMarkStore | undefined;
  /**
   * G10-AC-R: where the marks store came from, reported verbatim in `status()`.
   * `default` is a deployment-local store the install created; `supplied` is a host
   * store; `disabled` means suppression is deliberately off (and the driver then
   * re-delivers on the configured cooldown).
   */
  readonly deliveryMarksSource?: "default" | "supplied" | "disabled" | undefined;
  readonly policy?: Partial<CampaignMonitorPolicy> | undefined;
  readonly tickSource?: MonitorTickSourcePort | undefined;
  readonly clock?: (() => string) | undefined;
  /** Observation hook for an embedding host (never an authority). */
  readonly onSignal?: ((signal: CampaignWakeActivationSignal, delivered: boolean) => void) | undefined;
}

export interface CampaignMonitorDriver {
  status(): Promise<CampaignMonitorStatus>;
  /** READ-ONLY: the LIVE runtime capability (started/startState are fresh reads). */
  capability(): MonitorRuntimeCapability;
  /** READ-ONLY: what a tick would do, with no write of any kind. */
  previewTick(): Promise<CampaignMonitorTickResult>;
  tick(trigger?: MonitorTickTrigger): Promise<CampaignMonitorTickResult>;
  start(): Promise<void>;
  /**
   * Await the current start orchestration (starting it if a tick source exists and
   * nothing has started it yet). NEVER rejects: a failure is recorded into the
   * driver state and returned as `status: "failed"`.
   */
  ready(): Promise<MonitorStartOutcome>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

function encodedCauseOf(cause: CampaignWakeCause): string {
  return cause.kind === "watch" ? `watch:${cause.watchId}` : `manual:${cause.signalId}`;
}

function digestOfReconciliationEvent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const report = record.report;
  if (typeof report === "object" && report !== null) {
    const digest = (report as Record<string, unknown>).digest;
    if (typeof digest === "string") return digest;
  }
  const direct = record.reconciliationDigest ?? record.digest;
  return typeof direct === "string" ? direct : null;
}

/**
 * Fold several passes of one tick into the single outcome a caller sees. It keeps
 * the UNION of what was observed and the LATEST lifecycle/wake/activation facts -
 * it never invents progress that no pass reported.
 */
function mergeOutcomes(
  left: CampaignMonitorCampaignOutcome,
  right: CampaignMonitorCampaignOutcome,
): CampaignMonitorCampaignOutcome {
  const triggered = [...new Set([...left.triggeredWatchIds, ...right.triggeredWatchIds])].sort();
  const details = [...new Set([left.detail, right.detail])].filter(
    (detail) => detail.length > 0 && detail !== "nothing to do",
  );
  return Object.freeze({
    campaignId: right.campaignId,
    lifecycle: right.lifecycle,
    triggeredWatchIds: Object.freeze(triggered),
    beganWake: left.beganWake || right.beganWake,
    wakeCycleId: right.wakeCycleId ?? left.wakeCycleId,
    reconciled: left.reconciled || right.reconciled,
    activationPhase: right.activationPhase ?? left.activationPhase,
    delivered: left.delivered || right.delivered,
    detail: details.length === 0 ? "nothing to do" : details.join("; "),
  });
}

export function makeCampaignMonitorDriver(deps: CampaignMonitorDriverDeps): CampaignMonitorDriver {
  const policy: CampaignMonitorPolicy = Object.freeze({
    ...DEFAULT_CAMPAIGN_MONITOR_POLICY,
    ...(deps.policy ?? {}),
  });
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();

  const tickSourceConfigured = deps.tickSource !== undefined;
  const activationConfigured = deps.activation.adapterId !== NULL_CAMPAIGN_WAKE_ACTIVATION_ADAPTER_ID;
  const deliveryMarks = deps.deliveryMarksSource ?? (deps.marks === undefined ? "disabled" : "supplied");

  let started = false;
  let startState: MonitorStartState = tickSourceConfigured ? "MANUAL_ONLY" : "NOT_CONFIGURED";
  let startError: string | null = null;
  let startPromise: Promise<MonitorStartOutcome> | null = null;
  let disposed = false;
  let lastTick: string | null = null;
  let lastActivation: CampaignWakeActivationSignal | null = null;
  let inFlight: Promise<CampaignMonitorTickResult> | null = null;

  async function preferenceState(): Promise<{
    enabled: boolean;
    source: "stored" | "safe_default" | "unavailable";
    detail: string | null;
  }> {
    try {
      const effective = await deps.workMode.get(deps.projectId);
      const enabled = effective.preference.modifiers.includes("MONITOR");
      return {
        enabled,
        source: effective.source,
        detail: enabled
          ? null
          : `the project's Work Mode preference does not include MONITOR (currently ${effective.preference.baseMode}${
              effective.preference.modifiers.length === 0
                ? ""
                : ` + ${effective.preference.modifiers.join(" + ")}`
            }); automatic dormant-watch scanning is disabled`,
      };
    } catch (error) {
      return {
        enabled: false,
        source: "unavailable",
        detail: `the project's Work Mode preference could not be read (${
          error instanceof Error ? error.message : String(error)
        }); automatic dormant-watch scanning is disabled`,
      };
    }
  }

  async function scopedCampaignIds(): Promise<readonly string[]> {
    const ids = await deps.scope.campaignIdsForProject(deps.projectId);
    return Object.freeze([...ids].slice(0, policy.maxCampaignsPerTick));
  }

  /**
   * One Campaign's mechanical progression, bounded and honest. `write=false`
   * makes the whole pass read-only (previewTick).
   */
  async function advanceCampaign(input: {
    readonly campaignId: string;
    readonly monitorEnabled: boolean;
    readonly budget: { wakeAdvances: number; activations: number };
    readonly write: boolean;
  }): Promise<CampaignMonitorCampaignOutcome> {
    const { campaignId } = input;
    const lifecycle = await deps.production.lifecycleState(campaignId);
    const events = await deps.history.readEvents(campaignId);
    const derivation: PendingWakeDerivation = deriveMonitorContinuation(events);

    const outcome: {
      triggeredWatchIds: string[];
      beganWake: boolean;
      wakeCycleId: string | null;
      reconciled: boolean;
      activationPhase: "RECONCILIATION_READY" | "RECONCILIATION_BLOCKED" | null;
      delivered: boolean;
      detail: string;
    } = {
      triggeredWatchIds: [],
      beganWake: false,
      wakeCycleId: derivation.inFlightWakeCycleId,
      reconciled: false,
      activationPhase: null,
      delivered: false,
      detail: "",
    };

    /* ---- 1. Trigger-before-wake recovery (§15) -------------------------------
     * A WATCH_TRIGGERED with no WAKE_STARTED must still produce a wake, even
     * though the watch is no longer ACTIVE and scanWatches cannot report it.
     */
    if (lifecycle === "DORMANT") {
      const pending = pendingWakeCauseOf(derivation);
      if (pending !== null && input.budget.wakeAdvances > 0) {
        if (!input.write) {
          outcome.beganWake = false;
          outcome.detail = `would wake from the pending triggered watch ${pending.watchId}`;
        } else {
          const started = await deps.production.beginWake({
            campaignId,
            cause: { kind: "watch", watchId: pending.watchId },
          });
          input.budget.wakeAdvances -= 1;
          outcome.beganWake = started.status === "started";
          outcome.wakeCycleId = started.status === "blocked" ? null : started.wakeCycleId;
          outcome.detail =
            started.status === "started"
              ? `recovered a pending wake for watch ${pending.watchId}`
              : started.status === "wake_already_in_progress"
                ? "a wake was already in progress"
                : `wake blocked: ${started.detail}`;
        }
      }
    }

    /* ---- 2. New dormant-watch scanning (opt-in, DORMANT only, §4/§11) ------ */
    if (lifecycle === "DORMANT" && outcome.beganWake === false && input.monitorEnabled) {
      const evaluations = await deps.prospective.scanWatches(campaignId);
      const triggered = evaluations
        .filter((entry) => entry.status === "triggered")
        .map((entry) => entry.watchId)
        .sort();
      outcome.triggeredWatchIds = triggered;
      if (triggered.length > 0) {
        if (!input.write) {
          outcome.detail =
            outcome.detail.length > 0
              ? outcome.detail
              : `would record ${String(triggered.length)} triggered watch(es) and start one wake`;
        } else if (input.budget.wakeAdvances > 0) {
          // §14: record ALL currently-triggered active watches in ONE atomic
          // write, then choose a deterministic cause and one wake cycle.
          const recorded = await deps.prospective.recordTriggers({
            campaignId,
            triggers: triggered.map((watchId) => ({
              watchId,
              // A stable semantic cause; the watchId carries the canonical detail.
              cause: MONITOR_TRIGGER_CAUSE,
            })),
          });
          const causeWatchId = [...recorded].sort()[0] ?? triggered[0]!;
          const started = await deps.production.beginWake({
            campaignId,
            cause: { kind: "watch", watchId: causeWatchId },
          });
          input.budget.wakeAdvances -= 1;
          outcome.beganWake = started.status === "started";
          outcome.wakeCycleId = started.status === "blocked" ? null : started.wakeCycleId;
          // The clock is DIAGNOSTIC ONLY and lives here, in the non-canonical
          // outcome detail - never in a canonical Campaign payload.
          const at = now();
          outcome.detail =
            started.status === "started"
              ? `recorded ${String(recorded.length)} triggered watch(es) at ${at}; woke from ${causeWatchId}`
              : started.status === "wake_already_in_progress"
                ? `a wake was already in progress (evaluated at ${at})`
                : `wake blocked: ${started.detail}`;
        } else {
          outcome.detail = `the per-tick wake budget is exhausted; ${String(triggered.length)} watch(es) remain triggered`;
        }
      } else {
        const incomplete = evaluations.filter((entry) => entry.status === "incomplete");
        outcome.detail =
          incomplete.length === 0
            ? "no watch is triggered"
            : `${String(incomplete.length)} watch(es) are incomplete and never trigger: ${incomplete
                .map((entry) => entry.detail)
                .join("; ")}`;
      }
    }

    /* ---- 3. Wake-before-reconciliation continuation (§17/§18) --------------- */
    const currentLifecycle = input.write ? await deps.production.lifecycleState(campaignId) : lifecycle;
    if (currentLifecycle === "WAKING" && derivation.inFlightWakeCycleId !== null) {
      const cause: CampaignWakeCause = derivation.inFlightWakeCause?.startsWith("manual:")
        ? { kind: "manual", signalId: derivation.inFlightWakeCause.slice("manual:".length), reason: "resumed monitor wake" }
        : {
            kind: "watch",
            watchId: (derivation.inFlightWakeCause ?? "watch:").slice("watch:".length),
          };
      if (!input.write) {
        outcome.detail = outcome.detail.length > 0 ? outcome.detail : "would reconcile the in-flight wake";
      } else {
        // Existing deterministic reconciliation. The driver never compiles or
        // admits a next action: it stops here.
        const reconciled = await deps.production.reconcileCurrentWorld({
          campaignId,
          wakeCycle: derivation.inFlightWakeCycleId,
          wakeCause: cause,
        });
        if (reconciled.status === "reconciled" || reconciled.status === "no_active_commitment") {
          outcome.reconciled = true;
          outcome.activationPhase = "RECONCILIATION_READY";
          outcome.detail = `${outcome.detail.length > 0 ? `${outcome.detail}; ` : ""}world reconciled`;
        } else {
          outcome.activationPhase = "RECONCILIATION_BLOCKED";
          outcome.detail = `${outcome.detail.length > 0 ? `${outcome.detail}; ` : ""}reconciliation incomplete: ${reconciled.detail}`;
        }
      }
    }

    /* ---- 4. Host activation (at-least-once, §20/§27/§28) ------------------- */
    const afterLifecycle = input.write ? await deps.production.lifecycleState(campaignId) : lifecycle;
    // Activation is offered whenever a wake is in flight and the Campaign has
    // moved past WAKING (RECONCILING) or reconciliation just committed here.
    const activationEligible = outcome.reconciled || afterLifecycle === "RECONCILING";
    if (activationEligible && derivation.inFlightWakeCycleId !== null) {
      const refreshed = input.write ? await deps.history.readEvents(campaignId) : events;
      const digest = refreshed
        .filter((event) => event.type === "RECONCILIATION_COMMITTED")
        .map((event) => digestOfReconciliationEvent(event.payload))
        .filter((value): value is string => value !== null)
        .at(-1) ?? null;
      const phase: "RECONCILIATION_READY" | "RECONCILIATION_BLOCKED" =
        digest !== null ? "RECONCILIATION_READY" : "RECONCILIATION_BLOCKED";
      const signal = buildCampaignWakeActivationSignal({
        projectId: deps.projectId,
        campaignId,
        wakeCycleId: derivation.inFlightWakeCycleId,
        cause: derivation.inFlightWakeCause ?? "unknown",
        phase,
        reconciliationDigest: digest,
        blockerCode: digest === null ? "reconciliation_incomplete" : null,
        detail:
          digest === null
            ? "the wake is in flight and the world has not been reconciled; the Campaign stays honestly WAKING/RECONCILING"
            : "the world was reconciled deterministically; the project principal should reconsider the Campaign",
        createdAt: now(),
      });
      outcome.activationPhase = phase;
      lastActivation = signal;
      deps.onSignal?.(signal, false);

      const mark = deps.marks?.get(signal.signalId);
      const decision = shouldDeliver({ mark, now: signal.createdAt, redeliveryAfterMs: policy.redeliveryAfterMs });
      if (!input.write) {
        outcome.delivered = false;
        outcome.detail = `${outcome.detail.length > 0 ? `${outcome.detail}; ` : ""}would ${
          decision.deliver ? "deliver" : "skip"
        } the wake signal (${decision.reason})`;
      } else if (decision.deliver && input.budget.activations > 0) {
        input.budget.activations -= 1;
        deps.marks?.recordAttempt({
          signalId: signal.signalId,
          projectId: deps.projectId,
          campaignId,
          at: signal.createdAt,
        });
        const result = await deps.activation.activate(signal);
        outcome.delivered = result.activated;
        if (result.activated) {
          deps.marks?.recordSuccess({ signalId: signal.signalId, at: now() });
        }
        outcome.detail = `${outcome.detail.length > 0 ? `${outcome.detail}; ` : ""}activation ${
          result.activated ? "delivered" : "failed (the canonical wake is untouched and may be retried)"
        }: ${result.detail}`;
        deps.onSignal?.(signal, result.activated);
      } else {
        outcome.delivered = false;
        outcome.detail = `${outcome.detail.length > 0 ? `${outcome.detail}; ` : ""}delivery skipped (${decision.reason})`;
      }
    }

    if (outcome.detail.length === 0) outcome.detail = "nothing to do";
    return Object.freeze({
      campaignId,
      lifecycle: afterLifecycle,
      triggeredWatchIds: Object.freeze(outcome.triggeredWatchIds),
      beganWake: outcome.beganWake,
      wakeCycleId: outcome.wakeCycleId,
      reconciled: outcome.reconciled,
      activationPhase: outcome.activationPhase,
      delivered: outcome.delivered,
      detail: outcome.detail,
    });
  }

  async function runTick(
    trigger: MonitorTickTrigger,
    write: boolean,
  ): Promise<CampaignMonitorTickResult> {
    const preference = await preferenceState();
    const scoped = await scopedCampaignIds();
    const budget = { wakeAdvances: policy.maxWakeAdvancesPerTick, activations: policy.maxActivationsPerTick };
    const campaigns: CampaignMonitorCampaignOutcome[] = [];

    for (const campaignId of scoped) {
      // §42/§18: ONE tick may carry a Campaign through the whole mechanical
      // progression - trigger, wake, deterministic reconciliation, activation -
      // bounded by the per-tick budgets. `advanceCampaign` performs at most one
      // phase transition per pass, so a tick re-derives the continuation after
      // each successful write and continues while it makes progress. An in-flight
      // wake is ALWAYS continued, even when MONITOR is disabled: disabling the
      // preference must never strand a canonical wake (§10/§36).
      let accumulated: CampaignMonitorCampaignOutcome | undefined;
      for (let pass = 0; pass < 4; pass += 1) {
        const outcome = await advanceCampaign({
          campaignId,
          monitorEnabled: preference.enabled,
          budget,
          write,
        });
        accumulated = accumulated === undefined ? outcome : mergeOutcomes(accumulated, outcome);
        const progressed =
          outcome.beganWake ||
          outcome.reconciled ||
          outcome.delivered ||
          outcome.triggeredWatchIds.length > 0;
        // Activation is the LAST phase of the progression, so a pass that
        // considered it ends the tick: continuing would only re-attempt delivery
        // to the same host within one tick.
        const reachedActivation = outcome.activationPhase !== null;
        // A read-only pass makes no progress by construction, and a pass that
        // changed nothing means the Campaign reached its honest resting state.
        if (!write || !progressed || reachedActivation) break;
      }
      campaigns.push(accumulated!);
    }

    const wakeAdvances = policy.maxWakeAdvancesPerTick - budget.wakeAdvances;
    const activations = policy.maxActivationsPerTick - budget.activations;
    if (write) lastTick = now();
    return Object.freeze({
      trigger,
      enabled: preference.enabled,
      disabledReason: preference.detail,
      scopedCampaignCount: scoped.length,
      campaigns: Object.freeze(campaigns),
      wakeAdvances,
      activations,
      detail:
        scoped.length === 0
          ? "no Campaign is scoped to this project; nothing was evaluated"
          : write
            ? `evaluated ${String(scoped.length)} scoped Campaign(s): ${String(wakeAdvances)} wake advance(s), ${String(activations)} activation(s)`
            : `would evaluate ${String(scoped.length)} scoped Campaign(s)`,
    });
  }

  /**
   * G10-AC-R §5: the LIVE capability. `started` is true ONLY once the tick
   * source's `start()` has RESOLVED, so a configured-but-unstarted (or failed)
   * runtime can never be presented as autonomous.
   */
  function capability(): MonitorRuntimeCapability {
    return Object.freeze({
      driverComposed: true,
      scopeConfigured: true,
      tickSourceConfigured,
      activationConfigured,
      deliveryMarksConfigured: deps.marks !== undefined,
      started,
      startState,
      startError,
      provenance: "first_party" as const,
    });
  }

  /**
   * The ONE start orchestration `start()` and `ready()` share.
   *
   *  - no tick source        → NOT_CONFIGURED, nothing to start
   *  - already started        → the existing promise (concurrent callers converge
   *                             on exactly ONE `tickSource.start()` invocation)
   *  - rejection              → startState FAILED + startError, and the outcome is
   *                             RESOLVED (never rejected) so no unhandled rejection
   *                             can escape
   *  - already disposed       → refused, so no callback can run after dispose()
   */
  function beginStart(): Promise<MonitorStartOutcome> {
    if (disposed) {
      return Promise.resolve(
        Object.freeze({
          status: "not_configured" as const,
          detail: "the monitor is disposed; no tick source will be started",
        }),
      );
    }
    if (deps.tickSource === undefined) {
      startState = "NOT_CONFIGURED";
      return Promise.resolve(
        Object.freeze({
          status: "not_configured" as const,
          detail: "no tick source is configured; ticks are manual only",
        }),
      );
    }
    if (startPromise !== null) return startPromise;
    const source = deps.tickSource;
    startState = "STARTING";
    startError = null;
    startPromise = (async (): Promise<MonitorStartOutcome> => {
      try {
        await source.start(async (trigger) => {
          await driver.tick(trigger);
        });
        // ONLY now is the runtime actually running.
        startState = "RUNNING";
        started = true;
        return Object.freeze({
          status: "running" as const,
          detail: `the ${source.status().kind} tick source is running`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        startState = "FAILED";
        started = false;
        startError = message;
        // RESOLVE, never reject: the failure is part of the driver state and a
        // rejected `ready()` would escape as an unhandled rejection.
        return Object.freeze({
          status: "failed" as const,
          detail: `the tick source failed to start: ${message}`,
          error: message,
        });
      }
    })();
    return startPromise;
  }

  const driver: CampaignMonitorDriver = Object.freeze({
    async status(): Promise<CampaignMonitorStatus> {
      const preference = await preferenceState();
      let scoped: readonly string[] = [];
      try {
        scoped = await scopedCampaignIds();
      } catch {
        scoped = [];
      }
      let dormant = 0;
      let activeWatches = 0;
      let inFlightWakes = 0;
      for (const campaignId of scoped) {
        try {
          const lifecycle = await deps.production.lifecycleState(campaignId);
          if (lifecycle === "DORMANT") dormant += 1;
          if (lifecycle === "WAKING" || lifecycle === "RECONCILING") inFlightWakes += 1;
          const states = await deps.prospective.watchStates(campaignId);
          activeWatches += states.filter((state) => state.status === "ACTIVE").length;
        } catch {
          // A campaign this deployment cannot read is not counted as known state.
        }
      }
      const source = deps.tickSource?.status();
      const liveCapability = capability();
      return Object.freeze({
        projectId: deps.projectId,
        runtimeConfigured: true,
        driverStarted: started,
        capability: liveCapability,
        // The SAME table the posture uses, so the driver and the posture can never
        // disagree about what this runtime is.
        availability: monitorAvailabilityOf(liveCapability),
        deliveryMarks,
        monitorPreferenceEnabled: preference.enabled,
        preferenceSource: preference.source,
        disabledReason: preference.detail,
        scopeId: deps.scope.scopeId,
        scopedCampaignCount: scoped.length,
        dormantCampaignCount: dormant,
        activeWatchCount: activeWatches,
        inFlightWakeCount: inFlightWakes,
        lastTick,
        lastActivation,
        tickSource:
          source === undefined
            ? null
            : Object.freeze({
                kind: source.kind,
                running: source.running,
                fires: source.fires,
                ...(source.intervalMs === undefined ? {} : { intervalMs: source.intervalMs }),
              }),
      });
    },

    capability,

    async previewTick(): Promise<CampaignMonitorTickResult> {
      return runTick("manual", false);
    },

    async tick(trigger: MonitorTickTrigger = "manual"): Promise<CampaignMonitorTickResult> {
      // In-process coalescing (§30): overlapping ticks share one evaluation.
      if (inFlight !== null) return inFlight;
      inFlight = runTick(trigger, true).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    async start(): Promise<void> {
      // Delegates to the SAME orchestration as `ready()`; it never rejects.
      await beginStart();
    },

    async ready(): Promise<MonitorStartOutcome> {
      return beginStart();
    },

    async stop(): Promise<void> {
      // Settle an in-flight start first so a late resolution cannot restart the
      // source after we stopped it.
      if (startPromise !== null) await startPromise;
      await deps.tickSource?.stop();
      started = false;
      startError = null;
      // A configured, stopped source is MANUAL_ONLY, not "not configured".
      startState = tickSourceConfigured ? "MANUAL_ONLY" : "NOT_CONFIGURED";
      startPromise = null;
    },

    async dispose(): Promise<void> {
      if (disposed) return; // idempotent
      // Settle the start orchestration FIRST, so a pending `start()` cannot resolve
      // after we have stopped the source and closed the marks.
      if (startPromise !== null) await startPromise;
      disposed = true;
      await deps.tickSource?.stop();
      started = false;
      startError = null;
      startState = tickSourceConfigured ? "MANUAL_ONLY" : "NOT_CONFIGURED";
      // No callback may run after this point: `beginStart` refuses and the tick
      // source is stopped before the owned marks are closed.
      deps.marks?.close();
    },
  });
  return driver;
}
