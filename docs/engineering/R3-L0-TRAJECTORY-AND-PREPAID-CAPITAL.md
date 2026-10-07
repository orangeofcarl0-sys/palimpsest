# R3-L0 — CONTROLLED LONG-HORIZON DURABLE CAPITAL REUSE: FROZEN DESIGN

Stage: R3-L0
Baseline: `42f1a77c7b13abaa109538ca5f4c6f378eb153fa` (R3-S0, `SYSTEM_VALID = true`)
Status: **DESIGN FROZEN** — no primary worker run has occurred

---

# 1. The research question

> Holding durable Project history and ordinary project continuity constant, does governed cognitive capital
> derived from already-paid historical experience reduce repeated cognitive errors and/or repeated cognitive
> effort across multiple fresh worker generations?

This is the first behavioural stage R3-S0 authorized. §1 requires R3-S0 to be carried forward as a
**prerequisite, not an assumption**, so the load-bearing gates are **run**, and the envelope a result may speak
within is recorded. `SYSTEM_VALID = true` was confirmed before any design work was frozen.

---

# 2. The System Validity Envelope (§1)

| field | value |
|---|---|
| canonical revision | `42f1a77c7b13abaa109538ca5f4c6f378eb153fa` |
| confidential runtime profile | `windows-confidential-single-active`, `maxActiveWorkers: 1` |
| single-active-worker limitation | at most ONE ACTIVE confidential worker, so sessions are strictly sequential and **no concurrency effect is measured** |
| restart scope | **SAME-MACHINE OS PROCESS BOUNDARY** — a fresh child Node process re-attaches to the durable stores by path |
| common renderer / tool surface | `dsh-common-worker`, `palimpsest_worker_result`, `palimpsest_worker_context_pull`, channel `palimpsest-worker-context-v1`; no model-specific prompt tuning |
| known-bypass scope | `KNOWN_BYPASSES_BLOCKED` — six known bypasses, attributed to R1-L/R1-H/R1-HR/R1-HC; **not** a proof about unknown bypasses |

**Excluded claims**, recorded so no report can over-read a result: cross-model portability, organic
self-generated capital compounding, Procedure marginal efficacy, universal project intelligence, monetary cost
reduction unless measured, Fusion value, distributed/multi-host restart, concurrent confidential workers.

---

# 3. The project family (§4/§5/§9)

**`entitlement-ledger`** — a multi-tenant capability ledger. A tenant holds a plan; a plan grants capabilities; a
grant may be **derived from** another grant, so the grants form a forest; revoking a grant must revoke everything
derived from it; a tenant's effective capabilities are its plan's overridden by its own explicit decisions.

**Why this exposes both lessons, and why they recur.** L1 recurs at every **mutation entry point** — G1 adds a
batch application, G2 a revocation, G3 a plan migration, three different entry points each owing "validate the
whole request before the first effect". L2 recurs at every **invalidation path** — G2's cascade, and G3's
migration which can revoke grants the new plan excludes.

**Not Scenario D.** Scenario D invalidates a build cache after a change set. There is no cache and no change set
here: the question is which **grants** survive a revocation, over an explicit derived-from forest the caller
declared.

## The two prepaid lessons (§5)

```text
L1  validate the complete relevant input/state before destructive mutation
L2  compute/freeze the complete affected dependency set before mutation/invalidation
```

## The generations (§9)

| gen | title | additive requirement | exposes |
|---|---|---|---|
| G1 | batch application | `applyBatch(ledger, batch)` applies a batch atomically; an unusable operation anywhere leaves the ledger exactly as it was; a repeat is a no-op | D1, D2 |
| G2 | cascading revocation | `revokeCapability(ledger, tenantId, capability)` revokes the grant **and every grant derived from it, at any depth** | D1, D2, D3, D4 |
| G3 | plan migration | `migratePlan(ledger, tenantId, newPlan)` moves the tenant, **keeps its explicit overrides**, and revokes grants the new plan excludes | D1, D2, D3, D4, D6 |

No class was added because a model happened to fail it: every class is an obligation the README contract
implies, and each was authored from the mechanism before any worker ran.

## The deterministic prehistory (§5)

Two **already-resolved** incidents, built by running ORDINARY Palimpsest so both arms receive a real project:

* **Incident 1** — `applyChanges` applied each change as it arrived, so a refusal left earlier changes already
  written. The fix: validate the complete set before the first write.
