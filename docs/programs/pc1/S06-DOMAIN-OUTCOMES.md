# S06 — Domain outcomes and negative results

## 1. Three statuses, not one

`palimpsest_continuity summary` now reports, per task:

- `state` — execution/delivery (READY/ACTIVE/VERIFYING/SATISFIED/…);
- `workAcceptance` — ACCEPTED (a canonical promotion fact), CANDIDATE (VERIFYING), NOT_ACCEPTED
  (SATISFIED without promotion), or UNKNOWN;
- `businessOutcome` — an explicit domain-contract result: `supported | infeasible | uncertain |
  contested | partially_fulfilled | unknown`.

`palimpsest_outcome` exposes the contracts and records evaluations. A contract is deterministic over
the facts it is given; a caller cannot choose the resulting status.

## 2. Built-in contracts

| Contract | What it proves | What it does NOT prove |
|---|---|---|
| `json-artifact` | the named artifact parses as JSON and contains the declared keys | that the values are correct or the business claim is true |
| `negative-investigation` | a named `NEGATIVE_RESULT` journal entry exists; marks the investigation complete | that the business objective is attained — it is `infeasible` with unmet requirements |
| `human-review` | the question requires human judgement | any machine truth — it always returns `uncertain` |

## 3. Storage

An evaluation is recorded as a project Journal `REFERENCE_NOTE` with a `pc1-domain-outcome/v1`
JSON block and its evidence refs. It owns no new canonical database and no new task state. The
latest evaluation per task is what the continuity projection reads.

## 4. Tests and evidence

`test/pc1_domain_outcome.test.ts` (4 tests): supported/infeasible/uncertain from bytes; negative
investigation completes the investigation while leaving `businessOutcome=infeasible` and unmet
requirements; human-review stays uncertain; the tool has no `status`/`register` input.

## 5. Residual limits

- The built-in contracts are starter contracts, not a universal truth engine. A domain can register
  a new contract in code; the agent cannot.
- A contract evaluation is only as good as the facts it is given; the product records the artifact
  digest and the evidence refs so a later reviewer can re-check it.
