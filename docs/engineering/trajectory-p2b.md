# Trajectory-P2-B — Durable Execution Association & Cold Recovery

**Stage:** `Trajectory-P2-B`
**Baseline:** `6dc52ba3766d22fb69f5da040da434139a11c758` (branch `trajectory-p2a-session-identity-observation`)
**Branch:** `trajectory-p2b-durable-execution-association`
**Completion state:** `TRAJECTORY_P2B_RECOVERABLE_ASSOCIATION_QUALIFIED`

## 0. What this stage establishes

A real canonical Work Attempt can be correlated, in one run, with a real first-party DSH Session created
by the DSH Host; the resulting observation can be recorded durably through a source-bound ingestion path;
and a **fresh, independent process** can recover the same semantic association from the durable records
alone — without the original Parent's memory.

The governing principle from §20 is honored throughout: *an execution association becomes trustworthy
not because its identifiers were persisted, but because the persisted evidence can be traced back to
actual authoritative sources and revalidated after the original execution context has disappeared.*

## 1. P2-B0 — Source Chain Qualification

### 1.1 P2-A evidence corrections (B0-C1)

Four P2-A weaknesses were pinned as runnable falsifiers (`test/trajectory_p2b_source_contract.test.ts`)
and then corrected:

| Gap | P2-A behavior | Correction |
|---|---|---|
| **F1** | the Level C gate text-scanned a Zstandard session artifact as UTF-8 | the corrected gate reads the **logical Session Event stream** through the official `SessionPersistence` reader |
| **F2** | the mandatory gate could pass without running (`false === false`) | the gate reports `PASS / SKIPPED / BLOCKED / NOT_ESTABLISHED` and exits non-zero unless it ran and qualified |
| **F3** | a fixed directory under a caller-controllable root was recursively deleted | a unique per-run `mkdtempSync` directory with a **containment proof** and a reparse-point refusal; bounded async cleanup |
| **F4** | the Parent parse failure and the Host refusal reason were conflated | reported as three separate facts: Parent outcome, Parent parse failure, Host's own telemetry |

F1 was proven, not asserted: the P2-A gate's own artifacts are `session.v4.jsonl.zstd` beginning with the
Zstandard magic `28 b5 2f fd`, and a UTF-8 read of them contains 324 replacement characters in which the
scanned literal cannot appear. The `0` was a property of the method.

A forward-only erratum (`research-evidence/trajectory-p2b/p2a-forward-erratum.json`) records the
corrections. **P2-A's historical `final-verdicts.json` is not modified.**

### 1.2 Corrected first-party measurement

`scripts/trajectory_p2b/level-b-first-party-gate.mjs` — **PASS**:

- `readState: READ_OK`, 3 persisted events, header SessionId matches the observed identity
- `turnStart: 0`, `stepStart: 0`, `requestHeader: 0`
- the no-model stop is the SHIPPED capability refusal, made deterministic by a test-owned unclassified probe
- model calls: 0; private sessions accessed: false

### 1.3 Real canonical Work → real DSH Session (B0-C2)

`scripts/trajectory_p2b/canonical-correlation-gate.mjs` — **PASS**, from ONE run:

```
canonical AttemptId  attempt-<32 hex>   (ProjectController.prepareMutatingWork)
Work Delegation      wdj-<uuid>
Parent Invocation    wpi-<uuid>
DSH SessionId        worker-<uuid>       (reported by the Host that created it)
```

The Attempt was left **RUNNING** — no fabricated `ATTEMPT_COMPLETED`, no fabricated `ATTEMPT_FAILED`.
Source observation grants no settlement.

### 1.4 Source qualification (B0-C3)

`sessionSourceQualification` was a caller-supplied hint. P2-B defines a **trusted source chain** and
enforces it on the read side: the record's `TrustedSourceBasis` (a digest of the configured worker bin,
its basename, the node executable) must match the verifier's own basis. A controlled stub that declares
`FIRST_PARTY_DSH_QUALIFIED` is refused. The declared label is preserved for audit and **never consulted**
to reach an outcome. This is a defensible local provenance chain, not remote attestation.

