# R2-LR — APPEND-ONLY HISTORICAL EVIDENCE CORRECTIONS

Stage: R2-LR (Worker Index Delivery Repair)
Status: **APPEND-ONLY** — no prior evidence file is modified or deleted
Baseline: `3a4a3c61160e4a36da1ad093addb85888b587923` (the preserved BLOCKED R2-M attempt)
Repair commit: `89c3578` (the production host forwarding fix)

§11–§16 require the historical record to be corrected **without being rewritten**. Every claim below is an
addition: the original verdicts, trials, digests and documents remain exactly as committed. Where a
corrected status is stated, it is stated as a *correction*, and the pre-repair status is preserved beside
it so a reader can see both.

---

# 0. The defect that invalidates part of the historical interpretation

`host/dsh/lib/index.js::applyWork` never forwarded `contextIndexText` from the work payload into `work`, so
the runner read `environment.contextIndexText` as `undefined` and `workTask` omitted the index section from
every worker prompt.

The defect was present at every commit in the line (`dc5679d`, `8ef010a`, `c023a63`, `8edf9f1`, `adf1615`)
and is proven mechanically: in the blocked R2-M pilot, the runner's `renderedSectionDigest` equalled
`sha256("undefined")`.

Consequence: **in R1-R and R2-U, every worker operated with pull capability but NO prompt-visible
selected-handle index.** Their measurements are real observations of that situation. What they cannot
support is any conclusion about the INTENDED treatment, which was to make selected capital visible in the
prompt.

---

# 1. R1-L correction (§11)

## Pre-repair status (preserved)

`docs/engineering/R1-L-WORKER-CONTEXT-PULL.md` and `research-evidence/r1-l/last-mile-evidence.json` record
`gate:r1-l-live` PASS, 17/17 assertions, and state that "R1-L closes the last mile".

## Corrected status — the two halves must be distinguished

```text
attempt-bound pull transport / allowlist:
  CLOSED

model-visible index delivery:
  WAS NOT CLOSED
```

The transport half genuinely was closed: the pull tool reaches the worker, the IPC envelope is strict, the
attempt-bound allowlist refuses an unbound handle, and the governed resolver materializes bodies. None of
that is retracted.

The delivery half was never closed. The evidence was in R1-L's own captured artifacts and went unread:

```text
research-evidence/r1-l/rendered-prompt-C0.json   handlesRenderedIntoPrompt = false
research-evidence/r1-l/rendered-prompt-C1.json   handlesRenderedIntoPrompt = false
research-evidence/r1-l/rendered-prompt-C2.json   handlesRenderedIntoPrompt = false
```

Its gate assertion was also vacuous — `of(...) !== "" || true` — so it could not have detected the failure
even if it had been looking in the right place. The assertion is repaired in this stage and now asserts
against the durable DSH session artifact.

## Post-repair status

```text
model-visible index delivery:
  CLOSED BY R2-LR
```

The proof is `research-evidence/r2-lr/last-mile-proof.json` (12/12), taken at the model-visible session
boundary on a dedicated dummy fixture. **The repair did not happen historically** and this document does not
imply that it did: R1-L's own evidence stands as evidence of what was true at the time.

---

# 2. R1-R correction (§12)

## Pre-repair verdict (preserved verbatim)

```text
R1 STOCHASTIC WORKER COMPOUNDING: NO_REPLICATION
```

`research-evidence/r1-r/analysis.json` is unmodified, and all 30 raw trials are preserved.

## Corrected interpretation

```text
R1-R INTENDED CAPITAL TREATMENT:
  NOT EVALUABLE — MODEL-VISIBLE INDEX NOT DELIVERED
```

`NO_REPLICATION` is retired **as a valid capital-uptake conclusion**. It is not deleted and not falsified:
it remains an accurate description of what those 30 runs did. What it cannot be is evidence about the
intended treatment, because the treatment — a prompt-visible selected-handle index — was never delivered.

The 30 runs remain historical observations of workers operating with:

```text
pull capability
but no prompt-visible selected-handle index
```

---

# 3. R2-U correction (§13)

## Pre-repair verdict (preserved verbatim)

```text
R2-U CAPITAL UPTAKE: NOT_IMPROVED
```

`research-evidence/r2-u/analysis.json` and all 40 raw trial records are unmodified.

