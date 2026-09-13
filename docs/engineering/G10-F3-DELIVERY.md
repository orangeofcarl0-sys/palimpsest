# G10-F3 — Delivery

Stage: **G10-F3 Typed Organization Transformation**
Baseline: `main` @ `d784d2b` (F2 merged)
Branch: `experiment/g10-f3-organization-transformations`

## Local gates

| Gate | Result |
| ---- | ------ |
| `git diff --check` | clean |
| focused suite (`test/f3_transformation.test.ts`) | 16 passed |
| `pnpm test` (unit) | **87 files / 766 tests passed** |
| `pnpm build` | pass |
| `pnpm build:web` | pass |
| `pnpm test:e2e` | 21 passed (documented flake protocol §185) |

## Adversarial review (§11 targets in F3 scope)

| Attack | Result |
| ------ | ------ |
| split = divide member array in two | blocked: role/norm/interaction classification required (F3-M02) |
| split drops one member | `member_unplaced` blocks |
| split drops one norm | `norm_unclassified` / `norm_role_missing` blocks |
| split omits cross-boundary interaction | ports synthesized 1:1; count proved (F3-M03/M05) |
| split invents interface not backed by interaction | `no_invented_boundary_ports` (F3-M04) |
| merge silently aliases roles | `role_collision_unresolved` (F3-M07) |
| merge silently resolves norm conflict | `norm_conflict_unresolved` (F3-M08) |
| unresolved proof obligation admitted | activation refuses blocked assessments (F3-M13) |
| proposed transformation directly mutates canonical state | evaluation writes nothing (F3-M01) |
| partial multi-successor activation | one transaction, rollback proven (F3-M11) |
| source definitions mutated | sources immutable (F3-M10) |
| evidence claim fabricated | claim ≠ evidence; unresolved without a verifying port (F3-M13) |
| governance approval treated as truth | no governance path in F3; obligations remain the gate |
| scheduler/runtime altered | no such imports (F3-M14) |

## CI

Remote canonical CI on the final F3 HEAD: recorded on the branch after the run.

## Deliverables

- `G10-F3-ORGANIZATION-TRANSFORMATION.md`
- `G10-F3-SPLIT-INTERFACE-SYNTHESIS.md`
- `G10-F3-MERGE.md`
- `G10-F3-PROOF-OBLIGATIONS.md`
- `G10-F3-DELIVERY.md`

## Verdict

```text
G10-F3 ORGANIZATION TRANSFORMATION: PASS
```

REVISE/SPLIT/MERGE are executable; split is partition + interface synthesis +
report; merge collisions and conflicts are explicit; proof obligations are
first-class and block adoption; activation is atomic and explicit. EXTRACT /
INLINE / REWIRE remain deferred as specified.
