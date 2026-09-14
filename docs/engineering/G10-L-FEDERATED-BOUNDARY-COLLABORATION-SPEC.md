# G10-L — Federated Boundary Collaboration (Spec)

Baseline: `main @ 2b7aa48`. Status: implemented; see
`docs/engineering/audits/G10-L-FEDERATED-BOUNDARY-COLLABORATION-DELIVERY.md`.

## Mission

> Make Boundary Memory a genuinely federated, dynamically governed collaboration surface
> without introducing replicated semantic ambiguity.

```text
BoundaryWorkspace becomes a Dynamics subject
        ↓
Workspace participant set evolves by explicit governance
        ↓
Remote peers submit/accept/reject over authenticated transport
        ↓
ONE canonical semantic workspace remains authoritative
```

## Red lines

```text
StorageHome ≠ AuthorityRoot ≠ WorkspaceParticipant ≠ Representative ≠ MainAgent
RemoteTransportDelivery ≠ BoundaryAcceptance      RemoteTransportAuthentication ≠ SemanticAcceptance
RemoteSubmission ≠ CanonicalCommit                RemoteObservation ≠ LocalReplicaTruth
BoundaryWorkspace ≠ Organization                  WorkspaceMembership ≠ OrganizationMembership
WorkspaceMembership ≠ Commitment ≠ EffectAuthority ≠ RuntimeScopeMembership
Membership change ≠ Organization transformation ≠ Handoff
At-least-once transport ≠ exactly-once execution   Remote retry ≠ duplicate semantic event
UserFocus ≠ MembershipAuthority   Main Agent ≠ MembershipAuthority
Message Ack ≠ MembershipApproval  BoundaryArtifact Acceptance ≠ MembershipApproval
```

No multi-master replication, CRDT auto-merge, distributed consensus, global ACID, exactly-once
delivery, or peer-to-peer replicated store.

## Architecture

**ONE canonical BoundaryMemory truth per workspace.** The canonical home is a persistence/ordering
locus only. `BoundaryWorkspaceRoutePort` resolves workspace→home at deployment level (never stored in
the workspace definition; `PeerRef` carries no address). A host that physically holds the store
exposes a `BoundaryHome`; remote hosts hold only a `FederatedBoundaryClient` (transport + route).

**Remote protocol.** `BoundaryRemoteEnvelope { schemaVersion: 1, operationId, workspaceId,
authenticatedPeer, operation }`, strictly parsed (exact fields, unknown version/field fail closed).
Operations: `submit_artifact_candidate`, `accept_artifact_candidate`, `reject_artifact_candidate`,
`submit_membership_change`, `approve_membership_change`, `reject_membership_change`,
`workspace_view`, `current_accepted`, `pending_candidates`, `membership`, `changes_since`, `basis`.
`authenticatedPeer` is *as asserted by the adapter*. Raw store events, seq numbers, and chain digests
are never submitted.

**Operation identity / idempotency.** Stable `operationId`; the home keeps a dedupe receipt
`(operationId → requestDigest → result)` in the boundary store. Same id + same request → idempotent
replay; different request → `operation_conflict`. At-least-once + semantic idempotency; never
exactly-once. Every canonical result carries the canonical `basis`.

## BoundaryWorkspace as a Dynamics subject

`DynamicsSubject += { kind: "boundary_workspace", workspace }`. The snapshot binds a
`BoundaryWorkspaceBasisRef` and carries a mechanical `BoundaryObservation`:

```text
lifecycle · participantCount · membershipRevision · artifactCount · candidateCount
pendingCandidateCount · staleCandidateCount · rejectedCandidateCount · acceptedRevisionCount
acceptedArtifactCount · branchCount · revisionChurn · membershipChurn · blueprintAccepted
```

Diagnostics (basis-grounded, thresholds via the versioned `DynamicsPolicy`):
`BOUNDARY_REVISION_CHURN`, `BOUNDARY_MEMBERSHIP_CHURN`, `BOUNDARY_NEGOTIATION_BACKLOG`,
`BOUNDARY_STABLE_ACCEPTED_STATE`, `BOUNDARY_BLUEPRINT_PRESENT`. Never quality/alignment/trust/
correctness; `blueprint present ≠ should formalize`; `stable ≠ correct`. Missing observation = unknown
(diagnostics `unresolved`). Multi-store consistency remains honest optimistic-reread
(`observation_raced`). The extension is additive: existing subjects' basis/snapshot digests are
byte-identical.

## Governed membership

```
MembershipChangeCandidate { workspaceId, base, kind, target, author, requiredApprovers, intent, digest }
WorkspaceMembershipRevision { workspaceId, revision, revisionDigest, kind, target, candidateDigest,
                              approvers, participants, baseRevision }
```

- `ADD_PARTICIPANT`: required approvers = all current participants ∪ the joining peer; the joining
  peer may approve its own join before it is a participant.
- `REMOVE_PARTICIPANT_CONSENSUAL`: required approvers = all current participants, including the
  target; never below 2 participants. No involuntary expulsion.
- Candidates branch from an exact membership revision; a later accepted change makes siblings
  `STALE` (never LWW, never auto-merge). Approving a stale change fails closed (`stale_membership`).
- **Membership ↔ artifact freshness**: an artifact candidate proposed before a membership revision
  was accepted becomes `STALE` (its required-acceptor universe changed) and is never silently
  reinterpreted. Accepted history survives; commitments are independent.
- A joining peer that has not joined cannot ordinary-author/accept. A removed peer cannot
  author/accept new revisions; its historical contributions remain.
- Membership lineage lives in the existing `BoundaryMemoryStore`; a closed workspace accepts no new
  membership mutation.

## Non-goals

`ENCAPSULATE_RUNTIME_SCOPE` / `COLLAPSE_RUNTIME_STRUCTURE` / `DISSOLVE_OR_RETIRE`, multi-institution
governance, empirical success scoring, Danus cells, MultiGraph redesign, DSH wake/resume, CRDT
boundary merge, canonical-home failover/election (deferred; home unavailable ⇒ `home_unavailable`).

## Surface

`installed.boundaryMemory` (local canonical surface) unchanged; `installed.federatedBoundaryMemory`
present iff `localPeer + boundaryCollaborationTransport + boundaryWorkspaceRoute` are supplied, with
`client` always and `home` only when this host holds the store. Advanced-only; never in
`ProjectController`.
