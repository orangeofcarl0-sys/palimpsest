# G10-F4 — Delivery

Stage: **G10-F4 Durable Institution Continuity Kernel**
Baseline: `main` @ `c76ca63` (F3 merged)
Branch: `experiment/g10-f4-durable-institution-kernel`

## Local gates

| Gate | Result |
| ---- | ------ |
| `git diff --check` | clean |
| focused suite (`test/f4_institution.test.ts`) | 12 passed |
| `pnpm test` (unit) | **88 files / 778 tests passed** |
| `pnpm build` | pass |
| `pnpm build:web` | pass |
| `pnpm test:e2e` | 21 passed (documented flake protocol §185) |

## Adversarial review (§11 targets in F4 scope)

| Attack | Result |
| ------ | ------ |
| institution = organization revision | distinct artifact/identity (F4-M01) |
| institution = PersistentPoint / PeerRef / RuntimeAgent | no such imports or ids (F4-M02/M03) |
| charter revision without current-authority approval | counted against head-epoch charter (F4-M06) |
| continuation authority self-replacement without authorization | new authorities cannot self-authorize (F4-M07) |
| role implies continuation authority | explicit charter authority only (F4-M04/M05) |
| duplicate approval counted twice | unique-approver set (F4-M09) |
| stale epoch approval admitted | `stale_base_epoch` (F4-M10) |
| new authority set self-authorizes | `approval_threshold_not_met` (F4-M07) |
| partial epoch/head advancement | one transaction, rollback (F4-M11) |
| member replacement changes InstitutionId | institution id preserved (F4-M13) |
| organization id replacement changes InstitutionId without explicit transition | explicit transition required; id preserved (F4-M14) |
| zero runtime activity interpreted as institution death | readable with no runtime (F4-M15) |
| empty PAG lifecycle placeholders | none created (§135) |
| mutable head outranks canonical history | head is a verified projection (F4-M11/store) |

## CI

Remote canonical CI on the final F4 HEAD: recorded on the branch after the run.

## Deliverables

- `G10-F4-DURABLE-INSTITUTION-KERNEL.md`
- `G10-F4-CHARTER-CONTINUATION-AUTHORITY.md`
- `G10-F4-INSTITUTION-EPOCHS.md`
- `G10-F4-IDENTITY-MATRIX.md`
- `G10-F4-DELIVERY.md`

## Verdict

```text
G10-F4 DURABLE INSTITUTION KERNEL: PASS
```

Stable institution identity, versioned charter, explicit continuation
authority, and authorized epoch lineage are executable — and the institution
identity survives total member and organization-body replacement under an
authorized lineage. The full PLMP-PAG-0 stack remains deferred.
