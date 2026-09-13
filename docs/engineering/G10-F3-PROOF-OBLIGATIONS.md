# G10-F3 — Proof Obligations

Transformations generate first-class proof obligations (§92–§95). They are not
comments, and they are never silently admitted.

## 1. Artifact (§92)

```ts
interface OrganizationProofObligation {
  readonly obligationId: string;      // deterministic: po-<digest(kind, detail)>
  readonly kind: string;              // typed kinds (below)
  readonly status: "satisfied" | "unresolved";
  readonly detail: string;
  readonly evidenceRefs?: readonly string[];
}
```

`obligationId` is a deterministic digest of `(kind, detail)`, so the same
proposal always yields the same obligation identities (F3-M09).

## 2. Typed kinds

Structural / explicit-classification (deterministically resolvable):

```text
member_unplaced, role_unclassified, norm_unclassified, norm_role_missing,
assignment_dangling, interaction_role_missing, successor_mission_missing,
overlap_not_declared, base_missing, revision_does_not_advance,
role_collision_unresolved, norm_conflict_unresolved, mission_not_explicit,
source_count_insufficient
```

Structural guarantees (satisfied by construction when the above hold):

```text
all_members_accounted
all_roles_classified
all_norms_classified
cross_boundary_interactions_synthesized
no_invented_boundary_ports
```

Evidence-bearing (NEVER satisfied by compilation):

```text
evidence_claim_unverified
```

## 3. Evidence ≠ claim (§94–§96)

A proposal saying "the split preserves behavior" is not evidence. The optional
`TransformationEvidencePort` is a narrow READ-ONLY port:

```ts
interface TransformationEvidencePort {
  inspect(refs: readonly string[]): Promise<readonly {
    ref: string; verified: boolean; fresh: boolean;
  }[]>;
}
```

- With no port configured, a cited evidence ref leaves `evidence_claim_unverified`
  UNRESOLVED (F3-M13).
- With a port, the obligation is satisfied only when every cited ref is both
  `verified` and `fresh`.
- No second evidence system is created; the port delegates to existing
  Palimpsest evidence semantics.

## 4. Obligations block adoption (§144 preview)

`planTransformationActivation` throws `OrganizationDefinitionError` when the
assessment status is not `admissible`. Unresolved structural obligations and
unverified evidence claims both block activation. Governance approval (F4/F5)
will NOT bypass this: approval ≠ truth verification, and approval does not
satisfy structural or evidence obligations.

## 5. Status determination

```text
status = "blocked"   if any obligation.status === "unresolved"
status = "admissible" otherwise
```

This is computed in `finalize` and is the single gate for activation.
