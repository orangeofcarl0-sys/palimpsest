/**
 * ============================================================================
 * TEST-ONLY FIXTURE — an INDEPENDENT external asset library.
 * ============================================================================
 *
 * This file is a TEST FIXTURE, not product code. It must NOT become a shipped
 * Personal Asset store, a global memory, a knowledge graph or an "external truth
 * store" inside Palimpsest: it exists so the G10-AE dogfood can exercise an
 * external owner that Palimpsest does NOT implement.
 *
 * It stands in for a separately-owned reusable-knowledge system (a future
 * Personal Intellectual Asset System, Zotero, GitHub, an institutional KB, …)
 * and it owns its OWN sqlite database — a DIFFERENT file from the project's
 * association/journal stores and from the Ordarium ledger. It implements:
 *
 *   - SEARCH               (ephemeral ranked hits + a latest-digest HINT)
 *   - INSPECT              (EXACT digest resolution, with revision history)
 *   - MATERIALIZE_TEXT     (bounded text + its sha256 content digest)
 *   - PUBLISH              (idempotent by publicationId AND reconcilable)
 *
 * It holds a host "credential" in memory (never in Palimpsest) so the suite can
 * prove that provider credentials never reach a persisted artifact or tool
 * output, and it can be switched into adversarial modes:
 *
 *   mode.unavailable             the provider is unreachable
 *   mode.omitStableDigest        the provider cannot expose a stable revision
 *   mode.mangleDigest            the provider answers the LATEST revision instead
 *   mode.binaryMediaType         the content is not bounded text
 *   mode.rejectPublication       the provider refuses the outbound write
 *   mode.crashAfterPublish       the process "crashes" AFTER the external success
 *   mode.leakCredentialInResponse the provider leaks its credential into a reply
 *
 * Publishing is idempotent by `publicationId` (a second publish of the same
 * publication returns the SAME external asset) and `reconcile` answers
 * authoritatively from its own database.
 */

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SimulatedProcessCrash } from "@ordarium/core";

import {
  materializeExternalAssetProviderDefinition,
  materializeExternalAssetStableRef,
  type ExternalAssetInspection,
  type ExternalAssetInspectRequest,
  type ExternalAssetLibraryReadPort,
  type ExternalAssetProviderDefinition,
  type ExternalAssetPublicationOutcome,
  type ExternalAssetPublicationPort,
  type ExternalAssetPublicationReconciliation,
  type ExternalAssetPublicationRequest,
  type ExternalAssetPublishEffectOutput,
} from "../../src/external_assets/index.js";

export const FIXTURE_PROVIDER_ID = "fixture-library";
export const FIXTURE_PROTOCOL_DIGEST = "9".repeat(64);
/** A host secret that must NEVER reach a Palimpsest artifact. */
export const FIXTURE_CREDENTIAL = "fixture-credential-do-not-persist-4f2a";

export interface FixtureModes {
  /** The provider cannot be reached at all. */
  unavailable: boolean;
  /** The provider has no stable digest/revision for its assets. */
  omitStableDigest: boolean;
  /** INSPECT answers with the LATEST revision instead of the requested digest. */
  mangleDigest: boolean;
  /** MATERIALIZE_TEXT reports a non-text media type. */
  binaryMediaType: boolean;
  /**
   * MATERIALIZE_TEXT reports the REQUESTED (genuine) digest while handing over
   * DIFFERENT text — the "substituted content carrying real external provenance"
   * attack the campaign's gate review demonstrated. A plane that only compares two
   * provider-supplied values cannot see it; one that hashes the bytes it holds can.
   */
  substituteText: boolean;
  /** PUBLISH is refused with this reason. */
  rejectPublication: string | undefined;
  /** The process "crashes" immediately AFTER the external write succeeded. */
  crashAfterPublish: boolean;
  /** The provider leaks its credential into a response object. */
  leakCredentialInResponse: boolean;
}

