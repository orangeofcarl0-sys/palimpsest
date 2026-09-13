# G10-F0 — AGT / PAG Production Mapping

Baseline: `main` @ `6afa2920dabcc0dbd1c7b5efbf3a43fbfc88f110`.
Frozen theoretical baselines: `PLMP-AGT-0` (spatial/organizational axis),
`PLMP-PAG-0` (temporal/epistemic continuity axis).

This document records, BEFORE any F implementation, exactly what exists in
production and what is missing — so later stages cannot overclaim. Absent is
more honest than a placeholder.

---

## 1. AGT objects (§28)

| AGT object      | Production status at F0                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `VisualGroup`   | **Canvas-only, non-semantic** — presentation grouping; no schema mapping.    |
| `Organization`  | **MISSING** — no `OrganizationDefinition`, identity, or lineage store.       |
| `Coalition`     | **`CoalitionView` only** — a derived projection of commitments/participations over the coordination store; no snapshot artifact, no provenance ref. |
| `RuntimeScope`  | **NOT REALIZED** — runtime is `AgentDefinition → Activation → RuntimeAttachment`; no scope object owning scheduler/retry/budget/checkpoint. |
| `Holon`         | **NOT REALIZED** — no internal-multiplicity → external-unity interface semantics. |

The five objects are FROZEN as distinct. F0 introduces no generic `Group`
type, no `groupId`, and no collapse.

## 2. PAG objects (§28)

| PAG object                     | Production status at F0                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| stable institution identity    | **MISSING** — no `InstitutionId`, no distinct namespace.           |
| epoch chain                    | **MISSING** — no `InstitutionEpoch` lineage.                       |
| versioned charter              | **MISSING** — no `InstitutionCharter`.                             |
| continuation authority         | **MISSING** — no explicit rule artifact.                           |
| organization-body evolution    | **MISSING** — depends on Organization (above).                     |
| Campaign                       | **DEFERRED** (G10-G scope)                                         |
| Hypothesis branches            | **DEFERRED**                                                       |
| `CurrentBeliefState`           | **DEFERRED**                                                       |
| `EvidenceHistory` ingestion    | exists in the Work/evidence subsystem, but **not institution-integrated** |
| Prospective Memory             | **DEFERRED**                                                       |
| Watcher system                 | **DEFERRED**                                                       |
| WAIT policy                    | **DEFERRED**                                                       |
| wake / reconciliation lifecycle| **DEFERRED**                                                       |
| `CampaignCompiler`             | **DEFERRED**                                                       |

## 3. What F production-realizes

```text
Coalition           (F1 — formal snapshot + provenance, still derived)
Organization        (F2 — OrganizationDefinition + lineage store)
minimal DurableInstitution continuity kernel
                    (F4 — stable identity + charter + continuation authority
                          + epoch chain; NOT the full PAG stack)
```

## 4. What F only tests as NON-equivalence / leaves as extension seams

```text
RuntimeScope        (Organization ≠ RuntimeScope; no scheduler change)
Holon               (Organization ≠ Holon; no external-unity claim)
VisualGroup         (Canvas group ↛ Organization)
```

## 5. Existing production anchors F may reference (never absorb)

| Concern                | Canonical owner / artifact                                            |
| ---------------------- | --------------------------------------------------------------------- |
| Architecture identity  | `ArchitectureDefinition` / `AgentDefinition` (`src/architecture`)      |
| Work / Attempt         | WorkGraph → WorkUnit → Attempt; `AttemptCatalogPort` (read-only)        |
| Binding                | `BindingResolution`, `CompiledBindingPlan` (`src/binding`)             |
| Runtime                | `Activation`, `RuntimeAttachment` (`src/runtime`)                      |
| Continuity             | `PersistentPoint` (`src/continuity`)                                   |
| Collaboration          | `PeerRef`, Commitment, Handoff, Participation (coordination store)      |
| Effects                | Ordarium ledger                                                        |

F adds Organization and Institution as **separate canonical concerns**; it
does not reinterpret any of the above (§172, §186).

## 6. Honest claim boundary

After a successful F campaign, Palimpsest may claim:

```text
Organization semantics are executable.
Institutional continuity semantics are executable.
A minimal AGT × PAG intersection exists.
```

It MUST NOT claim the full `PLMP-PAG-0` stack (Campaign, belief state,
watchers, wake lifecycle, CampaignCompiler remain deferred — G10-G).

At F0 (this stage) even the above is **not yet** claimable: F0 closed the
coordination substrate only. The mapping above is the pre-implementation
inventory.
