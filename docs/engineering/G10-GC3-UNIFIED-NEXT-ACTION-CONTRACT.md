# G10-GC3-0 — Unified Next-Action Admission Contract (frozen)

This document freezes the admission contract GC3 implements. It is an
implementation-baseline contract, not a change to PLMP-PAG-0.

## 1. Compile ≠ Admit ≠ Execute ≠ Complete

```text
Compile   = an untrusted producer returns a candidate          (non-canonical)
Admit     = validate a complete candidate against current state (canonical write)
Execute   = Work / prospective-memory side effects
Complete  = the WakeCycle records the exact admitted action
```

A `compilationId` string proves none of `which action`, `which watches`, `which
reason`, `which Campaign basis`, `which BeliefState`, `which WakeCycle`, or
`which Reconciliation`. Therefore:

```text
CompilationId ≠ CompiledCampaignAction
Candidate     ≠ canonical state
```

## 2. The trust model is not compiler authorship

`CampaignCompiler` remains untrusted and compile remains non-canonical/read-only.
The admission guarantee is:

```text
Admission ⇒ a complete, strictly parsed, FRESH CompiledCampaignAction
```

NOT "cryptographic proof that the compiler authored it". Any candidate, from any
producer, is admissible iff it passes the complete parser + freshness + admission
rules. An auditor can prove *which validated candidate was admitted*, not *which
model process authored it*.

## 3. One union, one boundary

The production surface exposes ONE operation accepting a `CompiledCampaignAction`:

```ts
admitCompiledNextAction({ campaignId, compiled })
```

It dispatches internally on `compiled.action.kind`. A caller MUST NOT pass
`reason`, `watches`, `compilationId`, `reconciliationDigest`, or `wakeCycleId` as
independent semantic inputs — they are derived from `compiled`.

## 4. Candidate digest ≠ admission key

```text
candidateDigest  = semantic identity of the complete candidate
                   (domain: palimpsest.compiled-campaign-action.v1)
admissionKey / waitAdmissionId = operation / idempotency identity
```

They are not interchangeable. `candidateDigest` covers `compilationId`, Campaign
basis, `beliefStateDigest`, the optional `(wakeCycleId, reconciliationDigest)`
pair, and the complete action content.

## 5. Freshness (one evaluator, both arms)

`evaluateCompiledCampaignActionFreshness` is pure/read-only (never appends). First
admission requires:

```text
current Campaign basis      == compiled basis
current BeliefState digest  == compiled beliefStateDigest
```

If `compiled.wake` is present:

```text
lifecycle == RECONCILING
current incomplete WakeCycle == compiled.wake.wakeCycleId
committed reconciliation.digest == compiled.wake.reconciliationDigest
```

If `compiled.wake` is absent, the candidate is refused while WAKING/RECONCILING.
A wake mismatch is `stale` — never repaired by "whatever wake is current now".

Idempotent retry exception: once the exact candidate is already admitted, a retry
returns its existing admission even though the basis advanced or the wake
completed — but only if `candidateDigest` matches; otherwise `conflict`.

## 6. Completion requires an admitted action ref

`WAKE_CYCLE_COMPLETED` references the exact admitted action
(`WakeCompletionActionRef`). A historical Project or WAIT reference can never
complete a later wake.

## 7. Ownership

Admission correlation lives in Campaign history. There is no
`NextActionDatabase`/`CompiledActionStore`, no second watch store, and no new
global authority root. Work owns the Project; Campaign stores the exact
`CampaignProjectRef`.
