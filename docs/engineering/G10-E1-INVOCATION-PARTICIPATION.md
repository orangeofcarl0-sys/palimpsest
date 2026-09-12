# G10-E1 — Invocation / Participation Grounding

Status: **G10-E1 · INVOCATION + PARTICIPATION REALIZED · EXPLICIT, NEVER INFERRED · NO OWNERSHIP · NOT A FROZEN CONTRACT**

## 1. The open relation, closed explicitly (§22)

The intentionally-open `Activation ↔ Attempt` relation is now represented by
two distinct semantic artifacts recorded on the coordination store:

- **Invocation** (§23/§24): an explicit *request/invitation* for a runtime
  Activation to contribute to an Attempt — `{schemaVersion, invocationId,
  activation: ActivationRef, attempt: AttemptRef, purpose: "participate"}`.
  It does NOT mean accepted/started/owning/committed/succeeded.
- **Participation** (§28/§29): an Activation *actually participating* in an
  Attempt — `{schemaVersion, participationId, activation: ActivationRef,
  attempt: AttemptRef, invocation?}`. It does NOT mean ownership, assignment,
  commitment, authority, success, or evidence. `invocation` is OPTIONAL:
  voluntary participation stays representable, and an Invocation never
  implies a Participation (E1-M03).

Cardinality remains OPEN (§137/§138): one Activation may participate in
multiple Attempts; one Attempt may hold multiple Participations; an
Invocation may be declined/ignored/superseded.

## 2. Refs (§25/§26)

- `ActivationRef` carries full immutable provenance (activationId,
  agentDefinitionId, runDefinition ref, bindingResolution ref) and is derived
  ONLY via `activationRefOf(actual Activation)` — the high-level API never
  accepts an arbitrary `activationId` string for new participation (§35).
- `AttemptRef` is the canonical Work identity pair `(projectId, attemptId)` —
  no new Attempt identity invented; existence/state validated against the
  canonical Work store.

## 3. Attempt validation (§34)

`AttemptCatalogPort.assertAdmissibleAttempt` — default implementation
`SqliteAttemptCatalog` reads the Work orchestration database's `attempts`
projection **read-only**: unknown attempt → `attempt_unknown`; terminal state
(COMPLETED/FAILED/EXPIRED/CANCELLED/STALE) → `attempt_terminal` refuses NEW
participation starts (historical invocation records against a
now-terminal attempt remain creatable, per §34). The coordination layer never
writes Work truth.

## 4. The coordination event store (§31/§32)

`SqliteCoordinationStore` (default `$DSH_HOME/palimpsest/coordination.sqlite`)
— append-only, monotonic per-store `seq`, caller/deterministic `eventId`,
strict typed payload parsers per event type (never a generic bag), canonical
key-sorted payload serialization as the byte-identical comparison basis.
Duplicate eventId byte-identical → idempotent; different content →
`coordination_conflict` fail-closed; malformed stored rows fail closed on
read; restart/replay proven; no delete API. Concern ≠ store (§32): one
physical store carries Participation/Collaboration/Commitment as distinct
typed event streams.

Event types implemented: `INVOCATION_RECORDED`, `PARTICIPATION_STARTED`,
`PARTICIPATION_ENDED` (end reasons: completed/withdrawn/cancelled/
runtime_lost — participation outcomes that never mutate Attempt outcome).

## 5. Machine proofs (§38)

`test/participation.test.ts` (11 tests): E1-M01..M14 — including end-twice
idempotency and unknown-participation fail-closed (§156 preview). Full unit
at E1 close: **78 files / 670 tests**.
