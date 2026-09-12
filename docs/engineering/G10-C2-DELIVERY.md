# G10-C2 — Delivery Report

Status: **G10-C2 · BINDING OBSERVATION SNAPSHOT GROUNDING · COMPLETE · NO PERSISTENTPOINT STORAGE · NO PERSISTENCE · NOT A FROZEN CONTRACT**

Branch `experiment/g10-c2-binding-observation-grounding`, from post-C1
canonical `main` `f9d3b83272b8c224c63e073cfadde477fa4e278c` (PR #18 merged
normally). Merged normally at stage close.

## Key answers

1. **What closed in C2?** `resolution snapshot: MISSING` → **GROUNDED**: the
   compiler's SnapshotRef is derived from a required raw/trusted
   `BindingObservationSnapshot` artifact; the caller-invented `ref` string and
   the ad-hoc `planningSnapshot` input are removed (C2-M10).
2. **Snapshot semantics?** The exact observation basis for
   availability/capability facts — Runtime/Continuity observation, not
   Definition, not a PersistentPoint store, not a runtime carrier.
3. **Identity vs content?** Content digest (domain
   `palimpsest.binding-observation.v1`; snapshotId excluded) + instance
   identity (`snapshotId`, stable-identifier grammar, no clock) + derived
   `SnapshotRef.ref = H(domain-ref, snapshotId, content digest)`. Both drift
   axes change the ref (C2-M06).
4. **Default snapshot?** Rejected with proof (§46 conditions 2/3 fail — a
   default with empty known capability sets would evaluate an explicit
   binding's unknown hard requirements as `required_capability_unavailable`,
   collapsing UNKNOWN into UNAVAILABLE). Every compile requires an explicit
   observation artifact.
5. **Canonicalization?** Capability sets are semantic sets (sorted, duplicate
   values rejected); candidates ordered by point (duplicates rejected);
   `available` + capabilities are digest content.
6. **Parser/materializer?** Established discipline: materializer CREATES,
   parser VALIDATES (fail-closed digest, `BindingObservationSnapshotParseError`
   distinct from binding outcomes). Deep-frozen; caller inputs detached.
7. **Kernel fixtures?** Stay internal — one private translation into
   `ResolverSnapshot`; no elevation to product semantics (C2-M13).
8. **In-stage defect (campaign §2/§3)?** Yes, recorded honestly: candidate
   capability validation initially applied the profile-key allowlist to whole
   candidate objects, rejecting their own `point`/`available` fields — caught
   test-first by the C2 suite, fixed in the same stage. One test-base fix
   (required-field ordering) also in-stage. No unresolved defects.
9. **Source scope?** New: `src/binding/observation.ts`,
   `test/binding_observation.test.ts`, 4 docs. Modified:
   `src/binding/compiler.ts` (snapshot seam), `src/binding/index.ts`
   (additive exports, removed ad-hoc types), `test/binding_compiler.test.ts`.
   Untouched: scheduler, state, effects, run package, TaskSpec, AgentGraph,
   Canvas, frozen contracts, B3 kernel modules.

## Gates (§89)

- Focused: `binding_observation` (12) + compiler suite (33).
- Full unit: **70 files / 600 tests passed** (post-C1 baseline 69/587).
- `pnpm build` + `pnpm build:web`: pass. `git diff --check`: clean.
- Local e2e (`retries = 0`): **21 passed**.
- Remote CI on the actual final HEAD: recorded below; the tip-at-close
  workflow is cited in the PR description.

## Remote CI history

- Implementation HEAD (branch push): run **34708888855** on PR #19 —
  **first-run green** (unit PASS + e2e PASS, no rerun needed).

## Verdict

```text
G10-C2 OBSERVATION SNAPSHOT GROUNDING: COMPLETE
```

Post-C2 grounding matrix — **every Binding freshness input is now grounded**:

```text
Architecture ref          GROUNDED   ArchitectureDefinition
Architecture subjects     GROUNDED   AgentDefinition membership
Work ref                  GROUNDED   ProjectIr
Binding intent            GROUNDED   BindingDefinition / implicit default
RunConfiguration digest   GROUNDED   RunConfiguration artifact
SnapshotRef               GROUNDED   BindingObservationSnapshot artifact
Resolver policy           GROUNDED   actual kernel policy

Architecture hard reqs    INTENTIONALLY ABSENT (no production owner)
Work hard reqs            INTENTIONALLY ABSENT (no production owner)
```

Next: **G10-C3 — fully-grounded compiler + plan closure** (campaign §56–§82),
run automatically.
