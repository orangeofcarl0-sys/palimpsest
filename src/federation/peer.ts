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
import type { ActivationRef } from "../coordination/index.js";
import type { AttemptRef } from "../coordination/index.js";

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

/** A discoverability artifact. NOT evidence, NOT authority (§46/§47). */
export interface PeerAdvertisement {
  readonly peer: PeerRef;
  readonly competenceTags: readonly string[];
}

/** Explicit association artifact (§44): association ≠ identity; implemented for current use cases. */
export interface PeerContinuityAssociation {
  readonly peer: PeerRef;
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
  readonly peer: PeerRef;
  readonly competenceTags: readonly string[];
}): PeerAdvertisement {
  return Object.freeze({
    peer: input.peer,
    competenceTags: requireTags(input.competenceTags, "competenceTags"),
  });
}

/** Where a contact need came from (§48). */
export type ContactNeedOrigin =
  | { readonly kind: "attempt"; readonly attempt: AttemptRef }
  | { readonly kind: "activation"; readonly activation: ActivationRef }
  | { readonly kind: "runtime_scope"; readonly scope: string };

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
    origin: Object.freeze({ ...input.origin }),
    competenceTags: requireTags(input.competenceTags, "competenceTags"),
    reason: input.reason,
  });
}

/** "A peer worth contacting" — NEVER a selection, assignment, or commitment (§54). */
export interface ContactCandidate {
  readonly peer: PeerRef;
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
