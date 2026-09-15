/**
 * G10-T Proof/Evidence plane — evidence-selection materializer (CF-T-02).
 *
 *   Source ≠ Evidence    Evidence ≠ Claim    Selection ≠ WholeSource
 *
 * An `EvidenceItem` records only a *selection* over an immutable source revision.
 * This module turns that recorded selection back into the exact bytes a consumer
 * is allowed to see. It NEVER falls back to the whole source: an out-of-range
 * text range, an invalid JSON Pointer, a non-JSON source or unavailable content
 * is a TYPED `SelectionMaterializationError`, never a silent whole-source read.
 *
 * `contentDigest` is always recomputed from the MATERIALIZED bytes (not from the
 * source revision), so a caller can never assert selection content.
 */

import { canonicalJsonBytes } from "../schema/canonical.js";
import type { EvidenceItem, EvidenceSelector } from "./evidence.js";
import { proofContentDigestOfBytes } from "./blob.js";
import type { ProofSourceRevision } from "./sources.js";

export type MaterializationKind = "ORIGINAL_SOURCE" | "TEXT_EXCERPT" | "JSON_VALUE";

export type SelectionMaterializationErrorKind = "range_invalid" | "pointer_invalid" | "not_json" | "content_unavailable";

export class SelectionMaterializationError extends Error {
  constructor(
    readonly kind: SelectionMaterializationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SelectionMaterializationError";
  }
}

function fail(kind: SelectionMaterializationErrorKind, message: string): never {
  throw new SelectionMaterializationError(kind, message);
}

export interface MaterializedSelection {
  readonly evidenceId: string;
  readonly kind: MaterializationKind;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly contentDigest: string;
  readonly suffix: string;
}

function suffixForMediaType(mediaType: string): string {
  const normalized = mediaType.split(";")[0]!.trim().toLowerCase();
  if (normalized === "text/plain") return ".txt";
  if (normalized === "text/markdown") return ".md";
  if (normalized === "text/csv") return ".csv";
  if (normalized === "text/html") return ".html";
  if (normalized === "application/json" || normalized.endsWith("+json")) return ".json";
  return "";
}

/** RFC 6901 JSON Pointer resolution. A missing segment / bad index is `pointer_invalid`. */
function resolveJsonPointer(document: unknown, pointer: string): unknown {
  if (pointer === "") return document;
  let current: unknown = document;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/u.test(segment)) fail("pointer_invalid", `JSON Pointer segment "${segment}" is not a valid array index`);
      const index = Number(segment);
      if (index >= current.length) fail("pointer_invalid", `JSON Pointer array index ${index} is out of bounds`);
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      const object = current as Record<string, unknown>;
      if (!Object.hasOwn(object, segment)) fail("pointer_invalid", `JSON Pointer segment "${segment}" does not exist`);
      current = object[segment];
    } else {
      fail("pointer_invalid", `JSON Pointer segment "${segment}" traverses a non-container`);
    }
  }
  return current;
}

function requireBytes(content: Uint8Array): Uint8Array {
  if (!(content instanceof Uint8Array)) fail("content_unavailable", "source content is not available as bytes");
  return content;
}

/**
 * Materialize the recorded selection of `evidence` from the given source content.
 *
 * - WHOLE_SOURCE  → the whole source bytes (kind `ORIGINAL_SOURCE`, original media type)
 * - TEXT_RANGE    → exactly the selected range as UTF-8 `text/plain` (kind `TEXT_EXCERPT`, `.txt`)
 * - JSON_POINTER  → the selected value as canonical JSON (kind `JSON_VALUE`, `.json`)
 */
export function materializeSelection(input: {
  readonly evidence: EvidenceItem;
  readonly sourceRevision: ProofSourceRevision;
  readonly content: Uint8Array;
}): MaterializedSelection {
  const { evidence, sourceRevision } = input;
  const content = requireBytes(input.content);
  if (evidence.sourceRevision.sourceId !== sourceRevision.sourceId || evidence.sourceRevision.revision !== sourceRevision.revision) {
    fail("content_unavailable", `evidence "${evidence.evidenceId}" does not select the supplied source revision`);
  }
  if (proofContentDigestOfBytes(content) !== sourceRevision.contentDigest || evidence.sourceRevision.contentDigest !== sourceRevision.contentDigest) {
    fail("content_unavailable", `content for "${sourceRevision.sourceId}@${sourceRevision.revision}" does not hash to its recorded content digest`);
  }

  const selector: EvidenceSelector = evidence.selector;
  switch (selector.kind) {
    case "WHOLE_SOURCE": {
      const bytes = new Uint8Array(content);
      return Object.freeze({
        evidenceId: evidence.evidenceId,
        kind: "ORIGINAL_SOURCE" as const,
        bytes,
        mediaType: sourceRevision.mediaType,
        contentDigest: proofContentDigestOfBytes(bytes),
        suffix: suffixForMediaType(sourceRevision.mediaType),
      });
    }
    case "TEXT_RANGE": {
      if (selector.start > selector.end) fail("range_invalid", `TEXT_RANGE start ${selector.start} is greater than end ${selector.end}`);
      const text = new TextDecoder().decode(content);
      if (selector.end > text.length) fail("range_invalid", `TEXT_RANGE end ${selector.end} exceeds source length ${text.length}`);
      const bytes = new TextEncoder().encode(text.slice(selector.start, selector.end));
      return Object.freeze({
        evidenceId: evidence.evidenceId,
        kind: "TEXT_EXCERPT" as const,
        bytes,
        mediaType: "text/plain",
        contentDigest: proofContentDigestOfBytes(bytes),
        suffix: ".txt",
      });
    }
    case "JSON_POINTER": {
      let document: unknown;
      try {
        document = JSON.parse(new TextDecoder().decode(content));
      } catch (error) {
        fail("not_json", `source "${sourceRevision.sourceId}@${sourceRevision.revision}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      const resolved = resolveJsonPointer(document, selector.pointer);
      let bytes: Uint8Array;
      try {
        bytes = canonicalJsonBytes(resolved);
      } catch (error) {
        fail("not_json", `JSON Pointer selection is not canonical JSON-serializable: ${error instanceof Error ? error.message : String(error)}`);
      }
      return Object.freeze({
        evidenceId: evidence.evidenceId,
        kind: "JSON_VALUE" as const,
        bytes,
        mediaType: "application/json",
        contentDigest: proofContentDigestOfBytes(bytes),
        suffix: ".json",
      });
    }
    default: {
      const exhausted: never = selector;
      return exhausted;
    }
  }
}
