/**
 * G10-E1 Invocation / Participation — the explicit realization of the
 * intentionally-open `Activation ↔ Attempt` relation (PLMP-UAS-1).
 *
 * INVOCATION means: an explicit request/invitation for a runtime Activation
 * to contribute to an Attempt. It does NOT mean the activation accepted,
 * started work, owns the Attempt, committed to completion, or that the
 * Attempt succeeded.
 *
 * PARTICIPATION means: an Activation is actually participating in an Attempt.
 * It does NOT mean ownership, assignment, commitment to completion, authority
 * over the Attempt, success, or evidence. Participation may be voluntary —
 * `invocation` is optional, so not all participation originates from an
 * assignment-like invocation (and an Invocation never implies Participation).
 *
 * Cardinality is deliberately OPEN: one Activation may participate in
 * multiple Attempts; one Attempt may have multiple Participations; neither
 * direction is collapsed into ownership.
 *
 * ActivationRef (§25) carries enough immutable provenance to keep historical
 * meaning even though Activation is runtime semantic state: it is DERIVED
 * from an actual Activation via `activationRefOf` — never assembled piecemeal
 * by callers in the high-level API. AttemptRef (§26) is the canonical Work
 * identity pair (projectId, attemptId) — no new Attempt identity is invented;
 * existence/state is validated against the canonical Work store through the
 * `AttemptCatalogPort` (§34).
 *
 * Every artifact is deep-frozen with caller inputs detached (B3C2 standard).
 */

import type { Activation, ActivationId } from "../runtime/index.js";
import type { AgentDefinitionId } from "../architecture/index.js";
import type { BindingResolutionRef } from "../binding/contract.js";
import type { RunDefinitionRef } from "../run/index.js";
import { isStableIdentifier } from "../schema/identifier.js";
import type { CoordinationEventParsers } from "./store.js";
import { CoordinationStoreError } from "./errors.js";
import {
  requireLiteral,
  requireOneOf,
  requireSchemaVersion,
  requireStableId,
  requireString,
  strictObject,
} from "./strict.js";

export type InvocationId = string;
export type ParticipationId = string;

/** Immutable provenance derived from an actual Activation (§25). */
export interface ActivationRef {
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
}

/** Canonical Work/Attempt identity pair (§26) — no new Attempt identity invented. */
export interface AttemptRef {
  readonly projectId: string;
  readonly attemptId: string;
}

/** An explicit invitation for an Activation to contribute to an Attempt (§23/§24). */
export interface Invocation {
  readonly schemaVersion: 1;
  readonly invocationId: InvocationId;
  readonly activation: ActivationRef;
  readonly attempt: AttemptRef;
  readonly purpose: "participate";
}

export interface InvocationRef {
  readonly invocationId: InvocationId;
}

/** An Activation actually participating in an Attempt (§28/§29). Invocation optional. */
export interface Participation {
  readonly schemaVersion: 1;
  readonly participationId: ParticipationId;
  readonly activation: ActivationRef;
  readonly attempt: AttemptRef;
  readonly invocation?: InvocationRef;
}

export type ParticipationEndReason = "completed" | "withdrawn" | "cancelled" | "runtime_lost";

export class ParticipationError extends Error {
  constructor(
    readonly kind:
      | "participation_invalid"
      | "attempt_unknown"
      | "attempt_terminal"
      | "coordination_conflict",
    message: string,
  ) {
    super(message);
    this.name = "ParticipationError";
  }
}

/** Derive the ActivationRef from an ACTUAL Activation — the only sanctioned path (§25/§35). */
export function activationRefOf(activation: Activation): ActivationRef {
  return Object.freeze({
    activationId: activation.activationId,
    agentDefinitionId: activation.agentDefinitionId,
    runDefinition: Object.freeze({ ...activation.runDefinition }),
    bindingResolution: Object.freeze({ ...activation.bindingResolution }),
  });
}

/** AttemptRef from canonical Work identity; both parts must be non-empty stable ids. */
export function attemptRefOf(projectId: string, attemptId: string): AttemptRef {
  for (const [value, what] of [
    [projectId, "projectId"],
    [attemptId, "attemptId"],
  ] as const) {
    if (typeof value !== "string" || !isStableIdentifier(value)) {
      throw new ParticipationError("participation_invalid", `${what} must be a stable identifier`);
    }
  }
  return Object.freeze({ projectId, attemptId });
}

/** Materialize an Invocation (validate ids, deep-freeze, detach inputs). */
export function materializeInvocation(input: {
  readonly invocationId: InvocationId;
  readonly activation: ActivationRef;
  readonly attempt: AttemptRef;
}): Invocation {
  if (!isStableIdentifier(input.invocationId)) {
    throw new ParticipationError("participation_invalid", "invocationId must be a stable identifier");
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    invocationId: input.invocationId,
    activation: Object.freeze({ ...input.activation }),
    attempt: Object.freeze({ ...input.attempt }),
    purpose: "participate" as const,
  });
}

/** Materialize a Participation (validate ids, deep-freeze, detach inputs). */
export function materializeParticipation(input: {
  readonly participationId: ParticipationId;
  readonly activation: ActivationRef;
  readonly attempt: AttemptRef;
  readonly invocation?: InvocationRef;
}): Participation {
  if (!isStableIdentifier(input.participationId)) {
    throw new ParticipationError(
      "participation_invalid",
      "participationId must be a stable identifier",
    );
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    participationId: input.participationId,
    activation: Object.freeze({ ...input.activation }),
    attempt: Object.freeze({ ...input.attempt }),
    ...(input.invocation === undefined ? {} : { invocation: Object.freeze({ ...input.invocation }) }),
  });
}

