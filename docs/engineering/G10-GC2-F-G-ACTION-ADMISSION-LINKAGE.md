# G10-GC2-F/G — Project & WAIT Admission Bound to THIS Wake

## The bug being eliminated

```text
historical PROJECT_ADMITTED exists → any future project wake may complete   (removed)
historical WAIT_DECIDED exists     → a future wait wake may become dormant  (removed)
```

## Project admission correlation

`PROJECT_ADMISSION_PREPARED` and `PROJECT_ADMITTED` now carry the full causality:

```ts
// PREPARED
{ compilationId, admissionKey, candidateDigest, wakeCycleId?, reconciliationDigest? }
// ADMITTED
{ admissionKey, compilationId, project, wakeCycleId?, reconciliationDigest? }
```

The wake pair is all-or-nothing (both present or both absent). The declared Intervention of
a Project proposal registers in the SAME atomic batch as `PROJECT_ADMITTED` (§81), with a
deterministic intervention id derived from the admission key, so a crash recovers exactly
one link.

`admitCompiledAction` returns the `AdmittedCampaignActionRef` for a wake-bound admission:

```ts
{ kind:"project", wakeCycleId, compilationId, reconciliationDigest, admissionKey, project }
```

## WAIT admission correlation

A wake-origin WAIT has an explicit `WaitAdmissionId` independent of `WatchId`,
`WakeCycleId`, and `CompilationId`, and commits as ONE atomic batch:

```text
WATCH_INSTALLED* → WAIT_ADMITTED { waitAdmissionId, compilationId, wakeCycleId,
                                   reconciliationDigest, watchIds, checkpointDigest }
                 → CHECKPOINT_RECORDED → CAMPAIGN_QUIESCING
                 → WAKE_CYCLE_COMPLETED(wait) → CAMPAIGN_DORMANT
```

The checkpoint is NEWLY derived after reconciliation — never the checkpoint from which the
Campaign woke. At least one newly installed (active) Watch is required. An identical retry
converges on the same `WaitAdmissionId`.

## Completion

`completeWakeWithAction({ campaignId, wakeCycleId, action: AdmittedCampaignActionRef })`:

- project: requires a `PROJECT_ADMITTED` matching the exact wake, compilation,
  reconciliation, admission key, and ProjectRef;
- wait: requires a `WAIT_ADMITTED` matching the exact wake, compilation, reconciliation,
  wait admission, and checkpoint digest;
- an identical completion retry is an idempotent no-op; a different action for the same
  wake fails closed.

`WAKE_CYCLE_COMPLETED` stores exactly `{ wakeCycleId, action }` (the nested
`WakeCompletionActionRef`), so an auditor can recover the exact admitted action that
justifies the completion.

Proofs: F-M01 historical Project cannot complete a new wake · F-M02 prepared admission
belongs to the exact compilation · F-M03 admitted Project belongs to the exact preparation ·
F-M04 completion carries the exact ProjectRef · F-M05 crash after Work admission recovers ·
F-M06/M07/M08 no duplicate Project / `PROJECT_ADMITTED` / completion · F-M09 wrong
admission key cannot satisfy the wake; G-M01 historical WAIT cannot complete the current
wake · G-M02 `WaitAdmissionId` independent · G-M03/M04/M05 bound to compilation/WakeCycle/
reconciliation · G-M06 new exact grounded checkpoint · G-M07 at least one new active Watch ·
G-M08 atomic Campaign-side finalization · G-M09 idempotent retry.
