# PWRS-R — interrupted work: native continuation vs governed relay

Status: **executed under the owner's 2026-11-05 PWRS-R authorization** (F and A, 2 sessions each,
2,500,000 per session, 125,000 reserve, 10,000,000 aggregate). This is the first real-model probe of
PWRS: it asks whether an interrupted worker's work is actually continued, reused and converged, and
what the product records while that happens.

Evidence: `research-evidence/pwrs/2026-11-05/pwrs-r/`.
Pre-registration: `research-evidence/pwrs/live/cohort-pwrs-r.json`.
Authorization: `research-evidence/pwrs/live/authorization-pwrs-r.json`.

## 1. Design

Both conditions received byte-identical sources and the same measured constraint injected at T+60s
(`inbox/2026-11-03/corridor-measurement.md`, 700 mm). Session 1 was killed at the **same reported
400,000-token milestone** in both; session 2 was a new principal on durable state only. No prompt
named relay, takeover, successor, reuse or the expected answer.

| Condition | Setup | Session 1 | Session 2 |
|---|---|---|---|
| **F** | Native DSH: native tools/subagents, Git, no Palimpsest | works directly; native subagent forks observed | new session in the same tree |
| **A** | Governed Palimpsest: confirmed standard, one formal `package` task, isolated world; prompt says to use the governed path | delegates to a real worker, which writes a draft in its world | new principal; must find and finish the work |

The interruption snapshot is taken by the harness **outside** the worlds and is never injected into
session 2. It is the bytes that existed when the kill landed.

## 2. Results

| | F | A (governed recovery) |
|---|---|---|
| Rubric | **7/7** | **5/7** |
| Final artifact | 44,372 bytes, canonical worktree (uncommitted) | 48,332 bytes, result commit `d8dc41f` |
| Measured 700 mm | **yes** | **no** |
| Baseline 900 mm rejected | **yes** | **no** |
| Tokens | 441,167 + 2,416,777 = **2,857,944** | 411,657 + 2,387,145 = **2,798,802** |
| Session 1 end | killed at 441,167 (milestone) | killed at 411,657 (milestone) |
| Session 2 end | **budget stop** (2,416,777) | **budget stop** (2,387,145) |
| Natural end | no | no |
| Work at interruption | 33,998-byte draft, uncommitted | 48,332-byte draft in the retained world, uncommitted |
| Final reuse of that draft | 181/310 lines (58.4%) | 496/496 lines (**100%**) |
| Governance | n/a | `PRINCIPAL_RECOVERY`, `DECLARED_ABANDONED`, `independenceEligible=false`, task `VERIFYING`, **no promotion**, **no episode conclusion** |

Aggregate **5,656,746 / 10,000,000**, 4,343,254 unused. 118 provider POSTs: 116×200, 2×502
`UPSTREAM_TIMEOUT` (19:59:58 and 20:04:11 UTC); one GET 403 health probe. No budget stop was caused
by a provider error.

## 3. What A actually did

The transcript and the journal agree on this sequence:

1. `palimpsest_continuity action=pulse`; `palimpsest_work action=status`.
2. Listed the tree and **read the injected constraint** (`inbox/2026-11-03/corridor-measurement.md`).
3. Read `TASK.md`, `sources/*`, `inbox/README.md`.
4. Listed `.palimpsest/worlds`, read the retained attempt world's `deliverables/package.md` and
   grepped it; `palimpsest_work action=workers` and `results` (no result yet).
5. Read the retained draft, **committed it unchanged** (`d8dc41f`), then called
   `palimpsest_work action=relay relayRoute=takeover declareExecutorAbandoned=true`.
6. The product settled the SAME attempt: attribution `PRINCIPAL_RECOVERY`,
   `DECLARED_ABANDONED`, `workerInvocations=0`, `independenceEligible=false`; the task moved to
   `VERIFYING`; a relay note was written to the project journal.
7. **Only then** did A-2 begin 17 `edit` calls against the attempt world's package. Those edits came
   after settlement. They are not part of the result commit, and no later settlement observes them.
8. It then tried `continue`, `begin` (refused: worktree placement does not support direct bootstrap),
   `next`, `start`, `delegate` (the task was already VERIFYING), and hit the 2,375,000 soft stop.

So the relay path was used correctly at the API level — including the explicit abandonment
declaration, which is exactly the PWRS-A requirement — and the attribution is honest. The **work**
was not: the principal settled the pre-constraint draft before revising it, so the candidate states
the superseded 1200 mm assumption and never mentions 700 mm.

## 4. What F did

