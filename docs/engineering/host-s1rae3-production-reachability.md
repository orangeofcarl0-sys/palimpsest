# Host-S1RA-E3-A — Production Reachability of Destructive Effects

**Stage:** Palimpsest Host-S1RA-E3
**Branch:** `host-s1rae3-resource-ownership-integrity`
**Parent (E2 Evidence Freeze):** `b6ee03cd77f726eb1b97a7c191ff5a0f5f6b9354` (tree `3adb3a5f97685fab35ebc175d5bf2fa838abd4c2`)
**Written before any production correction.**

This audit answers one question per destructive path: **can a defect reach a real deletion, and through which
caller?** A helper-level failure is not described as production-reaching without the caller path, and a helper
failure is not dismissed because a current caller usually behaves correctly.

---

## 1. The inventory

Two independent ownership implementations exist, and the difference between them is material.

| Implementation | Marker | Identity | Consumers |
|---|---|---|---|
| `scripts/trajectory_p2b/owned-resource.mjs` | `.palimpsest-owned.json` | `dev`/`ino` captured at allocation | 1 reaper, 6 gates, 3 test suites |
| `scripts/trajectory_p2e0/owned-root.mjs` | `.palimpsest-e0-owned.json` | **none** — marker fields only | 12 probe/gate scripts, 2 test suites |

They share no code. `p2e0` verifies ownership by re-reading its marker and comparing `runIdentity` and `root`;
`p2b` verifies containment, reparse status and object identity, and consults its marker only as a secondary check.

**This duplication is itself a finding.** Two modules answering "may I delete this?" differently means the
guarantee depends on which module a caller happened to import. It is reported rather than unified, because
converting twelve `p2e0` consumers is a refactor this stage's scope does not justify.

---

## 2. Destructive call chains

### Chain 1 — Gate happy-path cleanup (`rig.safeCleanup`)

| | |
|---|---|
| Entry point | `scripts/trajectory_p2b/rig.mjs:50` `safeCleanup(owned)` |
| Callers | `canonical-correlation-gate.mjs:247`, `cold-recovery-gate.mjs:329`, `cold-preview-gate.mjs:293`, `cold-capsule-gate.mjs:300`, `real-integration-gate.mjs:313` |
| Allocation origin | `rig.allocateOwnedRoot()` → `ownedResource.allocateOwnedRoot()` (`rig.mjs:29`) |
| Ownership validation | `ownedResource.revalidateOwnership(owned)` (`rig.mjs:58`) |
| Physical target | `owned.root`, a `mkdtemp` directory under the gate root |
| Authorization | **`rig.mjs:61-63`** — see the defect below |
| Destructive op | `rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })` (`rig.mjs:68`) |
| Error handling | 8 attempts, 250 ms apart, then preserve (`rig.mjs:66-75`) |
| Lifecycle status | returned to the caller and recorded as `testRootCleanup` |
| Refusal override | **yes — measured** |

**The defect.** `rig.mjs:58-64`:

```js
let proof = ownedResource.revalidateOwnership(owned);
if (proof.owned !== true) {
  const legacyOk = owned?.contained === true && owned?.isReparse === false;
  if (!legacyOk) return { cleaned: false, reason: proof.reason, checks: proof.checks, preserved: true };
  proof = { owned: true, checks: [{ check: "legacyRecord", passed: true, detail: "..." }] };
}
```

The fallback is named for legacy records, but `ownedResource.allocateOwnedRoot()` **sets `contained` and
`isReparse` on every record it produces** (`owned-resource.mjs:113`). So `legacyOk` is `true` for every record the
current allocator can create, and the branch converts **every** refusal into an authorization. It is not a legacy
path. It is the path.

Measured (F4A, F5, F10): a refused identity check, a refused parent redirection and a record with no identity at all
were each deleted by this consumer. The helper was correct in F5 — it returned `owned: false, reason: "the
directory at this path is not the object that was allocated"` — and the consumer deleted anyway.

This is the E3 core defect and it is a direct I3 violation: *no consumer may convert an ownership refusal into a
successful deletion by ignoring a return field.*

### Chain 2 — Gate lifetime (`ownedRootLifetime`)

