/**
 * PAL-FED-0I epistemic admission gate (EXPERIMENTAL, not a product surface).
 *
 * The gate is a deterministic host-side projection + policy. It never inspects
 * model reasoning and never certifies truth:
 *
 *   TicketState = Projection(oracle manifest, durable CollaborationEvents,
 *                           append-only admission attempt log)
 *
 * `NONE` / `OPEN` / `CONSULTING` / `OWNER_RESPONSE_RECEIVED` deliberately avoid
 * any truth claim; `OWNER_RESPONSE_RECEIVED` means only "the configured
 * authority owner has participated". A mechanically admitted conclusion is
 * always "admitted under policy", never "verified".
 *
 * Everything trusted (run id, arm, focal/owner identity, ticket seed, attempt
 * log path) is host-bound configuration. The model supplies only a disposition
 * and a body.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { StoredEvent } from "../events.js";
import type { PeerRef } from "../peers.js";

export const ADMISSION_MODES = ["A0", "A1", "A2"] as const;
export type AdmissionMode = (typeof ADMISSION_MODES)[number];

export const TICKET_STATES = ["NONE", "OPEN", "CONSULTING", "OWNER_RESPONSE_RECEIVED"] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export type Disposition = "resolved" | "unresolved";
export type TicketSeed = "NONE" | "OPEN";

export type AdmissionOutcome =
  | "POLICY_ADMISSIBLE_RESOLVED"
  | "POLICY_ADMISSIBLE_UNRESOLVED"
  | "POLICY_ADMISSIBLE_OWNER_PARTICIPATION"
  | "POLICY_BLOCKED";

export type AdmissionReasonCode = "UNRESOLVED_LOAD_BEARING_AUTHORITY_BOUNDARY";

/** The frozen conflict-detection provenance label (§11): oracle, never detected. */
export type ConflictDetection = "oracle_fixture" | "none";

/** Exact model-visible first-intervention text; identical in A1 and A2 (§4/§22). */
export const ADMISSION_BLOCKED_MESSAGE =
  "A load-bearing proposition still has unresolved competing sources. " +
  "No accepted authority-participation basis has been established. " +
  "You may continue investigating, seek an authoritative response, " +
  "or submit the disposition as unresolved.";

export interface TicketProjection {
  readonly state: TicketState;
  readonly consultationThreadId: string | undefined;
  readonly ownerResponseEventId: string | undefined;
  readonly conflictDetection: ConflictDetection;
}

export interface TicketProjectionInput {
  readonly initial: TicketSeed;
  readonly focalPeer: PeerRef;
  readonly resolutionOwner: PeerRef;
  /** Durable events in feed order (the only canonical collaboration truth). */
  readonly events: readonly StoredEvent[];
}

/**
 * Derive the ticket state. The first qualifying durable focal→owner event fixes
 * the canonical consultation thread; only an authenticated owner→focal event on
 * that same thread establishes owner participation. A focal's own outbound
 * event, a wrong peer, an unrelated thread, a wake notice, an ack or elapsed
 * time never clears the boundary.
 */
export function projectTicket(input: TicketProjectionInput): TicketProjection {
  if (input.initial === "NONE") {
    return {
      state: "NONE",
      consultationThreadId: undefined,
      ownerResponseEventId: undefined,
      conflictDetection: "none",
    };
  }
  const outgoing = input.events.find(
    (entry) => entry.event.from === input.focalPeer && entry.event.to === input.resolutionOwner,
  );
  if (outgoing === undefined) {
    return {
      state: "OPEN",
      consultationThreadId: undefined,
      ownerResponseEventId: undefined,
      conflictDetection: "oracle_fixture",
    };
  }
  const threadId = outgoing.event.threadId;
  const inbound = input.events.find(
    (entry) =>
      entry.event.from === input.resolutionOwner &&
      entry.event.to === input.focalPeer &&
      entry.event.threadId === threadId,
  );
  if (inbound !== undefined) {
    return {
      state: "OWNER_RESPONSE_RECEIVED",
      consultationThreadId: threadId,
      ownerResponseEventId: inbound.event.eventId,
      conflictDetection: "oracle_fixture",
    };
  }
  return {
    state: "CONSULTING",
    consultationThreadId: threadId,
    ownerResponseEventId: undefined,
    conflictDetection: "oracle_fixture",
  };
}

export interface AdmissionDecision {
  readonly admitted: boolean;
  readonly outcome: AdmissionOutcome;
  readonly reasonCode: AdmissionReasonCode | undefined;
}

export interface AdmissionDecisionInput {
  readonly mode: AdmissionMode;
  readonly disposition: Disposition;
  readonly ticket: TicketState;
  /** Prior A1 soft interventions recorded for this run (append-only log). */
  readonly priorSoftInterventions: number;
}

/**
 * The frozen admission policy. Abstention is always admissible; a resolved
 * disposition is admitted once no unresolved authority boundary remains, or
 * (A1) after the single soft intervention has been spent, or (A0) always.
 */