/* ------------------------------------------------------------------------- *
 * F0 §23–§24: artifact-domain strict parsers. These own the SEMANTIC SHAPE of
 * persisted participation artifacts; the CoordinationStore registry delegates
 * to them and owns only persistence/envelope/ordering/idempotency.
 * ------------------------------------------------------------------------- */

const ACTIVATION_REF_KEYS = ["activationId", "agentDefinitionId", "runDefinition", "bindingResolution"] as const;
const ATTEMPT_REF_KEYS = ["projectId", "attemptId"] as const;
const PARTICIPATION_END_REASONS = ["completed", "withdrawn", "cancelled", "runtime_lost"] as const;

/** Strict ActivationRef: exact fields, nested run/binding refs validated. */
export function parseActivationRef(raw: unknown, what = "activation"): ActivationRef {
  const record = strictObject(raw, { allowed: ACTIVATION_REF_KEYS, required: ACTIVATION_REF_KEYS }, what);
  const runDefinition = strictObject(
    record.runDefinition,
    { allowed: ["digest"], required: ["digest"] },
    `${what}.runDefinition`,
  );
  const bindingResolution = strictObject(
    record.bindingResolution,
    { allowed: ["resolutionId", "digest"], required: ["resolutionId", "digest"] },
    `${what}.bindingResolution`,
  );
  return Object.freeze({
    activationId: requireStableId(record.activationId, `${what}.activationId`),
    agentDefinitionId: requireStableId(record.agentDefinitionId, `${what}.agentDefinitionId`),
    runDefinition: Object.freeze({
      digest: requireString(runDefinition.digest, `${what}.runDefinition.digest`),
    }) as RunDefinitionRef,
    bindingResolution: Object.freeze({
      resolutionId: requireStableId(bindingResolution.resolutionId, `${what}.bindingResolution.resolutionId`),
      digest: requireString(bindingResolution.digest, `${what}.bindingResolution.digest`),
    }) as BindingResolutionRef,
  });
}

/** Strict AttemptRef: both parts must be stable identifiers (§26). */
export function parseAttemptRef(raw: unknown, what = "attempt"): AttemptRef {
  const record = strictObject(raw, { allowed: ATTEMPT_REF_KEYS, required: ATTEMPT_REF_KEYS }, what);
  return Object.freeze({
    projectId: requireStableId(record.projectId, `${what}.projectId`),
    attemptId: requireStableId(record.attemptId, `${what}.attemptId`),
  });
}

export function parseInvocationRef(raw: unknown, what = "invocation"): InvocationRef {
  const record = strictObject(raw, { allowed: ["invocationId"], required: ["invocationId"] }, what);
  return Object.freeze({ invocationId: requireStableId(record.invocationId, `${what}.invocationId`) });
}

/** Strict Invocation: exact fields, schemaVersion 1, purpose literal. */
export function parseInvocation(raw: unknown, what = "invocation"): Invocation {
  const record = strictObject(
    raw,
    {
      allowed: ["schemaVersion", "invocationId", "activation", "attempt", "purpose"],
      required: ["schemaVersion", "invocationId", "activation", "attempt", "purpose"],
    },
    what,
  );
  requireSchemaVersion(record.schemaVersion, what);
  requireLiteral(record.purpose, "participate", `${what}.purpose`);
  return Object.freeze({
    schemaVersion: 1 as const,
    invocationId: requireStableId(record.invocationId, `${what}.invocationId`),
    activation: parseActivationRef(record.activation, `${what}.activation`),
    attempt: parseAttemptRef(record.attempt, `${what}.attempt`),
    purpose: "participate" as const,
  });
}

/** Strict Participation: optional invocation ref validated when present. */
export function parseParticipation(raw: unknown, what = "participation"): Participation {
  const record = strictObject(
    raw,
    {
      allowed: ["schemaVersion", "participationId", "activation", "attempt", "invocation"],
      required: ["schemaVersion", "participationId", "activation", "attempt"],
    },
    what,
  );
  requireSchemaVersion(record.schemaVersion, what);
  const invocation = record.invocation;
  return Object.freeze({
    schemaVersion: 1 as const,
    participationId: requireStableId(record.participationId, `${what}.participationId`),
    activation: parseActivationRef(record.activation, `${what}.activation`),
    attempt: parseAttemptRef(record.attempt, `${what}.attempt`),
    ...(invocation === undefined
      ? {}
      : { invocation: parseInvocationRef(invocation, `${what}.invocation`) }),
  });
}

export function parseParticipationEndReason(raw: unknown, what = "endReason"): ParticipationEndReason {
  return requireOneOf(raw, PARTICIPATION_END_REASONS, what);
}

/** Strict parsers for the participation event types, registered with the store. */
export const PARTICIPATION_EVENT_PARSERS: CoordinationEventParsers = Object.freeze({
  INVOCATION_RECORDED: (payload: unknown) => {
    const record = strictObject(payload, { allowed: ["invocation"], required: ["invocation"] }, "INVOCATION_RECORDED");
    return Object.freeze({ invocation: parseInvocation(record.invocation, "invocation") });
  },
  PARTICIPATION_STARTED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["participation"], required: ["participation"] },
      "PARTICIPATION_STARTED",
    );
    return Object.freeze({ participation: parseParticipation(record.participation, "participation") });
  },
  PARTICIPATION_ENDED: (payload: unknown) => {
    const record = strictObject(
      payload,
      { allowed: ["participationId", "endReason"], required: ["participationId", "endReason"] },
      "PARTICIPATION_ENDED",
    );
    return Object.freeze({
      participationId: requireStableId(record.participationId, "participationId"),
      endReason: parseParticipationEndReason(record.endReason),
    });
  },
});

export { CoordinationStoreError };
