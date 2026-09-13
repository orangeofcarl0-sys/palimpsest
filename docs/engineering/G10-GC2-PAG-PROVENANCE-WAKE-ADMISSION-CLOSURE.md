# G10-GC2 — PAG Provenance & Wake Admission Closure

Exact Project Grounding · Canonical Belief Provenance · Wake/Reconciliation/Compilation/Admission Causality · Strict Durable Parsing · Genuine P1→Dormant→P2 Proof

Canonical baseline: `main` `0c45ac7ce60dabf8349390726bc1f6dcc8480dce`

Frozen baselines (unchanged): `PLMP-UAS-1`, `PLMP-BIND-1`, `PLMP-AGT-0`, `PLMP-PAG-0`.

> This campaign repairs exactness, provenance, causality, admission linkage, durable-parser
> strictness, and end-to-end proof completeness. It does **not** redesign Campaign,
> Institution, EvidenceHistory, CurrentBeliefState, Intervention, Prospective Memory,
> WakeCycle, CampaignCompiler, or CampaignStore semantics. There is no second store, no
> second Evidence system, and no scheduler/runtime/federation change.

---

## 1. Mission recap

Prior state: G10-G landed the PAG primitives (PASS); G10-GC made the wake loop operational
(PASS); an independent post-GC audit reclassified the *integrated* Campaign/Wake loop as
**PARTIAL — WAKE ACTION PROVENANCE & PROJECT GROUNDING REQUIRED**.

GC2 closes the audited gaps: a Campaign-linked Project was stored as a bare `projectId`
with a synthetic `revision: 0` / `digest: ""`; Work observation was silently optional;
the reconciliation carried a placeholder `previousBeliefStateDigest: "previous"`; the
production event parsers coerced via `String(...)`/`as string[]`; reconciliation was not
gated on the current wake; and a historical `PROJECT_ADMITTED`/`WAIT_DECIDED` could satisfy
a later wake.

---

## 2. Decisive invariant

After GC2, for every completed wake:

```text
WakeCompletion ⇒ CurrentWake + CurrentReconciliation + CurrentCompiledAction + CurrentAdmittedAction
```

No historical, unrelated Project or WAIT can satisfy a later WakeCycle.

---

## 3. New / changed artifacts

| Artifact | Change | Invariant |
|---|---|---|
| `src/campaign/digest.ts` (new) | `CANONICAL_DIGEST_RE`, `isCanonicalDigest`, `requireCanonicalDigest` | A digest is lowercase SHA-256 hex; `""`, `"previous"`, or any other string fails closed |
| `src/campaign/project.ts` (new) | `projectLinkedProjects`, `CampaignLinkedProject`, `CampaignProjectLinkSource` | Projects are keyed by the complete ref; same id + different ref ⇒ `project_identity_conflict` |
| `src/campaign/intervention.ts` | `parseCampaignProjectRef`, `campaignProjectRefsEqual`, `compareCampaignProjectRefs`; `materializeCampaignProjectRef` now requires a canonical digest | One strict ProjectRef parser reused by checkpoint, world snapshot, intervention, watch, admission, projection |
| `src/campaign/production.ts` | `WakeCompletionActionRef` / `AdmittedCampaignActionRef`, `parseWakeCycleCompleted`, `parseReconciliationReport`, `inFlightWake`, `committedReconciliationOf`, `checkpointDigestOf`, `admitWaitAction`, wake-gated observation/reconciliation, canonical belief provenance | Causally auditable production loop |
| `src/campaign/prospective.ts` | `WaitAdmission` + `WAIT_ADMITTED` event + parser | A wake-origin WAIT has an explicit per-admission identity |
| `src/campaign/compiler.ts` | Wake-bound `CompiledCampaignAction.wake`; correlated `PROJECT_ADMISSION_PREPARED`/`PROJECT_ADMITTED`; atomic admission + declared Intervention | A compiled candidate belongs to exactly one wake/reconciliation |
| `src/campaign/lifecycle.ts` | Checkpoint/world-snapshot parsers require canonical digests and the strict ProjectRef parser; canonical ordering | Strict durable parsing |
| `src/campaign/epistemic.ts` | `parseClaimStandingSnapshot` validates every evidence-id array element | No blind `as string[]` |
| `src/install.ts` | Compiler context uses the *current* wake's committed reconciliation (`inFlightWake` + `committedReconciliationOf`) | `CompilerContext = CurrentReconciledState` |

New event type: `WAIT_ADMITTED` (added to `CampaignEventType` and the store parser map).
`WAKE_CYCLE_COMPLETED` payload upgraded from `{wakeCycleId, nextAction}` to
`{wakeCycleId, action: WakeCompletionActionRef}` (strictly nested).

---

## 4. Provenance matrix (§140)

