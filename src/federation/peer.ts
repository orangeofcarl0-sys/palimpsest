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
 *
 * E3-C §10: the `task` form is an ADDITIVE extension of this EXISTING
 * Federation-owned vocabulary. A need grounded in a blocked Work condition must
 * name the exact task and the exact project revision it was observed under —
 * using `runtime_scope` or `activation` as a stand-in would be a lie about
 * provenance. There is deliberately NO universal `TaskRef` here: the four
 * fields are the minimum that makes the claim checkable.
 */
export type ContactNeedOrigin =
  | { readonly kind: "attempt"; readonly attempt: AttemptRef }
  | { readonly kind: "activation"; readonly activation: ActivationRef }
  | { readonly kind: "runtime_scope"; readonly scope: RuntimeScopeRef }
  | {
      readonly kind: "task";
      readonly projectId: string;
      readonly taskId: string;
      readonly projectRevision: number;
      readonly projectDigest: string;
    };

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
  if (object.kind === "task") {
    exactKeys(object, ["kind", "projectId", "taskId", "projectRevision", "projectDigest"], "origin");
    if (
      typeof object.projectRevision !== "number" ||
      !Number.isSafeInteger(object.projectRevision) ||
      object.projectRevision < 0
    ) {
      fail("origin.projectRevision must be a non-negative integer");
    }
    if (typeof object.projectDigest !== "string" || object.projectDigest.length === 0) {
      fail("origin.projectDigest must be a non-empty string");
    }
    return Object.freeze({
      kind: "task" as const,
      projectId: requireStableOriginId(object.projectId, "origin.projectId"),
      taskId: requireStableOriginId(object.taskId, "origin.taskId"),
      projectRevision: object.projectRevision,
      projectDigest: object.projectDigest,
    });
  }
  fail(`unsupported ContactNeedOrigin kind "${String(object.kind)}"`);
}

function requireStableOriginId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
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

/** Strict ContactNeed artifact parser: exact fields, origin re-validated. */
export function parseContactNeed(raw: unknown, what = "ContactNeed"): ContactNeed {
  const object = asStrictOriginObject(raw, what);
  exactKeys(object, ["schemaVersion", "contactNeedId", "origin", "competenceTags", "reason"], what);
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  return materializeContactNeed({
    contactNeedId: requireStableOriginId(object.contactNeedId, `${what}.contactNeedId`),
    origin: parseContactNeedOrigin(object.origin),
    competenceTags: requireOriginTags(object.competenceTags, `${what}.competenceTags`),
    reason: requireOriginReason(object.reason, `${what}.reason`),
  });
}

function asStrictOriginObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail(`${what} must be an object`);
  return raw as Record<string, unknown>;
}

