/**
 * SR-1 R3B — the proof route cluster: evidence sources, claims, publication and disclosure.
 *
 * Raw content is POST-only and goes through the explicit read port; the disclosure routes are the
 * only place a claim leaves the project, and they require a preview and a separate approval.
 */

import {
  InvalidRequest,
  bodyObject,
  parseBody,
  queryRequired,
  requireSurface,
  route,
  str,
  type ApplicationRouteDescriptor,
} from "./common.js";
import { SOURCE_PROVENANCES, parseEvidenceSelector, parseProofSourceRevisionRef } from "../../proof_asset/index.js";

export const PROOF_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/proof/sources",
    methods: ["GET"],
    face: "proof",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.proof, "proof").sources());
    },
  }),
  route({
    path: "/api/proof/sources/revisions",
    methods: ["GET"],
    face: "proof",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.proof, "proof").sourceRevisions(queryRequired(query, "sourceId")));
    },
  }),
  route({
    path: "/api/proof/sources/inspect",
    methods: ["GET"],
    face: "proof",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      const proof = requireSurface(application.proof, "proof");
      const sourceId = queryRequired(query, "sourceId");
      const revision = Number(queryRequired(query, "revision"));
      if (!Number.isSafeInteger(revision) || revision < 0) throw new InvalidRequest('query parameter "revision" must be a non-negative integer');
      const revisions = await proof.sourceRevisions(sourceId);
      const found = revisions.find((entry) => entry.revision === revision);
      if (found === undefined) return ok(null);
      return ok(await proof.inspectSource({ schemaVersion: 1, sourceId: found.sourceId, revision: found.revision, contentDigest: found.contentDigest }));
    },
  }),
  route({
    path: "/api/proof/sources/import",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const provenance = str(b.provenance, "provenance");
      if (!(SOURCE_PROVENANCES as readonly string[]).includes(provenance)) {
        throw new InvalidRequest(`provenance must be one of ${SOURCE_PROVENANCES.join(", ")}`);
      }
      const content = str(b.content, "content");
      const bytes = new Uint8Array(Buffer.from(content, "base64"));
      const metadata = b.metadata === undefined ? undefined : (b.metadata as Readonly<Record<string, string>>);
      return ok(
        await requireSurface(application.proof, "proof").importSource({
          bytes,
          mediaType: str(b.mediaType, "mediaType"),
          label: str(b.label, "label"),
          provenance: provenance as (typeof SOURCE_PROVENANCES)[number],
          sourceId: str(b.sourceId, "sourceId"),
          ...(metadata === undefined ? {} : { metadata }),
        }),
      );
    },
  }),
  route({
    path: "/api/proof/sources/read_explicit",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const ref = parseBody(() =>
        parseProofSourceRevisionRef({
          schemaVersion: 1,
          sourceId: str(b.sourceId, "sourceId"),
          revision: b.revision,
          contentDigest: str(b.contentDigest, "contentDigest"),
        }),
      );
      const bytes = await requireSurface(application.proof, "proof").readContentExplicit(ref);
      if (bytes === undefined) return ok({ state: "unavailable", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest });
      return ok({ state: "available", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest, content: Buffer.from(bytes).toString("base64") });
    },
  }),
  route({
    path: "/api/proof/evidence",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const sourceRevision = parseBody(() =>
        parseProofSourceRevisionRef({
          schemaVersion: 1,
          sourceId: str(b.sourceId, "sourceId"),
          revision: b.revision,
          contentDigest: str(b.contentDigest, "contentDigest"),
        }),
      );
      const selector = parseBody(() => parseEvidenceSelector(b.selector, "selector"));
      return ok(await requireSurface(application.proof, "proof").recordEvidence({ sourceRevision, selector }));
    },
  }),
  route({
    path: "/api/proof/analyze",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const evidenceIds = Array.isArray(b.evidenceIds) ? b.evidenceIds.map((id) => str(id, "evidenceIds[]")) : [];
      const branchCount = b.branchCount;
      if (branchCount !== undefined && (typeof branchCount !== "number" || !Number.isSafeInteger(branchCount) || branchCount < 1)) {
        throw new InvalidRequest('"branchCount" must be a positive integer');
      }
      return ok(
        await requireSurface(application.proof, "proof").analyzeEvidence({
          evidenceIds,
          objective: str(b.objective, "objective"),
          ...(branchCount === undefined ? {} : { branchCount }),
        }),
      );
    },
  }),
  route({
    path: "/api/proof/claims",
    methods: ["GET"],
    face: "proof",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.proof, "proof").claims());
    },
  }),
  route({
    path: "/api/proof/claims/inspect",
    methods: ["GET"],
    face: "proof",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.proof, "proof").inspectClaim(queryRequired(query, "claimId")));
    },
  }),
  route({
    path: "/api/proof/claims/why",
    methods: ["GET"],
    face: "proof",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.proof, "proof").why(queryRequired(query, "claimId")));
    },
  }),
  route({
    path: "/api/proof/publication/prepare",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.proof, "proof").preparePublication({ cellId: str(b.cellId, "cellId"), claimId: str(b.claimId, "claimId") }));
    },
  }),
  route({
    path: "/api/proof/publication/evaluate",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.proof, "proof").evaluatePublication({ candidateId: str(b.candidateId, "candidateId") }));
    },
  }),
  route({
    path: "/api/proof/claims/reassess",
    methods: ["POST"],
    face: "proof",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.proof, "proof").reassess({ claimId: str(b.claimId, "claimId") }));
    },
  }),
  route({
    path: "/api/proof/disclosure/history",
    methods: ["GET"],
    face: "disclosure",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.disclosure, "disclosure").history());
    },
  }),
  route({
    path: "/api/proof/disclosure/preview",
    methods: ["POST"],
    face: "disclosure",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const requestedClaimIds = Array.isArray(b.requestedClaimIds) ? b.requestedClaimIds.map((id) => str(id, "requestedClaimIds[]")) : [];
      return ok(
        await requireSurface(application.disclosure, "disclosure").preview({
          purpose: str(b.purpose, "purpose"),
          audienceLabel: str(b.audienceLabel, "audienceLabel"),
          requestedClaimIds,
        }),
      );
    },
  }),
  route({
    path: "/api/proof/disclosure/approve_export",
    methods: ["POST"],
    face: "disclosure",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.disclosure, "disclosure").approveAndExport({ previewId: str(b.previewId, "previewId") }));
    },
  }),
];
