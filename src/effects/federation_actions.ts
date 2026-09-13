/**
 * G10-E3 federation transport effects: the Ordarium Safe Actions through
 * which EVERY outbound peer message and wake executes (§66/§146).
 *
 *   palimpsest.federation.message.send  idempotent(durable) — the stable
 *     messageId is the idempotency basis: a retry must not duplicate remote
 *     delivery (the port honors the key; exactly-once is NOT assumed).
 *   palimpsest.federation.wake          idempotent(durable) — an attention
 *     signal, never an ack (§72/§73).
 *
 * The port is reachable ONLY inside action `execute`; no production path may
 * call `port.send/wake` directly (machine-audited).
 */

import { defineAction, effects, type JsonValue } from "@ordarium/core";

import type { PeerTransportPort } from "../federation/transport.js";

interface JsonRecord {
  [key: string]: JsonValue;
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return { type: "object", properties, required: [...required], additionalProperties: false };
}

function stringFields(input: unknown, expected: readonly string[]): JsonRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const record = input as Record<string, unknown>;
  const result: JsonRecord = {};
  for (const key of expected) {
    if (typeof record[key] !== "string") throw new TypeError(`${key} must be a string`);
    result[key] = record[key];
  }
  return result;
}

export interface PeerSendInput extends Record<string, JsonValue> {
  messageId: string;
  fromPeerId: string;
  toPeerId: string;
  threadId: string;
  body: string;
}

export interface PeerWakeInput extends Record<string, JsonValue> {
  wakeId: string;
  fromPeerId: string;
  toPeerId: string;
}

export function defineFederationEffects(port: PeerTransportPort) {
  const messageSend = defineAction({
    name: "palimpsest.federation.message.send",
    version: "1",
    description: "Send one collaboration message to a peer (stable messageId idempotency)",
    input: {
      jsonSchema: objectSchema(
        {
          messageId: { type: "string" },
          fromPeerId: { type: "string" },
          toPeerId: { type: "string" },
          threadId: { type: "string" },
          body: { type: "string" },
        },
        ["messageId", "fromPeerId", "toPeerId", "threadId", "body"],
      ) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["messageId", "fromPeerId", "toPeerId", "threadId", "body"]) as unknown as PeerSendInput,
    },
    output: {
      jsonSchema: objectSchema(
        { transportMessageId: { type: "string" }, delivered: { type: "boolean" } },
        ["transportMessageId", "delivered"],
      ) as Record<string, JsonValue>,
      parse: (input) => {
        if (typeof input !== "object" || input === null) throw new TypeError("output must be an object");
        const record = input as Record<string, unknown>;
        if (typeof record.transportMessageId !== "string" || typeof record.delivered !== "boolean") {
          throw new TypeError("transportMessageId/delivered malformed");
        }
        return { transportMessageId: record.transportMessageId, delivered: record.delivered };
      },
    },
    effect: effects.idempotent(),
    async execute(input) {
      const result = await port.send({
        messageId: input.messageId,
        from: { schemaVersion: 1, peerId: input.fromPeerId },
        to: { schemaVersion: 1, peerId: input.toPeerId },
        threadId: input.threadId,
        body: input.body,
      });
      return { transportMessageId: result.transportMessageId, delivered: result.delivered };
    },
  });

  const peerWake = defineAction({
    name: "palimpsest.federation.wake",
    version: "1",
    description: "Request a peer's attention — attention only, never an ack or agreement",
    input: {
      jsonSchema: objectSchema(
        { wakeId: { type: "string" }, fromPeerId: { type: "string" }, toPeerId: { type: "string" } },
        ["wakeId", "fromPeerId", "toPeerId"],
      ) as Record<string, JsonValue>,
      parse: (input) => stringFields(input, ["wakeId", "fromPeerId", "toPeerId"]) as unknown as PeerWakeInput,
    },
    output: {
      jsonSchema: objectSchema({ signaled: { type: "boolean" } }, ["signaled"]) as Record<string, JsonValue>,
      parse: (input) => {
        if (
          typeof input !== "object" ||
          input === null ||
          typeof (input as Record<string, unknown>).signaled !== "boolean"
        ) {
          throw new TypeError("signaled must be a boolean");
        }
        return { signaled: (input as Record<string, unknown>).signaled as boolean };
      },
    },
    effect: effects.idempotent(),
    async execute(input) {
      if (port.wake === undefined) {
        throw new TypeError(`transport adapter "${port.adapterId}" does not support wake`);
      }
      const result = await port.wake({
        wakeId: input.wakeId,
        from: { schemaVersion: 1, peerId: input.fromPeerId },
        to: { schemaVersion: 1, peerId: input.toPeerId },
      });
      return { signaled: result.signaled };
    },
  });

  return { messageSend, peerWake };
}

export type FederationEffects = ReturnType<typeof defineFederationEffects>;
