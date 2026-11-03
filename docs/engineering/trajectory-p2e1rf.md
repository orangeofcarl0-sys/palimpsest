# Trajectory-P2-E1RF — Final Security & Measurement Closure

**Stage:** `Trajectory-P2-E1RF`
**Parent:** `2c3fbc60b1b8688ec067202256be65308c5e5cff` on `trajectory-p2e1re-pretool-win32-qualification`
**Branch:** `trajectory-p2e1rf-final-security-evidence-closure`
**Code Freeze:** `b4d904b444df5f03ea3ad7471d5ed08f27ea3381` (tree `705f50ffba2f5b64be76865fc3db63680c99523d`)

---

## A. Final verdicts

| Verdict | Result |
|---|---|
| `E1RF_A_DELEGATION_PATH_IDENTITY_QUALIFIED` | **QUALIFIED** |
| `E1RF_B_ANSWER_PROVENANCE_QUALIFIED` | **QUALIFIED** |
| `E1RF_C_WIN32_MALFORMED_ACE_PRESERVATION_QUALIFIED` | **QUALIFIED** |
| `E1RF_D_EVIDENCE_FRESHNESS_QUALIFIED` | **QUALIFIED** |
| `E1RF_RUNTIME_EXIT_TRAJECTORY_MEASUREMENT_INFRASTRUCTURE_QUALIFIED` | **QUALIFIED** |

**Scope of the runtime-exit verdict.** Node `24.22.0`, `win32`/`x64`, DSH `0.2.1-rc.2`, `dsh-win32-process@0.2.1-rc.2`, `koffi@3.1.1`. The verdict is **explicitly scoped to this tested runtime**. It is not a claim about any future DSH release: the CWD semantics, the pre-step instruction-discovery ordering and the Win32 binding seam were qualified against `0.2.1-rc.2` only.

**Withheld, and why.** `MODEL_CONSUMED_CAPSULE`, `BENCHMARK_QUALIFIED`, `TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED`, `UTILITY_POSITIVE_SIGNAL`, `UTILITY_NEGATIVE_SIGNAL`, `WORK_UTILITY_IMPROVED`, `AGENT_COOPERATION_IMPROVED` and `CONTROL_BASELINE_TECHNICALLY_READY` all remain **NOT_ESTABLISHED**. A deterministic adapter emitting a correct answer is transport evidence, not evidence of model reasoning or utility. No stochastic trial and no external model request occurred in this stage.

---

## B. The four defects, reproduced before correction

`scripts/trajectory_p2e1rf/reproduce-defects.mjs` calls the shipped functions against test-owned fixtures. Its committed output at the parent commit (`rf0-defect-reproduction.json`) and its re-run at the Code Freeze (`rf0-post-correction.json`) are the same script over the same fixtures — the pair is the before/after.

### D1 — Delegation path identity (RF-A)

- **Source:** `host/deployment/runtime/cwd_fence.js` :: `createDelegationCwdGuard()`
- **Baseline:** `world/alias-to-world`, a junction whose **current target is the world**, was **ADMITTED**. The guard decided from `realpath()`, and the junction canonicalizes to the world.
- **Impact:** a link is a mutable indirection. A child approved through it can be re-pointed afterwards, and the child's `agent/pre-step` instruction discovery would then traverse a tree the guard never examined.
- **Class:** `DYNAMIC_UNIT_VERIFIED` (the shipped function was called and its output recorded).

### D2 — Answer digest (RF-B)

- **Source:** `scripts/trajectory_p2e1rc/closure-gate.mjs` :: `armReceipt().answerDigest`; `scripts/trajectory_p2e1r/assay-harness.mjs` :: `record("answerExtraction", …)`
- **Baseline:** the gate hashed `payload.answerExtraction?.answer ?? null`, but the harness recorded only `ok`, `assistantMessageCount`, `bytes` and `seq`. Both arms therefore recorded `sha256-74234e98…b90b` — SHA-256 of the literal string `"null"`.
- **Impact:** the receipt identified no answer. Two different answers, and an absent answer, hashed identically.
- **Class:** `DYNAMIC_UNIT_VERIFIED`.

### D3 — Malformed mandatory ACE (RF-C)

