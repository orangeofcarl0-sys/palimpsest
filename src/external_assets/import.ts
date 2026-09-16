/**
 * G10-AE §14/§15/§16 — EXPLICIT import into the existing `ProjectJournal`.
 *
 *   Reference != Import       Import != TruthAdmission
 *   Import != Task            Import != Evidence
 *   Import != Decision        Import != Work / Proof mutation
 *   Opportunity != Task       (only `promoteOpportunity()` turns one into Work)
 *
 * V1 imports into exactly ONE existing owner — the ProjectJournal — because the
 * Journal owns project knowledge that has no other canonical owner. The caller
 * EXPLICITLY selects one of the existing Journal kinds (`IDEA`, `OPEN_QUESTION`,
 * `NEGATIVE_RESULT`, `OPPORTUNITY`, `REFERENCE_NOTE`); a provider `assetType`
 * NEVER auto-maps to a Journal kind (there is no mapping table anywhere in this
 * plane, and the candidate records the caller's kind verbatim).
 *
 * The imported entry carries STRUCTURED provenance back to the exact stable
 * external ref: a canonical-JSON `ExternalAssetImportProvenance` artifact in the
 * entry's `provenance` field AND `relatedRefs` entries naming the exact external
 * revision key and the provenance digest. No prose-only linkage.
 *
 * Nothing here writes Work Evidence, Proof evidence/claims, Decisions or
 * Reasoning claims — the plane cannot even import those owners.
 */

import { canonicalDigest, canonicalJsonBytes } from "../schema/canonical.js";

import {
  journalEntryRecordedEvent,
  materializeProjectJournalEntry,
  parseProjectJournalEntry,
  projectJournalEntryDigestOf,
  PROJECT_JOURNAL_KINDS,
  type ProjectJournalEntry,
  type ProjectJournalKind,
  type ProjectJournalRef,
} from "../project_workspace/journal.js";

import {
  eaCompareText,
  eaDigest,
  eaEnum,
  eaFail,
  eaKeys,
  eaObject,
  eaOptionalString,
  eaStableId,
  eaString,
  externalAssetStableRefKey,
  parseExternalAssetStableRef,
  type ExternalAssetStableRef,
} from "./refs.js";

export const EXTERNAL_ASSET_IMPORT_PROVENANCE_DOMAIN =
  "palimpsest.external-assets.import-provenance.v1";
export const EXTERNAL_ASSET_IMPORT_OPERATION_DOMAIN =
  "palimpsest.external-assets.import-operation.v1";
export const EXTERNAL_ASSET_IMPORT_CANDIDATE_DOMAIN =
  "palimpsest.external-assets.import-candidate.v1";

/** The ONE structured relation an import records. It grants nothing. */
export const EXTERNAL_ASSET_IMPORT_RELATION = "IMPORTED_FROM_EXTERNAL_LIBRARY";

/** `relatedRefs` kinds written by an import — refs to the external owner, never a copy. */
export const EXTERNAL_ASSET_RELATED_REF_KIND = "external_asset";
export const EXTERNAL_ASSET_PROVENANCE_REF_KIND = "external_asset_provenance";

/* ------------------------------------------------------------------ *
 * §18 The derived import operation id
 * ------------------------------------------------------------------ */

/**
 * Derived from (project id, external stable ref, target Journal kind, exact text
 * digest, provider definition digest). A retry after a crash therefore maps to
 * the SAME operation, and the bridge lineage plus the content-addressed Journal
 * event id make the retry idempotent.
 */
export function externalAssetImportOperationIdOf(input: {
  readonly projectId: string;
  readonly externalRef: ExternalAssetStableRef;
  readonly journalKind: ProjectJournalKind;
  readonly textDigest: string;
  readonly providerDefinitionDigest: string;
}): string {
  return `imp-${canonicalDigest({
    domain: EXTERNAL_ASSET_IMPORT_OPERATION_DOMAIN,
    projectId: eaStableId(input.projectId, "projectId"),
    externalRef: parseExternalAssetStableRef(input.externalRef),
    journalKind: eaEnum(input.journalKind, PROJECT_JOURNAL_KINDS, "journalKind"),
    textDigest: eaDigest(input.textDigest, "textDigest"),
    providerDefinitionDigest: eaDigest(input.providerDefinitionDigest, "providerDefinitionDigest"),
  }).slice(0, 32)}`;
}

