# G10-F0 — Coordination-History Integrity Closure

Status: **COMPLETE**

```text
F0 verdict
COORDINATION HISTORY INTEGRITY: PASS
```

Baseline: `main` @ `6afa2920dabcc0dbd1c7b5efbf3a43fbfc88f110` (G10-E campaign PASS).
Branch: `experiment/g10-f0-coordination-integrity`.

F0 exists because durable institutions (F4/F5) MUST NOT be built on a
coordination substrate where a handoff can crash between "old responsibility
superseded" and "successor responsibility present". F0 closes the three
durability gaps E left open, then (and only then) permits F1 to begin
(§27: *No Institution implementation on a non-atomic coordination substrate.*).

---

## 1. The three E-durability gaps closed (§12)

| Gap        | Meaning                                                              | Closure                                                                 |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| E-STORE-01 | A multi-event semantic transition was not crash-atomic.              | `appendAtomic` — one `BEGIN IMMEDIATE` transaction, all-or-nothing.     |
| E-STORE-02 | Two different concurrent appends could collide on `seq`.             | Write serialization (`BEGIN IMMEDIATE`) + bounded `busy_timeout`.       |
| E-PARSE-01 | Some coordination payload parsers were not fully strict.             | Centralized artifact-domain strict parsers; complete registry audit.    |

The four-event handoff transition is the concrete case: before F0,
`acceptHandoff` issued four separate `append` calls, so a crash could persist a
strict prefix (`COMMITMENT_SUPERSEDED` with no successor). After F0 the same
transition is one `appendAtomic` batch.

---

## 2. Atomic conditional batch primitive (§13)

```ts
interface CoordinationAtomicAppend {
  readonly expectedHeadSeq: number;
  readonly events: readonly CoordinationAppendRequest[];
}

appendAtomic(transition: CoordinationAtomicAppend): Promise<readonly CoordinationEvent[]>;
head(): Promise<number>;   // canonical max-seq, 0 when empty
```

Semantics (implemented in `src/coordination/store.ts`):

```text
validate ALL events (strict parser)          — before the transaction opens
reject duplicate eventIds inside the batch
BEGIN IMMEDIATE
  classify existing rows by eventId
  all present byte-identical  -> idempotent success (§18)
  some present / some absent  -> recovery_required, fail closed (§18)
  none present:
    verify canonical head == expectedHeadSeq   (else head_mismatch — §14)
    allocate ONE contiguous seq range (head+1 .. head+n)
    insert all events
COMMIT
```

Any error → `ROLLBACK`. Because every payload is validated *before* the
transaction opens, a malformed or conflicting batch can never leave a
persisted prefix.

---

## 3. Why expected head is required (§14)

Batch atomicity alone is insufficient for a state-dependent transition:

```text
Process A reads commitment ACTIVE
Process B releases the commitment
Process A writes the handoff transition   -> impossible history
```

Every state-dependent transition now follows
**read head → derive state at that head → `appendAtomic(expectedHeadSeq = head)`**.
If the head moved, the write is refused as `coordination_conflict` and the
caller re-reads and re-evaluates. No stale state-machine write is admitted.

### Contention vs conflict (§15, §17)

A global coordination head may produce conservative conflicts from unrelated
events. That is accepted — correctness before optimization; no stream-version
framework was built. The three failure families are distinguished:

| Category           | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| `database_busy`    | SQLite write contention; bounded wait exhausted.              |
| `head_mismatch`    | `expectedHeadSeq` no longer matches the canonical head.       |
| `event_conflict`   | An `eventId` already exists with different content.           |
| `recovery_required`| A declared-atomic transition is partially present.            |

All are `CoordinationConflictError` (`kind: "coordination_conflict"`), so
existing callers/tests keep their discriminant while gaining the granular
`category`. A semantic conflict is NEVER hidden as a busy retry.

---

## 4. Cross-process writer safety & busy handling (§16, §17)

- `PRAGMA busy_timeout = <bounded>` (default 5000 ms) — never an unbounded
  `while(true)` retry loop.
- `BEGIN IMMEDIATE` serializes writers, so two different events can never
  allocate the same `seq` (the `seq` range is computed inside the write lock).
- Machine proof **F0-M06**: two handles on one file, appending different
  events in parallel, both succeed with distinct `seq` and deterministic
  replay.
- Machine proof **F0-M07**: a held write lock surfaces as `database_busy` and
  writes nothing.

---

## 5. Batch idempotency (§18)

| Case                                      | Result                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| all events absent                         | insert all                                                    |
| all events present byte-identical         | idempotent success, no duplicate (even if head advanced)      |
| some present / some absent                | `recovery_required` — fail closed, never silently completed   |

