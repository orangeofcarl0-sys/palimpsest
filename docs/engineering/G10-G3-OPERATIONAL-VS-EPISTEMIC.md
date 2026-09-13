# G10-G3 — OperationalOutcome ≠ EpistemicOutcome

Frozen (§7/§87):

```text
OperationalOutcome ≠ EpistemicOutcome
```

Operational standing is OBSERVED read-only through
`CampaignWorkObservationPort.inspectProject` (§90–§93); the Campaign never sets
Work outcome. Knowledge states are `known | unknown | error`; unknown is NOT
failed (§91).

Epistemic outcome is DERIVED from the pre/post belief of the target hypotheses
(§94): `supporting | refuting | mixed | inconclusive | stale | unchanged` via
the pure `classifyEpistemicChange`. No numeric confidence is invented.

Required valid cases (both proved):

```text
OperationalOutcome = completed   + Hypothesis SUPPORTED→CONTRADICTED
  → EpistemicOutcome = refuting                      (§96)

OperationalOutcome = failed      + admitted evidence changed the belief
  → the actual epistemic transition is recorded      (§97)
```

Operational completion alone NEVER changes CurrentBeliefState (§98): only
admitted evidence observations (G2) can.
