/**
 * SR-1 R3A — the proof tool cluster.
 *
 * palimpsest_proof_source, palimpsest_proof, palimpsest_disclosure, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import { SOURCE_PROVENANCES } from "../../proof_asset/index.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, requiredString, requiredNumber, stringArray, requiredRevisionRef } from "./common.js";

export function defineProofTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.proof !== undefined) {
    const proof = application.proof;
    tools.push(
      tool({
        name: "palimpsest_proof_source",
        description:
          "Authoritative source/evidence plane: explicitly import opaque source bytes, list known sources, inspect immutable revisions, and read source content ONLY through the explicit content port (source ≠ evidence; content access is never implicit; import triggers no model call)",
        mode: "mutating",
        actions: ["import", "list", "revisions", "inspect", "read_explicit"],
        extraProperties: {
          sourceId: { type: "string" },
          mediaType: { type: "string" },
          label: { type: "string" },
          provenance: { type: "string", enum: [...SOURCE_PROVENANCES] },
          content: { type: "string" },
          metadata: { type: "object" },
          revision: { type: "number" },
          contentDigest: { type: "string" },
          selector: { type: "object" },
        },
        run: async (action, object) => {
          if (action === "list") return proof.sources();
          if (action === "revisions") return proof.sourceRevisions(requiredString(object, "sourceId"));
          if (action === "inspect") {
            const sourceId = requiredString(object, "sourceId");
            const revision = requiredNumber(object, "revision");
            const revisions = await proof.sourceRevisions(sourceId);
            const found = revisions.find((entry) => entry.revision === revision);
            return found === undefined ? null : proof.inspectSource(found);
          }
          if (action === "read_explicit") {
            const ref = requiredRevisionRef(object);
            const bytes = await proof.readContentExplicit(ref);
            return bytes === undefined
              ? { state: "unavailable", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest }
              : { state: "available", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest, content: Buffer.from(bytes).toString("base64") };
          }
          const provenance = requiredString(object, "provenance");
          if (!(SOURCE_PROVENANCES as readonly string[]).includes(provenance)) throw new ToolArgsError(`argument "provenance" must be one of ${SOURCE_PROVENANCES.join(", ")}`);
          const metadata = object.metadata;
          return proof.importSource({
            bytes: new Uint8Array(Buffer.from(requiredString(object, "content"), "base64")),
            mediaType: requiredString(object, "mediaType"),
            label: requiredString(object, "label"),
            provenance: provenance as (typeof SOURCE_PROVENANCES)[number],
            sourceId: requiredString(object, "sourceId"),
            ...(metadata === undefined ? {} : { metadata: metadata as Readonly<Record<string, string>> }),
          });
        },
      }),
    );

    tools.push(
      tool({
        name: "palimpsest_proof",
        description:
          "Authoritative proof claims: list published claims, inspect derived standing/why, prepare a candidate from an ACTIVE reasoning claim, evaluate it through verification then a SEPARATE publication admission, and reassess. No caller-supplied standing or decision is ever accepted",
        mode: "mutating",
        actions: ["list", "inspect", "why", "prepare_publication", "evaluate_publication", "reassess", "analyze"],
        extraProperties: {
          claimId: { type: "string" },
          cellId: { type: "string" },
          candidateId: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" }, description: "Proof-plane evidence ids to analyze (allowlist)" },
          objective: { type: "string" },
          branchCount: { type: "number" },
        },
        run: async (action, object) => {
          if (action === "list") return proof.claims();
          if (action === "inspect") return proof.inspectClaim(requiredString(object, "claimId"));
          if (action === "why") return proof.why(requiredString(object, "claimId"));
          if (action === "prepare_publication") return proof.preparePublication({ cellId: requiredString(object, "cellId"), claimId: requiredString(object, "claimId") });
          if (action === "evaluate_publication") return proof.evaluatePublication({ candidateId: requiredString(object, "candidateId") });
          if (action === "analyze") {
            const evidenceIds = stringArray(object.evidenceIds ?? [], "evidenceIds");
            const branchCount = object.branchCount;
            if (branchCount !== undefined && (typeof branchCount !== "number" || !Number.isSafeInteger(branchCount) || branchCount < 1)) {
              throw new ToolArgsError('argument "branchCount" must be a positive integer');
            }
            return proof.analyzeEvidence({
              evidenceIds,
              objective: requiredString(object, "objective"),
              ...(branchCount === undefined ? {} : { branchCount }),
            });
          }
          return proof.reassess({ claimId: requiredString(object, "claimId") });
        },
      }),
    );
  }

  if (application.disclosure !== undefined) {
    const disclosure = application.disclosure;
    tools.push(
      tool({
        name: "palimpsest_disclosure",
        description:
          "Local, purpose-scoped disclosure over published proof claims: preview exactly what would be disclosed (with whole-source and staleness warnings), then approve-and-export through a SEPARATE admission to a local root. Preview ≠ approval; export ≠ recipient receipt; no federation send occurs",
        mode: "mutating",
        actions: ["preview", "approve_export", "history"],
        extraProperties: {
          purpose: { type: "string" },
          audienceLabel: { type: "string" },
          requestedClaimIds: { type: "array", items: { type: "string" } },
          previewId: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "history") return disclosure.history();
          if (action === "approve_export") return disclosure.approveAndExport({ previewId: requiredString(object, "previewId") });
          return disclosure.preview({
            purpose: requiredString(object, "purpose"),
            audienceLabel: requiredString(object, "audienceLabel"),
            requestedClaimIds: stringArray(object.requestedClaimIds ?? [], "requestedClaimIds"),
          });
        },
      }),
    );
  }
  return tools;
}
