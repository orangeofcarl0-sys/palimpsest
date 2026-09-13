# G10-G6 — Wake Closed Loop

A successful wake ends with a semantic next state (§178):

```text
RECONCILING → Project admitted → ACTIVE
RECONCILING → WAIT admitted    → DORMANT
```

The compiler produces the candidate from the CURRENT reconciled basis; an old
Project is never replayed (§145). A later Project failure leaves the Campaign
alive and allows a new observation → new compile → new Project or WAIT (§180).
WAIT candidates are admitted through the prospective/lifecycle path, never
through the Work port.