## Corrected interpretation

```text
R2-U INTENDED UPTAKE TREATMENT:
  NOT EVALUABLE — MODEL-VISIBLE INDEX NOT DELIVERED
```

`NOT_IMPROVED` is retired as a valid test of the intended visible-index affordance. It remains the correct
measurement of the runs as they happened: the A1 arm's explicit-review clause WAS delivered (it is appended
directly to the prompt text), but it instructed the worker to review a section that was not present. So the
stage measured "an instruction to consult an absent index", which is not the treatment the protocol
describes.

## 3.1 The single 3-handle pull — out-of-band discovery

The one trial that pulled (`C-K1A0-b2r2`, 3 handles) is classified:

```text
OUT_OF_BAND_HANDLE_DISCOVERY
```

because the worker obtained the handles from the rig's control payload rather than from the intended prompt
index. The raw tool event is **not** deleted and **not** reclassified as a pull that did not happen: it
remains in `research-evidence/r2-u/trials/C-K1A0-b2r2.json` exactly as recorded. Only its INTERPRETATION is
corrected.

The mechanism, from the durable session artifact: the worker ran a shell command listing the rig directory
(excluding its own world), found `out/payload.json`, and read it. The payload's `contextIndexText` field then
supplied the handle IDs. The audit is in `research-evidence/r2-lr/payload-exposure-audit.json`, and the
restarted R2-M rig no longer writes its control payload anywhere a worker can walk to.

---

# 4. R2-E preservation (§14)

## Status: VALID, unchanged

```text
FULL SELECTED-CAPITAL EFFICACY:
  REPLICATED within tested scope
```

R2-E remains valid, and the reason is specific rather than convenient:

```text
R2-E consumed selected bodies host-side through the governed channel
and injected the efficacy review into the worker turn.

Its treatment did not depend on voluntary discovery of contextIndexText.
```

The host-mediated prework invoked the same attempt-bound resolver and appended the materialized bodies to
the turn, so the worker received the capital regardless of whether an index was visible. The index was
irrelevant to R2-E's treatment, which is why the delivery defect does not touch it.

No Procedure marginal-efficacy claim is made: R2-E compared `no capital` against the
`Proof + Reasoning + Procedure` bundle, so its causal result belongs to the bundle (CIC v0.1 CI-6).

---

# 5. CIC v0.1 evidence erratum (§15)

`adf1615` is **NOT amended**. This erratum is appended here and in
`research-evidence/r2-lr/cic-erratum.json`.

## Empirical state changes

```text
FROM: Capital voluntary uptake:
        NOT_IMPROVED

TO:   Capital voluntary uptake:
        UNKNOWN under the intended model-visible-index interface

FROM: Procedure voluntary uptake:
        MEASURED LOW / NOT_IMPROVED under the current interface

TO:   Procedure voluntary uptake:
        UNKNOWN under the intended model-visible-index interface
```

## Preserved unchanged

```text
Full selected-capital efficacy:
  REPLICATED under forced governed consumption, tested scope only

Procedure marginal efficacy:
  UNPROVEN

Procedure governance:
  CLOSED
```

## The constitutional law is NOT revoked

The decision-relevance law (CI-2A: a voluntarily retrievable resource must expose a decision-relevance
surface, unless consultation is mechanically required) stands. It was never derived from the R1-R/R2-U
numbers; it is a law about what an interface must provide, and the defect is an instance of the very gap it
names — the index was addressable and discoverable-in-principle but not actually delivered.

---

# 6. System-prompt research erratum (§16)

Where the research synthesis used local R1-R/R2-U results as controlled evidence that prose reminders fail,
or that opaque-index uptake is 1/40, append this correction:

```text
those LOCAL controlled-treatment claims were invalidated by the worker-index delivery defect
```

The specific claims affected:

```text
"a prose affordance does not improve voluntary uptake"      (R2-U A1 vs A0)
"opaque index uptake is 1/40"                               (R2-U overall)
"stochastic workers do not compound capital"                (R1-R)
```

Each was measured under an absent index. None is retracted as a measurement; each is withdrawn as a
controlled-treatment claim.

External literature remains external evidence. This correction does not rewrite external findings and does
not claim local validation — no repaired experiment exists yet. Local validation becomes available only
after the restarted R2-M matrix runs, and then only within its tested scope.
