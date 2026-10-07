# R3-L0 — LONGITUDINAL EXPERIMENT PLAN (FROZEN)

Stage: R3-L0
Baseline: `42f1a77c7b13abaa109538ca5f4c6f378eb153fa`
Status: **FROZEN before the first primary L0 worker session**

This is the human-readable form of `research-evidence/r3-l0/plan.json`, which is authoritative. The plan is
written at the **second commit**, before any primary session, and the results commit descends from it. The
runner refuses to start unless the committed plan matches the schedule it would execute.

---

# 1. Primary executor (§13)

```text
model      DeepSeek Flash   (deepseek-flash)
provider   deepseek-route   openai-completions   https://api.deepseek.com
renderer   dsh-common-worker, no model-specific prompt tuning
```

§13 prefers DeepSeek Flash **if its route is stable and available at plan freeze**, and it was: the dummy-fixture
plumbing check drove a real worker end-to-end through it, the worker set `answer = 42`, and the visible oracle
passed (transcript 1904 bytes). GLM 5.3 Flash was also verified available but is **not used**, because §13
forbids switching model family after trial 1 and the preferred sentinel was stable.

Recorded per session: the configured model, the observed model identity where available, the provider route, the
renderer version and the tool-surface digest.

---

# 2. The System Validity Envelope (§1)

| field | value |
|---|---|
| canonical revision | `42f1a77c7b13abaa109538ca5f4c6f378eb153fa` |
| confidential profile | `windows-confidential-single-active`, `maxActiveWorkers: 1` |
| single-active limitation | strictly sequential sessions; **no concurrency effect measured** |
| restart scope | **same-machine OS process boundary**; no distributed/network claim |
| common surface | `dsh-common-worker`, `palimpsest_worker_result`, `palimpsest_worker_context_pull`, channel `palimpsest-worker-context-v1` |
| known-bypass scope | `KNOWN_BYPASSES_BLOCKED` — six known bypasses, attributed to R1-L/R1-H/R1-HR/R1-HC |

The load-bearing R3-S0 gates are **run, not cited**, before the matrix and again after it. §1 and §22 both say a
red gate stops the stage: `SYSTEM_VALID = NO` and `BEHAVIORAL MECHANISM CLAIM = INVALID`, **even if task
outcomes favour C**.

---

# 3. The schedule (§14)

**N = 4 matched blocks. Each block: 1 H trajectory + 1 C trajectory. Each trajectory: 3 generations.**

```text
2 × 4 × 3 = 24 intended primary model sessions
```

The H/C order **within each block** is randomized from a frozen seed (`0x524c3001`) before trial 1:

```text
block 0   C then H
block 1   C then H
block 2   H then C
block 3   H then C
```

Generations inside a trajectory are **strictly sequential**, because §12 makes path dependence part of the
treatment: G1's promotion is G2's starting world, and G2's is G3's.

---

# 4. Hard budget and retry (§15)

```text
intended valid sessions:       24
hard maximum valid sessions:   24
adaptive stopping:             NO
add repetitions if ambiguous:  NO
```

An **infrastructure-invalid** session (child failed to run, worker failed to spawn, host lost the job) is
retried up to 4 times, only to reach the scheduled count. A **valid** generation outcome is **never retried**,
whatever its diagnostic result.

---

# 5. Arm semantics (§7/§8)

| | H — HISTORY_ONLY | C — CAPITALIZED |
|---|---|---|
| receives | full durable history + evolving world | the same **plus** the governed capital |
| selected capital | **none** | the frozen bundle |
| `knowledge` field | **omitted entirely** | the frozen selection |
| forbidden | no selected handles, no hidden injection, no automatic review | — |
| forced host-mediated review | — | **not used** |

**H is not a bare repository** (§8): both arms run the identical harness with the same project world, Work,
Attempt/Result, verification, promotions and intent. The treatment is the cognitive-capital layer, not
Palimpsest itself.

---

# 6. Trial schema (§16/§17/§20)

Per session: `sessionId, block, arm, generation, pid, startingHead, finalHead, jobPhase, attemptId, promoted,
sourceDigest, diagnostic, visibleOracle`.

Capital witness per C session: asset revision exists, project association exists, selection attempt-bound,
consumer-visible handles, selected-handle digest, governed pull invoked, attempt allowlist authorized, canonical
owner body digest, no bypass — classified `AVAILABLE → VISIBLE → PULLED → CONSUMED`.

History-only witness per H session: ordinary history exists, selected capital set empty, model-visible capital
index absent, no capital body in the prompt, no prohibited discovery. §17 records that **project history is not
leakage — it is the control condition.**

Cost per session: input/output/cached tokens, context-pull calls, body bytes delivered, tool calls, oracle
invocations, revisions, elapsed time. **No monetary cost is invented.**

---

# 7. Verdict rules, frozen before execution (§23/§24)

## `CAPITAL_UPTAKE`

```text
CLOSED   every C trajectory has at least one governed consumption event, AND the capital is consumed in the
         generations where its declared lesson is exposed
LIMITED  some consumption, but not in every trajectory or not in every exposed generation
ABSENT   no governed consumption anywhere
```

§23: content use is **never** inferred from task success.

## `TRAJECTORY_UTILITY`

```text
POSITIVE_SIGNAL  C cumulative PERR < H cumulative PERR in >=3 of 4 blocks
                 AND terminal diagnostic quality in C is not worse than H in >=3 of 4 blocks
                 AND governed consumption demonstrated in EVERY C trajectory
ADVERSE_SIGNAL   C PERR worse in >=3 of 4 blocks, or a similarly consistent adverse quality direction
MIXED            directional effects that satisfy neither stable criterion
NO_SIGNAL        no meaningful paired directional difference
```

**No p-values at n=4.** Cost is reported separately and **does not silently override** the PERR verdict. Full
solve is **not** the primary verdict.

---

# 8. §27 — no primary-fixture smoke

No G1/G2/G3 project worker may run before this plan commit. Plumbing checks use dummy fixtures only. An
accidental out-of-schedule generation is a protocol deviation and contributes **zero** to N. The runner refuses
to start unless the committed plan matches the schedule it would execute.

---

# 9. §2/§26/§28 — historical evidence immutability

A baseline of every protected `research-evidence/**` path **excluding** `research-evidence/r3-l0/**` is digested
at plan time: **309 files**, tree digest `6d850d7d5c39a4f8…`. After the experiment and regression the digests are
recomputed and equality is required. §28 is explicit that a mutation must be **RECORDED and not silently
restored**, so the guard reports the changed/added/removed paths and takes no repair action.
