// Trajectory-P2-E0 §9 — THE TEST-OWNED DETERMINISTIC LOCAL LLM ADAPTER. NOT a product component.
//
// WHY THIS EXISTS. E0-C asks whether a SOURCE-QUALIFIED product Capsule reaches the ACTUAL first-party DSH
// `user/message`. That requires a real agent turn to run, which normally means a provider request. This
// adapter makes a turn run WITHOUT any external provider: it registers a local provider route and answers
// every stream call with a DETERMINISTIC response — one `palimpsest_worker_result` tool call, so the worker
// completes and the session records a real `user/message`.
//
// WHAT IT IS NOT. It is NOT a model, and it makes NO provider request: `stream()` performs no I/O, opens no
// socket and reads no credential. It is UNREACHABLE in production: no shipped profile mounts this file, and
// nothing in the product references it.
//
// PLAIN JAVASCRIPT. `scripts/**` runs under bare node.

export const name = 'p2e0-deterministic-llm';
export const inject = ['llm'];

/** The provider route and model id this adapter owns. */
export const DETERMINISTIC_PROVIDER = 'palimpsest-local-deterministic';
export const DETERMINISTIC_MODEL = 'deterministic-1';

/**
 * A minimal `LlmAdapter`-shaped object. The DSH runtime treats an adapter as a duck-typed object with
 * `providerInfo`, `listModels`, `resolveModel`, `prepareCall` and `stream`; `stream` is the only method that
 * must produce the response, and it does so from the request alone.
 */
function makeDeterministicAdapter(resultToolName) {
  const providerInfo = () => ({ id: DETERMINISTIC_PROVIDER, name: 'Palimpsest Deterministic (test-owned)' });
  const listModels = async () => [{ id: DETERMINISTIC_MODEL, name: 'deterministic-1', provider: DETERMINISTIC_PROVIDER }];
  const resolveModel = async () => ({ provider: DETERMINISTIC_PROVIDER, model: DETERMINISTIC_MODEL, contextWindow: 8192, maxOutputTokens: 1024, modalities: { input: ['text'], output: ['text'] } });
  /**
   * MEASURED DSH 0.2.0-rc.2 BEHAVIOUR (E0-C): adding an OPTIONAL adapter method named `providerRetryPolicy`
   * caused the cordis plugin to FAIL ACTIVATION ("1 entry did not activate"), so the agent never reached a
   * model turn and the session recorded no `user/message`. The base adapter already supplies a default retry
   * policy, so this adapter deliberately matches the shape the shipped P2-D2 gate proved activatable and
   * declares no retry policy of its own. This is a measured fact, not a guess: with the method present the
   * gate returns NOT_ESTABLISHED; with it absent the gate PASSes.
   */
  const prepareCall = async () => ({ modelInfo: await resolveModel(), stream: (options) => stream(options) });
  /**
   * THE ONE REQUIRED METHOD. Emits a text block plus a `palimpsest_worker_result` tool call, then finishes.
   * It reads `options.messages` only to prove it received the real request; it does NOT echo prompt content.
   */
  async function* stream() {
    const argsJson = JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'deterministic adapter completed the worker turn' });
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: 'deterministic adapter: reporting the one outcome' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'deterministic adapter: reporting the one outcome' } };
    yield { type: 'block-start', index: 1, blockType: 'tool-call' };
    yield { type: 'tool-call-delta', index: 1, id: 'call-1', name: resultToolName, argumentsDelta: argsJson };
    yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-1', name: resultToolName, arguments: argsJson } };
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
  return { providerInfo, listModels, resolveModel, prepareCall, stream };
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
