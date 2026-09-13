# G10-G4 — WAIT

WAIT is a first-class legitimate Campaign action (§10).

```text
Campaign may explicitly choose WAIT
WAIT installs prospective wake conditions
WAIT quiesces the Campaign
WAIT is not failure
```

`wait({campaignId, reason, watches})` installs the watches and records
`WAIT_DECIDED` as ONE atomic Campaign transition. A WAIT admission MUST have at
least one wake route (§117) — an empty wait plan is refused, so accidental
permanent dormancy is impossible. Manual wake is represented as an explicit
prospective condition/signal (§118), never as an invisible method invocation.

No numeric utility score (`VOA(wait)=0.723`) is implemented or needed.
