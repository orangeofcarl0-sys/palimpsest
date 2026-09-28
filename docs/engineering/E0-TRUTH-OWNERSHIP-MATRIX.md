# E0 — Canonical Truth-Ownership Matrix

**Status:** E0-E draft
**Baseline:** `main @ 9ec76ff2657706386d4cfd3e64eff60fd716d604`
**Evidence:** FB-1 (`E0-B`), re-verified against source. Grades per `PROJECT-PRODUCTION-CONSTITUTION.md` §0.

For every canonical owner: **what it owns · what it explicitly does NOT own · who may mutate it · its
basis/freshness model · its allowed cross-plane refs.**

The single most important measured fact: **the `events` table has exactly ONE writer**
(`EventStore.#insertEvent`), and every projection table has exactly one writer (`CoreProjector`). No
other module in the repository writes durable canonical state.

---

## 1. Work / Intent plane

### `src/schema` — frozen wire contracts
- **Owns:** the closed `EVENT_TYPES` vocabulary (37), per-type payload contracts, `canonicalDigest`,
  the identifier/datetime grammars.
- **Does NOT own:** any store, any read model, any decision. Pure contracts.
- **Mutators:** none.
- **Freshness:** n/a (contracts).
- **Cross-plane refs:** imported by nearly everything; two declaration grammars are owned by `domain`
  (`gate_clause`, `stage_graph`) and imported here.

### `src/domain` — pure rules
- **Owns:** task/attempt state machines, promotion eligibility, project-head calculus, rework
  admission, plan reconciliation, speculative authority, world basis algebra.
- **Does NOT own:** any store. It receives a connection and reads within the caller's transaction.
- **Mutators:** none — it only decides.
- **Freshness:** fail-closed; identical on live append and replay.
- **Cross-plane refs:** reads `projects/tasks/attempts/evidence/promotions` projections.

### `src/state` — the durable ledger
- **Owns:** the append-only hash-chained `events` log; all projections; snapshots; migration identity;
  `resolveAttemptAuthorization` (the canonical historical attempt-authorization read).
- **Does NOT own:** any decision about legality (that is `domain`), or any semantic policy.
- **Mutators:** `EventStore.append` / `appendAtomic` / `appendPromotionIntent` /
  `appendPromotionTerminal` / `appendReworkReopening`. Admission is enforced by
  `AggregateValidator.validateAdmission`, so "not agent-facing" is enforced by **capability absence** at
  the generic surface, not by method visibility.
- **Freshness:** single-writer; `verifyFull`/`rebuildProjections` re-project and compare.
- **Cross-plane refs:** consumes `domain` validators and `schema` contracts.

### `src/work` — the Work owner (SR-2)
- **Owns:** `read_model` (the ONE Work read), `head` (head reconciliation), `attempt_execution` (the
  mutating decision ladder).
- **Does NOT own:** the event log (it asks through ports), the promotion state machine, or the head
  advance itself — `head` "never writes a head itself; it asks the Work owner's plan-revision entry
  point to commit the revision".
- **Mutators:** none directly; only via `advanceToClaimableAttempt()`, `claim()`, `report()`,
  `commitHeadAdvance`.
- **Freshness:** re-validates a SUPPLIED candidate; "a SUPPLIED candidate is never a caller-settable head".
- **Cross-plane refs:** `workRef` (taskId, attemptId, envelope digest).

### `src/context` — the Context owner (SR-2)
- **Owns:** `contextManifestIdOf(projectId, attemptId)`, the `CONTEXT_MANIFEST_ADDED` append-once event,
  attempt-scoped compile/fetch.
- **Does NOT own:** knowledge assets (G-5), the Work identity (`PriorResultContext` never enters the
  basis, envelope, or `semanticProjectionDigestOf`).
- **Mutators:** exactly one durable write — `ports.appendManifest(...)`.
- **Freshness:** attempt-scoped, never task-latest.
- **Cross-plane refs:** `manifestId`; evidence refs; result subject refs.

### `src/scheduler`
- **Owns:** "what is the next canonical event for this project" (`decide()`), role/ACTIVE-slot occupancy,
  batch mechanics, attempt lifecycle callbacks.
