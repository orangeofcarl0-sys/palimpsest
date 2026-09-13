# G10-F4 — Identity Matrix

Final identity distinctions for the durable institution kernel.

| Identity | Owner | Not equivalent to |
| -------- | ----- | ----------------- |
| `InstitutionId` | Institution | OrganizationDefinitionId, PeerId, PersistentPointId, AgentDefinitionId |
| `InstitutionCharter` revision | Institution governance | Organization revision, Institution epoch |
| `InstitutionCharter.purpose` | Institution continuity | Organization `mission` |
| `ContinuationAuthorityRule.authorities` | Institution governance | Organization roles, PeerRef identity, effect authority |
| `InstitutionEpoch` | Institution lineage | runtime Activation, Session, Organization revision |
| `InstitutionEpoch.organization` | reference | a copy of the organization body |
| `InstitutionTransitionProposal` | Institution governance | Commitment, message, Work assignment |
| `InstitutionApproval` | Institution governance | peer Commitment, message Ack, RoleAssignment, truth verification |
| `transitionId` | Institution governance | CommitmentId, AttemptRef |

## Cross-layer matrix (campaign-wide, F4 additions)

| Identity | Owner | Not equivalent to |
| -------- | ----- | ----------------- |
| `PeerRef` | Collaboration | org/institution/runtime |
| `AgentDefinitionId` | Architecture | role/member/peer |
| `RoleId` | Organization | agent/member/authority |
| `OrganizationDefinitionId` | Organization | coalition/institution |
| `CoalitionSnapshot` digest | derived Coalition | organization identity |
| **`InstitutionId`** | **Institution** | **organization/peer/point** |
| **`InstitutionEpoch`** | **Institution lineage** | **runtime activation** |
| `PersistentPointId` | Continuity | institution/org |
| `RuntimeAgentRef` | runtime host | institution/org |
| `SessionRef` | runtime host | epoch/institution |
| `CommitmentId` | collaboration | institutional approval |
| `InstitutionApproval` | institution governance | commitment/truth verification |

## Authority matrix

| Authority | Domain | Does NOT imply |
| --------- | ------ | -------------- |
| Organization norm permission | organizational expectation | Ordarium effect authority |
| Institution continuation authority | institutional lineage advancement | Ordarium effect authority, epistemic truth |
| Work governance/policy | Work orchestration | institution continuation authority |
| Ordarium effect authority | effect admission | institution governance |
| Epistemic truth verification | evidence/truth | any of the above |

No authority in this table automatically implies another. The institution
kernel implements continuation authority ONLY; it imports no effect, Work,
runtime, or evidence concern.

## Graph separation

```text
WorkGraph                     (Work)
≠ coordination history         (Collaboration)
≠ Organization structure       (Organization)
≠ Institution epoch lineage    (Institution)
```

No generic universal graph is introduced.
