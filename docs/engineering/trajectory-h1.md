# Trajectory-H1 — Source Consistency & Binding Contract Qualification

**Stage:** `Trajectory-H1`
**Baseline:** `789f7ee16e86f34cef910c4a0b425a38df470a58` (branch `trajectory-v0s-h0-consumer-hardening`)
**Branch:** `trajectory-h1-source-binding-contract`
**Completion state:** `TRAJECTORY_H1_SOURCE_AND_BINDING_CONTRACT_QUALIFIED`

H1 corrects three contract weaknesses H0 left in the Trajectory consumer, and prepares — but does not
implement — the real Attempt→DSH Session identity producer. It changes no canonical owner, adds no
store, no scheduler and no second Harness, and does not make `BOUND_VERIFIED` reachable in production.

---

## 1. Why H1 was necessary

H0 delivered qualified *consumer integrity*, not real execution binding. Three of its contracts were
still weak, and H1's baseline falsifiers (F1–F10) reproduced each one against the exact baseline.

1. **The DSH reader located the persisted/synthetic boundary with a SECOND, independent read.** It
   compared that read's stored count against the cold read's total, which *already contains* the
   synthetic closers. F1 is the arithmetic counterexample: with 2 stored events and 2 closers, a later
   prefix read of 3 satisfies `3 <= 4`, so a synthetic closer of the observed read is reclassified as
   persisted. DSH also documents that reads concurrent with a mutation carry no ordering promise beyond
   the valid contiguous prefix, so the two reads need not share a snapshot at all.

2. **Coverage came from two numbers.** `returnedCount >= knownEventCount` never inspected the returned
   event array. F2 shows a page claiming 50 events with an EMPTY array reporting FULL and producing a
   COMPLETE Preview; F3 shows a nonzero-cursor page claiming whole-history FULL; F4 shows malformed
   watermark, count, identity and sequence metadata all accepted.

3. **`classifySessionBinding` accepted a bare `canonicalBindingPresent: boolean`.** That flag was not
   tied to any SessionId, so `true` plus any claimed id yielded `BOUND_VERIFIED` for that id, and the
   composition then set the established id from the result. H0 was safe only because it always passed
   `false`; a naive P2 integration wiring that flag to an IPC message would have silently elevated a
   caller-controlled SessionId.

---

## 2. C1 — Baseline falsifiers and the official DSH audit

Ten falsifiers, classified honestly (6 `DYNAMICALLY_REPRODUCED`, 4 `SOURCE_DEMONSTRATED`, 0
`NOT_ESTABLISHED`), plus a source map of the installed DSH `0.2.0-rc.2` and answers to all thirteen
§4.2 audit questions, measured against a test-owned session root.

The audit's decisive finding: **the official `readColdSessionLog` is itself a single-read derivation.**
It opens one read handle, calls `handle.read(0, undefined)` once, closes the handle, and returns
`[...storedEvents, ...interruptedTurnClosers(storedEvents)]`. The same seam is therefore available to a
consumer, and the §4 answers were confirmed by measurement rather than assumed:

- one `handle.read(0, undefined)` returns the complete validated stored prefix (exact counts on a
  balanced and an interrupted session);
- `interruptedTurnClosers(stored)` over that array reproduces the official cold read byte-for-byte in
  length, sequence, type and turn-end reason;
- the helper does not mutate its input, and the returned outer array is caller-owned while event values
  are `shared-frozen`;
- `close()` is idempotent, and the error taxonomy is name-based and distinct;
- reading does not alter the stored artifact (sha256 identical before/after).

Evidence: `git-baseline.json`, `dsh-source-map.json`, `baseline-falsifiers.json`.

---

## 3. C2 — Single-read durability provenance

The reader no longer imports `@deepseek-ai/dsh-session-query` at all. `readStoredPrefix` now opens ONE
official read handle, takes ONE validated contiguous prefix, and derives the closers from **that same
array** with DSH's own `interruptedTurnClosers`. The boundary is the stored array's own length, so
classification is positional and cannot be revised by a later append.

`observedEvents = storedEvents + interruptedTurnClosers(storedEvents)`

Seven first-party no-model tests (`test/trajectory_h1_durability.test.ts`) cover §6.4 S1–S7: a balanced
session with zero closers; an interrupted tail whose closers are never reported as stored; byte-parity
with the official cold read; a deterministic append that does NOT retroactively reclassify an
already-observed boundary; a supported `buildForkSeed` child whose inherited events stay attributed to
the inherited cut; explicit failure and cleanup; and read-only source integrity across five reads.

