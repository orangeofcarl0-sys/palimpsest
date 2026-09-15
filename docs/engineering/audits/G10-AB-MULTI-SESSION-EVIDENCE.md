# G10-AB — Multi-session evidence

Evidence that a durable project reconstructs the same operating posture and
management history after a restart, and that a crash never fabricates success.

Reproducer: `scripts/operating/multi-session.mjs`.

## 1. Session 1 — the operator chooses a posture, management acts

```text
before:  Work Mode FOCUS (source: safe_default), modifiers [], involvement DIRECT
operator: setWorkModePreference(EXPLORE, [VERIFY], "operator:session1")
operator: applyOperatorModeChange(MANAGE, "operator:session1")
management: step({ confirmed: true })
```

Result:

| Fact | Value |
| --- | --- |
| Work Mode after | `EXPLORE` + `VERIFY`, source `stored` |
| Involvement after | `MANAGE` |
| Capability warnings | "EXPLORE is preferred but unavailable: no reasoning-branch execution port is configured"; "VERIFY is preferred but unavailable: no independent verifier is configured; same-model same-context is not verification" |
| Step | `executed` / `DISPATCH_LOCAL_WORK` / `plan_revision_applied` |
| Activity | `OPERATOR_WORK_MODE_CHANGE`, `OPERATOR_MANAGEMENT_MODE_CHANGE`, `DISPATCH_LOCAL_WORK:selected`, `DISPATCH_LOCAL_WORK:executed` |
| Canonical refs on the terminal record | `work_event:5`, `project_revision:1` |
| `session1InitialSafeDefault` | `true` |

The starting posture is the **safe default** because nothing is stored yet - and it
says so rather than presenting FOCUS as a user choice.

## 2. Session 2 — a SEPARATE process reopens the same stores

| Fact | Value |
| --- | --- |
| Work Mode | `EXPLORE` + `VERIFY`, source `stored` |
| Involvement | `MANAGE` |
| Work Mode changes in history | 1 |
| Management mode changes in history | 1 |
| Activity records | 4 |
| Unresolved activity | 0 |
| Operating-history counts | workModeChanges 1, managementModeChanges 1, managementActivity 4, unresolvedActivity 0, incompleteCanonicalRefs 0 |
| Chain verified | `true` |

## 3. Crash between the activity phases (real SIGKILL)

A child process appends the SELECTED record and is `SIGKILL`ed the instant that row
is durable, before the governed action runs:

```text
{"phase":"crash_seam","crashSurvived":false,"childExitStatus":1,"childStderrHead":null}
```

The child exited with **no stderr**, i.e. it was killed rather than failing - the
genuine crash window. A later process reading the same store reports:

| Fact | Value |
| --- | --- |
| Total records | 1 |
| Unresolved records | 1 |
| Any `executed` decision | **false** |
| Chain verified | `true` |
| `honest` | `true` |

So the SELECTED phase survived, the terminal phase never happened, and history did
**not** claim success. A record can later be terminalized as `interrupted` with a
mechanically proven classification, and even then the reason says only that the
canonical owner remains authoritative.

## 4. Orthogonality, in the same evidence

Session 1 sets `EXPLORE` and `MANAGE` independently; session 2 reads them back
independently. `test/ab_adversarial.test.ts` additionally walks all twelve
combinations (`AB-N04`) and asserts that `FOCUS + DELEGATE` does not force
multi-agent topology and `EXPLORE + DIRECT` grants no proactive management.

## 5. Preference vs eligibility

`AB-N27` and the ordering suite prove that a preference selects only among
**already eligible** candidates, that a candidate which names no recipe is never
promoted by preference, and that when the preferred mode has no eligible candidate
the explanation says the preference was blocked by eligibility rather than bending
it.

## 6. FOCUS + DIRECT conventional path

`AB-N07`/`AB-N08` and the behavioural suite prove the total safe fallback:
Work Mode → `FOCUS` with no modifiers, Management → `DIRECT` with no automatically
permitted proactive action class, and `source: "safe_default"` surfaced so the UI
never presents a default as a decision.
