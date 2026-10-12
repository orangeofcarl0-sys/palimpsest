/**
 * Trajectory-P2-C §7 — THE EXECUTION-ASSOCIATION PRODUCT COMPOSITION.
 *
 * One focused module that turns the P2-B domain into a NORMAL product capability. It owns the WIRING and
 * nothing else: the durable store, the trusted recorder, the source-verifying qualifier and the official
 * DSH reader are all the existing modules; this file decides which of them exist, in what order they are
 * created, and who closes them.
 *
 * WHY A SEPARATE MODULE (§7.8). `install.ts` is already ~530 lines and `install_contract.ts` is at its
 * size ceiling; the ruling asks for a small focused composition module rather than more wiring inside
 * those files. This module is the whole of the new wiring.
 *
 * OWNERSHIP (§7.5). The STORE is created here and is therefore `INSTALL_CREATED_AND_MANAGED`: the install
 * closes it through its lifecycle. The RECORDER and QUALIFIER are stateless wrappers over that store, so
 * they are created here and closed by the store's own lifetime — there is nothing to dispose. The READER
 * holds a mounted Cordis persistence fiber, so it exposes `close()` and is registered as an owned
 * resource by the caller. Nothing here closes a caller-supplied store.
 *
 * ABSENCE IS HONEST (§7.2). Every capability is present exactly when its real dependency exists:
 *
 *   · no `databasePath` (or `:memory:` is not requested) ⇒ still a store, because a path is derivable;
 *   · no repository/world ⇒ the WORK WORKER PORT is absent, so Work Delegation is not composed;
 *   · no DSH tree / no sessions root ⇒ the READER is absent, and the preview reports an unavailable source
 *     rather than an empty history.
 *
 * COMPOSING THIS DOES NOT EXECUTE ANYTHING. It starts no worker, claims no attempt, schedules nothing and
 * runs no model. Execution stays with the existing Work/Continuation authority.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import { dirname, join } from "node:path";

import {
  SqliteExecutionAssociationStore,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  makeTrustedSourceRegistry,
  type AssociationQualifier,
  type ExecutionAssociationRecorder,
  type ExecutionAssociationStore,
  type SourceKind,
  type TrustedSourceEpoch,
} from "../execution_association/index.js";
import type { DshSessionReadPort } from "../trajectory/execution.js";
import type { WorkRevalidationPort } from "../execution_association/index.js";
import type { OwnedResource } from "./lifecycle.js";

/** §7.6: the official reader module, loaded dynamically so a host without it still composes. */
const SESSION_READER_MODULE = "palimpsest-host-deployment/runtime/session_reader.js";

export interface ExecutionAssociationCompositionInput {
  readonly projectId: string;
  /** The deployment's durable root; the association store derives its own file beside it. */
  readonly databasePath: string | undefined;
  /** The DSH home, used to resolve the installed package root for the reader. */
  readonly dshHomePath: string | undefined;
  /** The DSH session root, when the deployment knows one. */
  readonly sessionsRoot: string | undefined;
  /** §7.1: the host's own account of the executable it configured, from its real launch facts. */
  readonly sourceBasis: { readonly adapterId: string; readonly workerBin: string; readonly nodeExecPath: string };
  /** §6.1: the deployment's own classification of that executable. */
  readonly sourceKind: SourceKind;
  /** §6.1: historical epochs, when the deployment has run more than one configuration. */
  readonly historicalEpochs?: readonly TrustedSourceEpoch[] | undefined;
  /**
   * §6.5: the Work revalidation port, supplied by the caller because the Work owner is composed in
   * `install.ts` (the same reuse boundary the continuation cluster uses).
   */
  readonly work: WorkRevalidationPort;
}

export interface ExecutionAssociationComposition {
  /** Absent when no durable path could be derived (a `:memory:` deployment keeps no association history). */
  readonly store?: ExecutionAssociationStore | undefined;
  readonly recorder?: ExecutionAssociationRecorder | undefined;
  readonly qualifier?: AssociationQualifier | undefined;
  /** §7.6: the official reader, or undefined when the DSH tree/sessions root is unavailable. */
  readonly sessionReader?: DshSessionReadPort | undefined;
  /** §7.5: resources this composition created and the install must close. */
  readonly ownedResources: readonly OwnedResource[];
}

