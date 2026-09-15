# G10-AA — Trusted Promotion Outcome Admission & Terminal-Fact Integrity

Campaign specification (executed). Baseline:

```text
orangeofcarl0-sys/palimpsest
main @ 0164aab755a1372e4f1c81e391c2fd2f73a661f3
```

Closes `CF-Z-02`.

## 1. Mission

> No new promotion terminal fact may enter the canonical EventStore unless it is
> structurally anchored to the exact PREPARED intent and admitted by a trusted,
> one-shot effect-outcome witness.

and:

> Replay verifies terminal structure without re-contacting Ordarium.

## 2. Threat model

Defended: a generic `EventStore` writer, a plugin/module writer, an accidental
alternate ingestion path, a direct-append bypass.

Not defended: same-process arbitrary malicious code that imports the admission
module; an attacker who can rewrite SQLite, the hash chain, or process memory;
cryptographic remote attestation. See `PROMOTION-TERMINAL-ADMISSION.md` §3.

## 3. Firewalls

As listed in `PROMOTION-TERMINAL-ADMISSION.md` §2.

## 4. Two validation planes

Plane A (structural, replay-safe) runs in `validate` and therefore in live append,
`verifyFull()` and `rebuildProjections()`. Plane B (live-only) runs in
`validateAdmission` and requires the capability. The existing EventStore split is
preserved, not replaced: `append` runs both planes, replay runs Plane A only.

## 5. Structural rules

```text
event.entity_id == payload.promotion_id
a PREPARED intent exists for the promotion
the promotion's current projected state is PREPARED (exactly one terminal)
PREPARED.promotion_id == terminal.promotion_id
PREPARED.attempt_id == terminal.attempt_id
PREPARED.source_commit == terminal.source_commit
PREPARED.expected_head_commit == terminal.expected_head_commit
COMMITTED: resulting_head_commit non-null
FAILED:    resulting_head_commit null
```

Read from the `promotions` projection, which is time-correct during replay. Never
inspects future events, never queries Ordarium or Git.

## 6. Terminal validation does not consult current Work eligibility

A recovered effect may be proven to have happened even when the task is now
`STALE`. Terminal structure is anchored to the admitted PREPARED intent, so Z's
"effect truth can still be recorded honestly" exception stands (§10 of Z).

## 7. Matching the PREPARED is necessary but not sufficient

A foreign writer can copy PREPARED fields and invent a resulting head. Matching is
**structural integrity, not effect proof**, so live admission stays mandatory.

## 8. The witness

`PromotionOutcomeWitness` is ephemeral: it authorizes one local append, is not a
second ledger and not a persistent authority store, and is consumed on use. It
carries promotion id, intent reference, operation id, input digest, outcome kind,
source commit, expected head, resulting head, basis, and an optional outcome
digest. `PromotionIntentPermit` is its counterpart for the intent.

## 9. No caller-constructible witness

No `{ trusted: true }`, no plain-object capability. A module-private brand plus a
one-shot registry means a plain object **and** a structural copy of a real
instance are both refused; `AA-N24` asserts the second case explicitly.

## 10. Generic append rejects promotion facts

```text
store.append(PROMOTION_COMMITTED) → denied
store.append(PROMOTION_FAILED)    → denied
store.append(PROMOTION_PREPARED)  → denied
```

even when structurally perfect. Only the governed path may create them.

## 11. Outcome bases

`invoke_result`, `ledger_receipt`, `reconciled_result`, `deterministic_failure`,
`denied`, `cancelled`, `authority_revoked_before_dispatch`. An uncertain or
in-flight operation yields none.

## 12. Uncertain states get no terminal

`proposed`, `authorized`, `claimed`, `dispatched`, `uncertain`, `busy`, `unknown`
→ no witness, no `COMMITTED`, no `FAILED`, fence intact.

## 13. Operation, result and outcome-kind binding

