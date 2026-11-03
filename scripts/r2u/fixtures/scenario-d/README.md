# incremental-cache

Keep an incremental build cache correct as its inputs change.

## Goal

A build keeps a cache of computed nodes. Each node records the value it produced and the node ids it
was computed **from**:

```ts
export interface CacheNode {
  readonly value: unknown;
  /** The node ids this entry was computed from. */
  readonly deps: readonly string[];
}
export type Cache = Record<string, CacheNode>;

export function invalidateCache(cache: Cache, changed: readonly string[]): Cache
```

`cache` is the caller's current cache — a plain object keyed by node id — and the caller keeps using
the same object afterwards. `changed` names the node ids whose **source** changed.

After the call, every entry that remains must be one whose cached value is still correct for the
sources as they now stand, and no entry that is still correct may have been discarded.

## Acceptance

Run the oracle:

```sh
node test/check.js
```

It reports one line per case:

```
PASS <case id>
FAIL <case id> <failureClass> <detail>
```

The failure classes are `REJECTED_BUT_SHOULD_ACCEPT`, `WRONG_CACHE`, `ACCEPTED_INVALID_INPUT` and
`MUTATED_CACHE_BEFORE_REJECTING`. `WRONG_CACHE` names the first canonical path that differs from the
expected cache.

`test/cases.json` holds the cases this oracle judges, including the expected cache for the accepted
ones. The oracle's case list is **not** the whole acceptance contract: the project also has an
independent acceptance oracle covering the same contract with different data, and that one is the
authority. Passing `test/check.js` is necessary but not sufficient.

## Notes

- The build graph is whatever the build produced; it is not guaranteed to be a tree.
- The cache is durable and shared, so the caller still holds the object it passed in.
- Rebuilding a node is expensive, so discarding an entry that did not need to go costs real work.