| | |
|---|---|
| Entry point | `owned-resource.mjs:186`, wrapped by `rig.mjs:102` |
| Callers | `p2a/level-c-first-party-gate.mjs:62`, `p2d2/l2-gate.mjs:247`, `p2b`/`p2c`/`p2d0`/`p2d1` gates, `p2b/rig.mjs` |
| Authorization | `revalidateOwnership(owned)` at `owned-resource.mjs:204` |
| Destructive op | `rmSync` at `owned-resource.mjs:212` |
| Refusal override | **no** — a refusal is final and marked `refused: true` |

This chain propagates correctly. It is nonetheless the TOCTOU site: the proof at line 204 and the delete at line 212
are separate statements.

### Chain 3 — Reaper (`reapAbandonedRoots`)

| | |
|---|---|
| Entry point | `owned-resource.mjs:287`, CLI `scripts/gates/reap-gate-roots.mjs:74` |
| Selection | direct child, known prefix, not a reparse point, inside the gate root, older than the age floor |
| Ownership | marker required; schema, `ownedRoot`, live-pid and active-owner checks (`owned-resource.mjs:334-362`) |
| Destructive op | `rmSync(child, ...)` at `owned-resource.mjs:371` |
| Refusal override | **no**, and `dryRun` defaults to true |
| Reachability | operator-invoked only; `--apply` is required |

The reaper is the strongest path in the tree. It already checks `ownedRoot`, which `revalidateOwnership` does not.

### Chain 4 — `p2e0` lifecycle (`safeCleanup`)

| | |
|---|---|
| Entry point | `p2e0/owned-root.mjs:187` |
| Callers | 12 scripts plus `withOwnedRoot` (`owned-root.mjs:259`) |
| Authorization | `verifyOwnership` — marker `kind`, `runIdentity`, `root` (`owned-root.mjs:162-171`) |
| Destructive op | `rmSync(owned.root, ...)` at `owned-root.mjs:231`, after unlinking descendant links by name |
| Refusal override | **no** |
| Gap | **no object identity**: a copied marker carrying the same `runIdentity` and `root` is accepted |

The no-follow descendant scan (`owned-root.mjs:50-80`) is stronger than anything in the `p2b` module: it refuses on
an INCOMPLETE scan and unlinks links by name before the recursive removal. Its weakness is marker-only identity.

### Chain 5 — Hand-rolled allocation (`l2-gate`)

`scripts/trajectory_p2d2/l2-gate.mjs:240-247` allocates with `mkdtempSync` inline and constructs
`{ root, contained, isReparse }` by hand — no marker, no identity. It then hands that record to
`ownedRootLifetime`, which refuses identity-less records. The result is fail-closed but **leaks**: the L2 gate's root
is never reclaimed. This is the last hand-rolled allocation in the tree.

### Chain 6 — Deployment helper (`installHostBundle`)

`rig.mjs:147-158` and `p2a/level-c-first-party-gate.mjs:72-85` perform `rmSync(target, { recursive: true, force: true })`
followed by `cpSync(source, target, { recursive: true })`. `target` is `<test home>/profiles/node_modules/<package>`,
inside a disposable home. The `rmSync` is unbounded-recursive but its target is a fixed two names inside a
run-owned directory. **No refusal path exists and none is needed**, but the target class is narrow and must stay so.

---

## 3. What actually reaches a deletion

| Defect | Helper-level | Production-reaching | Path |
|---|---|---|---|
| Missing marker treated as a pass | yes | **yes** | `revalidateOwnership` → `rig.safeCleanup` → `rmSync` |
| Wrong `ownedRoot` accepted | yes | **yes** | same |
| Copied marker accepted | yes | **yes** | same |
| Refusal overridden by `legacyOk` | — | **yes** | `rig.mjs:61-63`, five gates |
| TOCTOU window between proof and delete | yes | **yes** | `owned-resource.mjs:204→212`, `rig.mjs:58→68` |
| No operation generation | yes | **yes** | every chain; a stale record authorizes indefinitely |
| `p2e0` marker-only identity | yes | yes | `p2e0/owned-root.mjs:191` |

The first four are not hypothetical: all four were reproduced with a synthetic foreign canary and the canary was
destroyed in each case.

---

## 4. Non-defects, recorded so they are not re-litigated

- **Junction inside the owned root (F6).** `rmSync(recursive)` did **not** traverse the junction; the external
  target survived. Measured, not assumed. The `p2e0` module's name-first link removal remains the safer idiom and
  is retained.
