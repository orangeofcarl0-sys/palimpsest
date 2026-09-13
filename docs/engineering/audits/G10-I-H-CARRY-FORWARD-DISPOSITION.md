# G10-I — G10-H Carry-Forward Disposition

Every `CF-H-01…12` is adjudicated. `CF-H-03/06/08/09` are `CLOSED_IN_I` as required.

| ID | Disposition | Note |
|---|---|---|
| CF-H-01 runtime constituent liveness | **CLOSED_IN_I** | The snapshot separates **recorded runtime membership** from **observed host liveness**; without a host observer liveness is `unknown` (never "dead"). No fake activation registry. |
| CF-H-02 RuntimeScope-local policy | **STILL_DEFERRED_WITH_CONCRETE_TRIGGER** | Trigger: a real dynamics diagnostic that needs a scope-local execution policy. No generic policy engine. |
| CF-H-03 boundary source verification | **CLOSED_IN_I** | Boundary source becomes a tagged, source-verifiable union; an `organization_interaction` source requires a non-null organization basis whose exact revision declares that interaction, else fail-closed. |
| CF-H-04 multi-parent / laminar | **STILL_DEFERRED_WITH_CONCRETE_TRIGGER** | Trigger: a real laminar ownership case. Dynamics may *observe* overlap pressure but does not change the forest. |
| CF-H-05 QUIESCENT lifecycle | **STILL_DEFERRED_WITH_CONCRETE_TRIGGER** | Trigger: a real suspend/resume use case. |
| CF-H-06 representation authority | **CLOSED_IN_I** | Minimal assembly-supplied `RuntimeScopeRepresentationAdmissionPort`; without wiring, external-representation mutation fails closed while read-only Holon observation remains. |
| CF-H-07 Participation↔RuntimeScope | **CLOSED_IN_I** | Implemented as a **derived co-occurrence join** only (same `ActivationRef` recorded in a scope and referenced by a participation). No canonical relation store; co-occurrence ≠ relation. |
| CF-H-08 Campaign↔RuntimeScope | **CLOSED_IN_I** | Explicit, typed, replayable, lifecycle-neutral association owned by RuntimeScope history; campaign existence is verified, no lifecycle/authority/work implication. |
| CF-H-09 structural metrics | **CLOSED_IN_I** | `RuntimeStructuralSnapshot` derives all mechanical metrics from canonical RuntimeScope history. |
| CF-H-10 automatic promotion | **OBSOLETE_AFTER_I_DESIGN** | The design makes promotion a non-canonical proposal only; no automatic path exists to preserve. |
| CF-H-11 UI | **STILL_DEFERRED_WITH_CONCRETE_TRIGGER** | Trigger: MultiGraph organization debugger stage. |
| CF-H-12 Ordarium 1.3.1 / StateChangeFeed | **STILL_DEFERRED_WITH_CONCRETE_TRIGGER** | Trigger: a dynamics observation proven to require the feed. |

All four P1 items (CF-H-03/06/08/09) are closed in G10-I. New non-blocking findings are
registered in [`G10-I-CARRY-FORWARD.md`](G10-I-CARRY-FORWARD.md).

> The CF-H-03 fix deliberately tightens the H-frozen `RuntimeScopeBoundary` schema (a tagged
> source replaces the bare `sourceInteractionId`); this is an additive contract amendment
> authorized by the G10-I spec §8, not a redesign of G10-H core.
