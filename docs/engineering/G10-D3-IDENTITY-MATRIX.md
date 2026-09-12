# G10-D3 — Identity Matrix

| Identity | Owner | Not equivalent to | Evidence |
| --- | --- | --- | --- |
| `AgentDefinitionId` | Architecture | ActivationId, PersistentPointId, RuntimeAgentRef, SessionRef, AttemptId, TaskId/definition_id | C0 firewalls + D1/D3 structural audits |
| `TaskId` / `definition_id` | Work | AgentDefinition, Activation, all runtime/continuity identities | B4/C0 firewalls (unchanged) |
| `AttemptId` | Work/Runtime execution | ActivationId, PersistentPointId, carrier/session ids | no attempt fields in runtime artifacts (D1-M02, D2-M12) |
| `ActivationId` | Palimpsest Runtime | AgentDefinitionId, AttemptId, PersistentPointId, RuntimeAgentRef, SessionRef | allocator seam (D1-M03); activation ids never derived from forbidden identities |
| `PersistentPointId` | Palimpsest Continuity | AgentDefinitionId, ActivationId, RuntimeAgentRef, SessionRef, AttemptId | D3-M02..M04 structural audit: identity-only artifact |
| `RuntimeAgentRef` | host runtime | AgentDefinitionId, ActivationId, PersistentPointId, SessionRef, PeerRef | host-owned; returned verbatim from the port (D2-M06) |
| `SessionRef` | host runtime | PersistentPointId, AttemptId, ActivationId, RuntimeAgentRef (distinct field/namespace) | optional, never synthesized (D2-M07); point artifact cannot carry it (D3-M04) |
| `PeerRef` | future/open | all carrier/session/point identities | absent from every D artifact |

The decisive chain (§67, machine-proven): one PersistentPoint P realizes
through carrier-1, releases, realizes through carrier-2 — P unchanged,
P ≠ carrier-1 ≠ carrier-2, activation-1 ≠ activation-2.

Non-relations still OPEN at campaign level (§124): AgentDefinition ↔ WorkUnit
assignment; Activation ↔ Attempt participation; PeerRef ↔ PersistentPoint.
