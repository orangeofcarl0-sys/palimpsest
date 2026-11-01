# COG-4.1 — Cross-Basis Work Result Results

**Question:** can an actual, product-generated Work Result retain the correct applicability and safe
continuation semantics after project reality changes?

**Answer:** **a genuine `ATTEMPT_RESULT` is produced, inspected and promoted; the expert D3 kernel
distinguishes `EXACT`, `COMPATIBLE`, `INCOMPATIBLE` and `UNKNOWN` from real observations; the packaged
continuation face distinguishes only `EXACT` and `INCOMPATIBLE`, because its first-party read footprint is
the whole repository. A governed rework is identified and its permit minted, but the D2 execution refuses
with `HEAD_BASIS_MISMATCH` when the external source update has moved the live head ahead of the canonical
project head.**

**G1 ESTABLISHED. G2 PARTIAL.** The mechanism is real; the normal product face is incomplete.

---

## 1. The work results

The deterministic, test-owned worker is **not a model**. It reads the declared sources, writes one
deliverable and commits; the real Work lifecycle observes, validates, records evidence and settles.

| item | technical-fit | cost-schedule |
| --- | --- | --- |
| attempt | `attempt-d16532bd0851cae20310d8e0ad0fb9f4` | `attempt-baaf963c5b6bd004409fcfe013219440` |
| result commit | `4f0eec5781fe47716bba6deb5f8eb10d635fabb7` | `fcc199899414c586485628f3a6d3149bc029df75` |
| basis | source-bound at seed `5f6002d79b9f269c5293b294b79da9d58d725913` | same seed |
| completion evidence | `write_scope_valid`, `expected_files_exist` | same |
| deterministic output | A: V1, B: V3, C: V2 | £77,400–£108,600 committed; 8% contingency; A/B/C sequence |
| canonical endpoint | `TASK_VERIFYING`, later reopened to `TASK_READY` | `TASK_VERIFYING`, then promoted to `TASK_SATISFIED` |

The completion contract narrowed the standard's `node verify.mjs` clause out because both write scopes are
documentation/data paths. That is the declared applicability rule, not a fabricated pass. The recorded
evidence is scope + artifacts, and the deterministic deliverables pass the test-owned `verify.mjs` shape
when it is run directly.

---

## 2. The four outcomes

The audit targets were applied to the real repository with an explicit staged-path allowlist:

| update | path | head |
| --- | --- | --- |
| 2026-02-10 vendor revision | `sources/vendor-capabilities.csv` (V3 minimum -10 °C → 0 °C) | `31cfc2515203d6195f8f20273f06083ef513b620` |
| 2026-02-12 newsletter | `sources/newsletter.md` | `99726194019d555589f3014ac046bb822d2503cb` |

The packaged service and the expert kernel were both asked about the same results.

| case | packaged `inspect` | expert kernel | what the observations support |
| --- | --- | --- | --- |
| **EXACT** | `EXACT` for both, before any change | `EXACT` for both | basis still holds; no divergence |
| **COMPATIBLE** (unrelated change) | **not reached** — `INCOMPATIBLE` for both after the vendor and newsletter updates | `COMPATIBLE` for cost-schedule's external changes since its own result; 8 disjointness proofs; admission `ADMITTED` | the cost result reads pricing/windows, not the vendor file; the newsletter is disjoint |
| **INCOMPATIBLE** (real conflict) | `INCOMPATIBLE` for technical-fit after the vendor update | `INCOMPATIBLE` for technical-fit; conflict on `sources/vendor-capabilities.csv` | the changed file is in the technical result's read set |
| **UNKNOWN** (insufficient observation) | **not reached** — a promoted result's own output is in the origin-to-current diff, so a write collision outranks the unknown | `UNKNOWN` for technical-fit when the projectSemantic premise is unavailable; no conflict, `change_coverage` gaps; admission `INSUFFICIENT_PROOF` | no first-party observer exists for the project semantic change domain |

The packaged face's `INCOMPATIBLE` for the cost-schedule after the vendor update is a **conservative
overlap**, not a semantic conflict: its `wholeRepositoryRead()` selector overlaps any source path. The
packaged face therefore cannot distinguish the technical result (genuinely affected) from the cost result
(provably unaffected by the changed vendor file). That is the central H4-R finding.

The expert `COMPATIBLE` certificate uses a test-owned instrumented read set (the deterministic worker's
actual reads recorded through a registered `CONSERVATIVE_DOMAIN` observer). It is a kernel diagnostic, not
the packaged first-party footprint. A normal production caller cannot obtain that narrower coverage from
the current Work path.

---

## 3. Normal promotion

The cost-schedule result was promoted through the operator path:

- `PROMOTION_COMMITTED` `promotion-09839e1c4ec5124fa819bace5a8ca836`, resulting head
  `95b395b974ab8482f2904c12acabbf0c41aca3a1`;
