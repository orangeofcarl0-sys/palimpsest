# G10-E0 — D Authority / Preflight Closure

Status: **G10-E0 · D GAPS CLOSED · AUTHORITY PROVENANCE EXACT · NOT A FROZEN CONTRACT**

## 1. D-AUTH-01 — release authorization revision (§9–§13)

**Defect (confirmed on canonical main `e1a3616`):** the carrier-release path
invoked Ordarium with `revision: 0` — the recorded authorization evidence
claimed `plan-revision:0` regardless of the Work revision that authorized the
realization.

**Closure:**

```ts
interface RuntimeReleaseHandle {
  readonly schemaVersion: 1;
  readonly realizationKey: string;
  readonly activationId: ActivationId;
  readonly runtimeAgent: RuntimeAgentRef;
  readonly authorizedWorkRevision: number;   // DERIVED, never caller-supplied
  readonly runDefinition: RunDefinitionRef;
}
```

- The handle is materialized **only after a successful carrier effect**, by
  the realization service, with `authorizedWorkRevision` derived from the
  realized `RunDefinition.work.revision` (a caller-supplied revision cannot
  enter; the materializer validates it is a safe non-negative integer).
- The release API is now `release(handle)` — the fabricated
  `{realizationKey, activationId, runtimeAgent}` shape is gone.
- The Ordarium intent uses `revision: handle.authorizedWorkRevision`, keeping
  the stable callId (`release:<realizationKey>`) and realization basis.

**Machine proof (§12):** a realization under Work revision 17 followed by a
release, then a direct read of the actual Ordarium ledger
(`ordarium_operations.record_json`): the release operation's authorization
source is **`plan-revision:17`** — and **no** operation in the flow cites
`plan-revision:0`. Handle immutability: deep-frozen (§13).

## 2. D-MOD-01 — module dependency cycle (§14)

The cycle `runtime/realize → effects/runtime_actions → runtime/realize` is
removed: `ContinuityUnavailableError` moved to the neutral
`src/runtime/errors.ts`; `effects/runtime_actions` and `runtime/realize` both
import from there. Structural audit asserts
`runtime_actions` imports `../runtime/errors.js` and never `../runtime/realize.js`.

## 3. D-API-01 — explicit activation context (§15/§16)

`type ActivationContextId = string` under the shared stable-identifier
grammar. `RuntimeRealizationRequest.activationContext` is now **required and
grammar-validated** (`requireActivationContextId`); the `""` default is gone.
Machine-proven: retry with context C1 → same ActivationId/realizationKey and
Ordarium dedupe (port invoked once); context C2 → new ActivationId, new
realizationKey, a genuinely new carrier realization. No accidental
replacement dedupe.

## 4. Compatibility

The D2-era release request shape and the optional context are superseded —
all call sites (tests, install surface) updated; behavior changes are
authority-correctness closures, not semantic rewrites. Full unit at E0 close:
**77 files / 659 tests**; the pre-existing D suites pass with the new API.
