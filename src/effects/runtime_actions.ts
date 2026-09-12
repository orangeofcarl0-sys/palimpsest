/**
 * G10-D2 runtime carrier effects: the Ordarium Safe Actions through which
 * EVERY runtime carrier mutation executes (§42/§43).
 *
 *   palimpsest.runtime.carrier.realize  idempotent(durable) — same
 *     realizationKey reuses the existing carrier (the port contract requires
 *     idempotent create/resume keyed by realizationKey; §45 crash-boundary:
 *     exactly-once is NOT assumed, retries re-invoke with the same key).
 *   palimpsest.runtime.carrier.release  idempotent(durable) — releasing twice
 *     is the same operation, not a second effect.
 *
 * The action input carries exactly the immutable grounding needed to audit
 * the effect (activationId, agentDefinitionId, runDefinition digest,
 * bindingResolution id/digest, continuity target, realizationKey) — never
 * full Work/Architecture documents (§43). The port is reachable ONLY inside
 * `execute`: no production path may call `port.realize/release` directly
 * (§42; machine-audited).
 *
 * No Palimpsest fake EffectReceipt is created (§46): Ordarium owns operation
 * truth on its ledger; RuntimeAttachment refers to host identities only.
 */

import { defineAction, effects, type JsonValue } from "@ordarium/core";

import type {
  RuntimeCarrierPort,
  RuntimeCarrierRealizeRequest,
  RuntimeCarrierReleaseRequest,
} from "../runtime/carrier_port.js";
import { ContinuityUnavailableError } from "../runtime/realize.js";

interface JsonRecord {
  [key: string]: JsonValue;
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
  };
}

function stringFields(input: unknown, expected: readonly string[]): JsonRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const record = input as Record<string, unknown>;
  const result: JsonRecord = {};
  for (const key of expected) {
    if (typeof record[key] !== "string") {
      throw new TypeError(`${key} must be a string`);
    }
    result[key] = record[key];
  }
  return result;
}

export interface RuntimeCarrierRealizeInput extends Record<string, JsonValue> {
  realizationKey: string;
  activationId: string;
  agentDefinitionId: string;
  runDefinitionDigest: string;
  bindingResolutionId: string;
  bindingResolutionDigest: string;
  continuityKind: string;
  continuityPoint: string | null;
}

export interface RuntimeCarrierReleaseInput extends Record<string, JsonValue> {
  realizationKey: string;
  activationId: string;
  runtimeAdapter: string;
  agentId: string;
}

