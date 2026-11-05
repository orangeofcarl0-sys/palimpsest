# LHAPE-C — bounded real-model F/L/G pilot result

Status: **bounded pilot executed under the owner's 2026-11-04 authorization; the full long-horizon cohort was not run.**

This is not the full LHAPE-C cohort. It is one real DSH session per condition (F/L/G), with the
measured site-B constraint injected while each session was running. Model calls are real
(`deepseek-official/deepseek-flash`); the harness only orchestrates the worlds, the injection and the
operator acceptance.

## 1. Authorization and ceiling

- Owner authorization: 2026-11-04, LHAPE-C bounded pilot.
- Aggregate ceiling: **7,500,000 tokens**.
- Condition ceilings: F 2,500,000; L 2,500,000; G 2,300,000 (G was lowered because F/L had already
  reached their ceilings). A 6,238-token F profile preflight is included in the aggregate; its
  stream was not retained, the count is from the real session usage.
- Real-usage guard: `scripts/aps/budget_guard.mjs`, reading the DSH session stream and terminating
  the host above the ceiling; the cohort gate is `scripts/lhape/run_cohort.mjs`.
- No APS/PC1-V1 authorization was reused.

## 2. What each condition had

All three worlds were byte-identical at the sources: `TASK.md`, `sources/sites.md`,
`sources/capacity.csv`, `sources/vendors.md`, `inbox/README.md`. The initial prompt did not disclose
the measured constraint. At T+45s the harness wrote
`inbox/2026-11-03/corridor-measurement.md` (700 mm measured; 900 mm not admissible at site B).

- **F**: plain DSH `headless` profile, Git/Markdown/native tools/subagents, no Palimpsest.
- **L**: Palimpsest Lightweight: goal-only project, pulse/contribution available, in-place execution,
  no Work Worlds/Promotion.
- **G**: Palimpsest governed: one formal Work task + confirmed standard, isolated execution world,
  real Work Worker, product settlement, operator-only Promotion.

The delivery request was one `deliverables/package.md` covering capacity, vendor compliance, cost,
schedule, risk and an integrated decision.

## 3. Results

| Condition | Rubric | Tokens | Stopped by ceiling? | Artifact | Promotion |
|---|---|---:|---|---|---|
| F | **7/7** | 2,528,297 | yes (2.5M) | 36,472 bytes | n/a |
| L | **7/7** | 2,562,093 | yes (2.5M) | 31,591 bytes | n/a |
| G | **7/7** | 2,332,140 | yes (2.3M) | 33,272 bytes | **yes**, after recovery |

Aggregate: **7,428,768 tokens** (including 6,238 preflight), **71,232 under** the 7.5M ceiling.

Rubric (7 observable facts): package present; both sites; measured 700 mm used; baseline 900 mm
rejected at site B where 900 is mentioned; 2024/expected coastal claim not accepted as current; cost
and schedule; risk and integrated decision.

All three packages genuinely use the measurement. Examples:

- F: “Measured corridor width is **700 mm**. All three listed units are wider … **No listed unit is
  admissible.**”
- L: “Every candidate is wider than the measured corridor … **No unit in the current field is
  admissible at Site B.**”
- G: “The corridor was measured at **700 mm** on 2026-11-03, so no offered unit … is width-admissible
  … **no expenditure is approved by this package.**”

## 4. Budget-stop behaviour

The guard stops at the first observation above the ceiling; because usage is written at assistant-
message boundaries, each stop overshot its own ceiling by one message:

| Condition | Stop value | Overshoot |
|---|---:|---:|
| F | 2,528,297 | +28,297 |
| L | 2,562,093 | +62,093 |
| G | 2,332,140 | +32,140 |

This is a real limitation of a token guard over an asynchronous usage stream, not a hidden overspend:
the aggregate stayed under 7.5M, and every stop is recorded in `STOPPED.json` and the ledger.
F's runner was killed by the outer cohort guard before it could write its own `run.json`; the
`run-recovered.json` in the evidence is reconstructed from the guard's real ledger and the runner
start/injection timestamps, and says so.

## 5. G: worker produced, host stopped, new host recovered

G's model used the governed path and started a real Work Worker in an isolated world. The worker
wrote and committed a 32.9 KB package, but the host reached the token ceiling before the worker
reported. The attempt therefore remained `RUNNING` with no report.

An operator step (no model call) opened the same project, found exactly one RUNNING package attempt
with no host job, observed the committed world, and settled it:

- `completeTask` → `SETTLED`, result commit `3789dec2…`;
- step → `VERIFYING`;
- eligibility → eligible; Promotion `promotion-538246e1…` onto head `1d4132b6…`;
- task `package` → **SATISFIED**.

The settlement response explicitly states that it observed the world and does **not** claim the old
worker process is still alive. This is the same recovery contract as the deterministic interruption
run.

## 6. Interpretation

- **No quality advantage is demonstrated.** All three conditions reached the same 7/7 observable-fact
  rubric. One sample per condition is not evidence of a general benefit, and the rubric is not a
  business-quality or cognition score.
- **No cost advantage is claimed.** All three hit their ceilings; G's cap was lower because F/L had
  already consumed the aggregate, so the raw token numbers are not a matched cost comparison. F/L
  used slightly more than G, but their ceilings were higher and all three were stopped.
- **The measured-constraint behaviour is real in all three.** The constraint arrived mid-session;
  all three final packages used 700 mm and rejected 900 mm at site B. No condition received the
  expected answer or the hidden dependency in its prompt.
- **Governance did produce a recoverable artifact under a host stop.** G's worker committed; the
  product settled the committed world from a new host and accepted it through Promotion. F/L had no
  governed world/Promotion path; their packages remained direct files.
- **The full LHAPE-C cohort is still not run.** There is no cross-session principal sequence, no
  repeated/paired samples, and no T1–T7 long-horizon timeline in this pilot. The deterministic
  Windows host evidence covers those mechanics separately.

## 7. Artifacts

Evidence directory: `research-evidence/lhape/live/lhape-c-pilot-2026-11-04/`.

- `pilot-summary.json` — authoritative reconciliation with token accounting.
- `score.json` — per-condition rubric and project-state read.
- `condition-F|L|G/` — run records, guard ledgers, stop records, logs.
- `artifacts/F-package.md`, `L-package.md`, `G-package.md` — exact final packages.
- `proxy.jsonl` — provider request metadata only (no bodies, no credentials).
- `F-sessions/`, `L-sessions/`, `G-sessions/` — real DSH session streams.
- The 6,238-token F profile preflight is counted in the aggregate; its session stream was discarded
  by the pilot preparation reset, so only the real token count is retained.

The earlier pre-authorization gate result remains at
`research-evidence/lhape/live/lhape-c-long-horizon-2026-11-03/BLOCKED.json` as historical evidence;
it is not the result of this authorized pilot.
