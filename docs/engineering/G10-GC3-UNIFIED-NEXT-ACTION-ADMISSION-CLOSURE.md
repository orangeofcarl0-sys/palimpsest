# G10-GC3 — Unified Next-Action Admission Closure

CompiledCandidate → Unified Admission → AdmittedAction → WakeCompletion

Canonical baseline: `main` `31e8d2246250b438fd44d6a1cea802ae50469d8d`

Frozen baselines (unchanged): `PLMP-UAS-1`, `PLMP-BIND-1`, `PLMP-AGT-0`, `PLMP-PAG-0`.

> GC3 adds no new ontology and redesigns none of Campaign, CampaignCommitment,
> Hypothesis, EvidenceHistory, CurrentBeliefState, Intervention, Watch, WAIT,
> WakeCycle, CampaignCompiler, CampaignProjectRef, or Reconciliation. It adds ONE
> admission boundary.

---

## 1. Problem statement

After GC2 the Project arm was causally complete:

```text
CompiledCampaignAction → freshness → Work admission → AdmittedCampaignActionRef → Wake completion   ✅
```

The WAIT arm was not:

```text
caller supplies { compilationId, reconciliationDigest, reason, watches } → WAIT admission → completion   ❌
```

The WakeCycle and reconciliation could be real while the `compilationId` was
made up, and the `reason`/`watches` were caller-supplied rather than the admitted
candidate's. A post-GC2 audit therefore read:

```text
G10-GC2: PARTIAL — WAIT COMPILATION ADMISSION BINDING
```

GC3 makes the old WAIT API impossible: the production surface no longer has a
`admitWaitAction({ compilationId, … })`; WAIT admission requires a complete
`CompiledCampaignAction` and derives every semantic from it.

---

## 2. Decisive invariant

```text
WakeCompletion ⇒ AdmittedAction ⇒ FreshCompiledAction
```

for BOTH union arms (Project and WAIT), with one trust boundary:

```text
untrusted complete candidate → strict parser → common freshness
                            → type-specific admission → exact ref → completion
```

---

## 3. Contract

See [`G10-GC3-UNIFIED-NEXT-ACTION-CONTRACT.md`](G10-GC3-UNIFIED-NEXT-ACTION-CONTRACT.md)
for the frozen contract. Key points: `CompilationId ≠ CompiledCampaignAction`;
admission ⇒ a complete, strictly parsed, fresh candidate (not compiler
authorship); one boundary dispatched by the candidate; candidate digest ≠
admission key/id; one read-only freshness evaluator; completion bound to the
exact admitted action.

---

## 4. New / changed artifacts

| Artifact | Change |
|---|---|
| `src/campaign/compiler.ts` | `parseValidatedCampaignAction`, `parseCompiledCampaignAction`; shared arm validators; `compiledCampaignActionDigestOf` (domain `palimpsest.compiled-campaign-action.v1`); `campaignProjectAdmissionKeyOf`; Project saga now uses the shared freshness evaluator |
| `src/campaign/next_action.ts` (new) | `makeNextActionAdmissionService` / `admitCompiledNextAction`; `campaignWaitAdmissionIdOf`; `waitCompletionActionRef`; the wake-origin WAIT atomic transition |
| `src/campaign/production.ts` | exported `lifecycleStateFromEvents`, `beliefRevisionsFromEvents`; `evaluateCompiledCampaignActionFreshness` (read-only, both arms); `buildCurrentCampaignCheckpoint(campaignId, { additionalWatchIds })`; **removed** `admitWaitAction` |
| `src/campaign/prospective.ts` | `WaitAdmission` gains mandatory `candidateDigest`; watch-id set validated (duplicates rejected, canonical order) |
| `src/campaign/lifecycle.ts` | `CAMPAIGN_QUIESCING` carries `checkpointBasisDigest` (+ optional `wakeCycleId`) so identical reasons across distinct dormancies are distinct events |
| `src/install.ts` | `InstalledCampaign.compileNextAction` / `admitNextAction` (recommended surface); the unified service wired to the Project saga + production primitives |

`WAKE_CYCLE_COMPLETED.action` is unchanged from GC2 (exact admitted action ref).

---

## 5. Candidate digest content (§25)

```text
palimpsest.compiled-campaign-action.v1:
  compilationId · campaignBasisThroughSeq · campaignBasisDigest · beliefStateDigest
  wakeCycleId (or null) · reconciliationDigest (or null) · action
```

It is deterministic across restart (pure canonical JSON) and changes when any of
the reason, watch drafts, reconciliation, basis, belief, or compilation changes.
It is NOT the admission key: `admissionKey` / `waitAdmissionId` are operation
identities.

---

## 6. Unified admission dispatch

`admitCompiledNextAction({ campaignId, compiled })`:

1. strict-parse `compiled` (unknown fields/half-wake/malformed action → `incomplete`);
2. Project → narrow Project-admission port (existing idempotent Work saga → `PROJECT_ADMISSION_PREPARED` / `PROJECT_ADMITTED` + declared Intervention), then `completeWakeWithAction` with the exact ref → ACTIVE;
3. WAIT → idempotent retry lookup, compilation-scoped conflict check, shared freshness, prospective checkpoint (`additionalWatchIds`), atomic batch → DORMANT.

The caller never chooses the arm and never supplies WAIT semantics.

---

## 7. WaitAdmission upgrade (§48–§56)