export function defineRuntimeCarrierEffects(port: RuntimeCarrierPort) {
  const runtimeCarrierRealize = defineAction({
    name: "palimpsest.runtime.carrier.realize",
    version: "1",
    description:
      "Realize (create or idempotently resume) the host runtime carrier for one prepared activation",
    input: {
      jsonSchema: objectSchema(
        {
          realizationKey: { type: "string" },
          activationId: { type: "string" },
          agentDefinitionId: { type: "string" },
          runDefinitionDigest: { type: "string" },
          bindingResolutionId: { type: "string" },
          bindingResolutionDigest: { type: "string" },
          continuityKind: { type: "string", enum: ["ephemeral", "persistent"] },
          continuityPoint: { type: ["string", "null"] },
        },
        [
          "realizationKey",
          "activationId",
          "agentDefinitionId",
          "runDefinitionDigest",
          "bindingResolutionId",
          "bindingResolutionDigest",
          "continuityKind",
          "continuityPoint",
        ],
      ) as Record<string, JsonValue>,
      parse: (input) => {
        const fields = stringFields(input, [
          "realizationKey",
          "activationId",
          "agentDefinitionId",
          "runDefinitionDigest",
          "bindingResolutionId",
          "bindingResolutionDigest",
          "continuityKind",
        ]) as unknown as RuntimeCarrierRealizeInput;
        const point = (input as Record<string, unknown>).continuityPoint;
        if (typeof point !== "string" && point !== null) {
          throw new TypeError("continuityPoint must be a string or null");
        }
        if (fields.continuityKind === "persistent" && typeof point !== "string") {
          throw new TypeError("persistent continuity targets require continuityPoint");
        }
        if (fields.continuityKind !== "persistent" && fields.continuityKind !== "ephemeral") {
          throw new TypeError('continuityKind must be "ephemeral" or "persistent"');
        }
        fields.continuityPoint = point as string | null;
        return fields;
      },
    },
    output: {
      // §66: typed outcomes must survive the Ordarium JSON boundary — a locus
      // that became unavailable is a RESULT (realized:false), never a thrown
      // class that would be wrapped into an opaque operation failure.
      jsonSchema: objectSchema(
        {
          realized: { type: "boolean" },
          runtimeAdapter: { type: ["string", "null"] },
          agentId: { type: ["string", "null"] },
          sessionId: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
        },
        ["realized", "runtimeAdapter", "agentId", "sessionId", "reason"],
      ) as Record<string, JsonValue>,
      parse: (input) => {
        if (typeof input !== "object" || input === null) {
          throw new TypeError("output must be an object");
        }
        const record = input as Record<string, unknown>;
        if (typeof record.realized !== "boolean") throw new TypeError("realized must be a boolean");
        for (const key of ["runtimeAdapter", "agentId", "sessionId", "reason"] as const) {
          if (typeof record[key] !== "string" && record[key] !== null) {
            throw new TypeError(`${key} must be a string or null`);
          }
        }
        return input as unknown as {
          realized: boolean;
          runtimeAdapter: string | null;
          agentId: string | null;
          sessionId: string | null;
          reason: string | null;
        };
      },
    },
    effect: effects.idempotent(),
    async execute(input) {
      const request: RuntimeCarrierRealizeRequest = {
        realizationKey: input.realizationKey,
        activationId: input.activationId,
        agentDefinitionId: input.agentDefinitionId,
        runDefinitionDigest: input.runDefinitionDigest,
        bindingResolutionId: input.bindingResolutionId,
        bindingResolutionDigest: input.bindingResolutionDigest,
        continuityTarget:
          input.continuityKind === "persistent"
            ? { kind: "persistent", point: input.continuityPoint as string }
            : { kind: "ephemeral" },
      };
      try {
        const result = await port.realize(request);
        return {
          realized: true,
          runtimeAdapter: result.runtimeAgent.runtimeAdapter,
          agentId: result.runtimeAgent.agentId,
          sessionId: result.session === undefined ? null : result.session.sessionId,
          reason: null,
        };
      } catch (error) {
        // §66: a locus that became unavailable before the effect is a typed
        // RESULT — no silent fallback, and the distinction survives the
        // Ordarium boundary (arbitrary thrown classes would be wrapped).
        if (error instanceof ContinuityUnavailableError) {
          return {
            realized: false,
            runtimeAdapter: null,
            agentId: null,
            sessionId: null,
            reason: "continuity_unavailable",
          };
        }
        throw error;
      }
    },
  });

  const runtimeCarrierRelease = defineAction({
    name: "palimpsest.runtime.carrier.release",
    version: "1",
    description: "Release the host runtime carrier realizing one activation (idempotent)",
    input: {
      jsonSchema: objectSchema(
        {
          realizationKey: { type: "string" },
          activationId: { type: "string" },
          runtimeAdapter: { type: "string" },
          agentId: { type: "string" },
        },
        ["realizationKey", "activationId", "runtimeAdapter", "agentId"],
      ) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["realizationKey", "activationId", "runtimeAdapter", "agentId"]) as unknown as RuntimeCarrierReleaseInput,
    },
    output: {
      jsonSchema: objectSchema({ released: { type: "boolean" } }, ["released"]) as Record<
        string,
        JsonValue
      >,
      parse: (input) => {
        if (
          typeof input !== "object" ||
          input === null ||
          typeof (input as Record<string, unknown>).released !== "boolean"
        ) {
          throw new TypeError("released must be a boolean");
        }
        return { released: (input as Record<string, unknown>).released as boolean };
      },
    },
    effect: effects.idempotent(),
    async execute(input) {
      if (port.release === undefined) {
        throw new TypeError(
          `runtime adapter "${port.adapterId}" does not support carrier release`,
        );
      }
      const request: RuntimeCarrierReleaseRequest = {
        realizationKey: input.realizationKey,
        activationId: input.activationId,
        runtimeAgent: { runtimeAdapter: input.runtimeAdapter, agentId: input.agentId },
      };
      await port.release(request);
      return { released: true };
    },
  });

  return { runtimeCarrierRealize, runtimeCarrierRelease };
}

export type RuntimeCarrierEffects = ReturnType<typeof defineRuntimeCarrierEffects>;