| Artifact | Must reference / bind | Enforced by |
|---|---|---|
| Checkpoint | CampaignBasis + exact ProjectRefs + InstitutionEpoch + canonical Belief digest | `buildCurrentCampaignCheckpoint` → `currentBeliefStateOf` + `projectLinkedProjects` |
| WorldSnapshot | WakeCycle + current Institution/Evidence/Work/Watch | `observeCurrentWorld` (wake-gated; all linked Projects load-bearing) |
| Reconciliation | WakeCycle + WorldSnapshot + before/after canonical Belief digests | `reconcileCurrentWorld` → `currentBeliefStateOf` (no placeholder, no second algorithm) |
| CompiledAction | CampaignBasis + Belief + WakeCycle/Reconciliation when wake-bound | `compileNextAction` (§64/§97 gating) |
| ProjectAdmission | Compilation + Wake/Reconciliation when wake-bound | `admitCompiledAction` (`PROJECT_ADMISSION_PREPARED`/`PROJECT_ADMITTED` correlation) |
| WaitAdmission | Compilation + Wake/Reconciliation + new checkpoint | `admitWaitAction` (`WAIT_ADMITTED` correlation) |
| WakeCompletion | exact admitted action | `completeWakeWithAction(AdmittedCampaignActionRef)` |

Every arrow is recoverable from canonical Campaign history; there is no inferred arrow
("there is some admitted Project, therefore this wake completed").

---

## 5. Stage summary

Stages were grouped where the causal invariant is a single unit (see §8 for the honest
combining note).

### GC2-A — Exact `CampaignProjectRef` grounding
- `activeIds` no longer returns `Set<projectId>`; `projectLinkedProjects` returns the
  complete `{project, sources}` list keyed by `(projectId, revision, digest)`.
- Same id with different refs ⇒ `project_identity_conflict`; checkpoint becomes
  incomplete (`state: "error"`) rather than guessing.
- Byte-identical refs seen through `PROJECT_ADMITTED` and `INTERVENTION_REGISTERED`
  deduplicate and keep both provenance sources.
- Checkpoint `knownProjectRefs` are the exact projected refs, ordered by
  `(projectId, revision, digest)`.
- Proofs: A-M01…A-M08 (`test/gc2_provenance_closure.test.ts`).

### GC2-B — Work knowledge completeness
- Zero linked Projects ⇒ no Work source required.
- ≥1 linked Project with no Work source ⇒ `reconciliation_incomplete`, zero writes.
- Any `unknown` or `error` Project standing blocks the whole observation (`unknown ≠ failed`).
- Every linked Project is observed at its exact ref; the standing is stored against that ref.
- Proofs: B-M01…B-M08.

### GC2-C — Canonical BeliefState provenance
- Reconciliation's `previousBeliefStateDigest`/`resultingBeliefStateDigest` are the
  canonical `currentBeliefStateOf(...)` digests — the placeholder `"previous"` and the
  second hashing algorithm are gone.
- Zero new revisions ⇒ previous == resulting; a changed standing changes the resulting
  digest; replay reconstructs the same `CurrentBeliefState`.
- Proofs: C-M01…C-M08.

### GC2-D — Strict production parser closure
- `parseReconciliationReport` validates exact keys, canonical digests, and semantic-set
  arrays (canonical order, duplicates rejected).
- `WAKE_CYCLE_COMPLETED` strictly parses the nested action union; unknown completion fields
  and unknown action kinds are rejected.
- `parseClaimStandingSnapshot` validates every evidence-id array element.
- Proofs: D-M01…D-M10 (including fail-closed replay of a corrupted durable row).

### GC2-E/H — Wake causal state machine
- `observeCurrentWorld` requires the requested wake to be the current incomplete wake.
- `reconcileCurrentWorld` requires lifecycle `WAKING` for a first reconciliation and the
  current incomplete wake; identical retry returns the existing commit; no second
  reconciliation is ever committed for a wake.
- `compileNextAction` binds the candidate to the current wake's committed reconciliation
  or fails; a changed basis/wake/reconciliation/belief stales the candidate before first
  admission.
- Proofs: E-M01…E-M09, H-M01…H-M08.

### GC2-F/G — Admission bound to THIS wake
- `PROJECT_ADMITTED` carries `{admissionKey, compilationId, wakeCycleId, reconciliationDigest, project}`;
  the declared Intervention registers in the same atomic batch.
- A wake-origin WAIT commits `WATCH_INSTALLED* → WAIT_ADMITTED → CHECKPOINT_RECORDED → CAMPAIGN_QUIESCING → WAKE_CYCLE_COMPLETED(wait) → CAMPAIGN_DORMANT`
  as ONE batch, with a newly derived checkpoint (never the waking checkpoint).
- `completeWakeWithAction` accepts an `AdmittedCampaignActionRef` and refuses unless a
  matching `PROJECT_ADMITTED`/`WAIT_ADMITTED` bound to that wake/compilation/reconciliation exists.
