# G10-F5 — Non-Equivalence Matrix

Final campaign-wide separations. Every row is either machine-proved by a test
or enforced by the absence of any code path (static proof).

## 1. The five AGT objects stay distinct (§197)

```text
Coalition ≠ Organization ≠ RuntimeScope ≠ Holon ≠ VisualGroup
```

- `Coalition` is a derived snapshot (F1).
- `Organization` is an immutable artifact (F2).
- `RuntimeScope` is NOT realized (§6 firewall); no scheduler/runtime coupling.
- `Holon` is NOT realized (§7); no external-unity claim.
- `VisualGroup` is Canvas presentation only (§8); no schema mapping.
- No generic `Group` type and no `groupId`/`group_id` exists in the
  organization/institution modules (F5-C static proof).

## 2. Organization ≠ Institution ≠ Epoch ≠ Activation

```text
Organization              ≠ DurableInstitution
InstitutionEpoch          ≠ Activation
InstitutionCharter.purpose ≠ Organization.mission
Role                      ≠ AgentIdentity
OrganizationalPermission  ≠ EffectAuthority
GovernanceApproval        ≠ TruthVerification
```

## 3. Identity matrix (§170)

| Identity | Owner | Not equivalent to |
| -------- | ----- | ----------------- |
| `PeerRef` | Collaboration | org/institution/runtime |
| `AgentDefinitionId` | Architecture | role/member/peer |
| `RoleId` | Organization | agent/member/authority |
| `OrganizationDefinitionId` | Organization | coalition/institution |
| `CoalitionSnapshot` digest | derived Coalition | organization identity |
| `InstitutionId` | Institution | organization/peer/point |
| `InstitutionEpoch` | Institution lineage | runtime activation |
| `PersistentPointId` | Continuity | institution/org |
| `RuntimeAgentRef` | runtime host | institution/org |
| `SessionRef` | runtime host | epoch/institution |
| `CommitmentId` | collaboration | institutional approval |
| `InstitutionApproval` | institution governance | commitment/truth verification |

## 4. Authority matrix (§171)

| Authority | Domain | Implies nothing else |
| --------- | ------ | -------------------- |
| Organization norm permission | organizational expectation | effect authority |
| Institution continuation authority | lineage advancement | effect authority, truth |
| Work governance/policy | Work orchestration | continuation authority |
| Ordarium effect authority | effect admission | institution governance |
| Epistemic truth verification | evidence/truth | any of the above |

Machine/static proof (F5-C): no automatic mapping between any pair exists in
the organization or institution modules.

## 5. Graph separation (§172)

```text
WorkGraph ≠ CollaborationGraph/coordination history ≠ Organization structure
```

No universal graph rewrite. The scheduler imports neither organization nor
institution (F5-C).

## 6. Store ownership (§167)

| Store | Owns |
| ----- | ---- |
| Work EventStore | Work/orchestration history |
| Ordarium ledger | Effect admission/operations |
| Continuity store | PersistentPoint identities |
| Coordination store | participation/collaboration/commitment history |
| Organization store | immutable Organization definitions/revisions |
| Institution store | charter/approval/epoch/institution lineage |

No overlapping canonical truth. Physical consolidation is optional and does not
change semantic ownership (§168).
