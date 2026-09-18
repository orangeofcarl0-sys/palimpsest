/**
 * SR-1 R3B — the external asset library bridge routes.
 *
 * A deployment without the bridge answers 501 `surface_absent` on EVERY route below (the same
 * truthful absence the verification face reports) — never a fabricated empty provider list or a
 * fabricated empty result page. That is why every route here is `resolveFaceFirst`: the canonical
 * adapter resolved the face BEFORE any body or query validation, and the accepted-method sets in the
 * golden fixture still show it.
 *
 * The read routes persist nothing. The prepare routes return read-only candidates/previews. The three
 * operator-explicit routes commit through the EXISTING owners; the commit still re-checks the exact
 * external digest, the provider definition and the project scope inside the plane, and publication
 * still requires the SEPARATE admission port — the bearer token that admitted this HTTP request is NOT
 * semantic publication approval (§21). There is deliberately no route that accepts an admission
 * decision, an approver, a provider definition, a credential or a target commit.
 */

import {
  InvalidRequest,
  bodyObject,
  enumValue,
  parseBody,
  queryRequired,
  requireSurface,
  route,
  str,
  type ApplicationRouteDescriptor,
} from "./common.js";
import { PROJECT_JOURNAL_KINDS } from "../../project_workspace/index.js";
import {
  parseExternalAssetImportCandidate,
  parseExternalAssetPublicationPreview,
  parseExternalAssetReferenceCandidate,
  parseExternalAssetStableRef,
} from "../../external_assets/index.js";

/**
 * Every external-asset route, matched as a closed set so an unknown sub-path under
 * `/api/external-assets/` stays a 404 instead of being reported as an absent surface.
 */
export const EXTERNAL_ASSET_ROUTES: readonly string[] = [
  "/api/external-assets/providers",
  "/api/external-assets/search",
  "/api/external-assets/inspect",
  "/api/external-assets/prepare-reference",
  "/api/external-assets/prepare-import",
  "/api/external-assets/prepare-publication",
  "/api/external-assets/commit-reference",
  "/api/external-assets/commit-import",
  "/api/external-assets/approve-publish",
];

export const EXTERNAL_ASSETS_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/external-assets/providers",
    methods: ["GET"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, ok, requireGet }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requireGet();
      return ok(await externalAssets.providers());
    },
  }),
  route({
    path: "/api/external-assets/search",
    methods: ["GET"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, ok, query, requireGet }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requireGet();
      const assetTypes = query
        .getAll("assetType")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value !== "");
      const limitRaw = query.get("limit");
      let limit: number | undefined;
      if (limitRaw !== null && limitRaw !== "") {
        const parsed = Number(limitRaw);
        if (!Number.isSafeInteger(parsed) || parsed < 1) throw new InvalidRequest('"limit" must be a positive integer');
        limit = parsed;
      }
      return ok(
        await externalAssets.search({
          providerId: queryRequired(query, "providerId"),
          text: queryRequired(query, "text"),
          ...(limit === undefined ? {} : { limit }),
          ...(assetTypes.length === 0 ? {} : { assetTypes }),
        }),
      );
    },
  }),
  route({
    path: "/api/external-assets/inspect",
    methods: ["GET"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, ok, query, requireGet }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requireGet();
      const contentDigest = query.get("contentDigest");
      return ok(
        await externalAssets.inspect({
          providerId: queryRequired(query, "providerId"),
          assetId: queryRequired(query, "assetId"),
          ...(contentDigest === null || contentDigest === "" ? {} : { contentDigest }),
        }),
      );
    },
  }),
  route({
    path: "/api/external-assets/prepare-reference",
    methods: ["POST"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, body, ok, requirePost }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requirePost();
      const b = bodyObject(body);
      const contentDigest = b.contentDigest === undefined ? undefined : str(b.contentDigest, "contentDigest");
      return ok(
        await externalAssets.prepareReference({
          providerId: str(b.providerId, "providerId"),
          assetId: str(b.assetId, "assetId"),
          ...(contentDigest === undefined ? {} : { contentDigest }),
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
        }),
      );
    },
  }),
  route({
    path: "/api/external-assets/prepare-import",
    methods: ["POST"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, body, ok, requirePost }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requirePost();
      const b = bodyObject(body);
      const sourceLocator = b.sourceLocator === undefined ? undefined : str(b.sourceLocator, "sourceLocator");
      // The exact stable external ref is strict-parsed at the wire boundary: a ref without an exact
      // content digest is refused here, never completed by guessing.
      const externalRef = parseBody(() => parseExternalAssetStableRef(b.externalRef, "externalRef"));
      return ok(
        await externalAssets.prepareImport({
          externalRef,
          // §14: the Journal kind is the CALLER's explicit choice, never provider-mapped.
          journalKind: enumValue(b.journalKind, PROJECT_JOURNAL_KINDS, "journalKind"),
          title: str(b.title, "title"),
          ...(sourceLocator === undefined ? {} : { sourceLocator }),
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
        }),
      );
    },
  }),
  route({
    path: "/api/external-assets/prepare-publication",
    methods: ["POST"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, body, ok, requirePost }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requirePost();
      const b = bodyObject(body);
      return ok(
        await externalAssets.preparePublication({
          providerId: str(b.providerId, "providerId"),
          targetAssetType: str(b.targetAssetType, "targetAssetType"),
          journalEntryId: str(b.journalEntryId, "journalEntryId"),
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
        }),
      );
    },
  }),
  route({
    path: "/api/external-assets/commit-reference",
    methods: ["POST"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, body, ok, requirePost }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requirePost();
      const candidate = parseBody(() => parseExternalAssetReferenceCandidate(bodyObject(body).candidate, "candidate"));
      return ok(await externalAssets.commitReference(candidate));
    },
  }),
  route({
    path: "/api/external-assets/commit-import",
    methods: ["POST"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, body, ok, requirePost }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requirePost();
      const candidate = parseBody(() => parseExternalAssetImportCandidate(bodyObject(body).candidate, "candidate"));
      return ok(await externalAssets.commitImport(candidate));
    },
  }),
  route({
    path: "/api/external-assets/approve-publish",
    methods: ["POST"],
    face: "externalAssets",
    resolveFaceFirst: true,
    handle: async ({ application, body, ok, requirePost }) => {
      const externalAssets = requireSurface(application.externalAssets, "externalAssets");
      requirePost();
      const preview = parseBody(() => parseExternalAssetPublicationPreview(bodyObject(body).preview, "preview"));
      return ok(await externalAssets.approveAndPublish(preview));
    },
  }),
];
