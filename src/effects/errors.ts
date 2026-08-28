/**
 * Shared Ordarium error classification for the effects layer (H1 spec §3.2).
 * Promotion and gate invocations must agree on which failures leave the
 * durable outcome intentionally unresolved (transient) versus terminal, so
 * the classification lives in exactly one place.
 */

import {
  LedgerBusyError,
  OperationBusyError,
  SimulatedProcessCrash,
  UncertainOperationError,
} from "@ordarium/core";

/**
 * The operation's outcome is intentionally unresolved: Ordarium keeps the
 * record open (uncertain / in-flight) and a restart reclaims or reconciles.
 * Terminalizing on these would fabricate a verdict Ordarium does not have.
 */
export function isTransientOperationError(error: unknown): boolean {
  return (
    error instanceof UncertainOperationError ||
    error instanceof OperationBusyError ||
    error instanceof SimulatedProcessCrash
  );
}

/** Storage-level contention: the invocation never started; retry is safe. */
export function isLedgerBusyError(error: unknown): boolean {
  return error instanceof LedgerBusyError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