The witness binds the same deterministic operation identity the effect used, its
input digest, and its outcome. A success witness cannot authorize `FAILED`; a
failure witness cannot authorize `COMMITTED`; a witness for `H1` cannot authorize
a `COMMITTED` claiming `H2`.

## 14. One-shot and request binding

A capability cannot cross project, promotion, attempt, source commit, expected
head, resulting head, or event/request identity, and after a successful append it
is dead. An admission failure does **not** consume it, so a retry is possible. An
idempotent retry of an already-stored identical terminal returns history with no
fresh capability.

## 15. Durable provenance

Optional `operation_id`, `outcome_basis`, `outcome_digest` on terminal payloads.
Additive and optional, so legacy digests are unchanged; the full receipt and any
secrets are not stored.

## 16. Legacy replay compatibility

Historical terminal events predate AA. They are never rewritten and never require
a live capability during replay: Plane B does not run during replay at all, and
the structural plane holds for every canonical promotion history (no fixture or
log contains a terminal without a PREPARED).

## 17. Replay is offline

`verifyFull()` and `rebuildProjections()` must not touch Ordarium, Git, or the
admission module. Proven mechanically by replaying with the effects runtime closed
and with a git port that rejects every call.

## 18. Agent / management surfaces

No agent-facing tool may mint a capability, choose an outcome basis, raw-append a
promotion terminal, or bypass terminal admission. Agents keep using the governed
promotion surfaces.

## 19. No new authority store

Ephemeral capabilities, the existing EventStore, the existing Ordarium ledger, and
the existing `promotions` projection are all that is used.

## 20. Adversarial items

`AA-N01`…`AA-N30`, plus explicit fake-PREPARED tests (`AA-N24`).

## 21. Machine invariants

`OT-A01`…`OT-A31` as enumerated in the campaign spec.

## 22. PASS criterion

> A promotion terminal fact can no longer be created merely by constructing a
> syntactically valid Event and calling the generic EventStore. Every
> `PROMOTION_COMMITTED` and `PROMOTION_FAILED` is replay-valid only when it is the
> unique terminal transition of an earlier matching `PROMOTION_PREPARED`; and
> every NEW terminal append additionally requires a trusted, one-shot live
> admission witness bound to the exact promotion operation and outcome. Normal
> invocation, Ordarium recovery, deterministic failure and the
> authority-revoked-before-dispatch path each mint terminal facts only from their
> real outcome basis. An uncertain or in-flight operation cannot be terminalized.
> Full replay and projection rebuild require no Ordarium/Git access and remain
> compatible with existing canonical promotion history. A fabricated COMMITTED
> cannot advance ProjectHeadStatus, and a fabricated FAILED cannot erase Z's
> promotion fence.

## 23. PARTIAL / STOP conditions

PARTIAL if: `COMMITTED` validates only by matching PREPARED; `FAILED` remains
generic-appendable; the live witness is forgeable plain data; replay queries
Ordarium; recovery success cannot be recorded after Work revocation; an uncertain
outcome can be terminalized; a fake FAILED can remove a fence; legacy terminal
history becomes unreplayable.

STOPPED — SEMANTIC REBASE REQUIRED if: terminal truth can only be validated by
querying Ordarium during replay; recovery requires collapsing `COMMITTED` into
`TASK_SATISFIED`; the only design needs a second persistent receipt store; direct
terminal forgery cannot be blocked without replacing the EventStore; the witness
design requires distributed ACID; canonical main invalidates the baseline.

None of the PARTIAL or STOP conditions was hit.

## 24. Series invariant

```text
One major stage at a time; close its invariants; carry real leftovers forward.
```

```text
V   Project as Asset + Management Autonomy
W   Revision-safe Work evolution
X   Canonical repository-head evolution
Y   Atomic Work-Evidence authority
Z   Promotion authority follows current Work authority
AA  Promotion terminal facts require trusted effect-outcome admission
```
