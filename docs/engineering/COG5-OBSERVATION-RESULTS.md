# COG-5 — Observation Results (C5-A)

**Question:** what can the packaged product actually establish about read dependence, compatibility,
applicability and post-promotion change, and where does a positive proof remain out of reach?

**Answer:** the product can establish a **proven-complete whole-repository source read upper bound**, an
**observed path-level write footprint**, an **observed path-level source change set**, and honest
**UNAVAILABLE** non-source facets. It cannot establish an actual or narrower source read set, a source-scoped
enforcement boundary, out-of-repository inputs or network inputs. A source change therefore collides with the
whole-repository read by construction: the packaged face reports `INCOMPATIBLE` for both a genuinely affected
result and a provably unrelated one. The expert kernel separates them, but only with test-owned observations.

The one production correction in this phase is the **verified post-promotion change anchor**. It removes the
result's own accepted output from the "later external change" interval. After it, the promoted intake result
is `UNKNOWN` (insufficient non-source coverage) instead of the false `INCOMPATIBLE` self-collision.

**Evidence:** `research-evidence/cog5/runs/main/`, `runs/newsletter/`, `runs/outofscope/`,
`research-evidence/cog5/outcomes.json`.
**Model use:** none. The worker is a deterministic test port.

---

## 1. What is real, what is test-owned

| category | in this phase |
| --- | --- |
| **Product observation** | basis capture, currentness, the packaged `ResultContinuationService.inspect`, the first-party Git source-change observer, the conservative whole-repository read recorder, the issuer, admission |
| **Expert diagnostic** | the same D3 kernel driven with a test-owned precise read set and test-owned empty facet observations; labelled non-authoritative |
| **Test instrumentation** | the deterministic worker, the candidate snapshot and its digest, the exact read paths supplied to the expert |
| **Operator action** | the plan that created the intake task, the normal promotion calls, the reauthorization, the manual `step()` calls |
| **Model report** | none |

The deterministic worker is **not** a model and is **not** the DSH subprocess worker. It runs in-process as a
`WorkWorkerRunPort`. The host read fence described in §3 was characterized from the shipped code; it was not
exercised by this deterministic port.

---

## 2. What the product observes (A1)

### 2.1 The basis

The basis binds the source at repository granularity (the Git commit) and records the semantic projection
digest. It does not record individual read paths. Both real results captured the same source revision
`29a08cd4be9273008892696da1f0dac2731aee46`; the intake and technical attempts are distinguishable by task and
attempt identity.

### 2.2 The read premise

The packaged certificate records the read premise as:

```text
selectors = [ { domain: "source", scope: "repository" } ]
coverage  = PROVEN_COMPLETE / CONSERVATIVE_DOMAIN
observer  = world-materializer
```

That is honest and complete **for the source domain**. It is not an actual-read observation. A source change
to any path overlaps it, so it can never yield a disjointness proof against a source change.

### 2.3 The write premise

The write premise is the observed diff from the origin revision to the result commit, enumerated by a full
`git diff --name-only --no-renames`. This is an execution fact at path granularity and can be
`PROVEN_COMPLETE`.

### 2.4 The change premise

The source change is the first-party Git observer's full diff between two revisions, at path granularity with
`RUNTIME_OBSERVED` coverage. It answers "which paths moved between these revisions?" — not "who read them?"

### 2.5 The non-source facets

`projectSemantic`, `assets` and `environment` are recorded as `UNAVAILABLE`. No empty set is substituted. The
works' bases report `assets = NOT_REQUIRED` and `environment = NOT_REQUIRED` because their envelopes declare no
asset or environment dependency; that is knowledge about the work, not an observation of the world's asset or
environment changes. The assessor still requires change coverage for those domains, so a positive proof
remains incomplete.

### 2.6 `TaskEnvelope.read_paths` is a declaration and is factually wrong here

The reauthorized technical envelope carries `read_paths: ["src"]` (the trusted-default policy). The
deterministic worker actually reads `sources/brief.md`, `sources/vendor-capabilities.csv`, `sources/sites.md`
and `sources/prior-notes.md`. The declaration omits every real access and names a directory that does not
contain them. Nothing in the execution path enforces it. This is a measured demonstration, not a hypothetical:

```text
declared read set  ≠  actual read set
declared read set  ≠  enforced boundary
```

---

## 3. The execution environment: what is enforced

The shipped host does install a real read boundary, but its protected roots are:

- `<repository>/.palimpsest` — durable state, stores, worlds root;
- deployment-declared extra roots (`PALIMPSEST_WORKER_PROTECTED_ROOTS`);
- the DSH home — session and credential material.

