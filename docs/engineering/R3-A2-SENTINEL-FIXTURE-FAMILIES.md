# R3-A2 — SENTINEL PORTFOLIO: THE TWO NEW FIXTURE FAMILIES

Stage: R3-A2
Baseline: `03a47a44ab12a68e4a6fcfdc52024f6f38929b24`
Status: **FROZEN revision 1** for both new families, before any R3-A2 baseline run

---

# 1. What this stage is, and what it is not

The R3-A→B gate is RED: exactly one (fixture, model) pair qualified, so no L-shaped bridge exists. The R3-A2
ruling does **not** ask this stage to fix that. It freezes two laws prospectively:

```text
Portfolio Qualification != Bridge Hunting
A RED graph is a valid result.
```

The stage authors exactly TWO new fixture families — **F-C** and **F-D** — and qualifies them on the two
low-cost sentinel stacks. The outcome is a **characterization of a portfolio**, not a search for a bridge. No
F-E may be added in this stage, and no fixture may be authored after the first new baseline worker run.

---

# 2. Construction discipline (§"Construction contamination")

Both families were designed from **mechanism requirements** — what resolving an inheritance graph owes its
caller, and what selecting a rule owes a request — **before any R3-A2 baseline run**. No DeepSeek or GLM
failure trace was consulted, and no hidden case was authored around a model's observed weakness.

```text
constructionActor:                          LOCAL_CODING_AGENT
constructionModelId:                        UNKNOWN   (never invented)
constructionModelFamily:                    UNKNOWN   (never invented)
evaluationModelFamiliesKnownAtConstruction: true
evaluationModelFamilies:                    deepseek, glm
contamination:                              UNKNOWN
heldOut:                                    false
antiOverfitProcess:                         COMPLIANT
```

`evaluationModelFamiliesKnownAtConstruction = true` is the honest record: unlike F-A/F-B, the sentinel families
were named before these fixtures were authored. The ruling says this does **not** automatically make the
fixture `NON_COMPLIANT`. `COMPLIANT` is claimed on the three conditions the ruling sets, all of which hold:

| condition | how it holds |
|---|---|
| classes and oracle authored before any new baseline run | the classes are the obligations each contract states, written into `fixture-content-r3a2.mjs` before the plan commit |
| derived from the declared mechanism, not from failure traces | every class maps to a clause of the fixture's own README contract; no outcome was inspected |
| not revised after qualification outcomes exist | the revision is frozen by digest; a change produces a NEW revision with a NEW digest |

**The ceiling is limited accordingly.** `heldOut = false`, so `claimCeilingFor` returns **G1**: task-family
claims are available, model-family generality is not. `COMPLIANT` does not imply `heldOut`.

---

# 3. Structural diversity proof

The four families differ in **underlying failure structure**, not in filenames or domain nouns.

| | F-A | F-B | F-C | F-D |
|---|---|---|---|---|
| mechanism | transactional / atomic state update | versioned schema / API compatibility | **graph policy resolution** | **specificity / rule resolution** |
| core obligation | establish the WHOLE effect before the FIRST effect | preserve what you do not recognize | **refuse the graph, then let the nearer declaration win** | **normalize, then let the most specific match win** |
| the caller's object | a store mutated in place | a document never mutated | **a declared graph, resolved into a canonical closure** | **a rule set, resolved into one selection** |
| dominant failure mode | partial mutation before rejection | silent data loss | **unrefused cycles and lost precedence** | **first-match instead of most-specific, and silent ties** |
| success shape | an all-or-nothing commit | a forward-compatible transform | **a canonical topological order plus a precedence-correct closure** | **a ranked, unambiguous selection** |
| the pre-paid mistake | apply as you walk | build the new shape from the fields you know | **gather every policy into one bag and hand it to every node** | **regex the pattern and return the first match** |

**F-C is not Scenario D.** Scenario D invalidates a cache after a change set; there is no cache, no
invalidation and no change set in F-C. F-C asks *which declared value is effective for a node*, given an
ordered inheritance graph — a closure and precedence problem, not a staleness problem. The design test asserts
that no F-C byte mentions invalidation, staleness or a cache.

---

# 4. F-C — graph policy resolution

```text
fixtureId:        r3a-f-c-policy-resolution
revision:         1
contentDigest:    fbff8c2e19c3c5d12c511ef8618d23452bf0c93c8ba505eecd8974c56c49860d
sourceFile:       src/policy.mjs
export:           resolvePolicies(graph)
mechanism:        validate graph -> detect invalid references/cycles -> compute closure
                  -> apply declared precedence -> canonicalize
surface domain:   feature / policy inheritance
```

**The contract.** `resolvePolicies(graph)` returns `{ effective, order }`. A node's effective policies are its
own merged over the closure it inherits; the NEARER declaration wins, and between two inherited declarations
the EARLIER `inherits` entry wins. `order` is a canonical topological order with the smaller id breaking ties.
An unknown reference or a cycle is refused.

**The pre-paid mistake (H0).** It gathers every policy it can see into one bag and hands that bag to every
node — so it accepts cycles, ignores unknown references, lets a farther declaration overwrite a nearer one,
reports nodes in declaration order, and leaks policies across components.

| class | invariant | cases | H0 |
|---|---|---|---|
| FC1 | cycle-rejected | 2 | 0/2 |
| FC2 | unknown-reference-rejected | 2 | 0/2 |
| FC3 | declared-precedence-honored | 3 | 1/3 |
| FC4 | duplicate-edge-idempotent | 2 | 0/2 |
| FC5 | deterministic-topological-order | 3 | 1/3 |
| FC6 | component-isolation | 2 | 1/2 |

H0 scores **3/14**; a reference resolution scores **14/14**.

