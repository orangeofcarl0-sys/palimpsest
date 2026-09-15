# Management Activity History

Normative statement of the durable, append-only, **non-authoritative** record of
what project management actually did. Closes `CF-V-02`.

---

## 1. What it answers

> What did Palimpsest choose to do? Under which management profile?
> What confirmation boundary applied? What happened?
> Which canonical mutation did it observe? Why did it stop or refuse?

## 2. It is not semantic truth

```text
ManagementActivityRecord ≠ WorkEvent          ≠ Task
ManagementActivityRecord ≠ ProjectDecision    ≠ EffectReceipt
ManagementActivityRecord ≠ Authority
```

If management causes a canonical Work mutation, the Work EventStore remains
authoritative and the activity record only **references** it. A record saying
"project revision applied" does not prove it: the UI resolves the referenced
canonical owner, and a missing ref is shown as an **incomplete audit record**.

## 3. The record

```text
recordId, projectId, sequence
candidateRef, candidateDigest, actionClass, subjects
managementProfileRef, workModePreferenceRef?, projectBasis {revision, digest, headCommit}
decision ∈ selected | needs_confirmation | not_permitted | executed | failed | interrupted
confirmed, reason, typedReasonCode
startedAt, finishedAt?
canonicalOutcomeRefs[]          stable refs into canonical owners
noncanonicalOutcomeSummary?     a TYPED summary (phase/counts), never prose truth
supersedesRecordId?             the SELECTED record this terminal closes
previousRecordDigest, recordDigest
```

`supersedesRecordId` is what makes append-only and two-phase compatible: the
SELECTED record is never rewritten, and a terminal record closes it by reference.

## 4. Two-phase, crash-honest

```text
SELECTED/SELECTED record          ← appended BEFORE the governed action
→ governed canonical action
→ terminal record                 ← appended AFTER the outcome is observed
```

If the process dies in between, history keeps an **unresolved** record. It is never
rewritten to claim success, and no distributed ACID is needed precisely because the
activity log is non-authoritative.

## 5. Classification of an unresolved record

Only **mechanically provable** classifications are allowed:

| Classification | Meaning |
| --- | --- |
| `OBSERVED_COMPLETED` | the canonical mutation the record referenced exists in its owning plane |
| `OBSERVED_NOT_APPLIED` | the intended canonical mutation is provably absent |
| `UNKNOWN` | not mechanically provable - the honest answer |
| `UNRESOLVED` | still needs a terminal |

Terminalizing writes `decision: interrupted` with a reason that **names the
classification and claims nothing**: "…no terminal activity record was written;
the canonical owner remains authoritative". Success is never inferred from prose.

## 6. What is recorded, and what is not

Recorded: management decisions from `step()`, `runBounded()`,
`applyOperatorModeChange()` and an operator Work Mode change.

**Not** recorded by default: read-only `status()`, `recommend()`, `previewStep()`
- that would be telemetry noise.

## 7. Confirmation and refusal are durable history

```text
needs_confirmation  → recorded, so the product can answer
                      "what was Palimpsest waiting for me to approve?"
not_permitted       → recorded WITH its reason, so a refusal is never hidden
                      merely because another candidate was permitted
```

## 8. Canonical outcome refs

| Action | Ref recorded |
| --- | --- |
| `APPLY_LOCAL_PLAN_REVISION`, `DISPATCH_LOCAL_WORK` | `work_event:<event id>`, `project_revision:<revision>` |
| `START_LOCAL_RECIPE` (explored) | `reasoning_cell:<cellId>` |
| `RECONCILE_PROJECT_HEAD` | `head_reconciliation:<revision>` |
| `ADVANCE_MECHANICAL_WORK` | none - it is a composite of scheduler steps; a TYPED summary is recorded instead |
| `OBSERVE`, `RECOMMEND`, `PREPARE` | none - nothing canonical was mutated |
| `RUN_LOCAL_VERIFY` | none - the verify port returns no canonical ref, and none is invented |

`ManagementStepResult` is additively typed (`candidateId`, `actionClass`,
`typedReasonCode`, `canonicalOutcomeRefs`, `activityRecordId`) while keeping
`action`/`detail` for compatibility.

## 9. Chain and storage

Per-project `sequence` + `previousRecordDigest` + a recomputed content digest give
**local tamper-evidence under normal application assumptions**. This is not
security against a hostile database administrator and is not marketed as such.
`verifyChain()` detects a sequence gap, a broken pointer, and a rewritten body.

One project-scoped table (`management_activity`), justified because no existing
owner records "Palimpsest selected candidate C under profile P and observed
result R". It is not a universal Project History store.

## 10. Content and privacy boundary

Stored: ids, digests, typed summaries, policy reasons, canonical refs.

Never stored: full private source content, Proof Vault documents, hidden
scratchpad, chain-of-thought.

## 11. Retention

v1 keeps every record. If volume becomes a problem, add explicit
pagination/retention - never silently delete history.

## 12. Operating history

`buildProjectOperatingHistory` is a DERIVED view that interleaves references to
Work Mode changes, management involvement changes, management activity and
ProjectIR revision refs. ProjectIR remains the canonical owner of every revision;
there is no universal `HistoryStore`.
