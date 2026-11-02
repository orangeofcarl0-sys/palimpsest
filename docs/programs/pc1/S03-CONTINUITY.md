# S03 — Project cognition continuity

## 1. The three responsibilities

`src/project_continuity/` implements three DERIVED reads:

1. **Historical material** stays where it already is: events, journal entries, attempts,
   promotions. The service never copies it.
2. **Current understanding** is a projection with explicit standing: `OBSERVED_SOURCE`,
   `AGENT_INTERPRETATION`, `CANDIDATE`, `ACCEPTED_FOR_PURPOSE`, `NEGATIVE_FINDING`, `UNCERTAIN`,
   `SUPERSEDED`, `UNKNOWN`.
3. **Context capsule** renders the projection under a hard byte budget, naming omitted sections
   and unavailable owners rather than silently claiming completeness.

## 2. Shape

`palimpsest_continuity` (new, reviewed tool addition) exposes:

- `summary` — goal, basis (revision/digest/head/observation time), requirements, decisions, accepted
  results, candidates, negative findings, open questions/interpretations, tasks, pending work,
  blocked effects, authority boundaries, legal next actions.
- `explain(subject)` — one item by projection id or source ref (`journal:…`, `task:…`, `commit:…`,
  `requirement:…`), with source refs, adoption basis, applicability and reopen conditions. A
  subject that does not resolve returns `found:false` / `UNKNOWN` — a real gap, not an empty hit.
- `context_capsule(maxBytes)` — sections are added in priority order; a section that does not fit is
  listed in `omitted`; `complete` is false if anything was omitted or an owner is unavailable. The
  capsule digest covers text + source index + basis.

## 3. Where the facts come from

| Fact | Owner |
|---|---|
| Goal, requirements, decisions, task objectives | ProjectIR through the Work owner |
| Task/attempt/evidence/promotion states | Controller status projection |
| Accepted results | promotion facts (`PROMOTION_COMMITTED` lineage) |
| Candidates | `VERIFYING` tasks + non-journal open loops |
| Negative findings / open questions / interpretations | project journal entries, with resolution state |
| Blocked effects | promotion fence rows |

No new store, no cache, no second ProjectIR. Every call re-derives from the current owners.

## 4. Fresh-session inheritance

The service is stateless. The test disposes the first installation and creates a NEW installation
over the same durable databases; the summary sees the same accepted result, negative finding, goal
and basis. No transcript is read or copied. The test does not inject an evaluator oracle.

## 5. Invalidation

Changing the project revision changes `basis.projectRevision`; the capsule digest changes because it
covers the basis and text. There is no stale cache to invalidate — a later call cannot return the
older projection.

## 6. Tests and evidence

`test/pc1_continuity.test.ts` (3 tests):

- accepted vs candidate vs negative vs open standing; explain hit/miss; 1,024-byte capsule is
  truncated and names omitted sections; source index present.
- fresh-session inheritance over the same state directory.
- revision change updates basis and changes the capsule digest.

Adjacent: `application_parity` passes with the new tool recorded; `pc1_normal_product` and the
S01 integrity tests pass.

## 7. Residual limits

- The summary's accepted-result titles depend on promotion facts; a deployment with no promotion
  history correctly reports none.
- Open loops are derived by the existing workspace; a journal-only deployment still gets journal
  standing but not the non-journal loop classes.
- The capsule is a bounded rendering, not a search engine. Precise source reading remains the
  `palimpsest_project journal_entries` / `palimpsest_continuity explain` path.
