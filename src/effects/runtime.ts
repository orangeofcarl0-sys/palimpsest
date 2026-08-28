/**
 * Palimpsest effects runtime: the process-level owner of the shared Ordarium
 * ledger (共账拓扑) plus deterministic identity/authorization for the
 * internal Safe Action invocations the orchestrator makes on its own behalf.
 *
 * Palimpsest is an explicit Action-calling host (Ordarium docs/12 §9): it
 * does not register Ordarium tools into a host; it invokes its own defined
 * actions through this runtime.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import {
  OrdariumRuntime,
  type Action,
  type AuthorizationDecision,
  type InvocationIdentity,
  type JsonValue,
  type RuntimeHooks,
} from "@ordarium/core";
import { SqliteLedger } from "@ordarium/ledger-sqlite";

import { defineEffects } from "./actions.js";
import type { GitPort } from "./git_port.js";

export interface PalimpsestEffectsRuntimeOptions {
  /** Ordarium ledger path; defaults to $DSH_HOME/ordarium/operations.sqlite. */
  databasePath?: string | undefined;
  git: GitPort;
  ownerId?: string | undefined;
  clock?: (() => Date) | undefined;
  hooks?: RuntimeHooks | undefined;
  /** Default 30s; tests shorten it so crash recovery can be driven with ManualClock. */
  leaseMs?: number | undefined;
  allowVolatileLedger?: boolean | undefined;
}

export function defaultOrdariumPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome =
    configured === undefined || configured.length === 0
      ? join(homedir(), ".dsh")
      : configured;
  return join(dshHome, "ordarium", "operations.sqlite");
}

export interface PalimpsestEffectsRuntime {
  readonly runtime: OrdariumRuntime;
  readonly actions: ReturnType<typeof defineEffects>;
  invoke<O extends JsonValue>(
    action: Action<JsonValue, O>,
    input: unknown,
    intent: OrchestrationIntent,
  ): Promise<O>;
  /** Narrow-input form for actions whose schemas parse to concrete inputs. */
  invoke<I extends JsonValue, O extends JsonValue>(
    action: Action<I, O>,
    input: unknown,
    intent: OrchestrationIntent,
  ): Promise<O>;
  close(): Promise<void>;
}

/**
 * The intent behind one internal orchestration invocation. `revision` is the
 * project revision the effect is authorized under - the authorization evidence
 * recorded on the Ordarium operation derives from it (H1 spec §3.5, P2-4),
 * so every record points at the governance state that authorized it.
 */
export interface OrchestrationIntent {
  scope: string;
  callId: string;
  revision: number;
  lineage?: string[];
}

export function orchestrationAuthorization(
  action: Action<JsonValue, JsonValue>,
  intent: OrchestrationIntent,
): AuthorizationDecision {
  return {
    decision: "allow",
    kind: "policy-decision",
    source: `plan-revision:${intent.revision}`,
    reason: `internal orchestration effect ${action.name} under plan revision ${intent.revision}`,
  };
}

export function createPalimpsestEffects(
  options: PalimpsestEffectsRuntimeOptions,
): PalimpsestEffectsRuntime {
  const databasePath = options.databasePath ?? defaultOrdariumPath();
  const runtime = new OrdariumRuntime({
    ledger: new SqliteLedger(databasePath),
    deploymentCoordination: "local-multi-process",
    clock: options.clock,
    hooks: options.hooks,
    ownerId: options.ownerId,
    ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
    ...(options.allowVolatileLedger === undefined
      ? {}
      : { allowVolatileLedger: options.allowVolatileLedger }),
  });
  const actions = defineEffects(options.git);

  function invoke<I extends JsonValue, O extends JsonValue>(
    action: Action<I, O>,
    input: unknown,
    intent: OrchestrationIntent,
  ): Promise<O> {
    const identity: InvocationIdentity = {
      source: "palimpsest",
      scope: intent.scope,
      callId: intent.callId,
      ...(intent.lineage === undefined
        ? {}
        : { lineage: intent.lineage, rootCallId: intent.callId }),
    };
    return action.run(runtime, input, {
      identity,
      authorization: orchestrationAuthorization(action as unknown as Action<JsonValue, JsonValue>, intent),
    });
  }

  return {
    runtime,
    actions,
    invoke,
    async close() {
      await runtime.close();
    },
  };
}
