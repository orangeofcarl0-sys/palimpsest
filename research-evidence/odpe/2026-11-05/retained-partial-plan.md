# Billing cutover — migration plan (partial)

## Proposed approach

Move the billing batch endpoint to a unary gRPC method. The batch payload is assumed to be well
under the legacy 64 KiB gateway limit, so no streaming is needed.

## Open items

- gateway limits
- rollout order
