# COG-1 — Pre-registered experimental protocol

**Status:** fixed before any trial. Committed at P0. Nothing in this file may be
edited after the first model-bearing run; deviations are recorded in the final
report instead.

**Baseline:** `61b0757dea988daa10a00c220dee34e2d4c72028`
**Stage branch:** `palimpsest-cog1-real-task-compounding`

---

## 1. The question

> Can Palimpsest turn earlier cognitive labour into usable project capital, so a
> later agent makes better decisions, avoids repeating prior work, adapts to new
> reality, and produces a more coherent outcome with less external human
> coordination?

The stage tests this in a **non-software** project, with **real model inference**,
across **two connected rounds**, against **two honest baselines**.

## 2. Hypotheses

- **H1 (cognitive production).** Every condition can produce a complete, internally
  consistent plan from the source pack. If a condition cannot, the failure is
  recorded and is itself a finding.
- **H2 (compounding).** In Round 2, a condition that inherited usable capital will
  reuse at least one Round-1 finding *without re-deriving it*, and will revise the
  plan where the update pack changes the facts. Reuse is measured behaviourally
  (the Round-2 artifact preserves the earlier conclusion and builds on it), not by
  the presence of a handle.
- **H3 (adaptation).** Where the update pack changes the economics or the causal
  picture, a good plan changes; where it is informational only (the café notice),
  a good plan does not reorganise.
- **H4 (synthesis).** The scenario contains at least one decision that a single
  document cannot settle. A synthesis success corrects or qualifies an initial
  reading using a second source, and the resulting artifacts agree with each other.

## 3. Scenario (synthetic, pre-registered)

Riversdale Community Arts Centre, a fictional public cultural organisation. All
material is synthetic and labelled as such in `sources/README.md`.

**Goal given to every participant:** "Improve participation and service
accessibility over the next quarter while respecting a fixed resource envelope."

**Source pack** (`scripts/cog1/scenario/sources/`, 8 files):

| file | what it contributes |
|---|---|
| `attendance.csv` | 15 months × 5 programmes: sessions, visits, unique participants |
| `survey.md` | "92% satisfied", with the method note that exposes the sample |
| `interviews.md` | four stakeholders, two of whom disagree about the same fact |
| `constraints.md` | licence, lift/accessible entrance, 19:10 last bus, staffing, 13-week quarter |
| `resources.md` | £48,000 envelope and quoted unit costs |
| `prior-interventions.md` | the 2023 evening pilot **with** a minibus, and its collapse **without** one; the 2022 poster campaign and its null result |
| `open-questions.md` | the board's five unanswered questions |
| `README.md` | the synthetic-material statement |

**Built-in synthesis requirements** (each resolvable only by combining sources):

1. The 92% satisfaction figure comes from 310 forms handed out to Family Saturdays
   attendees on a free-entry weekend (78% attending with children, 71% by car); it
   cannot support a claim about the priority estates or non-attenders.
2. Youth Studio *visits* fell while *unique participants* rose, because delivery
   dropped from 4 to 2 sessions a month. The interview's "young people lost
   interest" reading is contradicted by its own next sentence and by the data.
3. The 2023 evening programme's gain disappeared when the minibus stopped: the
   evening offer is conditional on transport, not independently effective.
4. The 2022 £9,000 poster campaign produced no measurable change; the board
   minuted not to repeat it without a specific audience and offer.
5. The lift is capital work with a lead time, and first-floor events are not
   permitted until it is repaired.
6. The £48,000 envelope does not fund everything attractive: the plan must choose.

## 4. Conditions

| | condition | architecture |
|---|---|---|
| **A** | Strong single agent | `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-headless`; subagent and workflow tools **disabled**; ordinary read/write/bash; one agent, one context, durable notes are ordinary files |
| **B** | Lead + workers | the same profile, with `subagent`, `subagent_fork`, `subagent-control` and `workflow` **enabled**; the lead may delegate and combine |
| **C** | Palimpsest principal | the shipped `palimpsest-dsh-host` bundle over a real deployment profile (`reasoning: {}`, project workspace stores, `repository` = the project world); the ordinary product path; 25 `palimpsest_*` tools |

**Fairness rules, fixed in advance:** same model (`deepseek-official` /
`deepseek-flash`), same source pack, same task text (byte-identical), same working
directory layout, same wall-clock budget per run (default 25 min), same delivered
file list, same evaluation. No condition receives a hint, a decomposition or a
reminder of what it did last round.

