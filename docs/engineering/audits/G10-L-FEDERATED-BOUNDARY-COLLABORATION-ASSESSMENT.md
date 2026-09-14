# G10-L Federated Boundary Collaboration — L0 Current-State Assessment

Baseline audited: `orangeofcarl0-sys/palimpsest` `main @ 2b7aa48`.
Read: `G10-K-BOUNDARY-MEMORY-LIVINGSPEC-SPEC.md`, `G10-K-CARRY-FORWARD.md`,
`G10-I-ORGANIZATION-DYNAMICS-SPEC.md`, `G10-E-PARTICIPATION-FEDERATED-WORKFORCE-CAMPAIGN.md`,
and `src/{boundary_memory,organization_dynamics,federation,coordination,organization_evolution}/**`,
`src/install.ts`, `src/advanced.ts`.

## 1. What G10-K left open

| Carry-forward | Evidence |
|---|---|
| CF-K-01 | `DynamicsSubject = organization \| runtime_scope`; a BoundaryWorkspace is neither, so FORMALIZE used a prospective organization subject. |
| CF-K-02 | `BoundaryWorkspaceDefinition.participants` is a fixed canonical set; no membership mutation exists. |
| CF-K-03 | Multi-peer workspaces were exercised via service instances sharing one store; `PeerTransportPort` is chat-shaped (`messageId`/`threadId`/`body`). |

## 2. L0 decisions

**Canonical-home architecture.** Exactly ONE canonical BoundaryMemory truth per workspace.
`single-home` is chosen over replication / multi-master / external service. Remote peers submit
*semantic operations*; the canonical home validates basis, sender coherence, membership, candidate
state, and required approver/acceptor, then generates the canonical event and commits. No multi-master
replication, CRDT auto-merge, distributed consensus, global ACID, or exactly-once claim.

**Home placement is a deployment binding.** `BoundaryWorkspaceRoutePort` resolves
`workspaceId → BoundaryHomeRef` at deployment level. It is NOT stored in the workspace definition and
`PeerRef` still carries no transport address. `StorageHome ≠ AuthorityRoot ≠ Owner ≠ Manager ≠
privileged participant`.

**Remote reads.** `workspaceView / currentAccepted / pendingCandidates / membership / changesSince /
basis` are request/response over the transport, each returning the canonical source basis. No local
cache is implemented; a cache would be derived-only and could never outrank the home (FB-A03).

**Remote mutation protocol.** A dedicated `BoundaryCollaborationTransportPort` (never
`PeerMessage.body`) carries a strict `BoundaryRemoteEnvelope { schemaVersion, operationId,
workspaceId, authenticatedPeer, operation }`. Operations are semantic: submit/accept/reject artifact
candidate, submit/approve/reject membership change, plus read-only queries. Remote peers never submit
event seq numbers, raw DB rows, or trusted chain digests.

**Authentication semantics.** `authenticatedPeer` is *authenticated as asserted by the adapter* —
never claimed as cryptographic unless the adapter provides it. A null authenticated peer may perform
read-only queries but can never author/accept/vote.

**Operation identity.** Every mutation carries a stable `operationId`; the canonical home keeps a
dedupe receipt `(operationId → requestDigest → result)` inside the boundary store. Same id + same
request → idempotent replay; same id + different request → `operation_conflict`. The contract is
**at-least-once + semantic idempotency**, never exactly-once (the semantic commit and the receipt are
not one transaction).

**Dynamics subject extension.** `DynamicsSubject += boundary_workspace`, additively. Boundary basis
and mechanics enter `DynamicsBasis.boundary` / `knowledge.boundary` / `snapshot.boundary`
**only for that subject**, so every existing subject's basis and snapshot digests are byte-identical
(machine-proof in `l_boundary_dynamics.test.ts`). No parallel BoundaryDynamics system.

**Membership.** Workspace identity is stable; participants become a governed, append-only lineage.
`WorkspaceMembership ≠ OrganizationMembership ≠ CoalitionMembership ≠ RuntimeScopeMembership ≠
Commitment ≠ AuthorityGrant`. v1 supports ONLY `ADD_PARTICIPANT` (all current participants + the
joining peer approve) and `REMOVE_PARTICIPANT_CONSENSUAL` (all current participants including the
target approve) — no involuntary expulsion. Membership lineage is owned by the existing
`BoundaryMemoryStore` (no `MembershipStore`).

**Membership ↔ artifact freshness.** An artifact candidate records its membership basis implicitly by
its position in the canonical chain; when any membership revision is accepted after a candidate was
proposed, that candidate becomes `STALE` (the required-acceptor universe changed). Accepted history
and commitments are unaffected. Membership basis is *derived from the chain* rather than duplicated
as a candidate field, which is strictly more robust (no second place to disagree).

**Scaffolding vs ordinary authoring.** `openWorkspace` / `createArtifact` are canonical-home
scaffolding steps (they declare structure and change no shared boundary state); ordinary authoring
(candidates) and all decisions (accept/reject/approve) remain participant-gated. This keeps
`StorageHome ≠ participant` provable while a third hosting process can bootstrap a workspace.

**Non-goals confirmed.** No RuntimeScope structural evolution, no multi-institution governance, no
organization retirement, no empirical scoring, no CRDT/LWW merge, no canonical-home failover
(deferred; home unavailable ⇒ `home_unavailable`, never a promoted remote writer).

## 3. Frozen-contract impact

None. Additive only: new subject variant, new events, new transport module, new optional deps/options.
No UAS-2.

## 4. CF-K disposition (detail in `G10-L-K-CARRY-FORWARD-DISPOSITION.md`)

```text
CF-K-01 CLOSED_IN_L        CF-K-02 CLOSED_IN_L        CF-K-03 CLOSED_IN_L
CF-K-04 STILL_DEFERRED_WITH_CONCRETE_TRIGGER   CF-K-05 STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-K-06 STILL_DEFERRED_WITH_CONCRETE_TRIGGER   CF-K-07 STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-K-08 CLOSED_IN_L        CF-K-09 STILL_DEFERRED_WITH_CONCRETE_TRIGGER
CF-K-10 STILL_DEFERRED_WITH_CONCRETE_TRIGGER
```