export interface FixtureAssetInput {
  readonly assetId: string;
  readonly assetType: string;
  readonly title: string;
  readonly body: string;
  readonly summary?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
  readonly revisionLabel?: string | undefined;
  readonly sourceLocator?: string | undefined;
  readonly searchScore?: number | undefined;
}

export interface FixtureAssetRevision {
  readonly assetId: string;
  readonly revisionSeq: number;
  readonly contentDigest: string;
  readonly title: string;
  readonly assetType: string;
}

interface AssetRow {
  asset_id: string;
  revision_seq: number;
  revision_label: string | null;
  content_digest: string;
  asset_type: string;
  title: string;
  summary: string | null;
  body: string;
  tags_json: string;
  metadata_json: string;
  source_locator: string | null;
  search_score: number | null;
}

interface PublicationRow {
  publication_id: string;
  payload_digest: string;
  asset_id: string;
  content_digest: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export class FixtureExternalLibrary {
  readonly #database: DatabaseSync;
  readonly #mode: FixtureModes = {
    unavailable: false,
    omitStableDigest: false,
    mangleDigest: false,
    binaryMediaType: false,
    substituteText: false,
    rejectPublication: undefined,
    crashAfterPublish: false,
    leakCredentialInResponse: false,
  };
  readonly #credential: string;
  readonly definition: ExternalAssetProviderDefinition;

  /** Provider call counters — the suite asserts ZERO where nothing may be called. */
  searchCalls = 0;
  inspectCalls = 0;
  materializeCalls = 0;
  publishCalls = 0;
  reconcileCalls = 0;

