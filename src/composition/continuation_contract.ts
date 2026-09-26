/**
 * PLMP-LEAN-1 §D5-d — the RESULT CONTINUATION INSTALL CONTRACT.
 *
 * These two fields live in their own module for the same reason the delegation
 * contract does: `install_contract.ts` is at its §25 size ceiling, and the
 * honest response to a size gate is to move a cohesive contract out rather
 * than to compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies them as fields of
 * `InstallPalimpsestOptions` (see this module's `extends` clause there), so
 * this module adds no package export.
 */

import type { WorkWorkerRunPort } from "../interaction/work_delegation.js";
import type { ResultContinuationService } from "../continuation/service.js";

export interface ContinuationInstallOptions {
  /**
   * §D5-d (additive): the D2-d WORK worker port factory, bound to the execution
   * world a delegated attempt's prepare materializes. The first-party
   * implementation is `dshSubprocessWorkWorkerPort`. Supplying it is what
   * composes the WorkDelegationService — and with it, packaged rework reaching
   * a running attempt. Absent ⇒ the continuation service still inspects,
   * rematerializes, reopens and reconciles, and honestly reports
   * READY_FOR_DELEGATION (capability absent, never stubbed).
   */
  workWorkerPort?: ((worldPath: string) => WorkWorkerRunPort) | undefined;
}

export interface ContinuationInstallResult {
  /**
   * §D5-d (additive): the PACKAGED RESULT CONTINUATION AUTHORITY — present iff
   * a repository and a world-basis runtime are composed. It is a stateless
   * orchestrator over the EXISTING authorities
   * (D5-0/D3-a/D3-b/D3-c/D3-d/D5-a/D5-b2/G10-X/D2-d); it owns no store and
   * keeps no state. The caller chooses a route; the service derives every
   * authority-bearing fact.
   */
  readonly continuation?: ResultContinuationService | undefined;
}
