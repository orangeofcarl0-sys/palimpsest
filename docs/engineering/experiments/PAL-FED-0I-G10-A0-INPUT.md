# PAL-FED-0I — G10-A0 Evidence Input

Status: EXPERIMENTAL. Labels: `[machine]`, `[observed]`, `[stat]`,
`[unsupported]`, `[rejected]`. Source: the frozen 96-run study on
`experiment/pal-fed-0i`; all conflicts are `oracle_fixture`.

## WorkerReport ≠ Evidence `[observed]`

An Agent's self-reported final disposition is a worker report, not evidence. In
A0, 8/9 I runs asserted a resolved conclusion and it was admitted on the Agent's
word alone; those conclusions were subsequently scored 4 correct / 2 incorrect /
3 unresolved. The report's confidence carried no admission weight of its own.

## AgentConfidence ≠ PolicyAdmissibleDecision `[machine]`

The gate never reads prose confidence. Admission is a deterministic function of
`(disposition, projected ticket state, arm, prior soft interventions)`. ABM:
the model has no channel to supply ticket/owner/mode/run fields (machine test
ADM-A09); `decision_submit`'s entire model surface is `disposition` + `body`.

## Does one-shot intervention help? `[stat]`

Yes, exploratorily. A single refusal (`A1`) produced recovery in **9/9** I runs
(contact the owner or abstain before resubmitting) versus **1/9** in A0;
`OneShotRecoveryRate_A1 = 100%`. It also changed the *first* post-intervention
move to owner contact in 78% of runs with no routing instruction.

## Does persistent enforcement add value? `[stat]` `[unsupported]`

On contact, **no**: `AdmissionInducedContactLift(A2−A1) = 0.00` (100% vs 100%,
Fisher p = 1.000). On abstention / owner participation the direction is higher
(67% vs 44%) but **not significant** (p = 0.637) and ceiling-bound: A1 already
reached 100% contact, so no headroom existed. `[rejected]` the claim that hard
enforcement is *necessary* for recovery pressure. `[unsupported]` any claim that
it is *more* effective than the one-shot gate at this n.

## Does admission pressure induce autonomous collaboration? `[observed]`

Yes — and bottom-up, not routed. The diagnostic never names a peer, thread or
tool; nevertheless A1/A2 runs autonomously opened an owner consultation in
78%/100% of cases and 44%/67% obtained an authenticated owner reply. This
supports `GovernanceConstraint → EmergentCollaboration`, not
`CentralPlanner → AssignedCommunication`. Caveat `[stat]`: the effect is already
saturated by the one-shot gate, so the marginal contribution of *persistence*
is zero.

## Is explicit abstention a practical recovery path? `[observed]`

Yes. Abstention was always admissible, was reached in 44% (A1) / 67% (A2) of I
runs, and `DeadEndRate_A2 = 0%` with final-admitted 100%. No Agent was trapped;
"I cannot legitimately determine this yet" was a live, self-selected exit.

## Does owner participation improve semantic correctness? `[observed]` `[rejected]`

No. The three A2 runs admitted resolved **under owner participation** were
**all `SEMANTICALLY_INCORRECT`**. Aggregate semantic correctness fell rather than
rose under enforcement (A0 4/9, A1 3/9, A2 1/9 correct; more abstention).

## Is owner participation itself sufficient? `[rejected]`

No. Participation proves only that the configured owner replied on the
consultation thread — not that the reply was understood, incorporated, or
correct. `OwnerParticipation ≠ SemanticResolution` and `≠ TruthCertificate`,
now empirically as well as by design.

## Can ticket state remain a derived projection? `[machine]`

Yes. No ticket table or mutable conflict truth exists. Ticket state was
reconstructed end-to-end from the frozen manifest + durable `CollaborationEvent`s
+ the append-only attempt log; a harness restart reconstruction test passes, and
A1's one-shot state is recoverable from the durable log alone.

## Should Epistemic Admission belong to Palimpsest? `[observed]`

Provisional yes — as an **experimental** Palimpsest-side policy layer. It is
stochastic-cognition-adjacent, needs no Ordarium primitive, and cleanly
separated policy admission from semantic truth. `[unsupported]` any production
phasing now: the headline effect (one-shot refusal inducing recovery) is real
but modest, n=9/arm, and the gate does not improve answer correctness.

## Does Effect Admission remain cleanly Ordarium-side? `[machine]`

Yes. 0I added no Ordarium work: no new primitive, no `StateChangeFeed` /
`waitStateChanges` change, no schema change, no ledger change. Epistemic
admission is a Palimpsest-side policy over durable collaboration events; the
Ordarium effect ledger is untouched.

## What automatic conflict-detection problem remains? `[unsupported]`

Everything about detection. All 0I tickets were oracle fixtures
(`conflictDetection="oracle_fixture"`); Palimpsest did **not** detect any
conflict. 0I answers only "what happens if detection is correct". Automatic
detection of a genuinely irreducible, co-applicable, load-bearing conflict
remains unsolved and is the prerequisite for any production admission layer.
