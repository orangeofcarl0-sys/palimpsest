# G10-F2 — Role / Norm / Capability Boundaries

Four distinct notions that F2 keeps separate:

## 1. Role is not agent identity (§51)

A `RoleDefinition` is a functional organizational position. The same member
may hold multiple roles; the same role type may be held by multiple members.
A `RoleId` is not a `PeerRef`, not an `AgentDefinitionId`, and not a member
identity (F2-M04).

## 2. Capability requirement is not capability possession (§53/§54)

- `RoleDefinition.requiredCapabilities` DECLARES what a role needs.
- It does NOT assert that any member possesses those capabilities.
- Palimpsest currently has `PeerAdvertisement` competence tags, which are
  explicitly NOT evidence. F2 therefore does **not** fabricate κ
  (`Agent × Capability` verified possession); κ is DEFERRED.
- The optional `roleEligibilityView` compares declared requirements against
  declared observations and labels the outcome honestly:

```text
eligible_by_declared_capability      declared tags cover the requirement
declared_capability_insufficient     declared tags are known and insufficient
capability_unknown                   nothing is known about the member
```

It never emits "verified capable" (F2-M06).

## 3. Norm permission is not effect authority (§59/§60)

This is load-bearing:

```text
OrganizationPermission ≠ AuthorityGrant
```

A norm such as `{kind: "permission", roleId: "reviewer", actionTag: "approve-report"}`
records an organizational expectation. It grants NO Ordarium effect authority,
NO git-write authority, and NO runtime authority. No adapter maps norms to
effects in F2; the organization module imports no effect/Ordarium concern
(F2-M05). Ordarium authorization remains exactly as before.

## 4. Declared interaction is not collaboration history (§61/§62)

`OrganizationInteraction` describes the organization's declared interaction
structure Γ (`fromRoleId → toRoleId`, `protocol`). It is NOT an actual
`CollaborationEvent`, message, or Work dependency. Observed collaboration
history lives in the coordination store; declared structure lives in the
organization artifact. The two are never conflated.

## 5. No hierarchy inference (§174 preview)

An organization may declare roles, norms, and interaction structure WITHOUT any
manager/subordinate edges. F2 introduces no manager, leader, or authority-root
concept, and no continuation authority (that is F4).
