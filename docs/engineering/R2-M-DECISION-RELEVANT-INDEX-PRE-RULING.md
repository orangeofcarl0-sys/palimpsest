# R2-M — DECISION-RELEVANT CAPITAL INDEX METADATA

## PRE-RULING (design only — DO NOT EXECUTE)

Status: **PRE-RULING / NOT EXECUTED**
Baseline HEAD at drafting: `8822f9e` (`r2-e-controlled-capital-efficacy`)
Predecessor stages: R2-U (CLOSED, `NOT_IMPROVED`), R2-E (CLOSED, `REPLICATED`)
Constitutional basis: `COGNITIVE-INTERFACE-CONSTITUTION-v0.1.md`, CI-2A and §40–§45

This document designs R2-M and stops. No R2-M code, fixture, harness, or trial is created by this stage.

---

# 1. The question R2-M answers

```text
Does decision-relevant capital-index metadata improve
voluntary governed uptake?
```

It is the direct successor to two closed results:

```text
R2-U  a PROSE affordance did not improve voluntary uptake
      40 trials, governed pulls 1/40 (1/20 capital-present,
      0/10 explicit-review capital-present)
      verdict: R2-U CAPITAL UPTAKE: NOT_IMPROVED

R2-E  when consumption is GUARANTEED by the host, capital helps
      20 trials, 10/10 E1 trials consumed all selected capital,
      mistake recurrence 0/5 in every E1 arm
      verdict: R2-E CAPITAL EFFICACY: REPLICATED
```

Capital works when consumed; the worker does not choose to consume it. R2-M asks whether giving the
index a decision-relevance surface (CIC v0.1 CI-2A) closes that gap **without forcing consumption**.

R2-M is NOT an efficacy stage. It is NOT a relevance-selection stage. It does NOT change what is
selected. It changes only what the index *shows* about what was already selected.

---

# 2. Treatment boundary (what MUST NOT change)

Frozen across both arms:

```text
task objective / ProjectIR
selected capital set (same handles, same kinds, same revisions)
capital bodies
selection policy
pull mechanism (same tool, same channel, same resolver)
authority
runtime security
worker capability surface
ordinary task text
```

Only index presentation changes. The `AllowedPullHandles` allowlist is identical in both arms — M1
must not widen, narrow, or reorder it.

---

# 3. The two arms

## 3.1 M0 — control (current opaque index)

```text
[proof]     @ctx/proof/<claimId>
[reasoning] @ctx/reasoning/<cellId>/<claimId>
[procedure] @ctx/procedure/<procedureId>/<revision>
```

This is today's production index, byte-for-byte: `kind` + `handle`, nothing else. It is the current
state of the art and the baseline R2-M must beat to justify a change.

## 3.2 M1 — treatment (owner-grounded decision metadata)

Same selected capital, same bodies, same pull capability, same task/runtime, **plus** owner-grounded
decision metadata.

```text
PROOF
  Preview:  bounded deterministic EXPERIMENTAL projection of the claim
  Standing at compile:  owner value
  Freshness:  owner value
  Selected for this attempt:  true
  Handle:  @ctx/proof/...

REASONING
  Preview:  bounded deterministic EXPERIMENTAL projection of the claim
  Active at compile:  true
  Selected for this attempt:  true
  Handle:  @ctx/reasoning/...

PROCEDURE
  Applicability:  canonical Procedure applicability field
  Limitations:    canonical Procedure limitations field
  Revision / standing:  owner values
  Method preview:  optional bounded deterministic projection
  Selected for this attempt:  true
  Handle:  @ctx/procedure/...
```

## 3.3 What M1 MUST NOT contain (confound exclusion)

```text
new prose review clause
rewritten context-pull tool description
relevance score
priority score
salience score
why-this-attempt inference
```

Rationale: the prose-affordance treatment was already measured by R2-U and found `NOT_IMPROVED`.
Re-introducing prose inside M1 would make the result uninterpretable — a positive result could not be
attributed to metadata, and a null result could not exonerate it. The tool-description rewrite
(CIC v0.1 §9) is likewise a **separate treatment** and MUST NOT ride along.

M1 carries no imperative verb, no "you should", no recommendation. It is descriptive metadata, not an
instruction.

---

# 4. Preview provenance — the two are NOT the same treatment

R2-M must not report one homogeneous "preview effect". There are **two distinct provenances**, and the
analysis MUST keep them visible:

