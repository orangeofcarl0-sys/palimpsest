/**
 * G10-AC — the wake activation signal and its host adapters.
 *
 *   Wake ≠ Action        Wake ≠ Authority       Wake ≠ Work
 *   Wake ≠ Commitment    Wake ≠ EvidenceAdmission
 *   HostActivation ≠ SemanticAdmission
 *   Notification ≠ Activation          Activation ≠ WorkMutation
 *
 * A wake signal asks the project PRINCIPAL to reconsider a Campaign. It grants
 * nothing: the resumed principal re-reads the Project Operating Posture and uses
 * the EXISTING Campaign next-action admission and Project Management services.
 *
 *   Message ≠ Authority      signalId is deterministic over SEMANTIC identity
 *                            (project, campaign, wake cycle, phase) - never a
 *                            timestamp, so a restart recreates the same identity
 *                            and duplicate delivery cannot mint a second wake.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { CampaignWakeCause } from "../campaign/production.js";
import { encodeWakeCause } from "../campaign/production.js";

export const CAMPAIGN_WAKE_ACTIVATION_DIGEST_DOMAIN = "palimpsest.campaign-wake-activation.v1";

export const WAKE_ACTIVATION_PHASES = ["RECONCILIATION_READY", "RECONCILIATION_BLOCKED"] as const;
export type WakeActivationPhase = (typeof WAKE_ACTIVATION_PHASES)[number];

export interface CampaignWakeActivationSignal {
  readonly schemaVersion: 1;
  readonly signalId: string;
  readonly projectId: string;
  readonly campaignId: string;
  readonly wakeCycleId: string;
  /** The ENCODED canonical wake cause (`watch:<id>` / `manual:<id>`). */
  readonly cause: string;
  readonly phase: WakeActivationPhase;
  /** Present when the world was reconciled deterministically. */
  readonly reconciliationDigest: string | null;
  /** A typed blocker code when reconciliation could not complete. */
  readonly blockerCode: string | null;
  readonly detail: string;
  /** When this signal identity was first produced (diagnostic only). */
  readonly createdAt: string;
}

/** The semantic identity of a signal: no clock, no attempt counter. */
export function campaignWakeActivationDigestOf(input: {
  readonly projectId: string;
  readonly campaignId: string;
  readonly wakeCycleId: string;
  readonly cause: string;
  readonly phase: WakeActivationPhase;
}): string {
  return canonicalDigest({
    domain: CAMPAIGN_WAKE_ACTIVATION_DIGEST_DOMAIN,
    projectId: input.projectId,
    campaignId: input.campaignId,
    wakeCycleId: input.wakeCycleId,
    cause: input.cause,
    phase: input.phase,
  });
}

export function buildCampaignWakeActivationSignal(input: {
  readonly projectId: string;
  readonly campaignId: string;
  readonly wakeCycleId: string;
  readonly cause: string;
  readonly phase: WakeActivationPhase;
  readonly reconciliationDigest?: string | null | undefined;
  readonly blockerCode?: string | null | undefined;
  readonly detail: string;
  readonly createdAt: string;
}): CampaignWakeActivationSignal {
  const identity = {
    projectId: input.projectId,
    campaignId: input.campaignId,
    wakeCycleId: input.wakeCycleId,
    cause: input.cause,
    phase: input.phase,
  };
  return Object.freeze({
    schemaVersion: 1 as const,
    signalId: `campaign-wake-${campaignWakeActivationDigestOf(identity).slice(0, 32)}`,
    ...identity,
    reconciliationDigest: input.reconciliationDigest ?? null,
    blockerCode: input.blockerCode ?? null,
    detail: input.detail,
    createdAt: input.createdAt,
  });
}

/**
 * The default wake text (§25). It carries exact refs and NOTHING else: no hidden
 * context dump, no chain-of-thought, no authority.
 */
