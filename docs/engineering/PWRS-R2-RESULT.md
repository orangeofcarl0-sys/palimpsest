# PWRS-R2 — governed recovery retest with the PWRS-D input gate

Status: **executed under the owner's 2026-11-05 PWRS-R2 authorization** (A only, 2 sessions,
2,500,000 per session, 125,000 reserve, 5,000,000 aggregate). This is the minimal retest of the
PWRS-D repair, not a repeated sample and not an F/A comparison.

Evidence: `research-evidence/pwrs/2026-11-05/pwrs-r2/`.
Pre-registration: `research-evidence/pwrs/live/cohort-pwrs-r2.json`.
Authorization: `research-evidence/pwrs/live/authorization-pwrs-r2.json`.
Product under test: `adbcd42` (PWRS-D).

## 1. What changed in the product

PWRS-D adds two mechanical facts to the recovery path:

1. **Unseen inputs.** `unseenInputs()` lists canonical paths present now that the attempt's base
   commit never contained (untracked or modified, excluding `.palimpsest/`). A **principal**
   settlement is refused with `INPUTS_CHANGED_SINCE_BASIS` until the caller passes
   `acknowledgeInputs=true`; the refusal lists the paths. The worker path records the fact without
   blocking.
2. **Historical worlds.** `workers` marks a settled attempt's world `HISTORICAL` and reports
   `worldMovedAfterResult` when the world holds commits or changes the result commit does not.
   A post-settlement edit is no longer mistakable for the candidate.

Unit coverage: `test/pwrs_relay.test.ts` (13 tests), including the refusal, the acknowledgement, and
the historical-world fact.

## 2. The retest

The scenario is the PWRS-R A condition, with one harness change: the measured 700 mm source is now
injected as an **untracked** file under `inbox/` (not gitignored), so the product can establish that
the attempt's base never contained it. Session 1 is killed at the 400,000 reported-token milestone;
session 2 is a new principal on durable state only. No prompt names the acknowledgement, relay,
takeover or successor.

| | A |
|---|---|
| Rubric | **7/7** |
| Final artifact | 45,385 bytes, **unsettled** in attempt `2e1675d0…`'s world, commit `09bf7ab` |
| Tokens | 410,744 + 2,397,123 = **2,807,867** |
| Session 1 end | killed at 410,744 (milestone) |
| Session 2 end | **budget stop** (2,397,123) |
| Natural end | **no** |
| Work at interruption | **none** — the worker had written nothing; the world was clean at the base |
| Reuse of the interrupted draft | none existed (0 lines) |
| Governance | old attempt **CANCELLED** as successor; new attempt **RUNNING**; task **ACTIVE**; no candidate, no promotion, no episode |

Aggregate **2,807,867 / 5,000,000**, 2,192,133 unused. 79 provider POSTs, all 200.

## 3. What A-2 did

1. Pulse; status; listed the tree, read `TASK.md`, `sources/*`, `inbox/README.md` and the injected
   `inbox/2026-11-03/corridor-measurement.md`.
2. Found the retained attempt world; it held **no deliverable** (the killed worker had not written
   yet).
3. `relay relayRoute=takeover declareExecutorAbandoned=true` → **NOT_READY**: "the world holds no
   observable change against its base, so there is nothing to settle."
4. `relay relayRoute=successor` → **SUCCESSOR_READY**; the old attempt was cancelled, the task
   returned to READY.
5. `next`, `next`, `workers`, `delegate taskId=package` — a NEW attempt and a new world.
6. Copied the measured input into the new world (`inbox/2026-11-03/` is untracked in that world), so
   the new worker could see it. The worker committed `09bf7ab Add multi-site energy deployment
   package`.
7. It kept polling `workers` until the guard stopped the session at 2,397,123. The attempt was still
   **RUNNING**; no `complete`/`relay` settlement happened, so the committed package never became a
   candidate.

## 4. Reading

- **The business outcome improved**: the final package is **7/7** and uses the measured 700 mm,
   rejecting the 900 mm unit. The principal propagated the new input into the fresh world, which is
  the correct real-world action when a worker's world cannot see the canonical tree.
- **The PWRS-D gate was not exercised.** The first attempt had no work, so takeover could not settle
  it; the model chose `successor`, which closes the attempt without settling and therefore bypasses
  the input acknowledgement. The gate is unit-tested, but this cohort did not trigger it.
- **Convergence failed again.** The committed package is in a RUNNING attempt's world with no
  settlement, no candidate and no episode; the task is ACTIVE. The next session would have to inspect
  the world and settle it. The budget stopped the principal before it closed the loop.
- **The successor route needs the same input fact.** A successor starts a new attempt at the current
  HEAD, which still does not contain the untracked input. The model solved this by copying the file;
  the product could make that unnecessary by surfacing unseen inputs to the new attempt's worker or
  by requiring an acknowledgement when starting a successor. That is the next product question, and
  it is not a repair this cohort was authorized to make.
- **Compared with PWRS-R's A pair**: R1 settled a stale 5/7 draft (relay takeover of the pre-constraint
  package); R2 produced a 7/7 package but left it unsettled. Neither converged. The improvement in
  content comes from the successor + copied input, not from the input gate.

## 5. Limitations

- One A pair, no F control. The previous F result (7/7, budget stop) is a descriptive reference only.
- The gate was not triggered; its real-model effect remains unmeasured. A scenario where the killed
  worker leaves a committed/committable draft would exercise it.
- Both sessions were stopped by the guard; a larger ceiling might have let A-2 settle, but the
  authorization fixed 2,500,000.
- The final artifact is a committed world file, **not** a settled candidate; the operator gate never
  came into play because no settlement occurred.

## 6. Authorization and usage

- Authorized: PWRS-R2, stage `pwrs-r2`, condition A, 2 sessions, 2,500,000 per session, 125,000
  reserve, 5,000,000 aggregate, expires 2026-11-12.
- Gate: with a deliberately missing adapter it wrote `ADAPTER_NOT_CONFIGURED`, exit 3,
  `modelCalls=0`; the real run passed the same gate.
- Used **2,807,867**, leaving 2,192,133. No other authorization was touched.

## 7. Evidence

- `score.json` — rubric, final source, interruption facts, sessions, governance (task/attempts/relay).
- `interruption-A.json` — the empty world at the kill.
- `final/A-package.md` — the 7/7 package from the new attempt world; `final/attempt-world-log.txt`
  (`09bf7ab`) and `final/attempt-world-status.txt` (`?? inbox/2026-11-03/`).
- `sessions/A-1`, `sessions/A-2` — run records, guard ledgers, kill/stop timestamps, logs.
- `sessions/streams/` — real DSH session streams (including the new worker).
- `usage.json`, `proxy.jsonl` — reconciled tokens and request metadata.
