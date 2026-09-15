/**
 * G10-T Proof/Evidence plane — disclosure preview / bundle / local export.
 *
 *   Preview ≠ Authority        Admission APPROVE ≠ Authentication
 *   Exported ≠ Received        Bundle manifest ≠ Recipient acceptance
 *   Disclosure manifest ≠ Transport        Local file export ≠ Federation send
 *
 * A disclosure is a READ-ONLY PROJECTION over published proof claims. A preview
 * is merely a description of WHAT WOULD BE disclosed; `purpose` explains why and
 * grants no authority. Export happens ONLY after a separate admission port returns
 * APPROVE — an HTTP bearer token / client authentication is NOT approval and is
 * deliberately not modelled here.
 *
 * THE BUNDLE IS AN IMMUTABLE MANIFEST with NO unrelated assets and NO local
 * export path in its semantic identity (`bundleDigest` is derived from the
 * selection only, never from a filesystem root). The export receipt asserts that
 * bytes were WRITTEN locally by this exporter — it makes NO claim of recipient
 * receipt, authentication, or acceptance.
 *
 * There is NO federation send, boundary attach, e-mail, or upload anywhere in
 * this module. The only effect is `localDisclosureExporter`, which writes files
 * under a caller-supplied local root.
 *
 * DURABILITY: disclosure previews and export receipts are recorded on the proof
 * chain as `DISCLOSURE_PREPARED` / `DISCLOSURE_RECEIPT_RECORDED` events through
 * the injected `ProofEvidenceService`, so they survive process restarts and are
 * reconstructed by replaying the chain. `history()` reads receipts from the proof
 * plane, not from this process. Recording a preview grants NO authority: it is a
 * read-only description of what WOULD be disclosed.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalDigest, canonicalJsonBytes } from "../schema/canonical.js";
import { proofContentDigestOfBytes } from "./blob.js";
import type { ProofAssetView, PublishedProofClaim } from "./claims.js";
import { parseProofAssetView, parsePublishedProofClaim } from "./claims.js";
import type { EvidenceItem } from "./evidence.js";
import type { ProofSourceRevisionRef } from "./refs.js";
import {
  parseProofSourceRevisionRef,
  proofDigestHex,
  proofEnum,
  proofFail,
  proofKeys,
  proofNonEmpty,
  proofObject,
  proofRefDigest,
  proofStableId,
  proofString,
} from "./refs.js";
import type { ProofEvidenceService } from "./service.js";
import type { ProofSourceContentPort } from "./source_content_port.js";

/* ------------------------------------------------------------------ *
 * Domains & constants
 * ------------------------------------------------------------------ */

export const DISCLOSURE_PREVIEW_DOMAIN = "palimpsest.proof.disclosure-preview.v1";
export const DISCLOSURE_PREVIEW_ID_DOMAIN = "palimpsest.proof.disclosure-preview-id.v1";
export const DISCLOSURE_BUNDLE_CONTENT_DOMAIN = "palimpsest.proof.disclosure-bundle-content.v1";
export const DISCLOSURE_BUNDLE_DOMAIN = "palimpsest.proof.disclosure-bundle.v1";
export const DISCLOSURE_BUNDLE_ID_DOMAIN = "palimpsest.proof.disclosure-bundle-id.v1";
export const DISCLOSURE_RECEIPT_DOMAIN = "palimpsest.proof.disclosure-receipt.v1";

/** The mandatory whole-source disclosure warning (verbatim, per the contract). */
export const DISCLOSURE_WHOLE_SOURCE_WARNING = "exporting this evidence discloses the entire source blob";

export const DISCLOSURE_ADMISSION_DECISIONS = ["APPROVE", "REJECT", "UNRESOLVED"] as const;
export type DisclosureAdmissionDecision = (typeof DISCLOSURE_ADMISSION_DECISIONS)[number];

export const LOCAL_DISCLOSURE_EXPORTER_ID = "local-disclosure-exporter";

export class DisclosureError extends Error {
  constructor(
    readonly kind: "invalid_request" | "invalid_artifact" | "export_failed",
    message: string,
  ) {
    super(message);
    this.name = "DisclosureError";
  }
}

/* ------------------------------------------------------------------ *
 * Request / admission ports
 * ------------------------------------------------------------------ */

export interface DisclosureRequest {
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly requestedClaimIds: readonly string[];
}