/* ------------------------------------------------------------------ *
 * §16 Structured provenance artifact
 * ------------------------------------------------------------------ */

export interface ExternalAssetImportProvenance {
  readonly schemaVersion: 1;
  readonly relation: typeof EXTERNAL_ASSET_IMPORT_RELATION;
  readonly providerId: string;
  readonly assetId: string;
  readonly contentDigest: string;
  readonly revisionLabel?: string | undefined;
  readonly refDigest: string;
  readonly providerDefinitionDigest: string;
  readonly importOperationId: string;
  readonly sourceLocator?: string | undefined;
  readonly digest: string;
}

export function externalAssetImportProvenanceDigestOf(
  input: Omit<ExternalAssetImportProvenance, "digest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_IMPORT_PROVENANCE_DOMAIN, provenance: input });
}

export function materializeExternalAssetImportProvenance(input: {
  readonly externalRef: ExternalAssetStableRef;
  readonly providerDefinitionDigest: string;
  readonly importOperationId: string;
  readonly sourceLocator?: string | undefined;
}): ExternalAssetImportProvenance {
  const externalRef = parseExternalAssetStableRef(input.externalRef);
  const content: Omit<ExternalAssetImportProvenance, "digest"> = {
    schemaVersion: 1,
    relation: EXTERNAL_ASSET_IMPORT_RELATION,
    providerId: externalRef.providerId,
    assetId: externalRef.assetId,
    contentDigest: externalRef.contentDigest,
    ...(externalRef.revisionLabel === undefined ? {} : { revisionLabel: externalRef.revisionLabel }),
    refDigest: externalRef.refDigest,
    providerDefinitionDigest: eaDigest(input.providerDefinitionDigest, "providerDefinitionDigest"),
    importOperationId: eaString(input.importOperationId, "importOperationId"),
    ...(input.sourceLocator === undefined
      ? {}
      : { sourceLocator: eaString(input.sourceLocator, "sourceLocator") }),
  };
  return Object.freeze({ ...content, digest: externalAssetImportProvenanceDigestOf(content) });
}

export function parseExternalAssetImportProvenance(
  raw: unknown,
  what = "ExternalAssetImportProvenance",
): ExternalAssetImportProvenance {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    [
      "schemaVersion",
      "relation",
      "providerId",
      "assetId",
      "contentDigest",
      "revisionLabel",
      "refDigest",
      "providerDefinitionDigest",
      "importOperationId",
      "sourceLocator",
      "digest",
    ],
    [
      "schemaVersion",
      "relation",
      "providerId",
      "assetId",
      "contentDigest",
      "refDigest",
      "providerDefinitionDigest",
      "importOperationId",
      "digest",
    ],
    what,
  );
  if (object.schemaVersion !== 1) eaFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const revisionLabel = eaOptionalString(object.revisionLabel, `${what}.revisionLabel`);
  const sourceLocator = eaOptionalString(object.sourceLocator, `${what}.sourceLocator`);
  const content: Omit<ExternalAssetImportProvenance, "digest"> = {
    schemaVersion: 1,
    relation: eaEnum(object.relation, [EXTERNAL_ASSET_IMPORT_RELATION] as const, `${what}.relation`),
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    assetId: eaStableId(object.assetId, `${what}.assetId`),
    contentDigest: eaDigest(object.contentDigest, `${what}.contentDigest`),
    ...(revisionLabel === undefined ? {} : { revisionLabel }),
    refDigest: eaDigest(object.refDigest, `${what}.refDigest`),
    providerDefinitionDigest: eaDigest(object.providerDefinitionDigest, `${what}.providerDefinitionDigest`),
    importOperationId: eaString(object.importOperationId, `${what}.importOperationId`),
    ...(sourceLocator === undefined ? {} : { sourceLocator }),
  };
  const digest = eaDigest(object.digest, `${what}.digest`);
  if (externalAssetImportProvenanceDigestOf(content) !== digest) {
    eaFail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...content, digest });
}

