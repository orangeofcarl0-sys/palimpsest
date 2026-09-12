# G10-D2 — Ephemeral Runtime Realization

Status: **G10-D2 · EPHEMERAL RUNTIME REALIZATION · FIRST EXECUTABLE RUNTIME PATH · NO PERSISTENTPOINT · EFFECTS THROUGH ORDARIUM · NOT A FROZEN CONTRACT**

## 1. The executable proof (§37)

```text
BindingSelection = ephemeral → Activation → RuntimeCarrier
```

works with **no PersistentPoint store anywhere in the path** (§48 hard
invariant — machine-proven). Persistence is optional and orthogonal.

## 2. RuntimeCarrierPort (§38/§39)

`src/runtime/carrier_port.ts` — host-neutral, runtime-owned:

```ts
interface RuntimeCarrierPort {
  readonly adapterId: string;
  realize(request: RuntimeCarrierRealizeRequest): Promise<RuntimeCarrierRealizeResult>;
  release?(request: RuntimeCarrierReleaseRequest): Promise<void>;
}
```

The request carries exactly the audit grounding (§43): `realizationKey`,
`activationId`, `agentDefinitionId`, `runDefinitionDigest`,
`bindingResolutionId/Digest`, `continuityTarget` — never full Work/
Architecture documents. Contract obligations: `realize` honors
`realizationKey` **idempotently** (retry after crash/uncertainty returns the
existing carrier; exactly-once is NOT assumed, §45); `runtimeAgent`/
`session` are host-owned identities returned verbatim, `session` absent when
the host does not expose one (never synthesized).

Model/provider/tools/session strategy are port-internal Runtime choices
(§39) — nothing leaks back into AgentDefinition or RunConfiguration.
Observation is deliberately NOT on this port (observe ≠ realize; D4).

`callbackRuntimeCarrierPort` (§40) is a **production-usable** callback
adapter for embedding hosts — the callbacks are the host integration, not a
mock.

## 3. Effect authority (§42/§43/§46)

Two Palimpsest-owned Ordarium Safe Actions (`src/effects/runtime_actions.ts`):

```text
palimpsest.runtime.carrier.realize   idempotent(durable)
palimpsest.runtime.carrier.release   idempotent(durable)
```

The port is reachable **only inside action `execute`** — the realization
service calls `effects.invoke(action, input, intent)` with the stable
`realizationKey` as the invocation `callId` and the Work revision from the
RunDefinition as the authorization-evidence revision (the established
orchestration pattern). No production path calls `port.realize/release`
directly (machine-audited). No Palimpsest fake EffectReceipt exists —
Ordarium owns operation truth on its ledger (§46).

## 4. The ephemeral realization service (§47)

`makeRuntimeRealizationService({effects, allocateActivationId, port})` →
`realizeEphemeral(request, scope)`:

```text
1. freshness check against the CURRENT grounded state
   (evaluateGroundedPlanFreshness — no second algorithm); stale → refused
2. semantic preparation via the D1 kernel (coherence; allocator seam)
3. carrier effect through Ordarium per prepared subject
4. only after success: materialize Activation + RuntimeAttachment
```

Outcome distinctions (§105): `realized` | `refused{plan_stale}` |
`refused{persistent_selection}` | `failed{runtime_realization_failed |
effect_denied}`. Effect denial is `ActionDeniedError` (Ordarium's denial
class); host/port failures (including Ordarium-wrapped operation failures)
are `runtime_realization_failed`. Neither is a Binding unsatisfied nor an
Attempt failure. A failure after earlier subjects realized leaves those
materialized — each realization is independent and idempotent by key, so
retries repair rather than duplicate.

**D2 scope boundary**: a persistent selection is **REFUSED**
(`persistent_selection`) — never silently realized, never downgraded to
ephemeral. D3 extends realization with the continuity store (§64).

## 5. Allocator stability (§21/§44/§107)

The allocator seam must return the **same activation id for the same subject
within one realization context** — a fresh UUID per call is not a valid
allocator because it would break retry idempotency (fresh ids → fresh keys →
duplicate carriers). With a stable allocator, a repeated identical
realization produces identical action input, and Ordarium's idempotent
profile dedupes it: the port sees **one** call per subject (machine-proven).

## 6. Machine proofs (§51)

`test/runtime_realization.test.ts` (9 tests, real Ordarium ledger on a temp
SQLite file): D2-M01..M12 — no-store realization, Ordarium admission +
idempotent dedupe, direct-port-mutation absence (static), success →
Activation+Attachment, failure → no artifact, host identity verbatim,
session never synthesized, stable-key retries, install untouched
(D2-M09/M10/M11 via no-diff + green suites), no Attempt identity (D2-M12).
Full unit at D2 close: **73 files / 635 tests**.

## 7. DSH verdict (§52/§109)

```text
CONCRETE DSH CARRIER ADAPTER:
DEFERRED — PUBLIC HOST CREATION/SESSION CONTRACT NOT AVAILABLE
```

The host-neutral production port is fully realized and usable by embedders,
so the deferred DSH-specific adapter does not force the campaign PARTIAL.
`DshToolRunContext.agent?: unknown` remains untouched (§41).
