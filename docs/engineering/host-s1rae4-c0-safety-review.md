# Host-S1RA-E4-C0 — Limited Safety Review Before Live Execution

**Stage:** Palimpsest Host-S1RA-E4
**Scope:** only the checks needed to establish that the selected live Host path operates inside its supported
resource boundary. The E3 architecture is not reopened.

---

## C0.1 — Quarantine disposal, read from the current implementation

`scripts/trajectory_p2b/owned-resource.mjs:disposeOwnedRoot` performs:

| Step | What it proves | Failure behaviour |
|---|---|---|
| 1. `revalidateOwnership` | containment, non-reparse, `dev`/`ino` identity, marker binds root + generation | refuses, `preserved: true`, `refused: true` |
| 2. `renameSync(root, quarantine)` | one directory-entry operation | reports the rename failure, retryable |
| 3. identity re-check at the quarantine name | the object about to be deleted is the object proven in step 1 | a substituted object is renamed BACK and preserved |
| 4. `rmSync(quarantine)` | the deletion | restores the object where possible, never reports success |
| 5. `existsSync(quarantine)` | completion is OBSERVED, not assumed | reports failure if the name survives |

`p2e0/owned-root.mjs:safeCleanup` has the same five steps plus its stronger link handling: it scans descendants for
reparse points with `lstat`, refuses an INCOMPLETE scan, and unlinks links **by name** before the recursive removal.

**Measured behaviour of the selected gate's cleanup.** The level-B gate ran and its disposal receipt is:

```json
{ "cleaned": true, "quarantined": true, "attempts": 1,
  "checks": [ { "check": "record", "passed": true },
              { "check": "identityMatch", "passed": true, "detail": "dev/ino match the allocation" },
              { "check": "marker", "passed": true, "detail": "marker binds this root at generation 1" } ] }
```

The gate root held 19 entries before that run and 19 after. No `.q-` quarantine debris remained.

**Consumers that bypass the shared logic: none on this path.** `level-b` delegates its local `safeCleanup` to
`ownedResource.disposeOwnedRoot` (E3-B), and `ownedRootLifetime` calls the same function. The reaper calls it too.
The only `rmSync` left in the gate path is `installHostBundle`'s removal of a fixed two-name target inside the
run-owned home, which is bounded by construction.

### What is NOT claimed

- **A random quarantine name is not hostile same-user isolation.** It defeats a cooperating actor's stale path and
  makes the substitution detectable, and nothing more.
- **The residual window is real.** A substitution between step 3 and step 4, on a name the substituting process must
  guess, is not closed. A rename-back that is itself raced is not closed.
- **Rollback collision and foreign-object preservation are covered by synthetic fixtures**, not by this review:
  E3 falsifiers F4C, F4D, F5 and F10, and mutation controls M4, M5 and M8, each measured with a foreign canary.

---

## C0.2 — Module-sharing provenance

`module-sharing.mjs` now has two independent admission conditions, and this review states what each one actually
establishes:

| Condition | What it proves | What it does NOT prove |
|---|---|---|
| `providedByCaller` name + destination is a plain `DIRECTORY` | the caller intended this name and the object is not a link or a file | that the caller created it |
| `expectedFingerprints[name]` matched by `directoryFingerprint` | the destination's path-and-size shape equals the tree the caller's installer copies from | **not content equality** — sizes and paths only, and not a trusted build artifact |

**Where the expected fingerprints come from.** `rig.linkSharedModules` and `p2a/level-c-first-party-gate` compute
them from `host/dsh` and `host/deployment` **in the current working tree**. That is *content equality with the
current source tree*, which is the first of the three categories the ruling names. It is **not** a match against a
frozen build artifact, and it is **not** independent installation provenance.

**The audit's own finding, and its bound.** E4 measured that a declaration alone was the whole provenance test before
this stage (sharing audit case 3). It is no longer: mismatched content is refused. But a hash computed from the
destination would not be independent verification, and this stage did not introduce one. The trust anchor is the
working tree, which is the same trust already placed in the code being tested.

**Verified for the selected gate:** the level-B gate installs its host bundle from the repository's own `host/`
directories into a run-owned home, and the fingerprint is computed from those same directories. A foreign directory
at a declared name whose shape differs is refused (sharing audit case 3); a matching one is admitted and recorded as
`VERIFIED_AGAINST_EXPECTED_FINGERPRINT` (case 3b). A junction at a declared name is refused (cases 4 and 5).

**Not done:** module installation was not rewritten. The existing boundary is sufficient for this experiment.

---

## C0.3 — Permission and threat model, stated explicitly

**The selected live path relies on cooperative L1 safety. It does NOT rely on, and this stage does not claim,
OS-enforced L2 isolation.**

Concretely:

- the Worker and the Host run as the **same user**, with unrestricted same-user filesystem permissions;
- the test home, the gate root and the fixtures are ordinary directories under the same account;
- the quarantine rename and the marker/identity checks make a *cooperating* actor's mistake detectable and refuse
  deletion of a foreign object, but any process running as this principal can read and write the same paths;
- `~/.dsh` is a junction to `D:/dsh`, and neither object carries an observable Mandatory Label (E2 measured this;
  E4 did not upgrade it).

The E4 qualification is therefore **controlled run-owned execution under documented L1 conditions**, and the
real-Host verdict is scoped to that.

---

## What the safety review concluded for the selected path

The selected gate is admissible for a bounded single-run experiment:

- its cleanup uses the E3 quarantine path and was observed to complete with `cleaned: true` and no residue;
- its module sharing uses the fingerprinted admission and was observed to establish the graph;
- it writes only inside its run-owned root, which the gate root's unchanged entry count confirms;
- it does not modify the global runtime installation;
- its threat model is L1 and is stated rather than implied.

The remaining limitation is the one E3 already reported and this review does not remove: **the TOCTOU residual
against an arbitrary same-user process is open**, and no result here closes it.
