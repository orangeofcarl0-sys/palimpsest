/**
 * G10-T Proof/Evidence plane — Source revisions.
 *
 *   Source ≠ Evidence        SourceRevision ≠ SemanticClaim
 *   HistoricalSupport ≠ CurrentSupport
 *
 * A `ProofSourceRevision` is an immutable, content-addressed description of one
 * revision of an imported/referenced source. Its semantic identity is the
 * opaque content digest (`blobRef`): absolute local filesystem paths NEVER enter
 * semantic identity. Recording the same (sourceId, revision) with identical
 * content is idempotent; different content fails closed. A newer revision NEVER
 * deletes older ones.
 *
 * This module asserts no truth, freshness, or authority — it only records what
 * bytes were observed under a stable source id.
 */

import { canonicalDigest } from "../schema/canonical.js";
import {
  proofDigestHex,
  proofEnum,
  proofFail,
  proofKeys,
  proofNonNegInt,
  proofObject,
  proofOptionalString,
  proofString,
  proofStringRecord,
  proofRefDigest,
} from "./refs.js";

export const PROOF_SOURCE_REVISION_DOMAIN = "palimpsest.proof.source-revision.v1";
export const PROOF_SOURCE_REVISION_ID_DOMAIN = "palimpsest.proof.source-revision-id.v1";

export const SOURCE_PROVENANCES = ["LOCAL_IMPORT", "EXTERNAL_REFERENCE", "GENERATED_ARTIFACT"] as const;
export type SourceProvenance = (typeof SOURCE_PROVENANCES)[number];

export interface ProofSourceRevision {
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
  readonly mediaType: string;
  readonly label: string;
  readonly provenance: SourceProvenance;
  /** Opaque content address (the content digest). NEVER a filesystem path. */
  readonly blobRef?: string | undefined;
  readonly externalResolverRef?: string | undefined;
  readonly metadata: Readonly<Record<string, string>>;
  readonly digest: string;
}

export function proofSourceRevisionDigestOf(input: Omit<ProofSourceRevision, "digest">): string {
  return canonicalDigest({
    domain: PROOF_SOURCE_REVISION_DOMAIN,
    sourceId: input.sourceId,
    revision: input.revision,
    contentDigest: input.contentDigest,
    mediaType: input.mediaType,
    label: input.label,
    provenance: input.provenance,
    blobRef: input.blobRef ?? null,
    externalResolverRef: input.externalResolverRef ?? null,
    metadata: input.metadata,
  });
}

export interface MaterializeProofSourceRevisionInput {
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
  readonly mediaType: string;
  readonly label: string;
  readonly provenance: SourceProvenance;
  readonly blobRef?: string | undefined;
  readonly externalResolverRef?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export function materializeProofSourceRevision(input: MaterializeProofSourceRevisionInput): ProofSourceRevision {
  const base: Omit<ProofSourceRevision, "digest"> = {
    schemaVersion: 1 as const,
    sourceId: proofString(input.sourceId, "sourceId"),
    revision: proofNonNegInt(input.revision, "revision"),
    contentDigest: proofDigestHex(input.contentDigest, "contentDigest"),
    mediaType: proofString(input.mediaType, "mediaType"),
    label: proofString(input.label, "label"),
    provenance: proofEnum(input.provenance, SOURCE_PROVENANCES, "provenance"),
    ...(input.blobRef === undefined ? {} : { blobRef: proofDigestHex(input.blobRef, "blobRef") }),
    ...(input.externalResolverRef === undefined ? {} : { externalResolverRef: proofString(input.externalResolverRef, "externalResolverRef") }),
    metadata: input.metadata === undefined ? Object.freeze({} as Record<string, string>) : proofStringRecord(input.metadata, "metadata"),
  };
  return Object.freeze({ ...base, digest: proofSourceRevisionDigestOf(base) });
}

export function proofSourceRevisionIdOf(revision: ProofSourceRevision): string {
  return proofRefDigest(PROOF_SOURCE_REVISION_ID_DOMAIN, revision.digest, "psr");
}

export function parseProofSourceRevision(raw: unknown, what = "ProofSourceRevision"): ProofSourceRevision {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "sourceId", "revision", "contentDigest", "mediaType", "label", "provenance", "blobRef", "externalResolverRef", "metadata", "digest"],
    ["schemaVersion", "sourceId", "revision", "contentDigest", "mediaType", "label", "provenance", "metadata", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFailVersion(what);
  const base: Omit<ProofSourceRevision, "digest"> = {
    schemaVersion: 1 as const,
    sourceId: proofString(object.sourceId, `${what}.sourceId`),
    revision: proofNonNegInt(object.revision, `${what}.revision`),
    contentDigest: proofDigestHex(object.contentDigest, `${what}.contentDigest`),
    mediaType: proofString(object.mediaType, `${what}.mediaType`),
    label: proofString(object.label, `${what}.label`),
    provenance: proofEnum(object.provenance, SOURCE_PROVENANCES, `${what}.provenance`),
    ...(object.blobRef === undefined ? {} : { blobRef: proofDigestHex(object.blobRef, `${what}.blobRef`) }),
    ...(object.externalResolverRef === undefined ? {} : { externalResolverRef: proofOptionalString(object.externalResolverRef, `${what}.externalResolverRef`) }),
    metadata: proofStringRecord(object.metadata, `${what}.metadata`),
  };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofSourceRevisionDigestOf(base) !== digest) proofFailDigest(what);
  return Object.freeze({ ...base, digest });
}

/** The semantic revision identity: (sourceId, revision, contentDigest). */
export function proofRevisionIdentityOf(revision: ProofSourceRevision): string {
  return canonicalDigest({
    domain: PROOF_SOURCE_REVISION_ID_DOMAIN,
    sourceId: revision.sourceId,
    revision: revision.revision,
    contentDigest: revision.contentDigest,
  });
}

function proofFailVersion(what: string): never {
  return proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
}

function proofFailDigest(what: string): never {
  return proofFail("invalid_value", `${what}.digest does not match its content`);
}
