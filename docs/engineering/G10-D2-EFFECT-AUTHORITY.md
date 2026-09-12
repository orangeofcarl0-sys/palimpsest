# G10-D2 — Effect Authority Record

Every external mutation added by D2, with its authority chain (campaign
§100 — partial; completed at D3/D4/D5 close).

| Mutation | Action | Effect profile | Authorization intent | Idempotency basis | Direct-mutator path |
| --- | --- | --- | --- | --- | --- |
| Runtime carrier create/resume | `palimpsest.runtime.carrier.realize` | `effects.idempotent()` (durable) | `effects.invoke` with `OrchestrationIntent{scope: "runtime-realization", callId: realizationKey, revision: runDefinition.work.revision}` — authorization evidence derives from the plan revision | `realizationKey` = H(`palimpsest.runtime-realization-key.v1`, {activationId, runDefinition ref, bindingResolution ref, continuityTarget}) — stable across retries; the port contract requires honoring it | **None** — the port is reachable only inside action `execute` (machine-audited) |
| Runtime carrier release | `palimpsest.runtime.carrier.release` | `effects.idempotent()` (durable) | same intent family (`callId: release:<key>`) | `realizationKey` + activation + host ref | **None** |

## Guarantee statements (§45 — precise, not overclaimed)

- Ordarium dedupes an identical realize operation (same action, same input,
  same identity) by its idempotent profile: a service-level retry of the same
  prepared realization invokes the port **once** (machine-proven).
- The host port MUST honor `realizationKey` idempotently for the crash
  boundary where a carrier was created but the receipt was not recorded:
  a re-execution with the same key returns the existing carrier instead of
  spawning a duplicate. Exactly-once external execution is **not** claimed;
  the stable key is the coordination basis end to end.
- Release is idempotent: releasing twice is one ledger operation and one port
  call (machine-proven).
- An adapter that cannot support release fails honestly
  (`adapter does not support carrier release`), never silently no-ops.

## What D2 did NOT add

No event-ledger writes, no orchestration-database changes, no Palimpsest fake
receipts, no scheduler/attempt-executor changes, no direct host calls outside
the two actions above.
