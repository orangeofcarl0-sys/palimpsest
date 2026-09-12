# G10-D3 — Continuity Store

Status: **G10-D3 · CANONICAL PERSISTENTPOINT STORE · PALIMPSEST-OWNED · DURABLE · SINGLE TRUTH**

## 1. Ownership decision (D0 §13/§14, implemented)

A **dedicated, clearly Palimpsest-owned continuity repository**: `SqlitePersistentPointStore`
(`node:sqlite`, own file — canonical default `$DSH_HOME/palimpsest/continuity.sqlite`),
injected through the `PersistentPointStore` port. Rejected: orchestration-ledger
table (would entangle continuity identity with Work-event schema evolution) and
Ordarium state (effect authority ≠ continuity semantic ownership). Exactly ONE
canonical identity store exists; caches/views must be explicitly derived. No
in-memory object is called durable.

## 2. Surface (§60)

```ts
interface PersistentPointStore {
  register(point: PersistentPoint): Promise<void>;   // explicit; idempotent ONLY byte-identical
  get(id: PersistentPointId): Promise<PersistentPoint | undefined>;
  list(): Promise<readonly PersistentPoint[]>;
}
```

No delete API — no implicit deletion in the D campaign. Only canonical
(parsed) artifacts enter the store.

## 3. Concurrency and corruption (§61)

- The id is the SQLite **PRIMARY KEY**: duplicate registration is atomic even
  across processes; the register path re-reads on race and applies the same
  comparison (idempotent byte-identical / fail-closed conflict).
- A conflicting artifact under a registered id fails closed
  (`ContinuityStoreError`) — last-write-wins can never change identity
  semantics (machine-proven, including a smuggled-field corruption case).
- A malformed stored record fails closed on read (`get`/`list` throw) —
  never silently skipped or repaired.
- Restart/readback proven with a second store instance over the same file.

## 4. Persistence review answer (campaign §101)

Durable truths added by the whole D campaign: the PersistentPoint identity
store — and nothing else. Owner: Palimpsest Continuity. Canonical: the
`persistent_points` table (id + canonical artifact JSON). Projections/caches:
none. Restart: reload from SQLite (proven). Concurrency: PK-atomic with
fail-closed conflict comparison (proven).