- **Source:** `host/deployment/runtime/win32_label.js` :: `parseLabelAcl()` / `planLabel()`
- **Baseline:** an ACE whose 32-bit policy-mask read failed yielded `NaN`, which no bound check caught. The parser returned `present: true, readable: true`, and `planLabel()` computed `NaN | NO_READ_UP` = `2`. An invalid field silently became zero through bitwise coercion, so **every policy bit the object actually carried would be discarded on write**.
- **Class:** `DYNAMIC_UNIT_VERIFIED`.

### D4 — Evidence freshness (RF-D)

- **Source:** `scripts/trajectory_p2e1re/generate-evidence.mjs`
- **Baseline:** R1-HR/R1-HC reports were read from a **fixed user-wide path** (`~/.palimpsest-r1hr/…`), a prior falsifier file was reused, and nothing bound either input to the Code Freeze. `outcomes()` also mapped `pass === true` to `"PASS"` even when `limit === true`, recording a disclosed LIMIT as a successful assertion.
- **Class:** `SOURCE_DEMONSTRATED` — a static property of the generator, **not** presented as a live exploit. The dynamic falsifiers (§G) exercise the new admission code.

---

## C. RF-A — delegation path identity

### The correction

The order is now:

1. **Reparse scan over the path as spelled.** Every component the model named is inspected with `lstat`, including components that lexical normalization would erase — `world/link/..` normalizes to the world but names a link in transit.
2. **Lexical identity with the world is the decision.** `sameDirectory(resolve(...), world)`, case-folded on win32 because NTFS is.
3. **Canonical agreement is a consistency check**, not the decision. If the world itself cannot be canonicalized, or the spelling and the object disagree, the call is refused.

**Why this has no race.** Step 2 compares a committed spelling against a fixed string. Link retargeting cannot change that comparison, so there is no check/use window in which a different answer could be produced. E1RE's guard decided from the target; that value is exactly what an attacker can change.

**Why equality, not containment.** A child in `world/nested` would resolve `../../durable-state/AGENTS.md` against a different ancestor chain, and a sibling world is a disclosed residual that containment would admit.

### The surface audit (§4.6)

The enforced name set is now **derived from the classification table**: every `DELEGATED_SURFACE`, plus the declared minimum `subagent` / `subagent_fork`.

The audit found that **DSH `0.2.1-rc.2` does not register `subagent_fork` at all**. `dsh-tool-subagent` registers exactly one name (`subagent`, with a configurable `toolName`), and no shipped package defines a `subagent_fork` tool. The E1RE entry was harmless but described a surface that does not exist — which is the characteristic failure of a hardcoded list: an absent name reads as coverage while providing none. `subagent_fork` stays in the declared minimum for a release that does ship it.

