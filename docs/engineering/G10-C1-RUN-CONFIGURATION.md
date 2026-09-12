# G10-C1 — RunConfiguration Realization

Status: **G10-C1 · RUNCONFIGURATION ARTIFACT · CANONICAL DEFAULT (NO RUN-SCOPED SPECIALIZATION) · NO PERSISTENCE · NOT A FROZEN CONTRACT**

## 1. Stage-0 inventory — actual run-scoped semantics (C1 §14)

Searched current production code for things plausibly run-scoped, classified by
semantic owner (not file location or variable name):

| Candidate | Where it lives today | Owner classification | RunConfiguration-owned? |
| --- | --- | --- | --- |
| Declared role capacity (`DEFAULT_ROLE_SLOTS`, `declareRoleTable`, `RoleSlotPolicy`) | scheduler projections / controller | **Work-owned** — declared on the event log; governs scheduling concurrency | No |
| Stage-graph concurrency (`PLMP-SCHED-1` declared `concurrency`) | scheduler | **Work-owned** — declared scheduling fact | No |
| Attempt budgets / `maxSteps` / retry loops (`runTurn`, `pumpCommandAttempts`) | controller run loop | **Effect-owned** — runtime loop options | No |
| Model / provider advisory state | DSH tool surface (`src/tools/*`) | **Runtime-owned** — explicitly deferred by PLMP-BIND-1 | No |
| Allowed commands / network endpoints | contract schemas | **Effect/security-owned** | No |
| Controller project options (`projectId`, stageGraph at start) | controller | **Work-owned** — project identity/declaration | No |
| Binding preferences | none exist outside PLMP-BIND-1 intent | n/a (kernel-owned) | No |
| Planner options | none exist | n/a | No |
| RunConfiguration itself | **did not exist** (grep: only `src/binding/**` mentions) | — | — |

## 2. Minimality decision (C1 §15)

For every candidate the gate question was asked:

> If this field is omitted from RunConfiguration, can two semantically
> different run-planning requests become indistinguishable in a way that
> affects the current Binding/plan result?

**No candidate answers YES.** Role capacity and stage concurrency are already
Work-declared facts consumed by the scheduler, not by binding resolution;
model/provider/tools are Runtime-owned and explicitly deferred by the frozen
contract; attempt budgets are effect-loop options. Therefore:

## 3. The canonical default configuration (C1 §16)

```ts
interface RunConfiguration {
  readonly schemaVersion: 1;
  readonly digest: string;
}
```

Its semantic content is **"no run-scoped specialization"** — a real semantic
state, not a placeholder. Digest:

```text
domain:   palimpsest.run-configuration.v1
content:  {}                      (empty run-scoped specialization)
```

SHA-256 over the repository's canonical JSON (`src/schema/canonical.ts`) — an
**implementation choice, not PLMP-UAS-1 frozen semantics** (C1 §20). The same
default configuration has the same digest across runs; that is acceptable and
intended (digest identity).

## 4. Identity (C1 §18)

RunConfiguration is run-scoped: **digest identity is sufficient**. No
RunConfigurationId, revision, or parent revision was created — no production
requirement proves durable lineage necessary.

## 5. Parser / materializer discipline (C1 §19)

- `materializeRunConfiguration()` — CREATES the canonical default (digest
  computed, frozen).
- `parseRunConfiguration(raw: unknown)` — VALIDATES: exact keys
  (`schemaVersion`/`digest`), `schemaVersion === 1`, non-empty digest, and the
  supplied digest must equal the canonical content digest (**fail-closed**;
  a tampered digest is never accepted). Until real run-scoped fields exist,
  the canonical default is the ONLY valid configuration — any other shape is
  unknown-field/digest rejection. Errors are `RunConfigurationParseError`
  (distinct from Binding outcomes). Deep-frozen output; caller inputs
  detached. No persistence.

## 6. Machine proofs (C1 §31)

`test/run_configuration.test.ts`: C1-M01 (strict parsing incl. tamper
rejection), C1-M02 (digest determinism), C1-M03 (immutability + detachment +
purity audit). The canonical-default-only proof covers §16.

## 7. Compiler integration (C1 §29)

The B4 compiler's arbitrary public `runConfigurationDigest: string` input is
**removed** and replaced with the raw/trusted artifact pair
(`rawRunConfiguration` → `parseRunConfiguration` at the boundary;
`trustedRunConfiguration` — a trusted API boundary, not an unforgeable
capability; both simultaneously → `BindingConfigurationError`). The
provenance digest is **derived** from the artifact
(`runConfiguration.digest`). Machine-proven (C1-M10 static + behavioral).
