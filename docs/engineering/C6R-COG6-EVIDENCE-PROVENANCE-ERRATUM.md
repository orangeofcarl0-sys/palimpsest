# C6-R0 — COG-6 Evidence Provenance Erratum

**Status:** forward-only correction. This document does not edit, replace, re-hash or re-freeze any
COG-6 artifact.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Incoming baseline:** `d1a05a7bfc145258efa34c2710998db04680d266` / tree
`e96cec6318bb35639e7083b222b811b8b2f59b11` (COG-6 Evidence Manifest Addendum)
**COG-6 Code Freeze:** `c10af086896abc139110eea041fdaccd19135590`
**COG-6 Evidence Freeze:** `967d176a7b504522ab785f0ba1a9d682bb4e068a`
**Audit:** `research-evidence/c6r/provenance/cog6-audit.json`
**Reproduction:** `node scripts/c6r/audit_cog6_provenance.mjs --world=<preserved world> --extractor=<extractor>`

---

## 1. The ambiguous field

| item | value |
| --- | --- |
| field | `mechanism.rubric.acceptedCapabilitiesDigest` |
| file | `research-evidence/cog6/outcomes.json` |
| value | `14ffdd6525d292f33e86f568d9ecfd8fc5dfe47019e1bfaa76bb055ffc07bc91` |
| what that digest is | **Candidate B** — the 2026-02-14 corrected bulletin (`inbox/2026-02-14/vendor-capabilities-corrected.csv`) |
| what it is named as | the capability data the domain rubric accepted/evaluated |
| present in `runs/main/rubric.json`? | **No.** The rubric record contains `checks`, `failed`, `siteBVendors`, `deliverable`, `requirementR3`, `taskState`, `result` — no source digest field. |

The name is wrong, and the wrongness is structural: the field sits under `mechanism.rubric`, so a
reader reasonably concludes the rubric observed Candidate B. It did not.

## 2. Where the value actually came from

COG-6's evidence extractor lives outside the repository at
`F:\Codex_Work_Space\Palimpsest\.cog6-rig\make_cog6_evidence.mjs`. Line 181 is:

```js
acceptedCapabilitiesDigest: sha(join(RUNS, "main", "files", "sources", "vendor-capabilities.csv")),
```

`runs/main/files/**` is the **final** working-tree snapshot. `writeRunArtifacts` in
`scripts/cog6/run_cog6.mjs` captures it at the end of `runMain`, which is **after** the direct
Candidate B negative control. The preserved file's SHA-256 is recomputed by the audit as
`14ffdd65…`, i.e. Candidate B.

So the field is: *the digest of the final post-control snapshot*, not *the source the rubric
evaluated*. The extractor reused a convenient ambient file for an identity claim it could not support.

## 3. What the domain rubric actually evaluated

### 3.1 Timing

The rubric was assigned directly (`record.rubric = await domainRubric(...)`), not wrapped in
`recorder.capture`, so it has no timestamp of its own. The surrounding captured steps bound it:

| step | time (UTC) |
| --- | --- |
| `rework:finalTask` | `2026-11-01T14:25:56.339Z` |
| **rubric (uncaptured, between these)** | **≈ `14:25:56.34Z`–`14:25:56.44Z`** |
| `control:plan:postControl` | `2026-11-01T14:25:56.438Z` |
| `control:directExternalCommit` | `2026-11-01T14:25:56.473Z` |

**The rubric ran before the direct Candidate B control.** At that moment the live Git head was
`22796231660d7915c561a34445aecbd7f1900159` (the rework promotion), and the project head was the
same. There was no Candidate B in the world yet.

### 3.2 What it read

`domainRubric` (`scripts/cog6/rig6.mjs:730-762`) calls `readCapabilities(workDir)`, which reads
`<world>/sources/vendor-capabilities.csv` from the **ambient working tree**. It did not read a
committed blob, did not name a head, and did not record either.

At `2279623`, the committed blob is Candidate A (verified: `0e997cbc…` at both the accepted intake
head `55370b0f…` and the final project head). The working tree renders that blob with
`core.autocrlf=true`, so the ambient digest differs from the blob digest (`620c334d…` measured
immediately after the intake) without differing in content. That rendering is what the rubric read.