/** The canonical-JSON form stored in the Journal entry's `provenance` field. */
export function externalAssetImportProvenanceText(
  provenance: ExternalAssetImportProvenance,
): string {
  return new TextDecoder().decode(canonicalJsonBytes(provenance));
}

/**
 * Read the STRUCTURED provenance back out of an imported Journal entry. It
 * re-verifies the provenance digest AND that `relatedRefs` really names the exact
 * external revision plus this provenance artifact — so a prose-only lookalike
 * cannot pass.
 */
export function externalAssetImportProvenanceOf(
  entry: ProjectJournalEntry,
): ExternalAssetImportProvenance | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.provenance);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  let provenance: ExternalAssetImportProvenance;
  try {
    provenance = parseExternalAssetImportProvenance(parsed);
  } catch {
    return undefined;
  }
  const expectedKey = `${provenance.providerId}/${provenance.assetId}@${provenance.contentDigest}`;
  const named = entry.relatedRefs.some(
    (ref) => ref.kind === EXTERNAL_ASSET_RELATED_REF_KIND && ref.id === expectedKey,
  );
  const provenanceNamed = entry.relatedRefs.some(
    (ref) => ref.kind === EXTERNAL_ASSET_PROVENANCE_REF_KIND && ref.id === provenance.digest,
  );
  return named && provenanceNamed ? provenance : undefined;
}

/* ------------------------------------------------------------------ *
 * The import candidate (§18)
 * ------------------------------------------------------------------ */

export interface ExternalAssetImportCandidate {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly projectId: string;
  readonly externalRef: ExternalAssetStableRef;
  readonly providerDefinitionDigest: string;
  /** The caller's EXPLICIT choice. Never derived from the provider asset type. */
  readonly journalKind: ProjectJournalKind;
  /** The EXACT local Journal entry this import appends (deterministic identity). */
  readonly entry: ProjectJournalEntry;
  readonly provenance: ExternalAssetImportProvenance;
  /** The exact materialized text digest; MUST equal `externalRef.contentDigest`. */
  readonly textDigest: string;
  readonly candidateDigest: string;
}

export function externalAssetImportCandidateDigestOf(
  input: Omit<ExternalAssetImportCandidate, "candidateDigest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_IMPORT_CANDIDATE_DOMAIN, candidate: input });
}

export function materializeExternalAssetImportCandidate(input: {
  readonly projectId: string;
  readonly externalRef: ExternalAssetStableRef;
  readonly providerDefinitionDigest: string;
  readonly journalKind: ProjectJournalKind;
  readonly title: string;
  readonly text: string;
  readonly textDigest: string;
  readonly createdAt: string;
  readonly sourceLocator?: string | undefined;
}): ExternalAssetImportCandidate {
  const externalRef = parseExternalAssetStableRef(input.externalRef);
  const projectId = eaStableId(input.projectId, "projectId");
  const providerDefinitionDigest = eaDigest(
    input.providerDefinitionDigest,
    "providerDefinitionDigest",
  );
  const journalKind = eaEnum(input.journalKind, PROJECT_JOURNAL_KINDS, "journalKind");
  // §15: the materialized text digest must be the exact referenced digest.
  const textDigest = eaDigest(input.textDigest, "textDigest");
  if (textDigest !== externalRef.contentDigest) {
    eaFail(
      "digest_mismatch",
      `materialized text digest ${textDigest} is not the referenced digest ${externalRef.contentDigest}`,
    );
  }
  const operationId = externalAssetImportOperationIdOf({
    projectId,
    externalRef,
    journalKind,
    textDigest,
    providerDefinitionDigest,
  });
  const provenance = materializeExternalAssetImportProvenance({
    externalRef,
    providerDefinitionDigest,
    importOperationId: operationId,
    ...(input.sourceLocator === undefined ? {} : { sourceLocator: input.sourceLocator }),
  });
  const relatedRefs: readonly ProjectJournalRef[] = Object.freeze(
    [
      { kind: EXTERNAL_ASSET_RELATED_REF_KIND, id: externalAssetStableRefKey(externalRef) },
      { kind: EXTERNAL_ASSET_PROVENANCE_REF_KIND, id: provenance.digest },
    ].sort((a, b) => (a.kind === b.kind ? eaCompareText(a.id, b.id) : eaCompareText(a.kind, b.kind))),
  );
  const entry = materializeProjectJournalEntry({
    projectId,
    kind: journalKind,
    title: eaString(input.title, "title"),
    body: eaString(input.text, "text"),
    provenance: externalAssetImportProvenanceText(provenance),
    relatedRefs,
    createdAt: input.createdAt,
  });
  const content: Omit<ExternalAssetImportCandidate, "candidateDigest"> = {
    schemaVersion: 1,
    operationId,
    projectId,
    externalRef,
    providerDefinitionDigest,
    journalKind,
    entry,
    provenance,
    textDigest,
  };
  return Object.freeze({ ...content, candidateDigest: externalAssetImportCandidateDigestOf(content) });
}

