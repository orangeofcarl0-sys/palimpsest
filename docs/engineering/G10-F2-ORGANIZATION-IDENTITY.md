# G10-F2 — Organization Identity

## 1. Identity namespaces (§46–§48)

| Identity | Owner | Not equivalent to |
| -------- | ----- | ----------------- |
| `OrganizationDefinitionId` | Organization | coalition / institution / peer / architecture |
| `OrganizationRevision` | Organization lineage | Architecture/Work/Binding revision, Institution epoch |
| `OrganizationDigest` | Organization content | ids, revisions |
| `RoleId` | Organization | agent / member / authority |
| `OrganizationMemberRef` (tagged) | Organization membership | a raw string, a PeerRef alone, an AgentDefinition alone |

Revision lineage is independent from Architecture revision, Work revision,
Binding revision, and Institution epoch (§46).

## 2. Tagged member identity (§47/§48)

```ts
{ kind: "peer", peer: PeerRef }
{ kind: "agent_definition", architectureDefinitionId, agentDefinitionId }
```

These can share the same string value and still mean different actors.
`organizationMemberKey` is the canonical namespaced key (`peer:<id>` vs
`agent:<arch>/<agentId>`); membership comparison and canonical ordering use
that key, never bare string equality. The parser rejects any other `kind`, so
an untagged/arbitrary-string member cannot enter the artifact.

## 3. Digest content identity (§65)

```text
digest = SHA-256(canonicalJson({
  domain: "palimpsest.organization-definition.v1",
  mission,
  members,            // canonical set
  roles,              // canonical set (roleId order; requiredCapabilities sorted)
  assignments,        // canonical set
  norms,              // canonical set (normId order)
  interactions,       // canonical set (interactionId order)
}))
```

EXCLUDED (decided explicitly, machine-tested by F2-M09): `organizationDefinitionId`
and `revision`. Two organizations with identical structure but different ids
have the same content digest — identity lives in the id, semantics in the
digest. The parser recomputes and compares: a bad digest is never replaced.

## 4. Immutability

`materializeOrganizationDefinition` and `parseOrganizationDefinition` both
return deeply frozen artifacts (definition, arrays, and every nested member /
role / norm / interaction / peer object). Caller inputs are detached before
validation (JSON round-trip + fresh canonical objects), so later mutation of a
caller object cannot alter a materialized definition.

## 5. Lineage identity is store-owned (§66–§69)

The store enforces, under one `BEGIN IMMEDIATE` transaction:
same `organizationDefinitionId`, `revision = currentHead + 1`, parent ref equal
to the current head, and the caller's `expectedHeadRevision` equal to the
actual head. A fork is not expressible: a competing revision 1 under an
existing head fails closed. If an independent lineage is desired, it must use
a NEW organization id.
