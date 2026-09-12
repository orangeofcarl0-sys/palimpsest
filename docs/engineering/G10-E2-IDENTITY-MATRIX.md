# G10-E2 — Identity Matrix (peer additions)

| Identity | Owner | Not equivalent to | Evidence |
| --- | --- | --- | --- |
| `PeerId` (PeerRef) | Collaboration identity | AgentDefinitionId, ActivationId, PersistentPointId, RuntimeAgentRef, SessionRef, user accounts, transport addresses | E2-M01..M05 structural audits; grammar rejects transport shapes (E2-M06) |
| `ContactNeedId` | collaboration need | ownership, assignment, obligation | E2-M07 forbidden-content test |
| `PeerAdvertisement` | discoverability artifact | Evidence, AuthorityGrant, verified competence | E2-M08/M09 structural + static audits |
| `ContactCandidate` | "worth contacting" | selected worker, assigned owner, committed participant | E2-M12 structural test |
| `PeerContinuityAssociation` | explicit link artifact | identity equivalence (association ≠ identity) | §44 artifact + PeerRef field absence |

Unchanged from prior campaigns: AgentDefinitionId, TaskId/definition_id,
AttemptId, ActivationId, RuntimeAgentRef, SessionRef, PersistentPointId —
all their non-equivalences re-verified green in this branch's suites.
