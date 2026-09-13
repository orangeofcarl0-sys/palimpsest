# G10-E5 — Bottom-Up Collaboration Record

The campaign's central principle (§4/§119/§175):

$$
Persistent/Addressable\ AI\ Manpower \rightarrow Real\ Need \rightarrow Contact
\rightarrow Negotiation \rightarrow Commitment \rightarrow Collaboration
$$

NOT `Task → central planner → assign agents`.

Machine-demonstrated in the §128 end-to-end flow: a canonical Attempt +
independently existing Activation → declared ContactNeed → discovered
candidate (Peer-B) → commitment offer + transport message → authenticated
Peer-B acceptance → ACTIVE commitment → explicit Participation → thread
messages + explicit ack → Peer-B offers a handoff to Peer-C → authenticated
acceptance → old commitment SUPERSEDED and successor responsibility ACTIVE for
Peer-C — with **no Evidence created**, **no Work event types** in the
coordination store, **no scheduler involvement**, and **no global manager**.

Guardrails proven by construction and test:

- discovery assigns nothing (store still empty after `findCandidates`);
- participation is never automatic from a commitment (§125);
- wake produces attention only (§129);
- a conversation with acks yields zero agreement (§130);
- plain Work tasks produce zero commitments/participations (§131).
