# G10-F5 — Institutional Evolution

How an institution's organization body changes over time without losing its
identity.

## 1. Replacing the body (§126)

An institution adopts a new `OrganizationDefinitionRef` through an authorized
epoch transition. `InstitutionId` is unchanged. The organization id MAY change
(Epoch 1 → O1, Epoch 2 → O2); continuity is established ONLY by the authorized
transition, never by similarity of mission or members (§128/§129).

## 2. Member replacement (§127/§148)

Proof (F5-MEM):

```text
Epoch 0  body org-1  members peer-a, peer-b
Epoch 1  body org-2  members peer-c, peer-d
Epoch 2  body org-3  members peer-e, peer-f

InstitutionId = "inst-1" throughout
```

Member replacement does not depend on runtime sessions, PersistentPoints, or
peer transport availability: the kernel has no such dependencies (§163).

## 3. Governed transformation

When the new body comes from a transformation:

```text
assessment admissible          (unresolved obligations block adoption)
organization revisions activated atomically
InstitutionTransitionProposal  (baseEpoch = current head)
current-charter approvals meet requiredApprovals
advance → new InstitutionEpoch (predecessor = previous head)
```

Governance approval does NOT verify truth and does NOT satisfy structural or
evidence obligations (§144/§145).

## 4. Split under an institution (§146)

```text
split candidate → organizations A and B
institution explicitly adopts A  (or B, or a synthesized body)
B remains a standalone organization
```

The institution does NOT automatically become two institutions. Institution
fork semantics beyond simple new genesis are deferred.

## 5. Merge under an institution (§147)

```text
merge candidate → organization M
institution explicitly adopts M
```

The institutions of the sources are NOT merged. Institutional merger is a
separate future semantic operation and is not invented here.

## 6. Authority over evolution (§111)

Advancement is authorized under the CURRENT charter's continuation authority.
Changing the authority set requires approval by the current authorities, so a
new authority set cannot authorize itself.

## 7. Determinism

Every step is replayable from the append-only institution history: charters,
transitions, approvals, and epochs. The head is a verified projection of that
history; the derived `institutionBodyView` composes the head epoch, current
charter, and current organization body without adding canonical truth.
