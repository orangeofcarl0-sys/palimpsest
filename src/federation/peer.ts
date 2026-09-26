/**
 * G10-E2 peer identity & contact grounding — collaboration identity and the
 * explicit need that starts a contact, bottom-up.
 *
 * PeerRef (§41/§42): a stable ADDRESSABLE collaboration identity. It is NOT
 * runtime carrier identity, session identity, PersistentPoint identity,
 * AgentDefinition identity, a user account, or an authority root — and it
 * carries NO transport address (§43: address is separately observed/resolved).
 * `PeerRef ≠ PersistentPoint` stays OPEN (§44): only an explicit
 * `PeerContinuityAssociation` artifact may link them, and association ≠
 * identity — implemented only when a use case requires it.
 *
 * PeerAdvertisement (§45/§46/§47): `{peer, competenceTags}` — a
 * discoverability artifact. `PeerAdvertisement ≠ Evidence` and
 * `advertised competence ≠ verified competence`; it carries NO
 * authorityGrants/permissions/effect rights — "I can do X" does not grant
 * authority to do X.
 *
 * ContactNeed (§48/§49/§50): an EXPLICIT semantic need to contact cognitive
 * manpower. `Ownership ≠ ContactNeed`: creating a need does not own, assign,
 * or obligate anyone, and needs are NEVER auto-derived from blocked tasks,
 * dependencies, or worker failures — explicit creation only.
 *
 * Discovery (§51/§52/§53): a read-only `PeerDirectoryPort` with the D4
 * knowledge discipline (unknown ≠ empty); a PURE deterministic matcher
 * (need competenceTags ⊆ advertisement tags, then lexical peer order) — no
 * ML ranking. A `ContactCandidate` is only "a peer worth contacting" — never
 * a selected worker, assigned owner, or committed participant (§54).
 *
 * Local focus (§55): a `focusedPeerRef` view preference. `UserFocus ≠
 * AuthorityRoot` — focus changes no authority, commitment, or identity.
 */

import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { ActivationRef, AttemptRef } from "../identity/refs.js";

import { parseActivationRef, parseAttemptRef } from "../identity/refs.js";
// G10-H H6: the runtime-scope origin is a TYPED RuntimeScopeRef, never a bare string.
import type { RuntimeScopeRef } from "../runtime_scope/ref.js";
import { parseRuntimeScopeRef } from "../runtime_scope/ref.js";

/**
 * SR-2d3 §十九: `PeerRef` and its parser MOVED to `src/identity/refs.ts`, the stable-identity
 * layer, so `organization/definition.ts` no longer imports this TRANSPORT module to name a peer.
 * Re-exported here so every existing import path and the recorded public surface are unchanged.
 */
export type { PeerId, PeerRef } from "../identity/refs.js";
export { materializePeerRef, parsePeerRef, PeerIdentityError } from "../identity/refs.js";

import { PeerIdentityError as LocalPeerIdentityError } from "../identity/refs.js";
// Imported as well as re-exported: this module's own remaining artifacts USE the ref type.
import type { PeerRef as LocalPeerRef } from "../identity/refs.js";

function fail(message: string): never {
  throw new LocalPeerIdentityError(message);
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
  }
}

/** A discoverability artifact. NOT evidence, NOT authority (§46/§47). */
export interface PeerAdvertisement {
  readonly peer: LocalPeerRef;
  readonly competenceTags: readonly string[];
}

/** Explicit association artifact (§44): association ≠ identity; implemented for current use cases. */
export interface PeerContinuityAssociation {
  readonly peer: LocalPeerRef;
  readonly point: string;
}

function requireTags(tags: readonly string[], what: string): readonly string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.length === 0) fail(`${what}: tags must be non-empty strings`);
    if (seen.has(tag)) fail(`${what}: duplicate tag "${tag}" (semantic set)`);
    seen.add(tag);
  }
  return Object.freeze([...tags].sort());
}

