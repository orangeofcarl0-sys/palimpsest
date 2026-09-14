# G10-P Dogfood Evidence — Live Two-Peer Federation

NONCANONICAL operational evidence for the future Empirical Organization Evaluation stage.
Reproduce with:

```bash
pnpm run dogfood:live            # = pnpm run build && node scripts/dogfood/live-federation.mjs
# or: node scripts/dogfood/live-federation.mjs --out evidence.json
```

The runner starts TWO separately configured deployments from typed profiles over one shared
durable transport ledger, drives the spec §69 golden path against real stores/services, and emits
`{ timeline, metrics, result }`. Metrics are telemetry only — **metrics ≠ semantic truth**, and no
organization score/health scalar is produced.

## Topology

| | Peer P | Peer O |
| --- | --- | --- |
| local PeerRef | `peer-palimpsest` | `peer-ordarium` |
| PersistentPoint | `pp-palimpsest` | `pp-ordarium` |
| profile / consumer id | `deploy-palimpsest` | `deploy-ordarium` |
| transport | shared ledger, namespace `dogfood` | shared ledger, namespace `dogfood` |
| semantic DBs | separate (coordination/boundary/…) | separate |
| attention activation | `none` (pull mode) | `none` (pull mode) |

## Captured run (Ordarium v1.3.1)

```text
result: PASS   ordarium: v1.3.1
metrics:
  messageLatencyMs             88
  boundaryDecisionLatencyMs    74
  commitmentLifecycleMs        44
  duplicateTransportDeliveries  2
  duplicateSemanticMessages     1
  restarts                      3
  wakeSignalsDrained            3
  activationAttempts            3
  userInterventions             0
  failures                      0

timeline (relative ms):
  +  211  peer_p_started                     localPeer=peer-palimpsest persistentPoint=pp-palimpsest
  +  211  peer_o_started                     localPeer=peer-ordarium persistentPoint=pp-ordarium
  +  224  boundary_workspace_opened          ws-live participants=[palimpsest, ordarium]
  +  251  durable_message_sent               contactNeed=need-f367… → ordarium
  +  262  peer_o_stopped_before_ingest       (offline window)
  +  296  peer_o_restarted
  +  313  durable_replay_ingested            ingested=1 semanticLatencyMs=88
  +  314  semantic_inbox_reconstructed       received=1
  +  332  duplicate_delivery_converged       semanticMessages=1 (2 transport deliveries)
  +  367  boundary_candidate_submitted       by=peer-ordarium (counter-proposal)
  +  406  boundary_revision_accepted         candidateDigest=1780069e… latencyMs=74
  +  450  commitment_activated               com-dd5d89… latencyMs=44
  +  472  commitment_refused                 com-0cfa3b… (O rejects a second offer)
  +  503  completion_notice_observed         ingested=1 (message does NOT close the commitment)
  +  520  commitment_released                com-dd5d89… (explicit holder release)
  +  524  collaboration_projection           peers=2 workspaces=1 commitments=2
  +  535  attention_derived                  pending=2 drained=3 adapter=none (pull mode)
  +  616  both_restarted_state_reconstructed commitment=RELEASED acceptedRevision=1780069e…
  +  616  run_completed                      userInterventions=0
```

## What this evidences

- **Offline durability**: O is closed before ingest; on restart the transport replays and exactly
  one semantic message reconstructs the inbox.
- **Duplicate convergence**: two deliveries of the same `operationId` produce one semantic message
  (at-least-once transport + semantic idempotency; no exactly-once claim).
- **Boundary negotiation**: O counter-proposes durably to P's canonical home; P and O jointly accept
  the same revision; the accepted revision is canonical in ONE store.
- **Commitment lifecycle**: OFFERED → ACTIVE (explicit holder acceptance) → RELEASED (explicit holder
  release), plus a REFUSED offer; a completion notice is observed but never closes the commitment.
- **Different lived state**: distinct PeerRefs, PersistentPoints, databases and inboxes; the shared
  element is only the dumb transport substrate.
- **Attention**: derived from canonical state (2 pending facts, 3 signals drained across the run)
  with no activation adapter — pull mode remains the truth path.
- **No central planner**: the collaboration graph shows two peers and one workspace connected only by
  explicit commitment edges; no manager/scheduler exists.
- **User interventions: 0** for the mechanical path; escalation is policy-defined and was not needed.

## Known limits (honest)

- Both peers run in one process for the runner; restart is model/reopen-based, not a second OS
  process. The durable substrate is a real SQLite ledger reopened by a fresh deployment.
- Boundary reads are local-only: the durable boundary client is submission-only (a fire-and-forget
  substrate cannot honestly answer a synchronous request/response read). Remote bound reads are a
  carry-forward (CF-P-02).
- The runner uses `launchDeployment` directly; the equivalent `palimpsest serve --profile` launch
  path is proven separately in `test/p_deployment.test.ts`.
