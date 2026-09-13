/**
 * G10-F4 institution store (§115–§124).
 *
 * ONE canonical Palimpsest-owned durable institution lineage store. It owns:
 *   institution identity, charter revisions, governance proposals/approvals,
 *   the epoch chain, and a current-head projection.
 * It does NOT own: OrganizationDefinition contents, Work, coordination
 * messages, PersistentPoint, or Ordarium effects (§115).
 *
 * Canonical truth is the APPEND-ONLY transition/epoch/charter history. The
 * mutable head row is a verified projection (§116): on read the head is
 * re-derived from the epoch chain and a mismatch fails closed.
 *
 * Epoch advancement is ONE atomic conditional transaction (§124): validate the
 * current head, the current charter, the approval threshold, register the
 * proposed charter revision if needed, append the transition, append the new
 * epoch, advance the head — or commit none.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type {
  InstitutionApproval,
  InstitutionCharter,
  InstitutionCharterRef,
  InstitutionEpoch,
  InstitutionEpochRef,
  InstitutionTransitionProposal,
} from "./artifacts.js";
import {
  institutionCharterRefOf,
  institutionCharterRefsEqual,
  institutionEpochRefOf,
  institutionEpochRefsEqual,
  materializeInstitutionEpoch,
  parseApproval,
  parseInstitutionCharter,
  parseInstitutionEpoch,
  parseTransitionProposal,
} from "./artifacts.js";

export type InstitutionStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_institution"
  | "unknown_transition"
  | "head_mismatch"
  | "stale_base_epoch"
  | "approval_threshold_not_met"
  | "charter_conflict"
  | "artifact_conflict"
  | "projection_mismatch"
  | "malformed_record";

export class InstitutionStoreError extends Error {
  constructor(
    readonly kind: InstitutionStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "InstitutionStoreError";
  }
}

export interface InstitutionStore {
  /** Register a charter revision (0 for genesis, else current+1). Immutable. */
  registerCharter(charter: InstitutionCharter): Promise<void>;
  /** Explicit genesis (§117): charter rev 0 + epoch 0 + initial organization. */
  genesis(input: { readonly charter: InstitutionCharter; readonly organization: InstitutionEpoch["organization"] }): Promise<InstitutionEpoch>;
  recordProposal(proposal: InstitutionTransitionProposal): Promise<void>;
  recordApproval(approval: InstitutionApproval): Promise<void>;
  /** Atomic epoch advancement (§124). */
  commitTransition(input: {
    readonly proposal: InstitutionTransitionProposal;
    readonly proposedCharter: InstitutionCharter;
    readonly expectedHeadEpoch: number;
  }): Promise<InstitutionEpoch>;
  head(institutionId: string): Promise<InstitutionEpochRef | undefined>;
  currentEpoch(institutionId: string): Promise<InstitutionEpoch | undefined>;
  epochs(institutionId: string): Promise<readonly InstitutionEpoch[]>;
  charter(ref: InstitutionCharterRef): Promise<InstitutionCharter | undefined>;
  currentCharter(institutionId: string): Promise<InstitutionCharter | undefined>;
  charters(institutionId: string): Promise<readonly InstitutionCharter[]>;
  proposal(transitionId: string): Promise<InstitutionTransitionProposal | undefined>;
  proposals(institutionId: string): Promise<readonly InstitutionTransitionProposal[]>;
  approvals(transitionId: string): Promise<readonly InstitutionApproval[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface ArtifactRow {
  artifact_json: string;
}

function malformed(what: string, error: unknown): InstitutionStoreError {
  return new InstitutionStoreError(
    "malformed_record",
    `institution store contains a malformed ${what} record: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export class SqliteInstitutionStore implements InstitutionStore {
  readonly #database: DatabaseSync;
  readonly #insertCharter: Statement;
  readonly #selectCharter: Statement;
  readonly #selectCharters: Statement;
  readonly #insertEpoch: Statement;
  readonly #selectEpoch: Statement;
  readonly #selectEpochs: Statement;
  readonly #insertTransition: Statement;
  readonly #selectTransition: Statement;
  readonly #selectTransitions: Statement;
  readonly #insertApproval: Statement;
  readonly #selectApprovals: Statement;
  readonly #selectApprovalOne: Statement;
  readonly #selectHead: Statement;
  readonly #upsertHead: Statement;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number }) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS institution_charters (" +
        "institution_id TEXT NOT NULL, revision INTEGER NOT NULL, artifact_json TEXT NOT NULL, " +
        "PRIMARY KEY (institution_id, revision));" +
        "CREATE TABLE IF NOT EXISTS institution_epochs (" +
        "institution_id TEXT NOT NULL, epoch INTEGER NOT NULL, artifact_json TEXT NOT NULL, " +
        "PRIMARY KEY (institution_id, epoch));" +
        "CREATE TABLE IF NOT EXISTS institution_transitions (" +
        "transition_id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS institution_approvals (" +
        "transition_id TEXT NOT NULL, peer_id TEXT NOT NULL, artifact_json TEXT NOT NULL, " +
        "PRIMARY KEY (transition_id, peer_id));" +
        "CREATE TABLE IF NOT EXISTS institution_heads (" +
        "institution_id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, digest TEXT NOT NULL)",
    );
    this.#insertCharter = this.#database.prepare(
      "INSERT INTO institution_charters (institution_id, revision, artifact_json) VALUES (?, ?, ?)",
    );
    this.#selectCharter = this.#database.prepare(
      "SELECT artifact_json FROM institution_charters WHERE institution_id = ? AND revision = ?",
    );
    this.#selectCharters = this.#database.prepare(
      "SELECT artifact_json FROM institution_charters WHERE institution_id = ? ORDER BY revision",
    );
    this.#insertEpoch = this.#database.prepare(
      "INSERT INTO institution_epochs (institution_id, epoch, artifact_json) VALUES (?, ?, ?)",
    );
    this.#selectEpoch = this.#database.prepare(
      "SELECT artifact_json FROM institution_epochs WHERE institution_id = ? AND epoch = ?",
    );
    this.#selectEpochs = this.#database.prepare(
      "SELECT artifact_json FROM institution_epochs WHERE institution_id = ? ORDER BY epoch",
    );
    this.#insertTransition = this.#database.prepare(
      "INSERT INTO institution_transitions (transition_id, institution_id, artifact_json) VALUES (?, ?, ?)",
    );
    this.#selectTransition = this.#database.prepare(
      "SELECT artifact_json FROM institution_transitions WHERE transition_id = ?",
    );
    this.#selectTransitions = this.#database.prepare(
      "SELECT artifact_json FROM institution_transitions WHERE institution_id = ? ORDER BY transition_id",
    );
    this.#insertApproval = this.#database.prepare(
      "INSERT INTO institution_approvals (transition_id, peer_id, artifact_json) VALUES (?, ?, ?)",
    );
    this.#selectApprovals = this.#database.prepare(
      "SELECT artifact_json FROM institution_approvals WHERE transition_id = ? ORDER BY peer_id",
    );
    this.#selectApprovalOne = this.#database.prepare(
      "SELECT artifact_json FROM institution_approvals WHERE transition_id = ? AND peer_id = ?",
    );
    this.#selectHead = this.#database.prepare("SELECT epoch, digest FROM institution_heads WHERE institution_id = ?");
    this.#upsertHead = this.#database.prepare(
      "INSERT INTO institution_heads (institution_id, epoch, digest) VALUES (?, ?, ?) " +
        "ON CONFLICT(institution_id) DO UPDATE SET epoch = excluded.epoch, digest = excluded.digest",
    );
  }

  /* ---- reads ---- */

  #charters(institutionId: string): InstitutionCharter[] {
    const rows = this.#selectCharters.all(institutionId) as unknown as ArtifactRow[];
    return rows.map((row) => {
      try {
        return parseInstitutionCharter(JSON.parse(row.artifact_json));
      } catch (error) {
        throw malformed("InstitutionCharter", error);
      }
    });
  }

  #epochs(institutionId: string): InstitutionEpoch[] {
    const rows = this.#selectEpochs.all(institutionId) as unknown as ArtifactRow[];
    return rows.map((row) => {
      try {
        return parseInstitutionEpoch(JSON.parse(row.artifact_json));
      } catch (error) {
        throw malformed("InstitutionEpoch", error);
      }
    });
  }

  /** Read + verify the head projection against the epoch chain (§116). */
  #verifiedHead(institutionId: string): InstitutionEpochRef | undefined {
    const epochList = this.#epochs(institutionId);
    const stored = this.#selectHead.get(institutionId) as { epoch: number; digest: string } | undefined;
    if (epochList.length === 0) {
      if (stored !== undefined) throw new InstitutionStoreError("projection_mismatch", "head projection exists with no epochs");
      return undefined;
    }
    const last = epochList[epochList.length - 1]!;
    if (stored === undefined || stored.epoch !== last.epoch || stored.digest !== last.digest) {
      throw new InstitutionStoreError("projection_mismatch", "institution head projection does not match the epoch chain");
    }
    return institutionEpochRefOf(last);
  }

  async head(institutionId: string): Promise<InstitutionEpochRef | undefined> {
    return this.#verifiedHead(institutionId);
  }

  async currentEpoch(institutionId: string): Promise<InstitutionEpoch | undefined> {
    const list = this.#epochs(institutionId);
    return list.length === 0 ? undefined : list[list.length - 1];
  }

  async epochs(institutionId: string): Promise<readonly InstitutionEpoch[]> {
    return Object.freeze(this.#epochs(institutionId));
  }

  async charter(ref: InstitutionCharterRef): Promise<InstitutionCharter | undefined> {
    const row = this.#selectCharter.get(ref.institutionId, ref.revision) as ArtifactRow | undefined;
    if (row === undefined) return undefined;
    try {
      return parseInstitutionCharter(JSON.parse(row.artifact_json));
    } catch (error) {
      throw malformed("InstitutionCharter", error);
    }
  }

  async currentCharter(institutionId: string): Promise<InstitutionCharter | undefined> {
    // The CURRENT charter is the one bound to the head epoch — NOT merely the
    // highest registered revision (a proposed amendment is not yet in force).
    const list = this.#epochs(institutionId);
    if (list.length === 0) return undefined;
    const headEpoch = list[list.length - 1]!;
    return this.charter(headEpoch.charter);
  }

  async charters(institutionId: string): Promise<readonly InstitutionCharter[]> {
    return Object.freeze(this.#charters(institutionId));
  }

  async proposal(transitionId: string): Promise<InstitutionTransitionProposal | undefined> {
    const row = this.#selectTransition.get(transitionId) as ArtifactRow | undefined;
    if (row === undefined) return undefined;
    try {
      return parseTransitionProposal(JSON.parse(row.artifact_json));
    } catch (error) {
      throw malformed("InstitutionTransitionProposal", error);
    }
  }

  async proposals(institutionId: string): Promise<readonly InstitutionTransitionProposal[]> {
    const rows = this.#selectTransitions.all(institutionId) as unknown as ArtifactRow[];
    return Object.freeze(
      rows.map((row) => {
        try {
          return parseTransitionProposal(JSON.parse(row.artifact_json));
        } catch (error) {
          throw malformed("InstitutionTransitionProposal", error);
        }
      }),
    );
  }

  async approvals(transitionId: string): Promise<readonly InstitutionApproval[]> {
    const rows = this.#selectApprovals.all(transitionId) as unknown as ArtifactRow[];
    return Object.freeze(
      rows.map((row) => {
        try {
          return parseApproval(JSON.parse(row.artifact_json));
        } catch (error) {
          throw malformed("InstitutionApproval", error);
        }
      }),
    );
  }

  /* ---- transactional writes ---- */

  #transactional<T>(work: () => T): T {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const result = work();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      if (error instanceof InstitutionStoreError) throw error;
      throw new InstitutionStoreError(
        "invalid_registration",
        `institution store write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  #insertCharterRow(charter: InstitutionCharter): void {
    const existing = this.#selectCharter.get(charter.institutionId, charter.revision) as ArtifactRow | undefined;
    const canonical = JSON.stringify(charter);
    if (existing !== undefined) {
      if (existing.artifact_json !== canonical) {
        throw new InstitutionStoreError("artifact_conflict", `charter ${charter.institutionId}@${charter.revision} already exists with different content`);
      }
      return;
    }
    const current = this.#charters(charter.institutionId);
    const expectedRevision = current.length === 0 ? 0 : current[current.length - 1]!.revision + 1;
    if (charter.revision !== expectedRevision) {
      throw new InstitutionStoreError(
        "charter_conflict",
        `charter revision ${charter.revision} is not the expected next revision ${expectedRevision}`,
      );
    }
    this.#insertCharter.run(charter.institutionId, charter.revision, canonical);
  }

  async registerCharter(charter: InstitutionCharter): Promise<void> {
    const canonical = parseInstitutionCharter(JSON.parse(JSON.stringify(charter)));
    this.#transactional(() => this.#insertCharterRow(canonical));
  }

  async genesis(input: { readonly charter: InstitutionCharter; readonly organization: InstitutionEpoch["organization"] }): Promise<InstitutionEpoch> {
    const charter = parseInstitutionCharter(JSON.parse(JSON.stringify(input.charter)));
    if (charter.revision !== 0) {
      throw new InstitutionStoreError("invalid_registration", "genesis charter must be revision 0");
    }
    return this.#transactional(() => {
      if (this.#selectCharter.get(charter.institutionId, 0) !== undefined || this.#epochs(charter.institutionId).length > 0) {
        throw new InstitutionStoreError("already_exists", `institution "${charter.institutionId}" already exists — genesis refused`);
      }
      this.#insertCharter.run(charter.institutionId, 0, JSON.stringify(charter));
      const epoch = materializeInstitutionEpoch({
        institutionId: charter.institutionId,
        epoch: 0,
        predecessor: null,
        charter: institutionCharterRefOf(charter),
        organization: input.organization,
        transition: "genesis",
      });
      this.#insertEpoch.run(epoch.institutionId, epoch.epoch, JSON.stringify(epoch));
      this.#upsertHead.run(epoch.institutionId, epoch.epoch, epoch.digest);
      return epoch;
    });
  }

  async recordProposal(proposal: InstitutionTransitionProposal): Promise<void> {
    const canonical = parseTransitionProposal(JSON.parse(JSON.stringify(proposal)));
    this.#transactional(() => {
      if (this.#epochs(canonical.institutionId).length === 0) {
        throw new InstitutionStoreError("unknown_institution", `institution "${canonical.institutionId}" does not exist`);
      }
      const existing = this.#selectTransition.get(canonical.transitionId) as ArtifactRow | undefined;
      const json = JSON.stringify(canonical);
      if (existing !== undefined) {
        if (existing.artifact_json !== json) {
          throw new InstitutionStoreError("artifact_conflict", `transition "${canonical.transitionId}" already exists with different content`);
        }
        return;
      }
      this.#insertTransition.run(canonical.transitionId, canonical.institutionId, json);
    });
  }

  async recordApproval(approval: InstitutionApproval): Promise<void> {
    const canonical = parseApproval(JSON.parse(JSON.stringify(approval)));
    this.#transactional(() => {
      const proposalRow = this.#selectTransition.get(canonical.transitionId) as ArtifactRow | undefined;
      if (proposalRow === undefined) {
        throw new InstitutionStoreError("unknown_transition", `transition "${canonical.transitionId}" was never proposed`);
      }
      const json = JSON.stringify(canonical);
      const existing = this.#selectApprovalOne.get(canonical.transitionId, canonical.approvingPeer.peerId) as ArtifactRow | undefined;
      if (existing !== undefined) {
        if (existing.artifact_json !== json) {
          throw new InstitutionStoreError("artifact_conflict", "conflicting duplicate approval");
        }
        return; // idempotent identical approval (§122)
      }
      this.#insertApproval.run(canonical.transitionId, canonical.approvingPeer.peerId, json);
    });
  }

  async commitTransition(input: {
    readonly proposal: InstitutionTransitionProposal;
    readonly proposedCharter: InstitutionCharter;
    readonly expectedHeadEpoch: number;
  }): Promise<InstitutionEpoch> {
    const proposal = parseTransitionProposal(JSON.parse(JSON.stringify(input.proposal)));
    const proposedCharter = parseInstitutionCharter(JSON.parse(JSON.stringify(input.proposedCharter)));
    return this.#transactional(() => {
      const institutionId = proposal.institutionId;
      // §116: canonical truth is the epoch chain; the projection must agree.
      const headRef = this.#verifiedHead(institutionId);
      if (headRef === undefined) {
        throw new InstitutionStoreError("unknown_institution", `institution "${institutionId}" does not exist`);
      }
      if (headRef.epoch !== input.expectedHeadEpoch) {
        throw new InstitutionStoreError("head_mismatch", `institution head is epoch ${headRef.epoch}, expected ${input.expectedHeadEpoch}`);
      }
      if (!institutionEpochRefsEqual(headRef, proposal.baseEpoch)) {
        // §123: an approval bound to an older base epoch cannot authorize.
        throw new InstitutionStoreError("stale_base_epoch", "proposal base epoch is not the current head (stale approval)");
      }
      const headEpoch = this.#selectEpoch.get(institutionId, headRef.epoch) as ArtifactRow | undefined;
      if (headEpoch === undefined) throw new InstitutionStoreError("projection_mismatch", "head epoch row missing");
      const current = parseInstitutionEpoch(JSON.parse(headEpoch.artifact_json));
      const currentCharterRow = this.#selectCharter.get(institutionId, current.charter.revision) as ArtifactRow | undefined;
      if (currentCharterRow === undefined) throw new InstitutionStoreError("charter_conflict", "current charter revision is missing");
      const currentCharter = parseInstitutionCharter(JSON.parse(currentCharterRow.artifact_json));

      // §125: charter change creates a NEW revision; never mutate the old one.
      if (proposedCharter.institutionId !== institutionId) {
        throw new InstitutionStoreError("charter_conflict", "proposed charter institution id mismatch");
      }
      if (proposedCharter.revision === currentCharter.revision) {
        if (proposedCharter.digest !== currentCharter.digest) {
          throw new InstitutionStoreError("charter_conflict", "charter revision unchanged but content differs");
        }
      } else {
        if (proposedCharter.revision !== currentCharter.revision + 1) {
          throw new InstitutionStoreError("charter_conflict", "charter revision must advance by exactly one");
        }
        // §111: this runs under the CURRENT charter's authority (below); the
        // new authority set cannot authorize itself into existence.
        this.#insertCharterRow(proposedCharter);
      }

      // §121: only CURRENT-charter authorities count; duplicates count once (§122).
      const approvalRows = this.#selectApprovals.all(proposal.transitionId) as unknown as ArtifactRow[];
      const authorityIds = new Set(currentCharter.continuationAuthority.authorities.map((authority) => authority.peerId));
      const uniqueApprovers = new Set(
        approvalRows
          .map((row) => parseApproval(JSON.parse(row.artifact_json)).approvingPeer.peerId)
          .filter((peerId) => authorityIds.has(peerId)),
      );
      if (uniqueApprovers.size < currentCharter.continuationAuthority.requiredApprovals) {
        throw new InstitutionStoreError(
          "approval_threshold_not_met",
          `transition "${proposal.transitionId}" has ${uniqueApprovers.size} valid approval(s), requires ${currentCharter.continuationAuthority.requiredApprovals}`,
        );
      }

      const next = materializeInstitutionEpoch({
        institutionId,
        epoch: current.epoch + 1,
        predecessor: headRef,
        charter: institutionCharterRefOf(proposedCharter),
        organization: proposal.proposedOrganization,
        transition: proposal.transitionId,
      });
      this.#insertEpoch.run(institutionId, next.epoch, JSON.stringify(next));
      this.#upsertHead.run(institutionId, next.epoch, next.digest);
      return next;
    });
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default institution store path (Palimpsest-owned). */
export function defaultInstitutionPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "institution.sqlite");
}

export { institutionCharterRefsEqual, institutionEpochRefsEqual };
