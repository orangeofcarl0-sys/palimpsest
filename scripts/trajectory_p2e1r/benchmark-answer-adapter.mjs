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

export const name = "p2e1r-benchmark-answer-llm";
export const inject = ["llm"];

export const BENCHMARK_PROVIDER = "palimpsest-local-benchmark";
export const BENCHMARK_MODEL = "benchmark-1";

/**
 * The answer this adapter emits, injected through the profile config. It is the CANNED benchmark answer for
 * one arm — a stand-in for what a stochastic model would produce, never a measurement of model reasoning.
 */
function makeAnswerAdapter(answerText) {
  const providerInfo = (provider) => ({ id: provider ?? BENCHMARK_PROVIDER, name: "Palimpsest Benchmark Answer (test-owned)" });
  const listModels = async (provider) => [{ provider: provider ?? BENCHMARK_PROVIDER, id: BENCHMARK_MODEL, name: "benchmark-1" }];
  const resolveModel = async (provider, model) => ({ provider: provider ?? BENCHMARK_PROVIDER, id: model ?? BENCHMARK_MODEL, name: "benchmark-1" });
  const providerRetryPolicy = () => undefined;
  const prepareCall = async (provider, model) => ({ model: await resolveModel(provider, model), stream: (options) => stream(options) });

  /**
   * The FINAL visible assistant text IS the answer. It is emitted once and the turn concludes — the adapter
   * never loops, so the session's `assistant/message` carries exactly this text.
   */
  async function* stream() {
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: answerText };
    yield { type: "block-end", index: 0, block: { type: "text", text: answerText } };
    yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: "finish", reason: { kind: "stop" } };
  }

  return { providerInfo, listModels, resolveModel, providerRetryPolicy, prepareCall, stream };
}

export function apply(ctx, config) {
  const answerText = typeof config?.answerJson === "string" && config.answerJson.length > 0 ? config.answerJson : '{"judgments":[],"proposedAction":"INSPECT_CURRENT_WORLD","confidence":"UNKNOWN"}';
  ctx.llm.registerAdapter([BENCHMARK_PROVIDER], makeAnswerAdapter(answerText));
}

export { makeAnswerAdapter };
