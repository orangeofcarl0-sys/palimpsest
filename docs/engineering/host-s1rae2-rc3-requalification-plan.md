# Proposed `0.2.1-rc.3` Requalification Plan

**Status:** proposal only. Nothing in this document has been executed, and no qualification pin has been changed.
**Produced by:** Palimpsest Host-S1RA-E2, 2026-10-25.
**Authority:** §9 of the E2 stage ruling, which requires this plan when a qualified `0.2.1-rc.2` runtime cannot be
replayed safely. §6 established that it cannot: no artifact at that version exists on this machine.

---

## 1. Why this plan exists

The shipped Win32 binding fence pins `qualifiedVersion: '0.2.1-rc.2'` and refuses any worker whose resolved seam
differs. The installed seam is `0.2.1-rc.3`. The refusal is unconditional:

```js
if (kernel.contract?.drifted === true) {
  refuse('kernel-drift', `... resolved ${...} against qualified ${...}`);
}
```

No override exists, and none should be added. A read-only search covered the repository runtimes directory, the
dsh-meld checkout, the npm global tree, the npm cache index and the pnpm store. It found three artifacts and none
at the required version:

| Path | Version | Relevant? |
|---|---|---|
| `.runtimes/dsh-020-win32/pkg` | `0.2.0-rc.2` | the *previously* qualified version, two releases back |
| `dsh-meld/node_modules/.../dsh-win32-process` | `0.2.1-alpha.2` | different release line |
| npm global tree | `0.2.1-rc.3` | the installed one |

A directory *named* `0.2.1-rc.2` was never accepted as evidence; only a manifest reporting that version would count.

---

## 2. What rc.3 changes, and why the pin cannot simply move

### 2.1 Package and native binding changes

`@deepseek-ai/dsh-win32-process` `0.2.1-rc.2` → `0.2.1-rc.3`:

- `@deepseek-ai/dsh-lazy-require` moves from `0.2.1-rc.2` to `0.2.1-rc.3`.
- `koffi` stays at `3.1.1`, which matches `FFI_RUNTIME_QUALIFIED`. **The FFI runtime did not move.**
- The seam export `extendWin32ProcessBindings` and the five helpers the fence uses
  (`allocPtrSlot`, `allocUint32`, `decodePtr`, `decodeUint32`, `isNullPtr`) are all still present and still
  functions — measured by importing the installed package directly.

### 2.2 What that does and does not establish

It establishes that the **symbol surface** the fence depends on is intact. It does **not** establish that the
Win32 calls behave identically. The fence binds:

```
CreateWellKnownSid, GetLengthSid, InitializeAcl, AddMandatoryAce,
SetNamedSecurityInfoW, GetNamedSecurityInfoW   (advapi32)
LocalFree                                       (kernel32, optional)
```

with explicit signatures. A signature-compatible export that behaves differently at the ABI boundary is exactly
what the pin exists to catch, and no amount of symbol inspection rules it out.

### 2.3 Potential compatibility impact

| Area | Risk | Why |
|---|---|---|
| ACL binding signatures | **unknown** | unchanged exports do not prove unchanged marshalling |
| Mandatory label write path | **unknown** | the operation this fence exists to perform |
| Label read path (`readMandatoryLabel`) | **unknown** | the previous requalification repaired a defect here |
| Junction traversal semantics | low | OS behaviour, not package behaviour |
| koffi | **none** | pinned and matching |

The honest position is that rc.3 is *plausibly* compatible and *unproven*. That is the gap.

---

## 3. Dependency integrity and provenance

Before any requalification run:

1. Record the `0.2.1-rc.3` manifest digest and the resolved path of every package the fence loads.
2. Confirm `koffi` resolves to `3.1.1` **from the seam package's own dependency graph**, not from a global
   install — the existing contract already enforces this, and it must keep doing so.
