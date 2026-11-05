# Billing cutover — migration plan

## Current measured basis

# Measured billing batch payload

The billing batch payload was measured on 2026-11-03.

- p50: 1.4 MiB
- p95: 2.1 MiB
- max: 3.4 MiB

The legacy gateway's 64 KiB unary limit is an assumption about the old REST path, not a property of
the batch data. A unary gRPC call is not admissible at the measured size; the batch path must stream.

## Decision

Use client-streaming RPCs for the batch path. A unary call is not admissible at the measured payload size.

## Modules in scope

- orders: keep the existing REST facade; no payload change.
- billing: replace the batch REST endpoint with a streaming gRPC method; tests cover the measured sizes.
- gateway: enable streaming passthrough; the legacy assumption is not part of the new path.