export function materializePeerAdvertisement(input: {
  readonly peer: LocalPeerRef;
  readonly competenceTags: readonly string[];
}): PeerAdvertisement {
  return Object.freeze({
    peer: input.peer,
    competenceTags: requireTags(input.competenceTags, "competenceTags"),
  });
}

/**
 * Where a contact need came from (§48). G10-H H6: `runtime_scope` carries a
 * TYPED `RuntimeScopeRef` — a bare string can no longer smuggle a Work scope id
 * or an arbitrary value into a typed provenance position.
 */
export type ContactNeedOrigin =
  | { readonly kind: "attempt"; readonly attempt: AttemptRef }
  | { readonly kind: "activation"; readonly activation: ActivationRef }
  | { readonly kind: "runtime_scope"; readonly scope: RuntimeScopeRef };

/** Strict parser — unknown kinds/fields and malformed refs fail closed. */
export function parseContactNeedOrigin(raw: unknown): ContactNeedOrigin {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("origin must be an object");
  const object = raw as Record<string, unknown>;
  if (object.kind === "attempt") {
    exactKeys(object, ["kind", "attempt"], "origin");
    return Object.freeze({ kind: "attempt" as const, attempt: parseAttemptRef(object.attempt, "origin.attempt") });
  }
  if (object.kind === "activation") {
    exactKeys(object, ["kind", "activation"], "origin");
    return Object.freeze({ kind: "activation" as const, activation: parseActivationRef(object.activation, "origin.activation") });
  }
  if (object.kind === "runtime_scope") {
    exactKeys(object, ["kind", "scope"], "origin");
    return Object.freeze({ kind: "runtime_scope" as const, scope: parseRuntimeScopeRef(object.scope, "origin.scope") });
  }
  fail(`unsupported ContactNeedOrigin kind "${String(object.kind)}"`);
}

/** An explicit semantic need to contact cognitive manpower (§48). */
export interface ContactNeed {
  readonly schemaVersion: 1;
  readonly contactNeedId: string;
  readonly origin: ContactNeedOrigin;
  readonly competenceTags: readonly string[];
  readonly reason: string;
}

export function materializeContactNeed(input: {
  readonly contactNeedId: string;
  readonly origin: ContactNeedOrigin;
  readonly competenceTags: readonly string[];
  readonly reason: string;
}): ContactNeed {
  if (!isStableIdentifier(input.contactNeedId)) {
    fail("contactNeedId must be a stable identifier");
  }
  if (typeof input.reason !== "string" || input.reason.trim() === "") {
    fail("reason must be a non-empty string");
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    contactNeedId: input.contactNeedId,
    origin: parseContactNeedOrigin(input.origin),
    competenceTags: requireTags(input.competenceTags, "competenceTags"),
    reason: input.reason,
  });
}

/** "A peer worth contacting" — NEVER a selection, assignment, or commitment (§54). */
export interface ContactCandidate {
  readonly peer: LocalPeerRef;
  readonly advertisement: PeerAdvertisement;
}

/**
 * The PURE deterministic matcher (§53): requested competenceTags ⊆
 * advertisement.competenceTags, then lexical peer order. No ML ranking.
 */
export function matchContactCandidates(
  need: ContactNeed,
  advertisements: readonly PeerAdvertisement[],
): readonly ContactCandidate[] {
  const requested = new Set(need.competenceTags);
  const matched = advertisements.filter(
    (advertisement) =>
      requested.size > 0 &&
      [...requested].every((tag) => advertisement.competenceTags.includes(tag)),
  );
  return Object.freeze(
    [...matched]
      .sort((a, b) => (a.peer.peerId < b.peer.peerId ? -1 : a.peer.peerId > b.peer.peerId ? 1 : 0))
      .map((advertisement) => Object.freeze({ peer: advertisement.peer, advertisement })),
  );
}
