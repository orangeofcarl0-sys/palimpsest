/**
 * G10-F4 durable institution artifacts (§105–§113, §118–§119, §125).
 *
 * A DurableInstitution answers what persists through time: which lineage is
 * authoritative, who may continue/change it, and which organization body is
 * current. It is NOT an Organization, NOT a PersistentPoint, NOT a PeerRef,
 * NOT a RuntimeAgent, and NOT an Institution epoch's organization body.
 *
 *   InstitutionId             ≠ OrganizationDefinitionId / PeerId /
 *                               PersistentPointId / AgentDefinitionId
 *   InstitutionEpoch          ≠ runtime Activation / Session
 *   InstitutionCharter        ≠ Organization mission
 *   ContinuationAuthority     ≠ Ordarium effect authority / truth authority
 *
 * Charter and epoch are immutable, strictly parsed, deep-frozen artifacts with
 * domain-separated content digests. Charter content identity excludes
 * institutionId + revision (mirroring the other definition artifacts); epoch
 * content identity INCLUDES institutionId + epoch (an epoch is not a reusable
 * identity — it is a position in one institution's lineage).
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";
import type { OrganizationDefinitionRef } from "../organization/definition.js";
import { parseOrganizationRef } from "../organization/definition.js";

export type InstitutionId = string;

export const INSTITUTION_CHARTER_DIGEST_DOMAIN = "palimpsest.institution-charter.v1";
export const INSTITUTION_EPOCH_DIGEST_DOMAIN = "palimpsest.institution-epoch.v1";

export class InstitutionArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstitutionArtifactError";
  }
}

function fail(message: string): never {
  throw new InstitutionArtifactError(message);
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
  }
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

function revisionOf(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${what} must be a safe non-negative integer`);
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Continuation authority (§108–§111)
 * ------------------------------------------------------------------ */

export interface ContinuationAuthorityRule {
  readonly authorities: readonly PeerRef[];
  readonly requiredApprovals: number;
}

function canonicalAuthorities(authorities: readonly PeerRef[]): readonly PeerRef[] {
  const byId = new Map<string, PeerRef>();
  for (const authority of authorities) {
    if (!byId.has(authority.peerId)) {
      byId.set(authority.peerId, Object.freeze({ schemaVersion: 1 as const, peerId: authority.peerId }));
    }
  }
  return Object.freeze([...byId.values()].sort((a, b) => (a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0)));
}

export function materializeContinuationAuthorityRule(input: {
  readonly authorities: readonly PeerRef[];
  readonly requiredApprovals: number;
}): ContinuationAuthorityRule {
  const authorities = canonicalAuthorities(input.authorities);
  const requiredApprovals = input.requiredApprovals;
  if (!Number.isSafeInteger(requiredApprovals) || requiredApprovals < 1) {
    fail("requiredApprovals must be an integer >= 1");
  }
  if (requiredApprovals > authorities.length) {
    fail("requiredApprovals must not exceed the number of unique authorities");
  }
  return Object.freeze({ authorities, requiredApprovals });
}

export function parseContinuationAuthorityRule(raw: unknown, what = "continuationAuthority"): ContinuationAuthorityRule {
  const object = asObject(raw, what);
  exactKeys(object, ["authorities", "requiredApprovals"], what);
  if (!Array.isArray(object.authorities)) fail(`${what}.authorities must be an array`);
  const authorities = object.authorities.map((entry) => parsePeerRef(entry));
  return materializeContinuationAuthorityRule({
    authorities,
    requiredApprovals: revisionOf(object.requiredApprovals, `${what}.requiredApprovals`),
  });
}

/* ------------------------------------------------------------------ *
 * InstitutionCharter (§106–§111)
 * ------------------------------------------------------------------ */

export interface InstitutionCharterRef {
  readonly institutionId: InstitutionId;
  readonly revision: number;
  readonly digest: string;
}

export interface InstitutionCharter {
  readonly schemaVersion: 1;
  readonly institutionId: InstitutionId;
  readonly revision: number;
  readonly digest: string;
  readonly purpose: string;
  readonly continuationAuthority: ContinuationAuthorityRule;
}

