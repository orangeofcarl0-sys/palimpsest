# Palimpsest — Project Verification runtime

The doctrine an installation and an embedder must follow to make VERIFY a real
project capability: verify the EXACT current ProjectIR head under a NAMED,
registered, versioned verifier protocol, remember the run, and never mistake
"a verifier passed" for "the world is true".

Companion reading: `VERIFIER-INDEPENDENCE-MODEL.md` (who counts as independent and
why), `G10-AD-VERIFICATION-SPEC.md` (the stage's own requirements),
`G10-AD-INDEPENDENT-VERIFY-EVIDENCE.md` (the transcripts),
`MONITOR-INSTALL-LIFECYCLE.md` (the sibling lifecycle doctrine this mirrors).

```text
VerificationResult      ≠ Truth
VerificationPASS        ≠ WorkGatePASS        ≠ TaskCOMPLETED
VerificationFAIL        ≠ TaskFAILED
VerificationResult      ≠ WorkEvidence        ≠ ProofEvidence
                        ≠ ProofPublication    ≠ ReasoningAdmission
                        ≠ PromotionAuthority  ≠ EffectAuthority
VerifierIndependence    ≠ VerifierCorrectness
DifferentModel          ≠ AutomaticallyIndependent
DifferentPrompt         ≠ Independent
FreshContext            ≠ Truth
SameModelSameContext    ≠ Independent
ProjectVerificationStore ≠ ProjectIR ≠ WorkEventStore ≠ ProofEvidenceStore
VerifierRegistry        ≠ VerifierStore      ≠ project truth
freshness (CURRENT/STALE) ≠ verdict          ≠ deletion
```

## 1. The subject is the exact current ProjectIR head

v1 verifies exactly one subject kind:

```text
CURRENT_PROJECT_HEAD {
  schemaVersion: 1
  projectId
  projectRevision
  projectDigest
  headCommit
  digest
}
```

The subject is MATERIALIZED, never supplied:

* `firstPartyProjectHeadVerificationSource` reads the SAME canonical projection
  `src/project_management/service.ts` reads (the `projects` row of the canonical
  EventStore) through the structural `ProjectIrProjectionOwner` view
  (`src/project_verification/provider.ts`), so there is no second head truth.
* `ProjectVerificationService.verifyCurrentHead` takes no revision, no digest and
  no commit. A hostile caller that injects `headCommit`/`projectDigest`/
  `projectRevision`/`subject` fields is ignored (AD-N09).
* A host that holds its own ProjectIR projection can pass
  `sourceFromProjectHeadReader`; it still supplies the CANONICAL head, not an
  arbitrary commit.

```text
ProjectHeadVerificationSource ≠ a second head truth
```

## 2. Repository consistency is enforced BEFORE any execution

Before the provider is called (`src/project_verification/service.ts`):

```text
actual repository head == subject.headCommit
```

otherwise the run is BLOCKED with the typed reason
`project_head_not_materialized`, nothing is written, and the provider is never
invoked (AD-N10). Ambient Git is never verified while it is labelled the canonical
project head.

After the run, ProjectIR AND Git are re-read. If either moved, the run is retained
but marked `freshness = STALE_INPUT`: it is history, not current verification
(AD-N11).

## 3. What one run does, in order

```text
materialize the exact current ProjectIR head            (§4)
→ enforce repository head == subject head commit        (§5, BEFORE execution)
→ append STARTED                                        (§12, BEFORE the provider call)
→ call the REGISTERED verifier protocol
→ re-read ProjectIR + Git                               (§5, mid-run drift)
→ append COMPLETED with verdict/score/independence/freshness
```

`STARTED` is written before the provider call and the terminal event after the
result is observed, so a process death in between can only leave an unresolved
`STARTED`. The fold (`foldProjectVerificationRuns`) then reports `STARTED` and no
verdict can be fabricated from it (AD-N29).

## 4. Result vocabulary

```text
PASS        the named protocol passed
FAIL        the named protocol reported a violation
SCORE       the protocol produced a score (optionally normalized by an explicit
            deployment rule); SCORE is NEVER mapped to PASS
UNRESOLVED  the protocol reached no conclusion
ERROR       infrastructure fault — ERROR ≠ FAIL
```

An `ERROR` with no detail is rejected at materialization: a blank error cannot be
recorded. A `PASS` may not carry a score and only a `SCORE` may.

## 5. Durable, append-only, crash-honest history

`SqliteProjectVerificationStore` owns ONE thing: a project's verification
request/run history. Per project it stores an append-only event chain with a
`sequence`, a `previousRecordDigest` and a recomputed content digest, so local
tamper-evidence is mechanical (`verifyChain`). The store:

* never copies the ProjectIR;
* never writes Work Evidence, Proof or Reasoning rows;
* is NOT canonical project truth — the ProjectIR stays the owner.

Freshness binds FOUR things: project revision, project digest, head commit and the
verifier DEFINITION digest. A head change or a protocol change makes an old run
stale BY DERIVATION; the history is never deleted, rewritten or re-labelled.

## 6. Derived status

`status()` is a pure derivation over (canonical head, current registry, append-only
history):

```text
UNAVAILABLE   no executable verifier, or no current head
UNVERIFIED    a runtime exists and this exact head was never verified
VERIFYING     a run for this exact head is open
PASS / FAIL / SCORE / UNRESOLVED / ERROR   the newest run for this exact head
STALE         a run exists but no longer describes this input/protocol
```

`state == "PASS"` means only "the named verifier protocol passed". The status also
reports `runtimeAvailable`, `independentVerifyAvailable`, the registered /
executable / independent / declared-separate ref lists, the default ref, the latest
run view, the current-subject run view, the fresh independent run and the
unresolved run ids.

## 7. Install shape

```text
projectVerificationStore?             the history store (default: deployment-local,
                                      beside the G10-AB/AC operating store)
projectVerifierRegistry?              config (default: exactly the executable ports)
projectVerifierProviders?             the EXECUTABLE ports (default: the first-party
                                      mechanical `git diff --check`; [] = no runtime)
projectVerificationDefaultVerifierRef? the ref a caller gets when it selects none
```

`installed.verification` exposes `status()`, `history()`, `verifyCurrentHead()`,
`runtimeCapability()`, the resolved `defaultVerifierRef`, the registry and the
repository. A PRODUCT install (a derived workspace or a recipe execution binding)
composes the first-party runtime by default; a BARE Work-only install composes NO
verification surface at all, so its routes and tools are unchanged.

## 8. Who may do what

| Actor | May | May NOT |
| --- | --- | --- |
| Deployment config | register verifier definitions, bind providers, choose the default ref | n/a |
| Operator | select a registered ref, request a run, read status/history | change an independence class at runtime |
| Agent / HTTP caller | select a registered ref, request a run, read status/history | register a verifier, supply a command or args, name a commit or digest, claim its own context is independent |
| Management (`RUN_LOCAL_VERIFY`) | request a run of the CURRENT head under the selected/default ref | select a verifier in the candidate, inject a command, bypass the policy matrix |
| Recipe execution (`bind_verification`) | run the base mode, then verify the CURRENT head | verify a reasoning claim, admit a claim, publish proof, write Work Evidence |

## 9. Honest limitations

1. **v1 has one subject.** Reasoning claims, Proof claims, Campaigns, Commitments,
   Boundaries and Organizations are not verifiable here, deliberately (`CF-AD-01`).
2. **No model verifier is shipped.** The independence RULES exist, but no adapter
   is provided because the host cannot yet establish a real provider boundary. A
   model verifier whose separation cannot be proven is `UNKNOWN`/`SHARED_CONTEXT`
   and never counts (`CF-AD-02`).
3. **The first-party protocol is narrow.** `git diff --check` proves nothing about
   correctness, tests or behaviour; a PASS means exactly "no whitespace errors in
   the tracked diff".
4. **`status()` is not free.** It reads the ProjectIR projection and the repository
   head on every call.
5. **Tamper-evidence is local.** The chain digests defeat casual rewriting, not a
   hostile database administrator. This is stated in the store and the README-style
   docs, not marketed as security.
6. **A host that lies to its own source is trusted.** `sourceFromProjectHeadReader`
   exists for hosts that already hold the ProjectIR projection; the plane cannot
   detect a host that feeds it a non-canonical head.
7. **Verification grants nothing.** There is no admission bridge from a
   verification result to Work Evidence, Proof publication, Reasoning admission,
   task state or promotion. Any such bridge needs a separate design (`CF-AD-05`).