- **Does NOT own:** policy (declared), or legality (re-validated by `AggregateValidator`).
- **Mutators:** `commit`, `registerTask`, `startAttempt`, `recordCallback`.
- **Freshness:** hold staleness is fail-closed (`NULL` now means unprovable and is stale).

---

## 2. Result / World plane

### `src/result`
- **Owns:** the result-subject vocabulary (`ATTEMPT_RESULT | DERIVED_RESULT`), derivation + manifest
  identity, the **append-once `derived_result_candidate` store**, the rematerialization runtime.
- **Does NOT own:** attempt results (the Work owner holds those) — it deliberately does not parse
  `ATTEMPT_RESULT` itself, because a second parser would drift from the verification plane's.
- **Mutators:** `appendOnce` (called only from `makeRematerializationRuntime`).
- **Freshness:** `originBasisDigest` is REQUIRED — unresolvable is reported as unresolvable, never as
  "unknown basis".
- **Cross-plane refs:** `resultSubjectRef` only.

### `src/project_world`
- **Owns:** four append-once stores (`attempt_world_basis`, `observation_record`,
  `compatibility_issuance`, `cross_basis_admission`), currentness assessment, compatibility issuance,
  cross-basis admission, succession.
- **Does NOT own:** the event log — `grep` for `EventStore`/`FROM events` here returns **zero**. It
  deliberately does not re-run the compatibility proof at admission ("two compatibility engines would
  drift").
- **Mutators:** `appendOnce`, `record/unavailable` (only via `registerObserver`, deliberately not
  barrel-exported), `CompatibilityIssuer.issue`, `CrossBasisAdmissionStore.record`.
- **Freshness:** `capture` precedes effect; assessment **re-resolves**, never compares snapshots.
- **Cross-plane refs:** accepted as **premises** only. `E may consume conclusions, never own OCC premises
  or conclusions.`

---

## 3. Verification / Evidence / Proof / Reasoning

Four **separate** owners. They must never be written as one row.

### Work Evidence (canonical gate atom)
- **Owns:** the `evidence` projection + `gate_registry`; `GateEngine.evaluate` answers
  PASS/FAIL/INCOMPLETE against currently active evidence.
- **Does NOT own:** staleness (the Work aggregate decides `EVIDENCE_STALE`).
- **Mutators:** controller `EVIDENCE_ADDED` / `invalidateEvidence`.
- **Cross-plane refs:** `evidenceId`.

### ProjectVerificationRun (`src/project_verification`)
- **Owns:** `project_verification_event` (per-project hash chain), verifier-definition identity,
  `verdictScope = "named_verifier_protocol_only"`.
- **Does NOT own:** truth, evidence, publication, admission, task state, or authority. A PASS is not a
  qualification of a later attempt.
- **Mutators:** the service's private `executeVerification` only. STARTED is written **before** the
  provider call, so a crash can only leave STARTED.
- **Cross-plane refs:** `runId`; subject digests.

### ProofAsset (`src/proof_asset`)
- **Owns:** `proof_events` + content-addressed blob vault: sources, evidence selections, candidates,
  verification, publication, append-only assessments, disclosure previews/receipts.
- **Does NOT own:** Work, promotion, or that a published claim is *true*.
- **Mutators:** `importSource`, `recordEvidence`, `prepareCandidate`, `verify`, `decidePublication`,
  `reassess`, disclosure records.
- **Freshness:** standing can become `STALE` **by derivation only**; assessments are append-only.
- **Cross-plane refs:** claim refs; evidence refs.

### ReasoningCell (`src/reasoning_cell`)
- **Owns:** `reasoning_cells` + `reasoning_cell_events` (per-cell chain): accepted frontier, branches,
  candidates, **separate epistemic admission**, dependency/invalidation closure.
- **Does NOT own:** Proof claims, Work evidence, or truth. `AcceptedReasoningClaim ≠ Truth`.
- **Mutators:** `openCell`, `openBranch`, `submitCandidate`, `evaluateCandidate`, `requestInvalidation`.
- **Freshness:** frontier basis digest; invalidation cascades.
- **Cross-plane refs:** `cellId`, claim ids.

**`Message ≠ Evidence`** is pinned at `src/federation/messages.ts` — *"`body ≠ Evidence` — always"*.

---

## 4. Promotion plane

### `src/effects/promotion` (`PromotionManager`)
- **Owns:** the promotion state machine — `PROMOTION_PREPARED|COMMITTED|FAILED`, eligibility assessment,
  canonical head derivation, recovery.
- **Does NOT own:** the event log (it appends through permit-gated methods), or the head reconciliation
  (that is `work/head` + `controller.planReconciled`).
- **Mutators:** `appendPromotionIntent` / `appendPromotionTerminal`, guarded by
  `PromotionIntentPermit` / `PromotionOutcomeWitness`.
- **Cross-plane refs:** `promotionId`.

**There is no TeamLead → promotion authority mapping, and none may be created.**

---

## 5. Collaboration plane

### `src/coordination`
- **Owns:** `coordination_events` — invocations, participations, peer messages/delivery/wake/ack,
  commitment/handoff lifecycle, contact requests.
- **Does NOT own:** Work. It reads attempt state read-only via `AttemptCatalogPort`.
- **Mutators:** `recordInvocation`, `beginParticipation`, `endParticipation`, plus federation's appends.
- **Cross-plane refs:** `ActivationRef`, `AttemptRef`, `PeerRef`, ids.

### `src/federation`
- **Owns:** peer identity semantics, contact needs, discovery, messaging semantics, commitment/handoff,
  coalitions, federated workforce **views**.
- **Does NOT own:** any store of its own — all persistence goes through the coordination store. It owns
  no Work state and cannot mutate canonical Work.
- **Mutators:** `sendMessage`, `requestContact`, `recordInboundMessage`, `acknowledge`, commitment and
  handoff transitions.
- **Freshness:** derived state from events (`deriveState`); acceptance requires an authenticated holder.
- **Cross-plane refs:** `PeerRef`, `CommitmentId`, `contactNeedId`.

**`Commitment ≠ Work ownership`; `Coalition ≠ Organization` (never auto-promoted).**

### `src/boundary_memory`
- **Owns:** `boundary_workspaces` / `boundary_events` / `boundary_operations` — versioned shared boundary
  artifacts, acceptance, membership lineage.
- **Does NOT own:** universal collaboration state. **`BoundaryMemory ≠ Mailbox`** — its operations table
  is explicitly *"NOT a second semantic truth"*.
- **Mutators:** `openWorkspace`, `createArtifact`, `proposeRevision`, `acceptRevision`,
  membership transitions.
- **Cross-plane refs:** `AcceptedBoundaryRevisionRef`.

### `src/continuity` / `src/runtime` / `src/identity`
- **continuity owns:** `persistent_points` — a durable continuity **locus**, identity-only. Authority,
  `PeerRef`, `AgentDefinitionId` are rejected by its strict parser.
- **runtime owns:** in-memory `Activation`/`RuntimeAttachment` semantics. **No store.** `Activation` is
  ephemeral by design.
- **identity owns:** the stable addressable-identity contracts (`PeerRef`, `ActivationRef`,
  `AttemptRef`, `OrganizationDefinitionRef`, `AcceptedBoundaryRevisionRef`). Contracts only — no
  transport address, no authority, no lifecycle.

---

## 6. Organization plane

### `src/organization`
- **Owns:** `organization_revisions` / `organization_retirements` — membership (`OrganizationMemberRef`,
  namespaced `peer | agent_definition`), roles, role assignments, norms, declared interactions.
- **Does NOT own:** Work, the runtime scope, or the coalition snapshot. `Coalition ≠ Organization`.
- **Mutators:** `registerRevision(s)`, `retire`, transformation activation.
- **Cross-plane refs:** `OrganizationDefinitionRef`; `PeerRef`; `agentDefinitionId`.

### `src/institution`
- **Owns:** charter, continuation authority, epoch lineage, current organization body (6 tables). One
  **verified mutable head**, re-checked on read; mismatch fails closed.
- **Mutators:** `genesis`, `proposeTransition`, `approveLocal/Remote`, `commitTransition` (threshold).
- **Cross-plane refs:** `PeerRef` (approvers); organization definition refs.

### `src/runtime_scope`
- **Owns:** `runtime_scope_definitions` / `runtime_scope_events` — recursive runtime organization,
  single-parent nesting, membership lifecycle (`OPEN|CLOSED`), declared boundaries.
- **Does NOT own:** Organization or Work scope. `RuntimeScopeMember ≠ OrganizationMemberRef`.
- **Mutators:** `openScope`, `addMember`, `removeMember`, `associatePeer`, `applyStructuralTransition`.

### `src/campaign`
- **Owns:** `campaign_definitions` / `campaign_events` (28 types) — long-horizon identity, campaign
  commitments, hypotheses, belief state, interventions, watches, wakes, lifecycle.
- **Does NOT own:** Evidence bodies, Work, Institution, Organization, runtime, or Ordarium effects.
  Work overlap is **reference only** (`CampaignProjectRef` = `(projectId, revision, digest)`).
- **Freshness:** lifecycle is **derived**; there is no sole-truth `campaign.status` column.

### `src/organization_dynamics`
- **Owns:** nothing canonical. Immutable digest-identified *derived* artifacts: snapshot, diagnosis,
  proposal.
- **Does NOT own:** a store, or any mutation. **ZERO canonical mutation authority** — it does not even
  import `OrganizationStore`.
- **Cross-plane refs:** read-only over runtime scope / organization / coordination / campaign / boundary.

### `src/organization_evolution` / `src/runtime_evolution`
- **Own:** their own case-history stores only. They **never** own Organization, Institution,
  RuntimeScope, or Dynamics truth.
- **Mutators:** `appendAtomic`; activation calls the target owner's own entry point
  (`activateOrganizationTransformation` / `applyStructuralTransition`).

---

## 7. Knowledge-adjacent / product planes

| module | owns | does NOT own |
|---|---|---|
| `organization_memory` | `organization_memory_events`: experiments, runs, evaluations, corrections, interventions | truth about structure; it is empirical record only |
| `project_workspace` | two append-only stores (asset association, journal) + a derived view | canonical project truth (writes go through `controller.plan`) |
| `external_assets` | `external_asset_bridge` operation receipts; delegated writes into workspace stores | asset content; local project truth |
| `project_management` | `management_profiles`, `management_mode_history` | **any authority** — the service always attests `hasSemanticAuthority: false` |
| `project_operating` | `work_mode_preferences`, `work_mode_history`, `management_activity` | truth or authority |
| `attention` | `attention_marks` (deployment-local) | who is authoritative; it never assigns work |
| `transport` | `transport_cursors` (deployment-local) | collaboration truth |
| `monitor` | `monitor_delivery_marks` (deployment-local) | canonical truth |
| `deployment` / `composition` / `application` / `adapters` | nothing semantic — wiring, packaging, façade | any semantic authority |

`src/deployment/profile.ts`: *"deployment config ≠ semantic authority"*, with a strict parser that fails
closed if an authority/role/permission field is smuggled in.

---

## 8. What is NOT canonical at all

Correctly host/runtime/product and must **not** be promoted into the semantic kernel:

branch fan-out and aggregation; workflow DAG scheduling, budgeting and concurrency; filesystem-as-memory
and todo loops; task-ledger storage and replanning mechanics; **team runtime, teammate sessions and
mailbox transport**; model selection; worker process lifecycle; lexical/semantic retrieval execution.

Effect authorization and receipts for all of the above belong to **Ordarium**, reached through
`PalimpsestEffectsRuntime`'s Safe Actions.

---

## 9. Cross-cutting finding

> **Every currently existing semantic fact has a named owner.**

This does **not** claim that every fact E will eventually need already has an owner. Two capabilities
have no single existing owner — `CollaborationGroup` (Organization and RuntimeScope each supply half)
and `WorkAssignment` (RoleAssignment, Commitment and Participation are each provably not it). Neither is
justified as a new owner today; both are recorded in the gap register as `NOT JUSTIFIED`.
