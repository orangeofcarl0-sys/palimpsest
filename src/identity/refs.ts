/**
 * SR-2d3 §十九 — the STABLE IDENTITY contracts.
 *
 * These are the ADDRESSABLE IDENTITIES that Coordination semantics and Federation transport both
 * name in their payloads: a peer, an activation, an attempt, an organization definition, an
 * accepted boundary revision — plus the coordination PARSER contract a store accepts. Each is
 * identity or contract ONLY: no transport address, no authority, no lifecycle. Each was previously
 * declared inside one of the two upper layers, which made the other import it and closed a
 * ten-file cycle.
 *
 *     identity  →  Coordination semantics  →  Federation transport
 *
 * NOTHING HERE CHANGED SHAPE. Every interface, parser, key list and error name is moved verbatim:
 * the parsers accept exactly the same fields, reject exactly the same unknown ones, and fail with
 * the same messages and the same exception classes (re-exported from their original modules, so a
 * caller catching `PeerIdentityError` still catches exactly that class object).
 *
 * Layer: L2 (`src/identity/`). It imports the SCHEMA grammar (L1), the coordination error/strict
 * helpers (previously extracted for exactly this reason), and the runtime-scope ref shape — all
 * BELOW or beside it, never the coordination or federation semantics it serves.
 */
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import { CoordinationStoreError } from "./errors.js";
import { requireStableId, requireString, strictObject } from "./strict.js";
import type { RuntimeScopeRef } from "../runtime_scope/ref.js";
import { parseRuntimeScopeRef } from "../runtime_scope/ref.js";

/* ================================================================== *
 * PeerRef (§41/§42) — a stable ADDRESSABLE collaboration identity
 * ================================================================== */

export type PeerId = string;

/** Stable addressable collaboration identity — identity ONLY (no transport address). */
export interface PeerRef {
  readonly schemaVersion: 1;
  readonly peerId: PeerId;
}

export class PeerIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeerIdentityError";
  }
}

function fail(message: string): never {
  throw new PeerIdentityError(message);
}

/** Materialize a PeerRef (stable-identifier grammar; deep-frozen). */
export function materializePeerRef(input: { readonly peerId: PeerId }): PeerRef {
  if (typeof input.peerId !== "string") fail("peerId must be a string");
  const id = normalizeStableIdentifier(input.peerId);
  if (!isStableIdentifier(id)) {
    fail(
      "peerId must be a stable identifier: 1-128 ASCII characters, starting " +
        "with an alphanumeric, then [A-Za-z0-9._:-] (no transport addresses, no whitespace)",
    );
  }
  return Object.freeze({ schemaVersion: 1 as const, peerId: id });
}

/** Strict parser from `unknown`. */
export function parsePeerRef(raw: unknown): PeerRef {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("PeerRef must be an object");
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "schemaVersion" && key !== "peerId") fail(`unknown PeerRef field "${key}"`);
  }
  if (!Object.hasOwn(object, "schemaVersion") || !Object.hasOwn(object, "peerId")) {
    fail("PeerRef requires schemaVersion and peerId");
  }
  if (object.schemaVersion !== 1) fail("PeerRef.schemaVersion must be 1");
  return materializePeerRef({ peerId: object.peerId as string });
}

/* ================================================================== *
 * ActivationRef (§25) / AttemptRef (§26)
 * ================================================================== */

export type ActivationId = string;

/** Immutable provenance derived from an actual Activation (§25). */
export interface ActivationRef {
  readonly activationId: ActivationId;
  readonly agentDefinitionId: string;
  readonly runDefinition: { readonly digest: string };
  readonly bindingResolution: { readonly resolutionId: string; readonly digest: string };
}

/** Canonical Work/Attempt identity pair (§26) — no new Attempt identity invented. */
export interface AttemptRef {
  readonly projectId: string;
  readonly attemptId: string;
}

