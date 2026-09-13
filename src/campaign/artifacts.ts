/**
 * G10-G1 Campaign artifacts — durable long-horizon identity above Project.
 *
 *   Campaign ≠ Project       (§2)
 *   Campaign ≠ DurableInstitution (§3) — Institution OWNS, Campaign is one
 *                              long-horizon activity within it
 *   Campaign ≠ RuntimeAgent   (§4) — continuity is semantic/durable
 *   CampaignCommitment ≠ federation Commitment (§47)
 *
 * Campaign genesis requires an EXISTING InstitutionId, an explicit CampaignId,
 * and an initial CampaignCommitment. It requires no runtime, no Organization
 * member, no Project, and no Task.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type CampaignId = string;
export type CampaignCommitmentId = string;

export const CAMPAIGN_CHAIN_DOMAIN = "palimpsest.campaign-chain.v1";

export class CampaignArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignArtifactError";
  }
}

function fail(message: string): never {
  throw new CampaignArtifactError(message);
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

/* ------------------------------------------------------------------ *
 * CampaignDefinition
 * ------------------------------------------------------------------ */

export interface CampaignDefinition {
  readonly schemaVersion: 1;
  readonly campaignId: CampaignId;
  readonly institutionId: string;
}

export function materializeCampaignDefinition(input: {
  readonly campaignId: CampaignId;
  readonly institutionId: string;
}): CampaignDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    campaignId: stableId(input.campaignId, "campaignId"),
    institutionId: stableId(input.institutionId, "institutionId"),
  });
}

export function parseCampaignDefinition(raw: unknown, what = "CampaignDefinition"): CampaignDefinition {
  const object = asObject(raw, what);
  exactKeys(object, ["schemaVersion", "campaignId", "institutionId"], what);
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  return materializeCampaignDefinition({
    campaignId: stableId(object.campaignId, `${what}.campaignId`),
    institutionId: stableId(object.institutionId, `${what}.institutionId`),
  });
}

/* ------------------------------------------------------------------ *
 * CampaignCommitment (§47–§51)
 * ------------------------------------------------------------------ */

export interface CampaignCommitment {
  readonly schemaVersion: 1;
  readonly commitmentId: CampaignCommitmentId;
  readonly campaignId: CampaignId;
  readonly statement: string;
}

export function materializeCampaignCommitment(input: {
  readonly commitmentId: CampaignCommitmentId;
  readonly campaignId: CampaignId;
  readonly statement: string;
}): CampaignCommitment {
  return Object.freeze({
    schemaVersion: 1 as const,
    commitmentId: stableId(input.commitmentId, "commitmentId"),
    campaignId: stableId(input.campaignId, "campaignId"),
    statement: nonEmpty(input.statement, "statement"),
  });
}

export function parseCampaignCommitment(raw: unknown, what = "CampaignCommitment"): CampaignCommitment {
  const object = asObject(raw, what);
  exactKeys(object, ["schemaVersion", "commitmentId", "campaignId", "statement"], what);
  if (object.schemaVersion !== 1) fail(`${what}.schemaVersion must be 1`);
  return materializeCampaignCommitment({
    commitmentId: stableId(object.commitmentId, `${what}.commitmentId`),
    campaignId: stableId(object.campaignId, `${what}.campaignId`),
    statement: nonEmpty(object.statement, `${what}.statement`),
  });
}

/* ------------------------------------------------------------------ *
 * CampaignBasisRef (§54/§55)
 * ------------------------------------------------------------------ */

