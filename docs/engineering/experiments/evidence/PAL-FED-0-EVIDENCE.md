# PAL-FED-0 Evidence Record

Status: EXPERIMENTAL. Machine evidence below is real and reproducible from the
branch HEAD. **Real two-Main dogfood has not been executed in this batch** —
that is recorded honestly rather than fabricated.

---

## 1. Machine acceptance (synthetic, reproducible)

Command: `pnpm test` (build + vitest). Federation suites:

| Suite | Covers | Result |
|---|---|---|
| `test/federation.test.ts` | FED-A01–A04, B01–B04, C01–C05, D01–D06, §36 bounds | 21/21 ✅ |
| `test/federation_codec.test.ts` | §35 strict durable codec + cross-field invariants | 7/7 ✅ |
| `test/federation_freeze.test.ts` | §55 versions / HOST_CONTRACT_VERSION / StateChangeFeed | 3/3 ✅ |
| `test/federation_process.test.ts` | §54 two independent adapter processes on one DB | 1/1 ✅ |

Acceptance mapping:

```
FED-A01  fabric requires explicit init (serve fails closed)        PASS
FED-A02  wrong fabricId fails closed                               PASS
FED-A03  self/target not in marker rejected                        PASS
FED-A04  model input cannot claim another from                     PASS
FED-B01  bilateral post/read; own outbound not inbound work        PASS
FED-B02  event subject revision 1 only; rewrite fails              PASS
FED-B03  thread reconstructed in durable feed order                PASS
FED-B04  dangling StateRef fails through Ordarium                  PASS
FED-C01  no ack -> same batch after restart                        PASS
FED-C02  ack advances; batch not returned again                    PASS
FED-C03  foreign/old batch id cannot move cursor                   PASS
FED-C04  repeated ack of completed batch idempotent                PASS
FED-C05  invalid stored cursor surfaced, never reset to 0          PASS
FED-D01  create draft, no forged acceptance                        PASS
FED-D02  bilateral agreement on same termsDigest                   PASS
FED-D03  changed terms invalidate prior agreement                  PASS
FED-D04  CAS conflict: exactly one winner, explicit conflict       PASS
FED-D05  acceptance cannot be impersonated                         PASS
FED-D06  stale digest acceptance fails closed                      PASS
```

Process-level proof (`federation_process.test.ts`) spawned two real
`node dist/src/federation/cli.js serve` children (`self=palimpsest.main`,
`self=ordarium.main`) against one on-disk coordination DB and exercised:
P→O event, O inbox delivery, O→P reply, thread reconstruction with 2 events,
contract propose → accept → agreed, unacked restart, and pending-batch replay
with the identical `batchId`.

## 2. Dogfood evidence record (template — to be filled by the real run)

Per §59, record raw facts, not chain-of-thought. Do not massage the experiment
to validate the theory.

```text
run date / operators:
branch HEAD:
fabricId / coordination DB path:
number of collaboration events:            (P->O:      O->P:      )
event kinds actually used:                 need=  proposal=  constraint=  question=
                                           decision=  change_ready=  evidence=  blocker=
number of contract revisions:
contracts reaching agreed:
CAS conflicts observed:
messages judged unnecessary (retrospective):
duplicate events observed (ambiguous-crash residual):
user escalations:
recovery / replay incidents (ack failures, redeliveries):
average / rough boundary-message size (chars):
time+steps between dependency discovery and peer response:
cases where sharing the local plan would have been unnecessary:
cases where more context was genuinely required:
UNEXPECTED behavior:
```

## 3. First real topic (harness primed, awaiting Ordarium Main)

From `dogfood.config.json`:

> Palimpsest Main: checkpoint polling is currently the bootstrap mechanism.
> Evaluate whether future low-latency peer wake requires a generic Ordarium
> wait/change-observation primitive.
>
> Ordarium Main: inspect its own architecture and independently respond with
> constraints / proposal / rejection.

PAL-FED-0 must **not** implement the resulting Ordarium feature. If Ordarium
Main identifies a needed primitive, that is evidence for the Ordarium peer, not
a PAL-FED-0 deliverable.

## 4. Ordarium freeze proof

- `@ordarium/core`, `@ordarium/host-kit`, `@ordarium/ledger-sqlite`,
  `@ordarium/testing` all installed at exactly `1.3.1` from published release
  tarballs (`test/federation_freeze.test.ts`).
- `HOST_CONTRACT_VERSION = 1` asserted, fail-closed.
- `StateChangeFeed` available through public APIs; no Ordarium private SQLite
  schema is read by federation implementation code.
