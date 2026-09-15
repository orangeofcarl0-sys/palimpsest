/**
 * G10-T Proof/Evidence plane — blob-backed source-content port.
 *
 *   Source ≠ Evidence        SourceRevision ≠ SemanticClaim
 *   VaultBlob ≠ SemanticClaim
 *
 * `ProofSourceContentPort` is the read-only seam used to resolve the bytes of a
 * recorded source revision from its opaque content address. It is deliberately
 * narrower than the service's internal `ProofContentPort` (which is keyed by the
 * whole revision): this port is addressed by `(sourceId, revision, contentDigest)`.
 *
 * FAIL CLOSED: `blobBackedSourceContentPort` reads by content digest and then
 * RE-VERIFIES that the returned bytes hash to the requested digest. A mismatch
 * returns `undefined` — the evidence becomes unavailable/an error, never `false`
 * and never silently wrong content.
 */

import { proofContentDigestOfBytes } from "./blob.js";

export interface ProofSourceContentPort {
  readContent(input: {
    readonly sourceId: string;
    readonly revision: number;
    readonly contentDigest: string;
  }): Promise<Uint8Array | undefined>;
}

/**
 * Adapt a content-addressed blob vault (`get(contentDigest)`) to a source-content
 * port. The digest in the requested address is treated as a claim about the bytes:
 * bytes that do not hash to it are refused (returned as `undefined`) rather than
 * handed to the caller.
 *
 * Errors thrown by the underlying vault (e.g. a corrupt local blob it refuses to
 * return) propagate as errors; they are never converted into a successful read.
 */
export function blobBackedSourceContentPort(blob: {
  get(contentDigest: string): Promise<Uint8Array | undefined>;
}): ProofSourceContentPort {
  return Object.freeze({
    async readContent(input: {
      readonly sourceId: string;
      readonly revision: number;
      readonly contentDigest: string;
    }): Promise<Uint8Array | undefined> {
      if (typeof input.contentDigest !== "string" || input.contentDigest.length === 0) return undefined;
      const bytes = await blob.get(input.contentDigest);
      if (bytes === undefined) return undefined;
      // Re-verify the content address on the returned bytes: a digest mismatch is
      // unavailable content, never a false success.
      if (!(bytes instanceof Uint8Array)) return undefined;
      if (proofContentDigestOfBytes(bytes) !== input.contentDigest) return undefined;
      return bytes;
    },
  });
}
