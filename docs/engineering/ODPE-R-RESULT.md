# ODPE-R — interrupted work: native DSH + finish guidance (F) vs the adaptive product (A)

Status: **executed under the owner's 2026-11-05 ODPE-R authorization** (F and A, 2 sessions each,
2,500,000 per session, 125,000 reserve, 10,000,000 aggregate). One pair per condition; descriptive,
not a repeated sample.

Evidence: `research-evidence/odpe/2026-11-05/odpe-r/`.
Pre-registration: `research-evidence/odpe/live/cohort-odpe-r.json`.
Authorization: `research-evidence/odpe/live/authorization-odpe-r.json`.
Product under test: ODPE at `105903f` (merged as `abc9d96`).

## 1. Design

Same scenario, sources and 400,000-token interruption milestone as the PWRS-R pair, so the comparison
isolates the ODPE product change rather than a new task. The measured 700 mm fact was injected at
T+60s as an **untracked** `inbox/2026-11-03/corridor-measurement.md`, after both attempts' bases.

- **F — F+Finish.** Native DSH, native tools/subagents/Git, plus ONE explicit instruction: “when the
  package is complete, stop working and end the session; do not keep polling”. No Palimpsest.
- **A — adaptive product.** The governed project with the confirmed standard and one `package` task.
  The prompt says the principal decides when to work, delegate, continue, finalize and conclude; it
  names **neither** readiness/finalize **nor** the acknowledgement, relay, takeover or successor.
  This is the adaptive path, not the forced governed recovery (G) of PWRS-R.

## 2. Results

| | F (F+Finish) | A (adaptive product) |
|---|---|---|
| Rubric | **7/7** | **7/7** |
| Final artifact | 27,472 B, canonical worktree (**uncommitted**) | 30,610 B at result commit `100a2b13` |
| Tokens | 431,393 + 184,436 = **615,829** | 418,106 + 614,275 = **1,032,381** |
| Session 1 end | killed at the 400k milestone | killed at the 400k milestone |
| Session 2 end | **natural exit (0)** | **natural exit (0)** |
| Reuse of the interruption draft | 206/206 lines (**100%**) | no committed draft existed |
| Work state | n/a (native) | task **VERIFYING**, attempt **COMPLETED** |
| Attribution | n/a | `UNATTRIBUTED`, `independenceEligible=false` |
| Episode | n/a | **WAIT_FOR_OPERATOR**, artifact source `RESULT_COMMIT` |
| Promotion | n/a | none (no acceptance authorized) |

Aggregate **1,648,210 / 10,000,000**. 67 provider POSTs: 66×200 and one 403 health/preflight; no
retries, no upstream failures. No budget stop in any session.

## 3. What happened

- **F** wrote the full package in session 2, carrying the whole 206-line draft from session 1, and
  **ended naturally** on the finish instruction. It left the package **uncommitted** in the canonical
  worktree. The finish guidance changed the F behaviour measured in PWRS-R (where F ran to the budget
  stop); the artifact is correct but is not a committed asset.
- **A** kept the attempt and world through the interruption. The attempt's context had been compiled
  **before** the measured input arrived, so the manifest correctly recorded no input (the ODPE rule
  is not to rewrite a frozen context). Session 2 read the untracked measurement from the repository,
  wrote the package into the attempt's world, committed `100a2b13`, settled it through the product as
  the **principal**, and recorded `WAIT_FOR_OPERATOR` naming that result commit.
- A's settlement is `UNATTRIBUTED`: this host observed **no worker invocation** for the attempt (the
  worker/host that created it was the killed session), and no takeover was declared. The product
  therefore does not credit the bytes to a worker and does not call them independent — the honest
  reading of a principal recovery whose writer window was never observed.
- The input gate was exercised: the canonical tree held an input the attempt's base never contained,
  so a principal settlement required an acknowledgement; A settled only with it.

## 4. Reading

- **Both conditions reached the 7-fact floor and both sessions converged naturally.** With the simple
  finish instruction, F no longer drifts to a budget stop; A settles a candidate and records the
  operator wait. The ODPE failure mode “correct work, no settlement” did not occur in either arm.
- **The difference is the artifact's standing, not its content.** F's package is uncommitted; A's is
  a canonical result commit with a `VERIFYING` task and an episode that points at it. That is the
  ODPE capability the deterministic host also demonstrated.
- **No cost advantage.** A used ~1.68× F's tokens for this pair. One pair cannot attribute cost; the
  extra tokens include the product calls and a longer recovery.
- **The input did not travel through the compiled context in A.** It arrived after the attempt's
  compile, so the model read it natively and acknowledged it at settlement. The deterministic ODPE-C
  run is the evidence that a **new attempt** receives the input through `@ctx/input/...`; this cohort
  does not re-prove that path.
- **Attribution stayed honest.** A principal settlement with no observed window is `UNATTRIBUTED`
  and not independence-eligible; the product did not upgrade the principal's writing to worker
  production.

## 5. Limitations

- One pair per condition; no quality, reliability or cost advantage claim.
- The measured input was read natively in A because the attempt predated it; the “new attempt gets
  the handle” path is deterministic-host evidence only in this stage.
- The 7-fact rubric saturates; 7/7 says the facts are present, not that the decision is good.
- A's candidate was not accepted: this cohort authorized no operator promotion.
- F's final package is uncommitted; “correct file” is not “accepted project asset”.

## 6. Authorization and usage

- Authorized: ODPE-R, stage `odpe-r`, conditions F/A, 4 sessions, 2,500,000 per session, 125,000
  reserve, 10,000,000 aggregate, expires 2026-11-12.
- Used **1,648,210**, leaving 8,351,790.
- No other cohort or sample increase was started.

## 7. Evidence

- `score.json` — both rubrics, final sources, interruption snapshots, sessions, A governance.
- `interruption-F.json`, `interruption-A.json` — the Git/byte state at the milestone.
- `final/F-package.md`, `final/A-package.md` — the two final packages.
- `sessions/` — run records, budget ledgers, logs and kill timestamps.
- `final/session-streams/` — the real DSH session streams (zstd).
- `proxy.jsonl` — request metadata only.
