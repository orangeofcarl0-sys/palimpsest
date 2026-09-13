# G10-F5 — Delivery

Stage: **G10-F5 AGT × PAG Integration**
Baseline: `main` @ `4cf7bdb` (F4 merged)
Branch: `experiment/g10-f5-agt-pag-integration`

## Local gates

| Gate | Result |
| ---- | ------ |
| `git diff --check` | clean |
| focused suite (`test/f5_integration.test.ts`) | 7 passed |
| `pnpm test` (unit) | **89 files / 785 tests passed** (one transient flake observed once, then green twice) |
| `pnpm build` | pass |
| `pnpm build:web` | pass |
| `pnpm test:e2e` | 21 passed (documented flake protocol §185) |

## End-to-end proofs

| Proof | Evidence |
| ----- | -------- |
| coalition provenance → organization → institution (19-step path) | F5-E2E |
| split under institution does not fork the institution | F5-SPLIT |
| merge under institution does not merge institutions | F5-MERGE |
| 3-epoch member replacement preserves InstitutionId | F5-MEM |
| coalition + organization overlap | F5-OVER |
| governance cannot admit unresolved obligations; no anti-patterns | F5-C |
| additive install surface + backward compatibility | F5-COMPAT |

## Adversarial review (§11 targets in F5 scope)

| Attack | Result |
| ------ | ------ |
| coalition auto-promoted to organization | explicit authoring only (F5-E2E step 3) |
| unresolved obligation admitted through governance | `activateAndGovernOrganizationChange` refuses blocked (F5-C) |
| split auto-forks institution | explicit adoption; no second institution (F5-SPLIT) |
| merge auto-merges institutions | explicit adoption; sources intact (F5-MERGE) |
| member replacement changes InstitutionId | id constant across epochs (F5-MEM) |
| runtime inactivity terminates institution | kernel has no runtime dependency |
| organization interpreted as RuntimeScope / Holon | not realized; no coupling (F5-C) |
| Canvas grouping interpreted as Organization | no schema mapping |
| generic groupId collapse | absent from modules (F5-C) |
| scheduler organization awareness | scheduler imports neither (F5-C) |
| collaboration history rewritten | organization/institution never import coordination |
| effect authority by accident | no norm/authority → Ordarium mapping |
| backward incompatibility | absent wiring leaves surfaces absent (F5-COMPAT) |

## CI

Remote canonical CI on the final F5 HEAD: recorded on the branch after the run.

## Deliverables

- `G10-F5-AGT-PAG-INTEGRATION.md`
- `G10-F5-COALITION-TO-ORGANIZATION.md`
- `G10-F5-INSTITUTIONAL-EVOLUTION.md`
- `G10-F5-NON-EQUIVALENCE-MATRIX.md`
- `G10-F5-DELIVERY.md`

## Verdict

```text
G10-F5 AGT × PAG INTEGRATION: PASS
```

The full bottom-up path is executable and explicit at every arrow:
independent peers → collaboration → coalition → explicit organization →
governed durable institution, with institutional identity surviving member and
organization-body replacement. The full PLMP-PAG-0 stack remains deferred.