export function formatCampaignWakeSignal(signal: CampaignWakeActivationSignal): string {
  const lines = [
    `Palimpsest campaign wake — ${signal.phase}`,
    "",
    `project: ${signal.projectId}`,
    `campaign: ${signal.campaignId}`,
    `wake cycle: ${signal.wakeCycleId}`,
    `watch cause: ${signal.cause}`,
    `reconciliation: ${signal.reconciliationDigest ?? "not committed"}`,
    signal.blockerCode === null ? null : `blocker: ${signal.blockerCode}`,
    `signal: ${signal.signalId}`,
    "",
    signal.detail,
    "",
    "This wake asks the project principal to reconsider the Campaign.",
    "It grants no authority.",
    "Re-read current Project Operating Posture.",
    "Use existing Campaign next-action admission and Project Management services.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export interface CampaignWakeActivationOutcome {
  readonly activated: boolean;
  readonly detail: string;
}

/**
 * Host integration only. It imports no Campaign store, no authority port and no
 * admission port: a wake adapter can notify, and that is all it can do.
 */
export interface CampaignWakeActivationPort {
  readonly adapterId: string;
  activate(signal: CampaignWakeActivationSignal): Promise<CampaignWakeActivationOutcome>;
}

/**
 * The adapter id of the pull/debug default. It is exported so the driver can
 * report `activationConfigured === false` for it WITHOUT importing a magic
 * string: the null adapter records signals and never wakes a host, so it is not
 * an autonomous wake binding (§5).
 */
export const NULL_CAMPAIGN_WAKE_ACTIVATION_ADAPTER_ID = "campaign-wake:null";

/** Pull mode: never activates anything. The honest default. */
export function nullCampaignWakeActivation(): CampaignWakeActivationPort {
  return Object.freeze({
    adapterId: NULL_CAMPAIGN_WAKE_ACTIVATION_ADAPTER_ID,
    async activate(): Promise<CampaignWakeActivationOutcome> {
      return Object.freeze({
        activated: false,
        detail: "no campaign wake adapter is configured; the signal stays readable in the monitor status",
      });
    },
  });
}

/** A recording adapter for tests and embeddings; never fails. */
export function recordingCampaignWakeActivation(): CampaignWakeActivationPort & {
  readonly signals: readonly CampaignWakeActivationSignal[];
} {
  const signals: CampaignWakeActivationSignal[] = [];
  return Object.freeze({
    adapterId: "campaign-wake:recording",
    get signals(): readonly CampaignWakeActivationSignal[] {
      return Object.freeze([...signals]);
    },
    async activate(signal: CampaignWakeActivationSignal): Promise<CampaignWakeActivationOutcome> {
      signals.push(signal);
      return Object.freeze({ activated: true, detail: "recorded" });
    },
  });
}

/* -------------------------------------------------------------------------- *
 * DSH
 * -------------------------------------------------------------------------- */

export interface DshWakeAgentLike {
  followup(message: string): void;
}

export interface DshWakeAgentsLike {
  get?(id: string): DshWakeAgentLike | undefined;
  resume?(options: {
    readonly resumeSessionId: string;
  }): Promise<DshWakeAgentLike | { readonly agent: DshWakeAgentLike }>;
}

export interface DshCampaignWakeAdapterOptions {
  readonly agents: DshWakeAgentsLike;
  /** The PERSISTENT project principal's session. */
  readonly resumeSessionId: string;
  readonly format?: ((signal: CampaignWakeActivationSignal) => string) | undefined;
}

function agentOf(value: DshWakeAgentLike | { readonly agent: DshWakeAgentLike }): DshWakeAgentLike {
  return "agent" in value ? value.agent : value;
}

/**
 * DSH host adapter: a resident principal gets a `followup`; otherwise the
 * persisted session is COLD-RESUMED and then queued one turn. A failure returns
 * `activated:false` and leaves the canonical wake untouched - the driver may
 * retry after its cooldown.
 *
 * It mints no PeerRef and no PersistentPoint: a wake is not an identity.
 */
export function dshCampaignWakeAdapter(
  options: DshCampaignWakeAdapterOptions,
): CampaignWakeActivationPort {
  const format = options.format ?? formatCampaignWakeSignal;
  return Object.freeze({
    adapterId: "campaign-wake:dsh",
    async activate(signal: CampaignWakeActivationSignal): Promise<CampaignWakeActivationOutcome> {
      const text = format(signal);
      try {
        const resident = options.agents.get?.(options.resumeSessionId);
        if (resident !== undefined) {
          resident.followup(text);
          return Object.freeze({ activated: true, detail: "delivered to the resident principal" });
        }
        if (options.agents.resume === undefined) {
          return Object.freeze({
            activated: false,
            detail: "no resident principal and no resume capability is configured",
          });
        }
        const resumed = agentOf(await options.agents.resume({ resumeSessionId: options.resumeSessionId }));
        resumed.followup(text);
        return Object.freeze({ activated: true, detail: "cold-resumed the persisted principal and queued one turn" });
      } catch (error) {
        return Object.freeze({
          activated: false,
          detail: `the DSH host could not be woken: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  });
}

/* -------------------------------------------------------------------------- *
 * Pi
 * -------------------------------------------------------------------------- */

export interface PiWakeHostLike {
  sendMessage(message: unknown, options?: unknown): unknown;
}

export interface PiCampaignWakeAdapterOptions {
  readonly pi: PiWakeHostLike;
  readonly deliverAs?: string | undefined;
  readonly format?: ((signal: CampaignWakeActivationSignal) => string) | undefined;
}

/**
 * Pi host adapter, using the existing `triggerTurn` host idiom. No semantic
 * module imports Pi: the host object is injected.
 */
export function piCampaignWakeAdapter(
  options: PiCampaignWakeAdapterOptions,
): CampaignWakeActivationPort {
  const format = options.format ?? formatCampaignWakeSignal;
  return Object.freeze({
    adapterId: "campaign-wake:pi",
    async activate(signal: CampaignWakeActivationSignal): Promise<CampaignWakeActivationOutcome> {
      try {
        options.pi.sendMessage(format(signal), {
          deliverAs: options.deliverAs ?? "followUp",
          triggerTurn: true,
        });
        return Object.freeze({ activated: true, detail: "queued one Pi turn via triggerTurn" });
      } catch (error) {
        return Object.freeze({
          activated: false,
          detail: `the Pi host could not be woken: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  });
}

/** The encoded cause for a signal, from its canonical wake cause. */
export function encodeSignalCause(cause: CampaignWakeCause): string {
  return encodeWakeCause(cause);
}