export interface DisclosureAdmissionPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  admit(input: { readonly preview: DisclosurePreview }): Promise<unknown>;
}

export interface DisclosureAdmissionOutcome {
  readonly decision: DisclosureAdmissionDecision;
}

/** Strict-parse an admission result. An unparseable result is a failure, not APPROVE. */
export function parseDisclosureAdmissionOutcome(raw: unknown, what = "DisclosureAdmissionOutcome"): DisclosureAdmissionOutcome {
  const object = proofObject(raw, what);
  proofKeys(object, ["decision"], ["decision"], what);
  return Object.freeze({ decision: proofEnum(object.decision, DISCLOSURE_ADMISSION_DECISIONS, `${what}.decision`) });
}

/* ------------------------------------------------------------------ *
 * Disclosure preview
 * ------------------------------------------------------------------ */

export interface DisclosureEvidenceRef {
  readonly evidenceId: string;
}

export interface DisclosurePreview {
  readonly schemaVersion: 1;
  readonly previewId: string;
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly ProofAssetView[];
  readonly requiredDependencyIds: readonly string[];
  readonly evidenceRefs: readonly DisclosureEvidenceRef[];
  readonly sourceRevisionRefs: readonly ProofSourceRevisionRef[];
  readonly wholeSourceWarnings: readonly string[];
  readonly warnings: readonly string[];
  readonly excludedBySelection: readonly string[];
  readonly digest: string;
}

export interface MaterializeDisclosurePreviewInput {
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly ProofAssetView[];
  readonly requiredDependencyIds: readonly string[];
  readonly evidenceRefs: readonly DisclosureEvidenceRef[];
  readonly sourceRevisionRefs: readonly ProofSourceRevisionRef[];
  readonly wholeSourceWarnings: readonly string[];
  readonly warnings: readonly string[];
  readonly excludedBySelection: readonly string[];
}

export function disclosurePreviewDigestOf(input: Omit<DisclosurePreview, "schemaVersion" | "previewId" | "digest">): string {
  return canonicalDigest({
    domain: DISCLOSURE_PREVIEW_DOMAIN,
    purpose: input.purpose,
    audienceLabel: input.audienceLabel,
    claimIds: input.claimIds,
    claims: input.claims,
    requiredDependencyIds: input.requiredDependencyIds,
    evidenceRefs: input.evidenceRefs,
    sourceRevisionRefs: input.sourceRevisionRefs,
    wholeSourceWarnings: input.wholeSourceWarnings,
    warnings: input.warnings,
    excludedBySelection: input.excludedBySelection,
  });
}

export function materializeDisclosurePreview(input: MaterializeDisclosurePreviewInput): DisclosurePreview {
  const base: Omit<DisclosurePreview, "schemaVersion" | "previewId" | "digest"> = {
    purpose: proofNonEmpty(input.purpose, "preview.purpose"),
    audienceLabel: proofNonEmpty(input.audienceLabel, "preview.audienceLabel"),
    claimIds: stableIdArray(input.claimIds, "preview.claimIds"),
    claims: assetViewArray(input.claims, "preview.claims"),
    requiredDependencyIds: stableIdArray(input.requiredDependencyIds, "preview.requiredDependencyIds"),
    evidenceRefs: evidenceRefArray(input.evidenceRefs, "preview.evidenceRefs"),
    sourceRevisionRefs: sourceRevisionRefArray(input.sourceRevisionRefs, "preview.sourceRevisionRefs"),
    wholeSourceWarnings: stringArray(input.wholeSourceWarnings, "preview.wholeSourceWarnings"),
    warnings: stringArray(input.warnings, "preview.warnings"),
    excludedBySelection: stableIdArray(input.excludedBySelection, "preview.excludedBySelection"),
  };
  const digest = disclosurePreviewDigestOf(base);
  const previewId = proofRefDigest(DISCLOSURE_PREVIEW_ID_DOMAIN, digest, "dsp");
  return Object.freeze({ schemaVersion: 1 as const, previewId, ...base, digest });
}