const ACTIVATION_REF_KEYS = ["activationId", "agentDefinitionId", "runDefinition", "bindingResolution"] as const;
const ATTEMPT_REF_KEYS = ["projectId", "attemptId"] as const;

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
    }),
    bindingResolution: Object.freeze({
      resolutionId: requireStableId(bindingResolution.resolutionId, `${what}.bindingResolution.resolutionId`),
      digest: requireString(bindingResolution.digest, `${what}.bindingResolution.digest`),
    }),
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

/* ================================================================== *
 * OrganizationDefinitionRef
 * ================================================================== */

export interface OrganizationDefinitionRef {
  readonly organizationDefinitionId: string;
  readonly revision: number;
  readonly digest: string;
}

/**
 * The organization ref parser's error — the SAME class the organization plane fights with.
 *
 * Moved here rather than injected, so a caller catching it keeps catching one class object. The
 * organization module re-exports it, which is why the recorded public surface is unchanged.
 */
export class OrganizationDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDefinitionError";
  }
}

export function parseOrganizationRef(raw: unknown, what = "OrganizationDefinitionRef"): OrganizationDefinitionRef {
  const object = strictObject(
    raw,
    {
      allowed: ["organizationDefinitionId", "revision", "digest"],
      required: ["organizationDefinitionId", "revision", "digest"],
    },
    what,
  );
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    throw new OrganizationDefinitionError(`${what}.revision must be a safe non-negative integer`);
  }
  return Object.freeze({
    organizationDefinitionId: requireStableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`),
    revision,
    digest: requireString(object.digest, `${what}.digest`),
  });
}

/* ================================================================== *
 * AcceptedBoundaryRevisionRef
 * ================================================================== */

export type BoundaryWorkspaceId = string;
export type BoundaryArtifactId = string;

export interface AcceptedBoundaryRevisionRef {
  readonly schemaVersion: 1;
  readonly workspaceId: BoundaryWorkspaceId;
  readonly artifactId: BoundaryArtifactId;
  readonly revision: number;
  readonly candidateDigest: string;
  readonly revisionDigest: string;
}

function bmFail(message: string): never {
  throw new CoordinationStoreError(message);
}

export function materializeAcceptedBoundaryRevisionRef(input: {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly revision: number;
  readonly candidateDigest: string;
  readonly revisionDigest: string;
}): AcceptedBoundaryRevisionRef {
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: requireStableId(input.workspaceId, "workspaceId"),
    artifactId: requireStableId(input.artifactId, "artifactId"),
    revision: (() => {
      const value = input.revision;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        bmFail("revision must be a safe non-negative integer");
      }
      return value;
    })(),
    candidateDigest: requireString(input.candidateDigest, "candidateDigest"),
    revisionDigest: requireString(input.revisionDigest, "revisionDigest"),
  });
}

export function parseAcceptedBoundaryRevisionRef(
  raw: unknown,
  what = "AcceptedBoundaryRevisionRef",
): AcceptedBoundaryRevisionRef {
  const object = strictObject(
    raw,
    {
      allowed: ["schemaVersion", "workspaceId", "artifactId", "revision", "candidateDigest", "revisionDigest"],
      required: ["schemaVersion", "workspaceId", "artifactId", "revision", "candidateDigest", "revisionDigest"],
    },
    what,
  );
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return materializeAcceptedBoundaryRevisionRef({
    workspaceId: object.workspaceId as string,
    artifactId: object.artifactId as string,
    revision: object.revision as number,
    candidateDigest: object.candidateDigest as string,
    revisionDigest: object.revisionDigest as string,
  });
}

/* ================================================================== *
 * The coordination PARSER contract
 * ================================================================== */

/** Strict per-type payload parser (§33): parse + validate, never a generic bag. */
export type CoordinationEventPayloadParser = (payload: unknown) => unknown;
export type CoordinationEventParsers = Readonly<Record<string, CoordinationEventPayloadParser>>;

/** Re-exported so this module is the single import site for the identity vocabulary. */
export { CoordinationStoreError };
export type { RuntimeScopeRef };
export { parseRuntimeScopeRef };
