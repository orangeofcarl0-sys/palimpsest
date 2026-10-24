# Trajectory-P2-E2 Handoff — Bounded, Nonexecuting

**Prepared by:** Palimpsest Host-S1RA
**Date:** 2026-10-25
**Status:** handoff only. No stochastic calibration was executed and no external model request was made.

This handoff states what is actually qualified, what is not, and what must be resolved before any CONTROL trial
could be authorized. It does not authorize anything.

---

## 1. Which Host runtime is actually qualified

**None, on this machine as it currently stands.**

Host-S1R qualified the confidential boundary against runtime `0.2.1-rc.2` at Code Freeze `414d84d`. The runtime
installed now is `0.2.1-rc.3`, and the shipped fence pins the qualified version and refuses on any difference:

```
refusing to run this worker: kernel-drift: the Win32 binding seam reports drift:
  resolved 0.2.1-rc.3 against qualified 0.2.1-rc.2
```

That refusal happens at pre-create, before an Agent exists, so it cannot be mistaken for a Worker outcome. It is
the fail-closed contract working. It also means no live first-party gate can execute here, which is why RA-D and
the integrated verdict are withheld.

**What IS qualified** is the engineering environment: 1,439 suites and 3,690 tests execute, fail, recover and
clean up without damaging shared dependencies, Git state, protected evidence or the runtime installation. That is
a real result and it is independent of the drift.

## 2. Which Host limitations remain

| Limitation | Consequence for E2 |
|---|---|
| Kernel drift `0.2.1-rc.3` vs qualified `0.2.1-rc.2` | every Tool-capable worker refuses at pre-create |
| Real runtime Home content boundary `NOT_ESTABLISHED` | no confidentiality claim can be made about the real `D:\dsh` contents |
| `admissionEligible: false`, 234 unqualified external links | descendant admission refuses the real installation |
| 98 of 98 dependency junctions resolve outside the runtime Home | the runtime is not contained by its own home |

## 3. Whether a Tool-capable stochastic Worker is permitted

**No.** Two independent reasons, either sufficient:

1. The worker refuses at pre-create on kernel drift, so no Tool-capable Worker can start.
2. Even with the runtime restored, descendant admission reports the real installation as unqualified, so a worker
   that could start would be one whose filesystem boundary was not established.

## 4. Whether a more restricted, tool-free epistemic study could be considered

**Yes, independently.** A tool-free study needs no worker filesystem boundary and no Win32 label write, so
neither blocker applies to it. It would still require the authorization fields in §5 and the Fixture/Oracle
freeze in §6 before any trial. This handoff does not authorize it; it records that the blockers above do not
foreclose it.

## 5. Which provider/model/cost authorization fields remain unresolved

All of them. None has been supplied:

- Provider identity and endpoint.
- Model identity and version.
- Per-trial and total cost ceiling.
- Who authorizes spend, and against which budget.
- Whether any trial may contact a paid provider at all.

No external or paid model request is authorized in Host-S1RA, and none was made.

## 6. Frozen Fixture and Oracle identity requirements

Before any CONTROL trial, both must be frozen and recorded by content identity:

- **Fixture** — the exact inputs presented to the worker, hashed, with the freeze commit named.
- **Oracle** — the exact scoring rules and expected outcomes, hashed, frozen **before** the first trial, and not
  revised in response to observed results.

A trial whose Fixture or Oracle is not frozen is not evidence, because the target can move while it is measured.

## 7. Required treatment-relevant CONTROL failure criteria

A CONTROL failure counts toward the study only when all five R2-VR conditions hold. They are preserved unchanged:

1. The outcome is **non-floor and non-ceiling** — not a task every worker fails, and not one every worker passes.
2. Variation appears across **at least two relevant dimensions**.
3. Variation appears in **Treatment-relevant CONTROL failures** specifically.
4. The available Trajectory information is **explicitly relevant** to those failures.
5. No qualification is manufactured by **Treatment-irrelevant residual failures**.

Correct `UNKNOWN` and justified deferral are **not** scored as failures. Scoring them as failures would reward
guessing over calibrated uncertainty, which is the opposite of the property under study.

## 8. Raw structured-answer retention and rescoring policy

- **Retain the raw structured answer verbatim** for every trial, including refusals, malformed output and empty
  output.
- **Retain the process exit status alongside it.** A success-shaped JSON artifact does not override a nonzero
  exit; both are recorded and both are reported.
- **Rescoring is permitted only from the retained raw answer**, never from a summary, and every rescoring run is
  recorded with the policy version that produced it.
- A rescoring that changes a verdict must keep the original verdict visible.

## 9. What this handoff does not do

- It does not authorize CONTROL or TREATMENT trials.
- It does not authorize a provider, model or budget.
- It does not propose a new stochastic runner.
- It does not claim the Trajectory measurement chain is reconfirmed; that chain runs the same workers that refuse
  at pre-create.

The single minimum blocker to revisit first is the kernel drift: restoring the runtime at `0.2.1-rc.2`, or
performing a fresh first-party qualification of the fence against `0.2.1-rc.3`, unblocks every live gate at once.
The content-boundary limitation in §2 is the next, and it requires a production Host change rather than another
reconciliation stage.