---

# 5. F-D — specificity / rule resolution

```text
fixtureId:        r3a-f-d-rule-resolution
revision:         1
contentDigest:    0abbe4524b6bc4d3c404be8a67183b883581b516f0a303fad7eefe12bfa0b26c
sourceFile:       src/rules.mjs
export:           resolveRule(rules, request)
mechanism:        normalize -> validate -> rank specificity -> resolve ambiguity -> canonicalize
surface domain:   request routing / rule resolution
```

**The contract.** `resolveRule(rules, request)` returns `{ ruleId, params }` or `null`. Matching happens after
normalization (trim, case-fold). Specificity is one point for a host-pinned rule plus one per literal segment;
the highest score wins. Two rules with the same normalized match are the SAME rule; two rules sharing an id
with different matches make the set unusable; two different rules tying at the top score make the request
ambiguous. Both are refused. A `*` segment matches exactly one non-empty segment.

**The pre-paid mistake (H0).** It turns each pattern into a regex, ignores the host, and returns the FIRST
match — so it never normalizes, never ranks, never refuses a tie, and lets `*` match an empty segment.

| class | invariant | cases | H0 |
|---|---|---|---|
| FD1 | normalization-before-ranking | 2 | 0/2 |
| FD2 | host-specificity-precedence | 2 | 0/2 |
| FD3 | path-specificity-ranking | 2 | 0/2 |
| FD4 | ambiguity-rejected | 2 | 0/2 |
| FD5 | duplicate-rule-handling | 2 | 1/2 |
| FD6 | segment-boundary-semantics | 3 | 2/3 |

H0 scores **3/13**; a reference resolution scores **13/13**.

---

# 6. Failure-class requirements

* Every hidden case declares a failure class, and every declared class is exercised — proven mechanically by
  the R3-A2 fixture audit, not asserted.
* No model self-report decides pass/fail: the oracle runs the candidate and compares deterministic state. The
  audit's `oracleUsesNoModelSelfReport` fact is computed from the acceptance source and is `true` for both.
* H0 has headroom on **every** declared class of **both** families, and H0 is not at the floor.
* The oracle is deterministic: the same candidate judges identically twice.
* **Structural** class relations are declared separately from observed series equality. The grouping the
  qualification engine performs is over **observationally distinct failure-class series groups**, and this
  stage does not claim that an identical Nq=5 series proves semantic redundancy.

---

# 7. Source analogues and the capital blueprint

The ruling requires each new family to freeze a source analogue, a candidate-capital blueprint and a
failure-class-to-capital map **before** baseline execution. All three are frozen in
`scripts/r3a2/capital.mjs`.

| target | source analogue | source domain | target domain |
|---|---|---|---|
| F-C | `src-role-permission-inheritance` | identity / authorization | feature / policy inheritance |
| F-D | `src-media-type-negotiation` | content negotiation / protocol | request routing / rule resolution |

Each analogue records a step-by-step mechanism correspondence, so a future transferable-capital stage reads a
declared correspondence rather than a guess.

**What `DIRECT` means, precisely.** The capital's own recorded method STATES the behaviour the class tests, in
the same terms. `TRANSFER_HYPOTHESIS` means the method states a principle from a different domain that a
worker might carry across, and it does **not** satisfy the treatment-relevance clause by itself. `NONE` means
no stated relationship. The map is a frozen literal; it is a function of the mechanism, never of an outcome.

| fixture | DIRECT capital | DIRECT classes |
|---|---|---|
| F-C | `cap-fc-graph-closure` | FC1, FC2, FC3, FC4, FC5, FC6 |
| F-D | `cap-fd-rule-specificity` | FD1, FD2, FD3, FD4, FD5, FD6 |

Cross-family entries are recorded separately: FC2↔`cap-fa-atomic-commit`/`cap-fb-compat-migration`, FC3/FC5↔
`cap-fd-rule-specificity`, FD2/FD3↔`cap-fc-graph-closure`, FD4/FD5↔`cap-fa-atomic-commit` are
`TRANSFER_HYPOTHESIS`. Every blueprint's provenance is `MECHANISM_DERIVATION`, and every blueprint records
that it is **advisory guidance only** — it cannot widen write scope or allowed commands.

**These blueprints are experimental research metadata.** They are not canonical owner types, not project
truth, and they introduce no new authority mechanism.

---

# 8. The frozen portfolio

```text
F-A  r3a-f-a-atomic-transaction   468cfcea8a8e36127ebba9022f21cad1c751f2b18cca7f53867775c6163fc37a  CARRIED FORWARD
F-B  r3a-f-b-versioned-migration  8e290a4be4ba7f2713b621806113a99fc8e15e009b4a75630be9d593757b7611  CARRIED FORWARD
F-C  r3a-f-c-policy-resolution    fbff8c2e19c3c5d12c511ef8618d23452bf0c93c8ba505eecd8974c56c49860d  NEW
F-D  r3a-f-d-rule-resolution      0abbe4524b6bc4d3c404be8a67183b883581b516f0a303fad7eefe12bfa0b26c  NEW
```

The two carried-forward digests are byte-identical to the R3-AE manifest. This stage did not touch F-A or F-B,
and the design tests assert both digests.

---

# 9. What this stage does NOT claim

* It does not claim model-family generality: `heldOut = false`, so the ceiling is **G1**.
* It does not claim pure model-architecture isolation. DeepSeek and GLM differ in vendor, tool-use
  post-training lineage and reasoning formatting, and GLM reaches the harness through a local gateway.
* It does not claim an identical Nq=5 series proves semantic redundancy.
* It does not claim any capital is empirically useful.
* It does not productize a blueprint, and it introduces no canonical owner type.
