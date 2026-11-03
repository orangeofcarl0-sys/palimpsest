# R2-M — DECISION-RELEVANT CAPITAL INDEX (restarted after R2-LR)

Stage: R2-M, restarted on the repaired worker-index delivery
Branch: `r2-lr-worker-index-delivery`
Baseline: `3a4a3c61160e4a36da1ad093addb85888b587923` (the preserved BLOCKED attempt)
Verdict: **R2-M DECISION RELEVANCE: NOT_IMPROVED** — because both arms are at a CEILING

---

# 1. What this stage asked

```text
Does decision-relevant, owner-grounded metadata about already-selected
project capital increase voluntary use of the existing governed pull channel?
```

Two arms, identical in every other respect (§18): the same selected capital, the same bodies, the same
handles, the same pull capability, the same task and runtime, the same tool catalog and tool descriptions.

```text
M0  the current production presentation: [kind] handle, nothing else
M1  the same, plus owner-grounded decision metadata and a bounded deterministic preview
```

M1 carries **no** new prose clause and **no** rewritten tool description. R2-U already measured prose
affordance; re-introducing it would have confounded the one question this stage exists to answer.

---

# 2. Why it had to be restarted

The first attempt is preserved as `3a4a3c6` and its report is `research-evidence/r2-m/BLOCKED.md`. GATE A
found that the index never reached any worker's prompt: `host/dsh/lib/index.js` did not forward
`contextIndexText`, so `environment.contextIndexText` was `undefined` and `workTask` omitted the section.
Proven mechanically — the pilot's `renderedSectionDigest` equalled `sha256("undefined")`.

R2-LR repaired that delivery defect, proved the repair at the model-visible session boundary, and then this
stage was restarted. The four pilots from the blocked attempt are **discarded** and were not used for
tuning (§17): they received no M1 treatment at all.

---

# 3. The treatment, proven at the session boundary

§21/§26 permit a verdict only when the ACTUAL session shows the treatment. For all 20 trials:

```text
M0  the session's index section IS the production index (byte-identical to the payload's)
M1  the session's index section IS the derived index (differs from production)
both  every selected handle appears in the model-visible prompt
both  no session prompt mentions the control payload
```

The last line matters: R2-U's one puller read the handle IDs out of the rig's control payload. This stage's
rig writes that payload to the system temp directory, outside any path a worker can walk to, and no session
contains a reference to it. So the pulls below are voluntary use of the governed channel, not discovery.

---

# 4. Result

```text
2 scenarios × 2 conditions × 5 repetitions = 20 trials
20/20 recorded · 0 confounded blocks · 0 host failures · 0 timeouts
capacity granted 1/1 on every trial (windows-confidential-single-active)
```

```text
             any pull   proof   reasoning   procedure
C  M0          5/5      5/5      5/5          5/5
C  M1          5/5      5/5      5/5          5/5
D  M0          5/5      5/5      5/5          5/5
D  M1          5/5      5/5      5/5          5/5
```

**Every one of the 20 trials pulled all three selected handles, in both arms.**

The verdict is `NOT_IMPROVED` because M1's rate does not exceed M0's. The reason is a ceiling, and the
ceiling is the finding: with the index actually delivered, voluntary uptake is 20/20 — against R2-U's 1/40
measured under the same protocol with the index absent.

---

# 5. Secondary outcomes

```text
                    before-edit pull   median actions to first pull   full solve   known-failure recurrence
C  M0                    5/5                     3                        5/5                0/5
C  M1                    5/5                     3                        5/5                0/5
D  M0                    5/5                     4                        2/5                0/5
D  M1                    5/5                     3                        3/5                0/5
```

- **Pull before first edit: 20/20.** Every worker consulted the capital before mutating the source.
- **Pull before first visible test: 0/20.** Workers ran the oracle first, then pulled. This is a consistent
  pattern rather than noise, and it is worth recording: the index is consulted after initial reconnaissance,
  not before it.
- **Task outcomes are SECONDARY and association-only.** C is at a ceiling (15/15 in both arms). D
  discriminates slightly in M1's favour (three M1 trials at 14/14 against two M0 at 14/14), and
  `h14` — the residual two R2-E E1 trials failed — is now solved by several trials in both arms. With n=5
  and self-selected pullers this is not a treatment effect and is not claimed as one.

---

# 6. Interpretation discipline (§26/§27)

A `NOT_IMPROVED` verdict here does **not** mean metadata is useless, and it does not mean the delivery
repair was inconsequential. It means this specific frozen treatment did not raise uptake **above a
ceiling it was already at**.

```text
This establishes:  under the repaired delivery, voluntary governed uptake was 20/20 in the tested scope
It does NOT establish:  that metadata causes that uptake — M0 was also 20/20
It does NOT establish:  generalization to other models, regimes or task families
```

The M0 result is the more surprising one and deserves the emphasis: the *production* opaque index produced
20/20 voluntary uptake once it was actually delivered. The R1-R/R2-U conclusion that workers do not pull
was, in this tested scope, a conclusion about a missing prompt section rather than about worker behaviour.

---

# 7. What this does not license

```text
No productization.  M1 is not promoted to product semantics; no canonical preview field,
                    no ContextManifest change, no new owner, no relevance score.
No generalization.  LOCAL to the tested model, runtime, scenarios, context regime and environment.
No efficacy claim.  Pullers are self-selected; the task-outcome difference is an association.
No Procedure marginal claim.  The three kinds moved together; nothing here isolates one.
```
