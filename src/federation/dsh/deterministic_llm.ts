/**
 * PAL-FED-0D deterministic model provider (EXPERIMENTAL, §30).
 *
 * A REAL DSH LlmAdapter registered through the official
 * `ctx.llm.registerAdapter` extension point, streaming a caller-supplied
 * deterministic script instead of calling a provider. It exists so machine
 * tests can drive authentic DSH agent turns — registry, session log, loop,
 * tool dispatch — without a network model. It is a test/dogfood host fixture,
 * not a production provider.
 */

import type { Context } from "@deepseek-ai/cordis";
import {
  LlmAdapter,
  ToolCallId,
  type ContentBlock,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type Message,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm";

import { FederationInputError } from "../errors.js";
import { strictReader } from "../strict.js";

export const name = "pal-fed-deterministic-llm";
export const inject = ["llm"];

export interface ScriptedToolCall {
  readonly name: string;
  /** Arguments object, serialized as the provider's raw JSON arguments. */
  readonly arguments: Record<string, unknown>;
}

export interface ScriptedStep {
  readonly text?: string;
  readonly toolCall?: ScriptedToolCall;
}

/**
 * Programmatic per-call step factory (test/host-only, never YAML): lets a
 * deterministic host react to real tool results, e.g. acknowledge the exact
 * batchId returned by collab_inbox.
 */
export type ScriptStepFn = (callIndex: number, messages: readonly Message[]) => ScriptedStep;

export interface DeterministicLlmConfig {
  readonly provider: string;
  readonly model: string;
  readonly script: readonly ScriptedStep[];
  readonly scriptFn?: ScriptStepFn | undefined;
}

const reader = strictReader((message) => new FederationInputError(message));

export function parseDeterministicLlmConfig(raw: unknown): DeterministicLlmConfig {
  const object = reader.asObject(raw, "deterministic-llm config");
  reader.exactKeys(object, ["provider", "model", "script", "scriptFn"], "deterministic-llm config");
  const provider = reader.asString(
    reader.required(object, "provider", "deterministic-llm config"),
    "deterministic-llm config.provider",
    1,
    128,
  );
  const model = reader.asString(
    reader.required(object, "model", "deterministic-llm config"),
    "deterministic-llm config.model",
    1,
    128,
  );
  const scriptRaw = reader.asArray(
    reader.required(object, "script", "deterministic-llm config"),
    "deterministic-llm config.script",
    1_000,
  );
  const script = scriptRaw.map((step, index) => {
    const stepObject = reader.asObject(step, `deterministic-llm config.script[${index}]`);
    reader.exactKeys(stepObject, ["text", "toolCall"], `deterministic-llm config.script[${index}]`);
    const text = reader.optionalString(
      stepObject,
      "text",
      `deterministic-llm config.script[${index}]`,
      0,
      8_192,
    );
    const toolCallRaw = reader.optional(stepObject, "toolCall");
    let toolCall: ScriptedToolCall | undefined;
    if (toolCallRaw !== undefined) {
      const call = reader.asObject(toolCallRaw, `deterministic-llm config.script[${index}].toolCall`);
      reader.exactKeys(call, ["name", "arguments"], `deterministic-llm config.script[${index}].toolCall`);
      toolCall = {
        name: reader.asString(
          reader.required(call, "name", `deterministic-llm config.script[${index}].toolCall`),
          `deterministic-llm config.script[${index}].toolCall.name`,
          1,
          128,
        ),
        arguments: reader.asObject(
          reader.required(call, "arguments", `deterministic-llm config.script[${index}].toolCall`),
          `deterministic-llm config.script[${index}].toolCall.arguments`,
        ) as Record<string, unknown>,
      };
    }
    return {
      ...(text === undefined ? {} : { text }),
      ...(toolCall === undefined ? {} : { toolCall }),
    };
  });
  const scriptFnRaw = reader.optional(object, "scriptFn");
  if (scriptFnRaw !== undefined && typeof scriptFnRaw !== "function") {
    throw new FederationInputError("deterministic-llm config.scriptFn: expected a function");
  }
  return {
    provider,
    model,
    script,
    ...(scriptFnRaw === undefined ? {} : { scriptFn: scriptFnRaw as ScriptStepFn }),
  };
}

/** Streams one scripted assistant step per model call, in order. */
class ScriptedLlmAdapter extends LlmAdapter {
  readonly #model: string;
  readonly #script: readonly ScriptedStep[];
  readonly #scriptFn: ScriptStepFn | undefined;
  #index = 0;

  constructor(model: string, script: readonly ScriptedStep[], scriptFn?: ScriptStepFn) {
    super();
    this.#model = model;
    this.#script = script;
    this.#scriptFn = scriptFn;
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: "PAL-FED deterministic model" };
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve([{ provider, id: this.#model, name: this.#model }]);
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      defaultMaxTokens: 4_096,
    });
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const callIndex = this.#index;
    this.#index += 1;
    const step =
      this.#scriptFn !== undefined
        ? this.#scriptFn(callIndex, options.messages)
        : this.#script[callIndex] ?? { text: "[deterministic script exhausted]" };
    if (step.toolCall !== undefined) {
      const id = ToolCallId(`scripted-call-${this.#index}`);
      const rawArguments = JSON.stringify(step.toolCall.arguments);
      const block: ContentBlock = {
        type: "tool-call",
        id,
        name: step.toolCall.name,
        arguments: rawArguments,
      };
      yield { type: "block-start", index: 0, blockType: "tool-call" };
      yield {
        type: "tool-call-delta",
        index: 0,
        id,
        name: step.toolCall.name,
        argumentsDelta: rawArguments,
      };
      yield { type: "block-end", index: 0, block };
      yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } };
      yield { type: "finish", reason: { kind: "tool-calls" } };
      return;
    }
    const text = step.text ?? "";
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text };
    yield { type: "block-end", index: 0, block: { type: "text", text } };
    yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

export function apply(ctx: Context, rawConfig: unknown): void {
  const config = parseDeterministicLlmConfig(rawConfig);
  ctx.effect(() => {
    const registration = ctx.llm.registerAdapter(
      [config.provider],
      new ScriptedLlmAdapter(config.model, config.script, config.scriptFn),
    );
    return () => registration();
  }, "pal-fed-deterministic-llm");
}
