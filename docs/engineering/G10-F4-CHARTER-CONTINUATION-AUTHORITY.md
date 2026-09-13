# G10-F4 — Charter & Continuation Authority

## 1. InstitutionCharter (§107)

```ts
interface InstitutionCharter {
  readonly schemaVersion: 1;
  readonly institutionId: InstitutionId;
  readonly revision: number;
  readonly digest: string;
  readonly purpose: string;
  readonly continuationAuthority: ContinuationAuthorityRule;
}
```

- `purpose` is durable institutional continuity semantics. It is NOT the
  organization mission (§149): the two may be related but are never copied
  automatically.
- Content identity digest domain `palimpsest.institution-charter.v1` over
  `{purpose, continuationAuthority}` — EXCLUDES institutionId and revision.
- Strict parser, deep freeze, digest fail-closed.

## 2. ContinuationAuthorityRule (§109)

```ts
interface ContinuationAuthorityRule {
  readonly authorities: readonly PeerRef[];   // canonical set
  readonly requiredApprovals: number;
}
```

Validation: `1 <= requiredApprovals <= unique authorities.length`; authorities
are a canonical unique set (duplicates rejected); no implied manager.

## 3. Continuation authority is its own authority domain (§108)

It determines WHO may authorize institutional lineage advancement. It does NOT
grant Ordarium effects, git write, runtime creation, Work scheduling, or truth
verification. The institution module imports no effect concern.

## 4. Authority is not organization role (§110)

Continuation authority is NEVER inferred from `role = manager`, `role = chair`,
the local peer, user focus, or the first founder. It is explicit in the charter.
An organization role holder has no governance power unless the charter names
them.

## 5. Current authority controls its own successor (§111)

Changing the continuation authority must be approved under the CURRENT
charter's rule. Implemented by counting approvals against the head epoch's
charter (the in-force charter), never against a proposed/registered revision.
A NEW authority set therefore cannot authorize itself into existence: if only
the new authorities approve an amendment that replaces the authority set, the
advance fails `approval_threshold_not_met` (F4-M06/M07).

## 6. Charter revision is append-only (§125)

- A charter change creates a NEW revision and a NEW epoch.
- The old charter revision is never mutated or deleted.
- The store refuses a proposed charter whose revision is unchanged but whose
  content differs (`charter_conflict`).
- `currentCharter` is the charter bound to the head epoch — a merely
  registered (proposed but unadopted) revision is not in force.

## 7. Genesis charter

Genesis registers charter revision 0 under an explicit InstitutionId. Genesis
is an administrative act (§117); this kernel does not derive it from anything.