## 2. P2-B1 — Durable Observation

### 2.1 Owner decision

`research-evidence/trajectory-p2b/durable-owner-decision.json`. Selected: a **minimal dedicated store**
(`src/execution_association/**`, L2), following the `src/project_world/basis_store.ts` precedent of a
dedicated append-only file for execution provenance.

- **Work EventStore rejected** (§6.1): a Host observation is not a Work lifecycle transition.
- **CoordinationStore rejected as host** (§6.2): its ownership is peer coordination/federation and it is
  absent without a federation stack; retained as the idempotency/atomicity contract reference.
- **G1-B recorder rejected as owner** (§6.3): a research script; its principles are reused.

### 2.2 Model

Two immutable fact kinds — `SESSION_IDENTITY_OBSERVED` and `INVOCATION_OBSERVATION_FINALIZED`. The payload
carries **only immutable facts**: no ingestion timestamp, so a retry is byte-identical (§7.4). The stable
identity is `xas-<sha256(canonicalDigest({domain, type, projectId, attemptId, invocationId, dshSessionId}))>`.
There is deliberately **no stored `verified: true`** — qualification is derived on the read side.

**All candidates are preserved** (§7.5): the P2-A two-slot tracker's F6 loss is fixed; three distinct
identities for one invocation yield three durable records and a `CONFLICT` with all three visible.

### 2.3 Trusted ingestion and its honest limit

The recorder is created by the deployment, bound to the deployment's own basis. It accepts only the
correlated observation shape and rejects any non-`DIRECT_CHILD_IPC_REPORT` source. A caller holding the
raw store reference can still write a well-formed record — that is why the **decisive** protection is the
read side's basis comparison plus the Work and DSH re-reads.

### 2.4 Observer failure is not settlement

The store is optional and is not imported by `work_delegation.ts`; a write failure is reported and never
converted into a Work success or failure (§7.7).

## 3. P2-B2 — Recoverable Association

### 3.1 Qualification

`src/execution_association/qualification.ts` produces `ASSOCIATION_QUALIFIED` only when all of: a committed
durable observation; a re-read of canonical Work; a read of the real DSH Session header agreeing; the
record's basis matching the verifier's; a CLOSED window; and exactly one candidate. It yields an
H1-compatible `AttemptSessionAssociation` with a **real** `durableBindingRef` (the committed event id) —
no fabricated fields. H1's resolver was **not modified**.

### 3.2 Real cold recovery (§10)

`scripts/trajectory_p2b/cold-recovery-gate.mjs` — **PASS**, TWO independent processes:

- **Process A** records a real association (2 durable events) and exits.
- **Process B** starts fresh with only the durable locator and the trusted basis, replays the records,
  re-opens canonical Work, re-opens the official DSH Session header, and recovers the **identical**
  invocation and SessionId. `recoveredIdentityMatchesRecorded: true`.

Cold recovery means recovery of evidence and association — **not** resumption of a DSH Agent.

### 3.3 Negative cases

The §11 matrix (`test/trajectory_p2b_adversarial_matrix.test.ts`, 15 cases) covers wrong project, wrong
attempt, wrong session, missing session, unsupported format, duplicate, same-id divergence, three-identity
conflict, verified-X-plus-pending-Y, historical completed attempt, unfinalized window, and
self-declared-label refusal. §10.4 distinctions are kept: unavailable, contradictory, malformed, absent
and incomplete are separate states.

## 4. Regression

See §8 of the final report for the exact gate results and the archived-drift classification.

## 5. Verdict

`TRAJECTORY_P2B_RECOVERABLE_ASSOCIATION_QUALIFIED`, with the Node `v24.14.1 < >=24.15.0` runtime
limitation disclosed and the deferred items recorded in `p2c-readiness.json`.
