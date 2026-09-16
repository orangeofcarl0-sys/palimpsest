/**
 * G10-AE §12/§26 — the DERIVED, read-only external view.
 *
 *   ProviderUnavailable != AssetFalse     ExternalLatest != ReferencedRevision
 *   View != Truth                         Association != Ownership
 *
 *   - a missing provider leaves the association ALONE and reports
 *     `PROVIDER_UNAVAILABLE`; it never deletes or rewrites anything;
 *   - a newer provider revision is merely SURFACED (`newerRevisionAvailable`
 *     plus a digest hint) — the referenced digest stays what it was;
 *   - a referenced digest that the provider can no longer resolve reports
 *     `REVISION_UNAVAILABLE` instead of silently answering with the latest;
 *   - a fetched title/asset type is DERIVED output, never persisted as project
 *     truth unless the caller explicitly imports it.
 *
 * This module only READS. It owns no store, performs no write and cannot mutate
 * a project, a provider or an association.
 */

import { eaCompareText } from "./refs.js";
import {
  parseExternalAssetInspection,
  parseExternalAssetLatestRevision,
  type ExternalAssetInspectRequest,
} from "./provider.js";
import type { ExternalAssetLibraryRegistry } from "./registry.js";
import type { ProjectAssetAssociation } from "../project_workspace/association.js";

export const EXTERNAL_ASSET_RESOLUTION_STATES = [
  /** The exact referenced revision still resolves. */
  "RESOLVED",
  /** The provider is not configured/reachable: the association REMAINS. */
  "PROVIDER_UNAVAILABLE",
  /** The provider answered, but not for the referenced revision. */
  "REVISION_UNAVAILABLE",
] as const;
export type ExternalAssetResolutionState = (typeof EXTERNAL_ASSET_RESOLUTION_STATES)[number];

export interface ExternalAssetResolutionView {
  readonly associationId: string;
  readonly providerId: string;
  readonly assetId: string;
  readonly referencedDigest: string;
  /** The derivable exact-revision identity (`provider/asset@digest`). */
  readonly stableRefKey: string;
  readonly associationKind: string;
  readonly recordedAt: string;
  readonly providerAvailable: boolean;
  readonly resolution: ExternalAssetResolutionState;
  /** Derived, read-only description. Never persisted by this module. */
  readonly assetType?: string | undefined;
  readonly title?: string | undefined;
  readonly sourceLocator?: string | undefined;
  /** True when the provider currently holds a DIFFERENT revision of this asset. */
  readonly newerRevisionAvailable?: boolean | undefined;
  readonly latestDigestHint?: string | undefined;
  readonly latestRevisionLabel?: string | undefined;
  readonly detail?: string | undefined;
}

export interface ExternalAssetDerivedView {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly external: readonly ExternalAssetResolutionView[];
  readonly providerAvailability: Readonly<Record<string, boolean>>;
  readonly warnings: readonly string[];
}

export interface ExternalAssetResolutionInput {
  readonly projectId: string;
  readonly associations: readonly ProjectAssetAssociation[];
  readonly registry: ExternalAssetLibraryRegistry;
}

/**
 * Derive the external view for ONE project. Pure with respect to Palimpsest: it
 * reads the project's EXISTING associations and asks the providers (read-only)
 * what they currently hold.
 */
