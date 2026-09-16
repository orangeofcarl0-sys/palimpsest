/**
 * G10-AE §22 — publication runs through the GOVERNED external-effect path.
 *
 *   PublicationPreview != Publication     PublicationReceipt != Truth
 *   Publication != an ungoverned HTTP call
 *
 * `palimpsest.external_asset.publish` is a Safe Action on the shared Ordarium
 * ledger, modelled on `palimpsest.git.promote` in `src/effects/actions.ts`:
 * a `reconcilable` profile with a DURABLE operation-key idempotency window plus a
 * `reconcile` hook. The operation key is derived from
 * `(projectId, providerId, publicationId)`, so a retry after a crash maps to the
 * SAME Ordarium operation: the runtime returns the recorded success instead of
 * re-executing, and an uncertain attempt is reconciled against the provider
 * rather than blind-retried.
 *
 * The input binds EXACTLY the eight fields §22 names. The hand-written parser
 * rejects any additional field, so no caller field can differ from the approved
 * preview. The body that leaves is RE-DERIVED from the local Journal entry
 * inside the effect and re-checked against `payloadDigest`: if the approved
 * preview and the local entry ever disagree, the provider is never called.
 *
 * This action never writes Project state, never admits Evidence and never grants
 * truth: its only output is the provider's exact `ExternalAssetStableRef`.
 */

import { defineAction, effects, type JsonValue, type ReconcileResult } from "@ordarium/core";

import type { ProjectJournalEntry } from "../project_workspace/journal.js";

import {
  materializeExternalAssetStableRef,
  parseExternalAssetStableRef,
  type ExternalAssetStableRef,
} from "./refs.js";
import {
  externalAssetOutboundPayloadDigestOf,
  externalAssetOutboundPayloadOf,
  parseExternalAssetPublicationOutcome,
  parseExternalAssetPublicationReconciliation,
  type ExternalAssetPublicationPort,
  type ExternalAssetPublicationRequest,
  type ExternalAssetPublicationReconciliation,
} from "./publication.js";

export const EXTERNAL_ASSET_PUBLISH_ACTION_NAME = "palimpsest.external_asset.publish";

/** §22 — the effect input binds exactly these fields, and no others. */
export const EXTERNAL_ASSET_PUBLISH_INPUT_FIELDS = [
  "publicationId",
  "providerId",
  "providerDefinitionDigest",
  "projectId",
  "journalEntryId",
  "journalEntryDigest",
  "targetAssetType",
  "payloadDigest",
] as const;

export interface ExternalAssetPublishEffectInput extends Record<string, JsonValue> {
  publicationId: string;
  providerId: string;
  providerDefinitionDigest: string;
  projectId: string;
  journalEntryId: string;
  journalEntryDigest: string;
  targetAssetType: string;
  payloadDigest: string;
}

export interface ExternalAssetPublishEffectOutput extends Record<string, JsonValue> {
  providerId: string;
  assetId: string;
  contentDigest: string;
  revisionLabel: string | null;
  refDigest: string;
}

/** The read-only local source of a publication (satisfied by `ExternalAssetJournalPort`). */
export interface ExternalAssetPublicationEffectJournalPort {
  read(projectId: string, entryId: string): Promise<ProjectJournalEntry | undefined>;
}

export interface ExternalAssetEffectsDeps {
  /** Resolve the provider's SEPARATE write capability. An absent provider fails closed. */
  publicationPort(providerId: string): ExternalAssetPublicationPort | undefined;
  /** Read-only access to the LOCAL journal entry being published. */
  journal: ExternalAssetPublicationEffectJournalPort;
}

type JsonRecord = Record<string, JsonValue>;

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}

function exactStringFields(input: unknown, expected: readonly string[]): JsonRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      // §22: the effect input may not carry a caller field the preview never bound.
      throw new TypeError(`unexpected field "${key}"`);
    }
  }
  const result: JsonRecord = {};
  for (const key of expected) {
    if (typeof record[key] !== "string") throw new TypeError(`${key} must be a string`);
    result[key] = record[key];
  }
  return result;
}

function outputOf(ref: ExternalAssetStableRef): ExternalAssetPublishEffectOutput {
  return {
    providerId: ref.providerId,
    assetId: ref.assetId,
    contentDigest: ref.contentDigest,
    revisionLabel: ref.revisionLabel ?? null,
    refDigest: ref.refDigest,
  };
}

