# R3-L0C-G1-B — Invocation, Journal & Origin Binding Closure

**Stage:** R3-L0C-G1-B
**Baseline:** `43ca525599031d431796cb37d0c182d265597d84` (branch `r3-l0c-g1-host-origin-evidence`)
**Branch:** `r3-l0c-g1b-evidence-binding`

This memorandum is the human-readable companion to the machine-readable records in
`research-evidence/r3-l0c-g1b/`.

---

## 1. What this stage corrected

G1 built a working host-observation **producer**. Independent review then found that the producer was not
connected to a trustworthy, durable Run/Attempt evidence chain. G1-B corrects exactly five things, and adds no
new harness, owner, scheduler or pipeline.

---

## 2. The five measured defects and their corrections

| # | Baseline defect (measured) | Correction |
|---|---|---|
| **B1** | One real port execution carried **two** invocation identities: the Work Delegation wrapper minted `wpi-…` while the port emitted a different `wpi-…`, so `entry.invocationId ≠ entry.observation.invocationId`. | The Deployment Port stays the sole InvocationId producer; the wrapper **adopts** the identity the port emitted. |
| **B2** | The recorder rejected **all three** real observations and the resulting **zero-event** record still wrote successfully and reported `durabilityVerified: true`. | The recorder is bound to the invocation the port produced; storage is per-invocation, atomic, re-read and digest-verified; a zero-event record cannot be the positive case. |
| **B3** | Against the real frozen journal, records are `{seq, kind, at, payload, digest}`; G1's readers returned `MISSING_RUN_STARTED` and an empty trial map. | The correlator reads the real schema through `readJournal()`, requires `JOURNAL_INTACT`, reads `payload.runId` / `payload.record.attemptId` / `hostJobId`, and verifies the claim through `verifyTrustedClaim()`. |
| **B4** | A caller-built record copying `G1_LOCAL_RECORDER`, with a recomputed digest and an **empty** event array, reached `RUN_ATTEMPT_CORRELATED`. | Origin is established by **trusted ingestion**, not by a marker. Untrusted inspection is a separate layer that can never promote its input. |
| **B5** | The canonical `attempt-<32hex>` returned `ABSENT`, and a candidate below the scan bound returned `ABSENT` with no incomplete-discovery signal. | One explicit normalization accepts both the canonical and bare-hex forms; a traversal that could not scan every directory reports `DISCOVERY_INCOMPLETE`. |

Each falsifier is committed in `scripts/r3l0c_g1b/baseline/falsifiers.mjs` and re-measured after the
corrections; all five now report `defectPresent: false`.

---

## 3. The three separated origin trust layers

1. **Untrusted record inspection** — validates shape and content consistency only; can never promote its input.
2. **Trusted local recorder ingestion** — the only path to `LOCAL_HOST_OBSERVED`, bound to one live invocation.
3. **Verified local persistent readback** — reads an owned record from the expected run-scoped location,
   verifies its bytes and compares it with the trusted bindings.

A copied marker plus a self-computed hash now reaches `ORIGIN_NOT_ESTABLISHED`; a zero-event record reaches
`PROVENANCE_INCOMPLETE`.

**Disclosed limitation.** G1-B establishes a genuinely distinguishable local host origin *within the local trust
model*. It does **not** establish an independent cryptographic Host Attestation Authority, and it does **not**
claim protection against malicious code already executing with full control of the same host process and
evidence directory. `INDEPENDENT_HOST_ORIGIN_AUTHENTICATION = NOT_ESTABLISHED`. No self-signed credential was
created.

---

## 4. The authoritative local chain (§9)

Real Work Preparation → canonical AttemptId → host-local JobId → real Deployment Port → **one** InvocationId →
real local Node spawn → real PID/exit → host-private correlation → recorder ingestion → per-invocation durable
evidence → readback validation → real-format `RUN_STARTED`/`TRIAL_RECORDED` → verified Run Claim →
`RUN_ATTEMPT_CORRELATED`.

Measured on the positive run: one invocation identity throughout, a real pid with a coherent exit code, **3
events accepted / 0 rejected / 3 persisted / 3 read back**, a complete lifecycle, an intact journal and a
verified claim.

The chain reaches `RUN_ATTEMPT_CORRELATED` and **stops**. It never becomes `LIVE_PRIMARY` provenance.

### Negative mutations — all refused

| Mutation | Result |
|---|---|
| N1 second invocation identity | `PROVENANCE_CONFLICT` |
| N2 one persisted event removed | `PROVENANCE_INCOMPLETE` |
| N3 durable AttemptId changed | `PROVENANCE_CONFLICT` |
| N4 wrong Run Claim nonce | `PROVENANCE_CONFLICT` |
| N5 duplicate Trial | `PROVENANCE_CONFLICT` |
| N6 copied Origin Marker substituted | `ORIGIN_NOT_ESTABLISHED` |

