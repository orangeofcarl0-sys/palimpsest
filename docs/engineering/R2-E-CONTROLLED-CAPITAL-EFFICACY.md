# R2-E — CONTROLLED CAPITAL EFFICACY

Baseline: `8edf9f12f624828b43502642152f653c924e1bb8` · Branch: `r2-e-controlled-capital-efficacy` · Stage type: EXPERIMENTAL

---

## 0. The question this stage answers

```
When relevant governed project capital is ACTUALLY CONSUMED,
does it improve stochastic worker behaviour?
```

R1-R and R2-U could not answer it. R1-R measured capital as visible and pullable in all 30 trials and pulled
in **0/30**. R2-U then measured whether an explicit instruction changes that choice, and it did not:

```
R1-R    governed pulls                              0/30
R2-U    governed pulls                              1/40 total
        capital-present pulls                       1/20
        explicit-review capital-present pulls       0/10
```

The single puller solved its Scenario-C task, but n=1 and self-selected, so that is **association only**.

R2-E therefore removes voluntary uptake as a variable. It is an **EFFICACY** stage, not an affordance stage
and not relevance-selection work. §20 forbids optimizing uptake here, and §19 forbids splitting the capital
kinds into separate arms.

---

## 1. Why the prework is HOST-MEDIATED (§9/§10)

The ruling offers two mechanisms: the worker performs the pulls itself, or the host invokes the same
attempt-bound resolver and renders the results. §10 requires one to be chosen **before** the matrix, and
requires the choice to be recorded.

The measurement decides it. R2-U's explicit-review capital-present arm pulled **0/10** — a worker that has
been *explicitly instructed* to inspect the handles still does not do it. A model-mediated prework phase
would therefore fail its own precondition on most runs, and §9 says what happens then: those runs are
classified `EFFICACY_PRECONDITION_NOT_MET` rather than counted, and if it happens materially the mechanism
must be redesigned before the matrix restarts. Choosing it would have produced a matrix of classifications
rather than a measurement.

So R2-E uses:

```
HOST_MEDIATED_PREWORK
```

recorded on **every** E1 trial, and the two mechanisms are never mixed in one primary matrix.

### 1.1 It is not a second fetch path

The host does not read an owner's backing store. It calls the **worker's own pull tool** — the same
`execute` the model would have called — so the prework goes through:

```
the same argument shape ({ handle } only)
the same local AllowedPullHandles check
the same IPC envelope on the same channel
the same parent-side resolveWorkerPullRequest
the same attempt-bound controller.fetchContext
```

A handle this attempt did not bind is refused exactly as it would be for a model-initiated pull. Nothing is
added to `ContextManifest`, nothing is added to `compiled.handles`, and no automatic boot body exists in
canonical semantics.

---

## 2. The two conditions

| | E0 — control | E1 — treatment |
| --- | --- | --- |
| Capital | none | Proof + Reasoning + Procedure |
| Section boundary | the same | the same |
| Wording | "No inherited project capital was selected for this attempt." | each handle's resolved body, per kind |

**The control carries no sham capital.** §12 is explicit that the treatment is *relevant inherited capital*,
not arbitrary extra tokens, so E0 shares the boundary and states plainly that nothing was selected. The
arms differ in content, not in shape.

### 2.1 Kind framing (§11)

The three kinds are rendered under their own framing and are never flattened into generic instructions,
because flattening would silently promote information into authority:

```
Proof       epistemic information — not authority
Reasoning   admitted reasoning — not authority
Procedure   advisory method guidance — may influence HOW, cannot widen WHAT
```

---

## 3. Guaranteed consumption

E1's primary-analysis eligibility requires that **every** selected handle was materialized through the
governed channel, and the consumption proof records handle identities and body **digests** — never a body.

Because the prework phase runs **before the first engineering turn exists**, "consumed before the first
implementation mutation" is structural rather than a race the harness polices. An E1 trial whose prework did
not materialize everything is classified `EFFICACY_PRECONDITION_NOT_MET`, excluded from the efficacy
comparison, and kept in the raw evidence.

---

## 4. Design and schedule

```
2 scenarios × 2 conditions × 5 repetitions = 20 stochastic primary trials
```

Five randomized blocks per scenario, order from ONE frozen seed (`0x52450201`), so E0 and E1 are interleaved
rather than grouped. One ACTIVE confidential worker at all times — the runner is strictly sequential because
the Windows confidential profile supports exactly one.

### 4.1 Pairing (§13)

Within every block, these are required equal: ProjectIR, task, repo tree, visible tests, hidden acceptance,
model/profile, worker capability surface, security profile, ordinary Work prompt. Only the
governed inherited-capital review content differs.

The **index section is deliberately not** in the equal-set: E0 selects no capital, so its index is
legitimately empty, and the index is part of the treatment surface rather than an invariant of the pair. It
is recorded as an observation (`indexMovedWithArm`) instead.

---

## 5. Outcomes and the verdict

Primary per trial: first-candidate hidden acceptance, final hidden acceptance, full solve, pre-paid mistake
recurrence, visible oracle invocations, implementation revisions, elapsed time, host/model failure.

```
REPLICATED     both scenarios: E1 repeats the pre-paid mistake LESS often than E0
               AND E1's mechanical outcome is not worse
               with every analysed E1 trial having consumed all selected capital
PARTIAL        one scenario shows clear benefit, or both show weak/noisy directional benefit
NOT_OBSERVED   neither scenario shows meaningful benefit despite guaranteed consumption
```

All three are valid results, and this stage must **not** be converted into an uptake verdict — R2-U remains
the uptake result.

### 5.1 The behavioural Procedure marker (§17)

A delivered Procedure is not an effective one, so §17 pre-registers a behavioural marker per scenario,
measured from the candidate's behaviour rather than from delivery:

```
C  replay validity established before the caller's state is mutated
D  the affected closure frozen before any mutation
```

The markers run the candidate against probes only the mature method satisfies. Checked across both
generation ladders, each marker is `false` for every naive generation and `true` only for the mature one, so
"the method was reflected" cannot be satisfied by a candidate that merely received the Procedure.

---

## 6. Security

Every trial runs under the R1-HC Windows confidential profile with `MAX ACTIVE worker = 1`, and the trial
record captures the worker's own telemetry for each: capacity admission, boundary installation, capability
classification. A confidentiality regression STOPS the stage.

---

## 7. Evidence (§23)

R2-U's evidence volume is deliberately **not** repeated. The repo carries the protocol, the trial manifest
with cryptographic digests, normalized results, the analysis, the digests and one representative trace per
arm; the complete session transcripts stay external and the repo carries their digests. The manifest is what
makes that safe: the committed artifact still pins every trial's bytes.

---

## 8. Reproducing the stage

```sh
pnpm build
pnpm r2e:gate-a      # §25 validity + one pilot E0/E1 pair per scenario
pnpm r2e:matrix      # §26 the 20 primary trials, sequential, one process each
pnpm r2e:analyse     # §27 the efficacy verdict
pnpm r2e:evidence    # §23 the manifest, digests and representative traces
```

---

## 9. Explicitly out of scope

- **Uptake optimization.** No changes to the opaque index, selectedness wording, semantic preview or
  relevance automation. R2-U measured the affordance; R2-E removes the variable.
- **Splitting Proof / Reasoning / Procedure into separate arms.** §19: the next stage may separate epistemic
  from procedural capital only if full-capital efficacy exists.
- **Preview or index redesign.** Not begun here, and §21's `H-index` hypothesis is RECORDED but not
  implemented.
- **Any canonical semantic change.** `src/` is untouched.