3. Record the npm registry tarball digest for the installed version so the artifact is identifiable later.
4. Confirm the install is not a junction into an unrelated checkout. On this machine the runtime home *is* a
   junction (`~/.dsh` → `D:\dsh`) and 98 of 98 dependency entries resolve outside it; a requalification must state
   whether that layout is the one being qualified.

---

## 4. Windows security-boundary implications

Requalification must re-establish, not assume:

- That a `NO_READ_UP` label written through the rc.3 seam actually refuses a Low-integrity read.
- That the refusal is the **Mandatory Integrity** mechanism, not an incidental ACL effect. An `EPERM` alone is not
  proof; the previous stage's synthetic arm had to distinguish `LABEL_NOT_APPLIED` from `PROTECTED` precisely
  because an unapplied label produces an ordinary successful read.
- That a label on a **link** is still not treated as coverage of its target.

---

## 5. Required synthetic controls

All on disposable, test-owned fixtures, on a label-writable volume:

| Control | Expected |
|---|---|
| Label write through the rc.3 seam | `supported: true`, `rootsVerified: true` |
| Low-integrity read of a labelled directory | refused |
| Low-integrity read of an **unlabelled** control | succeeds (proves the probe works) |
| Labelled **link**, unlabelled target | read refused, and descendant verification still reports unverified |
| Trusted runtime dependency under a labelled target | still readable |
| Label read-back | matches what was written |
| `koffi` version resolved from the seam package | `3.1.1` |

A control that cannot create its fixture must report `LIMIT`, never pass.

---

## 6. Required Live Gates

Run only after §5 passes, against a committed Code Freeze:

- `scripts/trajectory_p2a/level-c-first-party-gate.mjs`
- `scripts/trajectory_p2b/level-b-first-party-gate.mjs`
- `scripts/trajectory_p2b/canonical-correlation-gate.mjs`
- `scripts/trajectory_p2b/cold-recovery-gate.mjs`
- `scripts/trajectory_p2c/cold-preview-gate.mjs`
- `scripts/trajectory_p2d0/cold-capsule-gate.mjs`
- `scripts/trajectory_p2d1/real-integration-gate.mjs`
- `scripts/trajectory_p2d2/l2-gate.mjs`

Plus R1-HR and R1-HC conformance, and the affected trajectory gate suites.

`SKIPPED` and `BLOCKED` are not `PASS`. A gate that refuses at pre-create has not been requalified.

---

## 7. Code Freeze and Evidence Freeze requirements

- The pin change (`qualifiedVersion: '0.2.1-rc.2'` → `'0.2.1-rc.3'`) is an **executable change** and belongs to
  its own bounded stage with its own Code Freeze.
- It must not be bundled with unrelated corrections.
- The Evidence Freeze must contain no executable change.
- The new evidence must name the runtime identity it measured, and must not overwrite the `0.2.1-rc.2` records —
  those remain the historical record of what was qualified when.

---

## 8. Acceptance and stop conditions

**Accept only when:**

- every §5 control produces its expected observation, with `LIMIT` distinguished from `PASS`;
- every §6 gate reports `PASS` and `qualified: true` against the new freeze;
- dependency invariants hold before and after;
- the 52 protected trees are unchanged;
- the real runtime Home boundary is reported **separately** and is not upgraded by the gates passing.

**Stop when:**

- any §5 control cannot create its fixture and would have to be reported as a pass;
- the seam resolves a `koffi` other than `3.1.1`;
- a gate reports `SKIPPED`/`BLOCKED` and a reader could mistake it for a qualification;
- a label write succeeds but the low-integrity read also succeeds (that is a disclosure, not a pass);
- requalification would require writing a security descriptor on the real installation.

---

## 9. What this plan deliberately does not do

- It does not change `qualifiedVersion`.
- It does not install, remove or downgrade any runtime.
- It does not modify `~/.dsh` or `D:\dsh`.
- It does not assert that rc.3 is compatible; it defines what would have to be measured to say so.

The single sentence version: **rc.3 is symbol-compatible with the fence and behaviourally unproven, and moving the
pin without the §5 controls would convert an unknown into a false qualification.**
