# G10-G — Campaign, Epistemic Continuity & Wake Campaign

Campaign: **Campaign, Epistemic Continuity & Wake Grounding**
Long-Horizon Commitment · EvidenceHistory ≠ BeliefState · Hypothesis Branches ·
Intervention · Prospective Memory · WAIT · Dormant/Wake · Reconciliation ·
CampaignCompiler

Baseline at campaign start: `main` @ `3f3ab6f` (G10-F PASS).
Frozen baselines (unmodified): PLMP-UAS-1, PLMP-BIND-1, PLMP-AGT-0, PLMP-PAG-0.

## 1. Stage topology (§220)

| Stage | Branch | Focus |
| ----- | ------ | ----- |
| G0 | `experiment/g10-g0-pag-preflight-governance-closure` | F-governance closure + PAG inventory/ownership |
| G1 | `experiment/g10-g1-campaign-identity-store` | Campaign identity, commitments, CampaignStore |
| G2 | `experiment/g10-g2-epistemic-continuity` | hypothesis branches, EvidenceHistory, BeliefState |
| G3 | `experiment/g10-g3-epistemic-intervention` | intervention, operational ≠ epistemic outcome |
| G4 | `experiment/g10-g4-prospective-memory-wait` | prospective memory, watchers, WAIT |
| G5 | `experiment/g10-g5-wake-reconciliation` | lifecycle, checkpoints, wake, world reconciliation |
| G6 | `experiment/g10-g6-campaign-compiler` | compiler candidate boundary + idempotent Work admission |
| G7 | `experiment/g10-g7-pag-campaign-closure` | full loop integration, review, publication |

Every stage merged normally after its exact final HEAD proved green.

## 2. F governance closure (G0)

- **F-CHARTER-01** — proposed charters are non-canonical, digest-keyed
  candidates; canonical registration happens only inside `commitTransition`.
- **F-AUTH-01** — `approveLocal` uses the assembly-configured
  `localGovernancePeer` (≠ federation `localPeer`); callers cannot choose the
  local approving identity.
- **F-TRANSFORM-01** — REVISE requires exactly `base.revision + 1`.

## 3. Store and ownership matrices (§197/§228)

| Store | Owns |
| ----- | ---- |
| Work EventStore | Project/Task/Attempt/evidence/context-manifest history |
| Evidence plane | evidence bodies, claim standing (derived), provenance |
| CoordinationStore | participation/collaboration/commitments |
| ContinuityStore | PersistentPoint |
| OrganizationStore | Organization revisions |
| InstitutionStore | charter/epoch institutional lineage |
| **CampaignStore** | **Campaign temporal/epistemic activity history** |
| Ordarium | effect admission/operations |

No overlapping canonical truth. Campaign stores evidence REFERENCES and
observations only — never evidence bodies.

## 4. Campaign identity and commitments (G1)

`CampaignDefinition {campaignId, institutionId}`; `Campaign ≠ Project ≠
Institution ≠ RuntimeAgent`. `CampaignCommitment` is append-only
(OPENED/RESOLVED/ABANDONED/SUPERSEDED), never statement-mutated, and distinct
from federation `Commitment`. `CampaignStore` is one append-only per-Campaign
log with a chain digest and `appendAtomic(expectedBasis)` (all-or-none,
per-campaign conflict isolation).

## 5. EvidenceHistory ≠ CurrentBeliefState (G2, §191/§241)

```text
EvidenceHistory    = append-only historical observations of Evidence-plane standing
CurrentBeliefState = derived, revisioned, NON-MONOTONIC projection
```

Beliefs move `supported → contradicted → inconclusive → stale` without deleting
history; every `BeliefRevision` names the `evidenceObservationId` it came from;
there is no `setBelief`. `WorkerReport ≠ Evidence`; only admitted observations
reach belief. `refreshCampaignBeliefs` observes all active claims first and
appends atomically or nothing.

## 6. Intervention: OperationalOutcome ≠ EpistemicOutcome (G3)

Operational standing is observed read-only (`unknown ≠ failed`); epistemic
outcome is derived from pre/post target-hypothesis belief (`supporting |
refuting | mixed | inconclusive | stale | unchanged`) with no invented
confidence. `completed + refuting` and `failed + epistemically useful` are both
valid; `Project failure ≠ Campaign failure`.

## 7. Prospective memory, watchers, WAIT (G4)

Typed durable conditions (`not_before` with injected clock, `claim_changed`,
`institution_epoch_changed`, `project_terminal`, `external_signal`); `unknown ≠
triggered`, `error ≠ false`; evaluation is read-only; triggers are idempotent.
WAIT is first-class, atomic, requires ≥1 wake route, and is never failure. No
background daemon and no numeric utility scoring.

## 8. Lifecycle, checkpoint, wake (G5)

`ACTIVE | QUIESCING | DORMANT | WAKING | RECONCILING | TERMINATED` derived from
events; `DORMANT ≠ TERMINATED`; termination only explicit. `CampaignCheckpoint`
holds derived references only (no hidden CoT/context/session). `beginWake` runs
a continuity check (`wake_blocked`, never silent replay); unknown world facts
block reconciliation (`reconciliation_incomplete`); `reconcile` commits world
snapshot + commitment review atomically; `completeWake` requires a next action
(Project → ACTIVE / WAIT → DORMANT). `Wake ≠ replay`, `Wake ≠ Runtime
Activation`.

## 9. CampaignCompiler and admission saga (G6)

`CampaignCompiler ≠ Scheduler`; output is a candidate passing a strict parser
that reuses the canonical `parseProjectProposal`/`validateProjectProposal`
(`definition_id` remains Work lineage). Stale candidates are refused before any
Work mutation. Admission is a durable cross-store idempotent saga
(`PROJECT_ADMISSION_PREPARED → idempotent Work admit → PROJECT_ADMITTED`); the
same key with a different candidate fails closed; a crash after Work admission
recovers and records the link once. The compiler never sets belief, modifies
Evidence, advances an Institution, or terminates a Campaign.