`PERSISTED_DSH_EVENT` is defined precisely: **an event read back from this persistence backend's stored
log**. It does not prove a resolved flush barrier, crash durability, Work settlement, tool success,
promotion or a verified binding.

Evidence: `single-read-durability.json`, `dsh-cold-read-parity.json`, `dsh-concurrency-boundary.json`.

---

## 4. C3 — Session page integrity and coverage

New module `src/trajectory/page_integrity.ts`. `validateSessionEventPage` structurally validates a whole
`DshSessionEventPage` and only then derives coverage:

| state | meaning |
|---|---|
| `VALID_FULL` | consistent, and covers the whole known Session-local range |
| `VALID_PARTIAL` | consistent, covers part of it |
| `VALID_UNKNOWN_COVERAGE` | consistent, but the source reported no total |
| `NOT_APPLICABLE` | no admitted page, so no coverage is claimed |
| `INVALID` | the page contradicts itself |

Thirteen bounded reason codes name exactly what failed. The validator checks read state, session
identity across page/header/every event, the attributed session against verified binding evidence, every
numeric field, `returnedCount === events.length`, the requested maximum, the known total, sequence
contiguity, the watermark, the cursor, the watermark's position inside the known range, and the
durability metadata.

`FULL` additionally requires the page to **begin at the start** of the Session-local range and to reach
the known end, so a nonzero cursor cannot claim whole-history coverage. The H0 two-number helper
`eventPageCoverageOf` was **deleted**, not deprecated: no remaining entry point can produce FULL from
counts alone.

An `INVALID` page **fails closed**: coverage becomes `NOT_APPLICABLE`, ZERO events enter the execution
view, the lifecycle reports `SESSION_UNREADABLE`, and the Preview cannot be `COMPLETE` — while the
canonical Work facts and project context are untouched, so a malformed Session page never fabricates a
Work failure or a promotion change.

Evidence: `page-integrity.json`, `event-coverage.json`.

---

## 5. C4 — Binding authority contract

New module `src/trajectory/binding.ts`. The invariant is structural rather than conventional:

> A verified Attempt SessionId is derived from verified producer-side binding evidence. It is never
> derived from the caller's Session claim.

- `classifySessionBinding` **lost** its `canonicalBindingPresent` input and its `BOUND_VERIFIED` branch.
  Enumerating its whole reachable input domain yields exactly five states, none of them verified.
- `resolveVerifiedSessionBinding` is the **only** function that can name a verified session. It takes
  the id from an `AttemptSessionAssociation` and does not accept a caller claim at all. It requires
  `PRODUCER_OBSERVED`, a non-null `durableBindingRef`, `verification === VERIFIED`, and an exact project,
  attempt and (when supplied) invocation match.
- The composition now sets `dshSessionId` from the resolution. No producer is composed, so it is always
  null and the resolution is `NO_ASSOCIATION_EVIDENCE`.

All eight §8.7 counterexamples pass with deterministic, fail-closed semantics: claim/producer
disagreement (B1), wrong Attempt (B2), wrong Invocation (B3), duplicate identical evidence (B4),
contradictory Session identities (B5), missing durable evidence (B6), restart readability (B7) and the
ordinary zero-read Preview (B8).

Evidence: `binding-authority-contract.json`, `binding-conflict-controls.json`.

---

## 6. C5 — Limited supporting semantics

- **§9.1 Relation trust boundary.** `selectAttemptWorkRelations` is documented and tested as a SELECTOR
  OVER A T0-VALIDATED PROJECTION, not a standalone validator of arbitrary input. It enforces the
  Attempt-scoped role requirement on its own authority and relies on T0 for source verification, node
  identity and edge establishment. It does not become a second Work Relation Builder.
- **§9.2 Quarantine precision.** Entries now carry a stable `edgeId` and are deduplicated by it, so two
  distinct rejected edges of one relation both remain visible. Scope now requires the edge to touch one
  of the attempt's OWN identities, so a shared authorization node no longer attributes another
  Attempt's rejected relation to this Attempt.
- **§9.3 Host coverage.** Provenance and coverage are separate dimensions. `COMPLETE` now requires both
  a spawn and an exit to have been observed; a spawn-only observation reports `PARTIAL`. A caller's
  `exited: true` is still not independent proof of exit, and an IPC report is still not proof of Work
  settlement.
- **§9.4 T0 `traceAttempt`** — **DEFERRED**. The label-substring matcher is recorded with its precise
  impact (it is a T0 public helper, NOT on the Attempt-scoped consumer path). A correct fix needs new T0
  domain structure and is deferred to an independently reviewable T0 correctness slice.
  `src/trajectory/projection.ts` is byte-identical to the baseline.
