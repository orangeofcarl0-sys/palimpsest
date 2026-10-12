/**
 * Trajectory-P2-C §7.7 — THE EXECUTION-ASSOCIATION INSTALL CONTRACT.
 *
 * These fields live in their own module for the same reason the other extracted contracts do:
 * `install_contract.ts` is at its size ceiling, and the honest response to a size gate is to move a
 * cohesive contract out rather than compress the prose that explains it.
 *
 * They are NOT separately re-exported: a host supplies them as fields of `InstallPalimpsestOptions`
 * (via this module's `extends` clause there), so this module adds no package export name.
 */
import type { AttributedPreviewService } from "../composition/attributed_preview.js";
import type { SourceKind } from "../execution_association/index.js";

export interface ExecutionAssociationInstallOptions {
  /**
   * §7.1/§7.2: the HOST's own account of the executable it configured for work workers. Supplying these
   * is what lets the install derive a real Work Worker Port; omitting them leaves the port absent (never
   * a stub), so Work Delegation is not composed and no worker can start.
   *
   * They are the same facts the host already uses for its branch port (`process.argv[1]` + `--profile`),
   * so a first-party host derives them rather than inventing a path.
   */
  readonly workWorkerBin?: string | undefined;
  readonly workWorkerProfile?: string | undefined;
  /** §7.2: a bounded worker wall clock; absent uses the port's own default. */
  readonly workWorkerTimeoutMs?: number | undefined;
  /**
   * §6.1: how the deployment classifies the executable it configured. Defaults to `FIRST_PARTY_DSH_HOST`
   * only when a real DSH bin was supplied; a test that drives a stub passes `CONTROLLED_STUB`.
   */
  readonly executionAssociationSourceKind?: SourceKind | undefined;
  /** §7.6: the DSH home and session root, when the deployment knows them, so the reader can be composed. */
  readonly dshHomePath?: string | undefined;
  readonly dshSessionsRoot?: string | undefined;
  /**
   * §7.5: an explicitly CALLER-OWNED association store. When supplied, the install uses it and does NOT
   * close it (the caller keeps its lifetime); when omitted, the install creates one beside the
   * orchestration store and closes it itself.
   */
  readonly executionAssociationStore?: import("../execution_association/index.js").ExecutionAssociationStore | undefined;
}

export interface ExecutionAssociationInstallResult {
  /**
   * §7.7: the read-only, Attempt-scoped attributed Preview surface. Present iff a durable association
   * store AND a qualifier were composed. It is INSPECTION DATA: it starts nothing and settles nothing.
   */
  readonly trajectory?: {
    readonly attributedPreview: AttributedPreviewService;
  } | undefined;
  /** §7.3: the trusted recorder, present when the store is. The host wires it to `onCorrelatedSessionIdentity`. */
  readonly executionAssociationRecorder?: import("../execution_association/index.js").ExecutionAssociationRecorder | undefined;
  /** §7.5: the qualifier, present when the store and a Work read are. */
  readonly executionAssociationQualifier?: import("../execution_association/index.js").AssociationQualifier | undefined;
}
