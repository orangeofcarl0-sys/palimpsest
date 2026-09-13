# G10-F3 — Split & Interface Synthesis

Frozen semantics (§78):

```text
Split = Partition + InterfaceSynthesis + InterfaceCompressibilityReport
```

A member partition alone is NOT a valid split (F3-M02). Implemented in
`src/organization/transformation.ts` (`evaluateSplit`).

---

## 1. Partition is explicit and total (§79–§81)

A split proposal declares, for the base revision:

```text
memberPlacements: member → left | right | both
rolePlacements:   roleId → left | right | both | retired
normPlacements:   normId → left | right | both | retired | interface
```

Obligations raised when classification is incomplete or incoherent:

| Obligation | Meaning |
| ---------- | ------- |
| `member_unplaced` | a base member has no placement — no silent disappearance |
| `role_unclassified` | a base role has no explicit move/duplicate/retire decision |
| `norm_unclassified` | a base norm is not explicitly classified |
| `assignment_dangling` | an assignment cannot be represented in any successor |
| `norm_role_missing` | a placed norm's role is absent on a side it needs |
| `interaction_role_missing` | an interaction endpoint role is unclassified/retired |
| `successor_mission_missing` | a successor mission is empty |
| `overlap_not_declared` | `"both"` placement used without `overlapDeclared` |

`Split` never silently discards norms or roles; every omission becomes an
obligation that BLOCKS activation.

## 2. Successor construction

For each side, the successor definition is materialized from:

- members whose placement covers the side;
- roles whose placement covers the side;
- assignments whose member AND role both cover the side;
- norms whose placement AND role cover the side;
- interactions whose BOTH endpoint roles cover the side (internal).

Cross-boundary interactions are NOT copied as internal interactions — they are
represented by boundary ports (§82/§83).

## 3. InterfaceSynthesis (§82/§85)

For every base interaction and every ordered pair of distinct successor sides
containing its endpoints, a paired port is synthesized:

```ts
interface OrganizationBoundaryPort {
  portId: string;                          // deterministic digest of (interactionId, side, direction)
  direction: "in" | "out";
  protocol: string;                        // preserved from the source interaction
  counterpartyOrganization: OrganizationDefinitionRef;
  sourceInteractionId: string;             // traceability
}
```

Guarantees (machine-proved):

- every cross-boundary interaction is represented (`cross_boundary_interactions_synthesized`);
- no port exists without a source interaction (`no_invented_boundary_ports`, F3-M04);
- directions are compatible (out on one side, in on the other);
- protocol is preserved.

## 4. Interface report (§86/§87)

```ts
interface OrganizationInterfaceReport {
  crossBoundaryInteractionCount: number;
  uniqueProtocolCount: number;
  duplicateProtocolOpportunities: readonly string[];
  boundarySurfaceSummary: string;
}
```

The report is DESCRIPTIVE. The hard obligation is sufficiency (all required
cross-boundary interactions represented); compressibility is a reported metric,
never a pass/fail threshold. No invented quality scores. The report is
deterministic (F3-M09).

## 5. BoundaryPort has no runtime meaning (§84)

A synthesized port does NOT create message transport, runtime routes,
scheduler edges, or effect authority. It is organizational interface semantics
only; nothing in the module touches runtime or effects.
