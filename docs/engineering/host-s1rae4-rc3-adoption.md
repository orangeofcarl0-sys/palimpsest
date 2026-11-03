# Host-S1RA-E4-C1 — Runtime `0.2.1-rc.3` Adoption

**Stage:** Palimpsest Host-S1RA-E4
**Decision authority:** the project owner accepted `0.2.1-rc.3` as the current runtime; E4 was authorised to make the
minimum explicit source change to adopt it.

---

## 1. What the field means, established before changing it

The ruling required reading the semantic meaning of `qualifiedVersion` rather than assuming it from the name.

`host/deployment/runtime/win32_label.js` states it explicitly:

> The `qualifiedVersion` therefore names the release this code was **actually qualified against**, and
> `dshCompatibilityReport()` still reports drift for any OTHER release rather than assuming compatibility.

So the field is an **exact compatibility expectation for the operations this fence performs**. It is not a record that
every security property of the release was verified, and it does not generalise to other releases.

**Why this distinction mattered.** An earlier stage's own plan
(`docs/engineering/host-s1rae2-rc3-requalification-plan.md` §9) said that moving the pin without its §5 controls
"would convert an unknown into a false qualification". The ruling authorised adoption, but not the manufacture of
qualification evidence. So the pin could only move if the §5 controls were actually satisfied — otherwise the honest
outcome was a blocked adoption with the reason recorded.

**They were satisfied.** See §3.

---

## 2. The exact source change

`host/deployment/runtime/win32_label.js`, `runtime_CONTRACT`:

| Field | Before | After |
|---|---|---|
| `qualifiedVersion` | `'0.2.1-rc.2'` | **`'0.2.1-rc.3'`** |
| `previouslyQualifiedVersion` | `'0.2.0-rc.2'` | `'0.2.1-rc.2'` |
| `firstQualifiedVersion` | — | `'0.2.0-rc.2'` (new, so the earlier history stays legible) |

Nothing else in the contract changed: `package`, `seam`, `contextMembers` and `helpers` are identical.

**No integrity check was disabled, relaxed or bypassed.** `versionMatches` is still an exact equality test against
`qualifiedVersion`; `ffiMatches` still requires `koffi === '3.1.1'`; `drifted` is still
`resolved.error === undefined && !(versionMatches && ffiMatches)`; and `runner.js:617` still refuses at pre-create on
`drifted === true`, unconditionally. A future `0.2.1-rc.4` drifts exactly as rc.3 did before this change.

---

## 3. The §5 controls, measured against the installed rc.3

`scripts/host_s1rae4/win32-seam-controls.mjs`, run from a run-owned test home so the fence resolves the seam from the
same base a real worker uses. Artifact: `research-evidence/host-s1rae4/win32-seam-controls.json`.

| Control | Observation |
|---|---|
| Seam resolves | `resolved 0.2.1-rc.3`, `drifted: true` **before** the pin change — which is the correct precondition |
| All six symbols are functions | `createWellKnownSid`, `getLengthSid`, `initializeAcl`, `addMandatoryAce`, `setNamedSecurityInfoW`, `getNamedSecurityInfoW` — measured by **type**, not by name |
| `koffi` from the seam's own graph | `3.1.1` |
| Label write through the rc.3 seam | applied, and read back as `integrity=Medium` |
| Unlabelled control read | succeeds |
| **Low-integrity read of the labelled directory** | **refused (`EPERM`)** while the control succeeded |
| Labelled link vs unlabelled target | target still readable, so a link is not coverage |

**Outcome: `PROTECTED`.** The decisive distinction is that the refusal happened for a LOW token while the unlabelled
control succeeded from the same token. That separates the Mandatory Integrity mechanism from an incidental ACL effect
and from an unapplied label — the three cases the plan requires be told apart.

### A precondition that had to be discovered, not assumed

The first attempt reported `LIMIT_NO_LABEL_WRITE`: `SetNamedSecurityInfoW` returned 5 (ACCESS_DENIED) on a freshly
created directory. Before reporting that as an incompatibility, `label-write-feasibility.mjs` asked whether it was a
fixture property, and measured that an explicit `icacls /grant <principal>:(OI:F)` made the **same** write succeed and
read back (`WRITE_SUCCEEDS_AFTER_GRANT`). The refusal was the fixture's DACL, not the runtime.

The controls therefore apply an explicit grant and **record** it, rather than assuming the fixture was writable. This
is stated because a reader must be able to see the precondition rather than infer it from a green result.

---

## 4. What moving the pin actually found

The drift refusal was masking a real rc.2 → rc.3 API change. Once the refusal was resolved, the gate reached the
session measurement and crashed:

```
invalid plugin, expect function or object with an "apply" method, received undefined
  at makeRealDshSessionReader (host/deployment/runtime/session_reader.js)
```

`@deepseek-ai/dsh-session-persistence-jsonl` in rc.3 exports `apply`, `name` and `Config` as **named** exports and has
**no `default`**. The reader did `.default`, which is `undefined`.

**This is the point of moving a pin under evidence rather than editing a version string.** A stage that flipped the
constant without running the path would have shipped a worker that crashes after pre-create.

`session_reader.js` now resolves the plugin across both shapes (`resolvePersistencePlugin`): `default` is preferred when
it is a function or an object with `apply`, otherwise the namespace is used. `default` is kept first so rc.2 sessions
remain readable — a reader that understood only the newest shape would make the historical record unreadable.

---

## 5. Verification that the adoption works

`scripts/trajectory_p2b/level-b-first-party-gate.mjs` against the adopted rc.3:

| Field | Value |
|---|---|
| `outcome` | **`PASS`** |
| `qualified` | **`true`** |
| `observedSessionId` | `worker-192d6632-61dc-4e70-8eaf-20601c5a19df` |
| `observedInvocationId` | `wpi-f9a1a668-5678-4d2c-a7d5-a81348f4eff6` |
| `observedState` | `OBSERVED` |
| `observedSource` | `DIRECT_CHILD_IPC_REPORT` |
| `realFirstPartyDshPathRan` | `true` |
| `modelCallsMade` | `0` |
| `testRootCleanup` | `cleaned: true`, `quarantined: true` |
| Gate root | 19 before, 19 after |

The worker genuinely initialised and reached the shipped capability refusal (`UNCLASSIFIED worker-visible
capability(ies): p2a_refusal_probe`), which is the gate's expected structural outcome — the refusal is thrown between
`agents.create` and the only `agent.followup`, and the Parent observed the child's own IPC report. That is a real
Worker, not a spawn-and-exit.

---

## 6. What this does NOT establish

- Not that every Win32 call behaves identically to rc.2. One path — label write, read-back, and a refused Low read —
  was exercised. The ACL binding signatures were not compared at the ABI boundary for untested paths.
- Not that the real runtime Home boundary is protected. E2 measured that it is not (98 of 98 dependency junctions
  resolve outside the examined target; no observable Mandatory Label on `~/.dsh` or `D:/dsh`), and nothing here
  changes it.
- Not a general statement about rc.3's security properties. The pin names the release this fence was qualified
  against **for the operations it performs**.
- **No historical rc.2 evidence was relabelled.** The rc.2 records remain the historical record of what was qualified
  when, and `firstQualifiedVersion`/`previouslyQualifiedVersion` keep the chain legible.
