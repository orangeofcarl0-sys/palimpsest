# G10-B0 — Binding Identity & Cardinality Matrix

Status: **DRAFT · POST-UAS-1 · NOT IMPLEMENTED · NO PRODUCTION SCHEMA COMMITMENT**

Per-relation adjudication for the Binding seam. Vocabulary:

```text
FROZEN                 decided by PLMP-UAS-1 (or current frozen compatibility contracts)
PROPOSED               G10-B0 design direction (not frozen)
OPEN                   intentionally open; no decision here
NOT A BINDING RELATION the pair is real semantics, but Binding must not define it
```

Firewall reminder: any row that would define `Invocation / Participation`,
authority grants, organization edges, collaboration edges, or commitments is
marked NOT A BINDING RELATION — G10-B0 must not solve frozen-open problems by
accident.

| Source concept | Target concept | Allowed? | Cardinality frozen? | Binding stage | Notes |
|---|---|---|---|---|---|
| `AgentDefinition` | `PersistentPoint` | Yes (PROPOSED binding relation) | **OPEN** — one→one, one→many, revisions→same point, unbound→resolved all left possible | Intent (pin or constraint) | Core continuity case: architecture revision may re-bind the same point (§64) |
| `AgentDefinition` | `RuntimeAgent` | Only via resolution + realization | OPEN (carrier may change freely) | Resolution → Runtime attachment | Never a declarative field; carrier replacement preserves the point |
| `AgentDefinition` | `Session` | **No** | — | — | SessionId is never durable binding identity (`BIND-CAND-10`) |
| `PersistentPoint` | `RuntimeAgent` | Yes (realization) | OPEN over time (carrier replacement expected) | Runtime attachment | `PersistentPoint ≠ RuntimeAgent` (PLMP-UAS-1) |
| `PersistentPoint` | `Session` | Only as current realization | OPEN | Runtime attachment | Point survives session replacement (frozen) |
| `RuntimeAgent` | `Session` | Runtime-internal | FROZEN as current DSH semantics (DSH-owned) | — | **NOT A BINDING RELATION** — DSH owns carrier/session mechanics |
| `WorkUnit` | `Attempt` | FROZEN execution semantics (WorkUnit → Attempt) | FROZEN (UAS-1) | — | **NOT A BINDING RELATION** — execution, not association intent |
| `WorkUnit` | `PersistentPoint` | **No** (no static universal assignment) | — | — | Work references capability/AgentDefinition requirements; runtime planning routes via Activation/Attempt |
| `Activation` | `Attempt` | Relation zone exists | **OPEN** (frozen-open) | — | **NOT A BINDING RELATION** — Binding must not define Invocation/Participation (§34 firewall) |
| `BindingDefinition` | `RunDefinition` | Yes | PROPOSED: `RunDefinition` composition includes BindingDefinition with **independent revision/digest** | Intent | New identity namespace; `definition_id` never reused |
| `BindingDefinition` | `BindingResolution` | Yes (derived) | PROPOSED: resolution is a distinct derived artifact referenced by/embedded in ExecutionPlan | Resolution | May fail (`BindingUnsatisfied`); freshness-bound (§8) |
| `BindingDefinition` | provider / model route | Requirements yes; concrete selection no | PROPOSED boundary | Intent (need) vs RunConfiguration (selection) | `LogicalNeed ≠ ConcreteProvider`; today's model strings are runtime/advisory |
| `BindingDefinition` | tools | Logical capability requirement yes; concrete implementation no | PROPOSED boundary | Intent vs resolution/runtime | No plugin ids in architecture semantics |
| `BindingDefinition` | workspace | Logical locality requirement yes; host path no | PROPOSED boundary | Intent vs realization | Host paths stay runtime-side (`defaultStatePath`) |
| `BindingDefinition` | `RunConfiguration` | Distinct siblings inside RunDefinition | PROPOSED boundary | Intent vs per-run override | Stable/revisioned association intent vs per-run parameters/policies |
| `BindingDefinition` | `ExecutionPlan` | Input vs derived | PROPOSED | Resolution consumed by plan | Concrete Agent/Session ids live in derived/runtime artifacts, not in binding |
| `PeerRef` | `PersistentPoint` | Frozen-open | **OPEN** (identity-vs-address; cardinality) | — | **Binding needs neither answer**; no `AgentDefinition.peerRef` shortcut is designed |
| `BindingDefinition` | authority grant | **No** | — | — | **NOT A BINDING RELATION** — `Competence ≠ AuthorityGrant`; no `binding.authority` semantics |
| `BindingDefinition` | OrganizationGraph edge | **No** | — | — | **NOT A BINDING RELATION** — binding ≠ organization membership |
| `BindingDefinition` | collaboration edge | **No** | — | — | **NOT A BINDING RELATION** — collaboration may emerge at runtime |
| `BindingDefinition` | commitment | **No** | — | — | **NOT A BINDING RELATION** — `Assignment ≠ Commitment` |
| `BindingDefinition` | PersistentPoint creation | **No** (non-default) | OPEN (promotion workflow) | — | Unsatisfied binding ≠ automatic durable-locus creation |
| `Ephemeral runtime actor` | `PersistentPoint` | Only via explicit promotion | OPEN (workflow) | — | PLMP-UAS-1 `UAS1-INV-14` |

Summary: exactly one new binding-facing relation family is proposed
(`AgentDefinition`/role intent → durable `PersistentPoint`, plus
resource/workspace requirements), everything ephemeral is derived at resolution
time, and every frozen-open zone (PeerRef, Invocation/Participation, authority,
promotion) is left exactly as PLMP-UAS-1 left it.
