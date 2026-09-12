# G10-E2 — Peer Identity & Contact Grounding

Status: **G10-E2 · PEER IDENTITY + CONTACT NEED + DISCOVERY · EXPLICIT · DETERMINISTIC · NOT A FROZEN CONTRACT**

## 1. PeerRef (§41/§42)

```ts
interface PeerRef { readonly schemaVersion: 1; readonly peerId: PeerId }
```

A stable **addressable collaboration identity** — shared stable-identifier
grammar, deep-frozen, strict parser. It is NOT runtime carrier identity,
session identity, PersistentPoint identity, AgentDefinition identity, a user
account, or an authority root; it embeds NO transport address (URLs,
endpoints, `//host` shapes are rejected by the grammar, E2-M06). Firewalls
E2-M01..M05 proven structurally (`peerId` is its own namespace; string
equality with other namespaces implies no relation).

## 2. PeerContinuityAssociation (§44)

`{peer, point}` — the explicit link artifact for use cases that need one.
**Association ≠ identity**; `PeerRef ≡ PersistentPoint` remains unfrozen. The
PeerRef itself carries no point field.

## 3. PeerAdvertisement (§45–§47)

`{peer, competenceTags}` (semantic set, deep-frozen). `PeerAdvertisement ≠
Evidence`; `advertised competence ≠ verified competence`; NO
authorityGrants/permissions/effectRights fields exist (machine-audited) —
"I can do X" grants nothing.

## 4. ContactNeed (§48–§50)

`{schemaVersion, contactNeedId, origin: attempt|activation|runtime_scope,
competenceTags, reason}` — EXPLICIT creation only; no auto-derivation from
blocked tasks, dependencies, or worker failures (no such derivation exists in
the module — audited). `Ownership ≠ ContactNeed`: the artifact carries no
owner/assignment/obligation semantics.

## 5. Discovery (§51–§54)

`PeerDirectoryPort.observePeers()` with the D4 knowledge states —
**unknown ≠ empty directory** (propagates as `directory_unknown`, never a
zero-candidate result). `matchContactCandidates(need, ads)`: PURE
deterministic subset matching (requested tags ⊆ advertised tags; a need with
no requested tags matches nothing) with lexical peer ordering — no ML
ranking, no state mutation. A `ContactCandidate` is exactly
`{peer, advertisement}` — "worth contacting", never selection/assignment/
commitment (E2-M12).

Local focus (§55) is a view preference on the caller side; the federation
module contains no authority-root concept (machine-audited) — **UserFocus ≠
AuthorityRoot**.

## 6. Machine proofs (§56)

`test/peer_identity.test.ts` (10 tests): E2-M01..M12 as enumerated. Full unit
at E2 close: **79 files / 680 tests**.
