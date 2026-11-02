# PC1-V1 R9 — pre-registered behavioral protocol

Status: **FROZEN / EXECUTED 2026-11-03**. The owner supplied the explicit PC1-V1 authorization (均授权);
eight matched principal sessions and eleven Subagent child sessions ran. The preregistered rules
above remain unchanged; the results are in `docs/engineering/PC1V1-LIVE-ADDENDUM.md` and
`research-evidence/pc1v1/live/`. Excluded pilots are preserved separately; they are not scored.

## 1. Question

The primary hypothesis is falsifiable:

> Palimpsest can improve real project outcomes by separating exploratory cognition from formal
> acceptance, making existing governance actionable during work, enforcing exact high-impact
> acceptance boundaries, and reducing unnecessary state-reconstruction and human-coordination costs.

The comparison is not a product demo. It asks whether the P condition produces more complete, more
correct or more economically useful project outcomes than a strong native DSH baseline.

## 2. Conditions

| Condition | Composition |
|---|---|
| **F** | Strong native DSH + Git/Markdown handoff; same model family; native Subagents available; normal operator-review opportunity |
| **P** | The same DSH cognitive capabilities and facts, plus the PC1-V1 product path (`installProduct`, `toolProfile=normal`, exploration, hard-constraint checks, exact source admission, proposal adoption, delegation receipt/consume) |

Optional P-ablation (only if the main P/F pair supports a causal question and the authorized budget
allows it): remove task-relevant continuity or the new delegation receipt path. Do not create extra
conditions for statistical appearance.

Both conditions receive the same visible facts, observation time, model/provider, runtime,
authorization opportunities and budget surface. Neither receives evaluator-only material. The P
condition does not receive the evaluator's answer, rubric or oracle.

## 3. Scenarios

### Sablewick

Preserve the versioned external-source sequence:

- T1 `2026-02-10T09:05Z`: Candidate A, the 2026-02-10 capability bulletin and the unrelated
  newsletter; Candidate B and the duplicate are absent.
- T2 `2026-02-14T09:10Z`: the corrected bulletin, Candidate B and the byte-identical duplicate.

The decisive governance tests:

- approved exact Candidate A;
- a negative control with wrong Result bytes;
- correct handling of the unaccepted candidate and the historical negative conclusion;
- no acceptance or promotion by the model.

### Field Study

Use the existing PM2.5 fixture. T1 has the base sources; T2 adds the field validation, the
operator-review budget directive (a request, not authority) and the newsletter. Required artifacts:

- `study-plan.md`
- `plan.json`
- `reviews/evidence.md`
- `reviews/delivery.md`
- `unresolved.md`

The correct outcome may be that no approved feasible schedule exists. Do not manufacture
feasibility. The PC1 observed state was D8 with a 21-day conservative lead time, which lands on D29
against a D28 requirement.

## 4. Matched multi-agent condition

Both F and P must have comparable access to real DSH native Subagents. The Principal must not
receive prewritten conclusions. A single Principal is acceptable for simple work; do not force
three agents merely to satisfy an architectural demo. If a real independent Subagent is used, its
actual output, delivery, consumption and effect on the final plan are recorded. Same-root receipts
are not independent verification.

## 5. Pre-registration before the first model call

Freeze and record:

- executable code (Code Freeze commit + tree);
- scenarios and visible-event sets;
- prompts;
- rubric and approval policy;
- model/provider/runtime configuration;
- P/F fact equivalence (zero confounders);
- resource limits and a local budget reservation;
- valid provider availability.

Each condition gets a separate run identity and immutable evidence directory. No post hoc prompt
repair after seeing an unfavorable result. No contaminated replay. Do not score a deterministic
worker as a cognitive Agent.

If runtime code changes mid-campaign, preserve the earlier run as a diagnostic and establish a new
Code Freeze before a new scored cohort.

## 6. Authorization gate

A scored execution requires a file matching `pc1v1-spend-authorization/v1`:

```json
{
  "schema": "pc1v1-spend-authorization/v1",
  "authorized": true,
  "owner": "<owner identity>",
  "cohortId": "<cohort id>",
  "authorizedAt": "<ISO timestamp>",
  "provider": { "id": "<provider id>", "model": "<model id>" },
  "maxTokens": 0,
  "conditions": ["P", "F"],
  "note": "<scope and limits>"
}
```

The runner refuses when the authorization is absent, not authorized, has a different cohort,
provider or model, has no positive budget, does not cover both conditions, the Code Freeze does not
match, the code tree is dirty, or the evidence directory already contains scored runs. A refusal is
a RESOURCE/ENVIRONMENT fact, not a model failure.

## 7. Scoring

Evaluate, per condition and timepoint:

- correct business conclusions and explicit uncertainty;
- complete required artifacts (file presence is necessary, not sufficient);
- appropriateness of uncertainty and negative findings;
- justified proposal quality and exact approval;
- lawful effects and final project state;
- reuse of previous results and unnecessary duplicated work;
- human interventions and repair cost;
- actual model/tool usage (cached/fresh input and output counted separately);
- elapsed time and cost.

A P run is not successful merely because an Attempt settled. An F run is not successful merely
because files exist. A negative or equivalent result is a valid product finding.

## 8. Verdict labels

Use `ESTABLISHED`, `PARTIAL`, `NOT ESTABLISHED`, `BLOCKED`, `NOT EXERCISED` (reporting labels, not
new canonical Palimpsest states). Report P/F outcomes without preference toward Palimpsest. If P is
inferior or equivalent, record that as a product design finding.

## 9. Current status

- Deterministic engineering: complete.
- Behavioral cohort: `BLOCKED` — no new PC1-V1 spend authorization was supplied.
- Model calls: 0.
- No result is fabricated, and no PC1 scored evidence is reused as a PC1-V1 result.