export function institutionCharterDigestContent(input: {
  readonly purpose: string;
  readonly continuationAuthority: ContinuationAuthorityRule;
}): unknown {
  return {
    domain: INSTITUTION_CHARTER_DIGEST_DOMAIN,
    purpose: input.purpose,
    continuationAuthority: {
      authorities: input.continuationAuthority.authorities.map((authority) => authority.peerId),
      requiredApprovals: input.continuationAuthority.requiredApprovals,
    },
  };
}

function freezeCharter(
  institutionId: string,
  revision: number,
  digest: string,
  purpose: string,
  continuationAuthority: ContinuationAuthorityRule,
): InstitutionCharter {
  return Object.freeze({
    schemaVersion: 1 as const,
    institutionId,
    revision,
    digest,
    purpose,
    continuationAuthority,
  });
}

export function materializeInstitutionCharter(input: {
  readonly institutionId: InstitutionId;
  readonly revision: number;
  readonly purpose: string;
  readonly continuationAuthority: ContinuationAuthorityRule;
}): InstitutionCharter {
  const institutionId = stableId(input.institutionId, "institutionId");
  const revision = revisionOf(input.revision, "revision");
  const purpose = nonEmpty(input.purpose, "purpose");
  const continuationAuthority = materializeContinuationAuthorityRule({
    authorities: input.continuationAuthority.authorities,
    requiredApprovals: input.continuationAuthority.requiredApprovals,
  });
  const digest = canonicalDigest(institutionCharterDigestContent({ purpose, continuationAuthority }));
  return freezeCharter(institutionId, revision, digest, purpose, continuationAuthority);
}

export function parseInstitutionCharter(raw: unknown, what = "InstitutionCharter"): InstitutionCharter {
  const object = asObject(raw, what);
  exactKeys(object, ["schemaVersion", "institutionId", "revision", "digest", "purpose", "continuationAuthority"], what);
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  const institutionId = stableId(object.institutionId, `${what}.institutionId`);
  const revision = revisionOf(object.revision, `${what}.revision`);
  const digest = nonEmpty(object.digest, `${what}.digest`);
  const purpose = nonEmpty(object.purpose, `${what}.purpose`);
  const continuationAuthority = parseContinuationAuthorityRule(object.continuationAuthority, `${what}.continuationAuthority`);
  const computed = canonicalDigest(institutionCharterDigestContent({ purpose, continuationAuthority }));
  if (digest !== computed) fail(`${what}.digest does not match its content`);
  return freezeCharter(institutionId, revision, digest, purpose, continuationAuthority);
}

export function institutionCharterRefOf(charter: InstitutionCharter): InstitutionCharterRef {
  return Object.freeze({ institutionId: charter.institutionId, revision: charter.revision, digest: charter.digest });
}

export function parseInstitutionCharterRef(raw: unknown, what = "InstitutionCharterRef"): InstitutionCharterRef {
  const object = asObject(raw, what);
  exactKeys(object, ["institutionId", "revision", "digest"], what);
  return Object.freeze({
    institutionId: stableId(object.institutionId, `${what}.institutionId`),
    revision: revisionOf(object.revision, `${what}.revision`),
    digest: nonEmpty(object.digest, `${what}.digest`),
  });
}

export function institutionCharterRefsEqual(a: InstitutionCharterRef, b: InstitutionCharterRef): boolean {
  return a.institutionId === b.institutionId && a.revision === b.revision && a.digest === b.digest;
}

/* ------------------------------------------------------------------ *
 * InstitutionEpoch (§112–§113)
 * ------------------------------------------------------------------ */

export interface InstitutionEpochRef {
  readonly institutionId: InstitutionId;
  readonly epoch: number;
  readonly digest: string;
}

export interface InstitutionEpoch {
  readonly schemaVersion: 1;
  readonly institutionId: InstitutionId;
  readonly epoch: number;
  readonly predecessor: InstitutionEpochRef | null;
  readonly charter: InstitutionCharterRef;
  readonly organization: OrganizationDefinitionRef;
  readonly transition: string;
  readonly digest: string;
}

export function institutionEpochDigestContent(input: {
  readonly institutionId: string;
  readonly epoch: number;
  readonly predecessor: InstitutionEpochRef | null;
  readonly charter: InstitutionCharterRef;
  readonly organization: OrganizationDefinitionRef;
  readonly transition: string;
}): unknown {
  return {
    domain: INSTITUTION_EPOCH_DIGEST_DOMAIN,
    institutionId: input.institutionId,
    epoch: input.epoch,
    predecessor: input.predecessor,
    charter: input.charter,
    organization: input.organization,
    transition: input.transition,
  };
}

