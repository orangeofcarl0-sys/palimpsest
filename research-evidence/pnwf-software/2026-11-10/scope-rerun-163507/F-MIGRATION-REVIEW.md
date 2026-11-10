# Migration review — accepted Fleet correction

## Accepted revision

This review covers the owner-accepted revision recorded in `acceptance.json`, not a separately
selected candidate.

| Item | Value |
| --- | --- |
| Accepted HEAD | `5346a2f606b85962b8a12e8cca706ad8efe658b5` |
| Accepted candidate | `5346a2f606b85962b8a12e8cca706ad8efe658b5` |
| Tree | `3cdeb0fcfce00f1ff5c069a8be6caade370e7425` |
| Acceptance basis | `df4271d9a43c963ed386dc4de103dcfcf30f02f7` |

`HEAD` and `HEAD^{tree}` matched the accepted values above at review time.

### Fleet correction path

The correction path is:

```text
df4271d9a43c963ed386dc4de103dcfcf30f02f7  Record Fleet default limit correction
    adds updates/2026-11-10/fleet-default-limit.md
        |
        v
5346a2f606b85962b8a12e8cca706ad8efe658b5  Apply Fleet default stream limit correction
```

The accepted HEAD is therefore the correction application commit directly on top of the recorded
correction basis. The behavioral change is limited to the `StreamReadings` default limit; the
correction record itself is `updates/2026-11-10/fleet-default-limit.md`.

## Old and new default

| Version | Zero or omitted `StreamReadings` limit |
| --- | --- |
| Old default (first release) | Return an empty stream with `grpc-status: 0`; the proto comment described this as “no samples”. |
| New default (accepted HEAD) | Return the first three available readings in source order with `grpc-status: 0`, or all available readings when the site has fewer than three. |

Positive limits are unchanged: `limit = N` still returns the first `N` readings in source order, and
a limit larger than the number available returns all available readings. A negative limit remains
`INVALID_ARGUMENT` with `grpc-message: invalid_limit`.

The comment on `StreamReadingsRequest.limit` in `proto/energy.proto` still states the old “no
samples” behavior. That comment is stale and is explicitly superseded by `MIGRATION.md`; the proto
file itself was not changed, so no field number or wire format changed.

## Unchanged compatibility boundaries

- **Wire contract:** `Reading` keeps field numbers `site_id = 1`, `watts = 2`, and `at_ms = 3`;
  `GetReadingRequest` and `StreamReadingsRequest` keep their field numbers. Messages continue to use
  the five-byte gRPC frame header (compressed flag plus big-endian length) and `grpc-status` trailers
  over `node:http2` with `content-type: application/grpc`.
- **gRPC surface:** `/energy.v1.EnergyService/GetReading` remains unary;
  `/energy.v1.EnergyService/StreamReadings` remains server streaming. Positive-limit behavior,
  source ordering, and the all-available result for oversized limits are unchanged.
- **Error semantics:** An unknown site remains `NOT_FOUND` / `unknown_site` on both RPCs and is never
  an empty stream. A negative limit remains `INVALID_ARGUMENT` / `invalid_limit`; an unknown method
  remains `UNIMPLEMENTED`.
- **REST compatibility:** `GET /sites/:id/reading` and `GET /sites/:id/readings?limit=N` are
  unchanged. An omitted REST limit still returns all readings, and an unknown REST site still returns
  `404 { error: "unknown_site" }`. `test/rest.test.js` is untouched.
- **Data and runtime:** Both transports still read the fixed values from `service/data.js`, use the
  same `{ siteId, watts, atMs }` shape, and treat `atMs` as an epoch-millisecond integer without
  locale or timezone conversion. The service still uses only Node.js built-ins and adds no
  third-party dependency.

No blocking findings were identified. The only documentation inconsistency is the superseded proto
comment, which `MIGRATION.md` explicitly records.

## Checks run

- `git rev-parse HEAD` and `git rev-parse HEAD^{tree}` compared with `acceptance.json`: exact match
  for the accepted HEAD, candidate, and tree (`5346a2f606b85962b8a12e8cca706ad8efe658b5` /
  `3cdeb0fcfce00f1ff5c069a8be6caade370e7425`).
- `node --test` on Node.js `v24.21.0`: **18 tests passed, 0 failed, 0 cancelled, 0 skipped**, covering
  `test/server.test.js`, `test/integration.test.js`, and the unchanged `test/rest.test.js`.
- Independent runtime probe against real servers: zero and omitted gRPC limits both returned the
  first three readings for `site-a`; omitted and oversized limits returned all three readings for
  `site-b`; unknown sites returned `grpcStatus` 5 / `unknown_site`; negative limits returned
  `grpcStatus` 3 / `invalid_limit`; REST omitted limit returned all six `site-a` readings, limit 2
  returned two, and an unknown REST site rejected with `unknown_site`. **PASS.**
- `git diff --check`: clean; no tracked changes existed before this review file was added. This
  review commit adds only `MIGRATION-REVIEW.md`.
