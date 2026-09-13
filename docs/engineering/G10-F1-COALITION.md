# G10-F1 — Formal Coalition Grounding

Status: **COMPLETE**

Baseline: `main` @ `ae2ca7f` (F0 merged).
Branch: `experiment/g10-f1-coalition-grounding`.

---

## 1. What a Coalition is (§30–§32)

> A temporary, purpose/scope-driven set of collaborating peers derived from
> active collaboration relations.

It is normally **overlapping, temporary, derived, scope-bound** (§31). It is
NOT membership authority: coalition membership implies no organization
membership, role assignment, authority, effect permission, or runtime
ownership (§32).

## 2. CoalitionSnapshot (§33–§36)

```ts
interface CoalitionSnapshot {
  readonly schemaVersion: 1;
  readonly scope: CoalitionScope;
  readonly basis: CoordinationBasisRef;   // { throughSeq, digest }
  readonly members: readonly PeerRef[];
  readonly sourceCommitments: readonly CommitmentId[];
  readonly sourceParticipations: readonly ParticipationId[];
  readonly digest: string;
}
```

- **No `CoalitionId`** (§34): a snapshot is identified by
  `scope + coordination basis + content digest`. Durable coalition identity is
  not required because a coalition is temporary/derived; adding one was not
  justified by implementation evidence.
- **Typed scope** (§35): `CoalitionScope` is a grounded union —
  `{kind:"attempt_participation", attempt}` or
  `{kind:"contact_need", contactNeedId}`. An arbitrary `string` scope is
  rejected (F1 scope-typing proof).
- **Basis** (§36): `CoordinationBasisRef` records the exact history
  (`throughSeq` + a domain-separated digest over the events up to that seq), so
  a snapshot over older history is recognizably **historical** rather than
  silently stale (`isCoalitionSnapshotCurrent`).
- **Digest**: `palimpsest.coalition-snapshot.v1` over
  `{scope, basis, members, sourceCommitments, sourceParticipations}`;
  `parseCoalitionSnapshot` fails closed on mismatch.

## 3. Derivation (§37)

Membership derives ONLY from explicit active relations within the scope:

| Source                                   | Contributes members? | Recorded as |
| ---------------------------------------- | :------------------: | ----------- |
| ACTIVE commitment, holder (accepted)     | **yes** (holder)     | `sourceCommitments` |
| ACTIVE participation (Attempt-scoped)    | no (Activation-anchored, no PeerRef) | `sourceParticipations` |
| messages / acks / wakes                  | no                   | — |
| `PeerAdvertisement` / `ContactCandidate` | no                   | — |
| user focus                               | no                   | — |

The participation row is the deliberate non-collapse: `Participation` carries
an `ActivationRef`, not a `PeerRef`, so runtime participation cannot manufacture
peer membership. Participations are still recorded for provenance/audit.

The single active-commitment derivation `activeCommitmentRecords` is shared by
the formal snapshot and the legacy E5 `coalitionView` projection, so there is
one truth for "who is an active holder".

## 4. Overlap / no manager (§38–§39)

- Membership overlap is allowed: the same peer may be in multiple coalitions
  simultaneously (F1-M03). No `groupId`/`organizationId`/`coalitionId` owner
  field exists on `PeerRef` or the snapshot.
- No manager/leader/authority root is ever inferred from proposer, first
  member, local peer, or user-facing peer (F1-M04).

## 5. Coalition is not organization (§41–§42)

Deriving a snapshot is **read-only**: it writes nothing to the coordination
store and creates no organization artifact (F1-M05). `CoalitionProvenanceRef`
(`{snapshotDigest, basis}`) lets later Organization authoring *cite* a snapshot
— provenance only, never automatic promotion (F1-M08). `CoalitionSnapshot`
digest never becomes an organization identity (§71 will restate this).

## 6. Machine proofs

| Proof  | Statement                                                     |
| ------ | ------------------------------------------------------------- |
| F1-M01 | coalition derived from active commitments/participations      |
| F1-M02 | messages alone do not create membership                       |
| F1-M03 | coalition overlap allowed; no unique owner field              |
| F1-M04 | coalition has no manager                                      |
| F1-M05 | coalition ≠ organization; derivation writes nothing           |
| F1-M06 | snapshot deeply immutable                                     |
| F1-M07 | new history → new basis/snapshot; old snapshot historical     |
| F1-M08 | coalition provenance does not create an organization          |
| F1-M09 | WorkGraph unchanged                                           |
| F1-M10 | scheduler unchanged                                           |

`test/f1_coalition.test.ts`: 12 tests. Full suite at F1 HEAD: **85 files / 736 tests**.
