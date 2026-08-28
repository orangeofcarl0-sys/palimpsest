import { describe, expect, it, vi } from "vitest";

import { LedgerBusyError, OperationConflictError } from "@ordarium/core";

import { runGateCommand, type GateRunnerOptions } from "../src/tools/gate_runner.js";

function fakeEffects(invocations: Array<Promise<unknown>>) {
  let n = 0;
  const invoke = vi.fn(() => {
    const result = invocations[Math.min(n, invocations.length - 1)] ?? invocations.at(-1);
    n += 1;
    return result;
  });
  return {
    invoke: invoke as unknown as (
      action: unknown,
      input: unknown,
      intent: unknown,
    ) => Promise<unknown>,
    actions: { gateCommand: { name: "palimpsest.gate.command", version: "1" } },
    calls: invoke,
  };
}

const REQUEST = {
  worktreeId: "attempt-1",
  executable: "node",
  argv: ["--eval", "process.exit(0)"],
  scope: "proj-1",
  callId: "gate:auto:attempt-1",
  revision: 3,
};

const instantSleep = async (): Promise<void> => undefined;

describe("H1-B: GateRunner (spec §3.2)", () => {
  it("H1-B1: a LEDGER_BUSY contention error is retried and the gate succeeds", async () => {
    const effects = fakeEffects([Promise.reject(new LedgerBusyError()), Promise.resolve({ exitCode: 0 })]);
    const outcome = (await runGateCommand(effects as never, REQUEST, {
      sleepFn: instantSleep,
    })) as { exitCode: number };
    expect(outcome.exitCode).toBe(0);
    expect(effects.calls).toHaveBeenCalledTimes(2);
  });

  it("H1-B2: a non-transient Ordarium error propagates immediately (fail-closed)", async () => {
    const effects = fakeEffects([Promise.reject(new OperationConflictError("op_1"))]);
    await expect(
      runGateCommand(effects as never, REQUEST, { sleepFn: instantSleep }),
    ).rejects.toBeInstanceOf(OperationConflictError);
    expect(effects.calls).toHaveBeenCalledTimes(1);
  });

  it("H1-B3: retries are bounded - persistent contention exhausts and throws", async () => {
    const effects = fakeEffects([Promise.reject(new LedgerBusyError())]);
    await expect(
      runGateCommand(effects as never, REQUEST, { retries: 2, sleepFn: instantSleep }),
    ).rejects.toBeInstanceOf(LedgerBusyError);
    expect(effects.calls).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("H1-B4: the recorded authorization derives from the plan revision", async () => {
    const effects = fakeEffects([Promise.resolve({ exitCode: 0 })]);
    await runGateCommand(effects as never, REQUEST, { sleepFn: instantSleep });
    const call = effects.calls.mock.calls[0] as unknown[] | undefined;
    const intent = (call?.[2] ?? {}) as { revision: number };
    expect(intent.revision).toBe(3);
  });
});

export type { GateRunnerOptions };
