# R3-A — FROZEN FIXTURE FAMILIES

Stage: R3-A0
Baseline: `096008d7b005096ec83526b6c5fcb3e54ba4d12f`
Status: **FROZEN revision 1** for both families

---

# 1. Construction discipline (§3)

Both families were designed from **mechanism requirements** — what an atomic transaction owes its caller, and
what a versioned migration owes a forward-compatible consumer — **before any qualification model ran**.

```text
constructionActor:                 the R3-A0 mechanism specification (this stage)
constructionModel:                 none
evaluationModelFamiliesKnownAtConstruction: no
contamination:                     INDEPENDENT
antiOverfitProcess:                COMPLIANT
```

No evaluation-model failure list was consulted, and no hidden case was authored around a model's observed
weakness. The failure classes are the obligations each mechanism implies, stated before any model saw them.

---

# 2. Structural diversity proof (§4)

The two families differ in **underlying failure structure**, not in filenames or domain nouns.

| | F-A | F-B |
|---|---|---|
| mechanism | transactional / atomic state update | versioned schema / API compatibility |
| core obligation | establish the WHOLE effect before the FIRST effect | preserve what you do not recognize while transforming |
| the caller's object | the store, mutated in place, must survive a refusal unchanged | the document, never mutated at all |
| dominant failure mode | partial mutation before rejection | silent data loss (dropped fields, repaired values) |
| success shape | an all-or-nothing commit | a forward-compatible transform |
| the pre-paid mistake | apply as you walk | build the new shape from the fields you know |

A worker that solves F-A by "validate first" has learned nothing that automatically solves F-B, whose
characteristic failure is *discarding* rather than *partially applying*. That is the structural distinction
the ruling asks for, and it is visible in the H0 sources: F-A's H0 has no validation at all, while F-B's H0
validates nothing either but fails by *dropping* and *repairing* rather than by partially applying.

---

# 3. F-A — atomic transaction application

```text
fixtureId:        r3a-f-a-atomic-transaction
fixtureRevision:  1
mechanismFamily:  F-A transactional / atomic state update
sourceFile:       src/ledger.mjs
exportName:       applyTransaction
```

## 3.1 Failure classes

| class | invariant | semantic description |
|---|---|---|
| FA1 | atomic-rollback-on-reject | an unusable operation anywhere in the batch leaves the caller's store byte-identical |
| FA2 | validate-later-operation | an operation AFTER a valid one is validated before the valid one has any effect |
| FA3 | idempotent-retry | re-applying a transaction the store already applied is a no-op |
| FA4 | intra-transaction-order | a debit covered by an EARLIER credit in the same transaction is allowed |
| FA5 | insufficient-funds-rejected | a debit that would overdraw is refused, leaving the store untouched |
| FA6 | unrelated-state-preserved | a successful transaction leaves every other account and applied id exactly as it was |

## 3.2 Independence audit (§6)

```text
independent         FA1, FA3, FA4, FA5, FA6
partially coupled   FA1 + FA2
                    both concern validation preceding effect. FA2 is kept SEPARATE because it isolates the
                    case where the unusable operation comes AFTER a valid one — a candidate can pass FA1
                    (rejects a batch whose FIRST operation is bad) and still fail FA2, so the two are not
                    the same measurement.
derived/redundant   none
```

## 3.3 H0 baseline

```text
H0 2/8 cases
headroom on 5 of 6 classes (FA1, FA2, FA3, FA4, FA5)
```

H0 walks the operations and applies each as it arrives, so it validates nothing, has already mutated the
store before it can discover a later operation is unusable, re-applies on retry, and lets a balance go
negative. It is deliberately plausible: it reads the goal literally.

---

# 4. F-B — versioned document migration

```text
fixtureId:        r3a-f-b-versioned-migration
fixtureRevision:  1
mechanismFamily:  F-B versioned schema / API compatibility
sourceFile:       src/config.mjs
exportName:       migrateDocument
```

## 4.1 Failure classes

| class | invariant | semantic description |
|---|---|---|
| FB1 | unknown-field-preserved | a field the contract does not define survives the migration verbatim |
| FB2 | default-only-when-absent | the default is inserted ONLY when the key is absent |
| FB3 | v1-rename-applied | the v1 spelling is renamed to the v2 name and the old spelling is gone |
| FB4 | future-version-rejected | a version the contract does not define is refused rather than guessed at |
| FB5 | v2-round-trip-stable | a current-version document migrates to an equal document |
| FB6 | malformed-nested-rejected | a nested value of the wrong shape is refused |
| FB7 | present-but-unusable-refused | an explicitly present but unusable value is refused, not repaired into a default |

## 4.2 Independence audit (§6)

```text
independent         FB1, FB3, FB4, FB5, FB6
partially coupled   FB2 + FB7
                    both concern the default policy, but the contract treats them OPPOSITELY: FB2 is the
                    ABSENT key (insert the default), FB7 is the PRESENT-but-unusable value (refuse). A
                    candidate that conflates them fails one while passing the other, so they are not
                    redundant. This pair is the fixture's sharpest discriminator.
derived/redundant   none
```

## 4.3 H0 baseline

```text
H0 3/8 cases
headroom on 4 of 7 classes (FB1, FB4, FB6, FB7)
```

H0 builds the new shape from the fields it knows about, so it silently discards unknown fields, replaces a
present-but-unusable value with a default, and accepts a version it has never seen.

---

# 5. Class weights

Both fixtures are **unweighted**: every declared class counts once toward class coverage. This is stated
explicitly rather than assumed, per R3-SPEC §8.

---

# 6. Historical / pre-paid class mapping

Each fixture's classes correspond to the pre-paid mistake its H0 commits:

| fixture | pre-paid mistake | classes that measure it |
|---|---|---|
| F-A | apply as you walk, before validating the batch | FA1, FA2, FA5 |
| F-B | build the new shape from the fields you know | FB1, FB2, FB7 |

These correspondences are **declared before evaluation** (§9), so the Prepaid Error Recurrence Rate has a
declared denominator rather than an inferred one. A failure matching no declared class is recorded as
`UNCLASSIFIED_FAILURE` and excluded from PERR.

---

# 7. Lifecycle

Both revisions are **frozen at revision 1**. Neither was edited after construction. A change to either
fixture creates revision 2 with a new digest and a new qualification record; revision 1's record stays in
history as the record of the rejected revision.