export function decideAdmission(input: AdmissionDecisionInput): AdmissionDecision {
  if (input.disposition === "unresolved") {
    return { admitted: true, outcome: "POLICY_ADMISSIBLE_UNRESOLVED", reasonCode: undefined };
  }
  if (input.ticket === "NONE") {
    return { admitted: true, outcome: "POLICY_ADMISSIBLE_RESOLVED", reasonCode: undefined };
  }
  if (input.ticket === "OWNER_RESPONSE_RECEIVED") {
    return {
      admitted: true,
      outcome: "POLICY_ADMISSIBLE_OWNER_PARTICIPATION",
      reasonCode: undefined,
    };
  }
  // OPEN or CONSULTING: the authority boundary is uncleared.
  if (input.mode === "A0") {
    return { admitted: true, outcome: "POLICY_ADMISSIBLE_RESOLVED", reasonCode: undefined };
  }
  if (input.mode === "A1" && input.priorSoftInterventions > 0) {
    return { admitted: true, outcome: "POLICY_ADMISSIBLE_RESOLVED", reasonCode: undefined };
  }
  return {
    admitted: false,
    outcome: "POLICY_BLOCKED",
    reasonCode: "UNRESOLVED_LOAD_BEARING_AUTHORITY_BOUNDARY",
  };
}

/** One append-only admission attempt (§77). This is evidence, not shared state. */
export interface AdmissionAttempt {
  readonly runId: string;
  readonly attemptIndex: number;
  readonly timestamp: string;
  readonly disposition: Disposition;
  readonly body: string;
  readonly ticketProjection: TicketState;
  readonly arm: AdmissionMode;
  readonly admissionOutcome: AdmissionOutcome;
  readonly reasonCode: AdmissionReasonCode | null;
  readonly ownerResponded: boolean;
  readonly consultationThreadId: string | null;
  readonly conflictDetection: ConflictDetection;
}

/** Host-bound admission binding; `focalPeer` is filled from the plugin's self peer. */
export interface AdmissionBinding {
  readonly mode: AdmissionMode;
  readonly runId: string;
  readonly resolutionOwner: PeerRef;
  readonly ticketInitial: TicketSeed;
  readonly attemptLogPath: string;
}

export interface AdmissionConfig extends AdmissionBinding {
  readonly focalPeer: PeerRef;
}

export interface AdmissionResponse {
  readonly admission: "admitted" | "not_admitted";
  readonly outcome: AdmissionOutcome;
  readonly reasonCode: AdmissionReasonCode | null;
  readonly ticketState: TicketState;
  readonly message: string;
}

export interface AdmissionSubmission {
  readonly response: AdmissionResponse;
  readonly attempt: AdmissionAttempt;
  readonly decision: AdmissionDecision;
  readonly projection: TicketProjection;
}

export function readAdmissionAttempts(path: string): AdmissionAttempt[] {
  if (!existsSync(path)) return [];
  const attempts: AdmissionAttempt[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      attempts.push(JSON.parse(line) as AdmissionAttempt);
    } catch {
      // A torn final line is ignored; the durable prefix still reconstructs state.
    }
  }
  return attempts;
}

export function appendAdmissionAttempt(path: string, attempt: AdmissionAttempt): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(attempt)}\n`);
}

/** Count prior A1 soft interventions for this run from the durable log (§15/§49). */
export function countSoftInterventions(attempts: readonly AdmissionAttempt[]): number {
  return attempts.filter(
    (attempt) => attempt.disposition === "resolved" && attempt.admissionOutcome === "POLICY_BLOCKED",
  ).length;
}

function admittedMessage(outcome: AdmissionOutcome): string {
  switch (outcome) {
    case "POLICY_ADMISSIBLE_UNRESOLVED":
      return "Admitted under epistemic admission policy: disposition recorded as unresolved.";
    case "POLICY_ADMISSIBLE_OWNER_PARTICIPATION":
      return "Admitted under owner-participation policy. Owner participation is not semantic verification of the answer.";
    default:
      return "Admitted under epistemic admission policy.";
  }
}

export function buildAdmissionResponse(
  decision: AdmissionDecision,
  ticket: TicketState,
): AdmissionResponse {
  if (!decision.admitted) {
    return {
      admission: "not_admitted",
      outcome: decision.outcome,
      reasonCode: decision.reasonCode ?? null,
      ticketState: ticket,
      message: ADMISSION_BLOCKED_MESSAGE,
    };
  }
  return {
    admission: "admitted",
    outcome: decision.outcome,
    reasonCode: null,
    ticketState: ticket,
    message: admittedMessage(decision.outcome),
  };
}

/**
 * Project the durable ticket, apply the frozen policy, and append the attempt.
 * Pure apart from the append; returns everything the caller must expose/record.
 */
export function submitDecision(
  config: AdmissionConfig,
  events: readonly StoredEvent[],
  disposition: Disposition,
  body: string,
): AdmissionSubmission {
  const projection = projectTicket({
    initial: config.ticketInitial,
    focalPeer: config.focalPeer,
    resolutionOwner: config.resolutionOwner,
    events,
  });
  const prior = readAdmissionAttempts(config.attemptLogPath);
  const decision = decideAdmission({
    mode: config.mode,
    disposition,
    ticket: projection.state,
    priorSoftInterventions: countSoftInterventions(prior),
  });
  const attempt: AdmissionAttempt = {
    runId: config.runId,
    attemptIndex: prior.length,
    timestamp: new Date().toISOString(),
    disposition,
    body,
    ticketProjection: projection.state,
    arm: config.mode,
    admissionOutcome: decision.outcome,
    reasonCode: decision.reasonCode ?? null,
    ownerResponded: projection.state === "OWNER_RESPONSE_RECEIVED",
    consultationThreadId: projection.consultationThreadId ?? null,
    conflictDetection: projection.conflictDetection,
  };
  appendAdmissionAttempt(config.attemptLogPath, attempt);
  return { response: buildAdmissionResponse(decision, projection.state), attempt, decision, projection };
}
