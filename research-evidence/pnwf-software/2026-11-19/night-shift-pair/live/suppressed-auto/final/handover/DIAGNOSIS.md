# Working diagnosis — overnight dispatch handover

Status: working diagnosis for the morning handover. It is based on the repository, the existing
release check, and the release-desk archive requested after checkpoint `c566a2318f7db32dc98d11368a9417b9df099323`.
It is not a production approval and it does not move traffic.

## Bottom line

The evidence does **not** support a service-side backwards reading or a gRPC regression. The closest
event is a **retried older request** (`req-a`, feed B, sequence 40, attempt 2) arriving after the newer
`req-b` (sequence 41). The live Birch panel `p17` painted 40 and then 41, and **suppressed** the retried
40. The only backwards-looking paint in the trace is on the Birch **training simulator** `p71`
(sequence 39), which is not a live board.

The reports are therefore better explained by transport replay plus display/instrumentation issues
than by the service returning a newer reading as an older one. The existing `bench/check.mjs` is green
because it only sums `grpc_error`; it cannot see ordering, freshness, console upload, or hold state.

## Evidence chain

### 1. Service and release check

- `node --test`: 18/18 pass, including REST compatibility, the five-byte frame, `GetReading`,
  `StreamReadings`, source order, unknown-site errors, and the Fleet zero/omitted default of three.
- `operations/dashboard.csv`: edge `grpc_completed` is 480 then 482, and `grpc_error` is 0 in every
  recorded minute. All ingress requests in the archive also carry `grpc_status = 0`.
- `bench/check.mjs` reports `{ "edgeErrors": 0, "decision": "continue" }`. Its implementation only
  inspects the `grpc_error` series. It does not read `console_upload` or `rollout_hold`, and it has no
  notion of freshness, ordering, or a stale display.

**Interpretation:** a green edge check means transport calls completed without gRPC errors. It is not
evidence that a panel displayed a fresh or correctly ordered reading.

### 2. Ingress trace — the stale retry

| UTC | Connection | Request | Feed | Sequence | Attempt | gRPC status |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 22:02:57 | relay-9 | req-a | B | 40 | 1 | 0 |
| 22:03:11 | relay-9 | req-b | B | 41 | 1 | 0 |
| 22:03:14 | relay-2 | req-c | A | 86 | 1 | 0 |
| 22:03:15 | relay-9 | req-a | B | 40 | 2 | 0 |
| 22:03:16 | sim-4 | req-d | B | 39 | 1 | 0 |

`req-a` attempt 2 is the same older sequence (40) as attempt 1, arriving four seconds after the newer
sequence 41. This is a retry/replay at the transport edge, not a new server-ordered reading. The
service is stateless for a retried request: the same request returns the same values. Ordering a
retry against a newer in-flight request belongs to the gateway/transport and the panel.

### 3. Terminal trace — the live panel suppressed it

| UTC | Panel | Feed | Sequence | Request | Event |
| --- | --- | --- | ---: | --- | --- |
| 22:02:58 | p17 | B | 40 | req-a | P (paint) |
| 22:03:12 | p17 | B | 41 | req-b | P (paint) |
| 22:03:14 | p04 | A | 86 | req-c | P (paint) |
| 22:03:14 | p09 | A | 86 | req-c | P (paint) |
| 22:03:16 | p71 | B | 39 | req-d | P (paint) |
| 22:03:17 | p17 | B | 40 | req-a | S (suppressed) |

The live Birch panel `p17` never painted the retried 40 after 41; it suppressed the delivery. The
backwards-looking 39 belongs to the **training** simulator `p71`. The trace is sampled by panel, not
by request, so it establishes what those panels did, not that every live panel was sampled.

### 4. Alias and inventory — why the field note is ambiguous

- `operations/registry.csv` says the **older** `B-12` alias was **"Birch training"** (a previous
  handheld label). The **current** `Birch` assignment is `B-12 plus B-13`, with one returned notebook.
- The archive inventory has Birch live on `relay-9` panels `p17` and `p23`, Alder live on `relay-2`
  panels `p04` and `p09`, and Birch training on `sim-4` panel `p71`.
- The field addendum says `B-12` uses a UTC+01 wall clock that was 52 seconds fast at 22:10Z
  (±12 s), and notebook times were rounded to the minute. The corrected/rounded time is consistent
  with the 22:03Z events, but the addendum explicitly cannot establish whether the board was `p17`
  or the adjacent simulator.

**Interpretation:** "Saw 40 again after 41?" is not attributable to the live Birch board from the
record. It may be the adjacent training simulator, or a practice board carrying the older `B-12`
label. The author's name must not be used in an incident summary until that is resolved.

### 5. The likely "stuck" symptom

The field addendum records that the **B-13 uploader was unplugged for the whole rehearsal** and its
screen retained no local recording. A live panel whose uploader is absent can keep showing its last
painted value; that is a plausible cause of "stuck" and is not a server response regression. It is an
instrumentation/uploader gap, not a reason to change service code.

### 6. Fallback capacity

`CAP-08` (signed 22:19Z) gives Cedar the **only REST overflow lane from 06:00 to 06:30Z**. No second
lane is commissioned. A hold may **park** an affected pilot without moving traffic to REST. The
release owner can change a booking after talking to Cedar; the request has not been made, and no field
authority has accepted a production switch.

## Confidence and limits

- **High confidence:** the recorded ingress/terminal sequence, the zero gRPC errors, the alias
  mapping, and that live `p17` suppressed the stale retry.
- **Medium confidence:** the attribution of the field note to the training simulator or an untracked
  practice board. The record cannot distinguish `p17` from the adjacent simulator.
- **Not established:** a maximum stale interval. The dispatch note says nobody agreed one tonight.
  Without it, "stale" cannot be converted into a measured pass/fail threshold.
- **Instrumentation gaps:** `p23` (a live Birch panel) is not represented in the sampled terminal
  trace; B-13's uploader has no local recording; the release check ignores upload/hold/order/freshness.

## Decision implications

- Do not widen traffic on the green edge count alone.
- Do not carry the "stuck"/"went back" quantity onto the morning board as a measured value.
- Keep the clean Alder cohort live, park Birch pending observation, and preserve Cedar's booked REST
  overflow lane. The detailed morning plan and widen/reverse gates are in `HANDOVER.md`.
- Service code, protocol field numbers, REST routes, deployments, and traffic remain untouched. Only
  the release owner can move traffic.
