# G10-F5 — AGT × PAG Integration

Status: **COMPLETE**

Baseline: `main` @ `4cf7bdb` (F4 merged).
Branch: `experiment/g10-f5-agt-pag-integration`.

---

## 1. Bottom-up provenance flow (§139)

Required representable path — every arrow EXPLICIT, none automatic:

```text
real collaboration                coordination history (F0-hardened)
        ↓
CoalitionSnapshot                 derived/temporary (F1)
        ↓ explicit authoring
OrganizationDefinition            immutable (F2)
        ↓ explicit governance
DurableInstitution genesis /
InstitutionEpoch transition       (F4)
```

The end-to-end proof (`test/f5_integration.test.ts`, F5-E2E) executes this
path: a real accepted commitment produces a coalition snapshot; the snapshot
alone creates no organization; explicit authoring creates O@1; explicit genesis
creates institution I with charter C@1 and body O@1; an explicit REVISE
transformation proposes O@2; current-charter authorities approve; the epoch
advances; I is unchanged.

## 2. Coalition promotion is provenance only (§140/§71)

`materializeOrganizationFromCoalition` requires explicit org id, mission,
roles, assignments, norms/interactions. The coalition may seed peer members
ONLY, and its `digest` is cited as `CoalitionProvenanceRef` — never an
organization identity, never automatic promotion.

## 3. Organization may exist without an institution (§141)

Organizations live in the organization store; institutions reference them.
`orgStore.listRevisions("org-1")` is non-empty with zero institutions
(F5-E2E step 4). The reverse is not true: an institution requires an existing
organization body (§142) — genesis and every proposed organization are checked
for existence.

## 4. Organization transformation under an institution (§143/§144)

```text
Organization transformation proposal
  ↓ evaluateOrganizationTransformation
assessment (ALL hard structural obligations satisfied)
  ↓ activateOrganizationTransformation   (atomic organization revisions)
InstitutionTransitionProposal
  ↓ current-charter approvals
new InstitutionEpoch
```

`activateAndGovernOrganizationChange` encodes this: it REFUSES a blocked
assessment — governance approval cannot satisfy an unresolved proof obligation
(§144). There is no path that mutates the canonical institution head directly.

## 5. Split / merge do not automatically fork or merge institutions (§146/§147)

- A split yields two organization successors. The institution explicitly
  adopts ONE body (F5-SPLIT); the other is a standalone organization. No
  InstitutionId is created or destroyed automatically.
- A merge yields one organization candidate. Institutions are NOT merged; the
  institution explicitly adopts the merged body (F5-MERGE).

## 6. Institutional evolution (§148/§149)

- Multiple epochs may replace the body and its members while `InstitutionId`
  is constant (F5-MEM: E0 O@1 {a,b} → E1 O@2 {c,d} → E2 O@3 {e,f}).
- `InstitutionCharter.purpose` ≠ `OrganizationDefinition.mission`: the charter
  purpose is durable continuity semantics; the mission is current operating
  structure. They are never copied automatically.

## 7. AGT production coverage (§151)

| AGT object | Coverage |
| ---------- | -------- |
| `A` members | IMPLEMENTED (tagged membership) |
| `R` roles | IMPLEMENTED |
| `C` capability vocabulary / role requirements | IMPLEMENTED AS REQUIREMENTS (possession DEFERRED) |
| `ρ` role assignments | IMPLEMENTED |
| `κ` verified capability possession | DEFERRED (advertisements are not evidence) |
| `F` mission | MINIMAL IMPLEMENTATION |
| `N` norms | MINIMAL IMPLEMENTATION |
| `Γ` declared interaction structure | IMPLEMENTED |
| `∂` synthesized boundaries | IMPLEMENTED FOR TRANSFORMATIONS |
| `Π` routing/scheduler policy | DEFERRED (RuntimeScope concern) |
| `X` runtime internal state | DEFERRED (Runtime concern) |
| `S` full behavioral semantics | DEFERRED (Holon concern) |

F does NOT claim full AGT implementation.

## 8. PAG production coverage (§152)

| PAG object | Coverage |
| ---------- | -------- |
| stable institution identity | IMPLEMENTED |
| authorized lineage / epochs | IMPLEMENTED |
| versioned charter | IMPLEMENTED |
| continuation authority | IMPLEMENTED |
| organization-body evolution | IMPLEMENTED |
| commitment registry | EXISTING elsewhere, not institution-integrated |
| Campaigns | DEFERRED |
| `EvidenceHistory` | EXISTING elsewhere, not institution-integrated |
| `CurrentBeliefState` | DEFERRED |
| Prospective Memory / Watchers | DEFERRED |
| wake / reconciliation lifecycle | DEFERRED |
| `CampaignCompiler` | DEFERRED |

`Durable Institution Continuity Kernel ≠ complete PAG stack`.

## 9. Additive advanced API (§153) and backward compatibility (§154)

`installPalimpsest` gains additive optional `organizationStore`,
`institutionStore`, and `allocateTransitionId`. With none supplied,
`installed.organization` and `installed.institution` are ABSENT — existing
Work/Binding/Runtime/Federation behavior is unchanged (F5-COMPAT).

## 10. Firewalls (§155–§159)

- No scheduler organization awareness: the scheduler module imports neither
  organization nor institution.
- No RuntimeScope by accident: no role assignment feeds RoleSlotPolicy/budget.
- No effect authority by accident: no norm/continuation-authority → Ordarium
  mapping exists.
- No collaboration rewrite: organization/institution modules never import the
  coordination store.
- Derived views (`institutionBodyView`) compose and remain derived.
