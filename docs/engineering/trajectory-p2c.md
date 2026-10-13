# Trajectory-P2-C — Attributed Execution Trajectory & Handoff Preview

**Stage:** `Trajectory-P2-C`
**Baseline:** `7e92cdce852f24d659bd2f986ffb26db2c90231a` (branch `trajectory-p2b-durable-execution-association`)
**Branch:** `trajectory-p2c-attributed-execution-preview`
**Completion state:** `TRAJECTORY_P2C_ATTRIBUTED_EXECUTION_PREVIEW_QUALIFIED`

## 0. What this stage establishes

Real, durably associated DSH execution evidence is now available through a **normal product-composed,
read-only, Attempt-scoped Trajectory Preview** — and nothing unqualified can become trusted execution
history. A real canonical Work Attempt, run through the ordinary product composition, produces a
first-party DSH Session observation; the association is durably recorded; the original process ends; and
an independent process recomposes the product and presents the **actual DSH events** through the
read-only Preview.

The governing principle from §20 is honored: *Trajectory may present execution facts only to the extent
that their identity, provenance, observation basis and admission are actually established.*

## 1. P2-C0 — Association Admission Readiness (C2)

Fifteen baseline falsifiers (F1–F15) were pinned in `test/trajectory_p2c_source_contract.test.ts`, then
the ones that were real defects were closed:

| Gap | Baseline | Correction |
|---|---|---|
| **F1** | the P2-B cold gate handed Process A's `sourceBasis` to Process B | Process B now **derives its own** trusted basis from executable facts |
| **F2** | `computeTrustedSourceBasis` hashes path strings | documented as the honest limit: a local composition boundary, not content attestation |
| **F3** | `sourceKind` was never consulted | a record's kind must be a supported producer kind and must agree with the matching epoch |
| **F4** | a finalization before the observation was accepted | the window is derived from the durable record ORDER |
| **F5** | `observedCandidateCount` was unchecked | compared to the actual candidate set |
| **F7** | no currentness protocol | capture the store head before the async read, recheck after → `RACED` |
| **F8** | `eventId` was not validated | enforced on append AND replay |
| **F9** | row columns were not compared to the payload | both indexed columns are checked, failing closed |
| **F10** | Work revalidation only checked record existence | reuses `admitAttempt`, verifying the exact `ATTEMPT_CREATED` |
| **F11** | a contradictory binding could expose events | `validateAdmissionInvariants` refuses it |

## 2. P2-C1 — Product Composition (C3)

- The **host derives its own work-worker facts** (`deriveWorkWorkerFacts`), exactly as it derives its
  branch host; the install derives a real Work Worker Port from them. **No host facts ⇒ no port**, never
  a stub, and composing the capability starts nothing.
- The **official DSH reader moved into the shipped host package** (`palimpsest-host-deployment`);
  `scripts/trajectory_v0/dsh-session-reader.mjs` is now a thin re-export, so research and product share
  **one** reader. It mounts lazily on first use.
- `src/composition/execution_association.ts` composes the store, recorder, qualifier and reader with
  correct ownership (the store is `INSTALL_CREATED_AND_MANAGED`); `src/composition/attributed_preview.ts`
  is the read-only surface, exposed as `installed.trajectory.attributedPreview`.
- `install_contract.ts` was **not grown** — it sits at its §22 hotspot ceiling, so the new contract
  attaches through widened type aliases in `install.ts`.

## 3. P2-C2 — Attributed Event Admission (C5)

The adapter admits an Attempt through the **same `admitAttempt`** the ordinary Preview uses (zero reads
for an unknown attempt), then takes read authority **only** from the qualifier. Invocation selection is
explicit: a caller selector is a selector, several qualified invocations refuse rather than
auto-selecting, and a caller Claim never becomes the id. Events are exposed only when the cross-field
invariants and the page integrity hold.

## 4. P2-C3 — Real Cold-Recovered Product Preview (C6)

`scripts/trajectory_p2c/cold-preview-gate.mjs` — **PASS**, two independent processes through the normal
product:

- **Process A** composes `installPalimpsest` with the host-derived facts, starts real work through
  `installed.workDelegation`, and the product-composed recorder durably records the association. The
  Attempt stays **RUNNING**; no Promotion.
- **Process B** recomposes the product and calls the normal read-only Preview. Measured:
  `SELECTED_UNIQUE`, `BOUND_VERIFIED`, `ADMITTED_TO_ATTEMPT`, `READ_OK`, **3 attributed events**,
  coverage `FULL`, model calls **0**.

## 5. Verdict

`TRAJECTORY_P2C_ATTRIBUTED_EXECUTION_PREVIEW_QUALIFIED`, with the Node `v24.14.1 < >=24.15.0` runtime
limitation disclosed and the honest limits recorded (path-based source basis; no cross-owner atomic
snapshot; the Preview is inspection data, not an instruction to resume an Agent).
