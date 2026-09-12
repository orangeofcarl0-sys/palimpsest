# G10-D1 — Delivery Report

Status: **G10-D1 · RUNTIME IDENTITY KERNEL · COMPLETE · SEMANTIC PREPARATION ONLY · NO EFFECTS**

Branch `experiment/g10-d1-runtime-identity-kernel`, from canonical
`main` `297ffee5ddad67b9d9f64282bac113f2e982ce6c` (post-G10-C; canonical CI
run 34710038956 success). Merged normally at stage close.

## Key answers

1. **D0 inventory?** Complete — see `G10-D0-RUNTIME-AUTHORITY-MATRIX.md`.
   Host capability verdict: create/resume/release carrier and all observation
   are **CALLBACK/INJECTED PORT ONLY**; session create/resume **NOT
   AVAILABLE**; no trustworthy DSH agent/session contract exists
   (`agent?: unknown` is unconsumable and untouched).
2. **What was realized?** The runtime identity kernel (`src/runtime/`):
   `Activation`, `RuntimeAgentRef`, `SessionRef` (optional, never
   synthesized), `RuntimeAttachment`, `PreparedRuntimeRealization`, the pure
   decision kernel `prepareRuntimeRealization`, the `continuityTargetOf`
   adapter, and the stable `realizationKey` idempotency basis.
3. **Coherence/staleness?** Fail-closed plan/ref/subject coherence (§29) and
   a staleness gate reusing G10-C grounded freshness (§30) — `plan_stale`
   refusals are typed (`RuntimeRealizationError`).
4. **ActivationId allocation?** Explicit allocator seam: the pure kernel
   receives caller-allocated ids covering exactly the subject set; the D2
   service will own the effect-layer allocator (stable UUID acceptable;
   tests deterministic).
5. **Prepared vs final?** Prepared realizations exist before any effect;
   Activation/RuntimeAttachment materialize only after successful
   realization (D2). No effect failure can fabricate runtime state.
6. **Source scope?** New: `src/runtime/{identity,index}.ts`,
   `test/runtime_identity.test.ts`, D0+D1 docs. Untouched: scheduler, state,
   effects, tools, binding kernel, run package, frozen contracts.
7. **Gates?** Full unit **72 files / 626 tests** (post-C baseline 71/615);
   `pnpm build` + `pnpm build:web` pass; `git diff --check` clean; local e2e
   21/21 (after two documented flake runs); remote CI: implementation-HEAD
   run **34712171849** — unit PASS, e2e FAIL (`E2E-DEBUG-01`, known family)
   → failed-job rerun → **success**. The tip-at-close run is cited in the PR
   description.

## Verdict

```text
G10-D1 RUNTIME IDENTITY KERNEL: COMPLETE
```

Next: **D2 — ephemeral runtime realization through Ordarium effect admission**
(campaign §37–§54), run automatically.
