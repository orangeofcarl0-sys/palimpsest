# G10-D3 — PersistentPoint

Status: **G10-D3 · PERSISTENTPOINT CONTINUITY GROUNDING · MINIMAL IDENTITY ARTIFACT + CANONICAL DURABLE STORE · NOT A FROZEN CONTRACT**

## 1. The minimal artifact (§55/§56)

```ts
interface PersistentPoint {
  readonly schemaVersion: 1;
  readonly persistentPointId: PersistentPointId;
}
```

A durable operational identity/locus whose continuity is not identical to any
one runtime carrier or session. Deliberately identity-only — rejected by
default: AgentDefinitionId, RuntimeAgentId, SessionId, workspace, memory,
authority, PeerRef, organization, commitments, capabilities, provider, model.
Identity grammar: the shared stable-identifier grammar (§57). Strict parser +
materializer (creator) discipline; deep-frozen. No durable attachment history
(§63 — the continuity proof needs only point identity surviving carrier
replacement).

## 2. Creation is explicit only (§59)

`materializePersistentPoint` + store `register` are the only creation paths.
Binding resolution never creates a point (kernel untouched, source-audited);
runtime realization never creates one because a selected ref is missing — a
selected-but-unregistered point fails closed with `persistent_point_missing`,
no effect fired, no auto-create, no other point, no ephemeral downgrade (§65,
machine-proven).

## 3. DurableContinuityRef adapter (§58)

`durableContinuityRefOf(point) → point.persistentPointId` — the explicit
Binding-vocabulary adapter, deliberately NOT frozen as a universal
equivalence.

## 4. No runtime attachment as point identity (§62)

The point artifact structurally cannot carry runtimeAgentId/sessionId
(forbidden-field audit). A point survives unlimited carrier replacements;
attachment is `RuntimeAttachment` state. D3-M11 proves the §67 chain:
P → carrier-1 → release → carrier-2 with P unchanged, A1 ≠ A2, P ≠ every
carrier id.
