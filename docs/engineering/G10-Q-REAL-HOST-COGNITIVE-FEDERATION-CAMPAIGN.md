# G10-Q — Real Host Cognitive Federation & Anti-Waste Reconciliation (Campaign)

Stage nature: real-host cognitive dogfood + substrate reconciliation. No new ontology; no Empirical
Organization Evaluation.

## Topology (as executed)

| Step | Deliverable |
| --- | --- |
| Q0 | Current-state + real-host audit → `audits/G10-Q-REAL-HOST-ASSESSMENT.md` |
| Q0-R | Anti-waste reconciliation (inventory matrix, counts, source proofs, DEMOTE patches) → `audits/G10-Q-ANTI-WASTE-RECONCILIATION.md` |
| Q1 | CF-P-01…10 disposition → `audits/G10-Q-P-CARRY-FORWARD-DISPOSITION.md` |
| Q2 | Primary host chosen: **DSH 0.1.5-rc.2** (Pi conformance-only) |
| Q3/Q4 | `host/dsh` bundle: `startup` + `tools` (real registry) + `runner` (create/cold-resume + real attention loop) |
| Q5/Q6 | Two-OS-process principal harness `scripts/dogfood/real-host-federation.mjs` |
| Q7/Q8 | Boundary negotiation + commitment sovereignty cognitive E2E |
| Q9 | Restart / cold-resume proof (duplicate wake proven deterministically) |
| Q10 | Product remote-submission surface (`boundary.submitRemote`, `federation.submitRemoteDecision`) + DEMOTE annotations |
| Q11 | Real-host dogfood evidence → `audits/G10-Q-COGNITIVE-DOGFOOD-EVIDENCE.md` |
| Q12 | Docs + CI + closure |

## What was added (all additive)

- `host/dsh/` — a real DSH bundle. `lib/index.js` mounts the Palimpsest deployment from a typed
  profile via `launchDeployment` and registers every `palimpsest_*` tool into the REAL DSH tool
  registry (contract-zero passthrough; only `output.schema` relaxed to `{}`). `lib/startup.js` parses
  `[message...]`, `--resume`, `--session-file`, `--once`. `lib/runner.js` creates/cold-resumes a
  persistent principal and runs an attention loop that wakes the SAME agent through the real
  `dshAgentsAttentionAdapter`.
- `src/application/surface.ts` + `src/tools/application_tools.ts` + `src/application/http.ts` —
  `boundary.submitRemote` and `federation.submitRemoteDecision` so a NON-home peer can act through
  product tools (previously only the harness could). Peer ids written as bare strings are normalized
  to canonical `PeerRef` at the product boundary.
- `src/deployment/launch.ts` — wires a `RemoteSubmissionPort` (transport + durable boundary client);
  `submitOperation` returns its `operationId` for idempotent replay.
- `src/advanced.ts` — exports `serveOrchestration` for real host plugins.
- `test/q_remote_submission.test.ts` — deterministic proof: non-home counter-proposal + owner
  acceptance + remote commitment decision + duplicate-decision convergence + tool-schema identity
  firewall.

## Anti-waste outcome

```text
KEEP_SEMANTIC 24 · KEEP_CONSUMER_STATE 3 · BIND_PRODUCTION 10 · DEMOTE_TEST_EMBEDDING 6 ·
DELETE_REDUNDANT 0 · DEFER_TRIGGERED 2
```
`DELETE = none`, evidenced: `cursor_store` (Ordarium leaves the consumer offset host-side), `pump`
(no global ordering/revision scan/cursor generation/change-log), the callback/in-process adapters
(synchronous request/response semantics the durable submission path deliberately lacks), and
`wakePeer` vs `AttentionService` vs `AttentionActivationPort` (three distinct semantics). DEMOTE
patches: `callbackPeerTransportPort` and `callbackBoundaryTransportPort` annotated as
embedding/test; production docs describe the Ordarium-durable + real-host path only.

## Red lines held

`Notification ≠ Activation`, `TransportTruth ≠ CollaborationTruth`, `Message ≠ Commitment`,
`SessionRef ≠ PeerRef`, `Deployment config ≠ semantic authority`, `Authentication = adapter
assertion`. No global planner/manager/scheduler; no new identity species; no second truth store; no
effect authority; no chain-of-thought persistence; no autonomous merge.
