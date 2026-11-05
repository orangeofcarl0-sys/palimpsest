# PWRS-R3 — governed recovery with the successor input acknowledgement

Status: **executed under the owner's 2026-11-05 PWRS-R3 authorization** (A only, 2 sessions,
2,500,000 per session, 125,000 reserve, 5,000,000 aggregate). This is the minimal retest of the
PWRS-E successor gate, not a repeated sample and not an F/A comparison.

Evidence: `research-evidence/pwrs/2026-11-05/pwrs-r3/`.
Pre-registration: `research-evidence/pwrs/live/cohort-pwrs-r3.json`.
Authorization: `research-evidence/pwrs/live/authorization-pwrs-r3.json`.
Product under test: `e3110c8` (PWRS-D + PWRS-E).

## 1. What changed

PWRS-E holds a `successor` to the same unseen-input fact as a settlement: while the canonical tree
holds paths the attempt's base never contained, `relay successor` refuses with
`INPUTS_CHANGED_SINCE_BASIS` and lists them; the caller must pass `acknowledgeInputs=true`.
`workers` also reports `inputsNotInBasis` per attempt, so the fact is visible before the route choice.
14 PWRS tests cover the gates, the acknowledgement and the historical-world fact.

## 2. The retest

Same scenario and budget as PWRS-R2: the measured 700 mm source is an **untracked** file under
`inbox/`, injected at T+60s; session 1 is killed at the 400,000 reported-token milestone; session 2 is
a new principal on durable state only. No prompt names the gate, the acknowledgement or the route.

| | A |
|---|---|
| Rubric | **7/7** |
| Final artifact | 19,878 bytes, **candidate at `ddf8bf3`** (`RESULT_COMMIT`) |
| Tokens | 404,956 + 1,424,148 = **1,829,104** |
| Session 1 end | killed at 404,956 (milestone); the world was **empty** |
| Session 2 end | **natural** (exit 0) at 1,424,148 — **no budget stop** |
| Episode | **`WAIT_FOR_OPERATOR`**, artifact at `RESULT_COMMIT ddf8bf3` |
| Task / attempt | `VERIFYING` / `COMPLETED` |
| Promotion | none (operator acceptance is pending) |
| Attribution | old attempt `UNATTRIBUTED` (successor); new attempt `MULTI_EXECUTOR`, `independenceEligible=false` |

Aggregate **1,829,104 / 5,000,000**, 3,170,896 unused. 74 provider POSTs: 72×200, 2×502
`UPSTREAM_TIMEOUT` at 02:38:12–13 UTC (after both sessions had ended; no recorded session usage), and
one GET 403 health probe.

## 3. What A-2 did

1. Pulse; status; read the tree, `TASK.md`, `sources/*`, `inbox/README.md` and the injected
   `inbox/2026-11-03/corridor-measurement.md`.
2. Found the retained attempt world: it held no deliverable (the killed worker had not written).
3. `relay takeover declareExecutorAbandoned=true` → NOT_READY (`NO_WORK`, the empty world).
4. `relay successor declareExecutorAbandoned=true` → **REFUSED**:
   `INPUTS_CHANGED_SINCE_BASIS: … inbox/2026-11-03/corridor-measurement.md — read them first; …
   acknowledgeInputs=true`.
5. `relay successor acknowledgeInputs=true` → **SUCCESSOR_READY**; the old attempt was cancelled and
   the task returned to READY.
6. Delegated a new attempt in a new world, copied/propagated the measured input, and drove it to a
   committed package (`ddf8bf3`); the product settled it as a candidate (task `VERIFYING`).
7. `conclude WAIT_FOR_OPERATOR`, naming the candidate commit and the measured basis. The session
   exited naturally with 1,424,148 tokens, well below the 2,375,000 soft stop.

The relay records are honest about authorship: the cancelled attempt is `UNATTRIBUTED`; the settled
attempt is `MULTI_EXECUTOR` because its result head is not the end head of any observed worker
invocation (the principal also wrote/committed), so it is not `independenceEligible`.

## 4. Reading

- **The gate was exercised and changed the route.** The principal read the constraint, hit the
  refusal, acknowledged the exact path, and only then started the new attempt. This is the first
  real-model run in the PWRS-R line where the unseen-input fact was actually presented at a decision
  point and visibly acted on.
- **The episode converged naturally.** Session 2 ended on its own with a recorded
  `WAIT_FOR_OPERATOR` and a candidate, using ~60% of its soft stop. The task sits in the correct
  acceptance state; no promotion or self-acceptance occurred.
- **Business content is 7/7** and the package names the measured 700 mm basis and the absence of a
  compliant Site B unit on the current evidence.
- **This is one pair.** The earlier A pairs differed in where the kill landed and in which route the
  model chose, so the improvement cannot be attributed to the gate alone. It is, however, the first
  pair in this line with all three: gate triggered, candidate settled, natural episode end.
- **The two post-run 502s** arrived after both sessions ended and are recorded as such; they did not
  affect an ending.

## 5. Operator acceptance (after the run)

The owner-authorized operator action was performed through the existing Promotion path
(`scripts/pwrs/operator_accept.mjs`, the same `promoteAttempt` route):

| | |
|---|---|
| Candidate | `ddf8bf3` (attempt `8762438837b9869ac9a52e8d230625c6`) |
| Promotion | `promotion-b70b3bc749dad377cc99aeb7075d40dc` (`PROMOTION_COMMITTED`) |
| Canonical head | `eaa86fc` (from `272a4c7`), revision 1 |
| Task | `SATISFIED` |
| Evidence | `operator-r3-accept.json`, `operator-promotions.json`, `final/canonical-log.txt` |

This is a real operator decision, not a model action and not an evaluator oracle. The episode that was
recorded as `WAIT_FOR_OPERATOR` now has its waiting condition satisfied; a later pulse reads it as
`REOPENED` with "the operator accepted task package", which is the product's correct behaviour.

## 6. Limitations

- One A pair; no F control; no repeated sample. The PWRS-R F result (7/7, budget stop) remains a
  descriptive reference only.
- `MULTI_EXECUTOR` means the final candidate contains work from more than the observed worker window;
  the principal's participation is recorded, not hidden, and the result is not independent production.
- No operator promotion was performed; the candidate is `VERIFYING`, which is the correct pending
  state. The next session would accept or rework it.
- The package's 7-fact floor does not measure decision quality; it only states that the required
  facts are present.

## 6. Authorization and usage

- Authorized: PWRS-R3, stage `pwrs-r3`, condition A, 2 sessions, 2,500,000 per session, 125,000
  reserve, 5,000,000 aggregate, expires 2026-11-12.
- Gate: with a deliberately missing adapter it wrote `ADAPTER_NOT_CONFIGURED`, exit 3,
  `modelCalls=0`; the real run passed the same gate.
- Used **1,829,104**, leaving 3,170,896.

## 7. Evidence

- `score.json` — rubric, final source, interruption facts, sessions, governance (tasks, attempts, two
  relay records, episode).
- `interruption-A.json` — the empty retained world at the kill.
- `final/A-candidate.md` — the 19,878-byte candidate at `ddf8bf3`; `final/canonical-log.txt` shows the
  candidate is not on the canonical branch (no promotion).
- `sessions/A-1`, `sessions/A-2` — run records, guard ledgers, kill/stop timestamps, logs.
- `sessions/streams/` — real DSH session streams.
- `usage.json`, `proxy.jsonl` — reconciled tokens and request metadata.