- **§9.5 Failure taxonomy.** An unattributable projection failure is reported as `UNKNOWN_SOURCE_STAGE`,
  structurally, and is explicitly NOT attributed to an optional owner. A `TrajectoryRefusal` is still
  named as `CANONICAL_WORK_VALIDATION` with its kind.

Evidence: `relation-evidence-audit.json`, `host-provenance-audit.json`, `t0-trace-attempt-audit.json`.

---

## 7. Architecture, complexity and regression

**Architecture.** Modules added: `src/trajectory/binding.ts`, `src/trajectory/page_integrity.ts`.
Modules modified: `execution.ts`, `handoff_preview.ts`, `relation_admission.ts`, `index.ts`,
`src/composition/trajectory_v0.ts`, `scripts/trajectory_v0/dsh-session-reader.mjs`. The composition
adapter stays under the SR-1 §25 700-line cap (692 lines); the new policy lives in the trajectory layer,
not the wiring. One import cycle introduced during C5 (`handoff_preview` ↔ `page_integrity`) was found by
`architecture:check` and fixed by moving the coverage vocabulary beside the validator. **No new
persistent state, store, scheduler, canonical owner or Harness.** No DSH runtime code changed. The
implementation remains read-only.

**Gates.** `npx tsc -b` PASS. `module-architecture --check` PASS (0 violations, 9 accepted baseline
exceptions). `--check-public-api` PASS (0 missing, 0 changed kind, 0 added). Focused trajectory suites
16 files / 211 tests, all passing. Architecture self-tests 22 files / 315 tests, all passing.

**Broad suite.** 329 files / 4,642 tests at `--maxWorkers=2`: 4,629 passed, 13 failed. All 13 are
archived `r3l0ciarl*` closure drift — 5 in `r3l0ciarlcfsh_persisted`, 5 in `r3l0ciarlcfs_gates`,
2 in `r3l0ciarlc_gates`, 1 in `r3l0ciarl_gates` — with per-file counts (1, 2, 5, 5) **identical** to
what H0 reported at its own baseline. An isolated worktree pinned at `789f7ee` was built and the same
archived family run there, producing the identical 15 failures (including the 2 in the excluded
`r3l0ciarlcf_gates`). The cause is the archived plan closure digest, computed over a fixed module list
that does not include the new Trajectory modules.

`test/r3l0ciarlcf_gates.test.ts` was **excluded from the broad run** because it imports a legacy
isolated-mutation path; it was run explicitly and individually, and its 2 failures reproduce at the
baseline. One earlier broad run showed a 14th failure — `r3l0c_g0_cleanup` S1-B2b timing out at 30s
under the 4,642-test load — which passes 10/10 in isolation and is classified as an environment
limitation, not a regression. **Zero new regressions.** No frozen historical evidence was regenerated
and no contract test was weakened to obtain a green result.

---

## 8. Deferred and explicitly unproven

Not implemented or not proven in H1:

- the Attempt→DSH Session identity producer (P2-A);
- durable Attempt→Invocation→Session binding and cold recovery (P2-B);
- retry cardinality persistence;
- live PRIMARY provenance;
- automatic Agent Handoff;
- the T0 `traceAttempt` exact-identity correction.

No real IPC identity report exists, no real Parent-owned durable binding exists, cold recovery was not
tested, no live model execution occurred, and PRIMARY was not enabled.

---

## 9. Environment

Node `v24.14.1`, pnpm `11.21.0`, DSH `0.2.0-rc.2`. The repository declares `engines.node >= 24.15.0`,
so the installed Node is **below** the documented minimum. Every test reported here ran under it, and
the runtime acceptance result is qualified accordingly. No system-wide runtime change was made.

---

## 10. Evidence index

`research-evidence/trajectory-h1/`: `git-baseline.json`, `dsh-source-map.json`,
`baseline-falsifiers.json`, `single-read-durability.json`, `dsh-cold-read-parity.json`,
`dsh-concurrency-boundary.json`, `page-integrity.json`, `event-coverage.json`,
`binding-authority-contract.json`, `binding-conflict-controls.json`, `host-provenance-audit.json`,
`relation-evidence-audit.json`, `t0-trace-attempt-audit.json`, `regression.json`,
`h0-forward-erratum.json`, `p2-readiness.json`, `final-verdicts.json`.

All protected historical evidence (`trajectory-t0`, `trajectory-v0`, `trajectory-v0s`,
`trajectory-v0s-h0`, `r3-l0c-g1`, `r3-l0c-g1b`) is byte-identical to the baseline. Every correction to
an earlier H0 claim is recorded forward in `h0-forward-erratum.json`; no historical evidence file was
edited.
