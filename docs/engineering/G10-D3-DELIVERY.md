# G10-D3 — Delivery Report

Status: **G10-D3 · PERSISTENTPOINT CONTINUITY GROUNDING · COMPLETE · PALIMPSEST-OWNED DURABLE STORE · NOT A FROZEN CONTRACT**

Branch `experiment/g10-d3-persistent-continuity`, from post-D2 canonical
`main` `864ff945fb59beca5f60c83ad43fe4b13cec04e3` (PR #22 merged normally).
Merged normally at stage close.

## Key answers

1. **What was realized?** The minimal identity-only `PersistentPoint`
   (strict parser + materializer, shared identifier grammar), the
   **canonical Palimpsest-owned durable store**
   (`SqlitePersistentPointStore` over `node:sqlite`, default
   `$DSH_HOME/palimpsest/continuity.sqlite`, injected via the
   `PersistentPointStore` port), the explicit `durableContinuityRefOf`
   adapter, and persistent realization in the runtime service (store
   verification before any effect).
2. **Ownership (D0 §13)?** Implemented as decided: Palimpsest-owned
   continuity repository — never Ordarium state, never the orchestration
   ledger. Exactly one canonical identity store; restart/readback proven.
3. **Fail-closed semantics?** Selected-but-unregistered point →
   `persistent_point_missing`, no effect fired, nothing auto-created (§65).
   Point unavailable after resolution → typed `realized:false` action result
   → `continuity_unavailable` — never a silent ephemeral downgrade (§66).
   Duplicate registration: idempotent only byte-identical, conflict fails
   closed (§61); malformed stored records fail closed on read.
4. **Carrier replacement (§67)?** Proven end-to-end through the real
   Ordarium ledger: P → carrier-1 → release → carrier-2 with P unchanged,
   activations distinct, P equal to no carrier. Realization contexts
   distinguish a retry (same ids, Ordarium-deduped) from a genuinely new
   activation (new ids, new carrier, same point).
5. **Persistence optionality (§68)?** One mixed plan realizes both routes in
   the same runtime system: the ephemeral subject realizes with no point
   indirection; the persistent subject realizes against verified P.
6. **In-stage findings (campaign §2)?** Two, caught test-first and fixed
   in-stage: (a) typed errors do not survive the Ordarium boundary —
   unavailability is now a typed `realized:false` action RESULT, not a thrown
   class; (b) the carrier-replacement test initially reused the same
   activation context and was correctly deduped by Ordarium — realization
   contexts now distinguish retry from replacement (which is itself the §44
   guarantee working as intended).
7. **Source scope?** New: `src/continuity/{point,store,index}.ts`,
   `test/persistent_continuity.test.ts`, 5 docs. Modified:
   `src/runtime/realize.ts` (persistent realization, activation contexts),
   `src/runtime/index.ts`, `src/effects/runtime_actions.ts` (typed realize
   outcome), D2 tests (renamed service method + D3 semantics). Untouched:
   binding kernel, run package, scheduler, state, install, frozen contracts.
8. **Gates?** Full unit **74 files / 645 tests** (post-D2 baseline 73/635);
   builds pass; `git diff --check` clean; local e2e 21/21; remote CI on the
   actual final HEAD recorded below / in the PR description.

## Verdict

```text
G10-D3 PERSISTENTPOINT CONTINUITY GROUNDING: COMPLETE
```

Next: **D4 — live runtime/continuity observation** (campaign §73–§90), run
automatically.
