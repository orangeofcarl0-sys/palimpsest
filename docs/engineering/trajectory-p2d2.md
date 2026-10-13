# Trajectory-P2-D2 — Model-Visible Delivery Fidelity & Utility Assay Entry

Baseline: `d6c366ca909d6719aab46a04bf717c0b3c352a92` (branch `trajectory-p2d1-governed-consumer-delivery`).
Branch: `trajectory-p2d2-model-visible-delivery`.

This stage answers two SEPARATE questions:

- **D2-G0 — Model-Visible Delivery Fidelity.** Does a qualified historical Trajectory Capsule reach the
  actual model-visible input boundary, not merely a Worker Context object?
- **D2-G1 — Utility Assay Entry.** Can proposed utility benchmarks actually measure the information this
  Capsule contains?

It is a delivery and assay-entry stage. It runs no stochastic trial, no paid model call and no
baseline calibration.

## What changed

### C2 — Capsule source and budget contracts

- **Durability is source-derived.** `assembleCapsule` records the class the trusted Qualification
  established; the product path supplies `origin.provenance.sourceDurability` (from
  `QualifiedAssociation.durability`). `capsuleForConsumer` REFUSES a caller value that disagrees with the
  source (`CAPSULE_DURABILITY_MISMATCH`), so an EPHEMERAL origin can never be presented as DURABLE.
- **Strict runtime budget validation.** `validateCapsuleLimits` requires every bound to be a finite,
  nonnegative integer at or below the product ceiling; a violation is `CAPSULE_LIMIT_INVALID` naming the
  key. This closes the P2-D1 defect where `Math.max(0, Math.min(NaN, ceiling))` disabled the byte bound.
- **The legacy `maxTotalChars` budget is enforced.** An event whose clamped summary would breach the
  aggregate summary-character budget is omitted.
- **Truncation is separated.** `CapsuleTruncation` reports `eventOmittedCount`, `summaryTruncatedCount`,
  `essentialMetadataExceeded` and `sourcePageWasPartial` independently.
- **`IngestionOutcome` matches runtime.** The declared union is now `APPENDED | IDEMPOTENT | REJECTED`;
  the `as IngestionOutcome` cast is gone.

### C3 — Product-owned model-visible presentation

`src/trajectory/presentation.ts` is a pure renderer with three arms:

- **OFF** — no section at all (`null`), so a default prompt is byte-identical to the baseline.
- **CONTROL** — the SAME boundary as TREATMENT and NO invented history.
- **TREATMENT** — the ACTUAL qualified Capsule, rendered under a frozen format.

The section has its own bounded byte budget (`TRAJECTORY_PRESENTATION_HARD_MAX_SECTION_BYTES = 24576`).
An over-budget TREATMENT is `DELIVERY_PRECONDITION_NOT_MET`, never a truncated section and never a silent
CONTROL. The Capsule digest, the rendered-section digest and the full UserMessage digest are DISTINCT and
use documented rules (raw UTF-8 for section/message; canonical JSON for the Capsule).

### C4 — Actual first-party Host placement

- `workWorkerEnvironmentPayload` now forwards `trajectoryPresentation` and `trajectoryDeliveryState`.
- `host/dsh/lib/index.js` forwards the presentation VERBATIM (strict shape handling: a malformed value is
  not stringified).
- `host/dsh/lib/runner.js` composes the task text, then places the validated section at ONE deterministic
  point (appended after the task text, one blank line) and emits `PALIMPSEST_WORKER_TRAJECTORY` telemetry
  with the section bytes/digest and the full UserMessage digest/bytes.
- `host/dsh/lib/trajectory-presentation.js` validates a received presentation (schema, mode, declared
  bytes vs actual bytes, declared digest vs actual bytes, framing, authority) before placing it.

### C5 — Delivery proof levels

- **L0** renderer qualification — `test/trajectory_p2d2_presentation.test.ts`.
- **L1** Host input capture — `test/trajectory_p2d2_host_delivery.test.ts` drives the REAL `runWorker` with
  a controlled Agent and captures the exact `agent.followup()` UserMessage.
- **L2** real DSH Session user/message — `scripts/trajectory_p2d2/l2-gate.mjs` boots the real first-party
  DSH Host with a TEST-OWNED DETERMINISTIC LOCAL ADAPTER (no I/O, no provider request) and reads the
  persisted session's `user/message` through DSH's own persistence. Under OFF the engineering message is
  1910 bytes with no section; under TREATMENT it is 2264 bytes carrying the 352-byte section.
- **L3** real model utility — NOT ATTEMPTED (out of scope).

`request/header` is explicitly NOT treated as prompt proof: it is a header snapshot, and the product's own
`RECOGNIZED_DSH_EVENT_TYPES` does not even name `user/message`.

### C6 — Supported deployment path

`ProjectAgentDeploymentProfile` gains a strict, DEFAULT-OFF `trajectory` section
(`mode`, `capsuleMaxSerializedBytes`, `sectionMaxBytes`), validated exact-key and propagated by
`launchDeployment`. An invalid mode or nonfinite budget is refused. No field lets a model pick an arm, an
Origin or a Session.

### C7 — Information sufficiency

The sanitizer deliberately excludes tool arguments, tool-result bodies, assistant content and raw payloads,
and `tool/result` `observedStatus = 'recorded'` is NOT success. The Capsule therefore CAN establish
execution reconstruction (invocation set, observed events, coverage, inheritance, synthetic recovery,
unknown areas) but CANNOT establish an engineering failure CAUSE. The sanitizer is NOT enlarged: §11.3
forbids broadening it merely to manufacture an effect.

### C8 — Utility assay entry

Two candidate families (Governed Rework Continuation, Multi-Invocation Reconstruction) are specified with
the R2-VR Qualification Law applied as a REQUIREMENT. A baseline-only calibration protocol exists and has
NOT been run. No utility benefit is claimed.

## Evidence levels (reported separately and honestly)

| Level | State |
|---|---|
| L0 renderer qualification | ESTABLISHED |
| L1 Host input capture | ESTABLISHED |
| L2 DSH user/message | ESTABLISHED (deterministic local adapter; no provider request) |
| L3 real model utility | NOT ATTEMPTED |
| Combined real-DSH + real-governed single chain | NOT ESTABLISHED (carried from P2-D1) |

## Runtime limitation

Node `24.14.1` remains below the documented minimum `>=24.15`. No deterministic local LLM adapter is
shipped; the test-owned one is unreachable in production. The C: volume was at 100% during part of the
regression and the first-party gates are disk- and contention-sensitive; each was re-verified in isolation
and against the exact baseline worktree.