`workflow` and `job_output` are `DELEGATED_SURFACE` and are covered by the guard by class; neither exposes a child `cwd`, so they pass through untouched (the guard's `requested === undefined` branch admits without inspecting). A future `subagent_*` provider is covered without a code change.

### Real first-party DSH confirmation

`scripts/trajectory_p2e1rf/run-delegation-matrix.mjs` drives one real DSH process per case, each with its own test-owned root, and reads every persisted Session back through official DSH persistence.

| Case | Verdict | Child session | Token delivered |
|---|---|---|---|
| `aliasToWorld` | REFUSED_BY_GUARD | no | no |
| `aliasToProtected` | REFUSED_BY_GUARD | no | no |
| `world` | ALLOWED_NO_DELIVERY | **yes (2 sessions)** | no |
| `sibling` | REFUSED_BY_GUARD | no | no |
| `protected` | REFUSED_BY_GUARD | no | no |
| `parentOfProtected` | REFUSED_BY_GUARD | no | no |
| `traversal` | REFUSED_BY_GUARD | no | no |
| `production` | ALLOWED_NO_DELIVERY | **yes (2 sessions)** | no |

8/8 matched, zero leaks, zero refused cases with a child session, zero cleanup failures, zero fixture limits.

**The ordering claim.** A refused case creates **no child session** — the refusal happens on the parent's dispatch, before `startActivation()`. The two legitimate cases genuinely create a second session, so the matrix is not simply observing a worker that fails everything. §4.5's warning is respected: the observation is the Session events, not the worker exit code.

### What remains unproved

A direct alias-retargeting **race** was not reproduced, and is not claimed. The structural argument is stronger than a race demonstration: the decision no longer depends on the link's target, so there is nothing for retargeting to change. What is *not* established is that DSH's own downstream resolution never re-traverses a link after the guard has run — that would require instrumenting `ctx.fs`, which is outside this stage's scope.

---

## D. RF-B — answer provenance

The harness now computes the digest at the one point where the persisted text exists:

```js
const rawText = typeof extraction.rawText === "string" ? extraction.rawText : null;
const persistedExtractedAnswerDigest = rawText === null ? null
  : `sha256-${createHash("sha256").update(Buffer.from(rawText, "utf8")).digest("hex")}`;
```

Two digests are recorded and **named as different kinds of evidence**:

- `persistedExtractedAnswerDigest` — an **execution observation**, over the UTF-8 bytes of `extraction.rawText`.
- `emittedExpectedAnswerDigest` — **test configuration**, over the answer the deterministic adapter was told to emit.

The gate consumes the observed value and rejects `NULL_PAYLOAD_DIGEST` by identity, not by shape: a well-formed digest of the wrong bytes is still rejected by the byte-identity requirement.

### Observed at the Code Freeze

| | CONTROL | TREATMENT |
|---|---|---|
| Trial | `ASSAY-control-attempt-…` | `ASSAY-treatment-attempt-…` |
| DSH Session | `worker-80bb8fdf-…` | `worker-b49b0f17-…` |
| Assistant message seq | 22 | 20 |
| Raw answer bytes | 721 | 721 |
| **Raw answer SHA-256** | `sha256-40b257ba…4725` | `sha256-2e11675c…a88b` |
| Frozen truth digest | `sha256-ee7d502b…` | `sha256-601d6c86…` |
| Oracle version | `p2e1rd-internal-citation-closed-1` | same |
| Oracle verdict | ok | ok |
| Worker outcome | `READY_FOR_SETTLEMENT` | `READY_FOR_SETTLEMENT` |

The digests are distinct, and each identifies the bytes that were read and scored. The `"null"` digest appears nowhere.

**Work authority is unchanged.** The benchmark answer remains assistant text; the Worker Result remains a non-authoritative lifecycle statement; `palimpsest_worker_result` was not widened to carry answer JSON. A deterministic `READY_FOR_SETTLEMENT` grants no settlement authority.

---

## E. RF-C — malformed mandatory ACE

`parseLabelAcl()` now validates every field it decodes: `AclSize`, `AceCount`, `AceType`, `AceFlags`, `AceSize`, `policyMask`, `SidRevision`, `SubAuthorityCount`, `SidLength` (against the declared ACE size), `IdentifierAuthority` and `IntegrityRid`.

A failure reports `present: false, readable: false, unreadableField: <name>` — which is what `ensureRoot()`, `verifyTree()` and `snapshotLabels()` already treat as UNKNOWN. **No caller needed a new branch**, so an unverified label is refused rather than overwritten.

`planLabel()` was additionally hardened: a non-integer field now contributes nothing rather than being bitwise-coerced. That is the last line of defence for a caller that bypasses the parser.

The three-way distinction is preserved:

- **absent** — `present: false, readable: true`: the descriptor WAS read and carried no mandatory ACE.
- **unverified** — `present: false, readable: false`: the descriptor was read but its mandatory identity could not be decoded.
- **verified** — `present: true, readable: true`.

A structurally plausible but **unknown RID** stays readable and is never lowered — refusing it would refuse every future Windows integrity level.

### The decisive observation

For malformed input the stub records **zero** `setNamedSecurityInfoW`, `addMandatoryAce` and `initializeAcl` calls. "An unknown policy is never overwritten" is therefore an observation, not a reading of the code.

### Suites

| Suite | PASS | LIMIT | FAIL | Admission |
|---|---|---|---|---|
| R1-HR | 44 | 3 | 0 | admitted |
| R1-HC | 26 | 1 | 0 | admitted |

LIMIT rows are listed **as limits**, with their statements. They are not counted as PASS.

---

## F. RF-D — evidence freshness

`scripts/trajectory_p2e1rf/evidence-admission.mjs` binds each artifact to `executedCodeHead`, `executedCodeTree`, `command`, `exitCode`, `runtimeNode`, `dshIdentity`, `selection` and `runId`. A timestamp is recorded for a human reader and is **never** used as a freshness proof.

It refuses: a missing report, an unparseable report, a stale Code HEAD, a drifted DSH, a mismatched runtime, another run's result, a tampered digest, a success-shaped body from a nonzero exit, an empty check collection, and a row/tally disagreement.

`classifyCheck()` reads `limit` **before** `pass`. Duplicate check ids are preserved and reported — the real R1-HR report contains two `HR-25` rows with different statements, and deduplicating by id would silently lose an assertion. The stable identity is `Suite + Ordinal + ID + Statement`.

### The generator

Every suite runs into a rig **this invocation creates**, under the OS temp root, and the rig is removed by name afterwards. Two properties are load-bearing and were both measured:

- The rig must be **outside the repository**. Inside it, the fixture inherits the real repository's `.palimpsest` and 20 assertions fail — the suite is being given the wrong world, not observing a regression.
- `--rig` is parsed as `--rig=<path>`. A space-separated value is silently ignored and the suite falls back to the user-wide default, which would reintroduce exactly the fixed-path weakness this stage removes.

---

## G. Evidence integrity

All five authoritative inputs were admitted in the same run (`runId 0e20b718-…`):

| Input | Admitted |
|---|---|
| focused suites (vitest JSON) | yes |
| R1-HR conformance | yes |
| R1-HC conformance | yes |
| evidence falsifiers | yes |
| delegation matrix | yes |

11 dynamic falsifiers refuse, each with a positive control so a function that refused everything could not pass:

stale Code HEAD · missing report · DSH version mismatch · tampered digest · another run's result · LIMIT relabelled PASS · success-shaped body with nonzero exit · absent answer digest · duplicate check id · empty result collection · tally disagreement.

**Historical transcription limit.** E1RE's `beforeFix` observations remain a transcription of earlier local runs. The original logs are **not available to this stage**, so they cannot be bound by digest and are not presented as dynamically re-executed. No vulnerable configuration was re-run against personal data to obtain a better-looking chain.

---

## H. Final acceptance

| Check | Result |
|---|---|
| `pnpm run build` | PASS |
| `pnpm run architecture:check` | PASS (0 violations, 9 accepted baseline exceptions) |
| `pnpm run architecture:check-public-api` | PASS (0 missing, 0 changed kind, 0 added) |
| Focused suites (7 files) | **118/118** |
| R1-HR conformance | 44 PASS · 3 LIMIT · 0 FAIL |
| R1-HC conformance | 26 PASS · 1 LIMIT · 0 FAIL |
| Real DSH delegation matrix | 8/8 matched, 0 leaks |
| Closure gate | **61/61, exit 0**, `CLOSURE_ESTABLISHED` |
| Protected evidence trees | 52/52 byte-identical |
| External model requests | 0 (`modelCallsMade: 0`) |

**Excluded test:** `test/r3l0ciarlcf_gates.test.ts` — known unsafe against a shared working tree. The exclusion predates this stage and is unchanged.

---

## I. Residual risks

**Active known risks** — none newly introduced. The four corrected defects are closed with negative controls.

**Disclosed security limitations** (carried forward verbatim, not resolved):

- **HC-27** — parallel ACTIVE confidential workers are unsupported; the profile serializes them.
- **HR-39b** — concurrently ACTIVE worlds are not isolated from each other's raw code.
- **HR-33** — sibling world NAMES are enumerable because the worlds parent is an ancestor of the world.
- **HR-17** — the pre-existing symlink fixture cannot be built on this host; the junction fixture exercises the same reparse mechanism.

**Untested capability** — a direct alias-retargeting race, as described in §C.

**Historical evidence limitation** — E1RE's transcribed `beforeFix` rows, as described in §G.

**Hypothesis** — that the corrected guard is sufficient for a *stochastic* model, which could attempt aliasing, traversal and delegation in combinations no deterministic adapter produces. This stage does not test that.

---

## J. E2 handoff

A provider-independent candidate protocol is at `docs/engineering/trajectory-p2e2-control-protocol-draft.md`. It is a **candidate**, not an authorized or executed experiment.

Inputs still requiring separate authorization before any CONTROL trial can run: provider identity, exact model version, cost budget, external-model authorization, and a frozen evaluation criteria set.

`CONTROL_BASELINE_TECHNICALLY_READY` remains **NOT_ESTABLISHED** because a protocol draft is not a frozen experiment specification and no authorization exists.