function requireOriginTags(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${what} must be an array`);
  const seen = new Set<string>();
  for (const tag of value) {
    if (typeof tag !== "string" || tag.length === 0) fail(`${what}: tags must be non-empty strings`);
    if (seen.has(tag)) fail(`${what}: duplicate tag "${tag}" (semantic set)`);
    seen.add(tag);
  }
  return Object.freeze([...seen].sort());
}

function requireOriginReason(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

/* ------------------------------------------------------------------ *
 * E3-C §11/§12: durable ContactNeed declaration provenance
 * ------------------------------------------------------------------ */

/**
 * E3-C §11/§12: WHY a durable ContactNeed exists. A manual declaration and a
 * candidate-derived admission both produce a durable need, but their provenance
 * is not the same claim — collapsing them would make "an authority admitted
 * this" indistinguishable from "an operator typed it".
 *
 * The `candidate` arm carries the exact candidate digest (the §13 retry
 * correlation) plus the project basis, the typed ground and the admission
 * decision that produced it. The `manual` arm carries only the fact that a
 * caller declared it explicitly.
 */
export type ContactNeedDeclarationProvenance =
  | { readonly kind: "manual" }
  | {
      readonly kind: "candidate";
      readonly candidateDigest: string;
      readonly projectBasis: {
        readonly projectId: string;
        readonly revision: number;
        readonly digest: string;
        readonly headCommit: string;
      };
      readonly ground: unknown;
      readonly admission: {
        readonly decision: "ADMIT";
        readonly policyRef: { readonly policyId: string; readonly version: string };
        readonly provenanceDigest: string;
      };
    };

/** Strict provenance parser: a discriminated union, never a partial bag. */
export function parseContactNeedDeclarationProvenance(
  raw: unknown,
  what = "provenance",
): ContactNeedDeclarationProvenance {
  const object = asStrictOriginObject(raw, what);
  if (object.kind === "manual") {
    exactKeys(object, ["kind"], what);
    return Object.freeze({ kind: "manual" as const });
  }
  if (object.kind === "candidate") {
    exactKeys(object, ["kind", "candidateDigest", "projectBasis", "ground", "admission"], what);
    if (typeof object.candidateDigest !== "string" || object.candidateDigest.length === 0) {
      fail(`${what}.candidateDigest must be a non-empty string`);
    }
    const basis = asStrictOriginObject(object.projectBasis, `${what}.projectBasis`);
    exactKeys(basis, ["projectId", "revision", "digest", "headCommit"], `${what}.projectBasis`);
    if (typeof basis.revision !== "number" || !Number.isSafeInteger(basis.revision) || basis.revision < 0) {
      fail(`${what}.projectBasis.revision must be a non-negative integer`);
    }
    const admission = asStrictOriginObject(object.admission, `${what}.admission`);
    exactKeys(admission, ["decision", "policyRef", "provenanceDigest"], `${what}.admission`);
    if (admission.decision !== "ADMIT") fail(`${what}.admission.decision must be "ADMIT"`);
    const policyRef = asStrictOriginObject(admission.policyRef, `${what}.admission.policyRef`);
    exactKeys(policyRef, ["policyId", "version"], `${what}.admission.policyRef`);
    if (typeof object.ground !== "object" || object.ground === null) {
      fail(`${what}.ground must be an object`);
    }
    return Object.freeze({
      kind: "candidate" as const,
      candidateDigest: object.candidateDigest,
      projectBasis: Object.freeze({
        projectId: requireStableOriginId(basis.projectId, `${what}.projectBasis.projectId`),
        revision: basis.revision,
        digest: requireOriginReason(basis.digest, `${what}.projectBasis.digest`),
        headCommit: requireOriginReason(basis.headCommit, `${what}.projectBasis.headCommit`),
      }),
      ground: Object.freeze(object.ground as Record<string, unknown>),
      admission: Object.freeze({
        decision: "ADMIT" as const,
        policyRef: Object.freeze({
          policyId: requireOriginReason(policyRef.policyId, `${what}.admission.policyRef.policyId`),
          version: requireOriginReason(policyRef.version, `${what}.admission.policyRef.version`),
        }),
        provenanceDigest: requireOriginReason(admission.provenanceDigest, `${what}.admission.provenanceDigest`),
      }),
    });
  }
  fail(`${what}.kind must be one of manual, candidate`);
}

/** E3-C §11: the durable declaration record. */
export interface ContactNeedDeclaredPayload {
  readonly need: ContactNeed;
  readonly provenance: ContactNeedDeclarationProvenance;
}

/** Strict ContactNeedDeclared parser. */
export function parseContactNeedDeclared(raw: unknown): ContactNeedDeclaredPayload {
  const object = asStrictOriginObject(raw, "CONTACT_NEED_DECLARED");
  exactKeys(object, ["need", "provenance"], "CONTACT_NEED_DECLARED");
  return Object.freeze({
    need: parseContactNeed(object.need, "CONTACT_NEED_DECLARED.need"),
    provenance: parseContactNeedDeclarationProvenance(object.provenance, "CONTACT_NEED_DECLARED.provenance"),
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
