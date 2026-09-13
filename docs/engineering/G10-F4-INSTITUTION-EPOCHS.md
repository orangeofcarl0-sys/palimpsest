# G10-F4 — Institution Epochs

## 1. InstitutionEpoch (§112)

```ts
interface InstitutionEpoch {
  readonly schemaVersion: 1;
  readonly institutionId: InstitutionId;
  readonly epoch: number;
  readonly predecessor: InstitutionEpochRef | null;
  readonly charter: InstitutionCharterRef;
  readonly organization: OrganizationDefinitionRef;
  readonly transition: string;               // the authorized transitionId
  readonly digest: string;
}
```

- Epoch 0 is genesis: `predecessor === null`, `transition === "genesis"`.
- A non-genesis epoch requires a predecessor whose institution matches and
  whose epoch is exactly `epoch - 1` (no gaps, no cross-institution edges).
- Digest domain `palimpsest.institution-epoch.v1` over
  `{institutionId, epoch, predecessor, charter, organization, transition}` —
  epoch content identity INCLUDES institutionId + epoch (an epoch is a position
  in one lineage, not a reusable identity).

## 2. Epoch ≠ runtime activation (§113)

An epoch is durable institutional lineage. It is NOT an Activation, a Session,
or a runtime process lifetime. Nothing in the epoch artifact or store references
runtime identity.

## 3. Institution with zero active runtime (§114)

The whole chain (genesis, charters, epochs, proposals, approvals, head) is
readable and valid with no RuntimeAgent, Session, or Activation anywhere
(F4-M15).

## 4. Authorized advancement (§124)

`commitTransition` performs, in ONE `BEGIN IMMEDIATE` transaction:

```text
verify the head projection matches the epoch chain
require head.epoch == expectedHeadEpoch
require proposal.baseEpoch == the head ref        (else stale_base_epoch)
load the current (head-epoch) charter
unchanged revision  → digest must match            (else charter_conflict)
new revision        → must be current+1; register the new charter revision
count unique approvals ∩ current-charter authorities
require count >= requiredApprovals                 (else approval_threshold_not_met)
append the new epoch (predecessor = head ref)
advance the head projection
COMMIT
```

Any failure → `ROLLBACK`; no partial epoch, charter, or head change.

## 5. Institution may adopt a new Organization body (§126–§129)

- The institution may adopt a new `OrganizationDefinitionRef` while
  `InstitutionId` is unchanged, provided the transition is authorized.
- The organization id may ALSO change (Epoch 1 → O1, Epoch 2 → O2); the
  institution id is unaffected (F4-M14).
- Adoption is EXPLICIT: a new organization with a similar mission/members is
  NOT inferred to be the same institution. Only an authorized epoch transition
  establishes continuity.

## 6. Total member replacement (§127)

```text
Epoch E1  Organization O@1  members = {alpha, beta}
authorized transition
Epoch E2  Organization O@2  members = {gamma, delta}

InstitutionId unchanged   (F4-M13)
```

Therefore `InstitutionIdentity ≠ CurrentMembership`, and — since O@1 and O@2
have different organization ids in the proof — also
`InstitutionIdentity ≠ OrganizationBodyIdentity`.

## 7. Provenance

`InstitutionTransitionProposal` carries the authorized `transitionId`; the
resulting epoch records it. Every epoch is therefore traceable to the proposal
and the approvals that authorized it. The head projection is a convenience,
never the sole truth.