## 10. Final identity matrix (§226)

| Identity | Owner | Not equivalent to |
| -------- | ----- | ----------------- |
| InstitutionId | Institution | Campaign |
| CampaignId | Campaign | Project / Institution / runtime |
| CampaignCommitmentId | Campaign | federation CommitmentId |
| HypothesisId | Campaign | Evidence claim |
| EvidenceClaimRef | Evidence plane | Hypothesis |
| BeliefRevisionId | Campaign epistemic history | Evidence |
| InterventionId | Campaign | Attempt |
| CampaignProjectRef | Work | Campaign |
| WatchId | Campaign prospective memory | runtime process |
| WakeCycleId | Campaign lifecycle | InstitutionEpoch / Activation |
| ActivationId | Runtime | Campaign |
| PersistentPointId | Continuity | Campaign |

## 11. Final authority matrix (§227/§203/§204)

```text
Institution continuation authority
Campaign administrative/operational authority
Work policy/governance
Evidence truth/admission
Epistemic belief derivation
Ordarium effect authority
```

No automatic implication among them. WAIT / belief revision / hypothesis branch
are semantic writes that grant no external effect rights; Campaign operations do
not obtain institution continuation authority.

## 12. Final PAG coverage (§225)

| PAG concept | Status |
| ----------- | ------ |
| stable Institution identity / authorized lineage | IMPLEMENTED G10-F |
| Campaign | IMPLEMENTED |
| CampaignCommitment | IMPLEMENTED |
| Project as finite Campaign phase | IMPLEMENTED |
| Hypothesis branches | IMPLEMENTED |
| EvidenceHistory | IMPLEMENTED as temporal observations/refs (truth stays in the Evidence plane) |
| CurrentBeliefState | IMPLEMENTED as non-monotonic derived projection |
| OperationalOutcome ≠ EpistemicOutcome | IMPLEMENTED |
| Prospective Memory / Watchers / WAIT | IMPLEMENTED |
| DORMANT / WAKING / RECONCILING | IMPLEMENTED |
| Campaign checkpoint | IMPLEMENTED |
| World reconciliation | IMPLEMENTED minimal relevant-world form |
| Evidence refresh / commitment reconsideration | IMPLEMENTED |
| CampaignCompiler | IMPLEMENTED |
| Project generation/admission | IMPLEMENTED via host-neutral idempotent adapter (concrete Work adapter DEFERRED where no stable key exists) |
| hidden-CoT continuity | EXPLICITLY NOT USED |
| full generic BDI / belief-revision calculus / ATMS | DEFERRED |
| generic persistent-agent migration/fork | DEFERRED |
| Holon lifecycle | DEFERRED |

## 13. Canonical checkpoints

| Stage | PR | merge commit | CI |
| ----- | -- | ------------ | -- |
| G0 | #40 | `5557484` | documented E2E-DEBUG-01 flake rerun |
| G1 | #41 | `a76bc3e` | success first run |
| G2 | #42 | `1939083` | documented E2E-DEBUG-01 flake rerun |
| G3 | #43 | `624d987` | success first run |
| G4 | #44 | `b7c2b50` | success first run |
| G5 | #45 | `d79dd4c` | success first run |
| G6 | #46 | `d328e2e` | success first run |
| G7 | #47 | recorded on branch | recorded on branch |

Known flakes `E2E-DEBUG-01` / `E2E-RUNTIME-03` used the documented failed-job
rerun protocol; no new Campaign/Wake e2e failure was observed.

## 14. Adversarial findings

All §21/§215 attacks were closed in-stage; no unresolved campaign blocker. The
campaign-wide review (`test/g7_pag_loop_integration.test.ts`) confirms:
campaign ≠ institution/project/runtime; commitment ≠ federation commitment;
evidence history ≠ belief; worker report ≠ evidence; compiler candidate ≠
canonical state; stale candidate refused; duplicate admission impossible;
`DORMANT ≠ TERMINATED`; wake ≠ replay; unknown world facts block compile; no
evidence duplication; Work/scheduler/runtime/federation independent.

## 15. Final verdict

```text
G10-G CAMPAIGN, EPISTEMIC CONTINUITY & WAKE: PASS
```

Palimpsest may now claim a substantial executable PAG subset — Campaign +
EpistemicContinuity + ProspectiveMemory + Dormant/Wake + CampaignCompiler —
integrated with the AGT/institutional foundation. It MUST NOT claim a complete
general persistent-agent architecture.

## 16. Recommended next major campaign (§246 — NOT started)

`G10-H — Holon & RuntimeScope Grounding`, or `G10-H — Persistent Agent /
Institutional Epistemic Governance`, depending on G evidence. Follow evidence.

---

## 21. Additive historical note (G10-GC, §194)

The G10-G primitives remained valid. A post-campaign audit identified production
gaps in the integrated wake loop and reclassified it:

```text
G10-G PAG primitives: PASS
G10-G integrated Campaign/Wake loop: PARTIAL — wake/institution grounding closure required
```

G10-GC subsequently closed those gaps (Institution grounding, grounded
checkpoint, full current-world observation, atomic epistemic reconciliation,
strict WakeCycle state machine, reconciled compiler context, genuine
dormant-world-change E2E). The original G10-G record above is not rewritten.

Corrected verdict after GC PASS:

```text
G10-G CAMPAIGN, EPISTEMIC CONTINUITY & WAKE:
PASS — PRODUCTION CLOSURE VERIFIED BY G10-GC
```