The third case is deliberate: for a transition *declared atomic*, a historical
partial set indicates legacy partial state or corruption. F0 surfaces a
recovery-required condition rather than completing it.

---

## 6. Handoff atomicity closure (§19–§21)

`acceptHandoff` now commits ONE batch:

```text
COMMITMENT_SUPERSEDED
HANDOFF_ACCEPTED
successor COMMITMENT_OFFERED
successor COMMITMENT_ACCEPTED
```

- **§20 crash proof (F0-M09):** with an injected failure immediately before
  COMMIT, no persistent prefix of the four-event transition exists; the old
  commitment is still `ACTIVE` and the handoff still `OFFERED`. A retry then
  converges. After a successful commit, `old = SUPERSEDED` and
  `successor = ACTIVE` always co-exist (F0-M08).
- **§21 competing transition (F0-M10):** release vs. accept-handoff from the
  same starting head — exactly one stale-state transition commits; the other
  fails honestly (`head_mismatch`). No impossible history.

---

## 7. Strict artifact parsers (§22–§24)

"Strict means strict": every persisted artifact parser validates the COMPLETE
semantic artifact.

```text
schemaVersion exact
required fields present
unknown fields rejected
nested unknown fields rejected
stable ids validated
enum literals exact
nested refs validated
canonical arrays validated/canonicalized
no unchecked structural cast
```

Ownership split (§23):

- **CoordinationStore** owns persistence, event envelope, ordering, idempotency.
- **Artifact modules** own semantic shape: `participation.ts` (Invocation,
  Participation, ActivationRef, AttemptRef), `messages.ts` (ThreadRef,
  PeerMessage, message/ack/wake/contact payloads), `commitment.ts`
  (CommitmentOffer, CommitmentScope, HandoffOffer, commitment/handoff payloads),
  `peer.ts` (PeerRef).
- A shared `src/coordination/strict.ts` provides the primitives
  (`strictObject`, `requireString`, `requireStableId`, `requireBoolean`,
  `requireLiteral`, `requireOneOf`, `requireSchemaVersion`, `requireStringSet`, …).
- `DEFAULT_COORDINATION_EVENT_PARSERS` composes all built-in streams, so a store
  constructed without an explicit `eventParsers` option validates everything —
  misconfiguration can never silently persist an unvalidated artifact.

Parsers run on **append** (before write) and on **read** (replay). A
raw-inserted row with an unknown nested field or malformed JSON fails closed on
replay (F0-M01).

---

## 8. Canonical serialization (§26)

Persisted payload comparison continues to use canonical JSON bytes
(`canonicalJsonBytes`). Machine proof **F0-M11**: semantically equivalent
payloads with different key order produce byte-identical event identity
(idempotent, no duplicate). No `JSON.stringify(value, keys)` replacer exists.

---

## 9. Machine proofs

| Proof  | Statement                                                                 | Test |
| ------ | ------------------------------------------------------------------------- | ---- |
| F0-M01 | strict artifacts rejected on append AND read; malformed row fails closed  | `test/f0_coordination_integrity.test.ts` |
| F0-M02 | complete registry: all 17 event types parsed                             | 〃 |
| F0-M03 | stale `expectedHeadSeq` → `head_mismatch`, nothing written               | 〃 |
| F0-M04 | injected pre-COMMIT failure leaves no prefix                              | 〃 |
| F0-M05 | full-batch retry idempotent; partial set → `recovery_required`            | 〃 |
| F0-M06 | two-handle different-event append: distinct `seq`, deterministic replay   | 〃 |
| F0-M07 | held write lock → `database_busy`, nothing written                        | 〃 |
| F0-M08 | handoff commits as ONE transition; SUPERSEDED + successor coexist         | 〃 |
| F0-M09 | handoff crash: no prefix; retry converges                                 | 〃 |
| F0-M10 | competing transitions: exactly one commits, other fails honestly          | 〃 |
| F0-M11 | key order does not change event identity                                  | 〃 |
| F0-M12 | store imports no scheduler / effects / WorkGraph concern                  | 〃 |

Focused F0 suite: 14 tests. Full suite at F0 HEAD: **84 files / 724 tests passed**.

---

## 10. What F0 does NOT do

- No Organization / Coalition / Institution semantics (F1+).
- No change to Work, scheduler, runtime, Ordarium, or federation semantics.
- No stream-version framework, no per-stream heads, no storage-layout
  optimization (§15/§168).

F0 is a substrate-integrity stage only.
