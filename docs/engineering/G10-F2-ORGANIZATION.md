# G10-F2 — OrganizationDefinition

Status: **COMPLETE**

Baseline: `main` @ `3eb70e3` (F1 merged).
Branch: `experiment/g10-f2-organization-grounding`.

---

## 1. What an Organization is (§45, §50, §58, §105 preview)

An `OrganizationDefinition` is an immutable semantic artifact answering:

```text
who belongs            members
what they may be       roles + role capability requirements
who holds what         assignments
why it exists          mission
what is expected       norms
who talks to whom      declared interaction structure
```

It is its OWN artifact. The implementation does NOT reuse
`ArchitectureDefinition`, `WorkGraph`, `CoalitionSnapshot`, or `PeerRef` as
the organization object (§45).

## 2. Artifact shape (§50)

```ts
interface OrganizationDefinition {
  readonly schemaVersion: 1;
  readonly organizationDefinitionId: OrganizationDefinitionId;
  readonly revision: OrganizationRevision;
  readonly digest: OrganizationDigest;
  readonly mission: string;
  readonly members: readonly OrganizationMemberRef[];
  readonly roles: readonly RoleDefinition[];
  readonly assignments: readonly RoleAssignment[];
  readonly norms: readonly OrganizationNorm[];
  readonly interactions: readonly OrganizationInteraction[];
}
```

`OrganizationDefinitionRef {organizationDefinitionId, revision, digest}` is the
canonical immutable reference (§69). Revision lineage is NOT part of the
artifact — it lives in the store (§66–§69).

## 3. Membership is a tagged identity (§47/§48)

```ts
type OrganizationMemberRef =
  | { kind: "peer"; peer: PeerRef }
  | { kind: "agent_definition"; architectureDefinitionId; agentDefinitionId };
```

`peer:alpha` and `agent:…/alpha` are DIFFERENT members even with the same
string value. There is no arbitrary-string member (§47). Child-organization
membership is deliberately NOT representable in F2 (§49).

Overlapping membership across organizations is allowed; no `organizationId`
owner field exists on a peer (§57).

## 4. Roles, assignments, mission, norms, interactions (§51–§62)

- `RoleDefinition {roleId, requiredCapabilities}` — a functional position;
  `Role ≠ Agent`. A member may hold multiple roles; a role may be held by
  multiple members.
- `RoleAssignment {member, roleId}` — member and role must exist; duplicate
  `(member, role)` rejected.
- **Capability requirement ≠ possession** (§53): `requiredCapabilities` are
  declarations. κ (verified possession) is DEFERRED and advertisements are not
  evidence (§54). `roleEligibilityView` labels results honestly
  (`eligible_by_declared_capability` / `declared_capability_insufficient` /
  `capability_unknown`) and never says "verified capable" (§55).
- `mission` — organization semantics, a non-empty canonical statement
  (not a Work goal, Task, Commitment, or charter) (§58).
- `OrganizationNorm {normId, kind: obligation|permission|prohibition, roleId,
  actionTag}` (§59).
- **Norm permission ≠ effect authority** (§60): a permission norm grants no
  Ordarium/git/runtime authority; the organization module has no effect path.
- `OrganizationInteraction {interactionId, fromRoleId, toRoleId, protocol}`
  (§61) — DECLARED structure Γ, not actual message history
  (`declared interaction ≠ observed collaboration event`, §62).

## 5. Canonicalization & digest (§63–§65)

Members, roles, assignments, norms, interactions, and `requiredCapabilities`
are semantic SETS: canonical stable order, duplicate semantic identities
rejected. Digest domain `palimpsest.organization-definition.v1` over canonical
content; content identity **excludes** `organizationDefinitionId` and
`revision` (mirroring `ArchitectureDefinition` — machine-tested).
`parseOrganizationDefinition` fails closed on a digest mismatch.

## 6. Firewalls

```text
Organization ≠ Coalition          (definition has no coalition/basis fields)
Organization ≠ WorkGraph          (no Work/Task/scheduler imports)
Organization ≠ RuntimeScope       (no scheduler/retry/budget/checkpoint)
Organization ≠ Holon              (no external-unity interface claim)
Role ≠ Agent identity
Role ≠ authority grant
Capability claim ≠ evidence
Capability requirement ≠ possession
Organization permission ≠ Ordarium authority
member ≠ owner
```

## 7. Machine proofs

| Proof   | Statement |
| ------- | --------- |
| F2-M01 | Organization ≠ Coalition (no automatic bridge except explicit authoring) |
| F2-M02 | Organization ≠ WorkGraph |
| F2-M03 | Organization ≠ RuntimeScope |
| F2-M04 | Role ≠ member identity |
| F2-M05 | role permission ≠ effect authority |
| F2-M06 | capability advertisement ≠ capability truth |
| F2-M07 | overlapping org membership allowed |
| F2-M08 | member identity namespaces remain distinct |
| F2-M09 | canonicalization deterministic |
| F2-M10 | strict parser (unknown fields, dangling refs, duplicates, digest) |
| F2-M11 | nested immutability |
| F2-M12 | organization revision immutable |
| F2-M13 | conflicting lineage head fails closed |
| F2-M14 | coalition provenance does not auto-create an organization |

`test/f2_organization.test.ts`: 14 tests. Full suite: **86 files / 750 tests**.
