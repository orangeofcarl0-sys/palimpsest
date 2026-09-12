/**
 * Runtime semantic error contracts — the neutral location shared by the
 * carrier port, the Ordarium action surface, and the realization service
 * (G10-E0 D-MOD-01: keeps `effects/runtime_actions → runtime/errors ←
 * runtime/realize` acyclic).
 */

import type { DurableContinuityRef } from "../binding/contract.js";

/**
 * Thrown by host ports when a continuity locus became unavailable before the
 * effect (G10-D §66). The Ordarium action surface converts this into a typed
 * `realized:false` result — arbitrary thrown classes do not survive the
 * ledger boundary.
 */
export class ContinuityUnavailableError extends Error {
  constructor(
    readonly point: DurableContinuityRef,
    message?: string,
  ) {
    super(message ?? `continuity locus "${point}" is unavailable for realization`);
    this.name = "ContinuityUnavailableError";
  }
}
