# G10-C2 — Binding Observation Snapshot

Status: **G10-C2 · BINDING OBSERVATION SNAPSHOT ARTIFACT · OBSERVATION, NOT DEFINITION, NOT PERSISTENTPOINT · NO PERSISTENCE · NOT A FROZEN CONTRACT**

## 1. Semantics (C2 §36)

The snapshot means: **the exact observation basis against which
availability/capability facts were evaluated.** It is Runtime/Continuity
*observation* — not a Definition, not a PersistentPoint store, not a runtime
carrier/session. `ObservedContinuityCandidate` carries only the facts the
Binding resolver needs (point ref, availability, capability profile) and
structurally cannot grow memory/workspace/authority/PeerRef/Session/Agent/
organization/commitment fields (machine-audited, C2-M12).

## 2. Shape (C2 §37)

```ts
interface BindingObservationSnapshot {
  readonly schemaVersion: 1;
  readonly snapshotId: string;               // observation-INSTANCE identity
  readonly digest: string;                   // canonical observed-content digest
  readonly ephemeralCapabilities: CapabilityProfile;
  readonly persistentCandidates: readonly ObservedContinuityCandidate[];
}
```

## 3. Identity vs content (C2 §39/§41)

```text
content digest  = canonical observed content, domain
                  palimpsest.binding-observation.v1
                  (capability sets as semantic sets; candidates ordered by
                  DurableContinuityRef; availability + capabilities included;
                  snapshotId EXCLUDED — content identity)

snapshotId      = observation-instance identity (stable-identifier grammar;
                  no clock required)

SnapshotRef.ref = deterministic digest of {snapshotId, content digest} under
                  the second domain palimpsest.binding-observation-ref.v1
```

Therefore: same facts observed in a different observation instance → different
SnapshotRef; same snapshotId with changed facts → different SnapshotRef. An
arbitrary opaque id is never conflated with a verified content basis.
Machine-proven (C2-M06).

## 4. Canonicalization and digest (C2 §40)

Capability sets are semantic sets (sorted, duplicate values rejected);
candidates are ordered by point ref (duplicates rejected); `available` and
capability facts are digest content. SHA-256 over the repository's canonical
JSON — implementation choice, not PLMP-UAS-1 frozen semantics.

## 5. Parser / materializer discipline (C2 §42)

`materializeObservationSnapshot({snapshotId, ephemeralCapabilities,
persistentCandidates?})` — CREATES (validate, canonicalize, digest, freeze).
`parseObservationSnapshot(raw: unknown)` — VALIDATES (exact keys,
schemaVersion exactly 1, stable snapshotId grammar, duplicate rejection,
supplied digest fail-closed against canonical content — never silently
replaced; `BindingObservationSnapshotParseError` distinct from
`BindingConfigurationError` and from unsatisfied). Deep-frozen output; caller
inputs detached (C2-M07/M08, C2 §51). No persistence, no event schema, no
observation history store (C2 §43).

## 6. No default snapshot — UNKNOWN ≠ UNAVAILABLE (C2 §45/§46)

A canonical default ephemeral-only snapshot was reviewed and **REJECTED**.
Conditions 2/3 of §46 fail: an explicit BindingDefinition may declare hard
requirements, and a default snapshot with empty *known* capability sets would
evaluate that unknown state as `required_capability_unavailable` — collapsing
UNKNOWN into UNAVAILABLE. Every compile therefore requires an explicit
observation artifact (raw or trusted). Machine-audited: no default producer
exists in the module.

## 7. Compiler integration (C2 §48/§49)

The B4 ad-hoc `planningSnapshot: BindingPlanningSnapshot` input (with its
caller-invented `ref` string) is **removed** and replaced with
raw/trusted `BindingObservationSnapshot`. The compiler derives the kernel's
`ResolverSnapshot` — including the provenance `SnapshotRef` via
`observationRefOf` — through one private adapter; the B3 fixture types
(`ResolverSnapshot`/`BindingCatalogPoint`/`SubjectRequirementFixture`) stay
kernel plumbing and do not escape (C2-M13). Machine-proven (C2-M09/M10 in the
compiler suite: provenance snapshot ref equals the derived ref; static escape
removal).

## 8. Machine proofs (C2 §52)

`test/binding_observation.test.ts` (12) + compiler-suite additions:
C2-M01..M13 all covered. Snapshot freshness (C2-M11) rides the compiler
staleness proofs: a resolution against S1 is refused when the admission basis
is S2 (same run definition), and re-resolution against S2 is current — the
RunDefinition digest is unchanged because the snapshot is not Definition
content (C2 §74 proof extended in C3). Full unit at C2 close: 70 files /
600 tests.

## 9. Adversarial review (C2 §53) — outcomes

| Attack | Outcome |
| --- | --- |
| duplicate point refs | rejected (materializer + parser, tested) |
| same ref / different content | impossible: ref = H(snapshotId, content digest) — drift changes the ref (tested) |
| same content / different observation | different snapshotId → different ref (tested) |
| capability-order permutations | canonicalized sets; identical digests (tested) |
| nested mutation | deep-frozen; `TypeError` (tested) |
| raw digest tampering | parser fail-closed (tested) |
| trusted/raw ambiguity | mutual exclusion → `BindingConfigurationError` (tested) |
| unknown capability as empty known set | no default snapshot; explicit artifact required (audited) |
| PersistentPoint fields sneaking in | structural forbidden-field audit (tested) |
| caller SnapshotRef injection | compiler input removed; ref derived (C2-M10, tested) |

One implementation defect was caught test-first during this stage (candidate
capability validation mistakenly applied the profile-key allowlist to whole
candidate objects) and fixed in the same stage, per the campaign self-review
rule. No unresolved defects.
