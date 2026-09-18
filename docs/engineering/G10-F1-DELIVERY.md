# G10-F1 — Delivery

Stage: **G10-F1 Formal Coalition Grounding**
Baseline: `main` @ `ae2ca7f` (F0 merged)
Branch: `experiment/g10-f1-coalition-grounding`

## Local gates

| Gate | Result |
| ---- | ------ |
| `git diff --check` | clean |
| focused suite (`test/f1_coalition.test.ts`) | 12 passed |
| `pnpm test` (unit) | **85 files / 736 tests passed** |
| `pnpm build` | pass |
| `pnpm build:web` | pass |
| `pnpm test:e2e` | 21 passed (documented flake E2E-DEBUG-01 may require the failed-job rerun protocol, §185) |

## Adversarial review (§11 targets in F1 scope)

| Attack | Result |
| ------ | ------ |
| coalition auto-promoted to organization | no path; derivation writes nothing (F1-M05) |
| organization created from message traffic only | messages contribute no members (F1-M02) |
| coalition proposer treated as manager | no manager concept (F1-M04) |
| arbitrary string scope | rejected by `parseCoalitionScope` |
| member treated as owner | no owner/groupId/organizationId field (F1-M03) |
| old snapshot mutated by new history | snapshots frozen; new derivation → new snapshot (F1-M07) |
| stale snapshot used as current | `isCoalitionSnapshotCurrent` reports historical (F1-M07) |
| nested mutability | deep-freeze verified (F1-M06) |
| forged snapshot digest | strict parser fails closed |

## CI

Remote canonical CI on the final F1 HEAD (`8a92ee3`, PR #34):

```text
run 34752705661 — success (first run)
  unit  pass (39s)
  e2e   pass (1m1s)
merge commit: 3eb70e3
```

## Deliverables

- `G10-F1-COALITION.md`
- `G10-F1-COALITION-PROVENANCE.md`
- `G10-F1-CONTRACT-COVERAGE.md`
- `G10-F1-DELIVERY.md`

## Verdict

```text
G10-F1 FORMAL COALITION GROUNDING: PASS
```

Coalition is now formally grounded — derived, temporary, overlapping,
scope-typed, basis-recorded, immutable, and explicitly non-organizational.