function freezeEpoch(
  institutionId: string,
  epoch: number,
  predecessor: InstitutionEpochRef | null,
  charter: InstitutionCharterRef,
  organization: OrganizationDefinitionRef,
  transition: string,
  digest: string,
): InstitutionEpoch {
  return Object.freeze({
    schemaVersion: 1 as const,
    institutionId,
    epoch,
    predecessor,
    charter,
    organization,
    transition,
    digest,
  });
}

export function materializeInstitutionEpoch(input: {
  readonly institutionId: InstitutionId;
  readonly epoch: number;
  readonly predecessor: InstitutionEpochRef | null;
  readonly charter: InstitutionCharterRef;
  readonly organization: OrganizationDefinitionRef;
  readonly transition: string;
}): InstitutionEpoch {
  const institutionId = stableId(input.institutionId, "institutionId");
  const epoch = revisionOf(input.epoch, "epoch");
  const transition = stableId(input.transition, "transition");
  if (epoch === 0 && input.predecessor !== null) fail("epoch 0 must not declare a predecessor");
  if (epoch > 0) {
    if (input.predecessor === null) fail("a non-genesis epoch requires a predecessor");
    if (input.predecessor.institutionId !== institutionId) fail("predecessor institution id mismatch");
    if (input.predecessor.epoch !== epoch - 1) fail("predecessor must be the immediately previous epoch");
  }
  const predecessor =
    input.predecessor === null
      ? null
      : Object.freeze({ institutionId, epoch: input.predecessor.epoch, digest: nonEmpty(input.predecessor.digest, "predecessor.digest") });
  const charter = Object.freeze({
    institutionId,
    revision: revisionOf(input.charter.revision, "charter.revision"),
    digest: nonEmpty(input.charter.digest, "charter.digest"),
  });
  const organization = parseOrganizationRef(input.organization);
  const digest = canonicalDigest(
    institutionEpochDigestContent({ institutionId, epoch, predecessor, charter, organization, transition }),
  );
  return freezeEpoch(institutionId, epoch, predecessor, charter, organization, transition, digest);
}

