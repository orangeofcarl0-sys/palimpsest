# Task — migrate the site readings service to gRPC

The dispatch console still speaks REST. The fleet client is moving to gRPC, and the service must
speak it too without breaking what the console already relies on.

## Goal

Migrate the service interface to gRPC while preserving supported client behaviour. Update the
implementation and the integration tests. Deliver a runnable, reviewable migration.

## What "migrated" means here

- `proto/energy.proto` declares the service and its messages. Keep the message field numbers stable
  once they are committed.
- The wire codec lives in `service/wire.js`: a gRPC message is a 5-byte header (one compressed flag
  byte, then a 4-byte big-endian length) followed by the protobuf message bytes. The service uses
  HTTP/2 (`node:http2`) with `content-type: application/grpc` and `grpc-status` trailers. No
  third-party gRPC library may be added.
- `service/grpc_server.js` serves `/energy.v1.EnergyService/GetReading` and
  `/energy.v1.EnergyService/StreamReadings`.
- `service/grpc_client.js` is the client the fleet console will use.
- `test/server.test.js` and `test/integration.test.js` prove the behaviour by running the server.

## Rules

- Do not bypass independent verification, and do not claim a successful integration without running
  it. `node --test` must pass before you commit.
- Do not delete `test/rest.test.js` or weaken it. The existing console behaviour is part of the
  contract.
- Do not hand-edit generated files; there are none.