export async function resolveExternalAssetView(
  input: ExternalAssetResolutionInput,
): Promise<ExternalAssetDerivedView> {
  const external = input.associations.filter(
    (association) => association.assetKind === "EXTERNAL_ASSET",
  );
  const warnings: string[] = [];
  const providerAvailability: Record<string, boolean> = {};
  const resolved: ExternalAssetResolutionView[] = [];

  for (const association of external) {
    const providerId = association.canonicalRef.kind;
    const assetId = association.canonicalRef.id;
    const referencedDigest = association.canonicalRef.digest;
    if (referencedDigest === undefined) {
      // §6/§10: a durable external association ALWAYS carries the digest. One
      // that does not is reported, never "completed" by guessing.
      warnings.push(
        `external association ${association.associationId} carries no content digest and cannot be resolved`,
      );
      continue;
    }
    const provider = input.registry.get(providerId);
    if (provider === undefined) {
      providerAvailability[providerId] = false;
      resolved.push(
        Object.freeze({
          associationId: association.associationId,
          providerId,
          assetId,
          referencedDigest,
          stableRefKey: `${providerId}/${assetId}@${referencedDigest}`,
          associationKind: association.associationKind,
          recordedAt: association.recordedAt,
          providerAvailable: false,
          // §12: the association REMAINS; only its resolution says unavailable.
          resolution: "PROVIDER_UNAVAILABLE" as const,
          detail: `external provider "${providerId}" is not configured in this deployment`,
        }),
      );
      continue;
    }
    providerAvailability[providerId] = true;
    const inspection = await inspectSafely(provider.read, {
      providerId,
      assetId,
      contentDigest: referencedDigest,
    });
    if (inspection.status === "UNAVAILABLE") {
      providerAvailability[providerId] = inspection.reason !== "provider_unavailable";
      resolved.push(
        Object.freeze({
          associationId: association.associationId,
          providerId,
          assetId,
          referencedDigest,
          stableRefKey: `${providerId}/${assetId}@${referencedDigest}`,
          associationKind: association.associationKind,
          recordedAt: association.recordedAt,
          providerAvailable: inspection.reason !== "provider_unavailable",
          resolution: "REVISION_UNAVAILABLE" as const,
          detail: inspection.detail,
        }),
      );
      continue;
    }
    const snapshot = inspection.snapshot;
    const latest = await latestRevisionSafely(provider.read, assetId);
    const newerRevisionAvailable =
      latest === undefined ? undefined : latest.contentDigest !== referencedDigest;
    if (latest === undefined && provider.read.latestRevision !== undefined) {
      warnings.push(
        `external provider "${providerId}" did not answer the latest-revision probe for asset "${assetId}"`,
      );
    }
    resolved.push(
      Object.freeze({
        associationId: association.associationId,
        providerId,
        assetId,
        referencedDigest,
        stableRefKey: `${providerId}/${assetId}@${referencedDigest}`,
        associationKind: association.associationKind,
        recordedAt: association.recordedAt,
        providerAvailable: true,
        resolution: "RESOLVED" as const,
        assetType: snapshot.assetType,
        title: snapshot.title,
        ...(snapshot.sourceLocator === undefined ? {} : { sourceLocator: snapshot.sourceLocator }),
        // §12: surfaced, never adopted.
        ...(newerRevisionAvailable === undefined ? {} : { newerRevisionAvailable }),
        ...(newerRevisionAvailable === true && latest !== undefined
          ? {
              latestDigestHint: latest.contentDigest,
              ...(latest.revisionLabel === undefined
                ? {}
                : { latestRevisionLabel: latest.revisionLabel }),
            }
          : {}),
      }),
    );
  }

  const byProviderHint = Object.keys(providerAvailability).length > 0;
  if (!byProviderHint && external.length === 0) {
    warnings.push("no external asset association is recorded for this project");
  }
  if (input.registry.list().length === 0) {
    warnings.push("no external asset provider is configured: external references cannot be resolved");
  }

  resolved.sort((a, b) =>
    a.associationId === b.associationId
      ? eaCompareText(a.assetId, b.assetId)
      : eaCompareText(a.associationId, b.associationId),
  );
  warnings.sort(eaCompareText);
  const availability: Record<string, boolean> = {};
  for (const key of Object.keys(providerAvailability).sort(eaCompareText)) {
    availability[key] = providerAvailability[key]!;
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: input.projectId,
    external: Object.freeze(resolved),
    providerAvailability: Object.freeze(availability),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}

async function inspectSafely(
  port: { inspect(request: ExternalAssetInspectRequest): Promise<unknown> },
  request: ExternalAssetInspectRequest,
): Promise<ReturnType<typeof parseExternalAssetInspection>> {
  try {
    const inspection = parseExternalAssetInspection(await port.inspect(request));
    if (
      inspection.status === "AVAILABLE" &&
      request.contentDigest !== undefined &&
      inspection.snapshot.ref.contentDigest !== request.contentDigest
    ) {
      // §9/§12: a provider that answers a DIFFERENT revision (e.g. the latest) for
      // an exact-digest request is reported as unavailable, never adopted.
      return Object.freeze({
        status: "UNAVAILABLE" as const,
        providerId: request.providerId,
        assetId: request.assetId,
        requestedDigest: request.contentDigest,
        reason: "requested_digest_mismatch" as const,
        detail: `the provider answered for digest ${inspection.snapshot.ref.contentDigest}, not the referenced ${request.contentDigest}`,
      });
    }
    return inspection;
  } catch (error) {
    // A provider that cannot answer is UNAVAILABLE, never "the asset is false".
    return Object.freeze({
      status: "UNAVAILABLE" as const,
      providerId: request.providerId,
      assetId: request.assetId,
      ...(request.contentDigest === undefined ? {} : { requestedDigest: request.contentDigest }),
      reason: "provider_unavailable" as const,
      detail: `external provider did not answer the exact-digest inspection: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function latestRevisionSafely(
  port: { latestRevision?(assetId: string): Promise<unknown> },
  assetId: string,
): Promise<ReturnType<typeof parseExternalAssetLatestRevision> | undefined> {
  if (port.latestRevision === undefined) return undefined;
  try {
    const raw = await port.latestRevision(assetId);
    return raw === undefined ? undefined : parseExternalAssetLatestRevision(raw);
  } catch {
    return undefined;
  }
}