F-1 left a 33,998-byte uncommitted draft. F-2 read the tree, used a subagent, made 14 edits and
produced a 44,372-byte package that passes all seven facts (700 mm used, the 900 mm unit rejected,
the coastal claim treated as unverified, cost/schedule and risk/decision present). It reused 58.4%
of the interrupted draft's substantive lines and rewrote the rest. It did **not** converge: the
guard stopped it at 2,416,777 while it was still working.

F did not have to name an executor, a world or an acceptance state. Its result is an uncommitted
working-tree file; nothing in its run marks it as a candidate for acceptance.

## 5. Reading

- **The product mechanics held.** A-2 found the retained world, read it, chose `takeover`, declared
  the abandonment, and the product recorded `PRINCIPAL_RECOVERY` rather than pretending the original
  worker produced the candidate. The task correctly sits in `VERIFYING` with no promotion. This is
  the G-2 gap from ALHS now handled explicitly, with a real model.
- **The model's judgement failed at the ordering.** It read the measured constraint and still
  committed the stale draft before revising it. The product cannot judge whether a package is
  business-correct, and it did not: it accepted the completion contract (artifact present, scope
  respected) and left acceptance to the operator.
- **100% reuse is not a success.** The reuse measure exposes the difference: F inherited 58% of the
  draft and reworked the rest to the current measurement; A inherited 100% and carried the
  superseded assumption. Path-level reuse narrowed the work but did not establish semantic validity,
  exactly as PWRS-B warned. The relay's reuse facts were never surfaced to A-2 because A-2 chose
  `takeover`, not `successor`; it read the world directly instead.
- **Neither condition converged naturally.** Both were stopped by the guard in session 2. The
  hypothesis that the governed relay would let a real model *finish* an interrupted long-horizon task
  within budget is **not supported by this pair**; if anything F's outcome is better on the business
  floor and similar on cost.
- **A-2's post-settlement edits are a real product gap.** The attempt's world remains writable and
  readable after settlement, and the model edited it for a long time after the result commit was
  fixed. A later session that inspects `worldPath` could mistake those bytes for the candidate. The
  authoritative artifact is the result commit, but the product does not currently mark the world as
  historical or warn that later edits are unobserved. This is recorded as the next product question;
  no code change was made for it in this cohort (the run is a measurement, not a repair).

## 6. Limitations

- One pair per condition; no repeated sample, no quality or cost advantage claim.
- A is the **governed recovery** condition: it is given a formal task and told to use the governed
  path so that a real worker exists to interrupt. F is native and has no such task. The comparison is
  therefore "native continuation" vs "governed relay", not two symmetric products.
- Both sessions 2 hit the guard; a larger per-session ceiling might have let either finish, but the
  authorization fixed 2,500,000 and the milestone at 400,000.
- The 7-fact rubric is a floor and saturates; it does not measure decision quality. A's 5/7 is a
  concrete content failure (missing the current measurement), not a style judgement.
- No operator promotion was performed; A's candidate remains `VERIFYING`, which is the correct
  pending state, and no accepted asset exists.
- The two 502 `UPSTREAM_TIMEOUT`s are recorded; both were retried, and the sessions continued.

## 7. Authorization and usage

- Authorized: PWRS-R, stages `pwrs-r`, conditions F/A, 4 sessions, 2,500,000 per session, 125,000
  reserve, 10,000,000 aggregate, expires 2026-11-12.
- Gate: with a deliberately missing adapter it wrote `ADAPTER_NOT_CONFIGURED` and exited 3 with
  `modelCalls=0` before any session; the real run then passed the same gate.
- Used **5,656,746**, leaving 4,343,254 of the PWRS-R aggregate. No other authorization was touched.

## 8. Evidence

- `score.json` — rubric, final artifact/source, interruption snapshot facts, reuse, per-session
  usage/call counts, A governance (tasks, attempts, relay record, episodes).
- `interruption-F.json`, `interruption-A.json` — the bytes and Git state at the kill.
- `final/F-package.md`, `final/A-candidate.md` — the exact final artifacts.
- `sessions/<id>/` — run record, guard ledger, `STOPPED.json`, kill timestamps and logs.
- `sessions/streams/` — the real DSH session streams (including F's subagent sessions and A's worker).
- `usage.json` — reconciled tokens and provider status counts.
- `proxy.jsonl` — request metadata only.

## 9. Git

The product code under test is `507aac2`; the PWRS-R harness and evidence are committed after it.
No product code was changed during the cohort, no promotion or acceptance was fabricated, and no
historical freeze, ledger, lock or gate root was modified.
