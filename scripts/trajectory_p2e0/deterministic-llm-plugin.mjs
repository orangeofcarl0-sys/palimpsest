// Trajectory-P2-E0 §9 / Trajectory-P2-E1 §12 — THE TEST-OWNED DETERMINISTIC LOCAL LLM ADAPTER.
//
// WHY THIS EXISTS. E0-C asks whether a SOURCE-QUALIFIED product Capsule reaches the ACTUAL first-party DSH
// `user/message`. That requires a real agent turn to run, which normally means a provider request. This
// adapter makes a turn run WITHOUT any external provider: it registers a local provider route and answers
// every stream call DETERMINISTICALLY from the request alone.
//
// WHAT IT IS NOT. It is NOT a model, and it makes NO provider request: `stream()` performs no I/O, opens no
// socket and reads no credential. It is UNREACHABLE in production: no shipped profile mounts this file, and
// nothing in the product references it.
//
// P2-E1 §12.2 CORRECTION — THE MEASURED `LlmAdapter` CONTRACT AND TURN SHAPE (dsh 0.2.0-rc.2).
//
// P2-E0 shipped this adapter with the shape `{ providerInfo, listModels, resolveModel, prepareCall, stream }`
// and recorded that the turn produced no outcome, blaming an "optional `providerRetryPolicy`". P2-E1 measured
// the REAL contract from the shipped runtime and found THREE defects, none of which was the recorded cause:
//
//   1. `providerRetryPolicy` IS REQUIRED. `LlmRuntime.prepareRoutes()` calls `adapter.providerRetryPolicy(
//      provider)` UNCONDITIONALLY, so omitting the method throws
//      `TypeError: adapter.providerRetryPolicy is not a function` and the cordis entry FAILS TO ACTIVATE.
//      (Measured directly: the worker stderr showed that TypeError and "1 entry did not activate".)
//   2. The method SIGNATURES and RETURN SHAPES were wrong. The runtime calls
//      `adapter.resolveModel(provider, model, signal)` and validates the result as `{provider, id, name}`
//      (`normalizeModelInfo`), and `prepareCall(provider, model, signal)` must resolve to `{ model, stream }`
//      whose `model` is that SAME `{provider, id, name}`. The E0 adapter took no arguments and returned a
//      `{model, contextWindow, modalities}` shape under the key `modelInfo`, so `adapterCall.model` was
//      `undefined` and the turn never dispatched a stream.
//   3. THE TOOL CALL WAS REFUSED. With 1 and 2 fixed the turn ran and called `palimpsest_worker_result`
//      DIRECTLY, but the worker scope presents PTC (`presentAs('ptc')`), so the registry answered
//      `unknown tool "palimpsest_worker_result": only run_code is callable directly` (measured in the
//      persisted session's `tool/result`). In PTC mode a tool is invoked INSIDE a `run_code` program as
//      `await tools.<name>(args)`. The adapter now emits ONE `run_code` call whose program invokes the
//      result tool, which is what a PTC-mode model must do.
//   4. THE TURN NEVER CONCLUDED. Before 3 the adapter emitted the result tool call on EVERY stream, so the
//      agent looped forever (measured: the instrumented trace showed `stream invoked` repeating without
//      bound until the wall clock killed it). A real model calls the result tool ONCE and then finishes the
//      turn with text. This adapter does the same: once a tool result is present it emits a final text
//      answer instead of another call.
//
// All four are corrected below against the runtime's own validation and the persisted session's own
// `tool/result`, and this file is the ONE adapter the E1 gates use.
//
// PLAIN JAVASCRIPT. `scripts/**` runs under bare node.

export const name = 'p2e0-deterministic-llm';
export const inject = ['llm'];

/** The provider route and model id this adapter owns. */
export const DETERMINISTIC_PROVIDER = 'palimpsest-local-deterministic';
export const DETERMINISTIC_MODEL = 'deterministic-1';

/** Does the request already contain a tool result (i.e. the agent has already called the result tool)? */
function hasToolResult(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => message !== null && typeof message === 'object' && message.role === 'tool');
}

/**
 * A minimal adapter matching the MEASURED `LlmAdapter` contract of dsh 0.2.0-rc.2.
 *
 * Every method takes the arguments the runtime passes and returns the shape its own validators accept:
 *   providerInfo(provider)                 -> { id, name }                       (id must equal the route)
 *   listModels(provider)                   -> [{ provider, id, name }]
 *   resolveModel(provider, model, signal)  -> { provider, id, name }             (id must equal `model`)
 *   providerRetryPolicy(provider)          -> undefined  (the runtime supplies its own default)
 *   prepareCall(provider, model, signal)   -> { model: {provider,id,name}, stream }
 */
function makeDeterministicAdapter(resultToolName) {
  const providerInfo = (provider) => ({ id: provider ?? DETERMINISTIC_PROVIDER, name: 'Palimpsest Deterministic (test-owned)' });
  const listModels = async (provider) => [{ provider: provider ?? DETERMINISTIC_PROVIDER, id: DETERMINISTIC_MODEL, name: 'deterministic-1' }];
  const resolveModel = async (provider, model) => ({ provider: provider ?? DETERMINISTIC_PROVIDER, id: model ?? DETERMINISTIC_MODEL, name: 'deterministic-1' });
  /** §12.2: REQUIRED by `prepareRoutes`. Returning `undefined` lets the runtime apply its own default. */
  const providerRetryPolicy = () => undefined;
  const prepareCall = async (provider, model) => ({ model: await resolveModel(provider, model), stream: (options) => stream(options) });
  /**
   * THE ONE REQUIRED METHOD. Deterministic from the request alone:
   *   · first turn  -> ONE `run_code` call whose program invokes the worker result tool (PTC mode: only
   *                    `run_code` is directly callable, so a direct tool call would be refused);
   *   · after that  -> a plain final text answer, so the turn CONCLUDES instead of looping.
   */
  async function* stream(options) {
    const alreadyReported = hasToolResult(options?.messages);
    if (alreadyReported) {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text: 'deterministic adapter: the worker outcome has been reported' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'deterministic adapter: the worker outcome has been reported' } };
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
      return;
    }
    const resultArgs = JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'deterministic adapter completed the worker turn' });
    /** The PTC program: call the worker's own result tool with the ONE outcome, then return its value. */
    const code = `return await tools[${JSON.stringify(resultToolName)}](${resultArgs})`;
    const argsJson = JSON.stringify({ code, description: 'Report the worker outcome through the result tool' });
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: 'deterministic adapter: reporting the one outcome' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'deterministic adapter: reporting the one outcome' } };
    yield { type: 'block-start', index: 1, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'run_code', argumentsDelta: argsJson };
    yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-1', name: 'run_code', arguments: argsJson } };
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
  return { providerInfo, listModels, resolveModel, providerRetryPolicy, prepareCall, stream };
}

/**
 * Mount the adapter. The result tool name is read from the COMPOSED worker environment (the payload the
 * parent sent), never hard-coded, so the adapter answers through the SAME tool the product defined.
 */
export function apply(ctx, config) {
  const resultToolName = typeof config?.resultToolName === 'string' && config.resultToolName.length > 0 ? config.resultToolName : 'palimpsest_worker_result';
  ctx.llm.registerAdapter([DETERMINISTIC_PROVIDER], makeDeterministicAdapter(resultToolName));
}

export { makeDeterministicAdapter };
