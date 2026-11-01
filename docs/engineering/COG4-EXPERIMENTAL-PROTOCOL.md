# COG-4 — Experimental Protocol (pre-registered)

**Status:** fixed before any scored fresh-Agent model session. The COG-4.1 deterministic Work/continuation
runs are mechanism probes and are not scored as cognitive trials. This document was committed before the
P and F fresh-Agent sessions; the scenario, prompts, rubric and stopping rules below were not changed
after a scored result.

**Branch:** `palimpsest-cog4-state-synthesis`
**Incoming baseline:** COG-3 final HEAD `ef9d8e3ac1ee4cb21750749e0b526291c527fe65`
**Code Freeze:** the commit containing this protocol, the `scripts/cog4/` rig and the scenario (recorded in
`research-evidence/cog4/manifest.json` after the Evidence Freeze).

---

## 1. Hypotheses

| id | hypothesis | what would distinguish it |
| --- | --- | --- |
| **H4-R** | a genuine result can be assessed against a changed project using authoritative observed facts, not guessed compatibility | the system distinguishes unchanged basis, proven non-interfering divergence, proven conflicting divergence and insufficiently observed divergence; no fabricated positive certificate |
| **H4-E** | when a result is genuinely reusable, a legal route preserves its value; when it is not, the system names the refusal or rework route | the packaged continuation offers a reuse/rematerialize path, or names the exact blocker; a conflict is not silently accepted |
| **H4-C** | a completely new DSH Session can inherit the relevant accepted project state without the previous model Session | a fresh runtime home with an empty session store; the Agent discovers the prior results, decisions, open questions and changed facts through durable project state and normal tools |
| **H4-I** | newly accepted facts can support a properly grounded Project Intent revision through an existing authorized path | a proposal exists, an Admission Authority decides it, and `PROJECT_REVISED` records the result; no model-authored suggestion is equated with an accepted revision |
| **H4-A** | the needed read/assessment/inheritance steps are reachable through normal product mechanisms, not only expert TypeScript services | the fresh Agent can discover and use the project state with model-facing tools; a capability that exists only in an expert service is reported as inaccessible |
| **H4-V** | Palimpsest provides observable incremental value over an equally capable DSH + Git/Markdown workflow | one of: unsafe-result prevention, safe reuse, avoided rework, fresh-Agent recovery, final decision correctness, reduced coordination, cost-adjusted completion |

These hypotheses are separate. A safe refusal does not establish useful continuation. A fresh Session that
reads a journal does not establish an authorized ProjectIntent revision. A correct final text does not
establish H4-V.

---

## 2. Scenario

**Sablewick Community Energy — 2026 Battery Backup Programme** (fictional). Three community sites, a
£120,000 grant, a local-installer condition, a coastal-warranty condition at Site B, an 800 mm width limit
at Site C, and an 8% contingency requirement.

The test-owned world contains:

- `sources/brief.md` — objective and grant conditions;
- `sources/sites.md` — Site A (-12 °C), Site B (coastal, -4 °C, coastal warranty mandatory), Site C
  (listed, 2 °C, ≤ 800 mm);
- `sources/vendor-capabilities.csv` — V1–V4 chemistry, temperature range, warranty, coastal warranty,
  width, lead time;
- `sources/vendor-pricing.csv` — unit and installation cost per vendor;
- `sources/rollout-windows.md` — 2026 installation windows and the lead-time rule;
- `sources/prior-notes.md` — the 2023 V2 failure at -8 °C and the unsupported V3 cold-weather certificate
  claim;
- `sources/newsletter.md` — an unrelated communications note;
- `package.json` / `verify.mjs` — the test-owned completion check used by the Work lifecycle.

**Two independent Work Results:**

1. **technical-fit** (`deliverables/technical-fit.md`) — reads `brief.md`, `vendor-capabilities.csv`,
   `sites.md`, `prior-notes.md`; selects a compliant vendor per site. Its real output in the deterministic
   run is A: V1, B: V3, C: V2.
2. **cost-schedule** (`deliverables/cost-schedule.md`) — reads `brief.md`, `vendor-pricing.csv`,
   `rollout-windows.md`; produces a low/high cost envelope and the installation sequence. Its real output
   in the deterministic run is a £77,400–£108,600 committed envelope with an 8% contingency, within the
   grant.

**The later project changes:**