Building the chain found two further gaps, now closed: the correlator binds the record's invocation to the
trusted sink binding, and a correlated state requires a **complete** observed lifecycle rather than a valid but
truncated stream.

---

## 5. Product compatibility

Unchanged: Work Attempt preparation, scheduling, settlement, verification, promotion, the Worker Outcome
vocabulary, context compilation, Context Pull authorization, host failure classification, replay/retry and the
model-visible payload. Architecture PASS (0 violations), public API PASS (0 added), immutability PASS
(21 protected namespaces, 0 changed, 0 removed). All 80 work/delegation/context-pull tests pass unchanged.

`test/r3l0ciarlcf_gates.test.ts` remains **`BLOCKED_FOR_SAFETY`**. The thirteen archived-plan closure-binding
failures are tracked separately as `ARCHIVED_PLAN_COMPATIBILITY = DRIFTED_EXPECTED`; the closure guard was not
weakened and the archived plan was not regenerated.

---

## 6. Verdicts

```
PORT_OBSERVATION_PRODUCER                 = PASS_LOCAL_NONMODEL
SINGLE_INVOCATION_IDENTITY                = PASS_LOCAL_NONMODEL
HOST_JOB_ATTEMPT_BINDING                  = PASS_LOCAL_NONMODEL
NONEMPTY_PROCESS_OBSERVATION              = PASS_LOCAL_NONMODEL
PROCESS_EVENT_SEQUENCE_VALID              = PASS_LOCAL_NONMODEL
DIRECT_CHILD_PID_EXIT_COHERENCE           = PASS_LOCAL_NONMODEL
DURABLE_EVENT_READBACK                    = PASS_LOCAL_NONMODEL
DURABLE_EVENT_INTEGRITY                   = PASS_LOCAL_NONMODEL
RECORD_DUPLICATION_REFUSED                = PASS_LOCAL_NONMODEL
ACTUAL_JOURNAL_SCHEMA_COMPATIBILITY       = PASS_REAL_JOURNAL_FORMAT_FIXTURE
JOURNAL_INTEGRITY_VERIFIED                = PASS_REAL_JOURNAL_FORMAT_FIXTURE
RUN_CLAIM_VERIFIED                        = PASS_REAL_JOURNAL_FORMAT_FIXTURE
DURABLE_TRIAL_IDENTITY_VERIFIED           = PASS_REAL_JOURNAL_FORMAT_FIXTURE
CALLER_FORGED_ORIGIN_REFUSED              = PASS_LOCAL_NONMODEL
LOCAL_HOST_ORIGIN_BOUNDARY                = PASS_LOCAL_TRUST_MODEL
CANONICAL_ATTEMPT_LOCATOR                 = PASS_SOURCE_GROUNDED
INCOMPLETE_DISCOVERY_REFUSED              = PASS_SOURCE_GROUNDED
MODEL_VISIBLE_CONTEXT_UNCHANGED           = PASS
WORK_SEMANTICS_UNCHANGED                  = PASS
HISTORICAL_EVIDENCE_IMMUTABILITY          = PASS
INDEPENDENT_HOST_ORIGIN_AUTHENTICATION    = NOT_ESTABLISHED
REAL_DSH_ARTIFACT_COMPATIBILITY           = NOT_ESTABLISHED
REAL_DSH_WORKER_PROCESS_ATTESTED          = NOT_ESTABLISHED
ACTUAL_PROVIDER_ROUTE_ATTESTED            = NOT_ESTABLISHED
LIVE_PRIMARY_PROVENANCE                   = NOT_ESTABLISHED
EXTERNAL_AUTHORITY                        = NOT_ESTABLISHED
HOST_SPEND_ENFORCEMENT                    = NOT_ESTABLISHED
CURRENT_LAUNCH_PERMISSION                 = FALSE
PAID_EXECUTION                            = NOT_RUN
CAUSAL_RESULT                             = NOT_EVALUABLE
```

---

## 7. Final acceptance question

**YES, measured.** A single actual local Port invocation produced real process observations, bound them to the
Work Owner's AttemptId and the Host's JobId, preserved those exact non-empty events, and correlated them through
an intact frozen Journal and a verified Run Claim — while refusing fabricated records and preserving the
canonical authority boundaries.

This stage does **not** authorize real PRIMARY. Zero genuine DSH model launches. Zero paid model calls. No new
PRIMARY observations. No R3-L1. No Fusion. No historical research rewrite. No merge to `main`.
