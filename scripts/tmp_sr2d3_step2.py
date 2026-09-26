import io, subprocess

# SR-2d3 §十九 — the STABLE IDENTITY layer.
#
# The 10-file SCC's reverse edges were all "who owns this ref type". This module is the answer:
# the identity contracts live BELOW both Coordination semantics and Federation transport, so the
# direction becomes
#
#     identity  →  Coordination semantics  →  Federation transport
#
# and neither of the upper two has to name the other to describe its own payloads.
#
# NOTHING here changes a wire shape: every interface, every parser and every key list is moved
# verbatim. `parsePeerRef` still accepts exactly `{schemaVersion, peerId}`.

# 1. Extract the PeerRef block from federation/peer.ts.
peer = io.open("src/federation/peer.ts", encoding="utf-8").read()
peer_start = peer.index("export type PeerId = string;")
peer_end = peer.index("/** A discoverability artifact. NOT evidence, NOT authority (§46/§47). */")
peer_block = peer[peer_start:peer_end]
# The moved code needs its own error type and its own helpers, which peer.ts keeps using for the
# OTHER artifacts it still owns — so the block is copied and the remaining peer.ts keeps them.
peer_tail = peer[peer_end:]
peer_head = peer[:peer_start]
io.open("src/federation/peer.ts", "w", encoding="utf-8", newline="\n").write(
    peer_head
    + '''/**
 * SR-2d3 §十九: `PeerRef` and its parser MOVED to `src/identity/refs.ts`, the stable-identity
 * layer, so `organization/definition.ts` no longer has to import this transport module to name a
 * peer. Re-exported here so every existing import path and the recorded public surface are
 * unchanged.
 */
export type { PeerId, PeerRef } from "../identity/refs.js";
export { materializePeerRef, parsePeerRef, PeerIdentityError } from "../identity/refs.js";

'''
    + peer_tail
)
print("peer.ts re-exports the peer identity")

# 2. Build the identity module from the moved blocks.
identity = '''/**
 * SR-2d3 §十九 — the STABLE IDENTITY contracts.
 *
 * These refs are the ADDRESSABLE IDENTITIES that Coordination semantics and Federation transport
 * both name in their payloads: a peer, an activation, an attempt, an organization definition, an
 * accepted boundary revision. Each is identity ONLY — no transport address, no authority, no
 * lifecycle — and each was previously declared inside one of the two upper layers, which made the
 * other import it and closed a ten-file cycle.
 *
 *     identity  →  Coordination semantics  →  Federation transport
 *
 * The direction is now explicit and one-way: this module imports the SCHEMA grammar and nothing
 * else, so nothing above it can be dragged in by naming a ref.
 *
 * NOTHING HERE CHANGED SHAPE. Every interface, parser and key list is moved verbatim: the parsers
 * still accept exactly the same fields, still reject exactly the same unknown ones, and still fail
 * with the same messages.
 *
 * Layer: L1 (`src/identity/`). Consumed by both upper layers and re-exported from each owner, so
 * every existing import path and the recorded public surface are unchanged.
 */
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import { CoordinationStoreError } from "./errors.js";
import {
  requireStableId,
  requireString,
  strictObject,
} from "./strict.js";

/* ------------------------------------------------------------------ *
 * PeerRef (§41/§42) — a stable ADDRESSABLE collaboration identity
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * ActivationRef (§25) / AttemptRef (§26)
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * OrganizationDefinitionRef
 * ------------------------------------------------------------------ */

export interface OrganizationDefinitionRef {
  readonly organizationDefinitionId: string;
  readonly revision: number;
  readonly digest: string;
}

function orgFail(message: string): never {
  throw new CoordinationStoreError(message);
}

export function parseOrganizationRef(raw: unknown, what = "OrganizationDefinitionRef"): OrganizationDefinitionRef {
  const object = strictObject(
    raw,
    { allowed: ["organizationDefinitionId", "revision", "digest"], required: ["organizationDefinitionId", "revision", "digest"] },
    what,
  );
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    orgFail(`${what}.revision must be a safe non-negative integer`);
  }
  return Object.freeze({
    organizationDefinitionId: requireStableId(object.organizationDefinitionId, `${what}.organizationDefinitionId`),
    revision,
    digest: requireString(object.digest, `${what}.digest`),
  });
}
'''

io.open("src/identity/refs.ts", "w", encoding="utf-8", newline="\n").write(identity)
print("identity/refs.ts created")