```ts
interface WaitAdmission {
  waitAdmissionId; campaignId; compilationId; candidateDigest;
  wakeCycleId; reconciliationDigest; watchIds; checkpointDigest;
}
```

`waitAdmissionId` is derived from `(campaignId, candidateDigest, wakeCycleId)` —
never from `compilationId` alone. The prospective checkpoint is built with the
watches this WAIT installs (`activeWatchIds = current active + new`, ended watches
excluded), so the checkpoint honestly represents the dormant Campaign.

---

## 8. Installed golden path (§§92–100)

```ts
installed.campaign.compileNextAction({ campaignId })
installed.campaign.admitNextAction({ campaignId, compiled })   // recommended
```

`admitNextAction` is present iff a compiler port is configured. WAIT admission
works with NO `campaignWorkAdmissionPort`; a Project candidate then fails
explicitly (`incomplete`), never silently becoming a WAIT. Low-level services
(including the initial-dormancy `production.admitWait`, which does not complete a
wake) remain available from `palimpsest-dsh/advanced`; `production.admitWaitAction`
no longer exists.

---

## 9. Verification

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| GC3 machine proofs | `gc3_unified_admission` 21 · `gc3_unified_e2e` 3 · `gc3_crash_recovery` 2 |
| `pnpm test` | 108 files / **933 tests** (baseline 105/907 + 26 new) |
| `pnpm build` / `build:web` | PASS |
| `pnpm test:e2e` | 21/21 (after the documented `E2E-DEBUG-01` flake rerun; the spec passes ~2/3 in isolation) |

Negative proofs present: N01 fake `compilationId` WAIT cannot admit · N02 with
real W/R still rejected · N03/N04 reason/watches cannot be replaced · N05/N06
basis/belief change stales · N07 unadmitted W1 candidate stale under W2 · N08/N09
historical WAIT/Project cannot complete a later wake · N10 same compilation with
a different candidate conflicts. Positive proofs P01–P07 are covered by the
unified WAIT test and the installed E2E.

---

## 10. Final causal matrix (§142)

| Step | Canonical / derived basis |
|---|---|
| Compile | Campaign basis + Belief + current W/R |
| Candidate | strict parsed immutable artifact |
| Candidate digest | complete candidate semantics |
| Admission | candidate + current freshness |
| Project action | Work admission + exact ProjectRef |
| WAIT action | WaitAdmission + exact prospective checkpoint |
| Completion | exact admitted action ref |
| Replay | Campaign history + external Work refs |

Final authority matrix (§143) unchanged: Institution continuation, Campaign
semantic authority, Evidence truth, Work governance, and Ordarium effect
authority are untouched. Unified admission is not a new global authority root.

---

## 11. PRs / SHAs / CI

| Stage | Branch | PR / merge |
|---|---|---|
| GC3-0…7 + docs | `experiment/g10-gc3-unified-admission` | PR #? → _recorded after merge_ |
| closure record | `experiment/g10-gc3-pag-freeze` | PR #? → _recorded after merge_ |

Remote CI (exact merged HEAD): _recorded after merge_.

---

## 12. Final verdict

```text
G10-GC3 UNIFIED NEXT-ACTION ADMISSION CLOSURE: PASS
```

Delivered in [`G10-GC3-DELIVERY.md`](G10-GC3-DELIVERY.md).

---

## 13. PAG freeze declaration

```text
PLMP PAG IMPLEMENTATION BASELINE:
CAMPAIGN / WAKE LAYER FROZEN
```

This freezes the current production implementation baseline against gratuitous
redesign (a nicer class name, a cleaner database layout, a more general planner
abstraction). It does NOT freeze PLMP-PAG-0 theory. Future changes require a
concrete failing use case, a contract contradiction, or a measurable architecture
limitation. Persistent-agent migration/fork/quarantine, richer belief revision,
institutional epistemic governance, generic BDI, and advanced campaign authority
remain legitimate NEW campaigns — not GC3 cleanup.

---

## 14. Corrected final G verdict (after GC3 PASS)

```text
G10-G CAMPAIGN, EPISTEMIC CONTINUITY & WAKE:
PASS — PRODUCTION, PROVENANCE, AND UNIFIED ADMISSION CLOSURE VERIFIED
```

by [G10-GC](G10-GC-PAG-PRODUCTION-CLOSURE-CAMPAIGN.md),
[G10-GC2](G10-GC2-PAG-PROVENANCE-WAKE-ADMISSION-CLOSURE.md), and this GC3
record. The original G/GC/GC2 records are preserved and only additively
annotated.

---

## 15. Canonical gate record

| Gate | Result |
|---|---|
| Remote CI (exact merged HEAD `f16055f`) | workflow `34768147435`, attempt 1: `unit` ✓, `e2e` ✓ |
| Merge | PR `#54` → `77de168` (normal merge) |
| Canonical `main` `git diff --check` | clean |
| Canonical `main` `pnpm test` | 108 files / 933 tests passed |
| Canonical `main` build / build:web | PASS |
| Canonical `main` e2e | documented `E2E-DEBUG-01` flake; remote CI e2e passed first try |

The closure verification record is delivered by
`experiment/g10-gc3-pag-freeze` (see [`G10-GC3-DELIVERY.md`](G10-GC3-DELIVERY.md)).

With GC3 PASS, **PAG closure work stops here**; the next architectural frontier is
`G10-H — RuntimeScope & Holon Grounding`, which is NOT started by this campaign.