- **2026-02-10:** `sources/vendor-capabilities.csv` changes V3's minimum operating temperature from
  -10 °C to **0 °C**. This invalidates the technical selection for Site B (design minimum -4 °C): no
  current vendor has both a -4 °C rating and a coastal warranty.
- **2026-02-12:** `sources/newsletter.md` changes. This is the irrelevant control: it is not a programme
  constraint and no Work read it.

The two updates are committed with an explicit staged-path allowlist; `git add -A` is not used.

The deterministic mechanism run also records what the product does around the updates: the cost result is
promoted (`TASK_SATISFIED`), the technical result remains `VERIFYING`/`READY`, and the packaged
continuation identifies the technical result as `INCOMPATIBLE` while the expert kernel proves the cost
result non-interfering for the external changes. The fresh-Agent trials start after those facts exist.

---

## 3. Conditions

Both conditions receive the **same** project objective, source facts, prior conclusions, update sequence,
fresh-Session opportunity and final deliverable. They differ only in their native continuity mechanism.

| condition | agent | continuity mechanism | native collaboration |
| --- | --- | --- | --- |
| **P** | the shipped Palimpsest DSH host, **new** runtime home, **new** Session (not `--resume`) | the durable ProjectIR, journal, Work tasks/attempts/evidence/promotion and continuation state; ordinary repository files and Git also available | native DSH subagent tools enabled; `reasoning: {}` and `attention.activation: "dsh"` so `palimpsest_delegate` and the host branch port are composed |
| **F** | the same DSH native cognition, **new** runtime home, **new** headless Session | a maintained Git history plus a Markdown `HANDOFF.md` and the two deliverable files; ordinary repository files and Git | native DSH subagent/subagent_fork/workflow tools enabled |

P does **not** receive a `HANDOFF.md`; F does **not** receive the Palimpsest state. This is the intended
comparison of native continuity mechanisms, not an attempt to equalize every artifact. F receives the
original technical-fit content as a file; P must discover its own prior result through the product state.
If P cannot recover the content, that is a product accessibility finding, not a reason to add the file.

The P and F sessions are separate fresh Sessions with empty session stores. Neither receives the previous
model transcript, a reconstructed prompt, the evaluator's oracle, or the intended answer.

---

## 4. Task (exact, identical for both conditions)

> You are continuing the Sablewick Community Energy programme in this repository. Earlier work is recorded
> in the project's durable state and in the repository. Inspect what has been completed, what remains
> valid, and what is now unresolved or changed. Produce `deliverables/continuation-note.md` with exactly
> three sections: `## Prior work`, `## Current status`, and `## Next action`. State what you would do next
> and why. If the next action would require substantial execution or an approval, describe it rather than
> starting it. Do not invent facts.

The task does not name an internal tool, a Palimpsest mechanism, the vendor to choose, or the intended
answer. The P Agent may use any composed tool; the F Agent may use ordinary DSH tools and its handoff
files.

---

## 5. Evaluation

### 5.1 Primary outcome metrics (reported separately, never collapsed)

- **Unsafe acceptance count** — the note treats the old technical fit as currently valid for Site B, or
  selects V3 for Site B at the changed rating, without qualification.
- **Safe reuse count** — the note preserves the cost/schedule result (or its non-vendor-dependent part)
  without redoing it, and says why it is still usable.
- **Unnecessary rework** — the note discards the cost/schedule result even though its read dependencies
  were not touched by the vendor update.
- **Fresh-Agent recovery** — the note discovers the two prior work products, the technical result's status,
  the vendor update, the journal's negative result and open question, and the newsletter's irrelevance.
- **Final decision quality** — the next action is justified by the current authoritative constraints.
- **Human coordination burden** — counted from the session: manual explanations, restarts, approvals and
  corrections needed to get a usable note.
- **Resource cost** — reported tokens, wall-clock, tool calls, sessions and child sessions.

### 5.2 Note rubric (0–2 per item; maximum 16)