export interface CampaignBasisRef {
  readonly campaignId: CampaignId;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export function parseCampaignBasisRef(raw: unknown, what = "CampaignBasisRef"): CampaignBasisRef {
  const object = asObject(raw, what);
  exactKeys(object, ["campaignId", "throughSeq", "chainDigest"], what);
  if (typeof object.throughSeq !== "number" || !Number.isSafeInteger(object.throughSeq) || object.throughSeq < 0) {
    fail(`${what}.throughSeq must be a safe non-negative integer`);
  }
  return Object.freeze({
    campaignId: stableId(object.campaignId, `${what}.campaignId`),
    throughSeq: object.throughSeq,
    chainDigest: nonEmpty(object.chainDigest, `${what}.chainDigest`),
  });
}

export function campaignBasisRefsEqual(a: CampaignBasisRef, b: CampaignBasisRef): boolean {
  return a.campaignId === b.campaignId && a.throughSeq === b.throughSeq && a.chainDigest === b.chainDigest;
}

/** Integrity/freshness chain digest — NOT blockchain semantics (§55). */
export function campaignChainDigest(input: {
  readonly campaignId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: CAMPAIGN_CHAIN_DOMAIN,
    campaignId: input.campaignId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/* ------------------------------------------------------------------ *
 * Commitment lifecycle events (§49)
 * ------------------------------------------------------------------ */

export type CampaignEventType =
  | "CAMPAIGN_COMMITMENT_OPENED"
  | "CAMPAIGN_COMMITMENT_RESOLVED"
  | "CAMPAIGN_COMMITMENT_ABANDONED"
  | "CAMPAIGN_COMMITMENT_SUPERSEDED"
  | "HYPOTHESIS_PROPOSED"
  | "HYPOTHESIS_RETIRED"
  | "EVIDENCE_OBSERVED"
  | "BELIEF_REVISED"
  | "INTERVENTION_REGISTERED"
  | "INTERVENTION_OPERATIONAL_OBSERVED"
  | "INTERVENTION_EPISTEMIC_ASSESSED";

export interface CommitmentOpenedPayload {
  readonly commitment: CampaignCommitment;
}
export interface CommitmentEndedPayload {
  readonly commitmentId: CampaignCommitmentId;
  readonly reason: string;
}
export interface CommitmentSupersededPayload {
  readonly commitmentId: CampaignCommitmentId;
  readonly successorCommitmentId: CampaignCommitmentId;
}

export type CampaignEventPayloadParser = (payload: unknown) => unknown;
export type CampaignEventParsers = Readonly<Record<string, CampaignEventPayloadParser>>;

export const CAMPAIGN_COMMITMENT_EVENT_PARSERS: CampaignEventParsers = Object.freeze({
  CAMPAIGN_COMMITMENT_OPENED: (payload: unknown) => {
    const object = asObject(payload, "CAMPAIGN_COMMITMENT_OPENED");
    exactKeys(object, ["commitment"], "CAMPAIGN_COMMITMENT_OPENED");
    return Object.freeze({ commitment: parseCampaignCommitment(object.commitment) });
  },
  CAMPAIGN_COMMITMENT_RESOLVED: (payload: unknown) => {
    const object = asObject(payload, "CAMPAIGN_COMMITMENT_RESOLVED");
    exactKeys(object, ["commitmentId", "reason"], "CAMPAIGN_COMMITMENT_RESOLVED");
    return Object.freeze({
      commitmentId: stableId(object.commitmentId, "commitmentId"),
      reason: nonEmpty(object.reason, "reason"),
    });
  },
  CAMPAIGN_COMMITMENT_ABANDONED: (payload: unknown) => {
    const object = asObject(payload, "CAMPAIGN_COMMITMENT_ABANDONED");
    exactKeys(object, ["commitmentId", "reason"], "CAMPAIGN_COMMITMENT_ABANDONED");
    return Object.freeze({
      commitmentId: stableId(object.commitmentId, "commitmentId"),
      reason: nonEmpty(object.reason, "reason"),
    });
  },
  CAMPAIGN_COMMITMENT_SUPERSEDED: (payload: unknown) => {
    const object = asObject(payload, "CAMPAIGN_COMMITMENT_SUPERSEDED");
    exactKeys(object, ["commitmentId", "successorCommitmentId"], "CAMPAIGN_COMMITMENT_SUPERSEDED");
    return Object.freeze({
      commitmentId: stableId(object.commitmentId, "commitmentId"),
      successorCommitmentId: stableId(object.successorCommitmentId, "successorCommitmentId"),
    });
  },
});

/** Derived commitment lifecycle state (§49/§59). */
export type CampaignCommitmentState = "OPEN" | "RESOLVED" | "ABANDONED" | "SUPERSEDED";