export function parseInstitutionEpoch(raw: unknown, what = "InstitutionEpoch"): InstitutionEpoch {
  const object = asObject(raw, what);
  exactKeys(
    object,
    ["schemaVersion", "institutionId", "epoch", "predecessor", "charter", "organization", "transition", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  const institutionId = stableId(object.institutionId, `${what}.institutionId`);
  const epoch = revisionOf(object.epoch, `${what}.epoch`);
  const transition = stableId(object.transition, `${what}.transition`);
  const digest = nonEmpty(object.digest, `${what}.digest`);
  const predecessorRaw = object.predecessor;
  let predecessor: InstitutionEpochRef | null = null;
  if (predecessorRaw !== null && predecessorRaw !== undefined) {
    const entry = asObject(predecessorRaw, `${what}.predecessor`);
    exactKeys(entry, ["institutionId", "epoch", "digest"], `${what}.predecessor`);
    predecessor = Object.freeze({
      institutionId: stableId(entry.institutionId, `${what}.predecessor.institutionId`),
      epoch: revisionOf(entry.epoch, `${what}.predecessor.epoch`),
      digest: nonEmpty(entry.digest, `${what}.predecessor.digest`),
    });
  }
  if (epoch === 0 && predecessor !== null) fail("epoch 0 must not declare a predecessor");
  if (epoch > 0) {
    if (predecessor === null) fail("a non-genesis epoch requires a predecessor");
    if (predecessor.institutionId !== institutionId) fail("predecessor institution id mismatch");
    if (predecessor.epoch !== epoch - 1) fail("predecessor must be the immediately previous epoch");
  }
  const charterObject = asObject(object.charter, `${what}.charter`);
  exactKeys(charterObject, ["institutionId", "revision", "digest"], `${what}.charter`);
  const charter = Object.freeze({
    institutionId: stableId(charterObject.institutionId, `${what}.charter.institutionId`),
    revision: revisionOf(charterObject.revision, `${what}.charter.revision`),
    digest: nonEmpty(charterObject.digest, `${what}.charter.digest`),
  });
  if (charter.institutionId !== institutionId) fail(`${what}.charter institution id mismatch`);
  const organization = parseOrganizationRef(object.organization, `${what}.organization`);
  const computed = canonicalDigest(
    institutionEpochDigestContent({ institutionId, epoch, predecessor, charter, organization, transition }),
  );
  if (digest !== computed) fail(`${what}.digest does not match its content`);
  return freezeEpoch(institutionId, epoch, predecessor, charter, organization, transition, digest);
}

export function institutionEpochRefOf(epoch: InstitutionEpoch): InstitutionEpochRef {
  return Object.freeze({ institutionId: epoch.institutionId, epoch: epoch.epoch, digest: epoch.digest });
}

export function parseInstitutionEpochRef(raw: unknown, what = "InstitutionEpochRef"): InstitutionEpochRef {
  const object = asObject(raw, what);
  exactKeys(object, ["institutionId", "epoch", "digest"], what);
  return Object.freeze({
    institutionId: stableId(object.institutionId, `${what}.institutionId`),
    epoch: revisionOf(object.epoch, `${what}.epoch`),
    digest: nonEmpty(object.digest, `${what}.digest`),
  });
}

export function institutionEpochRefsEqual(a: InstitutionEpochRef, b: InstitutionEpochRef): boolean {
  return a.institutionId === b.institutionId && a.epoch === b.epoch && a.digest === b.digest;
}

/* ------------------------------------------------------------------ *
 * Governance artifacts (§118–§119)
 * ------------------------------------------------------------------ */

export interface InstitutionTransitionProposal {
  readonly transitionId: string;
  readonly institutionId: InstitutionId;
  readonly baseEpoch: InstitutionEpochRef;
  readonly proposedCharter: InstitutionCharterRef;
  readonly proposedOrganization: OrganizationDefinitionRef;
  readonly reason: string;
}

export interface InstitutionApproval {
  readonly transitionId: string;
  readonly approvingPeer: PeerRef;
}

export function materializeTransitionProposal(input: InstitutionTransitionProposal): InstitutionTransitionProposal {
  const transitionId = stableId(input.transitionId, "transitionId");
  const institutionId = stableId(input.institutionId, "institutionId");
  if (input.baseEpoch.institutionId !== institutionId) fail("baseEpoch institution id mismatch");
  if (input.proposedCharter.institutionId !== institutionId) fail("proposedCharter institution id mismatch");
  return Object.freeze({
    transitionId,
    institutionId,
    baseEpoch: parseInstitutionEpochRef(input.baseEpoch, "baseEpoch"),
    proposedCharter: parseInstitutionCharterRef(input.proposedCharter, "proposedCharter"),
    proposedOrganization: parseOrganizationRef(input.proposedOrganization, "proposedOrganization"),
    reason: nonEmpty(input.reason, "reason"),
  });
}

export function parseTransitionProposal(raw: unknown, what = "InstitutionTransitionProposal"): InstitutionTransitionProposal {
  const object = asObject(raw, what);
  exactKeys(
    object,
    ["transitionId", "institutionId", "baseEpoch", "proposedCharter", "proposedOrganization", "reason"],
    what,
  );
  return materializeTransitionProposal({
    transitionId: stableId(object.transitionId, `${what}.transitionId`),
    institutionId: stableId(object.institutionId, `${what}.institutionId`),
    baseEpoch: parseInstitutionEpochRef(object.baseEpoch, `${what}.baseEpoch`),
    proposedCharter: parseInstitutionCharterRef(object.proposedCharter, `${what}.proposedCharter`),
    proposedOrganization: parseOrganizationRef(object.proposedOrganization, `${what}.proposedOrganization`),
    reason: nonEmpty(object.reason, `${what}.reason`),
  });
}

export function materializeApproval(input: { readonly transitionId: string; readonly approvingPeer: PeerRef }): InstitutionApproval {
  return Object.freeze({
    transitionId: stableId(input.transitionId, "transitionId"),
    approvingPeer: parsePeerRef(input.approvingPeer),
  });
}

export function parseApproval(raw: unknown, what = "InstitutionApproval"): InstitutionApproval {
  const object = asObject(raw, what);
  exactKeys(object, ["transitionId", "approvingPeer"], what);
  return materializeApproval({
    transitionId: stableId(object.transitionId, `${what}.transitionId`),
    approvingPeer: parsePeerRef(object.approvingPeer),
  });
}
