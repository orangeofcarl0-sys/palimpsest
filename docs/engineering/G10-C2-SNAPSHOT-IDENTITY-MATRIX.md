# G10-C2 — Snapshot Identity Matrix

What the observation snapshot is, and — equally load-bearing — what it is not.

| Source | Target | Relation |
| --- | --- | --- |
| `BindingObservationSnapshot` | `PersistentPoint` store | **NOT EQUIVALENT / NOT A STORE** — the snapshot observes availability/capability facts; it creates, registers, and owns nothing (C2 §36/§38/§43) |
| `BindingObservationSnapshot` | `RunDefinition` | **ORTHOGONAL (Definition ≠ Observation)** — snapshot content is excluded from the RunDefinition digest; a snapshot change does not change the RunDefinition (C2 §36/§74) |
| `BindingObservationSnapshot` | DSH Session / RuntimeAgent / Activation / Attempt | **NOT EQUIVALENT** — no runtime carrier identity fields exist in the artifact |
| `BindingObservationSnapshot` | DefinitionRevisionRef (Architecture/Work) | **NOT EQUIVALENT** — different dimension (Runtime/Continuity observation vs definitions) |
| `snapshotId` | `SnapshotRef.ref` | **INSTANCE IDENTITY → DERIVED REF** — `ref = H(domain-ref, snapshotId, content digest)`; instance identity alone is never the basis |
| content `digest` | `SnapshotRef.ref` | **CONTENT IDENTITY → DERIVED REF** — same facts in a different observation instance produce a different ref |
| `ObservedContinuityCandidate.point` | `DurableContinuityRef` | **OBSERVATION OF, NOT OWNERSHIP OF** — the candidate records an observed durable-continuity candidate; it does not create, register, or realize a PersistentPoint |
| `ObservedContinuityCandidate` | PersistentPoint | **NOT EQUIVALENT** — observation facts only (point/available/capabilities); no memory/workspace/authority/PeerRef/Session/Agent fields (machine-audited) |
| `CapabilityProfile` (empty) | "all capabilities unavailable" | **NOT EQUIVALENT — UNKNOWN ≠ UNAVAILABLE** — empty known sets are never constructed by a default; every compile requires an explicit observation artifact (C2 §45/§46) |
| `observationRefOf(snapshot)` | kernel `ResolverSnapshot.ref` | **ONE PRIVATE ADAPTER** — the compiler translates the artifact into kernel plumbing; fixture types do not escape (C2-M13) |
| kernel fixture types (`ResolverSnapshot`, `BindingCatalogPoint`, `SubjectRequirementFixture`) | canonical product semantics | **NOT ELEVATED** — they remain spike plumbing (campaign §49) |
