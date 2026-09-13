# G10-F1 — Coalition Provenance (§42, §70–§71)

Coalition provenance is how a *derived, temporary* coalition may be **cited**
when authoring something durable. It is provenance only — never promotion.

## 1. CoordinationBasisRef

```ts
interface CoordinationBasisRef {
  readonly throughSeq: number;
  readonly digest: string;
}
```

- `throughSeq` = the canonical head the snapshot was derived from.
- `digest` = `SHA-256(canonicalJson({domain: "palimpsest.coalition-basis.v1",
  events: [{eventId, seq, projectId, type, payload} … up to throughSeq]}))`.

The basis is deterministic: replaying the same history yields the same basis
(F1 round-trip proof). Because the basis is recorded *inside* the snapshot and
inside the snapshot digest, a snapshot cannot be silently reinterpreted under
different history.

## 2. CoalitionProvenanceRef

```ts
interface CoalitionProvenanceRef {
  readonly snapshotDigest: string;
  readonly basis: CoordinationBasisRef;
}
```

- `coalitionProvenanceOf(snapshot)` produces it; `parseCoalitionProvenanceRef`
  validates it strictly.
- An Organization-authoring transition (F2) MAY accept this ref as a
  provenance citation. It MUST NOT infer organization semantics from it
  (§70): organization id, mission, roles, assignments, norms, and interactions
  remain explicit authoring inputs.

## 3. Provenance is not promotion, not identity

```text
CoalitionProvenanceRef  ≠  OrganizationDefinitionId   (§71)
CoalitionSnapshot.digest ≠  OrganizationDefinitionId
```

- Deriving or citing a coalition creates **zero** Organization artifacts
  (F1-M05, F1-M08): `deriveCoalitionSnapshot` and `coalitionProvenanceOf` write
  nothing to any store.
- There is no code path from `coalition*` to an organization write in F1; the
  coalition module contains no organization concept at all (static proof).

## 4. Historical recognition

`isCoalitionSnapshotCurrent(store, snapshot)` recomputes the current basis and
compares it to the snapshot's. When new collaboration history arrives:

- the old snapshot becomes **historical** (`false`) but is never mutated;
- a fresh derivation produces a new snapshot with a newer basis and a
  different digest.

This is what allows a durable artifact that cited an old coalition snapshot to
be evaluated against the history it actually used, rather than current history.
