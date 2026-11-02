# S02 — The normal product path

## 1. What changed

### 1.1 Tool visibility tiers (`toolProfile`)

`InstallPalimpsestOptions.toolProfile` now selects what a deployment ADVERTISES:

| Tier | Catalogue |
|---|---|
| `legacy` | the historical nine Work tools only |
| `normal` | `palimpsest_start`, `palimpsest_status`, `palimpsest_project`, `palimpsest_work`, `palimpsest_continuity`, plus the composed collaboration/delegation/cross-project/verification/surfaces facades |
| `expert` / `all` | the full historical catalogue (default for `installPalimpsest`, so existing deployments/tests are unchanged) |

Tiering is presentation only. It filters `DshToolDefinition`s; it changes no stored state and no
authority. The parity guard records the two new tools in `REVIEWED_TOOL_ADDITIONS` with a reason;
a removed tool or an unlisted addition still fails.

### 1.2 `installProduct` — the ordinary-user entry

`src/product.ts` composes `installPalimpsest` with:

- a deployment state directory (`<repo>/.palimpsest/state` by default);
- orchestration, Ordarium, journal and association databases;
- the derived project workspace (so summary/journal/proposals exist);
- the **normal** tool profile by default;
- `in-place` execution by default; `expert` is available explicitly for debugging/migration.

It creates no new authority and duplicates no ledger.

### 1.3 `palimpsest_work` — one placement-aware work facade

Actions: `status`, `plan`, `next`, `run`, `begin`, `complete`, `propose`.

- `status` projects away attempt ids, evidence ids and promotion ids; the principal gets task states,
  counts, blocked/pending signals and legal next actions.
- `complete` follows the deployment's real placement. In-place uses the existing `finish`
  observation route. A placed (worktree) attempt is settled by the host worker; the tool says so and
  names the legal next action (`run`/`status`) instead of suggesting `finish`, which cannot apply
  there.
- `propose` records a non-authoritative Journal `IDEA` with a machine-readable
  `pc1-proposal/v1` block. It does not revise the plan, accept a source or grant authority. This is
  the S02-R04 path for work that is still `VERIFYING`: the plan stays frozen, the follow-up is
  durable and visible.

### 1.4 Lossless JSON

The normal tool results are plain JSON: no cyclic objects, no `BigInt`, no `Date` instances, no
implicit `toJSON` drift. The test executes status/project/work/surfaces against a real install and
round-trips every result.

## 2. Authority boundaries kept

- A normal proposal is metadata; it is not approval.
- `plan` while `VERIFYING` is still refused by the existing quiescence guard. The test proves the
  refusal and proves `propose` does not move the revision or the task graph.
- No tool gained the ability to accept a source, promote a result or change a requirement.

## 3. Tests and evidence

- `test/pc1_normal_product.test.ts` (4 tests): tier separation in both directions, lossless
  round-trip, principal-safe status projection, VERIFYING proposal + frozen plan.
- Adjacent: `application_parity` (29), `advanced_runtime`, `o_application_surface`, `p_deployment`
  pass. The parity guard records the reviewed tool additions.

## 4. Residual limits

- The normal tier is a configuration; a host that installs with `expert` still sees both the legacy
  and product surfaces. The product entry defaults to `normal`.
- A placed worker's completion is not initiated by the principal; that is the architecture, not a
  missing route.
