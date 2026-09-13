# G10-F2 — Organization Lineage Store

## 1. Ownership (§66)

Path: `$DSH_HOME/palimpsest/organization.sqlite` (`defaultOrganizationPath()`).

The store owns ONLY:

```text
OrganizationDefinition immutable revisions
explicit parent lineage per revision
```

It does NOT own:

```text
collaboration history        (coordination store)
Work / orchestration         (Work EventStore)
PersistentPoint              (continuity store)
effect operations            (Ordarium ledger)
Institution epochs           (F4 institution store)
```

No overlapping canonical truth.

## 2. Schema

```sql
CREATE TABLE organization_revisions (
  organization_definition_id TEXT NOT NULL,
  revision                   INTEGER NOT NULL,
  artifact_json              TEXT NOT NULL,
  parent_revision            INTEGER,
  parent_digest              TEXT,
  PRIMARY KEY (organization_definition_id, revision)
);
```

The composite PRIMARY KEY makes duplicate registration atomic across processes.
`parent_*` records the explicit lineage edge; the artifact itself carries no
lineage (identity independence).

## 3. Registration rules (§67/§68)

`registerRevision({definition, parent, expectedHeadRevision})`:

```text
genesis (expectedHeadRevision === null)
  parent must be null; revision must be 0
  rejected if the organization already has revisions

extension (expectedHeadRevision is a number)
  parent must be non-null and name the same organization
  in one BEGIN IMMEDIATE transaction:
    - byte-identical (organization, revision) present → idempotent no-op
    - same (organization, revision) with different content → artifact_conflict
    - head must exist and equal expectedHeadRevision  (else head_mismatch)
    - revision must equal head + 1                    (else invalid_registration)
    - parent ref must equal the current head ref      (else lineage_conflict)
    - insert; COMMIT
```

Any failure → `ROLLBACK`; nothing partial is written.

Consequences:

- No in-place mutation: there is no UPDATE path and no delete API.
- No parallel silent lineage forks under one organization id (§67): a
  competing revision under an existing head fails closed. A genuinely
  independent lineage must use a NEW organization id.
- A retried registration converges (idempotent at any revision, including
  genesis — checked before lineage rules).

## 4. Error taxonomy

| Kind | Meaning |
| ---- | ------- |
| `invalid_registration` | malformed request (genesis/parent/revision shape) |
| `lineage_conflict` | parent ≠ current head; genesis on existing; no revisions to extend |
| `head_mismatch` | `expectedHeadRevision` ≠ actual head (stale writer) |
| `artifact_conflict` | same (organization, revision) with different content |
| `malformed_record` | stored artifact fails strict parse (fail closed on read) |

## 5. Read API

```text
get(ref)                        exact revision
head(organizationDefinitionId)  current OrganizationDefinitionRef
current(organizationDefinitionId) current definition
listRevisions(organizationDefinitionId)   ascending revisions
lineage(organizationDefinitionId)         revisions + explicit parent edges
```

Reads parse through the strict `parseOrganizationDefinition`, so a corrupted
row fails closed rather than being skipped or repaired.

## 6. Proof

`test/f2_organization.test.ts` covers immutability (F2-M12), lineage conflicts
(F2-M13), and restart replay reproducing the revision chain with correct parent
edges.
