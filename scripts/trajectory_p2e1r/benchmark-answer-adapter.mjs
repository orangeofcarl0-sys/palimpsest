/**
 * Trajectory-P2-E1R §10 — THE BENCHMARK ANSWER ADAPTER (C5).
 *
 * WHAT THIS IS. A test-owned deterministic local `LlmAdapter` that emits a STRICTLY STRUCTURED BENCHMARK
 * ANSWER as the final visible assistant message of a real first-party DSH turn. The answer is then read back
 * from official DSH Session Persistence (`assistant/message`) and scored by the official source-aware oracle.
 *
 * WHY NOT THE WORKER RESULT TOOL (§10.2). `palimpsest_worker_result` has a STRICT canonical Work outcome
 * contract (kind/summary/reason/proposedAction). A benchmark answer is NOT a Work Settlement report, so this
 * adapter deliberately does NOT widen that tool. The experimental answer travels as ordinary assistant TEXT —
 * a surface DSH already persists and the product already reads — keeping decision data separate from Work.
 *
 * IT IS NOT A MODEL. `stream()` performs no I/O, opens no socket and reads no credential. It is unreachable in
 * production: no shipped profile mounts it.
 *
 * The adapter contract is the MEASURED dsh 0.2.0-rc.2 `LlmAdapter` shape (see the P2-E0 adapter's notes):
 * `providerInfo`, `listModels`, `resolveModel(provider, model, signal)`, `providerRetryPolicy(provider)`,
 * `prepareCall(provider, model, signal) -> { model, stream }`.
 *
 * PLAIN JAVASCRIPT. `scripts/**` runs under bare node.
 */

import { readFileSync } from "node:fs";

export const name = "p2e1r-benchmark-answer-llm";
export const inject = ["llm"];

export const BENCHMARK_PROVIDER = "palimpsest-local-benchmark";
export const BENCHMARK_MODEL = "benchmark-1";

/**
 * E1RD S5.4: THE TURN MUST ALSO CROSS THE WORKER'S OWN OUTCOME BOUNDARY.
 *
 * A real PTC worker does two things in a turn: it calls its result tool to report a non-authoritative outcome,
 * and it finishes with text. This adapter originally did only the second, so the worker process exited without
 * reporting and the port — correctly — reported `HOST_FAILURE`. The run still produced a persisted assistant
 * message, which is exactly how an oracle-only GO could be awarded for a host failure.
 *
 * The report below is the WORKER's own non-authoritative statement, never a settlement: `kind` is limited to
 * the two values the strict parser accepts and it grants no Work authority. It exists so the transport under
 * measurement is the transport production uses.
 */
const WORKER_REPORT = Object.freeze({ kind: "READY_FOR_SETTLEMENT", summary: "the deterministic benchmark turn emitted its answer" });

/** Does the request already contain a tool result (i.e. the worker has already reported)? */
function hasToolResult(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => message !== null && typeof message === "object" && message.role === "tool");
}

/**
 * The answer this adapter emits, injected through the profile config. It is the CANNED benchmark answer for
 * one arm — a stand-in for what a stochastic model would produce, never a measurement of model reasoning.
 */
function makeAnswerAdapter(answerText, resultToolName = null) {
  const providerInfo = (provider) => ({ id: provider ?? BENCHMARK_PROVIDER, name: "Palimpsest Benchmark Answer (test-owned)" });
  const listModels = async (provider) => [{ provider: provider ?? BENCHMARK_PROVIDER, id: BENCHMARK_MODEL, name: "benchmark-1" }];
  const resolveModel = async (provider, model) => ({ provider: provider ?? BENCHMARK_PROVIDER, id: model ?? BENCHMARK_MODEL, name: "benchmark-1" });
  const providerRetryPolicy = () => undefined;
  const prepareCall = async (provider, model) => ({ model: await resolveModel(provider, model), stream: (options) => stream(options) });

  /**
   * TURN 1 — report the worker's outcome through its OWN result tool. PTC mode makes `run_code` the only
   * directly callable name, so the call is a program that invokes the tool, exactly as a PTC-mode model must.
   *
   * TURN 2 — the FINAL visible assistant text IS the answer. It is emitted once and the turn concludes, so the
   * session's last `assistant/message` carries exactly this text.
   */
  async function* stream(options) {
    const messages = options?.messages ?? options?.request?.messages;
    if (resultToolName !== null && !hasToolResult(messages)) {
      const code = `return await tools[${JSON.stringify(resultToolName)}](${JSON.stringify(WORKER_REPORT)})`;
      const argsJson = JSON.stringify({ code, description: "Report the worker outcome through the result tool" });
      yield { type: "block-start", index: 0, blockType: "tool-call" };
      yield { type: "tool-call-delta", index: 0, id: "call-1", name: "run_code", argumentsDelta: argsJson };
      yield { type: "block-end", index: 0, block: { type: "tool-call", id: "call-1", name: "run_code", arguments: argsJson } };
      yield { type: "finish", reason: { kind: "tool-calls" } };
      return;
    }
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: answerText };
    yield { type: "block-end", index: 0, block: { type: "text", text: answerText } };
    yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: "finish", reason: { kind: "stop" } };
  }

  return { providerInfo, listModels, resolveModel, providerRetryPolicy, prepareCall, stream };
}

export function apply(ctx, config) {
  /**
   * §5.5: the answer is read from a FILE the harness wrote into its owned root. It is passed as a path rather
   * than inline JSON because an inlined flow mapping made the YAML patch parse the config as an object and the
   * entry failed to load. The path is a plain scalar, so the plugin always receives a string.
   */
  let answerText = '{"judgments":[],"proposedAction":"INSPECT_CURRENT_WORLD","confidence":"UNKNOWN"}';
  if (typeof config?.answerPath === "string" && config.answerPath.length > 0) {
    try {
      answerText = readFileSync(config.answerPath, "utf8").trim();
    } catch {
      /* a missing file leaves the vacuous default, which the oracle rejects — never a silent pass */
    }
  } else if (typeof config?.answerJson === "string" && config.answerJson.length > 0) {
    answerText = config.answerJson;
  }
  /**
   * A profile may mount this adapter outside a Work worker, where there is no result tool to call. The name is
   * supplied by the caller rather than hard-coded, so the adapter answers through the SAME tool the product
   * composed.
   */
  const resultToolName = typeof config?.resultToolName === "string" && config.resultToolName.length > 0 ? config.resultToolName : null;
  ctx.llm.registerAdapter([BENCHMARK_PROVIDER], makeAnswerAdapter(answerText, resultToolName));
}

export { makeAnswerAdapter };