  constructor(
    readonly databasePath: string,
    options?: {
      readonly providerId?: string | undefined;
      readonly displayName?: string | undefined;
      readonly version?: string | undefined;
      readonly credential?: string | undefined;
    },
  ) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS fixture_assets (" +
        "asset_id TEXT NOT NULL, revision_seq INTEGER NOT NULL, revision_label TEXT, " +
        "content_digest TEXT NOT NULL, asset_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, " +
        "body TEXT NOT NULL, tags_json TEXT NOT NULL, metadata_json TEXT NOT NULL, " +
        "source_locator TEXT, search_score REAL, PRIMARY KEY (asset_id, revision_seq))",
    );
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS fixture_publications (" +
        "publication_id TEXT PRIMARY KEY, payload_digest TEXT NOT NULL, asset_id TEXT NOT NULL, " +
        "content_digest TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL)",
    );
    this.#credential = options?.credential ?? FIXTURE_CREDENTIAL;
    this.definition = materializeExternalAssetProviderDefinition({
      providerId: options?.providerId ?? FIXTURE_PROVIDER_ID,
      version: options?.version ?? "1",
      displayName: options?.displayName ?? "TEST-ONLY external asset library fixture",
      capabilities: ["SEARCH", "INSPECT", "MATERIALIZE_TEXT", "PUBLISH"],
      protocolDigest: FIXTURE_PROTOCOL_DIGEST,
    });
  }

  get mode(): FixtureModes {
    return this.#mode;
  }

  close(): void {
    this.#database.close();
  }

  /* ----- fixture-only mutations (an operator of the OTHER system) ----- */

  /** Append a NEW revision of an asset; older revisions stay exactly resolvable. */
  addRevision(input: FixtureAssetInput): FixtureAssetRevision {
    const previous = this.#database
      .prepare("SELECT MAX(revision_seq) AS max_seq FROM fixture_assets WHERE asset_id = ?")
      .get(input.assetId) as { max_seq: number | null };
    const revisionSeq = (previous.max_seq ?? 0) + 1;
    const contentDigest = sha256(input.body);
    this.#database
      .prepare(
        "INSERT INTO fixture_assets (asset_id, revision_seq, revision_label, content_digest, asset_type, title, summary, body, tags_json, metadata_json, source_locator, search_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.assetId,
        revisionSeq,
        input.revisionLabel ?? null,
        contentDigest,
        input.assetType,
        input.title,
        input.summary ?? null,
        input.body,
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.metadata ?? {}),
        input.sourceLocator ?? null,
        input.searchScore ?? null,
      );
    return Object.freeze({
      assetId: input.assetId,
      revisionSeq,
      contentDigest,
      title: input.title,
      assetType: input.assetType,
    });
  }

  /** The number of assets (one per asset id) and of revisions the library holds. */
  assetCounts(): { readonly assets: number; readonly revisions: number } {
    const assets = this.#database.prepare("SELECT COUNT(DISTINCT asset_id) AS n FROM fixture_assets").get() as { n: number };
    const revisions = this.#database.prepare("SELECT COUNT(*) AS n FROM fixture_assets").get() as { n: number };
    return { assets: assets.n, revisions: revisions.n };
  }

  publicationCount(): number {
    return (this.#database.prepare("SELECT COUNT(*) AS n FROM fixture_publications").get() as { n: number }).n;
  }

  /** Every raw row of the fixture database, for the "no leak" assertions. */
  rawDump(): string {
    const rows = this.#database
      .prepare("SELECT body, title, metadata_json, tags_json FROM fixture_assets")
      .all() as unknown as unknown[];
    const publications = this.#database
      .prepare("SELECT publication_id, payload_digest, asset_id, content_digest, title, body FROM fixture_publications")
      .all() as unknown as unknown[];
    return JSON.stringify({ rows, publications });
  }

  /* ----- the G10-AE read port ----- */

  readPort(): ExternalAssetLibraryReadPort {
    return Object.freeze({
      definition: this.definition,
      search: async (query: { readonly text: string; readonly limit?: number | undefined }) => {
        this.searchCalls += 1;
        this.#assertAvailable();
        const like = `%${query.text.toLowerCase()}%`;
        const rows = this.#database
          .prepare(
            "SELECT a.* FROM fixture_assets a WHERE a.revision_seq = 1 AND (LOWER(a.title) LIKE ? OR LOWER(a.body) LIKE ?)",
          )
          .all(like, like) as unknown as AssetRow[];
        const latest = this.#latestRevisionOf.bind(this);
        const hits = rows
          .slice(0, query.limit ?? 20)
          .map((row) => {
            const current = latest(row.asset_id);
            return {
              providerId: this.definition.providerId,
              assetId: row.asset_id,
              assetType: row.asset_type,
              title: row.title,
              ...(row.summary === null ? {} : { summary: row.summary }),
              ...(row.search_score === null ? {} : { searchScore: row.search_score }),
              // A HINT only, and honestly ABSENT when no stable revision exists.
              ...(this.#mode.omitStableDigest || current === undefined
                ? {}
                : { latestDigestHint: current.content_digest }),
              ...(this.#mode.leakCredentialInResponse ? { apiToken: this.#credential } : {}),
            };
          });
        return { providerId: this.definition.providerId, hits };
      },
      inspect: async (request: ExternalAssetInspectRequest): Promise<ExternalAssetInspection> => {
        this.inspectCalls += 1;
        this.#assertAvailable();
        return this.#inspect(request);
      },
      materializeText: async (stableRef: { readonly assetId: string; readonly contentDigest: string }) => {
        this.materializeCalls += 1;
        this.#assertAvailable();
        const row = this.#database
          .prepare("SELECT * FROM fixture_assets WHERE asset_id = ? AND content_digest = ?")
          .get(stableRef.assetId, stableRef.contentDigest) as unknown as AssetRow | undefined;
        if (row === undefined) return undefined;
        return {
          text: this.#mode.substituteText
            ? `${row.body}\n\n[SUBSTITUTED BY THE PROVIDER]`
            : row.body,
          ...(this.#mode.omitStableDigest ? {} : { contentDigest: row.content_digest }),
          ...(this.#mode.mangleDigest ? { contentDigest: sha256(`${row.body}#mangled`) } : {}),
          mediaType: this.#mode.binaryMediaType ? "application/octet-stream" : "text/plain",
        };
      },
      latestRevision: async (assetId: string) => {
        this.#assertAvailable();
        const current = this.#latestRevisionOf(assetId);
        if (current === undefined) return undefined;
        return {
          assetId: current.asset_id,
          assetType: current.asset_type,
          title: current.title,
          contentDigest: current.content_digest,
          ...(current.revision_label === null ? {} : { revisionLabel: current.revision_label }),
        };
      },
    });
  }

  /* ----- the G10-AE write port (idempotent AND reconcilable) ----- */

  publicationPort(): ExternalAssetPublicationPort {
    return Object.freeze({
      definition: this.definition,
      semantics: "IDEMPOTENT_BY_PUBLICATION_ID" as const,
      publish: async (request: ExternalAssetPublicationRequest): Promise<ExternalAssetPublicationOutcome> => {
        this.publishCalls += 1;
        this.#assertAvailable();
        if (this.#mode.rejectPublication !== undefined) {
          return { status: "FAILED", reason: this.#mode.rejectPublication };
        }
        const existing = this.#publicationOf(request.publicationId);
        if (existing !== undefined) {
          if (existing.payload_digest !== request.payloadDigest) {
            return {
              status: "FAILED",
              reason: `publication ${request.publicationId} was already used for a different payload`,
            };
          }
          // Idempotent by publicationId: the SAME external asset comes back.
          return { status: "PUBLISHED", ref: this.#refOf(existing) };
        }
        const assetId = `ext-${request.publicationId}`;
        const contentDigest = sha256(`${request.title}\u0000${request.body}`);
        this.#database
          .prepare(
            "INSERT INTO fixture_publications (publication_id, payload_digest, asset_id, content_digest, title, body) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(request.publicationId, request.payloadDigest, assetId, contentDigest, request.title, request.body);
        // A real library INDEXES what it stores: the published asset becomes a
        // normal, inspectable asset of this provider (with its own revision).
        this.#database
          .prepare(
            "INSERT INTO fixture_assets (asset_id, revision_seq, revision_label, content_digest, asset_type, title, summary, body, tags_json, metadata_json, source_locator, search_score) VALUES (?, 1, ?, ?, ?, ?, NULL, ?, '[]', '{}', NULL, NULL)",
          )
          .run(
            assetId,
            `pub:${request.publicationId}`,
            contentDigest,
            request.targetAssetType,
            request.title,
            request.body,
          );
        const row = this.#publicationOf(request.publicationId)!;
        const ref = this.#refOf(row);
        if (this.#mode.crashAfterPublish) {
          // The external write LANDED; the process dies before it can be reported.
          throw new SimulatedProcessCrash(`fixture: crashed after publishing ${request.publicationId}`);
        }
        return { status: "PUBLISHED", ref };
      },
      reconcile: async (request: {
        readonly publicationId: string;
        readonly payloadDigest: string;
      }): Promise<ExternalAssetPublicationReconciliation> => {
        this.reconcileCalls += 1;
        const row = this.#publicationOf(request.publicationId);
        if (row === undefined) return { status: "ABSENT_RETRY_SAFE" };
        if (row.payload_digest !== request.payloadDigest) {
          return { status: "UNKNOWN", detail: "the recorded payload digest differs" };
        }
        return { status: "PUBLISHED", ref: this.#refOf(row) };
      },
    });
  }

  /** The effect output the plane reconstructs a stable ref from. */
  static effectOutputOf(published: {
    readonly providerId: string;
    readonly assetId: string;
    readonly contentDigest: string;
    readonly revisionLabel?: string | undefined;
    readonly refDigest: string;
  }): ExternalAssetPublishEffectOutput {
    return {
      providerId: published.providerId,
      assetId: published.assetId,
      contentDigest: published.contentDigest,
      revisionLabel: published.revisionLabel ?? null,
      refDigest: published.refDigest,
    };
  }

  /* ----- internals ----- */

  #assertAvailable(): void {
    if (this.#mode.unavailable) {
      throw new Error("fixture external library is unreachable");
    }
  }

  #refOf(row: PublicationRow) {
    return materializeExternalAssetStableRef({
      providerId: this.definition.providerId,
      assetId: row.asset_id,
      contentDigest: row.content_digest,
      revisionLabel: `pub:${row.publication_id}`,
    });
  }

  #publicationOf(publicationId: string): PublicationRow | undefined {
    return this.#database
      .prepare("SELECT * FROM fixture_publications WHERE publication_id = ?")
      .get(publicationId) as unknown as PublicationRow | undefined;
  }

  #latestRevisionOf(assetId: string): AssetRow | undefined {
    return this.#database
      .prepare("SELECT * FROM fixture_assets WHERE asset_id = ? ORDER BY revision_seq DESC LIMIT 1")
      .get(assetId) as unknown as AssetRow | undefined;
  }

  #inspect(request: ExternalAssetInspectRequest): ExternalAssetInspection {
    const vendor = this.definition.providerId;
    if (this.#mode.omitStableDigest) {
      const any = this.#latestRevisionOf(request.assetId);
      if (any === undefined) {
        return {
          status: "UNAVAILABLE",
          providerId: vendor,
          assetId: request.assetId,
          ...(request.contentDigest === undefined ? {} : { requestedDigest: request.contentDigest }),
          reason: "not_found",
          detail: `fixture asset "${request.assetId}" does not exist`,
        };
      }
      // No stable revision exists for that asset: search+inspect stay possible in
      // principle, but nothing here can ever back a durable reference.
      return {
        status: "UNAVAILABLE",
        providerId: vendor,
        assetId: request.assetId,
        ...(request.contentDigest === undefined ? {} : { requestedDigest: request.contentDigest }),
        reason: "stable_revision_unavailable",
        detail: `fixture provider exposes no stable revision for "${request.assetId}"`,
      };
    }
    const requested = request.contentDigest;
    let row: AssetRow | undefined;
    if (requested === undefined) {
      row = this.#latestRevisionOf(request.assetId);
    } else if (this.#mode.mangleDigest) {
      // Answer the LATEST revision whatever was asked for — the plane must refuse it.
      row = this.#latestRevisionOf(request.assetId);
    } else {
      row = this.#database
        .prepare("SELECT * FROM fixture_assets WHERE asset_id = ? AND content_digest = ?")
        .get(request.assetId, requested) as unknown as AssetRow | undefined;
    }
    if (row === undefined) {
      return {
        status: "UNAVAILABLE",
        providerId: vendor,
        assetId: request.assetId,
        ...(requested === undefined ? {} : { requestedDigest: requested }),
        reason: "not_found",
        detail: `fixture asset "${request.assetId}" has no revision ${requested ?? "<latest>"}`,
      };
    }
    return {
      status: "AVAILABLE",
      snapshot: {
        ref: materializeExternalAssetStableRef({
          providerId: vendor,
          assetId: row.asset_id,
          contentDigest: row.content_digest,
          ...(row.revision_label === null ? {} : { revisionLabel: row.revision_label }),
        }),
        assetType: row.asset_type,
        title: row.title,
        ...(row.summary === null ? {} : { summary: row.summary }),
        tags: JSON.parse(row.tags_json) as string[],
        metadata: JSON.parse(row.metadata_json) as Record<string, string>,
        ...(row.source_locator === null ? {} : { sourceLocator: row.source_locator }),
        ...(this.#mode.leakCredentialInResponse ? { apiToken: this.#credential } : {}),
      },
    } as ExternalAssetInspection;
  }
}