The canonical source tree is **not** a protected root. The trusted-code guard allows "the execution world,
and anything under no protected root at all — the runtime, the toolchain and the package dependencies"
(`read_guard.js:103-107`). The kernel fence labels the protected roots for every process the model can start;
the tool guard denies content-returning calls aimed at them.

Consequences:

| question | answer |
| --- | --- |
| Is the worker confined to its execution world? | **No.** Its `cwd` is the world, but the source tree and arbitrary unprotected paths are readable. |
| Can a shell/helper read outside the recorded tools? | **Yes.** `bash`/`pwsh`/`run_code` are confined children for the protected roots, not for the source tree. |
| Is `read_paths` enforced? | **No.** It is schema + semantic digest only. |
| Is there an authoritative input manifest? | **No.** The context manifest enumerates delivered knowledge handles, not every file read. |
| Is there runtime file-access tracing? | **No.** The host observes process spawn/exit and session identity, not file opens. |
| Can network inputs enter? | The envelope policy is `deny` in this run, but the model has no complete input boundary when a policy permits network access. |

### 3.1 Strategy assay

| strategy | available? | evidence |
| --- | --- | --- |
| **A — existing authoritative input manifest** | **No** | No content-addressed input materialization exists for Work; the context manifest is not an input set; `required_artifacts` is output. |
| **B — enforced restricted execution world** | **No (for source)** | The fence protects `.palimpsest` and the DSH home, not the source tree. A narrower world would need a new sandbox/materialization mechanism, which §5.2 says to record and stop. |
| **C — trustworthy runtime observation** | **No** | No file-access observation; a general tracing framework is out of scope. |

No new sandbox, tracing framework or authority root was created.

---

## 4. The observation controls

The test-owned world contains the Sablewick programme, two real Work Results and two external candidates.

| control | packaged face | expert kernel | what it shows |
| --- | --- | --- | --- |
| **unchanged basis** | `EXACT` for both results before any change | `EXACT` for both | the basis still resolves identically |
| **genuinely used input changed** — `sources/vendor-capabilities.csv` | technical result `INCOMPATIBLE`; `rework: true` | technical `INCOMPATIBLE`; conflict on the vendor path | the result really depended on the changed file; the refusal is correct |
| **demonstrably unrelated input changed** — `sources/newsletter.md` (separate world) | technical `INCOMPATIBLE` | technical `COMPATIBLE` with test-owned facets; `UNKNOWN` with the semantic facet unavailable | the packaged whole-repository read conflates the unrelated change with a real dependency; the kernel can separate them |
| **accessible but not known to be used** | same `INCOMPATIBLE` as the used case | `COMPATIBLE` only with a test-owned precise read set | the product has no actual-read observation to justify the positive |
| **indirect read through a helper or shell** | not observed | not observed | **NOT EXERCISED**; no file-access tracing exists |
| **declared read set omits a real access** | `read_paths: ["src"]` while the worker read `sources/*` | expert used an accurate test-owned set | the declaration is not a boundary and can be wrong |
| **missing/failed read observation** | no first-party alternative; the source premise becomes `UNAVAILABLE` when the observer is absent (existing `lean_d5d` test) | `UNKNOWN` | an incomplete observation fails closed |
| **out-of-scope access under an enforced boundary** | the completion contract refuses an out-of-scope **write** (`OUT_OF_SCOPE`) | n/a | the write scope is enforced at settlement; the **read** fence was not exercised by the in-process worker |
| **changed authoritative input manifest** | no input manifest exists | n/a | **NOT EXERCISED** |
| **fully unchanged basis** | `EXACT` | `EXACT` | baseline control |

The newsletter control is the central A2 evidence:

- packaged: `INCOMPATIBLE`;
- expert with the precise technical read set and test-owned facets: `COMPATIBLE`;
- expert with the semantic facet unavailable: `UNKNOWN`.

The expert's positive proof is produced from a test-owned `CONSERVATIVE_DOMAIN` observer over the declared
paths and test-owned empty asset/environment/semantic observations. It is a kernel diagnostic, not a
production authority, and admission does not promote.

---

## 5. The four outcomes, and the post-promotion correction (A4)

### 5.1 Pre-fix self-collision

Before the correction, a promoted result's "change" interval was `origin → current`. That interval contains
the result's own accepted output. For the intake result (which writes
`sources/vendor-capabilities.csv` and reads it), the expert diagnostic over the origin interval produces
exactly two conflicts:

