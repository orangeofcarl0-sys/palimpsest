# Migration review — Fleet StreamReadings default

## Review basis

This review uses the accepted version recorded in `acceptance.json`.

| Item | Value |
| --- | --- |
| Accepted HEAD | `7deda735afa4ef97e71dd14b5ab4b48131e1e872` |
| Accepted tree | `d36f247e6580dfc42d445d571c0a4bc0f68ebe03` |
| Approved candidate | `35f2fb69557e1965ef1e88f723fb600b9e9f0ae3` |
| Pre-promotion basis | `fbeb8958f4405688b13f37dbdec330157a660ab0` |
| Promotion | `promotion-e9e873288568959862b7ba36bc08cdfe` |

The Fleet correction path is documented in
`updates/2026-11-10/fleet-default-limit.md` and was delivered through candidate commit
`35f2fb69557e1965ef1e88f723fb600b9e9f0ae3`, then
`promotion-e9e873288568959862b7ba36bc08cdfe`, producing accepted HEAD
`7deda735afa4ef97e71dd14b5ab4b48131e1e872`. The correction itself is in
`service/grpc_server.js` (`DEFAULT_STREAM_LIMIT` and the `StreamReadings` limit normalization), with
coverage in `test/integration.test.js` and `test/server.test.js` and the effective contract documented
in `MIGRATION.md`.

## Finding

No blocking findings in the accepted version.

The change is narrowly scoped to the Fleet default. The accepted HEAD changes only:

- `MIGRATION.md`
- `service/grpc_server.js`
- `test/integration.test.js`
- `test/server.test.js`

## Default change

The old behaviour treated both an omitted limit and an explicitly zero limit as an empty stream: no
Reading frames followed by `grpc-status: 0`. Neither form meant "all readings".

The accepted behaviour treats both forms as a request for the first three available readings in
source order, followed by `grpc-status: 0`. Positive limits remain unchanged and still select
`readings.slice(0, limit)`.

This is implemented by normalizing a decoded zero limit to `DEFAULT_STREAM_LIMIT` (`3`) in
`service/grpc_server.js`. Because the wire decoder represents an omitted limit as `0`, the same
normalization covers both request forms. The accepted documentation states that the default is the
first three available readings, not all readings.

## Unchanged compatibility boundaries

- **Protobuf contract.** `proto/energy.proto` is byte-for-byte identical to the pre-promotion basis.
  The service name, method names, message field numbers, field types, and `at_ms` epoch-millisecond
  representation are unchanged.
- **REST surface.** `service/rest_server.js`, `service/rest_client.js`, and `test/rest.test.js` are
  unchanged. `GET /sites/:id/reading` and `GET /sites/:id/readings?limit=N` keep their existing
  payloads, source order, fixture values, `404 { error: "unknown_site" }` for unknown sites, and
  `400 { error: "invalid_limit" }` for invalid limits.
- **Framing and codec.** `service/wire.js` is unchanged: the five-byte frame header, identity-only
  compression handling, protobuf codecs, unknown-field skipping, and split/multiple-frame handling
  remain as reviewed in the first release.
- **gRPC client.** `service/grpc_client.js` is unchanged, including its `GrpcError` status/message
  handling and per-call HTTP/2 session lifecycle.
- **Other gRPC behaviour.** `GetReading`, positive `StreamReadings` limits, source ordering, NOT_FOUND
  for unknown sites, INVALID_ARGUMENT for malformed or invalid requests, UNIMPLEMENTED for unknown
  methods and unsupported compression, HTTP/2 status `200` with the outcome in `grpc-status` trailers,
  and the h2c test setup are unchanged.
- **Dependencies.** `package.json` is unchanged and no third-party package was added; the
  implementation remains on Node.js built-ins.

## Documentation caveat

The comment in `proto/energy.proto` still says that an omitted or zero limit returns an empty stream.
That comment is stale relative to the accepted Fleet behaviour. It is non-blocking here because the
proto file was deliberately kept byte-for-byte identical to preserve the reviewed wire boundary and
the discrepancy is explicitly called out in `MIGRATION.md`. Correcting the comment should be a
separately governed proto/documentation change, not an unrecorded edit to this accepted version.

## Checks run

All checks were run against the accepted HEAD in `/run/stage/world`.

- `node --test` — 18 tests passed, 0 failed, 0 cancelled, 0 skipped (duration 335.381019 ms).
- `git diff --name-status fbeb8958f4405688b13f37dbdec330157a660ab0..7deda735afa4ef97e71dd14b5ab4b48131e1e872`
  — exactly the four files listed above.
- `git diff --exit-code fbeb8958f4405688b13f37dbdec330157a660ab0..7deda735afa4ef97e71dd14b5ab4b48131e1e872 -- proto/energy.proto service/wire.js service/grpc_client.js test/rest.test.js`
  — exit 0; no differences in those compatibility-boundary files.
- `git diff --exit-code fbeb8958f4405688b13f37dbdec330157a660ab0..7deda735afa4ef97e71dd14b5ab4b48131e1e872 -- package.json`
  — exit 0; no package or dependency changes.
- `git diff --check fbeb8958f4405688b13f37dbdec330157a660ab0..7deda735afa4ef97e71dd14b5ab4b48131e1e872`
  — exit 0; no whitespace errors.
- SHA-256 comparison of the current files against the pre-promotion basis confirmed identical hashes
  for `proto/energy.proto`, `service/wire.js`, `service/grpc_client.js`, and `test/rest.test.js`.
- Commit/tree verification confirmed that the accepted tree is
  `d36f247e6580dfc42d445d571c0a4bc0f68ebe03`, equal to both the approved candidate's tree and the
  tree recorded in `acceptance.json`.

## Conclusion

The accepted HEAD `7deda735afa4ef97e71dd14b5ab4b48131e1e872` is the reviewed migration version. The
Fleet default is corrected to the first three readings for omitted and explicit-zero requests, while
the protobuf contract, REST surface, wire/client code, positive-limit behaviour, error semantics, and
package contents remain within the accepted compatibility boundary. The only residual issue is the
known stale proto comment, which is documented and intentionally preserved in this accepted version.
