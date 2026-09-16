# Palimpsest — Verifier independence model

Who is allowed to count as an INDEPENDENT verifier, what the deployment must be
able to prove about it, and what it may never claim. This is the reference for
`verifierRef` selection, for `independenceClass`, and for the `VERIFY` Work Mode
availability derivation.

Companion reading: `PROJECT-VERIFICATION-RUNTIME.md` (what a run does),
`G10-AD-VERIFICATION-SPEC.md` §10/§15/§16 (the requirements),
`PROJECT-OPERATING-POSTURE.md` (how availability is rendered).

```text
VerifierIndependence     ≠ VerifierCorrectness
DifferentModel          ≠ AutomaticallyIndependent
DifferentPrompt         ≠ Independent
DifferentRole           ≠ Independent
FreshContext            ≠ Truth
SameModelSameContext    ≠ Independent
Declared                ≠ Established
ClassToken              ≠ SeparationContract
Independence            ≠ TruthChannel
```

## 1. The five classes

| Class | Product meaning | Counts as independent? |
| --- | --- | --- |
| `MECHANICAL_INDEPENDENT` | A mechanical protocol (a command, a deterministic check) that consumes the ARTIFACT, not an opinion, and shares no authoring context. | **YES** |
| `EXTERNALLY_SEPARATED` | A separately-held provider. Counted ONLY when an explicit separation CONTRACT names the boundary. | YES **iff** the contract is explicit |
| `DECLARED_SEPARATE` | Declared separate by the deployment; the separation is not established. | NO — displayed as declared, never upgraded |
| `SHARED_CONTEXT` | The verifier shares the model AND/OR the context of the verified work. | NO |
| `UNKNOWN` | The deployment cannot establish the separation at all. | NO |

`countsAsIndependent` is the ONE implementation of the middle column, and it is
pure and total:
`MECHANICAL_INDEPENDENT → true`, `EXTERNALLY_SEPARATED → hasExplicitSeparationContract`,
everything else `false`.

## 2. An explicit contract is not a class token

`EXTERNALLY_SEPARATED` counts only when the definition carries:

```text
ExternalSeparationContract {
  boundary:     SEPARATE_PROCESS | SEPARATE_SERVICE | SEPARATE_HOST
  boundaryRef:  the concrete implementation/provider that HOLDS the boundary
                (never a model name)
  statement:    deployment-authored: what is separated from what
}
```

A bare `EXTERNALLY_SEPARATED` with no contract is still DISPLAYED as externally
separated, and it does NOT count. The basis string returned by
`independenceBasis` says exactly that.

## 3. The model-verifier rules (encoded, not conventional)

`classifyModelIndependence(facts)` refuses to over-claim:

```text
!establishable                                  → UNKNOWN
same model AND same context                     → SHARED_CONTEXT   (hard rule)
one axis differs, provider boundary proven      → EXTERNALLY_SEPARATED
one axis differs, no proven boundary            → DECLARED_SEPARATE
model and context both differ, proven boundary  → EXTERNALLY_SEPARATED
```

Consequences worth stating plainly:

* a different PROMPT version changes nothing — it is not an independence input;
* a different ROLE or "agent identity" changes nothing;
* a "proven boundary" claim without a provider boundary is only a declaration.

`effectiveModelIndependenceClass` then takes the WEAKER of what the deployment
declared and what the facts establish, so an adapter cannot declare
`MECHANICAL_INDEPENDENT` while running the same model in the same context.
`modelIndependenceIsHonest` is the pre-registration check, and
`modelProvenanceIsVersioned` refuses a model definition whose model or prompt
version is missing.

## 4. How independence reaches the product

```text
VerifierDefinition.independenceClass + separationContract
        ↓ registry (config, never a store)
ProjectVerificationStatus.independentVerifierRefs   (EXECUTABLE and counting)
        ↓ runtimeFactsOf / InstalledVerification.runtimeCapability()
VerificationRuntimeCapabilityView { runtimeAvailable, independentVerifierAvailable,
                                    independentVerifierRefs, defaultVerifierRef, note }
        ↓ verificationAvailabilityOf (the ONE availability table)
Work Mode VERIFY row: AVAILABLE | CONDITIONAL | PREVIEW_ONLY | UNAVAILABLE
```

`independentVerifierAvailable` may only be TRUE when the runtime EXISTS
(`runtimeAvailable`) AND at least one registered verifier counts. A registered ref
with NO execution binding is not a runtime, and no class token can substitute for
one.

## 5. What a deployment may never do

```text
declare an agent's own context independent
change an independence class at runtime
make a same-model same-context verifier count by declaration
make a bare bool/string imply an independent runtime
present DECLARED_SEPARATE as established
present UNKNOWN as independent
```

The install derives the availability fact from the registry + executable providers
(`InstalledVerification.runtimeCapability()`), forcing the deprecated
`independentVerifier` boolean to be ignored whenever a capability view exists. A
bare declaration is reported as `CONDITIONAL` at best, and the Advisor states the
real fact instead of a name heuristic.

## 6. Honest limitations

1. **Independence is a deployment claim about separation, not a correctness
   guarantee.** A mechanical `git diff --check` is independent of the authoring
   context and still proves almost nothing about the project.
2. **No model-verifier adapter ships.** The rules exist so that a future adapter
   cannot cheat; today there is nothing to register (`CF-AD-02`).
3. **`EXTERNALLY_SEPARATED` is only as strong as the contract.** The plane checks
   that a boundary kind, a boundary ref and a statement are present and non-empty;
   it cannot verify that the named boundary really holds.
4. **The registry is process config.** Two processes with different registries will
   disagree, and that disagreement is a real product fact (a run can become
   `STALE_VERIFIER_DEFINITION`), not a bug.
