# G10-F1 — Contract Coverage

G10-F1 campaign sections → implementation / proof.

| Section | Requirement | Status | Evidence |
| ------ | ----------- | ------ | -------- |
| §30/§31 | Coalition formalized, remains temporary/overlapping/derived/scope-bound | DONE | `src/federation/coalition.ts`; F1-M03 |
| §32 | Coalition membership is not membership authority | DONE | snapshot carries no authority/role/effect fields; F1-M04 |
| §33 | `CoalitionSnapshot` shape | DONE | `CoalitionSnapshot` interface |
| §34 | No mandatory `CoalitionId` | DONE | no such field; F1-M05 |
| §35 | Typed scope (AttemptRef / ContactNeedRef), no arbitrary string | DONE | `CoalitionScope` + `parseCoalitionScope`; scope-typing proof |
| §36 | `CoordinationBasisRef` history basis | DONE | `coordinationBasisOf`; F1-M07 |
| §37 | Membership only from active commitments/participations; never messages/acks/adverts/candidates/focus | DONE | `deriveCoalitionSnapshot`; F1-M01/M02 |
| §38 | Membership overlap allowed; no unique owner field | DONE | F1-M03 |
| §39 | No manager inferred | DONE | F1-M04 (static + structural) |
| §40 | New history → new snapshot; never mutate old | DONE | immutability + F1-M07 |
| §41 | Coalition ≠ Organization; derivation creates none | DONE | F1-M05 (store unchanged, no organization concept) |
| §42 | Coalition provenance ref (citation only) | DONE | `CoalitionProvenanceRef`; F1-M08 |
| §43 | F1-M01..M10 machine proofs | DONE | `test/f1_coalition.test.ts` (12 tests) |
| §44 | Deliverables + branch + merge | DONE | this doc set; PR to main |

## Non-equivalences preserved

```text
Coalition ≠ Organization
Coalition ≠ membership authority
Coalition membership ≠ organization membership
CoalitionSnapshot.digest ≠ OrganizationDefinitionId
Coalition provenance ≠ automatic promotion
Coalition has no manager / no hierarchy
Runtime participation ≠ peer membership
```

## Ownership

- Coalition derivation reads the **coordination store** (F0-hardened) and writes
  nothing. It owns no store.
- The legacy E5 `coalitionView` string-scoped projection is retained and now
  shares `activeCommitmentRecords` with the formal snapshot — one derivation,
  no duplicate truth.
- No organization, institution, Work, scheduler, runtime, or Ordarium concept
  is introduced in F1.

## Backward compatibility

- `FederationService.coalition(scope: string)` behavior unchanged (E5 tests
  green).
- `coalitionSnapshot(scope: CoalitionScope)` is additive.
- Root contract-core exports remain clean; coalition is on the federation/advanced
  surface.
