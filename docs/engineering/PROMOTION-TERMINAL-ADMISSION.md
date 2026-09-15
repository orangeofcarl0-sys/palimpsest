# Promotion Terminal Admission

Normative statement of how a promotion **terminal fact** may enter the canonical
EventStore, and of the exact trust boundary the guarantee covers.

G10-AA made this canonical. Before it, `PROMOTION_COMMITTED` and
`PROMOTION_FAILED` were ordinary events: any in-process writer could append one
through the generic `EventStore.append`, with no validation at all.

---

## 1. The lifecycle

```text
(no promotion) → PREPARED → exactly one terminal { COMMITTED | FAILED }
```

Refused, structurally, on every plane:

```text
COMMITTED without PREPARED
FAILED without PREPARED
PREPARED → COMMITTED → FAILED
PREPARED → FAILED → COMMITTED
```

A repeat of the **identical** terminal is EventStore idempotency (the request
resolves through its idempotency key to the stored event), not a second
transition.

## 2. Firewalls

```text
EffectOutcomeWitness ≠ CanonicalEvent      EffectOutcomeWitness ≠ WorkAuthority
EffectOutcomeWitness ≠ Truth               PROMOTION_PREPARED   ≠ EffectOccurred
PROMOTION_COMMITTED  =  recorded effect-success fact
PROMOTION_FAILED     =  recorded terminal non-success fact
PROMOTION_COMMITTED  ≠  TASK_SATISFIED

StructuralValidation ≠ LiveEffectAdmission
ReplayValidation     ≠ ExternalEffectRecheck
OrdariumReceipt      ≠ ProjectIR           OrdariumReceipt ≠ TASK_SATISFIED
ExternalEffectTruth  ≠ CurrentWorkAcceptance
ReasonText           ≠ EffectProof         MatchingPayload ≠ EffectProof
```

## 3. The architectural trust boundary

AA defends against: a **generic `EventStore.append` caller**, a plugin/module
writer, an accidental alternate ingestion path, a direct-append bypass.

AA does **not** defend against: arbitrary malicious code already running in this
process that imports `src/domain/promotion_terminal_admission.ts`, or anyone who
can rewrite the SQLite file, the hash chain, or process memory. It is not a
sandbox, not cryptographic remote attestation, and not host security.

The guarantee is integrity **through the supported EventStore/package trust
boundary**. What is mechanically enforced inside that boundary:

* a capability is a class instance carrying a module-private brand, so a plain
  object cannot be substituted - and neither can
  `Object.create(PromotionOutcomeWitness.prototype)` with copied fields, because
  only instances this module **issued and has not yet consumed** are in the live
  registry;
* `new` is unavailable outside the module, and there is no
  `{ trusted: true }`-style flag;
* consuming is one-shot and only after every binding matched, so a failed
  admission leaves the capability usable for a retry;
* every bound field must equal the request being admitted: project, promotion,
  attempt, source commit, expected head, resulting head, and outcome kind.

## 4. Two validation planes

**Plane A — replay-safe structural validation.** Runs in
`AggregateValidator.validate`, and therefore in live append, `verifyFull()`,
`rebuildProjections()`. It may inspect only canonical local state, queries no
Ordarium and no Git, requires no in-memory capability, and depends on no current
external effect state. The admitted intent is read from the `promotions`
**projection**, which a replay rebuilds event by event - so at that point in the
replay it holds exactly what had been applied, never the future.

**Plane B — live-only admission.** Runs in `AggregateValidator.validateAdmission`
for a NEW append only. This is where the ephemeral capability is required. Replay
never runs it, so no legacy event needs a witness.

```text
append          → structural validation + live admission
verify/rebuild  → structural validation only
```

## 5. The two capabilities

**`PromotionIntentPermit`** authorizes appending a NEW `PROMOTION_PREPARED`. It is
minted by `PromotionManager` immediately after Z's eligibility assessment passes,
with basis `eligibility_passed`. It proves only that the governed effect protocol
was intentionally entered - never an outcome.

**`PromotionOutcomeWitness`** authorizes appending a NEW terminal. It records
where the outcome came from, not that it is true:

| basis | produced when |
| --- | --- |
| `invoke_result` | a normal `effects.invoke(git.promote)` returned its head |
| `ledger_receipt` | recovery found a succeeded/reconciled ledger record |
| `reconciled_result` | recovery's engine reconciled an interrupted operation |
| `deterministic_failure` | the engine established a deterministic failure |
| `denied` | Ordarium recorded the operation as denied |
| `cancelled` | Ordarium recorded the operation as cancelled |
| `authority_revoked_before_dispatch` | the invocation provably never started and the Work authority that admitted the intent was revoked |

An **uncertain or in-flight** operation (`proposed`, `authorized`, `claimed`,
`dispatched`, `uncertain`, `busy`, `unknown`) mints **nothing**: no witness, no
terminal, fence intact.

## 6. The trusted append surface

```text
generic append(event)                        → promotion facts DENIED live admission
appendPromotionIntent(event, permit)         → structural + permit validation → append
appendPromotionTerminal(event, witness)      → structural + witness validation → append
```

Neither narrow method is reachable from any agent-facing surface. `AA-N29` scans
the application tools, the tool surface, the application surface and the control
surface for the capability and method names, and asserts the domain barrel does
not re-export the admission module.

## 7. Operation and result binding

A witness binds the deterministic Ordarium operation identity used by the effect
itself - the same `operationIdentityPreview` call, no second identity algorithm:

```text
action = git.promote, source = palimpsest, scope = projectId,
callId = promote:<promotionId>,
input  = { promotionId, sourceCommit, expectedHeadCommit }
```

plus an input digest. A success witness for head `H1` therefore cannot authorize
a `COMMITTED` claiming `H2`, and a success witness can never authorize a `FAILED`
(or the reverse).

## 8. Terminal admission never consults current Work state

A recovered effect may be proven to have happened **after** its task was retired.
Terminal validation is anchored to the admitted PREPARED intent, never to current
Work eligibility, so G10-Z's "effect truth can still be recorded honestly"
exception is preserved. `TASK_SATISFIED` remains the separate semantic admission.

## 9. Durable provenance

Terminal payloads MAY carry three optional, non-secret fields:

```text
operation_id     the Ordarium operation identity (op_…)
outcome_basis    the basis above
outcome_digest   digest over the minimal receipt the outcome was read from
```

They are additive and optional: a payload without them normalizes exactly as
before, and canonical JSON drops absent keys, so the request/event digests of
existing promotion history do not move (`AA-N20`). The full Ordarium record, lease
internals and secrets are never stored.

## 10. What G10-AA does not do

```text
no second promotion ledger      no receipt store     no background receipt poller
no second project-head truth    no custom recovery engine   no ManagerAgent
no distributed ACID             no cross-revision compatibility engine
```

Ordarium remains effect-outcome truth; the EventStore remains promotion-history
truth; the projector stays dumb (`#applyPromotion` queries nothing).
