# G10-G0 — PAG Preflight & F-Governance Closure

Status: **COMPLETE**

Baseline: `main` @ `3f3ab6f` (G10-F campaign PASS).
Branch: `experiment/g10-g0-pag-preflight-governance-closure`.

Verdict:

```text
G0 PAG PREFLIGHT & F-GOVERNANCE CLOSURE: PASS
```

---

## 1. PAG production inventory (§35)

| Question | Answer |
| -------- | ------ |
| Where is Evidence truth owned? | Work `EventStore` `evidence` projection (`EVIDENCE_ADDED`/`EVIDENCE_STALE`). `EvidenceAtom` in `src/schema/models.ts`. |
| Is `ClaimGraph` durable or reconstructed? | NEITHER — it is an in-memory, non-event-sourced derived structure (`src/evidence/graph.ts`), unwired in production; nothing serializes or replays it. |
| Stable Evidence/Claim identifiers? | Caller-supplied claim/evidence id strings; production evidence ids from `stableEntityId("evidence", actionKey("evidence-v1", …))`. |
| Canonical Work project/attempt refs? | `projects(project_id, revision, digest)`; attempts `(project_id, attempt_id)`. |
| Exact `start()/plan()` admission path? | `ProjectController.start()` / `plan()` → Work `EventStore.append` with derived keys `actionKey("scheduler-project-create"…)` / `actionKey("plan-revision-v1"…)`. |
| Can that path be idempotent with a stable admission key? | Event-layer idempotency exists per derived key, but there is **no proposal-level admission key** and **no `appendAtomic`** on the Work EventStore. A host-neutral idempotent admission PORT is therefore the truthful G6 boundary; a concrete Work adapter is DEFERRED unless a stable key can be supplied. |
| Context artifact already available? | `ContextManifest` (event-sourced, per attempt) + derived `ContextBrief`/`Requirement`/`Distribution`/embeddings. |
| What does `EventStore` own that `CampaignStore` must NOT own? | Work/project/task/attempt history, evidence atoms, context manifests, gate/role/stage declarations. |

Module layout inventoried: `src/evidence/**`, `src/context/**`, `src/state/**`,
`src/institution/**`, `src/organization/**`, `src/architecture/proposal.ts`,
`src/tools/controller.ts`.

## 2. Ownership matrix

See `G10-G0-PAG-OWNERSHIP-MATRIX.md`.

## 3. Evidence integration decision (§37–§40)

```text
Campaign DOES NOT persist Evidence bodies.
Campaign persists: evidence/claim REFERENCES, historical observations,
                   belief revisions derived from those observations.
```

- The read-only bridge is `CampaignEvidencePort.inspectClaim(ref) →
  EvidenceKnowledge<ClaimStandingSnapshot>` (state known | unknown | error).
- Because the current `ClaimGraph` is in-memory and not replayable across
  processes, the production adapter is **host-supplied**; G2 defines the port
  and an adapter over any supplied standing source. No second Evidence system
  is created, and no `CampaignEvidenceTruth` exists.
- If the Evidence plane is unavailable at wake time, the observation is
  `unknown` and reconciliation stays incomplete — the last historical Campaign
  observation is NEVER used as current evidence truth.
- Claim standing vocabulary is reused verbatim:
  `SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED | INCONCLUSIVE | STALE`.
- Typed invalidation (`change_class`, `LateResultClass`) is reused where it
  applies; it is not duplicated.

## 4. F-governance closure (§22–§33)

### F-CHARTER-01 — candidate charter isolation

- Before: `proposeTransition` registered the amended charter directly into the
  canonical `institution_charters` lineage, occupying the `revision=N+1` slot
  before approval.
- After: amended charters are stored as **non-canonical candidates**
  (`institution_charter_candidates`, keyed by content digest, so competing
  `C@N+1` candidates coexist). Canonical registration happens ONLY inside the
  `commitTransition` transaction, which verifies the artifact against its
  registered candidate. `registerCharter` is no longer publicly callable;
  genesis and `commitTransition` are the only canonical paths.

### F-AUTH-01 — institution approval actor grounding

- Before: `approve({transitionId, peer})` let the caller choose the approving
  identity.
- After: `approveLocal({transitionId})` uses the trusted identity configured at
  assembly (`InstitutionServiceDeps.localGovernancePeer`), which is NOT the
  federation `localPeer` (§29). `approveRemote({transitionId, authenticatedPeer})`
  requires a non-null authenticated peer asserted by the trusted transport
  boundary. There is no API that accepts a caller-chosen local approving peer.

### F-TRANSFORM-01 — REVISE assessment/store coherence

- Before: REVISE required `candidate.revision > base.revision`, so `base=3,
  revision=5` was assessed admissible although the organization store always
  rejects it.
- After: REVISE requires `candidate.revision === base.revision + 1`. The store
  still independently rejects a stale head at activation.

## 5. Machine proofs (§34)

| Proof | Statement |
| ----- | --------- |
| G0-M01 | competing `Charter@N+1` candidates coexist |
| G0-M02 | unapproved candidate absent from the canonical charter list |
| G0-M03 | winning candidate becomes canonical only inside epoch commit |
| G0-M04 | stale losing proposal cannot commit |
| G0-M05 | caller cannot choose the local approving PeerRef |
| G0-M06 | remote unauthenticated approval refused |
| G0-M07 | new authority cannot self-authorize |
| G0-M08 | REVISE +2 blocked during assessment |
| G0-M09 | REVISE +1 admissible when otherwise valid |
| G0-M10 | store still rejects a stale head at activation |

`test/g0_governance_closure.test.ts`: 7 tests. Full suite: **91 files / 800 tests**.

## 6. CI record

```text
PR #40, final HEAD 5557484 (pre-merge), merge commit 5557484
run 34756736991: unit pass; e2e first attempt failed on the documented
  E2E-DEBUG-01 flake (spec line 42, assertion line 56) → failed-job rerun pass
```
The failure was the pre-existing documented flake, not a Campaign regression
(§219).