export function parseExternalAssetImportCandidate(
  raw: unknown,
  what = "ExternalAssetImportCandidate",
): ExternalAssetImportCandidate {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    [
      "schemaVersion",
      "operationId",
      "projectId",
      "externalRef",
      "providerDefinitionDigest",
      "journalKind",
      "entry",
      "provenance",
      "textDigest",
      "candidateDigest",
    ],
    [
      "schemaVersion",
      "operationId",
      "projectId",
      "externalRef",
      "providerDefinitionDigest",
      "journalKind",
      "entry",
      "provenance",
      "textDigest",
      "candidateDigest",
    ],
    what,
  );
  if (object.schemaVersion !== 1) eaFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const externalRef = parseExternalAssetStableRef(object.externalRef, `${what}.externalRef`);
  const providerDefinitionDigest = eaDigest(
    object.providerDefinitionDigest,
    `${what}.providerDefinitionDigest`,
  );
  const journalKind = eaEnum(object.journalKind, PROJECT_JOURNAL_KINDS, `${what}.journalKind`);
  const textDigest = eaDigest(object.textDigest, `${what}.textDigest`);
  const projectId = eaStableId(object.projectId, `${what}.projectId`);
  const content: Omit<ExternalAssetImportCandidate, "candidateDigest"> = {
    schemaVersion: 1,
    operationId: eaString(object.operationId, `${what}.operationId`),
    projectId,
    externalRef,
    providerDefinitionDigest,
    journalKind,
    entry: parseProjectJournalEntry(object.entry, `${what}.entry`),
    provenance: parseExternalAssetImportProvenance(object.provenance, `${what}.provenance`),
    textDigest,
  };
  const expectedOperationId = externalAssetImportOperationIdOf({
    projectId,
    externalRef,
    journalKind,
    textDigest,
    providerDefinitionDigest,
  });
  if (expectedOperationId !== content.operationId) {
    eaFail("invalid_value", `${what}.operationId does not match its content`);
  }
  if (content.entry.projectId !== projectId) {
    eaFail("invalid_value", `${what}.entry belongs to project "${content.entry.projectId}"`);
  }
  if (content.entry.kind !== journalKind) {
    // §14: the entry kind is the caller's explicit choice, never a provider mapping.
    eaFail("invalid_value", `${what}.entry kind "${content.entry.kind}" is not the selected Journal kind "${journalKind}"`);
  }
  if (content.entry.digest !== projectJournalEntryDigestOf(withoutDigest(content.entry))) {
    // `parseProjectJournalEntry` already verified the artifact; this is the
    // belt-and-braces re-derivation the bridge relies on for idempotency.
    eaFail("invalid_value", `${what}.entry digest does not match its content`);
  }
  const candidateDigest = eaDigest(object.candidateDigest, `${what}.candidateDigest`);
  if (externalAssetImportCandidateDigestOf(content) !== candidateDigest) {
    eaFail("invalid_value", `${what}.candidateDigest does not match its content`);
  }
  return Object.freeze({ ...content, candidateDigest });
}

/** The single Journal event an import appends (idempotent by content-addressed id). */
export function externalAssetImportJournalEvent(entry: ProjectJournalEntry) {
  return journalEntryRecordedEvent(entry);
}

/** The entry's own digest is derived over its content EXCLUDING the digest field. */
function withoutDigest(entry: ProjectJournalEntry): Omit<ProjectJournalEntry, "digest"> {
  const { digest, ...rest } = entry;
  void digest;
  return rest;
}