- `TASK_SATISFIED`;
- the deliverable is materialized in the canonical working tree;
- a duplicate `promote` call returned the **same** terminal event; promotion is idempotent at the attempt
  identity.

The technical result was not promoted. It remains the only completed candidate for its task and was
reopened by the governed rework.

The project head did not advance immediately: `reconcileProjectHead` was **blocked by quiescence** while
the technical-fit task was `VERIFYING`. After the rework reopened that task to `READY`, reconciliation
reported `in_sync` and advanced the canonical head to the promotion effect `95b395b`. The live repository
was at `9972619` (the external updates), so the canonical head remained **behind** the observed world.

---

## 4. The governed rework and the exact refusal

After the vendor update, the packaged inspection of technical-fit was `INCOMPATIBLE` with
`availableActions.rework = true`. The service:

1. re-observed the target;
2. minted the `ReworkAdmissionPermit` itself (the driver supplied no authority-bearing field);
3. appended the governed `TASK_READY` (event 26) with `rework_provenance` naming the origin attempt,
   origin basis, target observation, envelope and `reason: INCOMPATIBLE`;
4. started the D2-d job `wdj-acb0a785-53a2-4634-a801-b4eb31771f99`.

The job then returned `HOST_ERROR`:

```text
HEAD_BASIS_MISMATCH: the repository is at 99726194019d, the project head at 95b395b974ab,
the proven effect head at 95b395b974ab and the task's base at 95b395b974ab — a worker's world
must start where its envelope says the work starts
```

The task is `READY`; no new attempt was created. This is the **honest** endpoint: the continuation target
is the live external world, while the execution base is the canonical head. The product refused rather
than starting a worker on a basis it does not consider current.

`reconcileProjectHead` after the reopen returned `in_sync` at `95b395b`; it did **not** adopt the ambient
`9972619`. There is no authorized path in this run from the external update to the execution base.

---

## 5. Legal continuation actions actually exercised

| action | result |
| --- | --- |
| reuse on the original basis | `EXACT` holds for both before any change; no carrying was needed; the cost result was promoted |
| rematerialize onto the target | **REFUSED** for the INCOMPATIBLE technical result; the packaged face never offered it |
| reverify | not exercised as a separate action; promotion used the completion evidence already recorded |
| rework on the current basis | **identified and authorized**: permit minted, task reopened; **execution refused** at `HEAD_BASIS_MISMATCH` |
| obtain more evidence | `UNKNOWN` reports `moreCouldHelp = true` and names the `change_coverage` gaps; no action was executed |
| refuse unsupported action | `startRework` on the promoted cost result refused (`SATISFIED`, not `VERIFYING`); stale inspection refused with zero events |

The highest reachable lifecycle state is therefore:

- cost-schedule: **`TASK_SATISFIED`** after normal promotion;
- technical-fit: **`TASK_READY`** after the governed reopening, with no current-basis result.

---

## 6. Negative controls

- **Duplicate promotion** returned the same terminal `PROMOTION_COMMITTED` event; no second effect.
- **Stale inspection** returned `STALE_INSPECTION` and added **zero** events.
- **Rematerialize on INCOMPATIBLE** refused with the conflict reason.
- **Unknown result identity** returned `resolved: false` with no action.
- **Rework on a promoted result** refused because the task is `SATISFIED`.
- **Changed digest alone** was not treated as semantic incompatibility: the expert kernel proved
  disjointness for the unrelated newsletter change.
- **Missing observation** produced `UNKNOWN`, not `COMPATIBLE`.
- **Cross-basis admission** `ADMITTED` did not promote anything or move the project head.
- **Normal host Project Intent** has no admission authority; no `PROJECT_REVISED` was fabricated.
- Existing suites additionally cover a hand-built certificate (`UNTRUSTED_PROOF`), a certificate for
  another target (`STALE_PROOF`), a **missing observation** (`INSUFFICIENT_PROOF`), and a direct
  `TASK_READY` without a permit (refused); the targeted run passed 244 tests.

---

## 7. C4-G1 and C4-G2 verdicts

**C4-G1 — Genuine governed Work Result: ESTABLISHED.** Two real `ATTEMPT_RESULT`s exist through the
existing Work mechanism, each with a captured basis, result commit, observed changed files, recorded
evidence and a canonical Work state. One reached normal promotion.

**C4-G2 — Cross-basis correctness: PARTIAL.** Currentness and compatibility are based on actual source,
result and target observations; no positive compatibility was fabricated. The expert kernel distinguishes
all four outcomes. The packaged face cannot produce `COMPATIBLE` for a source change and cannot produce a
clean `UNKNOWN` for a promoted result, because of its whole-repository read and origin-to-current change
scope. The exact observation/coverage limitation is recorded in §2 and §4. A positive `COMPATIBLE` certificate
exists only in the expert diagnostic with a test-owned instrumented read set; it is not the normal packaged
path.