- `read_invalidation` on `sources/vendor-capabilities.csv`;
- `write_collision` on `sources/vendor-capabilities.csv`.

Admission: `CONFLICT`. The packaged face reported the same `INCOMPATIBLE`. That is the defect: the result was
being invalidated by its own output.

### 5.2 The correction

`resolvePromotionBaseline()` selects the baseline only after Git proves:

```text
resultCommit  ⊆  resultingHeadCommit  ⊆  currentSourceRevision
expectedHeadCommit  ⊆  resultingHeadCommit
```

The facts are read from the committed `PROMOTION_COMMITTED` record; the result commit is **not** assumed to
be the resulting head. In the run:

```text
result commit        9e9c89474bf4f8f7c3715b7a730e6b0be5761efd
expected head        29a08cd4be9273008892696da1f0dac2731aee46
accepted head        365c830126744bf66fc1528b94a85ead500a7c09
selected baseline    365c830126744bf66fc1528b94a85ead500a7c09
```

The ancestry probe returned `PROVEN` for all three required relations. The baseline is the accepted head, not
the result commit and not the origin.

### 5.3 After the correction

| case | packaged | expert |
| --- | --- | --- |
| promoted intake, no later external change | **`UNKNOWN`** — the only gap is `change_coverage` (the project-semantic domain is unobserved) | `COMPATIBLE` with test-owned facets; `UNKNOWN` with the semantic facet unavailable |
| unpromoted technical after the intake | `INCOMPATIBLE` | `INCOMPATIBLE` (real conflict) |
| unpromoted technical after the newsletter | `INCOMPATIBLE` (whole-repository overlap) | `COMPATIBLE` / `UNKNOWN` |
| unchanged basis | `EXACT` | `EXACT` |

The packaged post-promotion result is no longer a false conflict. It is an honest `UNKNOWN`: the product knows
the source change interval is empty at the accepted head, but it cannot establish the non-source change
domains.

The packaged face still never produces `COMPATIBLE` for a changed source world. That is the preserved C5-A
limitation, not a regression.

---

## 6. A1–A5 verdicts

| item | verdict | detail |
| --- | --- | --- |
| **A1 — Observation completeness** | **PARTIAL** | proven-complete whole-repository source read upper bound; observed writes and source changes; honest facet unavailability. No actual read set, narrower source boundary, out-of-repository input or network input. |
| **A2 — Compatibility interpretation** | **PARTIAL** | a source overlap is a proven set relation but a conservative possible dependency. The packaged outcome is `INCOMPATIBLE`; the packaged inspection does not expose the conflict witness/basis, so a reader cannot tell possible interference from a demonstrated dependency. The expert can. |
| **A3 — Non-source facets** | **ESTABLISHED** | `UNAVAILABLE` is preserved; no empty-set substitution. The basis's `NOT_REQUIRED` is not used to exempt the change domain; that remains a semantic refinement for owner review. |
| **A4 — Post-promotion applicability** | **ESTABLISHED** | verified lineage selects the accepted head; the result's own output is not a later external change; unproven lineage becomes `UNAVAILABLE`/`UNKNOWN`, never a fallback. |
| **A5 — Authority integrity** | **ESTABLISHED** | the packaged positive proof is none; the expert positive uses labelled test-owned observations and admission does not promote. The issuer recalls durable observation refs; no hand-built premise was accepted. |

### Gate C5-G1

**ESTABLISHED.** The product accurately states what it knows about read coverage (whole repository,
conservative, by construction) and no incomplete or declared-only footprint generates a positive
compatibility. The coverage is coarse; that is the policy, not a false claim.

### Gate C5-G2

**PARTIAL.** The product distinguishes a supported conflict, unproven coverage and the post-promotion
question, but it cannot present the difference between a conservative possible interference and a
demonstrated dependency, and the packaged face cannot produce proven disjointness. The expert kernel can; the
production observer cannot acquire its premises.

---

## 7. What this means for the product

1. **Do not weaken the read policy to make this test pass.** The whole-repository read is the only honest
   first-party bound; a declared narrower set would be a silent false-positive risk.
2. **The post-promotion correction is safely bounded.** It changes an observed interval, not the proof rules;
   it removes a false conflict and lands on `UNKNOWN`.
3. **The next real observation improvement** is either an enforced source-scoped input boundary or a
   first-party actual-read observation. Both are new capability decisions, not a composition tweak.
4. **A diagnostic presentation of the conflict's basis** would materially improve A2 without granting reuse;
   it is not implemented in COG-5 and is recorded as the smallest next presentation seam.
