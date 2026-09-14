# G10-S — Opinionated Organization Recipes & Empirical Architecture Advisor (Spec)

Hide arbitrary organization complexity behind a small set of empirically explainable product recipes,
while keeping recommendations optional, reversible and non-authoritative.

Baseline: `main @ d1fb28a3daf6f4f2ee3dd1efdb473b911e6d0146`.

## Product model

```
UserIntent → TaskProfile → eligible recipes → empirical evidence → recommendation
           → explicit selection → compile → existing semantic machinery
```
Users express intent ("I want to focus", "I need an independent project to coordinate", "I need
stronger verification"); they never design an AgentGraph, agent count, manager tree or Holon nesting.

## Modes and modifiers

- Base modes: `FOCUS` (locus topology), `EXPLORE` (local cognitive-compute topology), `COORDINATE`
  (sovereignty/persistent-peer topology). FOCUS is always eligible and is the default baseline.
- Modifiers: `VERIFY` (epistemic reliability), `MONITOR` (temporal continuity).
- Hybrid = one base mode + zero or more compatible modifiers; never a canonical topology species.

## Firewalls

```
Recipe ≠ OrganizationDefinition/RuntimeScope/ReasoningCell/Campaign/PeerRef/ArchitectureDefinition
RecipePlan ≠ Activation        Recommendation ≠ Proposal/Governance/Authority/Truth
HistoricalWinner ≠ FutureAuthority   EmpiricalSupport ≠ Causation
Advisor ≠ Planner/Manager/ArchitectureMutationEngine
Coordinate ≠ SpawnSecondAgent  ExploreBranch ≠ PersistentPoint/PeerRef
Verify ≠ TruthOracle           Monitor ≠ AttentionScheduler
```

## Rules

- **No arbitrary graph generation by default**: `Plan = Recipe_k(θ)`, never `LLM(invent topology)`.
- **Eligibility ≠ preference**: COORDINATE is INELIGIBLE without a genuine independent peer; EXPLORE is
  eligible but disfavoured under high coupling; FOCUS is always eligible.
- **TaskProfile is structured and unknown-aware** (LOW|MEDIUM|HIGH|UNKNOWN · YES|NO|UNKNOWN ·
  SHORT|PROJECT|LONG|UNKNOWN) with per-feature provenance (USER_DECLARED | DETERMINISTIC_DERIVATION |
  UNTRUSTED_PROFILER | UNKNOWN); a profiler never selects a recipe.
- **No hidden score**: recommendations are eligibility clauses + transparent rules + observed trade-offs
  + Pareto evidence + limitations; a scalar is at most an explicitly user-selected decision aid.
- **Faithful empirical reading**: role-split → avoid fake durable boundaries (not "multi-agent is bad");
  federation → non-dominated trade-off (not "federation always wins"); reasoning cell → lower
  unresolvedness + higher verification/coordination overhead, quality transfer unknown.
- **Insufficient evidence is a first-class outcome** (`INSUFFICIENT_EMPIRICAL_EVIDENCE`); unavailable
  metrics are never filled with 0.
- **Every recommendation carries `LIMITED_EMPIRICAL_BASIS`** while R's n=3 single-provider limits hold.
- **Explainability**: Why Focus? Why not Explore? Why not Coordinate? What supports/contradicts? What is
  unknown? — answered in plain language.
- **Authority firewall**: recipe execution never bypasses boundary acceptance, commitment holder
  acceptance, epistemic admission, organization/runtime evolution authority or effect authority; the
  advisor creates no DynamicsProposal and silently rewrites no durable organization.
- **Explore branches are ephemeral**: a branch is never a PeerRef/PersistentPoint/durable agent, even
  when a host carries it with an ephemeral agent handle; it may only submit structured candidates.

## Exit criterion

> Palimpsest presents ordinary users with a small set of opinionated modes—Focus, Explore and
> Coordinate—plus capability-gated Verify and Monitor modifiers; it recommends among them using
> transparent eligibility rules and limited empirical evidence from OrganizationMemory, exposes
> counter-evidence and transferability limits, never invents an arbitrary AgentGraph, never creates a
> fake durable peer to satisfy a recipe, and compiles an explicitly selected recipe only into existing
> governed semantic primitives; Explore executes real ephemeral reasoning branches without promoting
> them to durable agents, while Coordinate only operates across already-independent persistent peers.

PARTIAL if the advisor emits an opaque score, users must still design a graph, Coordinate spawns a fake
peer, Explore exists only on paper, a reasoning branch becomes a durable agent, a historical winner
auto-executes, the advisor mutates the organization, Verify claims independence it lacks, Monitor
claims autonomy without an event source, or R quality gaps are silently filled.
STOP — SEMANTIC REBASE REQUIRED if recipes need Work/Runtime/Organization/Reasoning/Federation collapsed
into one graph, Coordinate needs fake peers, Explore needs Branch = durable Agent identity, the advisor
needs memory to become authority, or the compiler must bypass governance/admission.
