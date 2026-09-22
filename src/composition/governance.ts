/**
 * SR-1C §15 — the GOVERNANCE / PROJECT-MANAGEMENT composition cluster.
 *
 * Everything here was part of the `installPalimpsest` body: the deployment-local operating
 * posture stores, the project-head verification runtime (store, registry, installed service),
 * the external-asset bridge (store, effects, service) and the campaign monitor with its
 * delivery-mark store and the project-management service (work mode + activity).
 *
 * COMPOSITION ONLY. This module decides no policy of its own, performs no discovery, keeps no
 * global state and holds no string-keyed lookup. Its input is a NARROW record (§16): a `Pick` of
 * the public options plus the already-composed locals it consumes — never the options bag.
 *
 * ABSENCE SEMANTICS (§17), preserved exactly:
 *   no projectVerificationStore/Providers  → no verification face, and no derived history store
 *   no externalAssetProviders              → no bridge, no bridge history store, no effect actions
 *   no campaignMonitorScope/TickSource     → no monitor runtime
 *   no managementPreferenceStore           → the in-memory DIRECT control, never a stub store
 *   no operatingStorePath                  → a store derived beside the orchestration log
 */
import { dirname, join } from "node:path";
import { directManagementControl } from "../composition/optional.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import type { RecipeExecutionService } from "../recipes/execution.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type { ExternalAssetBridgeService, ExternalAssetProjectBasis } from "../external_assets/index.js";
import { SqliteExternalAssetBridgeStore, defineExternalAssetEffects, makeExternalAssetBridgeService, sqliteExternalAssetAssociationPort, sqliteExternalAssetJournalPort } from "../external_assets/index.js";
import type { ProjectManagementService } from "../project_management/index.js";
import { SqliteManagementActivityStore, SqliteWorkModePreferenceStore, withMonitorRuntimeCapability, linkedCampaignWakeEventSource } from "../project_operating/index.js";
import type { UserWorkModeControlPort, VerificationRuntimeCapabilityView } from "../project_operating/index.js";
import { SqliteMonitorDeliveryMarkStore, makeCampaignMonitorDriver, nullCampaignWakeActivation } from "../monitor/index.js";
import type { CampaignMonitorDriver, MonitorRuntimeCapability } from "../monitor/index.js";
import { gitAttemptResultMaterializer } from "../project_verification/attempt_result_source.js";
import { SqliteProjectVerificationStore, commandAttemptResultVerifier, commandProjectHeadVerifier, firstPartyAttemptResultVerificationSource, firstPartyProjectHeadVerificationSource, independenceSummary, makeProjectVerificationService, verifierRegistryFromPorts } from "../project_verification/index.js";
import type { ProjectVerifierPort, ProjectVerifierRegistry } from "../project_verification/index.js";
import { makeProjectManagementService } from "../project_management/index.js";
import type { EventStore } from "../state/index.js";
import type { ProjectController } from "../tools/controller.js";
import type { GitPort, PalimpsestEffectsRuntime } from "../effects/index.js";
import type { MonitorStartOutcome } from "../monitor/index.js";
import type { InstallPalimpsestOptions, InstalledCampaign, InstalledExternalAssets, InstalledVerification } from "./install_contract.js";

export type GovernanceCompositionOptions = Pick<
  InstallPalimpsestOptions,
  | "projectId"
  | "repository"
  | "clock"
  | "databasePath"
  | "operatingStorePath"
  | "operatingCapabilities"
  | "workModePreferenceStore"
  | "managementPreferenceStore"
  | "managementActivityStore"
  | "projectVerificationStore"
  | "projectVerificationDefaultVerifierRef"
  | "projectVerifierProviders"
  | "projectVerifierRegistry"
  | "externalAssetProviders"
  | "externalAssetBridgeStore"
  | "externalAssetPublicationAdmission"
  | "maxImportedTextBytes"
  | "projectAssociationStore"
  | "projectJournalStore"
  | "campaignStore"
  | "campaignClock"
  | "campaignMonitorActivation"
  | "campaignMonitorDeliveryMarks"
  | "campaignMonitorPolicy"
  | "campaignMonitorScope"
  | "campaignMonitorTickSource"
