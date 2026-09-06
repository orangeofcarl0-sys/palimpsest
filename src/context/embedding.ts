/**
 * PLMP-CTX-3 §1.1: the host-neutral embedding port. Real embeddings come
 * from the host (model access stays outside the kernel boundary); the
 * hashing reference implementation is deterministic and model-free for
 * tests and clean environments. It returns RAW bucket counts (no
 * normalization) so file-level density survives the dot-product ranking.
 */

export interface EmbeddingPort {
  embed(texts: readonly string[]): Promise<ReadonlyArray<readonly number[]>>;
}

export const EMBEDDING_DIMENSIONS = 64;

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const va = a[index] ?? 0;
    const vb = b[index] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const norm = Math.sqrt(normA) * Math.sqrt(normB);
  return norm === 0 ? 0 : dot / norm;
}

/**
 * Deterministic token-hashing reference embedder (tests / clean
 * environments): token-hash buckets, L2-normalized. Production hosts inject
 * real embedding ports - the contract is text-in/vectors-out only.
 */
export function hashingEmbedder(dimensions = EMBEDDING_DIMENSIONS): EmbeddingPort {
  return {
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array<number>(dimensions).fill(0);
        for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
          if (token.length < 3) continue;
          let hash = 0;
          for (let index = 0; index < token.length; index += 1) {
            hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
          }
          const bucket = hash % dimensions;
          vector[bucket]! += 1;
        }
        // Raw bucket counts, deliberately NOT normalized: magnitude is the
        // density signal the dot-product ranking rewards (PLMP-CTX-3 r2).
        return vector;
      });
    },
  };
}