* **Incident 2** — `recomputeIndex` removed the node first and looked for its dependents afterwards, so the edges
  it needed were already gone and the closure was incomplete. The fix: compute the complete affected set while
  the edges still exist.

Both fixes are **in the tree as ordinary working code**, and both incidents are recorded in `docs/`. The project
has therefore already paid for L1 and L2, and §5 says the future workers must be able **in principle to
rediscover the lessons from ordinary project/code history**. That is intentional: H is a real control, and a
control that cannot succeed would make the treatment measure nothing.

---

# 4. Canonical verification versus research diagnostics (§10)

Two things kept strictly apart:

```text
Project Verification   the VISIBLE oracle in the world. Decides whether ordinary Work/Result may proceed.
Research Diagnostic    this stage's oracle. Research-only: invisible to the worker, no canonical authority,
                       changes no promotion. Produces the frozen failure-class vector.
```

§10 gives the reason, and it is load-bearing: without the separation, one missed diagnostic class would fail
Project Verification, the trajectory would stall, and the study would measure a **stalled project** rather than
the **recurrence** of a prepaid error.

## The diagnostic classes

| class | invariant | lesson | prepaid |
|---|---|---|---|
| D1 | atomic-batch | L1 | yes |
| D2 | validate-before-effect | L1 | yes |
| D3 | closure-before-mutation | L2 | yes |
| D4 | transitive-cascade | L2 | yes |
| D5 | override-preservation | — | **no** |
| D6 | composed-atomicity | L1 | yes |

Every case is judged mechanically by comparing the caller's ledger against a canonical pre-call form. The oracle
**discriminates**: against the generation H0 sources it reports coverage 0.000–0.333, and against a reference
solution it reports **1.000**. D5 is reported in diagnostic quality but is **excluded from PERR**, because the
project never paid for it.

---

# 5. The frozen capital bundle (§6)

Derived from the prehistory, using **existing owners only**, with the preferred three-owner structure per lesson:

| owner | L1 | L2 |
|---|---|---|
| **Proof** (`src/proof_asset`) | Incident 1's own statement, imported as a source and published as a claim | Incident 2's own statement |
| **ReasoningClaim** (`src/reasoning_cell`) | the ORDER argument: validation and effect must not interleave | the ORDER argument: the mutation destroys the evidence the computation needs |
| **Procedure** (`src/procedures`) | the 5-step method, grounded in an **intervention record** naming the incident | the 5-step method, grounded the same way |

**No new asset kind was created.** Every body states the **general** lesson, and a mechanical guard checks that
no body names a diagnostic case id, quotes a case fixture literal, or appears in the case data:
`leak-free: true`.

```text
bundle digest  99a5c840fb7ef1f5e08c81096b6ecab9aa023317e9aa7cc6639b39420ebc2c47
```

Nothing in the bundle may change after trial 1.

---

# 6. The two arms (§7/§8)

| | H — HISTORY_ONLY | C — CAPITALIZED |
|---|---|---|
| receives | the full durable Project history and evolving world | the same, **plus** the governed prepaid capital |
| selected capital | **none** | the frozen bundle |
| required path | — | admission → `ProjectAssetAssociation` → Context selection → model-visible index → governed pull → canonical body |
| forbidden | no selected handles, no hidden body injection, no automatic review | — |
| host-mediated forced review | — | **not used**; voluntary governed consumption is part of the mechanism |

**The arms differ in exactly one respect**, and it is data in `capital.mjs`: H omits the `knowledge` field from
`service.start` entirely, so the compile takes the pre-E1-K path exactly.

§8: **H is not a bare repository.** Both arms run the identical harness with the same project world, Work
history, Attempt/Result history, verification, promotions and intent. The treatment is the cognitive-capital
layer, not Palimpsest itself.

---

# 7. PERR (§11)

```text
PERR = repeated prepaid diagnostic failures / eligible prepaid exposures
```

| generation | eligible prepaid exposures |
|---|---|
| G1 | D1, D2 |
| G2 | D1, D2, D3, D4 |
| G3 | D1, D2, D3, D4, D6 |

**11 eligible exposures across the trajectory.** §11 forbids inferring the prepaid relationship after outcomes
are known, so the mapping is a frozen constant and the analysis reads it rather than deriving it.

---

# 8. What this design does NOT do

It does not create F-C/F-D fixtures, resume R3-A short benchmark construction, test organic capital production,
run Kimi, or begin Fusion. It creates no new asset kind, writes no answer to a future hidden case, and adds no
canonical owner.
