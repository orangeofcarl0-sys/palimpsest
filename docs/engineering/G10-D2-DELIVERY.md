# G10-D2 — Delivery Report

Status: **G10-D2 · EPHEMERAL RUNTIME REALIZATION · COMPLETE · NO PERSISTENTPOINT · EFFECTS THROUGH ORDARIUM · NOT A FROZEN CONTRACT**

Branch `experiment/g10-d2-ephemeral-runtime-realization`, from post-D1
canonical `main` `17fa74cfdad8d683a7b615423ca4ecdfa4c0e664` (PR #21 merged
normally). Merged normally at stage close.

## Key answers

1. **What became executable?** `BindingSelection = ephemeral → Activation →
   RuntimeCarrier` — with **no PersistentPoint anywhere** (the campaign's
   persistence-optionality proof, §37/§48).
2. **How is the host reached?** Through the host-neutral `RuntimeCarrierPort`
   (injected) whose `realize`/`release` are wrapped in the Palimpsest-owned
   Ordarium actions `palimpsest.runtime.carrier.realize` /
   `.release` (idempotent profile). The port is reachable only inside action
   `execute`; the service goes through `effects.invoke` — no bypass (§42).
3. **Idempotency?** `realizationKey` = H(domain, {activationId, runDefinition
   ref, bindingResolution ref, continuityTarget}); the allocator seam is
   contractually stable per realization context; a repeated identical
   realization is deduped by Ordarium (port invoked once — machine-proven);
   release twice is one operation (§107).
4. **Crash boundary (§45)?** Exactly-once is not assumed: the port must honor
   `realizationKey` idempotently so a re-execution after a lost receipt
   returns the existing carrier. Documented precisely in
   `G10-D2-EFFECT-AUTHORITY.md`.
5. **Failure semantics (§105)?** `realized` / `refused{plan_stale,
   persistent_selection}` / `failed{runtime_realization_failed,
   effect_denied}` — effect denial is Ordarium's `ActionDeniedError`; host
   failures are `runtime_realization_failed`. Never collapsed into a Binding
   unsatisfied or an Attempt failure.
6. **In-stage findings (campaign §2)?** Two, both caught test-first and fixed
   in-stage: (a) the effect-denial mapping initially matched ANY
   `OrdariumError` — Ordarium wraps host failures in `OperationFailedError`,
   so the mapping now keys on `ActionDeniedError`; (b) the test harness's
   per-call allocator was itself the §107 duplicate-carrier hazard — the
   allocator-stability contract is now explicit and machine-proven.
7. **DSH verdict (§52)?** `CONCRETE DSH CARRIER ADAPTER: DEFERRED — PUBLIC
   HOST CREATION/SESSION CONTRACT NOT AVAILABLE`. The host-neutral port is
   complete and production-usable (`callbackRuntimeCarrierPort`), so this is
   not a campaign blocker. `agent?: unknown` untouched.
8. **Source scope?** New: `src/runtime/{carrier_port,realize}.ts`,
   `src/effects/runtime_actions.ts`, `test/runtime_realization.test.ts`,
   4 docs. Modified: `src/runtime/index.ts`, `src/effects/index.ts`
   (additive exports). Untouched: install.ts (D5 wires additively),
   scheduler, state, tools, binding kernel, run package, frozen contracts.
9. **Gates?** Full unit **73 files / 635 tests** (post-D1 baseline 72/626);
   builds pass; `git diff --check` clean; local e2e 21/21 (after one
   documented flake run); remote CI on the actual final HEAD recorded
   below / in the PR description.

## Verdict

```text
G10-D2 EPHEMERAL RUNTIME REALIZATION: COMPLETE
```

Next: **D3 — PersistentPoint continuity grounding** (campaign §55–§72), run
automatically.