## 5. Two-round temporal structure

- **Round 1** — the source pack only. Each condition produces the eight deliverables.
- **Between rounds** — the round-1 artifacts are frozen (digested) and the update
  pack is released identically into every condition's working directory:
  - `U1-estates-survey.md` — new observation: 48% of 120 surveyed households have
    never heard of the centre; among those who have, 57% name transport home as the
    main barrier. It partly contradicts the old board minute.
  - `U2-lift-quote-revised.md` — changed constraint: the lift is now £27,500 with
    an 8-week lead, and the accessible entrance is required before any evening
    event with more than 60 attendees.
  - `U3-youth-clarification.md` — clarification: the partner confirms supply fell
    (4→2 sessions), interest did not; a waiting list of 40 exists; 4 extra sessions
    are available for the same £6,500.
  - `U4-cafe-supplier.md` — negative control: a coffee supplier change and a
    deferred equipment refresh. The plan must **not** change because of it.
- **Round 2** — a **new process and a new session** for every condition, over the
  same working directory (and, for C, the same durable project stores). No
  transcript is carried; what survives is what the condition wrote down.

## 6. Evaluation dimensions (pre-registered)

1. **Mechanical (oracle-owned).** Envelope; total = sum of lines; every line matches
   a quoted cost; the same plan is described by `pilot.md`, `budget.md` and
   `decisions.json`; `decisions.json` parses and matches the round.
2. **Rubric (fixed ground truth).** Six Round-1 items — survey sample limitation,
   youth supply explanation, transport as the active ingredient, poster evidence,
   lift sequencing, envelope discipline — and three Round-2 items — revised lift
   quote, estates survey used, café notice correctly treated as no-change.
   Each item names phrase families; two distinct families are required except where
   noted. A model judge is **not** used: the rubric is deterministic and its
   weakness (keyword satisfaction) is disclosed.
3. **Observed (human-read).** Which findings were reused without re-derivation,
   which outdated assumption was identified, whether the budget/pilot/metrics agree,
   what was repeated that need not have been, and what the transcript shows about
   how the work was actually organised.
4. **Cost.** Wall clock, model turns, tool calls, and the tool-use histogram per run.

No composite "intelligence score" is produced. A plan that satisfies the rubric but
contradicts its own budget is not a success; a plan that misses a rubric phrase but
states the same finding in other words is inspected by hand and reported as such.

## 7. Budget and stopping rules

- **Model:** `deepseek-flash` through the owner's configured `deepseek-official`
  route. No other provider, no account change, no credential in evidence.
- **Structure:** 3 conditions × 2 rounds = **6 model-bearing principal runs**, plus
  up to 2 held-out transfer runs if the primary pilot leaves budget and the result
  warrants it.
- **Per run:** 25 minutes wall clock, one agent process, no retry for a poor answer.
  A timeout is recorded as the outcome.
- **Interventions:** none during a run. The harness prepares the world, launches,
  and records.
- **Stopping:** the stage stops after Round 2 of the third condition unless a
  bounded correction is justified by an observed failure, in which case at most one
  correction and one targeted re-run are added.
- **Blocked:** if real model access fails, the stage reports the audit and the
  deterministic controls as complete and the live pilot as blocked. It does not
  substitute a deterministic worker and call it model-driven.

## 8. Oracle identity

`scripts/cog1/quoted_costs.mjs` holds the oracle's own transcription of the quoted
costs and the ground-truth statements. `scripts/cog1/oracle.mjs` scores against it.
Both are committed at P1 before any trial, and both are outside every participant's
working directory.

**Isolation limitation, stated now.** The participant has an ordinary shell and can
read absolute paths, so this is not a sandboxed blind evaluation. The oracle is not
referenced in any prompt and is not in the working directory, but a determined
agent could find it. No claim of strong hidden-evaluator isolation is made.

## 9. Expected limitations, stated before the runs

- One run per condition: this is a feasibility and diagnostic comparison, not a
  statistical claim.
- Model behaviour is stochastic; seeds are not available and would not guarantee
  determinism.
- The rubric is lexical; a correct plan can miss a phrase and a fluent plan can
  satisfy one. Every score is paired with a hand read.
- The scenario is a single fictional domain; nothing generalises from it alone.
- Condition C's advantage, if any, may come from the *file* artifacts rather than
  from Palimpsest's own durable stores; the experiment measures which by reading
  the transcript and the durable state.