- **`EPERM` latching (F7).** The current implementation does **not** latch. A real lock (a live child process with
  its working directory inside the root) made the first attempt fail, and the retry after release succeeded.
- **Repeated disposal (F9B).** A new occupant at a reused path survives, because the recorded outcome short-circuits
  before any second deletion.
- **Legitimate disposal (F9).** Works. A design that refused everything would fail this stage.

---

## 5. Threat model, stated before the fix

**L1 — cooperative same-user.** The actors are this project's own gates, tests and reapers, plus the operator.
They share a user account, a filesystem and a temp directory. They may crash, retry, run concurrently, and be
superseded.

**Not in scope, and not claimed.** An arbitrary same-user process that deliberately races the reclaim. Ordinary
ACLs on this platform are not isolation from a process running as the same principal, and no verdict in this stage
will describe them as such.

Under L1 the correct target is: *no cooperating actor's mistake may destroy another actor's data, and no refusal may
be silently converted into a deletion.* The residual race against a hostile same-user process is reported, not
claimed closed.

---

## 6. Strategy chosen for the TOCTOU window

**Strategy A is unavailable as a complete answer.** The parent (the gate root) is shared among all gates and the
reaper, several actors can rename a target inside it, and cleanup cannot coordinate with a non-cooperating process.
There is no quiescence mechanism.

**Strategy B is adopted, with one addition.** A narrowed safe disposal policy:

1. Revalidate ownership (containment, non-reparse, identity, marker binding).
2. **Rename the directory entry to a unique quarantine name** inside the same parent — one atomic directory-entry
   operation.
3. **Verify the identity of the object now at the quarantine name.** If it is not the allocated object, rename it
   back and refuse. The substituted object is preserved.
4. Remove the quarantine name recursively.
5. **Verify the quarantine name is gone.** If it survives, report failure rather than success.

The reason this is stronger than "revalidate then delete": the object that is deleted is the object proven at step 3,
and it is deleted under a name that no cooperating actor targets. A substitution between the proof and the rename is
detected at step 3 and reversed. What remains is a substitution between step 3 and step 4, on a path whose name the
substituting process must guess, and a rename-back that could itself be raced. That residual is reported.

**Strategy C is not attempted.** No native handle work, no new binding, no change to the Win32 seam or the
qualification pin.

---

## 7. Falsifier results against this baseline

Measured by `scripts/host_s1rae3/falsifiers.mjs` before any correction:

| Arm | Outcome | Verdict |
|---|---|---|
| F1 missing marker | `owned: true`, marker absent | **UNSAFE** |
| F1C through consumer | root deleted | **UNSAFE** |
| F2 wrong `ownedRoot` | `owned: true`, only `runId` compared | **UNSAFE** |
| F2C through consumer | root deleted | **UNSAFE** |
| F3 copied marker A→B | B accepted | **UNSAFE** |
| F3C through consumer | B deleted | **UNSAFE** |
| F4A substitution before proof | replacement deleted | **UNSAFE** |
| F4B substitution after proof | canary destroyed | **UNSAFE** |
| F5 parent redirection | helper refused, consumer deleted anyway | **UNSAFE** |
| F6 junction inside root | external target survived | SAFE |
| F7 real lock + retry | failure reported, retry succeeded | SAFE |
| F8 stale operation | no generation exists | **UNSAFE (gap)** |
| F9 legitimate disposal | reclaimed | SAFE |
| F9B new occupant | survived | SAFE |
| F10 legacy-shaped record | foreign canary deleted | **UNSAFE** |

Ten of fifteen arms unsafe. F6, F7, F9 and F9B are green baselines that any correction must keep green.

---

## 8. Corrections this audit justifies

1. `revalidateOwnership`: a missing marker refuses; the marker must bind `ownedRoot`; a marker carrying a
   mismatched generation refuses.
2. `rig.safeCleanup`: the `legacyOk` override is removed. A refusal is returned as a refusal.
3. Disposal becomes quarantine-based (rename → verify → delete → verify), closing the measured window.
4. `cleaned: true` is returned only after the object is observed gone.
5. A minimal `generation` field, because F8 demonstrates an actual stale-authorization failure.
6. `l2-gate` uses the shared allocator instead of a hand-rolled record.
7. `p2e0/verifyOwnership` also compares object identity, because its marker alone is copyable.

Nothing else is proposed. No new service, no transaction manager, no durable outbox, no workflow engine.
