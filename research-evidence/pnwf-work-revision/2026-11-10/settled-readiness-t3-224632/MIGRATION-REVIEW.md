# Migration review — Fleet default `StreamReadings` limit

## Accepted version

- **Accepted HEAD:** `4639ae44d78e7c1f9f5269876fa333a99bff770f`
- **Accepted tree:** `99c40069ae834cf71618e2a142010f10bef0df06`
- **Promotion:** `promotion-34fa933109fc3261015f35b8370c0e40` (attempt `attempt-50afeb5d5bdea0421a8ad97588a05c46`)
- **Accepted candidate:** `be05447e061a23157ed04e3ee4b27ec7f571e94e`
- **Accepted basis:** `fbeb8958f4405688b13f37dbdec330157a660ab0`

The acceptance record is `acceptance.json`. The promoted HEAD is the merge of the accepted basis
`fbeb8958f4405688b13f37dbdec330157a660ab0` and the accepted Fleet candidate
`be05447e061a23157ed04e3ee4b27ec7f571e94e`. The candidate tree and the promoted HEAD tree are both
`99c40069ae834cf71618e2a142010f10bef0df06`, so the accepted HEAD contains exactly the reviewed
candidate content.

## Fleet correction path

The correction requirement is recorded at `updates/2026-11-10/fleet-default-limit.md`. Its Git path
is:

1. `fbeb8958f4405688b13f37dbdec330157a660ab0` — records the correction note on top of the original
   migration.
2. `be05447e061a23157ed04e3ee4b27ec7f571e94e` — implements the correction in the candidate.
3. `4639ae44d78e7c1f9f5269876fa333a99bff770f` — promotes the candidate; this is the complete
   accepted HEAD, with parents `fbeb8958f440...` and `be05447e061a...`.

The correction changes only `service/grpc_server.js`, `MIGRATION.md`, `test/integration.test.js`, and
`test/server.test.js` (61 insertions, 14 deletions).

## Old and new default

Both an omitted limit and an explicitly zero limit decode to `limit: 0` in
`StreamReadingsRequest`.

- **Old default (first release):** limit `0` was passed directly to `readings.slice(0, 0)`. The
  result was a successful but empty stream: no `Reading` frames and `grpc-status: 0`. It did not
  mean "all readings".
- **New default (accepted correction):** `service/grpc_server.js` maps limit `0` to
  `DEFAULT_STREAM_LIMIT = 3`, then serves `readings.slice(0, 3)`. An omitted or zero limit therefore
  returns the first three available readings in source order, or fewer when the site has fewer than
  three. It still does not mean "all readings".
- **Positive limits:** unchanged. A positive limit selects `readings.slice(0, limit)`; a limit larger
  than the available set still returns all available readings.

`proto/energy.proto` remains byte-for-byte unchanged from the accepted basis, so its
`StreamReadings` comment still describes the superseded empty-stream behavior. The effective
behavior is documented in `MIGRATION.md` and implemented in `service/grpc_server.js`; the stale
comment is informational and is the only residual documentation inconsistency. It should be aligned
the next time the proto contract is revised.

## Unchanged compatibility boundaries

- **REST contract:** `GET /sites/:id/reading`, `GET /sites/:id/readings?limit=N`, source ordering,
  `{ siteId, watts, atMs }` values, `404 { error: "unknown_site" }`, and
  `400 { error: "invalid_limit" }` are unchanged.
- **Protobuf contract:** `energy.v1.EnergyService`, both method names, message names, and field
  numbers (`site_id = 1`, `limit = 2`, `watts = 2`, `at_ms = 3`) are unchanged.
- **Wire format:** the five-byte frame header (one compressed-flag byte plus a four-byte big-endian
  length), identity-only encoding, HTTP/2 `application/grpc`, and `grpc-status` trailers are
  unchanged.
- **`GetReading`:** remains unary, returns the current reading, and returns NOT_FOUND
  (`grpc-status: 5`, `unknown_site`) for an unknown site.
- **`StreamReadings` errors:** unknown sites remain NOT_FOUND, invalid limits remain INVALID_ARGUMENT
  (`grpc-status: 3`, `invalid_limit`), malformed requests remain INVALID_ARGUMENT, unknown methods
  remain UNIMPLEMENTED, and unsupported compression remains UNIMPLEMENTED.
- **Client and dependencies:** `service/grpc_client.js` and its API are unchanged; the service still
  uses Node.js built-ins only, with no third-party gRPC package.

The following files are byte-identical to accepted basis `fbeb8958f440...`:
`proto/energy.proto`, `service/wire.js`, `service/data.js`, `service/rest_server.js`,
`service/rest_client.js`, and `test/rest.test.js`.

## Checks run

- `node --test` from the repository root at accepted HEAD: **18 passed, 0 failed, 0 skipped,
  0 cancelled**. The suite covers:
  - 6 integration tests through `service/grpc_client.js`: unary `GetReading`, positive-limit
    streaming, zero-limit and omitted-limit defaults, unknown-site NOT_FOUND on both methods, and
    equivalence with the preserved REST baseline.
  - 3 unchanged REST baseline tests.
  - 9 server/wire tests: five-byte framing, split/multiple frame decoding, request round-trips,
    unary and streaming trailers, source order, zero/omitted defaults, NOT_FOUND, and UNIMPLEMENTED.
- `git diff --name-only fbeb8958f440...4639ae44d78e` reports exactly the four correction paths
  listed above; no other accepted-basis file changed.
- `git rev-parse HEAD^{tree}`, the accepted candidate tree, and the acceptance tree all resolve to
  `99c40069ae834cf71618e2a142010f10bef0df06`.
- The accepted HEAD's parents were checked as `fbeb8958f440...` and `be05447e061a...`; the working
  tree was clean before this review was added.
- Protected-path blob hashes at accepted HEAD match the accepted basis for `proto/energy.proto`,
  `service/wire.js`, `service/data.js`, `service/rest_server.js`, `service/rest_client.js`, and
  `test/rest.test.js`.

## Review conclusion

The accepted HEAD matches the promoted candidate, changes only the intended Fleet default behavior
and its documentation/tests, and preserves the REST, protobuf, wire, and error compatibility
boundaries above. No compatibility regression was found. The review is delivered against
`4639ae44d78e7c1f9f5269876fa333a99bff770f`; the only follow-up is to update the stale
`proto/energy.proto` comment when the contract is next revised.
