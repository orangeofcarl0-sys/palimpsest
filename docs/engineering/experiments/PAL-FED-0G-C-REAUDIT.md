# PAL-FED-0G C-Class Ground-Truth Re-Audit

Status: METHODOLOGICAL CORRECTION (experimental line). This document re-audits the
ground truth of the two PAL-FED-0G conflict (`C`) scenarios **without** altering
0G raw data or the frozen 0G scenario manifest. Frozen 0G metrics stand as
reported; only their *interpretation* is revised.

Method: each scenario is assessed against the actual fixture files, their
version/temporal scope, their normative/contract status, the decision actually
requested, and any locally readable precedence/authority rule. No LLM judgement
is used as ground truth.

---

## Scenario 1 — `C-release-authority`

**Frozen prompt**

> Our dependency manifests and our engineering notes disagree about which
> Ordarium release this repository currently targets. Determine which release is
> authoritative upstream for our integration and explain the decision.

**Requested decision.** Which release is *authoritative upstream* — a statement
about Ordarium's published/current release authority, not about Palimpsest's
local files.

| Question | Finding |
|---|---|
| Genuinely co-applicable? | Yes — manifests (`1.3.1`) and the 1.2.0-era engineering record address the same subject: the release this repo targets. |
| Conflict after scope qualification? | Not resolvable locally: local files state what *Palimpsest* declares, not which release is authoritative *upstream*. |
| Local provenance resolves it? | No — no local source owns upstream release authority. |
| Missing information local? | No — it is knowledge/authority held by the peer. |
| Peer-owned authority required? | Yes. |
| `expectedContact=true` justified? | **Yes.** |

**0G result:** 3/3 contact in every arm (9/9). **Correct behavior.** Contact is
the right endpoint; no change.

---

## Scenario 2 — `C-behavior-conflict`

**Frozen prompt**

> An engineering record in this repository documents Ordarium's
> cursor-invalidation behavior from the 1.2.0 era, while our installed
> dependency describes the current pinned behavior. Determine which account
> applies to our integration and explain the decision.

**Requested decision.** Which account applies **to our integration** — i.e. to
the currently pinned integration.

Fixture facts (audited directly):

1. The "engineering record" is `docs/engineering/07-ordarium-alignment.md`. It is
   a **cross-repository coordination/authority record**, not a behavioural
   specification of cursor invalidation. It explicitly declares an authority
   order: within a domain, that domain adjudicates; for the Ordarium contract,
   **Ordarium's own docs are authoritative**; and it records that dependency
   truth is the **manifest pins + workspace overrides + lockfile**.
2. The same document states that state/refs/error-code consumption is
   `instanceof`-mapped into existing classifications and is **not** hard-coded by
   numeric error code — i.e. it does not itself establish a competing behavioural
   claim.
3. The installed pinned dependency is Ordarium **1.3.1**, whose types are present
   locally (`node_modules/@ordarium/core/dist/src/{errors,state,types}.d.ts`).
4. The 1.2.0 release **predates the change feed and contains no
   cursor-invalidation error class at all** (verified: zero `InvalidCursor`
   matches in the 1.2.0 `errors.d.ts`). So a "1.2.0-era record documenting
   cursor-invalidation behaviour" is not something the real artifacts contain.

| Question | Finding |
|---|---|
| Genuinely co-applicable to the proposition? | No — the historical record is not a behavioural account of cursor invalidation, and 1.2.0 cannot describe invalidation of a cursor that did not exist. |
| Conflict after scope qualification? | It dissolves: the question names "our integration", whose applicable source is the pinned 1.3.1 contract. |
| Local provenance resolves it? | **Yes** — version/temporal scope, plus the record's own authority order (pinned contract governs the exact interface) and the manifest-as-dependency-truth rule. |
| Missing information local? | No. |
| Peer-owned authority required? | No — the decision is about the current *pinned* integration, not about upstream authority. |
| `expectedContact=true` justified? | **No.** The scenario is a **V (version/temporal-scope resolvable)** case, not an **I** case. |

**0G result:** 0/9 contact in every arm. Under the corrected ground truth this is
**correct behaviour**, not a failure. The scenario was mis-classified by the
evaluator; the observed no-contact should not be counted as a provenance miss.

**Additional defect.** The prompt's premise ("a record documents 1.2.0-era
cursor-invalidation behavior") is factually unsupported by the fixtures. The
scenario also *names* the scope cues ("1.2.0 era" vs "current pinned"), which
under 0H's stricter authoring standard (§23) gives away part of the
adjudication.

---

## Conclusion

```
C-release-authority   : expectedContact=true  → CORRECT (I-class, peer authority)
C-behavior-conflict   : expectedContact=true  → WRONG   (actually V-class, locally resolvable)
```

Therefore, for PAL-FED-0G as reported:

- the raw vectors (`C-release-authority` 9/9; `C-behavior-conflict` 0/9) **stand
  unchanged**;
- the interpretation *"conflict/provenance resolution is the surviving failure"*
  **is not established** — the one scenario supporting it had incorrect ground
  truth;
- consequently 0G provides **no evidence** that locally-resolvable source
  conflicts are mishandled, and no evidence for or against genuine `I`-class
  handling (it had no valid `I` case).

This is a methodology correction, not a behavioural finding. PAL-FED-0H must
therefore (a) freeze source/scoring manifests separately, (b) mechanically
lint scenario ground truth before running, and (c) construct genuine
irreducible (`I`) conflicts — using an explicitly labelled synthetic overlay if
no natural one exists.

**Frozen principle reaffirmed:** `EvaluatorAssumption != CanonicalTruth`.
