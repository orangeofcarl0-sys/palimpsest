/**
 * GateRunner (H1 spec §3.2): the single entry for gate.command invocations.
 * Both gate call sites (explicit gate / auto-gate) go through here so the
 * transient classification is shared with promotion instead of diverging.
 *
 * Retry policy: LEDGER_BUSY is storage contention — the invocation never
 * started, and gate.command is read-only and re-runnable, so a short
 * exponential backoff is safe. OPERATION_BUSY on a gate operation means the
 * same attempt+predicate is already running elsewhere — that is a caller
 * bug and fails loudly. Every other Ordarium error propagates unchanged
 * (fail-closed; the attempt surfaces it through the normal report path).
 */

import type { JsonValue } from "@ordarium/core";

import { isLedgerBusyError, sleep } from "../effects/errors.js";
import type { PalimpsestEffectsRuntime } from "../effects/runtime.js";

export interface GateCommandRequest {
  worktreeId: string;
  executable: string;
  argv: string[];
  scope: string;
  callId: string;
  /** Plan revision the gate runs under (authorization evidence derivation). */
  revision: number;
}

export interface GateRunnerOptions {
  retries?: number | undefined;
  backoffMs?: number | undefined;
  /** Injectable for deterministic tests; defaults to a real timer. */
  sleepFn?: ((ms: number) => Promise<void>) | undefined;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 200;

export async function runGateCommand(
  effects: PalimpsestEffectsRuntime,
  request: GateCommandRequest,
  options: GateRunnerOptions = {},
): Promise<JsonValue> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const pause = options.sleepFn ?? sleep;
  let attempt = 0;
  for (;;) {
    try {
      return await effects.invoke(
        effects.actions.gateCommand,
        { worktreeId: request.worktreeId, executable: request.executable, argv: request.argv },
        { scope: request.scope, callId: request.callId, revision: request.revision },
      );
    } catch (error) {
      if (!isLedgerBusyError(error) || attempt >= retries) {
        throw error;
      }
      attempt += 1;
      await pause(backoffMs * 2 ** (attempt - 1));
    }
  }
}