/** §7.5: derive the association store path from the deployment's durable root, or undefined. */
export function deriveExecutionAssociationPath(databasePath: string | undefined): string | undefined {
  if (databasePath === undefined || databasePath.length === 0) return undefined;
  if (databasePath === ":memory:") return ":memory:";
  return join(dirname(databasePath), "execution-associations.sqlite");
}

/**
 * §7.1/§7.2: derive the Work Worker Port factory from the HOST's own launch facts.
 *
 * The host already knows its DSH executable and profile name (the same facts `deriveBranchHost` uses), so
 * the port is derived from those rather than from a model-supplied path or a fabricated capability. This
 * function does NOT construct a port itself — it returns the FACTORY, and only when the host supplied real
 * facts. An absent executable or profile means the port is absent, never a stub.
 *
 * `makePort` is injected so this module needs no static dependency on the deployment layer and a test can
 * supply the shipped `dshSubprocessWorkWorkerPort` without a cycle.
 */
export function deriveWorkWorkerPortFactory(input: {
  readonly dshBin: string | undefined;
  readonly profile: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly makePort: (config: { readonly dshBin: string; readonly profile: string; readonly timeoutMs?: number | undefined }) => (worldPath: string) => unknown;
}): ((worldPath: string) => unknown) | undefined {
  const dshBin = input.dshBin?.trim();
  const profile = input.profile?.trim();
  if (dshBin === undefined || dshBin.length === 0) return undefined;
  if (profile === undefined || profile.length === 0) return undefined;
  return input.makePort({ dshBin, profile, ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) });
}