### 3.3 The rubric's own output proves it did not read B

Candidate B changes V4 to `coastal_warranty = yes`, and V4's minimum is `-20 °C`. Under B, V4
**satisfies Site B** (`min ≤ -4` and coastal). The rubric recorded:

```json
"siteBVendors": [],
"noVendorSatisfiesSiteB": true
```

A rubric that had read B would have recorded `["V4"]` and `false`. This is a mechanical
contradiction, not an interpretation: **the recorded result is only producible from A-era data.**
The audit computes both sides of that contradiction
(`rubricEvaluation.mechanicalContradiction`).

### 3.4 What the rubric did not record

- no observed head;
- no committed blob digest;
- no evaluation time;
- no explicit result subject (the attempt id was an input, but the record does not state which
  promotion/head the evaluation belongs to);
- no distinction between the ambient working tree and the canonical blob.

The finding itself was correct for A. The record could not prove it.

## 4. The two identities, kept separate

| identity | value | where it legitimately appears |
| --- | --- | --- |
| **Accepted source** — Candidate A | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` | `mechanism.intake.acceptedBlobDigest`; `scenario.acceptedCapabilities.committedBlobDigest`; `worktree.log` commit `16d30de`; accepted intake head `55370b0f…`; final project head `2279623…` |
| **Negative-control source** — Candidate B | `14ffdd6525d292f33e86f568d9ecfd8fc5dfe47019e1bfaa76bb055ffc07bc91` | `controls.directExternalCommit.commit.digestAfter`; final live head `caa5434…`; `worktree.json` final file snapshot; **and, incorrectly, `mechanism.rubric.acceptedCapabilitiesDigest`** |

The accepted intake head is `55370b0f5bd7740aba4dcbe3074fb6b545443f61`. The final legitimate
project head is `22796231660d7915c561a34445aecbd7f1900159`. The final live control head is
`caa543441c4510941e0f228c6991616f75fb3557`. These three heads are not interchangeable, and at the
first two the source blob is A while at the third it is B.

## 5. Limitations of the preserved evidence

1. **The rubric's exact input bytes are not preserved.** We know it read the ambient file at
   `2279623`; we do not have a snapshot of that instant. The inference rests on (a) the code path,
   (b) the timing window, and (c) the mechanical contradiction in §3.3. It is strong, but it is an
   inference, and it is labelled as one.
2. **The rubric computed correct checks from an ambient file.** Those checks passed. The defect is
   provenance, not the domain conclusion.
3. **The extractor is outside the repository and was not committed.** Its line is quoted here and was
   read during this audit; the COG-6 manifest does not hash it, because it never was part of the
   repository evidence set.
4. **The final live working tree remains at B by design.** That is the preserved
   `HEAD_BASIS_MISMATCH` control, not a reconciled state. A later reader must not treat
   `files/sources/vendor-capabilities.csv` as the accepted source.
5. Nothing in the COG-6 Evidence Freeze or its Manifest Addendum is changed. The old field remains
   wrong in place; this erratum is the correct reading of it.

## 6. The regression this stage adopts

Every domain evaluation in C6-R must:

1. name the **observed canonical head** explicitly;
2. read the source as a **committed Git blob** at that head;
3. record the **blob digest**, the **evaluation time** and the **result subject**;
4. record any ambient working-tree digest only as `canonical: false` evidence;
5. report `qualified: false` with a reason when the head, the blob or the time cannot be resolved —
   and such an evaluation may never pass a domain check;
6. never derive a canonical accepted digest from an ambient working tree, and never from a snapshot
   taken after a negative control.

Implementation: `scripts/c6r/provenance.mjs` (`evaluateCanonicalSource`,
`evaluateCanonicalSourceInWorld`, `requireQualified`).
Regression: `test/c6r_source_provenance.test.ts`.

## 7. Gate contribution

**R0 — Evidence provenance: ESTABLISHED.** Candidate A, Candidate B, the rubric timing and the
canonical source identities are now unambiguously distinguished from code, timing and preserved
evidence; the historical freeze is untouched.
