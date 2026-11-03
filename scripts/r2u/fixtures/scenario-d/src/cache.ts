/**
 * R2-U §6/§10/§11 — SCENARIO D, THE STARTING POINT (H0).
 *
 * A DELIBERATELY INCOMPLETE BUT PLAUSIBLE implementation. It reads the broad goal literally —
 * "invalidate the cache when source nodes change" — and does the obvious thing: delete the entries for
 * the nodes that changed, and nothing else.
 *
 * It therefore commits the pre-paid cognitive mistake this scenario measures:
 *
 *     invalidate the changed nodes before the affected CLOSURE is computed
 *
 * THE MISTAKE IS OBSERVABLY DESTRUCTIVE HERE, which is what makes it measurable. A node's cached value
 * was computed FROM its dependencies, so when a dependency's source changes, every node that transitively
 * depends on it is stale too. Deleting only the directly-changed entries leaves every dependent holding a
 * value derived from input that no longer exists — the build ships stale results while reporting success.
 *
 * The mistake is also SUBSTANTIVE rather than cosmetic because it is SILENT: the returned cache is
 * well-formed, every remaining entry is individually consistent, and nothing about the object says which
 * of its values are now derived from changed input.
 *
 * It is IRREVERSIBLE in the caller's hands: the caller owns `cache` and keeps using it, so an
 * invalidation that deletes as it walks has already destroyed the entries it will later need in order to
 * decide what else is stale. That is why the correct method freezes the whole affected set BEFORE the
 * first deletion.
 */

export class CacheError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CacheError";
    this.code = code;
  }
}

export interface CacheNode {
  readonly value: unknown;
  /** The node ids this entry was computed from. */
  readonly deps: readonly string[];
}

export type Cache = Record<string, CacheNode>;

/**
 * Invalidate the cache for a set of changed source nodes.
 *
 * The caller owns `cache` and keeps using the same object afterwards, so this function's obligations are
 * stronger than "return the right object".
 */
export function invalidateCache(cache: Cache, changed: readonly string[]): Cache {
  if (cache === null || typeof cache !== "object" || Array.isArray(cache)) {
    throw new CacheError("INVALID_CACHE", "the cache must be a plain object");
  }
  if (!Array.isArray(changed)) throw new CacheError("INVALID_INPUT", "the changed set must be an array");

  // Delete the entries for the nodes whose source changed.
  for (const id of changed) {
    if (typeof id !== "string" || id.length === 0) throw new CacheError("INVALID_NODE_ID", "every changed node id must be a non-empty string");
    delete cache[id];
  }

  return cache;
}