export function parseDisclosurePreview(raw: unknown, what = "DisclosurePreview"): DisclosurePreview {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "previewId", "purpose", "audienceLabel", "claimIds", "claims", "requiredDependencyIds", "evidenceRefs", "sourceRevisionRefs", "wholeSourceWarnings", "warnings", "excludedBySelection", "digest"],
    ["schemaVersion", "previewId", "purpose", "audienceLabel", "claimIds", "claims", "requiredDependencyIds", "evidenceRefs", "sourceRevisionRefs", "wholeSourceWarnings", "warnings", "excludedBySelection", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const materialized = materializeDisclosurePreview({
    purpose: object.purpose as string,
    audienceLabel: object.audienceLabel as string,
    claimIds: object.claimIds as readonly string[],
    claims: object.claims as readonly ProofAssetView[],
    requiredDependencyIds: object.requiredDependencyIds as readonly string[],
    evidenceRefs: object.evidenceRefs as readonly DisclosureEvidenceRef[],
    sourceRevisionRefs: object.sourceRevisionRefs as readonly ProofSourceRevisionRef[],
    wholeSourceWarnings: object.wholeSourceWarnings as readonly string[],
    warnings: object.warnings as readonly string[],
    excludedBySelection: object.excludedBySelection as readonly string[],
  });
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (materialized.digest !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  const previewId = proofString(object.previewId, `${what}.previewId`);
  if (materialized.previewId !== previewId) proofFail("invalid_value", `${what}.previewId must be derived from the preview digest`);
  return materialized;
}

/* ------------------------------------------------------------------ *
 * Disclosure bundle (immutable manifest)
 * ------------------------------------------------------------------ */

export interface DisclosureBundle {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly bundleDigest: string;
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly claimSnapshots: readonly PublishedProofClaim[];
  readonly evidenceRefs: readonly DisclosureEvidenceRef[];
  readonly sourceRevisionRefs: readonly ProofSourceRevisionRef[];
  readonly warnings: readonly string[];
  readonly createdAt: string;
  readonly digest: string;
}

export interface MaterializeDisclosureBundleInput {
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly claimSnapshots: readonly PublishedProofClaim[];
  readonly evidenceRefs: readonly DisclosureEvidenceRef[];
  readonly sourceRevisionRefs: readonly ProofSourceRevisionRef[];
  readonly warnings?: readonly string[] | undefined;
  readonly createdAt: string;
}

/** Semantic identity of the SELECTION — deliberately excludes any export path. */
export function disclosureBundleContentDigestOf(input: {
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly claimSnapshots: readonly PublishedProofClaim[];
  readonly evidenceRefs: readonly DisclosureEvidenceRef[];
  readonly sourceRevisionRefs: readonly ProofSourceRevisionRef[];
  readonly warnings: readonly string[];
}): string {
  return canonicalDigest({
    domain: DISCLOSURE_BUNDLE_CONTENT_DOMAIN,
    purpose: input.purpose,
    audienceLabel: input.audienceLabel,
    claimSnapshots: input.claimSnapshots.map((claim) => claim.digest),
    evidenceRefs: input.evidenceRefs.map((ref) => ref.evidenceId),
    sourceRevisionRefs: input.sourceRevisionRefs,
    warnings: input.warnings,
  });
}

export function disclosureBundleDigestOf(input: Omit<DisclosureBundle, "digest">): string {
  return canonicalDigest({
    domain: DISCLOSURE_BUNDLE_DOMAIN,
    bundleId: input.bundleId,
    bundleDigest: input.bundleDigest,
    purpose: input.purpose,
    audienceLabel: input.audienceLabel,
    claimSnapshots: input.claimSnapshots.map((claim) => claim.digest),
    evidenceRefs: input.evidenceRefs.map((ref) => ref.evidenceId),
    sourceRevisionRefs: input.sourceRevisionRefs,
    warnings: input.warnings,
    createdAt: input.createdAt,
  });
}

export function materializeDisclosureBundle(input: MaterializeDisclosureBundleInput): DisclosureBundle {
  const purpose = proofNonEmpty(input.purpose, "bundle.purpose");
  const audienceLabel = proofNonEmpty(input.audienceLabel, "bundle.audienceLabel");
  const claimSnapshots = publishedClaimArray(input.claimSnapshots, "bundle.claimSnapshots");
  const evidenceRefs = evidenceRefArray(input.evidenceRefs, "bundle.evidenceRefs");
  const sourceRevisionRefs = sourceRevisionRefArray(input.sourceRevisionRefs, "bundle.sourceRevisionRefs");
  const warnings = input.warnings === undefined ? Object.freeze([] as string[]) : stringArray(input.warnings, "bundle.warnings");
  const createdAt = proofNonEmpty(input.createdAt, "bundle.createdAt");
  const bundleDigest = disclosureBundleContentDigestOf({ purpose, audienceLabel, claimSnapshots, evidenceRefs, sourceRevisionRefs, warnings });
  const bundleId = proofRefDigest(DISCLOSURE_BUNDLE_ID_DOMAIN, bundleDigest, "dsb");
  const base: Omit<DisclosureBundle, "digest"> = {
    schemaVersion: 1 as const,
    bundleId,
    bundleDigest,
    purpose,
    audienceLabel,
    claimSnapshots,
    evidenceRefs,
    sourceRevisionRefs,
    warnings,
    createdAt,
  };
  return Object.freeze({ ...base, digest: disclosureBundleDigestOf(base) });
}

export function parseDisclosureBundle(raw: unknown, what = "DisclosureBundle"): DisclosureBundle {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "bundleId", "bundleDigest", "purpose", "audienceLabel", "claimSnapshots", "evidenceRefs", "sourceRevisionRefs", "warnings", "createdAt", "digest"],
    ["schemaVersion", "bundleId", "bundleDigest", "purpose", "audienceLabel", "claimSnapshots", "evidenceRefs", "sourceRevisionRefs", "warnings", "createdAt", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const materialized = materializeDisclosureBundle({
    purpose: object.purpose as string,
    audienceLabel: object.audienceLabel as string,
    claimSnapshots: object.claimSnapshots as readonly PublishedProofClaim[],
    evidenceRefs: object.evidenceRefs as readonly DisclosureEvidenceRef[],
    sourceRevisionRefs: object.sourceRevisionRefs as readonly ProofSourceRevisionRef[],
    warnings: object.warnings as readonly string[],
    createdAt: object.createdAt as string,
  });
  const bundleDigest = proofDigestHex(object.bundleDigest, `${what}.bundleDigest`);
  if (materialized.bundleDigest !== bundleDigest) proofFail("invalid_value", `${what}.bundleDigest does not match its content`);
  const bundleId = proofString(object.bundleId, `${what}.bundleId`);
  if (materialized.bundleId !== bundleId) proofFail("invalid_value", `${what}.bundleId must be derived from the bundle digest`);
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (materialized.digest !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return materialized;
}

/* ------------------------------------------------------------------ *
 * Export receipt (a LOCAL WRITE acknowledgement only)
 * ------------------------------------------------------------------ */

export interface DisclosureExportReceipt {
  readonly schemaVersion: 1;
  readonly bundleDigest: string;
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly exportedAt: string;
  readonly exporterId: string;
  readonly digest: string;
}

export interface MaterializeDisclosureExportReceiptInput {
  readonly bundleDigest: string;
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly exportedAt: string;
  readonly exporterId: string;
}

export function disclosureExportReceiptDigestOf(input: Omit<DisclosureExportReceipt, "schemaVersion" | "digest">): string {
  return canonicalDigest({
    domain: DISCLOSURE_RECEIPT_DOMAIN,
    bundleDigest: input.bundleDigest,
    purpose: input.purpose,
    audienceLabel: input.audienceLabel,
    exportedAt: input.exportedAt,
    exporterId: input.exporterId,
  });
}

export function materializeDisclosureExportReceipt(input: MaterializeDisclosureExportReceiptInput): DisclosureExportReceipt {
  const base: Omit<DisclosureExportReceipt, "schemaVersion" | "digest"> = {
    bundleDigest: proofDigestHex(input.bundleDigest, "receipt.bundleDigest"),
    purpose: proofNonEmpty(input.purpose, "receipt.purpose"),
    audienceLabel: proofNonEmpty(input.audienceLabel, "receipt.audienceLabel"),
    exportedAt: proofNonEmpty(input.exportedAt, "receipt.exportedAt"),
    exporterId: proofStableId(input.exporterId, "receipt.exporterId"),
  };
  return Object.freeze({ schemaVersion: 1 as const, ...base, digest: disclosureExportReceiptDigestOf(base) });
}

export function parseDisclosureExportReceipt(raw: unknown, what = "DisclosureExportReceipt"): DisclosureExportReceipt {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "bundleDigest", "purpose", "audienceLabel", "exportedAt", "exporterId", "digest"],
    ["schemaVersion", "bundleDigest", "purpose", "audienceLabel", "exportedAt", "exporterId", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const materialized = materializeDisclosureExportReceipt({
    bundleDigest: object.bundleDigest as string,
    purpose: object.purpose as string,
    audienceLabel: object.audienceLabel as string,
    exportedAt: object.exportedAt as string,
    exporterId: object.exporterId as string,
  });
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (materialized.digest !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return materialized;
}

/* ------------------------------------------------------------------ *
 * Local exporter
 * ------------------------------------------------------------------ */

export interface LocalDisclosureExporter {
  readonly exporterId: string;
  export(input: {
    readonly bundle: DisclosureBundle;
    readonly root: string;
    readonly content?: (ref: ProofSourceRevisionRef) => Promise<Uint8Array | undefined>;
  }): Promise<DisclosureExportReceipt>;
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_");
}

/**
 * A local, filesystem-only exporter. It writes `<root>/<bundleDigest>/manifest.json`
 * (the immutable bundle) plus every source revision whose bytes the caller can
 * resolve AND whose bytes re-hash to the recorded content digest. It makes no
 * transport/recipient claim.
 *
 * The `root` passed to `export` wins; an empty `root` falls back to the factory
 * default. The disclosure SERVICE (which has no root parameter) passes an empty
 * root so a pre-bound default is used.
 *
 * LIMITATION (reported, not faked): the bundle carries opaque evidence refs and
 * source-revision refs, NOT evidence selectors. Whole-source files can therefore
 * be written exactly, but sub-range/JSON-pointer EXCERPTS cannot be reconstructed
 * from the bundle alone; only the source files they are drawn from are written.
 */
export function localDisclosureExporter(root?: string): LocalDisclosureExporter {
  const defaultRoot = root;
  return Object.freeze({
    exporterId: LOCAL_DISCLOSURE_EXPORTER_ID,
    async export(input: {
      readonly bundle: DisclosureBundle;
      readonly root: string;
      readonly content?: (ref: ProofSourceRevisionRef) => Promise<Uint8Array | undefined>;
    }): Promise<DisclosureExportReceipt> {
      const bundle = parseDisclosureBundle(input.bundle);
      const targetRoot = input.root.trim() !== "" ? input.root : defaultRoot;
      if (targetRoot === undefined || targetRoot.trim() === "") {
        throw new DisclosureError("invalid_request", "no disclosure export root was provided");
      }
      const bundleDir = join(targetRoot, bundle.bundleDigest);
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(join(bundleDir, "manifest.json"), canonicalJsonBytes(bundle));
      for (const ref of bundle.sourceRevisionRefs) {
        let bytes: Uint8Array | undefined;
        if (input.content !== undefined) {
          try {
            bytes = await input.content(ref);
          } catch {
            bytes = undefined;
          }
        }
        // Fail closed: never write bytes that do not match the recorded address.
        if (bytes === undefined || !(bytes instanceof Uint8Array) || proofContentDigestOfBytes(bytes) !== ref.contentDigest) continue;
        const dir = join(bundleDir, "sources", safePathSegment(ref.sourceId));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${ref.revision}-${ref.contentDigest}`), bytes);
      }
      return materializeDisclosureExportReceipt({
        bundleDigest: bundle.bundleDigest,
        purpose: bundle.purpose,
        audienceLabel: bundle.audienceLabel,
        exportedAt: new Date().toISOString(),
        exporterId: LOCAL_DISCLOSURE_EXPORTER_ID,
      });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Disclosure service
 * ------------------------------------------------------------------ */

export type DisclosureExportOutcome =
  | { readonly status: "exported"; readonly receipt: DisclosureExportReceipt }
  | { readonly status: "blocked"; readonly reason: string }
  | { readonly status: "capability_required"; readonly capability: string };

export interface DisclosureService {
  preview(request: DisclosureRequest): Promise<DisclosurePreview>;
  approveAndExport(input: { readonly previewId: string }): Promise<DisclosureExportOutcome>;
  history(): Promise<readonly DisclosureExportReceipt[]>;
}

export interface DisclosureServiceDeps {
  readonly proof: ProofEvidenceService;
  readonly exporter?: LocalDisclosureExporter | undefined;
  readonly admission?: DisclosureAdmissionPort | undefined;
  readonly content?: ProofSourceContentPort | undefined;
  readonly clock?: (() => string) | undefined;
}

interface DisclosureClosure {
  readonly claims: readonly ProofAssetView[];
  readonly requiredDependencyIds: readonly string[];
  readonly excludedBySelection: readonly string[];
}

export function makeDisclosureService(deps: DisclosureServiceDeps): DisclosureService {
  const clock = deps.clock ?? (() => new Date().toISOString());
  // Per-service cache only; the proof chain is the source of truth for previews and
  // receipts (see `deps.proof.recordDisclosurePreview/recordDisclosureReceipt`).
  const previews = new Map<string, DisclosurePreview>();

  async function collectClosure(requestedIds: readonly string[]): Promise<DisclosureClosure> {
    const included = new Map<string, ProofAssetView>();
    const excluded = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [...requestedIds];
    const requestedSet = new Set(requestedIds);
    while (queue.length > 0) {
      const claimId = queue.shift() as string;
      if (visited.has(claimId)) continue;
      visited.add(claimId);
      let view: ProofAssetView;
      try {
        view = await deps.proof.proofAssetView(claimId);
      } catch {
        // Not published / not readable on the proof plane → explicitly excluded, by id.
        excluded.add(claimId);
        continue;
      }
      included.set(claimId, view);
      for (const dependency of view.dependencies) {
        if (!visited.has(dependency.claimId)) queue.push(dependency.claimId);
      }
    }
    const claims = [...included.values()].sort((a, b) => compareStrings(a.claimRef.claimId, b.claimRef.claimId));
    const requiredDependencyIds = claims
      .map((view) => view.claimRef.claimId)
      .filter((claimId) => !requestedSet.has(claimId))
      .sort(compareStrings);
    return Object.freeze({ claims: Object.freeze(claims), requiredDependencyIds: Object.freeze(requiredDependencyIds), excludedBySelection: Object.freeze([...excluded].sort(compareStrings)) });
  }

  function evidenceOfViews(views: readonly ProofAssetView[]): readonly EvidenceItem[] {
    const byId = new Map<string, EvidenceItem>();
    for (const view of views) {
      for (const item of view.supportingEvidence) byId.set(item.evidenceId, item);
      for (const item of view.contradictingEvidence) byId.set(item.evidenceId, item);
    }
    return Object.freeze([...byId.values()].sort((a, b) => compareStrings(a.evidenceId, b.evidenceId)));
  }

  function sourceRevisionRefsOf(views: readonly ProofAssetView[], evidence: readonly EvidenceItem[]): readonly ProofSourceRevisionRef[] {
    const byKey = new Map<string, ProofSourceRevisionRef>();
    for (const view of views) for (const ref of view.sourceRevisions) byKey.set(sourceRevisionKey(ref), ref);
    for (const item of evidence) byKey.set(sourceRevisionKey(item.sourceRevision), item.sourceRevision);
    return Object.freeze(
      [...byKey.values()].sort((a, b) => compareStrings(sourceRevisionKey(a), sourceRevisionKey(b))),
    );
  }

  async function publishedClaimsFor(claimIds: readonly string[]): Promise<ReadonlyMap<string, PublishedProofClaim>> {
    const wanted = new Set(claimIds);
    const byId = new Map<string, PublishedProofClaim>();
    const events = await deps.proof.replay();
    for (const event of events) {
      if (event.type !== "CLAIM_PUBLISHED") continue;
      const payload = proofObject(event.payload, "CLAIM_PUBLISHED");
      const raw = payload.claim;
      if (raw === undefined) continue;
      const claim = parsePublishedProofClaim(raw);
      if (wanted.has(claim.claimRef.claimId)) byId.set(claim.claimRef.claimId, claim);
    }
    return byId;
  }

  async function preview(request: DisclosureRequest): Promise<DisclosurePreview> {
    const purpose = proofNonEmpty(request.purpose, "DisclosureRequest.purpose");
    const audienceLabel = proofNonEmpty(request.audienceLabel, "DisclosureRequest.audienceLabel");
    const requestedIds = stableIdArray(request.requestedClaimIds, "DisclosureRequest.requestedClaimIds");
    const closure = await collectClosure(requestedIds);
    const evidence = evidenceOfViews(closure.claims);
    const wholeSource = evidence.some((item) => item.selector.kind === "WHOLE_SOURCE");
    const warnings: string[] = [];
    for (const claimId of closure.excludedBySelection) {
      warnings.push(`claim "${claimId}" could not be included (not published on the proof plane) and was excluded by selection`);
    }
    for (const view of closure.claims) {
      if (view.freshness !== "fresh") {
        warnings.push(`claim "${view.claimRef.claimId}" has freshness "${view.freshness}": ${view.freshnessExplanation}`);
      }
    }
    const materialized = materializeDisclosurePreview({
      purpose,
      audienceLabel,
      claimIds: requestedIds,
      claims: closure.claims,
      requiredDependencyIds: closure.requiredDependencyIds,
      evidenceRefs: evidence.map((item) => Object.freeze({ evidenceId: item.evidenceId })),
      sourceRevisionRefs: sourceRevisionRefsOf(closure.claims, evidence),
      wholeSourceWarnings: wholeSource ? [DISCLOSURE_WHOLE_SOURCE_WARNING] : [],
      warnings,
      excludedBySelection: closure.excludedBySelection,
    });
    // Durable: the preview is recorded on the proof chain (idempotent by previewId).
    await deps.proof.recordDisclosurePreview(materialized);
    previews.set(materialized.previewId, materialized);
    return materialized;
  }

  async function findPreview(previewId: string): Promise<DisclosurePreview | undefined> {
    const cached = previews.get(previewId);
    if (cached !== undefined) return cached;
    const stored = await deps.proof.disclosurePreviews();
    const found = stored.find((entry) => entry.previewId === previewId);
    if (found !== undefined) previews.set(found.previewId, found);
    return found;
  }

  async function approveAndExport(input: { readonly previewId: string }): Promise<DisclosureExportOutcome> {
    const preview = await findPreview(input.previewId);
    if (preview === undefined) {
      return Object.freeze({
        status: "blocked" as const,
        reason: `unknown disclosure preview "${input.previewId}" (no such preview is recorded on the proof plane)`,
      });
    }
    if (deps.admission === undefined) {
      return Object.freeze({ status: "capability_required" as const, capability: "proof.disclosure.admission" });
    }
    let rawOutcome: unknown;
    try {
      rawOutcome = await deps.admission.admit({ preview });
    } catch (error) {
      return Object.freeze({ status: "blocked" as const, reason: `disclosure admission failed: ${error instanceof Error ? error.message : String(error)}` });
    }
    let decision: DisclosureAdmissionDecision;
    try {
      decision = parseDisclosureAdmissionOutcome(rawOutcome).decision;
    } catch (error) {
      return Object.freeze({ status: "blocked" as const, reason: `disclosure admission returned an invalid outcome: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (decision !== "APPROVE") {
      return Object.freeze({ status: "blocked" as const, reason: `disclosure admission decided ${decision}` });
    }
    if (deps.exporter === undefined) {
      return Object.freeze({ status: "capability_required" as const, capability: "proof.disclosure.exporter" });
    }

    const includedIds = preview.claims.map((view) => view.claimRef.claimId).sort(compareStrings);
    const published = await publishedClaimsFor(includedIds);
    const claimSnapshots: PublishedProofClaim[] = [];
    for (const claimId of includedIds) {
      const claim = published.get(claimId);
      if (claim === undefined) {
        return Object.freeze({ status: "blocked" as const, reason: `included claim "${claimId}" has no published claim snapshot; the disclosure bundle cannot be completed` });
      }
      claimSnapshots.push(claim);
    }
    const bundle = materializeDisclosureBundle({
      purpose: preview.purpose,
      audienceLabel: preview.audienceLabel,
      claimSnapshots,
      evidenceRefs: preview.evidenceRefs,
      sourceRevisionRefs: preview.sourceRevisionRefs,
      warnings: preview.warnings,
      createdAt: clock(),
    });

    const contentPort = deps.content;
    const content = contentPort === undefined
      ? undefined
      : (ref: ProofSourceRevisionRef): Promise<Uint8Array | undefined> =>
          contentPort.readContent({ sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest });
    const exportInput = content === undefined ? { bundle, root: "" } : { bundle, root: "", content };

    let rawReceipt: unknown;
    try {
      rawReceipt = await deps.exporter.export(exportInput);
    } catch (error) {
      return Object.freeze({ status: "blocked" as const, reason: `disclosure export failed: ${error instanceof Error ? error.message : String(error)}` });
    }
    let receipt: DisclosureExportReceipt;
    try {
      receipt = parseDisclosureExportReceipt(rawReceipt);
    } catch (error) {
      return Object.freeze({ status: "blocked" as const, reason: `the exporter returned an invalid receipt: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (receipt.bundleDigest !== bundle.bundleDigest) {
      return Object.freeze({ status: "blocked" as const, reason: "the disclosure receipt does not match the exported bundle" });
    }
    if (receipt.exporterId !== deps.exporter.exporterId) {
      return Object.freeze({ status: "blocked" as const, reason: "the disclosure receipt exporterId does not match the configured exporter" });
    }
    // Durable: the LOCAL write acknowledgement is recorded on the proof chain.
    await deps.proof.recordDisclosureReceipt(receipt);
    return Object.freeze({ status: "exported" as const, receipt });
  }

  return Object.freeze({
    preview,
    approveAndExport,
    history: async (): Promise<readonly DisclosureExportReceipt[]> => Object.freeze([...(await deps.proof.disclosureReceipts())]),
  });
}

/* ------------------------------------------------------------------ *
 * Internal strict-array helpers
 * ------------------------------------------------------------------ */

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sourceRevisionKey(ref: ProofSourceRevisionRef): string {
  return `${ref.sourceId}\u0000${ref.revision}\u0000${ref.contentDigest}`;
}

function asArray(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) proofFail("invalid_value", `${what} must be an array`);
  return value;
}

function stableIdArray(value: unknown, what: string): readonly string[] {
  const raw = asArray(value, what);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const id = proofStableId(entry, `${what}[]`);
    if (seen.has(id)) proofFail("invalid_value", `${what}: duplicate "${id}"`);
    seen.add(id);
    out.push(id);
  }
  return Object.freeze(out.sort(compareStrings));
}

function stringArray(value: unknown, what: string): readonly string[] {
  const raw = asArray(value, what);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const text = proofNonEmpty(entry, `${what}[]`);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return Object.freeze(out.sort(compareStrings));
}

function evidenceRefArray(value: unknown, what: string): readonly DisclosureEvidenceRef[] {
  const raw = asArray(value, what);
  const seen = new Set<string>();
  const out: DisclosureEvidenceRef[] = [];
  for (const entry of raw) {
    const object = proofObject(entry, `${what}[]`);
    proofKeys(object, ["evidenceId"], ["evidenceId"], `${what}[]`);
    const evidenceId = proofStableId(object.evidenceId, `${what}[].evidenceId`);
    if (seen.has(evidenceId)) proofFail("invalid_value", `${what}: duplicate "${evidenceId}"`);
    seen.add(evidenceId);
    out.push(Object.freeze({ evidenceId }));
  }
  return Object.freeze(out.sort((a, b) => compareStrings(a.evidenceId, b.evidenceId)));
}

function sourceRevisionRefArray(value: unknown, what: string): readonly ProofSourceRevisionRef[] {
  const raw = asArray(value, what);
  const seen = new Set<string>();
  const out: ProofSourceRevisionRef[] = [];
  for (const entry of raw) {
    const ref = parseProofSourceRevisionRef(entry, `${what}[]`);
    const key = sourceRevisionKey(ref);
    if (seen.has(key)) proofFail("invalid_value", `${what}: duplicate source revision "${ref.sourceId}@${ref.revision}"`);
    seen.add(key);
    out.push(ref);
  }
  return Object.freeze(out.sort((a, b) => compareStrings(sourceRevisionKey(a), sourceRevisionKey(b))));
}

function assetViewArray(value: unknown, what: string): readonly ProofAssetView[] {
  const raw = asArray(value, what);
  const seen = new Set<string>();
  const out: ProofAssetView[] = [];
  for (const entry of raw) {
    const view = parseProofAssetView(entry, `${what}[]`);
    const claimId = view.claimRef.claimId;
    if (seen.has(claimId)) proofFail("invalid_value", `${what}: duplicate claim "${claimId}"`);
    seen.add(claimId);
    out.push(view);
  }
  return Object.freeze(out.sort((a, b) => compareStrings(a.claimRef.claimId, b.claimRef.claimId)));
}

function publishedClaimArray(value: unknown, what: string): readonly PublishedProofClaim[] {
  const raw = asArray(value, what);
  const seen = new Set<string>();
  const out: PublishedProofClaim[] = [];
  for (const entry of raw) {
    const claim = parsePublishedProofClaim(entry, `${what}[]`);
    const claimId = claim.claimRef.claimId;
    if (seen.has(claimId)) proofFail("invalid_value", `${what}: duplicate claim "${claimId}"`);
    seen.add(claimId);
    out.push(claim);
  }
  return Object.freeze(out.sort((a, b) => compareStrings(a.claimRef.claimId, b.claimRef.claimId)));
}
