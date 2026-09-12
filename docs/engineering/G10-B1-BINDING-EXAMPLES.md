# G10-B1 — Binding Examples & Adversarial Shapes

Status: **DRAFT · NOT IMPLEMENTED · NOT FROZEN**

Worked examples against the candidate contract
(`G10-B1-BINDING-SCHEMA-CANDIDATE.md` §6), then the rejected shapes. All names
are the candidate's; nothing is implemented.

## Examples (must resolve correctly)

### Example 1 — pure ephemeral (Case E)

```text
BindingDefinition (subject S):
  continuity: {}                        // no pin, no requirePersistent, no prefer
  hard: { runtimeFeatures: ["web_search"] }
  preferences: {}

Resolution:
  provenance: { architecture: A@2/d1, work: W@5/d2, binding: B@1/d3,
                runConfiguration: rc-digest, snapshot: snap-17 }
  selections.S.continuity = { kind: "ephemeral" }     // SATISFIED, first-class
  selections.S.providerModel = { provider: "deepseek-official", model: "deepseek-flash" }
```

Absence of a PersistentPoint is a satisfied outcome. `BindingUnsatisfied` does
not occur.

### Example 2 — persistent pinned (Case P)

```text
BindingDefinition (subject S):
  continuity: { pin: "ordarium.main-locus", requirePersistent: true }
  hard: { workspace: { kind: "repository_scoped" } }

Resolution (point available & compatible):
  selections.S.continuity = { kind: "persistent", point: "ordarium.main-locus" }
```

The resolver may not silently select another point; an incompatible or missing
P yields `pinned_target_unavailable` / `pinned_target_incompatible`.

### Example 3 — persistent required but unavailable (Case R)

```text
BindingDefinition (subject S):
  continuity: { requirePersistent: true }        // no pin
  hard: { toolCapabilities: ["repo_access"] }

Snapshot: no existing durable locus satisfies the constraints.

Resolution result:
  UnsatisfiedBindingResolution { reasons: ["no_matching_persistent_point"] }
```

No point is created; no attempt starts; this is a planning condition, not a
task failure.

### Example 4 — persistent preferred, none available

```text
BindingDefinition (subject S):
  continuity: { preferPersistent: true }         // SOFT only

Snapshot: no suitable durable locus.

Resolution:
  selections.S.continuity = { kind: "ephemeral" }    // still SATISFIED
```

Preference ≠ requirement: the ephemeral outcome is fully valid because all hard
constraints are satisfied.

### Example 5 — RunConfiguration conflict

```text
BindingDefinition (subject S):
  continuity: { pin: "ordarium.main-locus", requirePersistent: true }

RunConfiguration binding delta:
  // there is NO field that can retarget the pin to another point
  providerModel: { provider: "deepseek-official", model: "deepseek-flash" }   // allowed (level 2)

If a hypothetical run request asked for NOT-P / NOT-X where X is hard:
  → configuration-validation failure BEFORE resolution (fail-fast);
    `run_selection_conflict` is reserved for availability-dependent conflicts
    discovered during resolution.
```

The durable pin is unreachable from RunConfiguration by construction
(`RunConfigurationBindingDelta` has no point field; precedence level 1 is
non-overridable).

### Example 6 — runtime rebinding

```text
Same BindingDefinition B@3 (pin: P). Carrier for P's realization is replaced:
old RuntimeAgent/Session gone, new RuntimeAgent/Session attached.

Old resolution: resolutionId r-1 (digest over selections + snapshot snap-17)
New resolution: resolutionId r-2 (same pin P, new snapshot snap-31, new
                provider/tool selections as of snap-31)
```

Rebinding produces a **new** BindingResolution; the old artifact stays auditable;
the BindingDefinition is not mutated; the PersistentPoint identity is unchanged.
The plan's `bindingResolutionRef` is updated to r-2 (id+digest) — one
authoritative value at any time.

## Adversarial shapes (rejected)

### Bad A — runtime identity in the durable definition

```ts
interface BindingDefinition { sessionId: string; }   // REJECTED
```

Session is runtime-carrier continuity (`UAS1-INV-13`); durable definitions
carry no Session identity (`BIND-CAND-10`). The candidate's identity namespaces
structurally exclude it.

### Bad B — persistence made mandatory

```ts
interface BindingDefinition { persistentPointId: string; }   // REJECTED (required globally)
```

Continuity is optional (`UAS1-INV-01` Continuity dimension; UA-INV-12). The
candidate represents Case E with an absent `ContinuityBindingIntent` — no null
hacks, no placeholder points (`BIND-CAND-12`).

### Bad C — authority smuggling

```ts
interface BindingDefinition { authority: string[]; }   // REJECTED
```

No authority fields exist anywhere in the candidate; authority representation
remains intentionally open (`BIND-CAND-05`; `UAS1-INV-29`).

### Bad D — PeerRef as the universal target

```ts
interface BindingDefinition { peerRef: string; }   // REJECTED
```

`PeerRef ↔ PersistentPoint` is frozen-open; binding targets continuity identity
via `DurableContinuityRef` and never forces that relation closed
(`BIND-CAND`/matrix row: PeerRef not required by Binding).

### Bad E — run-level durable retarget

```ts
interface RunConfiguration { persistentPointOverride: string; }   // REJECTED
```

A durable pin may change only through a new BindingDefinition revision
(`BIND-CAND-15`; Closure C). `RunConfigurationBindingDelta` deliberately has no
such field, so the violation is unrepresentable rather than merely forbidden.

### Bad F — second resolution truth (for completeness)

```text
ExecutionPlan embeds a full resolution AND a standalone BindingResolution
artifact exists.   // REJECTED by BIND-CAND-16 / Option A
```

Under Option A the plan holds only `bindingResolutionRef` (id+digest); any other
copy is a digest-bound projection or cache.
