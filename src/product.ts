/**
 * PC1 S09 — the PRODUCT entry point.
 *
 * `installPalimpsest` is the framework/compatibility entry: it keeps the historical `expert` tool
 * catalogue so existing embeddings and tests do not change behaviour. `installProduct` is the
 * ordinary-user entry: it creates the deployment-local stores it owns, composes the derived project
 * workspace/journal, and advertises the small NORMAL tool path.
 *
 * It changes no authority. The same ProjectController, effects runtime, ProjectIR, Work and
 * Ordarium ledgers are the owners; this function only chooses a configuration.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { installPalimpsest, trustedDefaultPolicy, type PalimpsestInstallOptions, type InstalledPalimpsest } from "./install.js";
import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
} from "./project_workspace/index.js";
import type { ProjectStandard } from "./domain/standard.js";
import type { TaskPolicy } from "./domain/policy.js";
import type { ExecutionMode } from "./composition/install_contract.js";
import type { GitPort } from "./effects/index.js";
import type { DshPluginContext } from "./tools/dsh_types.js";
import { makeReviewService, SqliteReviewStore, type OperatorAuthorityPort, type ReviewService } from "./project_review/index.js";
import type { PromotionSourceIntakeAdmissionPort } from "./domain/promotion_eligibility.js";

export interface InstallProductOptions {
  readonly projectId: string;
  /** The canonical project repository (a real Git work tree). */
  readonly repository: string;
  /**
   * Where this deployment keeps its own state. Defaults to `<repository>/.palimpsest/state`.
   * The orchestration, Ordarium, journal and association databases live here.
   */
  readonly stateDir?: string | undefined;
  /** Defaults to `in-place`: ordinary project work happens in the project tree. */
  readonly execution?: ExecutionMode | undefined;
  /** The operator's confirmed completion standard, if one exists. */
  readonly standard?: ProjectStandard | undefined;
  readonly policy?: TaskPolicy | undefined;
  readonly clock?: (() => string) | undefined;
  /** Defaults to `normal`. `expert` is available for debugging/migration. */
  readonly toolProfile?: "normal" | "expert" | undefined;
  readonly git?: GitPort | undefined;
  /**
   * Host-verified operator identity for proposal decisions and Direct basis admission. Absent means
   * those mutations refuse; a proposal can still be created and previewed.
   */
  readonly operatorAuthority?: OperatorAuthorityPort | undefined;
  /** Existing ProjectIntent admission authority; passed to the intent service unchanged. */
  readonly projectIntentAdmission?: PalimpsestInstallOptions["projectIntentAdmission"];
  /** Advanced options passed through unchanged; the product entry owns no extra semantics. */
  readonly advanced?: Partial<PalimpsestInstallOptions> | undefined;
}

export interface InstalledProduct extends InstalledPalimpsest {
  readonly product: {
    readonly stateDir: string;
    readonly toolProfile: "normal" | "expert";
    readonly journalPath: string;
    readonly associationPath: string;
    readonly reviewPath: string;
  };
  /** PC1 S04: the non-authoritative proposal/review metadata service. */
  readonly review: ReviewService;
}

export function installProduct(context: DshPluginContext, options: InstallProductOptions): InstalledProduct {
  const stateDir = options.stateDir ?? join(options.repository, ".palimpsest", "state");
  mkdirSync(stateDir, { recursive: true });
  const journalPath = join(stateDir, "journal.sqlite");
  const associationPath = join(stateDir, "associations.sqlite");
  const toolProfile = options.toolProfile ?? "normal";
  const journal = new SqliteProjectJournalStore(journalPath);
  const associations = new SqliteProjectAssetAssociationStore(associationPath);
  /**
   * R6: the review owner is created AFTER the Work controller, so the admission port is a stable,
   * late-bound read. Before the binding it answers `null` (no intake requirement); after it, every
   * promotion assessment sees the exact approved-source binding.
   */
  let reviewRef: ReviewService | undefined;
  const sourceIntakeAdmission: PromotionSourceIntakeAdmissionPort = {
    read: (input) => reviewRef?.sourceIntakeAdmissionForAttempt(input) ?? null,
  };
  const installed = installPalimpsest(context, {
    ...(options.advanced ?? {}),
    operatorAuthority: options.operatorAuthority,
    projectId: options.projectId,
    repository: options.repository,
    databasePath: join(stateDir, "palimpsest.sqlite"),
    ordariumDatabasePath: join(stateDir, "ordarium.sqlite"),
    execution: options.execution ?? "in-place",
    toolProfile,
    ...(options.standard === undefined ? {} : { standard: options.standard }),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.git === undefined ? {} : { git: options.git }),
    ...(options.projectIntentAdmission === undefined ? {} : { projectIntentAdmission: options.projectIntentAdmission }),
    projectJournalStore: journal,
    projectAssociationStore: associations,
    sourceIntakeAdmission,
  });
  const reviewPath = join(stateDir, "review.sqlite");
  const reviewStore = new SqliteReviewStore(reviewPath);
  const review = makeReviewService({
    projectId: options.projectId,
    store: reviewStore,
    work: {
      project: () => installed.controller.work.project(),
      plan: (input) => installed.controller.plan(input),
    },
    ...(installed.intent === undefined ? {} : { intent: installed.intent }),
    repository: options.repository,
    ...(options.operatorAuthority === undefined ? {} : { operatorAuthority: options.operatorAuthority }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    /**
     * R5: the ONE verified adoption path. It reads the already-composed journal rather than creating
     * a second proposal store, and an approved ACTION is written back as a non-canonical note.
     */
    ...(installed.projectWorkspace === undefined
      ? {}
      : {
          journal: {
            entries: async () =>
              (await installed.projectWorkspace!.journal(options.projectId)).map(({ entry }) => ({
                entryId: entry.entryId,
                kind: entry.kind,
                title: entry.title,
                body: entry.body,
                provenance: entry.provenance,
                digest: entry.digest,
              })),
            recordApprovedAction: async (input: { title: string; body: string; provenance: string }) => {
              const entry = await installed.projectWorkspace!.recordJournalEntry({
                projectId: options.projectId,
                kind: "REFERENCE_NOTE",
                title: input.title,
                body: input.body,
                provenance: input.provenance,
              });
              return { entryId: entry.entryId, digest: entry.digest };
            },
          },
        }),
  });
  reviewRef = review;
  const dispose = installed.dispose;
  return {
    ...installed,
    review,
    product: {
      stateDir,
      toolProfile,
      journalPath,
      associationPath,
      reviewPath,
    },
    dispose: async () => {
      reviewStore.close();
      await dispose();
    },
  };
}

export { trustedDefaultPolicy };
