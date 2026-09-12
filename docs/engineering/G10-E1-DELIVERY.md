# G10-E1 — Delivery Report

Status: **G10-E1 · INVOCATION / PARTICIPATION GROUNDING · COMPLETE · EXPLICIT · NEVER INFERRED · NOT A FROZEN CONTRACT**

Branch `experiment/g10-e1-participation-grounding`, from post-E0 canonical
`main` `225c20f7d4292d663a2eb388da2eb4b975eaf1af` (PR #26 merged normally;
canonical run 34719676518 success). Merged normally at stage close.

## Key answers

1. **What closed?** The intentionally-open `Activation ↔ Attempt` relation is
   now represented **explicitly** through `Invocation` and `Participation`
   artifacts recorded on the coordination store — never inferred (E0 rule),
   never ownership, cardinality open.
2. **Coordination store?** The ONE canonical Palimpsest-owned append-only
   store (`$DSH_HOME/palimpsest/coordination.sqlite`): monotonic seq, derived
   eventIds, canonical-JSON payload comparison (byte-identical → idempotent;
   different → `coordination_conflict`), strict per-type payload parsers,
   malformed-row fail-closed reads, restart/replay proven, no delete.
3. **Validation?** Attempts validated against canonical Work state through
   the read-only `AttemptCatalogPort` (unknown → fail-closed; terminal →
   refuses NEW participation starts); Activations accepted only as actual
   `Activation` objects (refs derived via `activationRefOf`).
4. **In-stage findings (campaign §2)?** One implementation defect caught
   test-first: the store's payload serializer initially used
   `JSON.stringify(value, keys)` whose replacer semantics destroy nested
   objects — replaced with the repository's canonical JSON. All 11 proofs
   green after the fix.
5. **Source scope?** New: `src/coordination/{participation,store,attempts,participate,index}.ts`,
   `test/participation.test.ts`, 4 docs. Untouched: scheduler, executors,
   state, runtime, binding, run, frozen contracts.
6. **Gates?** Full unit **78 files / 670 tests** (post-E0 baseline 77/659);
   builds pass; `git diff --check` clean; local e2e 21/21; remote CI:
   implementation-HEAD run **34720447084** on PR #27 — **first-run green**.
   The tip-at-close run is cited in the PR description.

## Verdict

```text
G10-E1 INVOCATION / PARTICIPATION GROUNDING: COMPLETE
```

Next: **E2 — Peer identity / ContactNeed / discovery** (campaign §40–§57),
run automatically.