- Identical completion retry is an idempotent no-op; a different action for the same wake
  fails closed.
- Proofs: F-M01…F-M09, G-M01…G-M09.

### GC2-I — Genuine P1 → Dormant → WorkChanged → Wake → P2
`test/gc2i_genuine_e2e.test.ts` runs the complete loop with a **real** Campaign-linked P1:
P1 (revision 3, digest `1…`) is admitted before dormancy and survives the checkpoint and a
store restart unchanged; the world changes in all three planes (Institution E1→E2, Evidence
Q1, Work P1) while dormant; a real watch triggers the wake; disabled/unknown observers block
reconciliation with zero writes; the successful snapshot carries E2 + Q1 standing + the exact
P1 ref with its changed standing + the triggering watch; R1's belief digests equal the
canonical before/after digests; unchanged refresh is a zero-write no-op; the historical P1
cannot complete W1; a crash after Work admission recovers the SAME P2; P2 ≠ P1 and both
remain historical links; a second cycle compiles WAIT and a NEW `WaitAdmission` (bound to
K2/W2/R2) commits the dormancy.

### Crash matrix (§136)
`test/gc2h_crash_matrix.test.ts` injects a one-shot crash **before** and **after** each
durable commit boundary: `WAKE_STARTED`, `RECONCILIATION_COMMITTED`, `PROJECT_ADMITTED`,
`WAKE_CYCLE_COMPLETED`. Every retry converges (idempotent) or fails closed; no duplicate
Project, reconciliation, or completion is produced.

---

## 6. Ownership and firewalls (unchanged)

- **Campaign history** remains the one canonical provenance record (§141): no second
  provenance store, no `WakeStateStore`/`BeliefStore`/`WatchStore`/`CheckpointStore`.
- **Work** owns Project contents/state; the Campaign retains only exact immutable refs and
  observations (§142).
- **Evidence** owns claim bodies; the Campaign retains standing observations and belief
  history (§143).
- **Institution** owns the epoch; the Campaign observes it (§144).
- The **compiler stays untrusted**: output is a candidate, strictly parsed and
  freshness/admission-checked (§145).
- No Campaign import into Scheduler/Runtime/Federation; `src/index.ts` stays campaign-free.

---

## 7. Verification

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| focused GC2 proofs | `gc2_provenance_closure` 28 · `gc2i_genuine_e2e` 1 · `gc2h_crash_matrix` 5 |
| `pnpm test` (build + unit) | 105 files / 905 tests (baseline 102/873 + 32 new) |
| `pnpm build` | PASS |
| `pnpm build:web` | PASS |
| `pnpm test:e2e` | 21/21 |

Confirmed non-regressions: one flaky pre-existing timing test
(`ordarium_ledger.test.ts` → "carries a transiently locked open…") failed once on a full
run and passed on immediate re-run; it is timing-sensitive Ordarium-open backoff, unrelated
to campaign code. The `E2E-DEBUG-01` / `E2E-RUNTIME-03` local e2e flakes are handled by the
documented rerun protocol only.

---

## 8. Honest combining note

The GC2 stages are one causally-coupled semantic change: the event-schema upgrade
(`WAKE_CYCLE_COMPLETED` action ref, `WAIT_ADMITTED`, correlated admissions) is required by
both the parser-closure stage and the admission-linkage stage, and the wake-gating stage is
required by the E2E. Splitting them into intermediate merges would have produced commits
that knowingly violate the causal invariant the campaign exists to establish. They are
therefore delivered as **one merged stage** (`experiment/g10-gc2-project-work-grounding`)
plus the closure/verification stage (`experiment/g10-gc2-pag-final-closure`), recorded here
honestly. Stage-level machine proofs remain individually identified (A-M…, B-M…, …) so the
proof coverage is auditable per substage.

---

## 9. Final verdict

```text
G10-GC2 PAG PROVENANCE & WAKE ADMISSION CLOSURE: PASS
```

Every completed Wake now has an unbroken, replayable chain
`Wake → Reconciliation → Compilation → Admission → Completion` with no guessed identity,
no placeholder provenance, and no historical event accidentally satisfying a current
transition. Delivered in
[`G10-GC2-DELIVERY.md`](G10-GC2-DELIVERY.md).

---

## 10. Corrected G verdict (published only after GC2 PASS)

```text
G10-G CAMPAIGN, EPISTEMIC CONTINUITY & WAKE:
PASS — PRODUCTION & PROVENANCE CLOSURE VERIFIED
```

by [G10-GC](G10-GC-PAG-PRODUCTION-CLOSURE-CAMPAIGN.md) (production closure) and
[G10-GC2](G10-GC2-PAG-PROVENANCE-WAKE-ADMISSION-CLOSURE.md) (provenance & wake admission
closure). See the additive note in the G umbrella document.