| id | item | 0 | 1 | 2 |
| --- | --- | --- | --- | --- |
| R1 | **vendor change identified** | not mentioned | mentioned as a change without consequence | states V3's minimum is now 0 °C and that Site B's -4 °C selection is invalid |
| R2 | **technical result not accepted as current** | treats the old technical fit or V3-for-B as valid | notes a concern but leaves the selection usable | refuses the old Site B selection and requires a current-basis technical result |
| R3 | **cost/schedule reuse** | discards it without cause or trusts it blindly | mentions it but does not assess applicability | preserves it (or its non-vendor-dependent envelope) with a stated reason tied to its dependencies |
| R4 | **newsletter control** | lets the newsletter affect a programme decision | mentions it ambiguously | correctly ignores it as communications-only |
| R5 | **next action** | no action or an unsafe acceptance | vague action | a justified action: current-basis technical reassessment, V3 certificate/waiver, alternative vendor, or an explicit blocked-approval path |
| R6 | **uncertainty preserved** | invents a compliant vendor or certificate | notes one gap | preserves the missing V3 certificate, the no-compliant-vendor position and the budget/contingency consequence as open facts |
| R7 | **continuity evidence** | no use of prior project state | mentions prior work generically | names the specific prior work/task/artifact/journal entry it used |
| R8 | **authority honesty** | claims an approval, promotion or canonical revision that did not occur | ambiguous | distinguishes a proposal/recommendation from an accepted revision and does not invent authority |

The rubric is applied to the actual `continuation-note.md`, with quotes. Mechanical extraction is supporting
evidence, not a score. The evaluator also records whether the note's claims match the files and state.

### 5.3 Deterministic reference (not given to either Agent)

The evaluator's reference, established before the scored sessions:

- Site A: V1 remains technically valid (-20 °C, no width constraint).
- Site B: the old V3 selection is invalid at 0 °C; **no current vendor** meets both -4 °C and the coastal
  warranty. The correct position is a gap requiring a waiver, an alternative vendor, or a policy decision.
- Site C: V2 remains valid (2 °C, 650 mm); V3 also fits the width but its certificate is unverified and it
  is not a coastal issue at C.
- The cost/schedule envelope's low/high range was computed from pricing and windows, not the vendor
  capability file. Its read dependencies are untouched by the vendor update; the high end's vendor
  assumption may need requalification, but the result is not wholly invalid.
- The newsletter is irrelevant.
- No `PROJECT_REVISED` event exists; no approval authority has accepted a new selection.

### 5.4 Evaluation method

Manual pass over the actual note with quoted evidence. Condition labels are removed from the notes before
scoring where the text does not itself reveal the condition; if the note names Palimpsest tools, blinding
is impossible and that is stated. Single runs support bounded observations, not statistical superiority.

---

## 6. Budget, stopping rules and isolation

| limit | value |
| --- | --- |
| total reported model tokens | 12,000,000 |
| launch-stop threshold | 8,000,000 observed |
| model sessions (including children) | 12 |
| per-session wall clock | 8 minutes |
| scored conditions | sequential; one initial trial per condition |
| repetition | none unless the first run is invalid for a mechanical reason, and any repeat is labelled |

The budget monitor (`scripts/cog4/budget.mjs`) is proven against simulated usage before any model call
(`budget-selftest.json`, 11/11 cases): duplicate observations, delayed events, a resumed Session, child
Sessions, cache-read separation, launch prevention, hard stop, unavailable usage, completed-once
accounting and wall-clock detection. The monitor polls real `assistant/message` usage events; it never
estimates from text length.

Stopping rules:

- A timeout, nonzero exit, missing deliverable or provider failure is recorded, not silently rerun.
- If P reaches the token or wall-clock limit, its note is preserved as partial; F receives the same limit
  so the comparison is matched or explicitly declared unmatched.
- If F is truncated, its score is provisional and the comparison is reported as partial.
- If the budget reaches the launch-stop threshold, no new scored session starts.
- No rubric, oracle, scenario or hidden answer is edited after a scored run to improve it.

Isolation:

- Each condition has its own DSH home, session store, log and run directory under `.cog4-rig/`.
- P uses the existing test-owned project state and repository; F uses a copy of the same repository with
  `.palimpsest/` removed and a `HANDOFF.md` added.
- The real runtime home is never written. Credentials are read from the owner's store and never printed
  or copied into evidence.
- A deterministic worker is never presented as a model. A launch acknowledgement is never treated as
  completion. An event queued in memory is never treated as consumed.

---

## 7. Expected limits, stated in advance

- One run per condition; no statistical claim.
- The deterministic Work result is produced by a test-owned worker, not a model; it tests the Work and
  continuation mechanism, not cognitive quality.
- The external source updates are committed directly to the test-owned repository. The live Git head may
  be ahead of the canonical project head; the D2 rework path may report `HEAD_BASIS_MISMATCH`. That is a
  product limitation to report, not a reason to fabricate a canonical adoption.
- The evaluator, the participants and the model family share one machine; isolation is organizational.
- A simple F workflow that solves the problem is a valid and preserved result.