>;

/** The already-composed values this cluster consumes (all produced earlier in the install). */
export interface GovernanceCompositionInput {
  readonly options: GovernanceCompositionOptions;
  readonly store: EventStore;
  readonly controller: ProjectController;
  /** §B.14: the late-bound admission holder created by the core composition. */
  readonly verificationAdmission: {
    resolver: ((attemptId: string) => import("../domain/promotion_eligibility.js").PromotionVerificationAdmission | null) | null;
  };
  readonly effects: PalimpsestEffectsRuntime;
  readonly repository: string;
  readonly git: GitPort;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  readonly campaign: InstalledCampaign | undefined;
  readonly recipeRegistry: RecipeRegistry;
  readonly recipeExecution: RecipeExecutionService | undefined;
  readonly externalAssetsRef: { service: ExternalAssetBridgeService | undefined };
  readonly verificationWiring: { runtime: InstalledVerification | undefined };
  /** The install-local live verification probe (defined with the verification wiring). */
  readonly liveVerification: () => InstalledVerification | undefined;
}

/** What this cluster produced — including the two stores whose OWNERSHIP the install computed. */
export interface GovernanceComposition {
  readonly verification: InstalledVerification | undefined;
  readonly projectVerificationStore: SqliteProjectVerificationStore | undefined;
  readonly verificationStoreCreated: boolean;
  readonly externalAssets: InstalledExternalAssets | undefined;
  readonly externalAssetBridgeStore: SqliteExternalAssetBridgeStore | undefined;
  readonly externalAssetBridgeStoreCreated: boolean;
  readonly projectManagement: ProjectManagementService | undefined;
  readonly operatingStores:
    | { readonly workMode: UserWorkModeControlPort; readonly activity: SqliteManagementActivityStore }
    | undefined;
  readonly monitor: CampaignMonitorDriver | undefined;
  readonly monitorReady: Promise<MonitorStartOutcome> | undefined;
}
export function composeGovernanceCapabilities(input: GovernanceCompositionInput): GovernanceComposition {
  const { options, store, controller, effects, repository, git, projectWorkspace, campaign, recipeRegistry, recipeExecution } = input;
  const externalAssetsRef = input.externalAssetsRef;
  const verificationWiring = input.verificationWiring;
  const liveVerification = input.liveVerification;

  const derivedOperatingStorePath =
    options.operatingStorePath ??
    (options.databasePath === undefined || options.databasePath === ":memory:"
      ? ":memory:"
      : join(dirname(options.databasePath), "project_operating.sqlite"));
  const operatingStores:
    | { readonly workMode: UserWorkModeControlPort; readonly activity: SqliteManagementActivityStore }
    | undefined = (() => {
    if (projectWorkspace === undefined) return undefined;
    const derived = derivedOperatingStorePath;
    try {
      return {
        workMode: options.workModePreferenceStore ?? new SqliteWorkModePreferenceStore(derived),
        activity: options.managementActivityStore ?? new SqliteManagementActivityStore(derived),
      };
    } catch {
      // An unusable operating store must not take the whole runtime down: the
      // posture simply reports safe defaults and records no activity.
      return undefined;
    }
  })();

  // G10-AD §29: the independent Project Verification runtime, composed ADDITIVELY.
  //
  //  - the HISTORY store defaults to the SAME derived deployment-local path the G10-AB/AC
  //    operating stores use (a sibling table, never a second database truth); it is closed by
  //    `dispose()` only when this install created it;
  //  - the RUNTIME defaults to the first-party MECHANICAL `git diff --check` verifier over this
  //    deployment's repository - a real independent execution path (a bounded subprocess). An
  //    explicitly supplied port list is authoritative, and `[]` means "no verification runtime";
  //  - the REGISTRY is config: it defaults to exactly the executable ports, so a ref can never be
  //    registered without a runtime behind it;
  //  - `defaultVerifierRef` is only what a caller gets when it does not select a ref.
  //
  // G10-AD §15/§18/§19/§22/§23/§28 integration: the SAME runtime is handed to the operating posture
  // (VERIFY availability), recipe execution (`bind_verification`), bounded management
  // (`RUN_LOCAL_VERIFY`), the Advisor's independence fact and the application/HTTP/tool surface.
  //
  // A PRODUCT install - a derived workspace or a recipe execution binding - gets the first-party
  // runtime by default, so a normal deployment has a real VERIFY path. A BARE Work-only install
  // gets NO verification surface at all (never a stub), so its routes/tools are unchanged. It
  // grants no authority and can emit no Work/Proof/Reasoning record.
  const projectVerificationConfigured =
    options.projectVerificationStore !== undefined ||
    options.projectVerifierRegistry !== undefined ||
    options.projectVerifierProviders !== undefined ||
    options.projectVerificationDefaultVerifierRef !== undefined ||
    projectWorkspace !== undefined ||
    recipeExecution !== undefined;
  const verificationStoreCreated =
    projectVerificationConfigured && options.projectVerificationStore === undefined;
  let projectVerificationStore: SqliteProjectVerificationStore | undefined;
  if (projectVerificationConfigured) {
    try {
      projectVerificationStore =
        options.projectVerificationStore ??
        new SqliteProjectVerificationStore(derivedOperatingStorePath);
    } catch {
      // An unusable verification store must not take the whole runtime down: the
      // verification surface is simply absent (never a stub).
      projectVerificationStore = undefined;
    }
  }
  // PLMP-LEAN-1 §B.11/§B.12: the ATTEMPT_RESULT seams. All four of definition, provider, source and
  // materializer are required for attempt-result verification to be EXECUTABLE — a registered
  // definition is not a runtime, and a runtime with no way to materialize the result is not one
  // either. Absent a repository there is nothing to check out, so the seams are simply not composed.
  const attemptResultSeams =
    options.repository === undefined || options.repository === ""
      ? null
      : Object.freeze({
          source: firstPartyAttemptResultVerificationSource(controller),
          materializer: gitAttemptResultMaterializer({ repository: options.repository }),
        });
  const verificationProviders: readonly ProjectVerifierPort[] =
    options.projectVerifierProviders ??
    Object.freeze([
      commandProjectHeadVerifier({ command: "git", args: ["diff", "--check"] }),
      // A SEPARATE ref, never the head one widened (B.11).
      ...(attemptResultSeams === null ? [] : [commandAttemptResultVerifier()]),
    ]);
  const verificationRegistry: ProjectVerifierRegistry =
    options.projectVerifierRegistry ?? verifierRegistryFromPorts(verificationProviders);
  const executableVerifierDefinitions = verificationRegistry
    .list()
    .filter((definition) =>
      verificationProviders.some(
        (provider) => provider.definition.verifierRef === definition.verifierRef,
      ),
    );
  // The RESOLVED default, by the SAME rule the service uses (the explicit option,
  // else the first verifier that actually has a provider). Reporting the raw option
  // made this field null while an unqualified verifyCurrentHead used a real ref -
  // two answers to one question.
  const resolvedDefaultVerifierRef =
    options.projectVerificationDefaultVerifierRef ??
    executableVerifierDefinitions[0]?.verifierRef ??
    null;
  const verification: InstalledVerification | undefined =
    projectVerificationStore === undefined
      ? undefined
      : (() => {
          const store = projectVerificationStore;
          const repository = options.repository ?? null;
          const service = makeProjectVerificationService({
            projectId: options.projectId,
            source: firstPartyProjectHeadVerificationSource({ controller, git }),
            store,
            registry: verificationRegistry,
            providers: verificationProviders,
            ...(options.projectVerificationDefaultVerifierRef === undefined
              ? {}
              : { defaultVerifierRef: options.projectVerificationDefaultVerifierRef }),
            ...(repository === null ? {} : { repository }),
            ...(attemptResultSeams === null
              ? {}
              : {
                  attemptResultSource: attemptResultSeams.source,
                  attemptResultMaterializer: attemptResultSeams.materializer,
                }),
            ...(options.clock === undefined ? {} : { clock: options.clock }),
          });
          return {
            store,
            registry: verificationRegistry,
            service,
            defaultVerifierRef: resolvedDefaultVerifierRef,
            repository,
            status: () => service.status(),
            history: (limit?: number) => service.history(limit),
            verifyCurrentHead: (input) =>
              service.verifyCurrentHead({
                requestedBy: input?.requestedBy ?? "operator:install",
                reason: input?.reason ?? "explicit request through the installed verification runtime",
                ...(input?.verifierRef === undefined ? {} : { verifierRef: input.verifierRef }),
                ...(input?.signal === undefined ? {} : { signal: input.signal }),
              }),
            // §15/§16: the availability fact is derived from the REGISTERED definitions
            // that have a real execution binding - never from a bare bool/string.
            runtimeCapability: (): VerificationRuntimeCapabilityView => {
              const summary = independenceSummary(executableVerifierDefinitions);
              const runtimeAvailable = executableVerifierDefinitions.length > 0;
              const independentVerifierAvailable =
                runtimeAvailable && summary.independentVerifyAvailable;
              return Object.freeze({
                runtimeAvailable,
                independentVerifierAvailable,
                independentVerifierRefs: summary.independentRefs,
                defaultVerifierRef: resolvedDefaultVerifierRef,
                note: independentVerifierAvailable
                  ? `VERIFY is available from a real independent runtime (${summary.independentRefs.join(", ")})`
                  : runtimeAvailable
                    ? "a verification runtime exists but no registered verifier counts as independent; VERIFY is not available"
                    : "no verification runtime exists; the VERIFY preference is retained and reported honestly",
              });
            },
          };
        })();
  // Hand the LIVE runtime to whatever was composed before it (recipe execution, and
  // any later reader). This mirrors the monitor's `monitorWiring` hand-over.
  verificationWiring.runtime = verification;

  /*
   * G10-AE §7/§17/§21/§22: the EXTERNAL ASSET LIBRARY bridge, composed ADDITIVELY.
   *
   *  - it exists ONLY when the operator supplies a provider registry: with no registry there is
   *    no surface at all (never a stub) and a bare Work-only install composes nothing;
   *  - the bridge HISTORY store defaults to the SAME derived deployment-local path the G10-AB/AC/AD
   *    stores use (a sibling table, never a second database truth);
   *  - it writes through the EXISTING owners: the Project Workspace association store (pinned to
   *    `EXTERNAL_ASSET` and an exact digest) and the Project Journal store (the ONLY import target).
   *    Supplying neither leaves search/inspect/prepare usable and every commit fail-closed;
   *  - publication goes through the shared Ordarium effects runtime: the
   *    `palimpsest.external_asset.publish` Safe Action is DEFINED in `src/external_assets/effects.ts`
   *    and INVOKED here, so Web/tools/Workspace never call a provider write directly;
   *  - the project scope/basis is a READ of the canonical ProjectIR projection - no new truth.
   */
  let externalAssets: InstalledExternalAssets | undefined;
  let externalAssetBridgeStoreCreated = false;
  /** Set ONLY for a store this install created (a supplied one belongs to its caller). */
  let externalAssetBridgeStore: SqliteExternalAssetBridgeStore | undefined;
  if (options.externalAssetProviders !== undefined) {
    try {
      const bridgeStore =
        options.externalAssetBridgeStore ??
        new SqliteExternalAssetBridgeStore(derivedOperatingStorePath);
      externalAssetBridgeStoreCreated = options.externalAssetBridgeStore === undefined;
      if (externalAssetBridgeStoreCreated) externalAssetBridgeStore = bridgeStore;
      const externalRegistry = options.externalAssetProviders;
      const journalPort =
        options.projectJournalStore === undefined
          ? undefined
          : sqliteExternalAssetJournalPort(options.projectJournalStore);
      const associationPort =
        options.projectAssociationStore === undefined
          ? undefined
          : sqliteExternalAssetAssociationPort(options.projectAssociationStore, options.clock);
      const publicationEffects = defineExternalAssetEffects({
        publicationPort: (providerId) => externalRegistry.get(providerId)?.publication,
        // Fail closed with a clear reason when this install holds no journal owner.
        journal: journalPort ?? {
          read: async (projectId: string, entryId: string) => {
            throw new Error(
              `no project journal store is configured: journal entry "${entryId}" of project "${projectId}" cannot be read for publication`,
            );
          },
        },
      });
      const projectBasisOf = async (projectId: string): Promise<ExternalAssetProjectBasis | undefined> => {
        if (projectId !== controller.projectId) return undefined;
        const row = controller.store.connection
          .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
          .get(projectId) as { revision: unknown; digest: unknown } | undefined;
        if (row === undefined) return undefined;
        return Object.freeze({
          projectId,
          revision: Number(row.revision),
          digest: String(row.digest),
        });
      };
      const projectRevisionOf = async (projectId: string): Promise<number> =>
        (await projectBasisOf(projectId))?.revision ?? 0;
      const externalAssetService = makeExternalAssetBridgeService({
        registry: externalRegistry,
        bridge: bridgeStore,
        projectScope: { basis: projectBasisOf },
        ...(associationPort === undefined ? {} : { associations: associationPort }),
        ...(journalPort === undefined ? {} : { journal: journalPort }),
        ...(options.externalAssetPublicationAdmission === undefined
          ? {}
          : { publicationAdmission: options.externalAssetPublicationAdmission }),
        ...(options.maxImportedTextBytes === undefined
          ? {}
          : { maxImportedTextBytes: options.maxImportedTextBytes }),
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        invokeEffect: {
          invoke: async (input) =>
            effects.invoke(publicationEffects.publishExternalAsset, input, {
              scope: options.projectId,
              callId: `external-asset-publish:${input.publicationId}`,
              // The Ordarium authorization evidence is the project revision the publication was
              // prepared under; the load-bearing binding is the preview's `payloadDigest`.
              revision: await projectRevisionOf(controller.projectId),
            }),
        },
      });
      externalAssets = Object.freeze({
        ...externalAssetService,
        store: bridgeStore,
        registry: externalRegistry,
        service: externalAssetService,
      });
      // G10-AE §26: the derived workspace view now reads its external section from
      // THIS service (the plane's own read-only resolve).
      externalAssetsRef.service = externalAssetService;
    } catch {
      // An unusable bridge must not take the whole runtime down: the surface is simply
      // absent (never a stub) and no external library is consulted.
      externalAssets = undefined;
      externalAssetsRef.service = undefined;
      // A store this install created has no other owner: release it here. The previous
      // code dropped the flag instead, leaking the file handle it had just opened.
      if (externalAssetBridgeStoreCreated) externalAssetBridgeStore?.close();
      externalAssetBridgeStoreCreated = false;
    }
  }

  // §B.14: the TWO OWNERS MEET HERE, and only here. The controller answers "is it REQUIRED" (from the
  // attempt's derived completion contract); the verification service answers "is it SATISFIED for the
  // exact result". Neither decides the other's fact, neither is imported by the promotion domain, and
  // the resolver is bound exactly once.
  input.verificationAdmission.resolver = (attemptId: string) => {
    const contract = controller.completionContract(attemptId);
    if (contract === null || !contract.verification.required) return null;
    if (verification === undefined) {
      return {
        required: true,
        satisfied: false,
        subjectDigest: null,
        runRef: null,
        detail:
          "this deployment composes no attempt-result verification runtime, so the required verification cannot be satisfied",
      };
    }
    const qualification = verification.service.attemptResultQualification(attemptId);
    return {
      required: true,
      satisfied: qualification.satisfied,
      subjectDigest: qualification.subjectDigest,
      runRef: qualification.runRef,
      detail: qualification.detail,
    };
  };

  const monitorWiring: { capability: MonitorRuntimeCapability | undefined } = { capability: undefined };
  function liveMonitorCapability(): MonitorRuntimeCapability | undefined {
    return monitor?.capability() ?? monitorWiring.capability;
  }

  const projectManagementBase: ProjectManagementService | undefined =
    projectWorkspace === undefined
      ? undefined
      : makeProjectManagementService({
          workspace: projectWorkspace,
          control: options.managementPreferenceStore ?? directManagementControl(options.clock ?? (() => new Date().toISOString())),
          controller,
          ...(recipeExecution === undefined ? {} : { recipes: { registry: recipeRegistry, execution: recipeExecution } }),
          // G10-AD §16/§21: `capabilities.verify` is deliberately GONE (it was a bare
          // boolean and is now ignored). RUN_LOCAL_VERIFY availability and its typed
          // execution both come from the REAL verification runtime below.
          capabilities: { recipeExecution: recipeExecution !== undefined },
          // G10-AD §19/§21: the typed verification runtime. It makes RUN_LOCAL_VERIFY
          // available, lets the candidate builder derive a verification-due candidate,
          // and returns the durable `project_verification:<runId>` ref the activity
          // record references. Read lazily through the same wiring holder.
          verification: () => liveVerification()?.service,
          ...(operatingStores === undefined ? {} : { workMode: operatingStores.workMode, activity: operatingStores.activity }),
          registry: recipeRegistry,
          // G10-AC-R §13: the operating history REFERENCES canonical Campaign wake
          // events for the Campaigns this project actually links to - never a global
          // scan, never a copied Campaign payload, never an invented event. Without a
          // Campaign store the seam is absent and the history honestly reports zero
          // Campaign references.
          ...(options.campaignStore === undefined
            ? {}
            : {
                campaignWakeEvents: () =>
                  linkedCampaignWakeEventSource({ store: options.campaignStore! }).projectCampaignWakeEvents(
                    options.projectId,
                  ),
              }),
          projectBasis: () => {
            // A read of the canonical ProjectIR projection - the same source the
            // management service's own `readProject()` uses. No new truth.
            const row = controller.store.connection
              .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
              .get(controller.projectId) as
              | { revision: number; digest: string; head_commit: string }
              | undefined;
            if (row === undefined) return { revision: 0, digest: "", headCommit: "" };
            return {
              revision: Number(row.revision),
              digest: String(row.digest),
              headCommit: String(row.head_commit),
            };
          },
          operatingCapabilities: () => ({
            // G10-AC §34 / AC-R §5: MONITOR availability derives from REAL runtime
            // wiring, read LIVE (the monitor runtime is composed after this
            // service), not from a bare boolean. An embedder may still declare an
            // equivalent external implementation explicitly via
            // `monitorConditionSource`. `monitorRuntime` is kept for backward
            // compatibility, but a bare `true` is no longer an availability claim.
            ...(options.operatingCapabilities ?? {}),
            monitorRuntime: liveMonitorCapability() !== undefined,
            monitorRuntimeProvenance: "first_party" as const,
            monitorRuntimeCapability: liveMonitorCapability(),
            // G10-AD §15/§16: VERIFY availability derives from the REAL Project
            // Verification runtime, read LIVE. The capability VIEW takes precedence
            // over the deprecated `independentVerifier` bool in the ONE availability
            // table, so a caller's bare declaration can never inflate the row - and
            // when no runtime exists the view is simply absent (the declaration, if
            // any, is reported as CONDITIONAL at best).
            ...(liveVerification() === undefined
              ? {}
              : { verificationRuntimeCapability: liveVerification()!.runtimeCapability() }),
          }),
        });

  // G10-AC-R §5: `makeProjectManagementService` narrows the declared capability
  // inputs to a fixed set of fields, so the LIVE monitor capability cannot ride
  // through it. Wrap ONLY the derived read (`posture`) so the MONITOR row is
  // recomputed from the live driver capability at call time; every other
  // behaviour is the base service, unchanged.
  // HONEST: this wrapper is required because `src/project_management/service.ts`
  // (outside this fix's write scope) does not forward the new capability field.
  const projectManagement: ProjectManagementService | undefined =
    projectManagementBase === undefined
      ? undefined
      : {
          ...projectManagementBase,
          posture: async () =>
            withMonitorRuntimeCapability(await projectManagementBase.posture(), liveMonitorCapability()),
        };

  // G10-O: ONE composed application surface over the services actually wired above. Tools and
  // HTTP both go through this; neither imports a store. Advanced application tools are registered
  // ONLY when their surface exists (a bare Work install keeps exactly the nine Work tools).
  // G10-AC: the monitor runtime is composed ONLY when the operator explicitly
  // wires a scope, and it owns no canonical store. With no scope there is no
  // driver, MONITOR degrades to PREVIEW_ONLY/UNAVAILABLE, and NOTHING runs in the
  // background. A configured tick source is STARTED at the end of this function.
  //
  // G10-AC-R §6/§7: delivery marks suppress duplicates. When a first-party runtime
  // is composed (a tick source is supplied) and the host supplied neither a store
  // nor `false`, a DEFAULT deployment-local store is created at the SAME derived
  // operating-store path the AB stores use (or `:memory:`), so a normal runtime
  // does not re-deliver on every tick. `false` deliberately disables suppression.
  let monitorMarks: SqliteMonitorDeliveryMarkStore | undefined;
  let deliveryMarksSource: "default" | "supplied" | "disabled";
  if (options.campaignMonitorDeliveryMarks === false) {
    monitorMarks = undefined;
    deliveryMarksSource = "disabled";
  } else if (options.campaignMonitorDeliveryMarks !== undefined) {
    monitorMarks = options.campaignMonitorDeliveryMarks;
    deliveryMarksSource = "supplied";
  } else if (options.campaignMonitorTickSource !== undefined && campaign !== undefined && options.campaignMonitorScope !== undefined) {
    try {
      monitorMarks = new SqliteMonitorDeliveryMarkStore(derivedOperatingStorePath);
      deliveryMarksSource = "default";
    } catch {
      // An unusable mark store must not take the runtime down: suppression is
      // simply off and the status says so.
      monitorMarks = undefined;
      deliveryMarksSource = "disabled";
    }
  } else {
    monitorMarks = undefined;
    deliveryMarksSource = "disabled";
  }

  const monitor: CampaignMonitorDriver | undefined =
    campaign === undefined || options.campaignMonitorScope === undefined
      ? undefined
      : makeCampaignMonitorDriver({
          projectId: options.projectId,
          // The opt-in gate is read through the SAME operator store the rest of the
          // runtime uses. Without one the driver cannot prove an opt-in, so it
          // refuses to scan rather than assuming MONITOR.
          workMode: operatingStores?.workMode ?? {
            get: async () => {
              throw new Error("no Work Mode preference store is configured");
            },
            set: async () => {
              throw new Error("no Work Mode preference store is configured");
            },
            history: async () => [],
          },
          scope: options.campaignMonitorScope,
          prospective: {
            scanWatches: (campaignId) => campaign.prospective.scanWatches(campaignId),
            recordTriggers: (input) => campaign.prospective.recordTriggers(input),
            watchStates: (campaignId) => campaign.prospective.watchStates(campaignId),
          },
          production: {
            lifecycleState: (campaignId) => campaign.production.lifecycleState(campaignId),
            beginWake: (input) => campaign.production.beginWake(input),
            reconcileCurrentWorld: (input) => campaign.production.reconcileCurrentWorld(input),
          },
          history: {
            readEvents: (campaignId) => campaign.store.replay(campaignId),
          },
          activation: options.campaignMonitorActivation ?? nullCampaignWakeActivation(),
          ...(monitorMarks === undefined ? {} : { marks: monitorMarks }),
          deliveryMarksSource,
          ...(options.campaignMonitorPolicy === undefined
            ? {}
            : { policy: options.campaignMonitorPolicy }),
          ...(options.campaignMonitorTickSource === undefined
            ? {}
            : { tickSource: options.campaignMonitorTickSource }),
          ...(options.campaignClock === undefined ? {} : { clock: options.campaignClock }),
        });

  monitorWiring.capability = monitor?.capability();

  // G10-AC-R §8: INITIATE startup when a runtime is composed. `void monitor.start()`
  // is not enough - the promise is kept so a host can `await installed.monitor.ready()`
  // and so `dispose` can settle it. `ready()` never rejects (a failure becomes
  // `startState: "FAILED"` in the driver), so there is no unhandled rejection.

  const monitorReady = monitor === undefined ? undefined : monitor.ready();
  void monitorReady?.catch(() => {
    // Defensive only: `ready()` resolves even on a failed start.
  });

  return {
    verification,
    projectVerificationStore,
    verificationStoreCreated,
    externalAssets,
    externalAssetBridgeStore,
    externalAssetBridgeStoreCreated,
    projectManagement,
    operatingStores,
    monitor,
    monitorReady,
  };
}
