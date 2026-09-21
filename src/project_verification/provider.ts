/**
 * G10-AD §4/§7 — the verification READ seam and the host-neutral EXECUTION seam.
 *
 *   ProjectHeadVerificationSource ≠ a second head truth
 *   ProjectVerifierPort           ≠ project mutation
 *
 * §4: the v1 subject is materialized from the CANONICAL ProjectIR projection.
 * This module reads the same projection `src/project_management/service.ts`'s
 * `readProject()` reads (the `projects` row of the canonical EventStore), so no
 * second head truth is created — and the first-party implementation ALSO reads
 * the real repository head through the injected git port, which is the only way
 * §5's consistency check can be honest.
 *
 * §7: the port is the narrow execution seam. It returns a raw result; it can
 * never mutate the project, write Work, publish Proof or admit Reasoning, and it
 * carries no authority.
 */

import { parseProjectIr, type ProjectIr } from "../schema/models.js";
import {
  ProjectVerificationError,
  materializeProjectHeadVerificationSubject,
  type ProjectHeadVerificationSubject,
  type ProjectVerificationSubject,
  type ProjectVerifierRawResult,
  type VerifierDefinition,
} from "./artifacts.js";

/* -------------------------------------------------------------------------- *
 * §4 ProjectHeadVerificationSource
 * -------------------------------------------------------------------------- */

export interface ProjectHeadVerificationSource {
  /** The EXACT current project head. Never a caller-chosen revision/commit. */
  current(): ProjectHeadVerificationSubject;
  /**
   * §5: the ACTUAL repository head, when this deployment has a repository. The
   * first-party implementation reads it from the injected git port. Absent ⇒ the
   * consistency rule cannot be enforced and says so.
   */
  repositoryHead?(): Promise<string | null>;
}

/* -------------------------------------------------------------------------- *
 * §7 ProjectVerifierPort
 * -------------------------------------------------------------------------- */

export interface ProjectVerifierVerifyInput {
  /**
   * The subject to verify — either kind. A provider that understands only one must refuse the other
   * rather than guess, and `supportedSubjects` is how a deployment says which it can serve.
   */
  readonly subject: ProjectVerificationSubject;
  /** The repository/workspace the protocol runs against, when one applies. */
  readonly repository?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface ProjectVerifierPort {
  readonly definition: VerifierDefinition;
  verify(input: ProjectVerifierVerifyInput): Promise<ProjectVerifierRawResult>;
}

/* -------------------------------------------------------------------------- *
 * The first-party source over the canonical ProjectIR projection
 * -------------------------------------------------------------------------- */

/**
 * The minimal STRUCTURAL view of the canonical ProjectIR projection owner. The
 * real `ProjectController` satisfies it (an `EventStore` whose `connection` is a
 * `node:sqlite` database), which is exactly the read
 * `src/project_management/service.ts` performs. Typed structurally so this plane
 * does not import the Work tool/controller modules (§25).
 */
export interface ProjectIrProjectionStore {
  readonly connection: {
    prepare(sql: string): { get(...params: unknown[]): unknown };
  };
}

export interface ProjectIrProjectionOwner {
  readonly projectId: string;
  readonly store: ProjectIrProjectionStore;
}

/** The minimal git read this plane needs — never the whole effects GitPort. */
export interface VerificationGitHeadPort {
  head(): Promise<string>;
}

function decodeJsonBlob(value: unknown): unknown {
  if (typeof value === "string") return JSON.parse(value);
  if (value instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(value));
  throw new ProjectVerificationError("malformed_artifact", "the ProjectIR row is not a readable JSON blob");
}

/** Read the canonical ProjectIR projection (read-only; the controller owns it). */
export function readCanonicalProjectIr(owner: ProjectIrProjectionOwner): ProjectIr {
  const row = owner.store.connection
    .prepare("SELECT state_json FROM projects WHERE project_id=?")
    .get(owner.projectId) as { state_json: unknown } | undefined;
  if (row === undefined) {
    throw new ProjectVerificationError(
      "malformed_artifact",
      `project "${owner.projectId}" has no ProjectIR; there is no current project head to verify`,
    );
  }
  try {
    return parseProjectIr(decodeJsonBlob(row.state_json));
  } catch (error) {
    throw new ProjectVerificationError(
      "malformed_artifact",
      `project "${owner.projectId}" ProjectIR is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The first-party §4/§5 source: the subject is derived from the canonical
 * ProjectIR projection, and the ACTUAL git head is read from the injected git
 * port so §5's consistency rule is enforceable.
 */
export function firstPartyProjectHeadVerificationSource(input: {
  readonly controller: ProjectIrProjectionOwner;
  readonly git?: VerificationGitHeadPort | undefined;
}): ProjectHeadVerificationSource {
  const git = input.git;
  return Object.freeze({
    current(): ProjectHeadVerificationSubject {
      const project = readCanonicalProjectIr(input.controller);
      return materializeProjectHeadVerificationSubject({
        projectId: project.project_id,
        projectRevision: project.revision,
        projectDigest: project.digest,
        headCommit: project.head_commit,
      });
    },
    async repositoryHead(): Promise<string | null> {
      if (git === undefined) return null;
      try {
        return await git.head();
      } catch {
        // An unreadable repository is not a head: report "cannot establish"
        // rather than inventing one (§5 must never compare against ambient git).
        return null;
      }
    },
  });
}

/**
 * A source over an explicit materialization read seam, for hosts that already
 * hold the ProjectIR projection (e.g. a Worker-side read model). It is NOT a way
 * to verify an arbitrary commit: the caller supplies the CANONICAL current head.
 */
export function sourceFromProjectHeadReader(input: {
  readonly readCurrentHead: () => {
    readonly projectId: string;
    readonly revision: number;
    readonly digest: string;
    readonly headCommit: string;
  };
  readonly readRepositoryHead?: (() => Promise<string | null>) | undefined;
}): ProjectHeadVerificationSource {
  return Object.freeze({
    current: () =>
      materializeProjectHeadVerificationSubject({
        projectId: input.readCurrentHead().projectId,
        projectRevision: input.readCurrentHead().revision,
        projectDigest: input.readCurrentHead().digest,
        headCommit: input.readCurrentHead().headCommit,
      }),
    ...(input.readRepositoryHead === undefined ? {} : { repositoryHead: input.readRepositoryHead }),
  });
}