## 4.1 Procedure owner-native metadata

```text
source:  ProcedureContent, i.e. inside revision.content (the BODY)
nature:  first-class, named, REQUIRED non-empty owner fields
         (applicability, limitations)
         plus body-free metadata (revision, standing)
```

`applicability` and `limitations` are fields the Procedure owner itself declares and requires. They are
not a projection invented by the host. Standing and revision are body-free.

## 4.2 Proof / Reasoning content preview

```text
source:  the claim body, which compile does NOT read (CIC v0.1 §16.1)
nature:  a bounded deterministic PROJECTION the host derives
```

A Proof/Reasoning binding has no text field at all. Its preview is derived, not declared.

## 4.3 Why the difference must be visible in analysis

```text
Procedure metadata  = owner-DECLARED
Proof/Reasoning preview = host-PROJECTED
```

A positive M1 result driven mainly by Procedure metadata licenses a different conclusion (and a
different, cheaper productization path) than one driven by Proof/Reasoning previews. Collapsing them
would destroy exactly the information R2-M exists to produce. Per-kind pull outcomes are therefore a
required analysis dimension (§7.3).

---

# 5. Mechanism — EXPERIMENTAL HOST-DERIVED PREVIEW

## 5.1 Label

```text
EXPERIMENTAL HOST-DERIVED PREVIEW
```

It is **not** product semantics. It is an experimental host presentation path, exactly as the R2-U
affordance and the R2-E efficacy seam were.

## 5.2 Conceptual path

```text
existing compiled selected handles
  → existing governed attempt-bound resolver
  → host reads selected body
  → deterministic bounded preview projection
  → preview rendered to worker index
```

## 5.3 Hard requirements

```text
full body is NOT rendered
AllowedPullHandles still governs access
owner backing files are never read directly
canonical ContextManifest unchanged
src/context compile semantics unchanged
```

Additional invariants carried from the prior stages:

```text
no second context-fetch path
no bypass of the attempt-bound resolver
no direct backing-store read
no body embedded into any canonical artifact
no new canonical event / store / schema
default (absent-mode) behaviour byte-identical to production
```

## 5.4 Feasibility determination (correction E: STOP-and-report check)

Correction E required: *"If repository reality makes this impossible without canonical change, STOP and
report rather than implementing."*

**Determination: POSSIBLE without canonical change. R2-M is READY, not BLOCKED.**

Evidence gathered at freeze time:

```text
1. The host ALREADY reads selected bodies through the governed resolver.
   R2-E's prework calls the worker-local pull tool, which routes to the
   SAME parent resolver (AllowedPullHandles + attempt-bound fetchContext).
   No second path was created for R2-E, and none is needed for R2-M.

2. The resolver is already reachable host-side for the attempt's own
   compiled handles, so the host can obtain a selected body without any
   canonical change.

3. The index text is already assembled host-side by the host's own
   presentation seam (the same place the R2-U affordance and R2-E review
   sections are appended), so rendering preview lines there requires no
   product change.

4. src/context compile is untouched: the host reads bodies AFTER compile,
   from the compiled handle list. Compile continues to read no bodies.
```

Therefore the content-bearing option is implementable as a host-only experimental seam, and the
correction-E STOP condition is **not** triggered.

## 5.5 Bounded projection rule

The projection MUST be:

```text
deterministic      same body → same preview bytes
owner-grounded     derived only from the owner's own content
bounded            a fixed maximum length / field count
non-generative     NO LLM summary, NO model call, at any point
digest-stable      preview digest recorded per handle
```

Permitted derivations:

```text
structured field projection (Procedure applicability/limitations/title)
bounded canonical text truncation of an owner field
existing owner title/purpose/statement field
```

Forbidden derivations:

```text
LLM-generated summary
invented relevance / priority / salience score
free-form reinterpretation
any text not traceable to an owner field
```

If a bounded projection cannot be produced from owner content for a given kind, that kind's M1 entry
falls back to its owner metadata only, and that fallback MUST be recorded — not silently substituted.

---

# 6. `why-this-attempt` ruling (correction F)

```text
why-this-attempt is EXCLUDED from M1.
```

Today the only owner-grounded "why" is the constant `inclusion_reason = "explicit_request"`, which is
not decision-relevant. The neutral fact that MAY be rendered is:

```text
Selected for this attempt: true
```