/** Reconstruct the provider's exact stable ref from the action output, fail closed. */
export function externalAssetStableRefFromPublishOutput(
  output: ExternalAssetPublishEffectOutput,
): ExternalAssetStableRef {
  const ref = materializeExternalAssetStableRef({
    providerId: output.providerId,
    assetId: output.assetId,
    contentDigest: output.contentDigest,
    ...(output.revisionLabel === null ? {} : { revisionLabel: output.revisionLabel }),
  });
  if (ref.refDigest !== output.refDigest) {
    throw new TypeError("the provider returned an inconsistent external stable ref");
  }
  return ref;
}

export function defineExternalAssetEffects(deps: ExternalAssetEffectsDeps) {
  function portFor(providerId: string, providerDefinitionDigest: string): ExternalAssetPublicationPort {
    const port = deps.publicationPort(providerId);
    if (port === undefined) {
      throw new TypeError(`external provider "${providerId}" has no publication capability`);
    }
    if (port.definition.digest !== providerDefinitionDigest) {
      // The approved preview named a SPECIFIC provider definition version.
      throw new TypeError(
        `external provider "${providerId}" definition changed since the publication preview was approved`,
      );
    }
    return port;
  }

  async function outboundRequest(input: ExternalAssetPublishEffectInput): Promise<{
    readonly port: ExternalAssetPublicationPort;
    readonly request: ExternalAssetPublicationRequest;
  }> {
    const port = portFor(input.providerId, input.providerDefinitionDigest);
    const entry = await deps.journal.read(input.projectId, input.journalEntryId);
    if (entry === undefined) {
      throw new TypeError(
        `journal entry "${input.journalEntryId}" is not recorded in project "${input.projectId}"`,
      );
    }
    if (entry.digest !== input.journalEntryDigest) {
      throw new TypeError(
        `journal entry "${input.journalEntryId}" no longer matches the approved publication preview`,
      );
    }
    const payload = externalAssetOutboundPayloadOf({
      providerId: input.providerId,
      providerDefinitionDigest: input.providerDefinitionDigest,
      targetAssetType: input.targetAssetType,
      entry,
    });
    if (externalAssetOutboundPayloadDigestOf(payload) !== input.payloadDigest) {
      throw new TypeError(
        "the outbound payload does not match the digest the publication preview was approved for",
      );
    }
    return {
      port,
      request: Object.freeze({
        publicationId: input.publicationId,
        providerDefinitionDigest: input.providerDefinitionDigest,
        journalEntryId: payload.journalEntryId,
        journalEntryDigest: payload.journalEntryDigest,
        targetAssetType: input.targetAssetType,
        payloadDigest: input.payloadDigest,
        title: payload.title,
        body: payload.body,
        metadata: payload.metadata,
      }),
    };
  }

  const publishExternalAsset = defineAction({
    name: EXTERNAL_ASSET_PUBLISH_ACTION_NAME,
    version: "1",
    description:
      "Publish ONE explicitly approved project journal entry to an external asset library",
    input: {
      jsonSchema: objectSchema(
        {
          publicationId: { type: "string" },
          providerId: { type: "string" },
          providerDefinitionDigest: { type: "string" },
          projectId: { type: "string" },
          journalEntryId: { type: "string" },
          journalEntryDigest: { type: "string" },
          targetAssetType: { type: "string" },
          payloadDigest: { type: "string" },
        },
        EXTERNAL_ASSET_PUBLISH_INPUT_FIELDS,
      ) as Record<string, JsonValue>,
      parse: (input) =>
        exactStringFields(input, EXTERNAL_ASSET_PUBLISH_INPUT_FIELDS) as unknown as ExternalAssetPublishEffectInput,
    },
    output: {
      jsonSchema: objectSchema(
        {
          providerId: { type: "string" },
          assetId: { type: "string" },
          contentDigest: { type: "string" },
          revisionLabel: { type: ["string", "null"] },
          refDigest: { type: "string" },
        },
        ["providerId", "assetId", "contentDigest", "revisionLabel", "refDigest"],
      ) as Record<string, JsonValue>,
      parse: (input) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          throw new TypeError("output must be an object");
        }
        const raw = input as Record<string, unknown>;
        const allowed = ["providerId", "assetId", "contentDigest", "revisionLabel", "refDigest"];
        for (const key of Object.keys(raw)) {
          if (!allowed.includes(key)) throw new TypeError(`unexpected output field "${key}"`);
        }
        for (const key of ["providerId", "assetId", "contentDigest", "refDigest"]) {
          if (typeof raw[key] !== "string") throw new TypeError(`${key} must be a string`);
        }
        const revisionLabel = raw.revisionLabel ?? null;
        if (revisionLabel !== null && typeof revisionLabel !== "string") {
          throw new TypeError("revisionLabel must be a string or null");
        }
        const ref = parseExternalAssetStableRef(
          {
            schemaVersion: 1,
            providerId: raw.providerId,
            assetId: raw.assetId,
            contentDigest: raw.contentDigest,
            refDigest: raw.refDigest,
            ...(revisionLabel === null ? {} : { revisionLabel }),
          },
          "external publish output ref",
        );
        return outputOf(ref);
      },
    },
    effect: effects.reconcilable({ idempotencyWindow: { kind: "durable" }, cancellable: false }),
    // The operation key: a retry with the same publication is the SAME operation.
    key: (input) => `${input.projectId}\u0000${input.providerId}\u0000${input.publicationId}`,
    async execute(input): Promise<ExternalAssetPublishEffectOutput> {
      const { port, request } = await outboundRequest(input);
      const outcome = parseExternalAssetPublicationOutcome(await port.publish(request));
      if (outcome.status === "PUBLISHED") return outputOf(outcome.ref);
      if (outcome.status === "FAILED") {
        throw new TypeError(`the external provider rejected the publication: ${outcome.reason}`);
      }
      throw new TypeError(`the external publication outcome is uncertain: ${outcome.detail}`);
    },
    async reconcile(
      input,
    ): Promise<ReconcileResult<ExternalAssetPublishEffectOutput>> {
      // Re-derive the payload binding WITHOUT calling the provider's write path.
      const port = deps.publicationPort(input.providerId);
      if (port === undefined) return { status: "unknown" };
      if (port.semantics === "IDEMPOTENT_BY_PUBLICATION_ID") {
        // The provider deduplicates by `publicationId`, so re-executing cannot
        // create a second asset; report authoritative absence and let the
        // runtime retry the SAME operation key.
        return { status: "absent", retrySafe: true };
      }
      if (port.reconcile === undefined) {
        // A non-idempotent provider without an outcome probe can never be
        // blind-retried: the outcome stays uncertain.
        return { status: "unknown" };
      }
      let raw: unknown;
      try {
        raw = await port.reconcile({
          publicationId: input.publicationId,
          providerDefinitionDigest: input.providerDefinitionDigest,
          payloadDigest: input.payloadDigest,
        });
      } catch {
        return { status: "unknown" };
      }
      if (raw === undefined) return { status: "absent", retrySafe: true };
      const reconciled: ExternalAssetPublicationReconciliation =
        parseExternalAssetPublicationReconciliation(raw);
      if (reconciled.status === "PUBLISHED") {
        return { status: "succeeded", value: outputOf(reconciled.ref) };
      }
      if (reconciled.status === "ABSENT_RETRY_SAFE") return { status: "absent", retrySafe: true };
      return { status: "unknown" };
    },
  });

  return { publishExternalAsset };
}

export type ExternalAssetEffects = ReturnType<typeof defineExternalAssetEffects>;

/**
 * Read-only classification of an uncertain publication, used by the SERVICE to
 * decide whether a caught effect failure left an external asset behind. It never
 * performs a write and never retries blindly.
 */
export async function probeExternalPublication(input: {
  readonly port: ExternalAssetPublicationPort;
  readonly publicationId: string;
  readonly providerDefinitionDigest: string;
  readonly payloadDigest: string;
}): Promise<ExternalAssetPublicationReconciliation> {
  if (input.port.reconcile === undefined) {
    return Object.freeze({
      status: "UNKNOWN" as const,
      detail: `provider "${input.port.definition.providerId}" exposes no publication outcome probe`,
    });
  }
  try {
    const raw = await input.port.reconcile({
      publicationId: input.publicationId,
      providerDefinitionDigest: input.providerDefinitionDigest,
      payloadDigest: input.payloadDigest,
    });
    if (raw === undefined) return Object.freeze({ status: "ABSENT_RETRY_SAFE" as const });
    return parseExternalAssetPublicationReconciliation(raw);
  } catch (error) {
    return Object.freeze({
      status: "UNKNOWN" as const,
      detail: `publication outcome probe failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
