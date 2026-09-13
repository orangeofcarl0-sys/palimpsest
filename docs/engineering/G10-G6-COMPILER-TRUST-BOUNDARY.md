# G10-G6 — Compiler Trust Boundary

```text
canonical reconciled Campaign state
  → untrusted planner/compiler
  → strict candidate
  → validation
  → freshness check
  → explicit admission
  → existing Work engine
```

The compiler NEVER:

```text
sets CurrentBeliefState
adds/invalidates Evidence
advances an Institution epoch or changes a charter/organization
terminates a Campaign
mutates the scheduler directly
```

Malformed/invalid output mutates nothing and leaves the Campaign in its prior
lifecycle state (§179). Work admission is explicit and idempotent; the
scheduler remains short-horizon Work execution and is untouched (§16/§154).
