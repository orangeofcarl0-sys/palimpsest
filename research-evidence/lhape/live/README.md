# LHAPE live cohort evidence

`cohort-pre-registration.json` registers the proposed F/L/G long-horizon cohort against code freeze
`e59a9112c11ea45e4300e20e30ca7e2136d7cf24`.

`lhape-c-long-horizon-2026-11-03/BLOCKED.json` is the fail-closed gate result: no LHAPE spend
authorization is present, so `modelCalls=0` and the cohort did not start. The APS pilot authorization
does not transfer.

To run a authorized cohort, an owner must supply a current `lhape-spend-authorization/v1` covering
this exact cohort, provider, F/L/G conditions and aggregate ceiling, re-freeze the code, and invoke:

```bash
node scripts/lhape/run_cohort.mjs \
  --cohort=research-evidence/lhape/live/cohort-pre-registration.json \
  --authorization=<path> \
  --execute=true
```

The per-session budget guard reads the real DSH usage stream; the local hard cap is 8,000,000 tokens.
