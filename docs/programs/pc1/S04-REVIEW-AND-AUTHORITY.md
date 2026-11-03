# S04 — Proposal, review, authority and source intake

## 1. What is implemented

`src/project_review/` is a durable, NON-AUTHORITATIVE proposal/review store plus a service that
drives the existing owners.

| Piece | Behaviour |
|---|---|
| `proposePlan` | records purpose, sources, basis, scope, risk, dependencies, expected artifact, required role and the full task graph; no canonical write |
| `proposeSourceIntake` | reads the candidate bytes, computes sha256 itself, refuses a caller-supplied digest that does not match, normalises the target path inside the project |
| `proposeIntent` | calls the existing `ProjectIntentService.prepare` (grounds validated by the existing owners), stores the prepared proposal |
| `preview` | returns the proposal, current basis, currentness (`CURRENT`/`STALE`), known impacts, effects, required authority, applicability |
| `decide` | requires a host-supplied `OperatorAuthorityPort`; records APPROVE/REJECT/REQUEST_CHANGES bound to the exact proposal digest and decision basis; duplicate same decision is idempotent, a conflicting decision is refused |
| `apply` | requires APPROVED + CURRENT + an authorized operator; drives `controller.plan`, creates a Work task for a source intake, or calls `intent.apply` (which re-validates currentness and calls the composed admission port) |
| `verifySourceIntake` | reads the result blob from Git, hashes it, compares to the approved digest, and lists changed paths outside the approved scope |
| `recordExecution` / `recordAcceptance` | proposal-origin trace: who proposed, decided, applied, executed, accepted |

The local CLI operator adapter (`src/cli_product.ts`) is explicit configuration:

- `operatorId` and `operatorPurpose` are stored in the product profile;
- `authorize(actor)` accepts only that identity;
- the local intent admission returns `ADMIT` only for the exact proposal digest, with a provenance
  digest covering operator id, purpose, digest and currentness.

This is an ADAPTER over the existing admission seam, not a new authority root. A deployment with no
operator identity can still create and preview proposals; it cannot decide or apply.

## 2. Tests

`test/pc1_review.test.ts` (5 tests, real Git + controller):

- plan proposal → preview → unauthorized apply refused → approve → apply through the plan revision;
  trace has proposedBy/decidedBy/appliedBy/execution/acceptance;
- deployment without operator authority can propose but not decide;
- stale proposal is marked STALE and cannot apply; rejection is not an approval;
- source intake binds exact bytes; a correct result blob verifies, a different blob fails;
- intent proposal uses the existing admission authority and applies a real ProjectIR revision.

Adjacent: CLI review list/approve refusal is covered by `test/pc1_cli.test.ts`.

## 3. Residual limits

- The local CLI operator is a local assertion (`operatorId`), not a remote identity provider. A
  deployment that needs stronger identity must supply a real `OperatorAuthorityPort`.
- The review store is metadata; it does not become an approval ledger. The canonical effect is
  always the existing plan/intent/Work/Promotion path.
- Source intake creates the Work task; the worker copies the bytes. The product verifies the result
  blob independently.
