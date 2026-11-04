# ALHS live cohort state

## `alhs-c-2026-11-04` — PRE-REGISTERED, NOT AUTHORIZED, NOT RUN

`cohort-pre-registration.json` registers the F/L/A/G comparison described in
`docs/programs/alhs/ALHS-C-PROTOCOL.md` against code freeze
`1227a7478d20954e0366d8e9ccec8c62763171b9`.

`run-plan.json` is the gate's expanded budget plan for the **core** stage (F and A, 2 sessions each):

- 4 sessions, 3,000,000 ceiling per session, 150,000 reserve, soft stop 2,850,000;
- planned ceiling 12,000,000; effective stop sum 11,400,000.

`BLOCKED.json` is the recorded fail-closed result:

- no `alhs-spend-authorization/v1` exists;
- `modelCalls=0`;
- exit code 2;
- the LHAPE-C 7.5M pilot authorization is a different schema and cohort and does not transfer.

The gate also refuses an authorized run with `ADAPTER_NOT_CONFIGURED` (exit 3, `modelCalls=0`) until
an explicit per-session execution adapter is supplied. No model was started in either case.

## What is not here

There is no `authorization.json`, no session directory and no condition record. There is no F/A
comparison, no real-model ALHS session, and no natural-convergence claim from a model. The only
execution evidence is the deterministic real-host run in
`research-evidence/alhs/2026-11-04/host-run/`; its model content is a labelled Messages stand-in.
