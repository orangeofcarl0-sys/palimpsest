# G10-E2 — Peer Discovery Record

The discovery boundary and its discipline:

| Aspect | Decision |
| --- | --- |
| Port | `PeerDirectoryPort.observePeers(): Promise<ObservationKnowledge<PeerAdvertisement[]>>` — host-neutral, read-only |
| Knowledge states | `known` → facts usable; `unknown` → `directory_unknown` (NEVER "no peers"); `error` → `directory_error` (D4 discipline reused) |
| Matching | pure: requested competenceTags ⊆ advertisement competenceTags; lexical peer order; deterministic (same inputs → same candidates, proven with reordered inputs) |
| Empty requested set | matches nothing — no blanket contact |
| Output | `ContactCandidate {peer, advertisement}` — "worth contacting" only |
| Mutation | none — candidate generation creates no relation, no assignment, no commitment |
| Ranking | none — no ML, no trust scores (§6 non-goals) |

Non-equivalences held: advertisement ≠ evidence (§46); advertised competence
≠ verified competence and ≠ authority grant (§47); candidate ≠ assignment
(§54); unknown directory ≠ empty directory (§52).
