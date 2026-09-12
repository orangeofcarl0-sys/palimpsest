# G10-D1 — Runtime Identity Kernel

Status: **G10-D1 · RUNTIME IDENTITY + REALIZATION DECISION KERNEL · SEMANTIC PREPARATION ONLY · NO HOST CALLS · NO EFFECTS · NO POINT CREATION · NOT A FROZEN CONTRACT**

Includes the D0 inventory (`G10-D0-RUNTIME-AUTHORITY-MATRIX.md`).

## 1. Scope (§18)

The minimum runtime semantic entities needed to execute an AgentDefinition
without collapsing it into the host carrier:

```ts
type ActivationId = string;                        // allocator-seam output (§21)

interface RuntimeAgentRef { runtimeAdapter: string; agentId: string; }   // host-owned
interface SessionRef      { runtimeAdapter: string; sessionId: string; }  // host-owned, OPTIONAL

interface Activation {           // §19/§20 — deliberately minimal
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
}

interface RuntimeAttachment {    // §25 — derived runtime state
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly runtimeAgent: RuntimeAgentRef;
  readonly session?: SessionRef;                       // never synthesized
  readonly continuityTarget: RuntimeContinuityTarget;  // ephemeral | persistent(P)
}

interface PreparedRuntimeRealization {  // §22 — BEFORE any external effect
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
  readonly continuityTarget: RuntimeContinuityTarget;
  readonly realizationKey: string;   // stable idempotency basis (§44)
}
```

Deliberately absent from every shape: taskId, attemptId, TaskSpec,
`definition_id`, model, provider, session ownership, PersistentPoint state,
prompt, memory (§20/§31). The `Activation ↔ Attempt` relation remains OPEN
(§4/§96/§124).

## 2. The decision kernel (§27)

`prepareRuntimeRealization({architecture, runDefinition, resolution, plan,
activationIds, current?})` — pure:

- derives one prepared realization per Architecture subject (canonical
  subject order), each continuity target derived **exactly** from the
  BindingResolution's selection for that subject via the explicit
  `continuityTargetOf` adapter (the §26 firewall made visible);
- computes the stable `realizationKey` =
  H(`palimpsest.runtime-realization-key.v1`, {activationId, runDefinition ref,
  bindingResolution ref, continuityTarget}) — the idempotency basis for D2
  (§44/§45);
- coherence, fail-closed (§29): plan.runDefinition ref == returned
  RunDefinition; plan.bindingResolution ref == returned BindingResolution;
  Architecture subject set == resolution continuity subject set; allocator
  output covers exactly the subject set. Violations raise
  `RuntimeRealizationError{kind:"incoherent"}`;
- staleness gate (§30): when the optional `current` grounded state is
  supplied, preparation re-runs the G10-C `evaluateGroundedPlanFreshness` —
  no second freshness algorithm — and refuses stale plans with
  `RuntimeRealizationError{kind:"plan_stale"}`.

No host calls, no Ordarium effects, no sessions, no PersistentPoint creation
(§28) — machine-audited imports.

## 3. Prepared vs final (§22)

`PreparedRuntimeRealization` exists before any external effect.
`materializeActivation` / `materializeRuntimeAttachment` produce the final
artifacts **only after a successful carrier realization** (D2) — an effect
failure can never leave canonical runtime state claiming an activation
exists. `session` is materialized only when the host supplied one.

## 4. Identity allocation (§21)

`ActivationId` is never derived from agentDefinitionId/taskId/sessionId/
runtimeAgentId. The pure kernel receives already-allocated ids; the D2
effect-layer service owns the allocator seam (stable UUID acceptable there;
tests use deterministic allocators).

## 5. Immutability (§32)

All runtime artifacts are deep-frozen (artifact, refs, continuity target,
host refs) with caller inputs detached — B3C2 standard (D1-M11).

## 6. Machine proofs (§34)

`test/runtime_identity.test.ts` (11 tests): D1-M01..M12 as enumerated in the
spec, plus realization-key stability/sensitivity. Full unit at D1 close:
**72 files / 626 tests**.
