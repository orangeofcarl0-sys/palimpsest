# G10-F3 — Merge

Merge unites ≥2 source organizations into one target organization. It requires
an explicit decision for every collision; the engine never guesses (§88–§91).
Implemented in `evaluateMerge`.

---

## 1. Required explicit inputs (§88)

```text
source OrganizationRefs (>= 2)
target organizationDefinitionId + revision
explicit target mission
role conflict resolution (per source role)
member union policy (derived union by default, or explicit members)
norm conflict resolution
```

## 2. Role collision (§89)

If a `roleId` occurs in more than one source, the merge DOES NOT assume
equivalence. Each occurrence requires an explicit decision:

```ts
{ sourceOrganizationDefinitionId, roleId,
  decision: "same_role" | "rename" | "keep_distinct",
  targetRoleId? }          // required for rename / keep_distinct
```

- `same_role` — the roles are united under the original `roleId`;
  `requiredCapabilities` are unioned.
- `rename` / `keep_distinct` — a distinct `targetRoleId` is required.

Any collision without a decision → `role_collision_unresolved` (unresolved,
blocks activation). F3-M07.

## 3. Norm conflict (§90)

If one source carries `permission(X)` and another `prohibition(X)` for the same
`actionTag`, the engine does NOT choose one automatically. An explicit
resolution is required:

```ts
{ actionTag, decision: "permission" | "prohibition" | "drop" }
```

Absent a resolution → `norm_conflict_unresolved` (unresolved, blocks). When
resolved, only norms matching the chosen kind survive (F3-M08).

## 4. Mission (§91)

Mission synthesis requires an EXPLICIT target mission. The engine never
concatenates strings and calls it synthesis. An empty/whitespace mission →
`mission_not_explicit` and no candidate is produced.

## 5. Members / assignments / interactions

- **Members**: union of source members by tagged key, or the explicit
  `members` list when provided. Duplicates collapse by identity (never by raw
  string).
- **Assignments**: remapped through the role decisions; assignments whose
  member is absent or whose role is dropped are not carried (no dangling
  assignment is materializable).
- **Interactions**: all source interactions are INTERNALIZED into the target
  (remapped through role decisions). Merge is the inverse of split: no boundary
  ports are produced. Remaining external interfaces are out of F3 scope.
- **Norm ids / interaction ids** colliding across sources are disambiguated
  deterministically (`<id>.<sourceOrdinal>`) rather than dropped.

## 6. Result

A single candidate `OrganizationDefinition` for the target id/revision. It is
admissible only when every obligation is satisfied; otherwise the assessment is
`blocked` and cannot be activated (§100, §144). Source history is unchanged.

## 7. Explicit non-goals

```text
Merge does not merge Institutions (F4/F5 concern).
Merge does not choose role equivalence or resolve norm conflicts automatically.
Merge does not fabricate a mission.
Merge does not rewrite source organization revisions.
```
