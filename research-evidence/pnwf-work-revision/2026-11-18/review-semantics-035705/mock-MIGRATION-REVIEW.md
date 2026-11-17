# Migration review

Accepted HEAD: 4639ae44d78e7c1f9f5269876fa333a99bff770f

Fleet correction: updates/2026-11-10/fleet-default-limit.md. Previously, supplying limit=0 or leaving the limit unset yielded no readings. Both forms now return the first 3 available readings in dataset order. StreamReadings sends every Reading in its own gRPC message frame. Positive limits, unary GetReading, unknown-site NOT_FOUND, protocol field numbers and REST behavior stay compatible.

Verification: node --test passed for gRPC server, integration and REST tests.
