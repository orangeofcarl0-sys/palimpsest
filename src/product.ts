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
  /** Advanced options passed through unchanged; the product entry owns no extra semantics. */
  readonly advanced?: Partial<PalimpsestInstallOptions> | undefined;
}

export interface InstalledProduct extends InstalledPalimpsest {
  readonly product: {
    readonly stateDir: string;
    readonly toolProfile: "normal" | "expert";
    readonly journalPath: string;
    readonly associationPath: string;
  };
}

export function installProduct(context: DshPluginContext, options: InstallProductOptions): InstalledProduct {
  const stateDir = options.stateDir ?? join(options.repository, ".palimpsest", "state");
  mkdirSync(stateDir, { recursive: true });
  const journalPath = join(stateDir, "journal.sqlite");
  const associationPath = join(stateDir, "associations.sqlite");
  const toolProfile = options.toolProfile ?? "normal";
  const journal = new SqliteProjectJournalStore(journalPath);
  const associations = new SqliteProjectAssetAssociationStore(associationPath);
  const installed = installPalimpsest(context, {
    ...(options.advanced ?? {}),
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
    projectJournalStore: journal,
    projectAssociationStore: associations,
  });
  return {
    ...installed,
    product: {
      stateDir,
      toolProfile,
      journalPath,
      associationPath,
    },
  };
}

export { trustedDefaultPolicy };