No relevance explanation is invented. If a future owner-grounded source richer than the constant
appears, `why-this-attempt` may be reconsidered — but not before, and not inside R2-M.

---

# 7. Outcomes

## 7.1 Primary

```text
P(any governed pull | selected capital)
```

per arm, per scenario.

## 7.2 Secondary

```text
time to first pull
pull before first edit
kind(s) pulled
task efficacy association
```

## 7.3 Required analysis dimensions

```text
per-kind pull outcome (Proof / Reasoning / Procedure separately)
preview provenance (owner-declared Procedure metadata vs
                    host-projected Proof/Reasoning preview)
time-to-first-pull distribution, not just a mean
```

## 7.4 Causal discipline

```text
No efficacy causal claim from self-selected pullers.
```

Pullers are self-selected. A difference between pullers and non-pullers inside an arm is an
**association**, not a treatment effect. R2-M's causal claim, if any, is about the **index treatment's
effect on pull probability** — that comparison IS randomized (M0 vs M1). Everything downstream of a
voluntary pull is observational.

---

# 8. Design and schedule (to be frozen at execution time)

Intended shape, consistent with the prior stages:

```text
2 scenarios × 2 conditions × 5 repetitions = 20 stochastic primary trials
```

```text
scenarios:      C (replay-safe reducer), D (incremental cache invalidation)
conditions:     M0 (opaque index), M1 (owner-grounded decision metadata)
blocks:         5 randomized blocks per scenario, interleaved (not grouped)
seed:           ONE frozen seed, published in the protocol before any trial
concurrency:    one ACTIVE confidential worker at all times
                (windows-confidential-single-active, MAX ACTIVE = 1)
```

Pairing equality per block (same discipline as R2-E §13):

```text
ProjectIR · task · repo tree · visible tests · hidden acceptance
model/profile · worker capability surface · security profile
ordinary Work prompt · AllowedPullHandles
```

The **index section** is the treatment surface and is legitimately NOT in the equal-set. Its movement
with arm is recorded as an observation (`indexMovedWithArm`), as in R2-E.

---

# 9. Verdicts (pre-declared, to be fixed before the first trial)

```text
R2-M UPTAKE METADATA: IMPROVED
R2-M UPTAKE METADATA: PARTIAL
R2-M UPTAKE METADATA: NOT_IMPROVED
```

Criteria, to be frozen in the protocol before execution — the same discipline as R2-U §20 and R2-E §17:

```text
IMPROVED      both scenarios show a higher governed-pull rate under M1
              than under M0, with no host failures in the comparison
PARTIAL       exactly one scenario improves, or both move weakly
NOT_IMPROVED  neither scenario shows a higher governed-pull rate under M1
```

With N=5 per cell, raw counts only. No p-value claims.

---

# 10. Generalization status (correction L)

The initial R2-M result, whatever it is, remains local to:

```text
tested model
tested DSH/runtime
tested scenarios
tested context regime
tested environment
```

Do NOT state that semantic previews solve agent-memory uptake universally. A `NOT_IMPROVED` result is
also local: it does not prove no index treatment can work. Cross-model replication is a later gate
(CIC v0.1 §44).

---

# 11. Evidence and artifact discipline

If executed, R2-M should follow the reduced-volume discipline R2-E established:

```text
protocol (frozen before trials)
trial manifest with per-trial digests
normalized results
analysis
representative sanitized traces
```

```text
sanitize absolute paths and secrets
record handle identities/digests, never bodies
store no private CoT
transcripts compressed and kept external; the repo carries digests
```

---

# 12. What this pre-ruling does NOT do

```text
does not implement R2-M
does not change src/context compile
does not change capital bindings
does not change worker tools
does not change prompt assembly
does not run stochastic trials
does not create a Project setting
does not create a new canonical owner
```

---

# 13. Readiness

```text
R2-M: READY
```

Blocking conditions: none found.

Carried risks, stated honestly:

```text
1. The treatment may be too weak to move a worker that ignored an
   explicit instruction to review the index. R2-U's null is real
   evidence against index-only treatments.
2. A content-bearing preview may partially disclose body content.
   CIC v0.1 §16 permits bounded owner-grounded projection and forbids
   the full body; the bound must be enforced mechanically and reviewed.
3. If Procedure metadata dominates any positive effect, the result
   would NOT generalize to Proof/Reasoning previews (§4.3).
```
