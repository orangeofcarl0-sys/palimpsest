# G10-C0 — Identity Matrix

Relations established, refused, or left open by the minimal Architecture
identity realization. "Relation" here means a semantic equivalence or mapping
— string equality between identifiers never creates one (C0 §18).

| Source | Target | Relation |
| --- | --- | --- |
| `ArchitectureDefinitionId` | `ProjectIr.project_id` | **NOT EQUIVALENT** — distinct field/type namespace; no derivation from Work identity (C0 §17) |
| `ArchitectureDefinitionId` | AgentGraph node id | **NOT EQUIVALENT** — AgentGraph v1 is WorkGraph; its node ids are Work/task lineage |
| `AgentDefinitionId` | `TaskSpec.definition_id` | **NOT EQUIVALENT** — `definition_id` remains Work/Task lineage (UAS1-INV-05); no compatibility alias exists (C0 §16) |
| `AgentDefinitionId` | `task_id` | **NOT EQUIVALENT** — runtime entity id vs definition identity |
| `AgentDefinitionId` | `scope_id` / Canvas node key / role | **NOT EQUIVALENT** — Work-graph membership, display, and concurrency vocabulary |
| `AgentDefinitionId` | RuntimeAgent id | **NOT EQUIVALENT** — Definition ≠ runtime entity (UAS1-INV-01/03); no runtime identity fields exist in C0 |
| `AgentDefinitionId` | `PersistentPointId` | **NOT EQUIVALENT** — PersistentPoint ≠ AgentDefinition (UAS1-INV-10); no continuity fields in C0 |
| `ArchitectureDefinition` | `DefinitionRevisionRef` | **EXPLICIT ADAPTER** — `architectureRefOf` on the Binding side maps id/revision/digest (C0 §31) |
| `AgentDefinition` | `ArchitectureSubjectRef` | **C0 BINDING-ADDRESS ADAPTER** — `architectureSubjectRefsOf` derives subject refs from `AgentDefinitionId` (C0 §32); deliberately NOT a frozen universal equivalence (C0 §33) |
| `AgentDefinition` | WorkUnit / TaskDefinition | **OPEN / NO C0 RELATION** — the mapping is unmodeled; no task/work-unit fields exist (C0 §42) |
| `AgentDefinition` | PersistentPoint | **OPEN** — continuity binding is PLMP-BIND-1's subject-keyed intent relation, authored separately; nothing is auto-created (C0 §4/§47) |
| `AgentDefinition` | DSH Agent / Session / Activation / Attempt | **NOT EQUIVALENT / NOT MODELED** — Definition ≠ Activation ≠ Attempt (UAS1-INV-03/04); no realization in C0 |
| AgentGraph v1 `"agent"` node | `AgentDefinition` | **NOT EQUIVALENT / NO MIGRATION** — the node is task-bearing Work vocabulary (C0 §2/§5); no migration path exists |
| `ArchitectureDefinition.digest` | `ProjectIr.digest` | **NOT EQUIVALENT** — different domain separators, different content, different owning artifacts |
| Binding intent (subject-keyed) | `AgentDefinition` | **PF-02 RELATION VIA DERIVED REFS** — an explicit BindingDefinition must exactly cover the subjects derived from the ArchitectureDefinition; mismatches are configuration outcomes (C0 §43/§47) |

Notes:

- All "NOT EQUIVALENT" rows are enforced by machine tests (namespace
  firewalls, collision adversarial test §52, static import firewalls §53/§54).
- The two adapter rows are the only Architecture→Binding conversions in the
  codebase, and both live on the Binding side (`src/binding/compiler.ts`);
  `src/architecture/definition.ts` imports nothing from Binding.
