# G10-F5 — Coalition → Organization → Institution

The three arrows of the bottom-up path, and exactly what each one requires.

## 1. Collaboration → Coalition (derived)

Derived by F1 `deriveCoalitionSnapshot` from active commitments/participations
in a typed scope. Temporary, overlapping, basis-recorded. Creates nothing
durable, writes nothing.

## 2. Coalition → Organization (explicit authoring)

`materializeOrganizationFromCoalition({coalition, organizationDefinitionId,
revision, mission, roles, assignments, norms?, interactions?, members?})`.

Requirements:

```text
organizationDefinitionId   explicit
revision                   explicit
mission                    explicit
roles                      explicit
assignments                explicit
norms / interactions       explicit (optional, default empty)
members                    explicit, or peer members seeded from coalition
```

Guarantees:

- The coalition contributes MEMBERS (PeerRefs) at most. It never infers roles,
  assignments, norms, or interactions.
- `result.provenance` is a `CoalitionProvenanceRef` (snapshot digest + basis).
- `CoalitionSnapshot.digest` is NEVER used as the organization id.
- Nothing is persisted; the caller registers the revision explicitly in the
  organization store.

## 3. Organization → Institution (explicit governance)

`institutionService.genesis({institutionId, purpose, authorities,
requiredApprovals, organization})`:

- The organization must EXIST (checked via the organization store).
- `InstitutionId` is explicit; it is never derived from the organization id.
- The charter records the initial continuation authority explicitly.
- Genesis is an administrative act; no inference from Organization existence,
  coalitions, or commitments.

## 4. Ongoing evolution

```text
activateAndGovernOrganizationChange
  → assert the transformation is admissible (obligations satisfied)
  → activate organization revision(s) atomically
  → propose an InstitutionTransitionProposal adopting one body

service.approve / approveRemote   (current-charter authorities)
service.advance                   (atomic epoch advancement)
```

## 5. What never happens

```text
coalition activity never auto-creates an organization
organization existence never auto-creates an institution
a transformation never mutates the institution head directly
a split never auto-forks an institution
a merge never auto-merges institutions
a coalition digest never becomes an organization id
```
