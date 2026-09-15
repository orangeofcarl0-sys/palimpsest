# Project Operating Posture

Normative statement of what a durable Palimpsest project remembers about *how*
the user wants to work with it, and how that differs from what Palimpsest is
allowed to do.

G10-AB introduced this. Before it, a project remembered its Work and its Evidence
but nothing about the user's chosen way of working.

---

## 1. Two orthogonal axes

```text
Work Mode Preference              Management Involvement
  FOCUS | EXPLORE | COORDINATE       DIRECT | ASSIST | MANAGE | DELEGATE
  + optional VERIFY
  + optional MONITOR
```

```text
WorkModePreference ⟂ ManagementInvolvement
```

Neither axis grants authority, and **never collapse them into one scalar autonomy
level**. All twelve combinations are legal, including:

```text
FOCUS + DIRECT      the conventional single-agent anchor
FOCUS + DELEGATE    validity does not require multi-agent topology
EXPLORE + DIRECT    validity does not grant proactive management
COORDINATE + ASSIST validity does not create a peer
```

## 2. Firewalls

```text
OperatingPosture   ≠ Authority            OperatingPosture ≠ RecipePlan
OperatingPosture   ≠ Execution            OperatingPosture ≠ OrganizationDefinition
WorkModePreference ≠ RecipePlan           RecipePlan       ≠ Execution
Compilation        ≠ Admission            AdvisorRecommendation ≠ PreferenceMutation
AgentRecommendation ≠ OperatorPreferenceChange
ManagementMode     ≠ WorkModeMutationAuthority
```

## 3. The Work Mode is a PREFERENCE

Persisted Work Mode means: *this is the user's default preferred way of organizing
eligible work in this project.* It does **not** mean:

* every task must use that topology;
* all work automatically executes a recipe;
* COORDINATE creates a peer;
* EXPLORE always creates branches;
* VERIFY automatically becomes independent;
* MONITOR automatically becomes a background scheduler.

Only the **semantic** mode is stored (`FOCUS | EXPLORE | COORDINATE` plus
modifiers). The recipe is resolved through the current `RecipeRegistry` at
execution time, so no permanent `CompiledRecipePlan` is persisted anywhere.

## 4. Safe defaults

```text
Work Mode preference absent/lost/unreadable  →  FOCUS, modifiers = []
Management preference absent/lost            →  DIRECT
total safe fallback                          →  FOCUS + DIRECT
```

A default is **labelled** as a default (`source: "safe_default"`), never presented
as a user choice, and loss of state never widens autonomy.

## 5. Preferred posture vs effective capability

```text
preferred:  EXPLORE + VERIFY + MONITOR
effective:  EXPLORE available · VERIFY unavailable (no independent verifier)
            MONITOR preview-only (no production condition source)
```

The preference is **retained**; an unavailable capability is **never** reported as
active, and nothing is invented to satisfy it (no peer, no verifier, no
scheduler). `capabilityWarnings` states each preferred-but-unavailable capability
with its reason.

`VERIFY` requires an actually-declared **independent** verifier: same-model
same-context verification does not count. `COORDINATE` requires a genuine
already-independent sovereign peer, and persisting the preference creates no
`PeerRef`, no `PersistentPoint`, accepts no commitment and grants no collaboration
authority.

## 6. Mode semantics

| Mode | Means | Does not mean |
| --- | --- | --- |
| `FOCUS` | prefer the current principal/locus unless the action explicitly justifies a boundary | forbids an explicit user-requested Explore/Coordinate action |
| `EXPLORE` | when eligible local cognitive branching is useful, prefer Explore over Focus | creates durable peers or auto-publishes proof claims |
| `COORDINATE` | prefer existing genuine independent peers for work crossing sovereignty/project boundaries | fabricates peers or accepts commitments |
| `VERIFY` (modifier) | use the configured independent verification capability | makes same-model same-context "independent" |
| `MONITOR` (modifier) | the preference is durable | starts a scheduler or invents a condition source |

## 7. Preference influences SELECTION only

```text
hard eligibility → task/candidate need → USER WORK MODE PREFERENCE → empirical evidence
```

There is no hidden scalar score. In the management service the existing
execution-priority order is preserved exactly, and the preference is a **stable
partition on top of it**. A candidate that names no recipe expresses no mode and is
never promoted by preference. When the preference selects nothing eligible, the
ordering falls through and **says so**:

```text
the user prefers EXPLORE, but no eligible candidate expresses it;
eligibility is not bent to honour a preference
```

## 8. Mutation boundary

```text
UserWorkModeControlPort.set()   operator-only (CLI / operator control plane)
requestWorkModeChange()         agent-facing REQUEST only; persists nothing
```

No agent-facing tool, route or port can persist the user-level project default.
HTTP authentication is **not** operator semantic authority, so the HTTP surface
exposes reads plus a request, never a mutation.

## 9. Ownership

The preference is a deployment-local, project-scoped operator preference
analogous to management involvement. It is **not** ProjectIR canonical truth, not
an `OrganizationDefinition`, not Work EventStore truth and not RecipeStore truth.
It shares a physical database with the activity log while keeping its own tables
and its own port. Its append-only change history is product/audit metadata, not
authority.

## 10. What G10-AB does not do

```text
no RecipeStore        no authority plane        no universal HistoryStore
no ManagerAgent       no duplicate ProjectIR/Work truth
no CoT store          no External/Personal asset scope
no work-mode-driven autonomy escalation
```
