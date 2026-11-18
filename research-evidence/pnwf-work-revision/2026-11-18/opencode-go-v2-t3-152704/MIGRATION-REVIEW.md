# Migration review — Fleet `StreamReadings` default limit

## Review basis

This review evaluates the accepted migration at the complete accepted HEAD:

- **Accepted HEAD:** `4639ae44d78e7c1f9f5269876fa333a99bff770f`
- Approved candidate: `be05447e061a23157ed04e3ee4b27ec7f571e94e`
- Accepted basis: `fbeb8958f4405688b13f37dbdec330157a660ab0`
- Acceptance record: `acceptance.json` (`GOVERNED_PROMOTION`, promotion `promotion-34fa933109fc3261015f35b8370c0e40`)
- Fleet correction path: `updates/2026-11-10/fleet-default-limit.md`

The correction requires the Fleet consumer's zero or omitted `StreamReadings` limit to request the
first three available readings in source order. The first release returned an empty stream for those
requests.

## Default-limit behavior: first release vs. accepted behavior

The proto3 `limit` field is absent from the wire when the caller omits it, and is encoded as `0` when
the caller explicitly supplies zero. `service/wire.js` decodes an absent `uint32 limit` as `0`, so both
request forms reach the same server decision. At the accepted HEAD,
`service/grpc_server.js` maps that zero value to `DEFAULT_STREAM_LIMIT = 3`.

| Request form | First-release behavior | Accepted behavior at HEAD |
| --- | --- | --- |
| **Supplied limit of zero** (`limit` field present, value `0`) | Empty stream: no Reading frames, followed by `grpc-status: 0`. | The first three available readings in source order, or fewer if the site has fewer; `grpc-status: 0`. |
| **Absent limit** (`limit` field omitted, decoded as `0`) | Empty stream: no Reading frames, followed by `grpc-status: 0`. | The first three available readings in source order, or fewer if the site has fewer; `grpc-status: 0`. |

The new default is exactly three readings; zero/omitted does **not** mean "all readings". For the
fixture site `site-a`, both request forms return the readings at `atMs` values `1762300000000`,
`1762300060000`, and `1762300120000`, in that order.

The `StreamReadings` comment in `proto/energy.proto` still describes the superseded first-release
behavior (an empty stream). The proto file is unchanged byte-for-byte; the comment is informational
only, and the effective behavior is the one implemented by `service/grpc_server.js` and documented in
`MIGRATION.md`.

## Unchanged compatibility boundaries

- **Source ordering:** `StreamReadings` returns readings in the same source order as the REST list,
  selecting a prefix of that ordered sequence. The default is the first three entries, not an
  arbitrary or re-sorted sample.
- **One Reading per gRPC message frame:** `StreamReadings` sends each `Reading` in its own gRPC message
  frame, each with the five-byte frame header (compression flag plus big-endian message length). Three
  default readings therefore mean three separate frames, not one frame containing a repeated message.
- **Positive limits:** A positive `limit` still selects `readings.slice(0, limit)`. A limit larger than
  the available readings returns all available readings. A limit that is not a non-negative integer
  (including values outside the `uint32` range) remains `INVALID_ARGUMENT` with `invalid_limit`.
- **Unary `GetReading`:** Still accepts exactly one `GetReadingRequest` frame and returns exactly one
  `Reading` frame. `site-a` returns its first/current reading, matching
  `GET /sites/site-a/reading`.
- **Unknown-site errors:** Both `GetReading` and `StreamReadings` still return gRPC `NOT_FOUND`
  (`grpc-status: 5`, message `unknown_site`) for an unknown site. They never return an empty successful
  response or an empty stream.
- **Protobuf field numbers:** The committed wire contract remains stable:
  `GetReadingRequest.site_id = 1`; `StreamReadingsRequest.site_id = 1` and `limit = 2`;
  `Reading.site_id = 1`, `watts = 2`, and `at_ms = 3`. No field is renumbered, removed, or repurposed.
  `at_ms` remains an epoch-millisecond integer with no locale or timezone formatting.
- **REST compatibility:** `service/rest_server.js`, `service/rest_client.js`, `test/rest.test.js`, and
  the REST routes are unchanged. `GET /sites/:id/reading` returns one reading;
  `GET /sites/:id/readings?limit=N` returns `{ readings: [...] }` in source order; an unknown site is
  `404 { error: "unknown_site" }`; an invalid limit is `400 { error: "invalid_limit" }`.
- **Framing and error path:** HTTP/2 with `content-type: application/grpc`, identity compression only,
  and outcomes carried in `grpc-status` trailers remain unchanged. Malformed requests remain
  `INVALID_ARGUMENT`, unknown methods remain `UNIMPLEMENTED`, and unsupported compression remains
  `UNIMPLEMENTED`.

## Checks run

- `node --test` — **passed: 18 tests, 18 pass, 0 fail, 0 cancelled, 0 skipped** (about 365 ms).
  This includes the raw HTTP/2 server tests for zero and omitted limits, each sending three separate
  Reading frames; positive-limit and source-order coverage; unary `GetReading`; unknown-site
  `NOT_FOUND`; `UNIMPLEMENTED`; framing and codec round-trips; the client integration tests; and the
  unchanged REST baseline tests.
- `git diff --name-only fbeb8958f4405688b13f37dbdec330157a660ab0..HEAD` — only the four intended paths
  changed: `MIGRATION.md`, `service/grpc_server.js`, `test/integration.test.js`, and
  `test/server.test.js`.
- `git diff --quiet fbeb8958f4405688b13f37dbdec330157a660ab0..HEAD` for `proto/energy.proto`,
  `test/rest.test.js`, `service/rest_server.js`, and `service/rest_client.js` — no differences; the
  proto, REST implementation, REST client, and REST tests remain at the accepted basis.

## Conclusion

The accepted HEAD implements the Fleet correction for both explicitly supplied zero and absent limits
while preserving source ordering, one-Reading-per-frame streaming, positive-limit behavior, unary
`GetReading`, unknown-site `NOT_FOUND`, protobuf field numbers, and REST compatibility. The full test
suite passes at this accepted version.
