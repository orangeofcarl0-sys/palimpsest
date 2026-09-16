/**
 * G10-AE §7 — `ExternalAssetLibraryRegistry`: versioned deployment CONFIG.
 *
 *   Registry != AssetTruth      Registry != Ownership
 *   Registry != ProjectContext  Registry != Applicability
 *
 * The registry answers exactly two questions — WHICH providers exist and what
 * each one declares — and hands back the read (and, separately, the write) port.
 * It owns no asset, no content and no project state, and it is never consulted
 * automatically: a caller must name a provider.
 */

import { eaCompareText, eaFail, eaStableId } from "./refs.js";
import {
  parseExternalAssetProviderDefinition,
  providerSupports,
  type ExternalAssetLibraryReadPort,
  type ExternalAssetProviderDefinition,
} from "./provider.js";
import type {
  ExternalAssetPublicationPort,
  ExternalAssetPublicationSemantics,
} from "./publication.js";

/**
 * ONE provider entry: its READ port, and — as a SEPARATE write capability (§23) —
 * its publication port when the provider declares `PUBLISH`.
 */
export interface ExternalAssetLibraryProvider {
  readonly read: ExternalAssetLibraryReadPort;
  readonly publication?: ExternalAssetPublicationPort | undefined;
}

/**
 * §7: `ExternalAssetLibraryRegistry { get, list }`.
 * Absent provider ⇒ `undefined` (never a stub, never a default provider).
 */
export interface ExternalAssetLibraryRegistry {
  get(providerId: string): ExternalAssetLibraryProvider | undefined;
  list(): readonly ExternalAssetLibraryProvider[];
}

/**
 * Validate and index providers as deployment config. Fails closed on:
 *  - a duplicate provider id (two configurations for one identity);
 *  - a publication port whose provider id or definition digest disagrees with
 *    the read port (the write capability must belong to the SAME versioned
 *    definition — otherwise the effect input's `providerDefinitionDigest` would
 *    not bind the thing that actually wrote).
 */
export function externalAssetLibraryRegistryOf(
  providers: readonly ExternalAssetLibraryProvider[],
): ExternalAssetLibraryRegistry {
  const byId = new Map<string, ExternalAssetLibraryProvider>();
  for (const provider of providers) {
    const definition = parseExternalAssetProviderDefinition(
      provider.read.definition,
      "provider definition",
    );
    if (byId.has(definition.providerId)) {
      eaFail("invalid_value", `provider "${definition.providerId}" is configured more than once`);
    }
    const publication = provider.publication;
    if (publication !== undefined) {
      const publicationDefinition = parseExternalAssetProviderDefinition(
        publication.definition,
        `provider "${definition.providerId}" publication definition`,
      );
      if (publicationDefinition.providerId !== definition.providerId) {
        eaFail(
          "invalid_value",
          `provider "${definition.providerId}" publication port belongs to "${publicationDefinition.providerId}"`,
        );
      }
      if (publicationDefinition.digest !== definition.digest) {
        eaFail(
          "invalid_value",
          `provider "${definition.providerId}" read and publication definitions disagree`,
        );
      }
      if (!providerSupports(definition, "PUBLISH")) {
        eaFail(
          "invalid_value",
          `provider "${definition.providerId}" exposes a publication port but does not declare the PUBLISH capability`,
        );
      }
      if (
        publication.semantics !== "IDEMPOTENT_BY_PUBLICATION_ID" &&
        publication.reconcile === undefined
      ) {
        // §23: a provider that is neither idempotent by publicationId nor
        // reconcilable could never resolve an uncertain attempt, so this
        // configuration is refused instead of enabling a blind retry.
        eaFail(
          "invalid_value",
          `provider "${definition.providerId}" declares ${publication.semantics} but exposes no publication reconcile probe`,
        );
      }
    }
    byId.set(
      definition.providerId,
      Object.freeze({ read: provider.read, ...(publication === undefined ? {} : { publication }) }),
    );
  }
  const ordered = Object.freeze(
    [...byId.keys()].sort(eaCompareText).map((providerId) => byId.get(providerId)!),
  );
  return Object.freeze({
    get: (providerId: string): ExternalAssetLibraryProvider | undefined => {
      const normalized = normalizeProviderId(providerId);
      return normalized === undefined ? undefined : byId.get(normalized);
    },
    list: (): readonly ExternalAssetLibraryProvider[] => ordered,
  });
}

function normalizeProviderId(providerId: string): string | undefined {
  try {
    return eaStableId(providerId, "providerId");
  } catch {
    return undefined;
  }
}

/** An EMPTY registry: the honest "this deployment has no external library". */
export function emptyExternalAssetLibraryRegistry(): ExternalAssetLibraryRegistry {
  return externalAssetLibraryRegistryOf([]);
}

/* ------------------------------------------------------------------ *
 * Agent/operator-facing provider description (config only, grants nothing)
 * ------------------------------------------------------------------ */

export interface ExternalAssetProviderDescriptor {
  readonly definition: ExternalAssetProviderDefinition;
  readonly search: boolean;
  readonly inspect: boolean;
  readonly materializeText: boolean;
  readonly publish: boolean;
  readonly publicationSemantics?: ExternalAssetPublicationSemantics | undefined;
}

export function externalAssetProviderDescriptors(
  registry: ExternalAssetLibraryRegistry,
): readonly ExternalAssetProviderDescriptor[] {
  return Object.freeze(
    registry.list().map((provider) => {
      const definition = provider.read.definition;
      const publication = provider.publication;
      return Object.freeze({
        definition,
        search: providerSupports(definition, "SEARCH"),
        inspect: providerSupports(definition, "INSPECT"),
        materializeText: providerSupports(definition, "MATERIALIZE_TEXT"),
        publish: providerSupports(definition, "PUBLISH"),
        ...(publication === undefined ? {} : { publicationSemantics: publication.semantics }),
      });
    }),
  );
}

/** Look up a provider or fail with the typed `unknown_provider` error. */
export function requireExternalAssetProvider(
  registry: ExternalAssetLibraryRegistry,
  providerId: string,
): ExternalAssetLibraryProvider {
  const provider = registry.get(providerId);
  if (provider === undefined) {
    eaFail("unknown_provider", `external provider "${providerId}" is not configured`);
  }
  return provider;
}
