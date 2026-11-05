# Migration notes — REST to gRPC

## Mapping

| REST baseline | gRPC |
|---|---|
| `GET /sites/:id/reading` | `EnergyService.GetReading(SiteRequest) -> Reading` |
| `GET /sites/:id/readings?limit=N` | `EnergyService.StreamReadings(StreamRequest) -> stream Reading` |
| `404 { error: "unknown_site" }` | `grpc-status: 5`, `grpc-message: unknown_site` |
| JSON `{ siteId, watts, atMs }` | protobuf `Reading` (field 1 string, 2 int32, 3 int64) |

The console keeps its REST client; the fleet console uses `service/grpc_client.js`. Both read the
same source of truth and the integration test compares them directly.

## Streaming, not a batch

The first draft of this migration returned the readings as one `Readings` message (a unary
`GetReadings`). The fleet compatibility note of 2026-11-03
(`updates/2026-11-03/compat-streaming.md`) rules that out: the fleet client renders each sample as it
arrives and its buffer is 256 KiB, while 30 readings at 12 KiB each do not fit. The note requires:

- `StreamReadings` to be declared `returns (stream Reading)`;
- one `Reading` per frame;
- every frame under 16 KiB;
- `GetReading` to stay unary.

The implementation therefore writes one frame per reading with a 60 ms gap, and both
`test/server.test.js` and `test/integration.test.js` assert that the client callback fires while the
stream is still open (a batch written at the end would arrive in one burst). The `Readings` message
and its codec were removed with the batch RPC: keeping a codec for a message the contract no longer
declares would be dead wire surface.

## Wire details

A gRPC message is `[compressed:1][length:4 big-endian][protobuf bytes]`, carried over HTTP/2 with
`content-type: application/grpc`, `te: trailers`, and a `grpc-status` trailer. No third-party package
is used: `node:http2` and a small protobuf subset (`service/wire.js`) are the whole transport.

## Verification

`node --test` from the repository root. The suite covers the codec, the server's own wire behaviour,
the production client against the production server, and the untouched REST baseline.
