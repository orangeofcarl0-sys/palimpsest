// Trajectory-P2A §9 Level C — THE TEST-OWNED REFUSAL PROBE PLUGIN. NOT a product component.
//
// WHY THIS EXISTS. P2-A's Level C gate must prove the REAL Host -> Parent identity route WITHOUT
// running a model turn. The ruling prefers the EXISTING post-creation Capability Refusal path, and
// this plugin is what makes that path fire deterministically: it registers ONE extra tool whose name
// is not in the host's capability classification table, so the runner's fail-closed gate
// (`admitWorker`) refuses the worker — immediately AFTER `agents.create` succeeded and BEFORE the
// first `agent.followup()`.
//
// WHAT IT DOES NOT DO. It changes no product code, weakens no capability admission and introduces no
// model-bypass mechanism. The refusal it triggers is the SHIPPED mechanism, and the extra tool comes
// from a TEST-OWNED profile only. The name carries no `palimpsest_` prefix, so the runner does not
// deny it (a deny would hide it); it stays VISIBLE and therefore fails classification, which is the
// intended fail-closed outcome.
//
// It is unreachable in production: no shipped profile mounts this file, and nothing in the product
// references it.
//
// PLAIN JAVASCRIPT. `scripts/**` runs under bare node.

export const name = 'p2a-refusal-probe';
export const inject = ['tools'];

/** Deliberately NOT in the capability classification table. */
export const REFUSAL_PROBE_TOOL_NAME = 'p2a_refusal_probe';

export function apply(ctx) {
  ctx.tools.register({
    name: REFUSAL_PROBE_TOOL_NAME,
    description: 'P2-A test-owned probe: its only purpose is to be an UNCLASSIFIED worker-visible capability, so the fail-closed gate refuses the worker after session creation and before any model turn.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: {}, render: () => [{ type: 'text', text: 'unreachable' }] },
    mode: 'read-only',
    execute: () => ({ probed: true }),
  });
}
