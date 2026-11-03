/**
 * R3-L0C-R — the deterministic capital policy ports, re-exported from the frozen R3-L0C definition.
 *
 * The ports are part of the FROZEN experiment design (§12 forbids changing them), so this stage RE-EXPORTS the
 * source module rather than copying it. A copy would be a second definition that could drift, and the drift
 * would be invisible because each install composes its own.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
export { capitalPolicyPorts } from '../r3l0c/capital-ports.mjs';
