# G10-Q Cognitive Dogfood Evidence — Real Host Federation

NONCANONICAL operational evidence. Reproduce with (after `pnpm run build`):

```bash
node scripts/dogfood/real-host-federation.mjs --out evidence.json
```

Two REAL host-backed persistent principals run as **two OS processes** (`dsh` 0.1.5-rc.2, custom
bundle `palimpsest-dsh-host`), each with its own profile, PeerRef, PersistentPoint, semantic
databases and host session, over one shared Ordarium transport ledger. The harness only launches,
observes, restarts and prints; **all semantic decisions are made by the LLM agents through the real
`palimpsest_*` tools.** No chain-of-thought is captured.

## Result

```text
result: PASS
peers:
  P: session=session-9d776313… localPeer=peer-palimpsest persistentPoint=pp-palimpsest
     transport=ordarium-durable attention=dsh-agents (in-process real agent service) application=full tools=15
  O: session=session-626924f1… localPeer=peer-ordarium  persistentPoint=pp-ordarium
     transport=ordarium-durable attention=dsh-agents (in-process real agent service) application=full tools=15
milestones:
  o_received_message            received=1
  p_has_counterproposal         pending=1 author=peer-ordarium
  p_accepted_revision           revision=0 candidateDigest=7964e907…
  commitment_offered            com-ee7bebce…:OFFERED
  commitment_decided_by_o       com-ee7bebce…:ACTIVE
  p_cold_resume_ready           mode=resume sessionId=session-9d776313…  (same principal)
  state_reconstructed_after_restart commitments=1 acceptedRevision=0
  o_remote_work_tasks           0
metrics:
  activations=4  toolCalls=12  restarts=1  coldResumes=1  userInterventions=0  failures=0  elapsedMs=46515
```

## Timeline (relative ms)

```text
+  797  workspace_seeded            ws-state-change/api, canonical home = peer-palimpsest
+ 7851  host_ready P                create, ordarium-durable, application=full, 15 tools
+ 7883  host_ready O                create, ordarium-durable, application=full, 15 tools
+10729  agent_turn O                palimpsest_attention → "No attention signal pending — staying idle"
+12258  attention_activation O      kind=inbound_peer_message activated=true   (real agent service)
+13785  milestone o_received_message received=1
+16420  agent_turn P                palimpsest_federation ×3, palimpsest_attention, palimpsest_boundary
+17968  attention_activation P      kind=boundary_decision_required activated=true
+19828  milestone p_has_counterproposal pending=1 author=peer-ordarium
+20950  attention_activation P      kind=boundary_revision_accepted activated=true
+22845  milestone p_accepted_revision revision=0
+25811  attention_activation O      kind=inbound_peer_message activated=true   (commitment offer)
+25871  milestone commitment_offered  com-ee7bebce…:OFFERED
+37934  milestone commitment_decided_by_o  com-ee7bebce…:ACTIVE
+45750  host_ready P                mode=resume, same sessionId (cold resume)
+46515  milestone state_reconstructed_after_restart commitments=1 acceptedRevision=0
```

## What this evidences

- **Real host cognition** (not mocks): two `dsh` processes; the principals call `palimpsest_*`
  tools (`palimpsest_federation`, `palimpsest_boundary`, `palimpsest_attention`) in real turns.
- **Real attention activation**: durable semantic facts produced AttentionSignals that the real
  Palimpsest host activation adapter delivered to the SAME persistent principal
  (`inbound_peer_message` → O; `boundary_decision_required` → P; `boundary_revision_accepted` → P;
  commitment offer → O). 4 activations, all `activated=true`.
- **Autonomous boundary counter-proposal**: O authored a boundary candidate
  (`author=peer-ordarium`) submitted through `palimpsest_boundary submit_remote` to P's canonical
  home; P accepted the exact revision.
- **Explicit commitment sovereignty**: P offered a commitment; O, woken by the durable message,
  decided it through `palimpsest_federation remote_decision` and it became `ACTIVE`. The decision was
  left to O (accept or reject per Ordarium's interest).
- **Sovereignty negative**: a remote request did NOT create Work in O (`o_remote_work_tasks = 0`).
- **Cold resume**: P was killed and cold-resumed from its persisted session (`mode=resume`, same
  session id) while PeerRef/PersistentPoint stayed unchanged; state reconstructed identically.
- **No human relay**: `userInterventions = 0`; the transport carried every message/operation.
- **Production path only**: `transport=ordarium-durable`, `application=full`; no `null`/recording
  attention adapter, no in-process boundary bridge, no raw store calls.

## Honest limits

- **Scenario-provided counter-proposal content**: the amended interface content came from the
  scenario prompt (§36 allows an initial scenario); the agent EXECUTED it as a real tool-mediated
  turn. The commitment decision, by contrast, was left open and the agent chose to accept.
- **In-process activation**: each principal's attention activation uses the real DSH agent service
  inside its own host process (the real `dshAgentsAttentionAdapter` bound to the live agent). The
  out-of-process variant (`dsh --resume <id> "<message>"`) is supported by the same bundle/startup
  and is used for the restart proof, but the steady-state loop is in-process.
- **One model provider**, one run; model nondeterminism is expected. Acceptance is based on semantic
  milestones, not prose.
- Duplicate-attention convergence is proven deterministically in `test/q_remote_submission.test.ts`
  (replayed operationId → one ACTIVE commitment); the real run exercised the single-delivery path.
