# G10-F4 — Durable Institution Continuity Kernel

Status: **COMPLETE**

Baseline: `main` @ `c76ca63` (F3 merged).
Branch: `experiment/g10-f4-durable-institution-kernel`.

---

## 1. What F4 implements (§104)

```text
stable institution identity
+ versioned charter
+ explicit continuation authority
+ authorized epoch lineage
+ current Organization body
```

This is the **Durable Institution Continuity Kernel**, NOT the complete
PLMP-PAG-0 persistent-agent system (§3/§134). Deferred: Campaign, hypothesis
branches, CurrentBeliefState, EvidenceHistory ingestion, Prospective Memory,
Watchers, WAIT, the DORMANT/WAKING/RECONCILING/QUIESCING lifecycle, and
CampaignCompiler. No empty placeholder registries are created (§135).

## 2. DurableInstitution ≠ Organization (§105)

An Organization answers *who belongs / roles / norms / mission / interaction
structure*. A DurableInstitution answers *what persists through time, which
lineage is authoritative, who may continue or change it, and which organization
body is current*. The institution REFERENCE the organization body
(`OrganizationDefinitionRef`); it never copies it (§142).

```text
InstitutionId ≠ OrganizationDefinitionId (§106)
Institution   ≠ Organization revision
Institution   ≠ PersistentPoint (§131)
Institution   ≠ PeerRef (§132)
Institution   ≠ Holon (§133)
InstitutionEpoch ≠ runtime Activation/Session (§113)
```

## 3. Identity (§106)

```ts
type InstitutionId = string;   // stable-identifier grammar
```

`InstitutionId` is distinct from `OrganizationDefinitionId`, `PeerId`,
`PersistentPointId`, and `AgentDefinitionId`. It is NEVER derived from the
current organization id. Genesis requires it explicitly.

## 4. Store (§115/§116)

`$DSH_HOME/palimpsest/institution.sqlite` (`defaultInstitutionPath()`). It owns:

```text
institution identity, charter revisions, governance proposals/approvals,
the epoch chain, and a current-head projection
```

It does NOT own: OrganizationDefinition contents, Work, coordination messages,
PersistentPoint, or Ordarium effects.

Canonical truth is the append-only **epoch/transition/charter history**. The
mutable head row is a **verified projection**: on read the head is re-derived
from the epoch chain and a mismatch fails closed (`projection_mismatch`).

## 5. Genesis is explicit (§117)

`service.genesis({institutionId, purpose, authorities, requiredApprovals,
organization})` requires an InstitutionId, a genesis charter, an initial
`OrganizationRef` (which must exist), and an initial continuation authority.
Institution creation is NEVER inferred from OrganizationDefinition existence, a
CoalitionSnapshot, or active Commitments.

## 6. Governance flow (§118–§124)

```text
proposeTransition  → InstitutionTransitionProposal (baseEpoch = current head)
approve / approveRemote → InstitutionApproval
advance            → atomic epoch advancement
```

- Approval threshold: UNIQUE approvals from CURRENT-charter authorities >=
  `requiredApprovals` (§121). Non-authority approvals are recorded but never
  counted.
- Duplicate approval by the same peer counts once; an identical duplicate is
  idempotent; a conflicting duplicate fails closed (§122).
- Stale approval: a proposal bound to an older base epoch cannot authorize
  after the head advances — `stale_base_epoch` (§123).
- Advancement is ONE atomic transaction: validate head, current charter,
  threshold; register the proposed charter revision if needed; append the new
  epoch; advance the head projection — or commit none (§124).

## 7. Runtime / persistence orthogonality

An institution can exist with ZERO active runtime (§114): nothing in the
module imports runtime, session, activation, continuity, or effects. Runtime
inactivity never terminates an institution (F4-M15).

`InstitutionApproval ≠ Commitment / Ack / RoleAssignment` (§120);
`ContinuationAuthority ≠ OrdariumEffectAuthority / TruthAuthority` (§108);
`GovernanceApproval ≠ TruthVerification` (§145 preview).

## 8. Machine proofs

| Proof   | Statement | Test |
| ------- | --------- | ---- |
| F4-M01 | Institution ≠ Organization | `test/f4_institution.test.ts` |
| F4-M02 | Institution ≠ PersistentPoint | 〃 |
| F4-M03 | Institution ≠ RuntimeAgent/Session | 〃 |
| F4-M04 | continuation authority explicit | 〃 |
| F4-M05 | role does not imply continuation authority | 〃 |
| F4-M06 | current authority controls authority revision | 〃 |
| F4-M07 | new authority cannot self-authorize | 〃 |
| F4-M08 | approval threshold deterministic | 〃 |
| F4-M09 | duplicate approval counted once | 〃 |
| F4-M10 | stale base epoch rejects transition | 〃 |
| F4-M11 | epoch advancement atomic | 〃 |
| F4-M12 | charter immutable/versioned | 〃 |
| F4-M13 | total member replacement preserves InstitutionId | 〃 |
| F4-M14 | different OrganizationId preserves InstitutionId when authorized | 〃 |
| F4-M15 | zero active runtime does not terminate institution | 〃 |

12 tests in the focused suite. Full suite: **88 files / 778 tests**.
