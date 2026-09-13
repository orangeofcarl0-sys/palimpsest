# G10-F2 — Delivery

Stage: **G10-F2 OrganizationDefinition + lineage grounding**
Baseline: `main` @ `3eb70e3` (F1 merged)
Branch: `experiment/g10-f2-organization-grounding`

## Local gates

| Gate | Result |
| ---- | ------ |
| `git diff --check` | clean |
| focused suite (`test/f2_organization.test.ts`) | 14 passed |
| `pnpm test` (unit) | **86 files / 750 tests passed** |
| `pnpm build` | pass |
| `pnpm build:web` | pass |
| `pnpm test:e2e` | 21 passed (documented flake protocol §185) |

## Adversarial review (§11 targets in F2 scope)

| Attack | Result |
| ------ | ------ |
| Organization = Coalition | no coalition fields; only explicit authoring bridges (F2-M01) |
| Organization = WorkGraph | no Work/Task/scheduler imports (F2-M02) |
| Organization = RuntimeScope | no scheduler/retry/budget/checkpoint (F2-M03) |
| Organization = hierarchy | no manager/leader/authority concept |
| Role = Agent identity | disjoint namespaces (F2-M04) |
| Role = authority grant | no authority path (F2-M05) |
| Capability claim = evidence | requirements are declarations; κ deferred (F2-M06) |
| Organization permission = Ordarium authority | no effect import/mapping (F2-M05) |
| member = owner | no ownership field |
| PeerRef/AgentDefinition string collision | tagged union + namespaced key (F2-M08) |
| overlapping membership | allowed (F2-M07) |
| organization revision mutated in-place | append-only store, no UPDATE (F2-M12) |
| organization lineage fork under same id | competing revision fails closed (F2-M13) |
| coalition promotion = automatic organization creation | explicit authoring only; no persistence (F2-M14) |
| unresolved/nested mutability | deep freeze verified (F2-M11) |
| malformed stored artifact | fail closed on read |
| non-deterministic canonicalization | shuffled input → identical digest (F2-M09) |

## CI

Remote canonical CI on the final F2 HEAD: recorded on the branch after the run.

## Deliverables

- `G10-F2-ORGANIZATION.md`
- `G10-F2-ORGANIZATION-IDENTITY.md`
- `G10-F2-ROLE-NORM-CAPABILITY-BOUNDARIES.md`
- `G10-F2-ORGANIZATION-STORE.md`
- `G10-F2-DELIVERY.md`

## Verdict

```text
G10-F2 ORGANIZATION GROUNDING: PASS
```

Organization semantics are executable: immutable identity, tagged membership,
roles/assignments, capability requirements, mission, norms, declared
interactions, and an immutable lineage store — with every authority and
identity boundary preserved.