/** §7.6: load the shipped official reader, or report absence. */
async function loadSessionReader(input: {
  readonly dshHomePath: string | undefined;
  readonly sessionsRoot: string | undefined;
}): Promise<DshSessionReadPort | undefined> {
  if (input.dshHomePath === undefined || input.sessionsRoot === undefined) return undefined;
  let module: { makeRealDshSessionReader: (i: { dshHomePath: string; sessionsRoot: string }) => Promise<DshSessionReadPort | null> };
  try {
    module = (await import(SESSION_READER_MODULE)) as typeof module;
  } catch {
    return undefined;
  }
  if (typeof module.makeRealDshSessionReader !== "function") return undefined;
  try {
    const reader = await module.makeRealDshSessionReader({ dshHomePath: input.dshHomePath, sessionsRoot: input.sessionsRoot });
    return reader ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * §7: compose the execution-association capability.
 *
 * SYNCHRONOUS on purpose: `installPalimpsest` is synchronous, and the reader's backend mount must not make
 * the whole install async. The reader is therefore composed as a LAZY handle: the Cordis persistence
 * backend is mounted on FIRST USE, so a deployment that never reads a session pays nothing, and the
 * capability's PRESENCE is still known synchronously.
 */
export function composeExecutionAssociationCapability(
  input: ExecutionAssociationCompositionInput,
): ExecutionAssociationComposition {
  const storePath = deriveExecutionAssociationPath(input.databasePath);
  const ownedResources: OwnedResource[] = [];

  /**
   * §7.6: the reader is a lazy handle. `hasReader` is decided synchronously from the deployment's own
   * facts (a DSH home and a sessions root), and the mount happens inside the first read.
   */
  const hasReader = input.dshHomePath !== undefined && input.dshHomePath.length > 0 && input.sessionsRoot !== undefined && input.sessionsRoot.length > 0;
  let readerPromise: Promise<DshSessionReadPort | undefined> | undefined;
  let mountedReader: DshSessionReadPort | undefined;
  const readerHandle: DshSessionReadPort | undefined = hasReader
    ? {
        sourceIdentity: "dsh-session-persistence-jsonl",
        evidenceClass: "REAL_DSH_QUERY",
        async readEvents(request) {
          const reader = await ensureReader();
          if (reader === undefined) {
            return Object.freeze({
              schemaVersion: 1, readState: "READ_CAPABILITY_ABSENT", sessionId: request.sessionId, header: null,
              sourceIdentity: "dsh-session-persistence-jsonl", sourceEvidenceClass: "REAL_DSH_QUERY",
              throughSeq: null, knownEventCount: null, inheritedEventCount: null,
              requestedFromSeq: request.fromSeq ?? 0, requestedMaxEvents: request.maxEvents ?? 0, returnedCount: 0,
              pageBounded: true, diskIoBounded: true,
              durabilityProvenance: "DURABILITY_UNRESOLVED", persistedEventCount: null, syntheticRecoveryEventCount: null,
              events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]), doesNotProve: Object.freeze([]),
              detail: "the official DSH reader could not be mounted from this deployment's DSH home",
            } as never);
          }
          return reader.readEvents(request);
        },
        async readHeaderIdentity(sessionId) {
          const reader = await ensureReader();
          if (reader === undefined) return { readState: "READ_CAPABILITY_ABSENT" as const, header: null, detail: "the official DSH reader could not be mounted" };
          return reader.readHeaderIdentity(sessionId);
        },
        async close() {
          const reader = mountedReader ?? (readerPromise === undefined ? undefined : await readerPromise);
          await reader?.close?.();
        },
      }
    : undefined;

  const ensureReader = async (): Promise<DshSessionReadPort | undefined> => {
    if (mountedReader !== undefined) return mountedReader;
    if (readerPromise === undefined) {
      readerPromise = loadSessionReader({ dshHomePath: input.dshHomePath, sessionsRoot: input.sessionsRoot });
    }
    mountedReader = await readerPromise;
    return mountedReader;
  };

  if (readerHandle !== undefined) {
    ownedResources.push({ what: "dshSessionReader", ownership: "INSTALL_CREATED_AND_MANAGED", close: () => { void readerHandle.close?.(); } });
  }

  /**
   * §7.2: no durable path means no durable association history. This is honest absence, not a stub: the
   * preview then reports NO_DURABLE_OBSERVATION rather than fabricating one.
   */
  if (storePath === undefined) {
    return Object.freeze({ ...(readerHandle === undefined ? {} : { sessionReader: readerHandle }), ownedResources: Object.freeze(ownedResources) });
  }

  const store = new SqliteExecutionAssociationStore(storePath);
  ownedResources.push({ what: "executionAssociationStore", ownership: "INSTALL_CREATED_AND_MANAGED", close: () => store.close() });

  /**
   * §6.1: the trusted registry is built from the DEPLOYMENT's own basis and kind — never from a record and
   * never from a handoff. Historical epochs are added so a legitimate upgrade does not invalidate history.
   */
  const basis = computeTrustedSourceBasis(input.sourceBasis);
  const registry = makeTrustedSourceRegistry({
    epochs: [
      ...(input.historicalEpochs ?? []),
      { epochId: `current-${basis.workerBinDigest.slice(0, 12)}`, sourceKind: input.sourceKind, sourceBasis: basis },
    ],
  });

  const recorder = createExecutionAssociationRecorder({ store, projectId: input.projectId, sourceBasis: basis, sourceKind: input.sourceKind });
  const qualifier = makeAssociationQualifier({
    store,
    work: input.work,
    dsh: {
      readHeaderIdentity: async (sessionId) => {
        if (readerHandle === undefined) {
          return { readState: "READ_CAPABILITY_ABSENT" as const, header: null, detail: "no DSH session reader is composed, so no header could be read" };
        }
        return readerHandle.readHeaderIdentity(sessionId);
      },
    },
    registry,
  });

  return Object.freeze({
    store,
    recorder,
    qualifier,
    ...(readerHandle === undefined ? {} : { sessionReader: readerHandle }),
    ownedResources: Object.freeze(ownedResources),
  });
}
