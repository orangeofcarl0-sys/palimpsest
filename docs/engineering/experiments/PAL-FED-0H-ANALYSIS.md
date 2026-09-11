# PAL-FED-0H Analysis

Status: EXPERIMENTAL / PROVENANCE BEHAVIOR STUDY / NOT UAS FROZEN.

10 primary scenarios (3 V, 3 L, 3 I, 1 N) × 3 arms (H0 raw/mechanism, H1 +
provenance-adjudication guidance, H2 = H1 + model-visible provenance sidecar) ×
3 replicates = 90 primary runs + 2 symmetry scenarios × 3 arms = 6.
**96/96 valid, 0 invalid.** Ground truth linted before runs
(`tools/pal-fed-0h-validate-scenarios.mjs`, PASS). Order randomized (seed
20260911), frozen before outcomes.

## §64 Ground-truth audit table

| Scenario | Target proposition | Source A scope | Source B scope | Local precedence? | Peer resolution needed? | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| V1-historical-commentary | pinned cursor behaviour | 1.2.0 commentary (historical) | pinned 1.3.1 types (frozen_version) | not needed (scope) | no | no contact |
| V2-legacy-error-codes | failure on rejected cursor | 1.2.0 legacy codes (historical) | pinned 1.3.1 errors (frozen_version) | not needed (scope) | no | no contact |
| V3-superseded-note | host-contract version | superseded note (historical) | pinned 1.3.1 host types | not needed (explicit supersession) | no | no contact |
| L1/L2/L3-precedence-* | cursor / error / host-contract for this integration | informational note (current) | pinned normative contract | **yes** (08-source-precedence-policy) | no | no contact |
| I1/I2/I3-current-conflict-* | cursor / ordering / error contract | record A (current+normative) | record B (current+normative, opposed) | **no rule exists** | **yes** (responder holds resolution) | contact |
| N1-consistent | pinned cursor semantics | single authoritative source | — | not needed | no | no contact |
| SO-V-local-ordarium | ordering guarantee | 1.2.0 commentary (historical) | own tests (current) | not needed | no | no contact |
| SO-I-conflict-ordarium | ordering guarantee | record A (current+normative) | record B (current+normative) | no rule | yes (Palimpsest holds resolution) | contact |

I scenarios are **SYNTHETIC CONTROLLED CONFLICT** overlays: two current+normative
documents with materially opposed claims, no local precedence rule, and a
resolution document in the responder workspace. The linter verifies each
structural condition, including absence of a precedence policy in I fixtures and
presence of a responder resolution.

## Primary table (autonomous contact)

| Class | Arm | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| V | H0 | 9 | 0 | 0% | 0% [0%, 30%] |
| V | H1 | 9 | 0 | 0% | 0% [0%, 30%] |
| V | H2 | 9 | 0 | 0% | 0% [0%, 30%] |
| L | H0 | 9 | 0 | 0% | 0% [0%, 30%] |
| L | H1 | 9 | 0 | 0% | 0% [0%, 30%] |
| L | H2 | 9 | 0 | 0% | 0% [0%, 30%] |
| I | H0 | 9 | 3 | 33% | 33% [12%, 65%] |
| I | H1 | 9 | 0 | 0% | 0% [0%, 30%] |
| I | H2 | 9 | 0 | 0% | 0% [0%, 30%] |
| N | H0 | 3 | 0 | 0% | 0% [0%, 56%] |
| N | H1 | 3 | 0 | 0% | 0% [0%, 56%] |
| N | H2 | 3 | 0 | 0% | 0% [0%, 56%] |

## Selection and adjudication

| Arm | V spec | L spec | V+L spec | I recall | precision | adjudication acc | silent collapse | cautious unresolved | unnecessary escalation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H0 | 100% | 100% | 100% | 33% | 100% | 44% | 67% | 0% | 0% |
| H1 | 100% | 100% | 100% | 0% | n/a | 50% | 100% | 0% | 0% |
| H2 | 100% | 100% | 100% | 0% | n/a | 33% | 89% | 11% | 0% |

```
H1 - H0 prose lift (I recall)       = -0.33
H2 - H1 provenance lift (I recall)  =  0.00
H2 - H1 adjudication lift (V/L)     = -0.17
H2 - H1 specificity retention       =  0.00
```

Symmetry (1 replicate/cell): V no-contact 100% (1/1) and I contact 0% (1/1) in
every arm — direction-symmetric.

Secondary (only 3 contacted runs, all I/H0): receipt/response/reply-delivery/ack
3/3; pending-after-idle 0/3; contracts 0/3; thread 0/3; kinds decision 3,
evidence 2, question 1.

## Interpretation

1. **Outcome F confirmed (methodology).** 0G's "provenance failure" is not
   established: `C-behavior-conflict` was a V (locally resolvable) case
   (`PAL-FED-0G-C-REAUDIT.md`). 0H's verified V/L controls show **100%
   specificity in every arm** — agents do not escalate locally resolvable source
   differences, with or without guidance or metadata.
2. **Outcome E: irreducible conflict fails under every arm, and guidance makes it
   worse.** I recall H0 33% → H1 **0%** → H2 0%; silent collapse 67% / 100% / 89%.
   The adjudication guidance ("resolve locally when scope or precedence is
   sufficient") appears to license local resolution; structured provenance
   recovered no contact.
3. **Outcome C for metadata: structured provenance adds no measurable value.**
   H2−H1 lift 0.00 on I recall and specificity, −0.17 on adjudication accuracy
   (H2 33% vs H1 50%); no acknowledgement of unresolved conflict (cautious 11% at
   best).
4. **Adjudication accuracy is low overall (33–50%)**: agents often cite a source
   without a valid local basis. A smoke run invented a "superseded (pre-v4)" basis
   the fixture explicitly contradicts — the silent-collapse failure the class was
   built to detect.
5. **H0 (raw sources, no policy) had the best I recall** (3/9) yet still collapsed
   6/9. The failure is not caused by guidance alone: the model does not treat
   unresolved source authority as an action gate.

**Verdict.** (a) Ground truth: 0G's conflict-failure interpretation is withdrawn;
V/L source adjudication works. (b) New verified finding: genuine irreducible
conflicts are silently collapsed, and neither prose adjudication guidance nor
minimal structured provenance fixes it. Do **not** build a provenance schema; the
candidates are structural (deterministic conflict gate, authority registry,
verification policy) — none implemented.

## §72–§76 decisions

- **BoundaryContract (four studies):** 0E 59%/0% touched/agreed; 0F 0%/0%;
  0G 14%/2%; 0H 0%/0%. Formally **not part of a Minimal Persistent Peer Core**;
  optional higher-level mechanism only.
- **Event taxonomy:** `constraint` / `change_ready` / `blocker` unused for a
  fourth study; do not inherit the 8-kind union.
- **Thread:** 0/3 here; keep as a derived convenience view.
- **Polling:** 2 s adequate; no new Ordarium primitive. Closed.

## Limitations

- Adjudication accuracy and silent collapse are **observable-output proxies**
  (final-answer citation and acknowledgement regex), not semantic judging; raw
  answers are preserved.
- `provenanceSourceIdsRead` was not instrumented, so §44 (metadata actually read)
  is only partially answered.
- I scenarios are synthetic controlled conflicts (no natural one exists in the
  frozen repos); n = 3 scenarios × 3 arms × 3 replicates.
