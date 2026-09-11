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

Yes, in this tested scenario family. A single refusal (`A1`) produced recovery in
**9/9** I runs (contact the owner or abstain before resubmitting) versus **1/9**
in A0; `OneShotRecoveryRate_A1 = 100%`. It also changed the *first*
post-intervention move to owner contact in 78% of runs with no routing
instruction. This shows a one-shot intervention was behaviourally sufficient
here; it does **not** show that persistent enforcement has no value.

## Does persistent enforcement add value? `[stat]` `[unsupported]`

It adds a **stronger formal guarantee** but not stronger observed contact
behaviour. On contact: `AdmissionInducedContactLift(A2−A1) = 0.00` (100% vs
100%, Fisher p = 1.000). On abstention / owner participation the direction is
higher (67% vs 44%) but **not significant** (p = 0.637) and ceiling-bound: A1
already reached 100% contact, so no headroom existed. Only A2 mechanically
guarantees the invariant that an unsupported resolved conclusion cannot enter
admitted state before policy clearance — behavioural effectiveness and formal
enforcement strength are separate dimensions. `[rejected]` the claim that hard
enforcement is *necessary* for behavioural recovery. `[unsupported]` any claim
that it is *more* effective than the one-shot gate at this n.

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

## Does owner participation improve semantic correctness? `[observed]` `[unsupported]` (as asked causally)

0I cannot answer this causally: it was not designed or powered to identify that
effect. What it shows is only that aggregate correctness did not rise under
enforcement (A0 4/9, A1 3/9, A2 1/9 correct; more abstention). The causal claim
is left open.

## Is owner participation sufficient for semantic correctness? `[observed]` `[rejected]`

No. Of the three A2 resolutions admitted **under owner participation**, 1 was
`SEMANTICALLY_CORRECT` and 2 were `SEMANTICALLY_INCORRECT`. Participation proves
only that the configured owner replied on the consultation thread — not that the
reply was understood, incorporated, or correct. Owner participation is therefore
demonstrably **insufficient**; `OwnerParticipation ≠ TruthVerification`. No
inference of zero epistemic value is drawn — whether participation helps is an
open causal question.

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
but modest, n=9/arm, and owner-participated admissions were still partly
incorrect.

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
