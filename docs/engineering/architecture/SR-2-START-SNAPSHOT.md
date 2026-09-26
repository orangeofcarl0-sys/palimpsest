# SR-2 START SNAPSHOT — Kernel Boundary Convergence

**Captured from** `a3915d725848cb88032957427e9994138ea6bce9`
**Captured tree** `b72b8da88ca87739fa5f3ac397cdcef6e7712a31`
**Command** `pnpm build && node scripts/audit/module-architecture.mjs --json`

This is the "where do we start" evidence for SR-2 (ruling §七). It is deliberately **not** an
`architecture:write` output: re-stamping the current debt as a new baseline is exactly what SR-2
must not do (§三十一). The committed baseline stays at v2's exception set until SR-2e.

## Totals

```text
files              391
loc                112648
bytes              4955598
edges              1629
externalImports      19
unresolvedImports     0
```

The committed SR-1 baseline recorded **344 files / 96184 LOC**. SR-2 therefore starts from
**+47 files / +16464 LOC** of growth since that measurement.

## The three structural warnings the ruling named, measured

| Warning | Measured |
|---|---|
| `ProjectController` size | **5378 LOC**, fanOut **35**, fanIn **20** (old baseline: ~3095 LOC) |
| `project_world/index.ts` semantic spread | 12 modules spanning basis → continuation (see §四) |
| `ResultContinuationService` dependency count | names EventStore, issuer, observer, admission store, basis runtime, rematerializer, resolver, delegation — the signal the ruling called "依赖知识开始失控" |

## Strongly connected components (8)

SR-2's §十七/§十八/§十九 targets, and the ones it explicitly leaves alone (§二十):

| Size | Files | SR-2 slice |
|---|---|---|
| 10 | `boundary_memory/ref` · `coordination/{attempts,index,participate,participation,store}` · `federation/{commitment,messages,peer}` · `organization/definition` | **SR-2d3** (E substrate) |
| 8 | `campaign/*` | OUT of SR-2 (§二十) |
| 4 | `domain/{stage_graph,state_machine}` · `schema/{index,models}` | OUT of SR-2 (§二十) |
| 3 | `canvas/derive` · `tools/controller` · `tools/graph` | **SR-2d1** (D kernel) |
| 3 | `proof_asset/*` | OUT of SR-2 (§二十) |
| 2 | `effects/promotion` · `recovery/recovery` | **SR-2d2** (D kernel) |
| 2 | `project_management/{policy,profile}` | OUT of SR-2 (§二十) |
| 2 | `project_verification/{artifacts,independence}` | OUT of SR-2 (§二十) |

## Highest fan-out / fan-in modules (the hotspot ratchet's starting numbers, §二十二)

```text
fanOut 40  src/advanced.ts
fanOut 40  src/composition/install_contract.ts
fanOut 36  src/application/factory.ts
fanOut 35  src/tools/controller.ts
fanOut 24  src/deployment/launch.ts

fanIn 107  src/schema/canonical.ts
fanIn  36  src/schema/identifier.ts
fanIn  36  src/schema/index.ts
fanIn  35  src/federation/peer.ts
fanIn  20  src/tools/controller.ts
```

## What SR-2.0 changed (tooling only — no product implementation)

1. **`src/continuation/**` is now explicitly L3.** It was UNCLASSIFIED, and an unclassified
   directory fell back to BARREL — whose allowed-target set is *every layer*. D5-d's most
   important orchestrator was therefore inside the checker's widest escape hatch. Classifying it
   surfaced exactly one real edge (`continuation/service.ts → deployment/source_change_observer.ts`,
   type-only), which is recorded with a written reason naming SR-2a as its remover.
2. **"Unclassified" is now a first-class layer that fails CI.** `UNCLASSIFIED` has no allowed
   targets, and an unclassified module is reported as its own violation kind. It is deliberately
   NOT part of the baseline schema, so it cannot be whitelisted: the problem is a missing
   decision, not a tolerated dependency. A future `src/workforce/` that nobody classifies fails
   rather than silently inheriting "may import anything".
3. **The baseline identity is asked of git, and the TREE is recorded (v3).** `capturedFrom` was
   read from `.git/HEAD`, which is a **file** in a linked worktree — so every capture in the
   layout this repository actually uses silently recorded `unknown`. It is now
   `git rev-parse HEAD` / `HEAD^{tree}`, and `capturedTree` is recorded because the tree survives
   a PR squash while the commit does not.

### Evidence that SR-2.0 re-stamped no debt

A full baseline regeneration was diffed against the committed one before writing:

```text
edges:  committed=4  fresh=5      WOULD ADD: continuation/service.ts -> deployment/source_change_observer.ts
WOULD REMOVE: (none)
cycles: committed=8  fresh=8      WOULD ADD: (none)   WOULD REMOVE: (none)
```

One edge added, nothing removed, no cycle change — the new baseline is the old baseline plus the
single edge the classification exposed. That is pinned by
`test/architecture/sr2_architecture_constitution.test.ts`.
