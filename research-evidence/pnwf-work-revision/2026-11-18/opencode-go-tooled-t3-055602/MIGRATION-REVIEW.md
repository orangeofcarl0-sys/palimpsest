# Migration review — Fleet default-limit correction

## Accepted basis

This review uses the accepted version recorded in `acceptance.json`:

- **Complete accepted HEAD:** `4639ae44d78e7c1f9f5269876fa333a99bff770f`
- Accepted tree: `99c40069ae834cf71618e2a142010f10bef0df06`
- Accepted candidate: `be05447e061a23157ed04e3ee4b27ec7f571e94e`
- Prior accepted basis: `fbeb8958f4405688b13f37dbdec330157a660ab0`
- **Fleet correction path:** `updates/2026-11-10/fleet-default-limit.md`

The correction changes only `MIGRATION.md`, `service/grpc_server.js`,
`test/integration.test.js`, and `test/server.test.js` relative to the prior basis. This review adds
only `MIGRATION-REVIEW.md`; it does not change the implementation or the tests.

## StreamReadings default: old and new behaviour

The correction is specifically about the default selected when the request does **not** supply a
positive limit. Both a supplied `limit = 0` and an absent limit are affected.

| Request form | First-release behaviour (superseded) | Accepted behaviour at the complete accepted HEAD |
| --- | --- | --- |
| `limit` absent | Empty stream: no Reading frames, then `grpc-status: 0`. | First three available readings in source order (`readings.slice(0, 3)`), or fewer if the site has fewer, then `grpc-status: 0`. |
| `limit` explicitly supplied as `0` | Empty stream: no Reading frames, then `grpc-status: 0`. | First three available readings in source order (`readings.slice(0, 3)`), or fewer if the site has fewer, then `grpc-status: 0`. |

In the first release, `service/grpc_server.js` passed the decoded limit directly to
`readings.slice(0, limit)`. Because an absent protobuf `uint32 limit` decodes to the scalar default
`0`, both the absent and explicit-zero cases selected `slice(0, 0)` and produced an empty stream.

The accepted correction maps a decoded zero to `DEFAULT_STREAM_LIMIT = 3` before slicing. Thus an
omitted limit and an explicit zero limit now request the Fleet default of the first three available
readings in source order. They do **not** mean "all readings", and they no longer produce an empty
stream. A positive limit is unchanged: `limit = N` still selects `readings.slice(0, N)`, so a limit
larger than the number of available readings returns all available readings, and `limit = 1` returns
just the first.

The comment in `proto/energy.proto` still says an omitted or zero limit returns an empty stream. That
comment describes the superseded first-release behaviour. The proto is intentionally unchanged, so
the comment is retained for byte-for-byte contract stability; it is informational only. The effective
behaviour is the accepted behaviour above and is documented in `MIGRATION.md` and implemented in
`service/grpc_server.js`.

## Source ordering and framing

The source of truth is `service/data.js`. Within each site, the readings are stored in the order
declared by its array; that declaration order is the source order. `readingsFor()` copies the array
without reordering it, `readings.slice(0, limit)` preserves that order, and the server maps over the
selected array in order.

`StreamReadings` sends **each Reading in its own gRPC message frame**. Each selected Reading is
encoded separately and passed through `encodeFrame()` individually; multiple Readings are never
packed into one protobuf message or one frame. The stream therefore consists of one five-byte gRPC
frame header plus one protobuf `Reading` payload per selected reading, in the same order as the
source and the REST list. The client's `FrameDecoder` yields those frames in arrival order.

The tests pin this down: the raw HTTP/2 test for `limit = 4` decodes four separate frames and checks
their exact source order, while the zero-limit and omitted-limit tests decode exactly three separate
frames in the same order. The integration test likewise compares the resulting `atMs` sequence with
the REST baseline.

## Unchanged compatibility boundaries

### Positive limits

Positive limits retain the first-release selection rule: `limit = N` returns the first `N` available
readings in source order, or all available readings when `N` exceeds the available count. The Fleet
default correction only changes the zero and absent cases.

### Unary `GetReading`

`GetReading` remains unary: exactly one `GetReadingRequest` frame in and exactly one `Reading` frame
out. It returns the site's first/current reading, matching `GET /sites/:id/reading`. For `site-a`
that is `{ siteId: "site-a", watts: 4120, atMs: 1762300000000 }`.

### Unknown-site NOT_FOUND

An unknown site is `NOT_FOUND` on both methods: `grpc-status: 5` with message `unknown_site`, and no
Reading payload. This applies to unary `GetReading` and to `StreamReadings`; an unknown site is never
an empty successful stream. This preserves the REST `404 { error: "unknown_site" }` semantics.

### Protobuf field numbers

The committed field numbers are unchanged and remain part of the wire contract:

- `GetReadingRequest`: `site_id = 1`
- `StreamReadingsRequest`: `site_id = 1`, `limit = 2`
- `Reading`: `site_id = 1`, `watts = 2`, `at_ms = 3`

`proto/energy.proto` is unchanged by the correction, and `service/wire.js` continues to encode and
decode those field numbers. `at_ms` remains an epoch-millisecond integer, never a locale- or
timezone-formatted value.

### REST compatibility

The REST surface is unchanged for the dispatch console:

- `GET /sites/:id/reading` returns one reading.
- `GET /sites/:id/readings?limit=N` returns `{ readings: [...] }` in source order.
- An unknown site remains `404 { error: "unknown_site" }`.
- An invalid limit remains `400 { error: "invalid_limit" }`.
- The REST default is unchanged: an absent REST limit still returns all available readings, and an
  explicit REST `limit=0` still returns an empty list. The new three-reading default is a gRPC
  `StreamReadings` compatibility rule, not a change to REST.

The REST implementation, client, and `test/rest.test.js` are untouched. The gRPC readings continue
to use the same fixture values and source order, so positive-limit and unary results can be compared
directly with the REST baseline.

### Other error and transport boundaries

Malformed requests remain `INVALID_ARGUMENT` (`invalid_request`), a limit that is not a
non-negative integer remains `INVALID_ARGUMENT` (`invalid_limit`), unknown methods remain
`UNIMPLEMENTED` (`unimplemented`), and unsupported compression remains `UNIMPLEMENTED`
(`unsupported_compression`). Responses still use HTTP/2 status `200` for gRPC calls, with the real
outcome in the `grpc-status` trailer, and keep `content-type: application/grpc`.

## Checks run

- `node --test` from the repository root: **18 tests passed, 0 failed, 0 cancelled, 0 skipped,
  0 todo**. The suite covers the REST baseline, the raw HTTP/2 gRPC contract, and the gRPC client
  integration, including both the zero-limit and absent-limit defaults.
- Verified that `HEAD` is the complete accepted HEAD
  `4639ae44d78e7c1f9f5269876fa333a99bff770f` and that its tree is the accepted tree
  `99c40069ae834cf71618e2a142010f10bef0df06`.
- `git status --short` was clean before adding this review. `git diff --check` reports no whitespace
  errors, and the staged change for the review commit is only `MIGRATION-REVIEW.md`.
