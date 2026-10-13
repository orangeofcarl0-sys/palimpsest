# Trajectory-P2-D1 — Governed Consumer Delivery Qualification

**Stage:** `Trajectory-P2-D1`
**Baseline:** `205b4131453ad369489020e055502ee52b56222f` (`trajectory-p2d-consumer-readiness`)
**Branch:** `trajectory-p2d1-governed-consumer-delivery`
**Verdict:** `TRAJECTORY_GOVERNED_CONSUMER_DELIVERY_QUALIFIED` (see the final report for the exact gate
breakdown and the one honestly-unestablished level)

## What this stage is

The objective is to make real execution evidence reliably **deliverable to an authorized Agent consumer**,
not to prove the Agent benefits from it. P2-D0 produced a bounded, read-only Capsule obtainable by a direct
operator call. P2-D1 closes the remaining evidence-to-consumer gaps:

1. **Ingestion completeness** (C2) — a valid Session Identity report that failed durable ingestion can no
   longer disappear from the completeness judgment.
2. **Complete association currentness** (C3) — the post-Event-Read recheck now covers the whole relevant
   association basis, not just the selected invocation's own event ids.
3. **Capsule admission and byte budget** (C4) — consumer authorization, origin execution admission and
   capsule deliverability are three separate judgments, and the whole serialized Capsule is bounded in bytes.
4. **Genuine governed authorization** (C5) — the origin is resolved through the Context Owner's own rework
   lineage, so there is one meaning of "Governed Rework lineage".
5. **Attempt-bound delivery** (C6) — the qualified Capsule reaches the Worker Context boundary through the
   existing Context mechanism, DEFAULT OFF, with the consumer identity fixed by the Host.
6. **Real integration and readiness** (C7) — real first-party DSH cold recovery, regression, and a prepared
   (not executed) utility benchmark protocol.

## Authority separation (unchanged)

| Fact or capability | Owner |
|---|---|
| Project / Task / Attempt identity, authorization, settlement | Canonical Work |
| Governed Rework lineage | Context Owner / Rework Admission |
| Actual Session Identity | DSH Host |
| IPC observation | Parent Worker Port |
| Durable identity evidence | Execution Association concern |
| Association Qualification | Existing source-verifying Qualifier |
| Worker Context delivery | Existing Parent/DSH Host boundary |

A Trajectory Capsule is historical inspection data. It authorizes no tool access, command, write path, new
Task, settlement, verification, promotion, session resumption, automatic Handoff or Agent scheduling.

## Key invariants established

- A known ingestion failure cannot be laundered into a verified binding.
- A relevant change to the admission basis during Event Read cannot produce a stale `SELECTED_UNIQUE`.
- A lawful consumer lineage does not automatically imply a qualified historical Execution Capsule.
- The complete serialized Capsule satisfies its actual byte budget, measured in the delivery encoding.
- A caller cannot create permission by naming an Attempt, and cannot choose its own consumer identity.
- Historical text is data, not instructions.

## Evidence levels (reported separately)

1. Real first-party DSH source attribution and cold recovery — **ESTABLISHED**.
2. Real governed A0→A1 lineage — **ESTABLISHED** (separate test).
3. Controlled positive Capsule delivery — **ESTABLISHED** (separate test).
4. Combined real-DSH + real-governed single chain — **NOT ESTABLISHED**: the non-model DSH probe ends in
   capability refusal, so its Attempt has no completed Result, and the ruling forbids manufacturing one to
   merge the two rigs into an apparent full-chain PASS.

## No model execution

No model request occurs anywhere in this stage. No stochastic calibration or Treatment trial is run. PRIMARY
is not enabled. No personal DSH Session is read and no personal profile is modified.

## Runtime limitation

The only Node runtime available is `24.14.1`, below the documented repository minimum `>=24.15.0`. The build
and every suite pass on it; no compatible runtime was safely available without modifying global user
configuration, which the ruling forbids. This is preserved as a stated limitation.
