/**
 * SR-1C §15 — the ORGANIZATION composition cluster.
 *
 * The organization/institution stores and services, the runtime-scope service and its Holon
 * projection, organization dynamics and both evolution planes (organization and runtime), plus
 * the reasoning-cell installation they consume.
 *
 * COMPOSITION ONLY: no policy of its own, no discovery, no registry, no string-keyed lookup.
 * Input is a `Pick` of the public options this cluster reads plus the already-composed locals it
 * consumes (§16) — never the options bag.
 *
 * ABSENCE SEMANTICS (§17), preserved exactly:
 *   no organizationStore            → no organization surface, no dynamics, no evolution
 *   no organizationStore+institutionStore → no institution service
 *   no runtimeScopeStore            → no runtime scopes and no Holon projection
 *   no reasoningCellStore/policies  → no reasoning-cell surface (never a stub)
 */
import { randomUUID } from "node:crypto";
import { campaignActivityPort, coordinationObservationPort } from "../composition/optional.js";
import { makeInstitutionService } from "../institution/index.js";
import type { RuntimeScopeCampaignPort, RuntimeScopeOrganizationPort } from "../runtime_scope/index.js";
import { makeRuntimeScopeService } from "../runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "../organization_dynamics/index.js";
import { makeOrganizationEvolutionService } from "../organization_evolution/index.js";
import { makeRuntimeEvolutionService } from "../runtime_evolution/index.js";
import { makeReasoningCellService } from "../reasoning_cell/index.js";
import type { ProofEvidenceService } from "../proof_asset/index.js";
import type { EventStore } from "../state/index.js";
import type { InstalledBoundaryMemory } from "./install_contract.js";
import type { InstallPalimpsestOptions, InstalledCampaign, InstalledDynamics, InstalledEvolution, InstalledHolons, InstalledInstitution, InstalledOrganization, InstalledReasoningCells, InstalledRuntimeEvolution, InstalledRuntimeScopes } from "./install_contract.js";

/** Exactly the public options this cluster may read. */
export type OrganizationCompositionOptions = Pick<
  InstallPalimpsestOptions,
  | "organizationStore"
  | "institutionStore"
  | "institutionGovernancePeer"
  | "runtimeScopeStore"
  | "runtimeScopeRepresentationAdmission"
  | "coordinationStore"
  | "campaignStore"
  | "organizationEvolutionStore"
  | "organizationEvolutionCompiler"
  | "organizationEvolutionAuthority"
  | "organizationEvolutionInstitutionId"
  | "organizationFormalizationCompiler"
  | "runtimeEvolutionStore"
  | "runtimeEvolutionCompiler"
  | "runtimeEvolutionAuthority"
  | "allocateTransitionId"
  | "reasoningCellStore"
  | "reasoningVerificationPolicy"
  | "reasoningAdmissionPolicy"
  | "reasoningClaimTypes"
>;

/** The already-composed values this cluster consumes. */
export interface OrganizationCompositionInput {
  readonly options: OrganizationCompositionOptions;
  readonly store: EventStore;
  readonly proof: ProofEvidenceService | undefined;
  readonly campaign: InstalledCampaign | undefined;
  readonly boundaryMemory: InstalledBoundaryMemory | undefined;
}

/** What this cluster produced. */
export interface OrganizationComposition {
  readonly organization: InstalledOrganization | undefined;
  readonly institution: InstalledInstitution | undefined;
  readonly runtimeScopes: InstalledRuntimeScopes | undefined;
  readonly holons: InstalledHolons | undefined;
  readonly organizationDynamics: InstalledDynamics | undefined;
  readonly organizationEvolutionInstalled: InstalledEvolution | undefined;
  readonly runtimeEvolutionInstalled: InstalledRuntimeEvolution | undefined;
  readonly reasoningCellsInstalled: InstalledReasoningCells | undefined;
}
export function composeOrganizationCapabilities(input: OrganizationCompositionInput): OrganizationComposition {
  const { options, store, proof, campaign, boundaryMemory } = input;

  const organization: InstalledOrganization | undefined =
    options.organizationStore === undefined ? undefined : { store: options.organizationStore };
  let institution: InstalledInstitution | undefined;
  if (options.organizationStore !== undefined && options.institutionStore !== undefined) {
    institution = {
      store: options.institutionStore,
      service: makeInstitutionService({
        store: options.institutionStore,
        organizations: options.organizationStore,
        allocateTransitionId: options.allocateTransitionId ?? (() => `tr-${randomUUID()}`),
        localGovernancePeer: options.institutionGovernancePeer,
      }),
    };
  }

  // G10-H (§23): the runtime-organization surface exists only when a
  // runtime-scope store is supplied. Organization grounding uses the same
  // canonical organization store when present; without it a scope may still
  // exist with NO organization association, but a supplied basis cannot be
  // verified (fail closed).
  let runtimeScopes: InstalledRuntimeScopes | undefined;
  let holons: InstalledHolons | undefined;
  if (options.runtimeScopeStore !== undefined) {
    const organizationStore = options.organizationStore;
    const organizations: RuntimeScopeOrganizationPort | undefined =
      organizationStore === undefined
        ? undefined
        : {
            current: async (organizationDefinitionId: string) => organizationStore.head(organizationDefinitionId),
            exists: async (ref) => (await organizationStore.get(ref)) !== undefined,
            definition: async (ref) => {
              const definition = await organizationStore.get(ref);
              return definition === undefined ? undefined : { interactions: definition.interactions };
            },
            // G10-M: a RETIRED lineage cannot ground a new runtime scope.
            lifecycle: async (organizationDefinitionId: string) => organizationStore.lifecycle(organizationDefinitionId),
          };
    // CF-H-08: campaign association is verified against the canonical campaign store.
    const campaignStore = options.campaignStore;
    const campaigns: RuntimeScopeCampaignPort | undefined =
      campaignStore === undefined ? undefined : { exists: async (campaignId) => (await campaignStore.definition(campaignId)) !== undefined };
    const service = makeRuntimeScopeService({
      store: options.runtimeScopeStore,
      organizations,
      campaigns,
      ...(options.runtimeScopeRepresentationAdmission === undefined ? {} : { representationAdmission: options.runtimeScopeRepresentationAdmission }),
    });
    runtimeScopes = { store: options.runtimeScopeStore, service };
    holons = { view: (scopeId) => service.holonView(scopeId) };
  }

  // G10-I: the read-only Dynamics surface needs the runtime-scope and
  // organization sources; without them it is absent (never stubbed).
  let organizationDynamics: InstalledDynamics | undefined;
  if (runtimeScopes !== undefined && options.organizationStore !== undefined) {
    const orgStore = options.organizationStore;
    const dynamicsService = makeOrganizationDynamicsService({
      runtimeScopes: { store: runtimeScopes.store, service: runtimeScopes.service },
      organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref), lifecycle: (id) => orgStore.lifecycle(id) },
      ...(options.coordinationStore === undefined ? {} : { collaboration: coordinationObservationPort(options.coordinationStore) }),
      ...(options.campaignStore === undefined ? {} : { campaignActivity: campaignActivityPort(options.campaignStore) }),
      // G10-L: boundary-aware observation is available whenever this host holds the store.
      ...(boundaryMemory === undefined ? {} : { boundary: { observe: (workspaceId: string) => boundaryMemory!.service.boundaryObservation({ workspaceId }) } }),
    });
    organizationDynamics = { service: dynamicsService };
  }

  // G10-J: governed evolution needs the read-only dynamics surface plus an explicit,
  // trusted-authority-wired evolution case store. Missing wiring -> a read-only-absent
  // surface, never a stub.
  let organizationEvolutionInstalled: InstalledEvolution | undefined;
  if (
    organizationDynamics !== undefined &&
    options.organizationEvolutionStore !== undefined &&
    options.organizationEvolutionCompiler !== undefined &&
    options.organizationEvolutionAuthority !== undefined &&
    options.organizationStore !== undefined
  ) {
    const organizationEvolution = makeOrganizationEvolutionService({
      organizations: options.organizationStore,
      dynamics: organizationDynamics.service,
      store: options.organizationEvolutionStore,
      compiler: options.organizationEvolutionCompiler,
      authority: options.organizationEvolutionAuthority,
      ...(institution === undefined || options.organizationEvolutionInstitutionId === undefined
        ? {}
        : { institution: { institutionId: options.organizationEvolutionInstitutionId, service: institution.service, store: institution.store } }),
      // G10-K CF-J-02: FORMALIZE_ORGANIZATION is enabled only when an accepted
      // blueprint source (boundary memory) AND an untrusted formalization compiler exist.
      ...(boundaryMemory === undefined || options.organizationFormalizationCompiler === undefined
        ? {}
        : {
            formalization: {
              boundary: { acceptedBlueprint: (input: { readonly workspaceId: string; readonly artifactId: string }) => boundaryMemory!.service.acceptedBlueprint(input) },
              compiler: options.organizationFormalizationCompiler,
            },
          }),
      // G10-M: exhaustive, read-only retirement safety ports. Absent ⇒ assessment is blocked.
      ...(options.organizationStore === undefined
        ? {}
        : {
            retirement: {
              ...(options.institutionStore === undefined
                ? {}
                : { institutions: { currentBodies: async () => (await options.institutionStore!.currentBodies()).map((epoch) => epoch.organization) } }),
              ...(runtimeScopes === undefined
                ? {}
                : {
                    runtimeScopes: {
                      openScopesGroundedTo: async (organizationDefinitionId: string) => {
                        const ids: string[] = [];
                        for (const ref of await runtimeScopes!.service.listScopes()) {
                          const state = await runtimeScopes!.service.scopeState(ref.scopeId);
                          if (state.lifecycle === "OPEN" && state.definition.organizationBasis?.organizationDefinitionId === organizationDefinitionId) ids.push(ref.scopeId);
                        }
                        return Object.freeze(ids);
                      },
                    },
                  }),
            },
          }),
    });
    organizationEvolutionInstalled = { service: organizationEvolution };
  }

  // G10-M: runtime structural evolution — present iff a runtime-scope store, the dynamics
  // surface, an evolution case store, an untrusted compiler, and an independent runtime
  // structural authority are ALL supplied (never stubbed).
  let runtimeEvolutionInstalled: InstalledRuntimeEvolution | undefined;
  if (
    runtimeScopes !== undefined &&
    organizationDynamics !== undefined &&
    options.runtimeEvolutionStore !== undefined &&
    options.runtimeEvolutionCompiler !== undefined &&
    options.runtimeEvolutionAuthority !== undefined
  ) {
    runtimeEvolutionInstalled = {
      service: makeRuntimeEvolutionService({
        runtimeScopes: { store: runtimeScopes.store, service: runtimeScopes.service },
        dynamics: organizationDynamics.service,
        store: options.runtimeEvolutionStore,
        compiler: options.runtimeEvolutionCompiler,
        authority: options.runtimeEvolutionAuthority,
      }),
    };
  }

  // G10-N: reasoning cells need a canonical store plus BOTH policy seams. Missing wiring →
  // the surface is absent (never stubbed).
  let reasoningCellsInstalled: InstalledReasoningCells | undefined;
  if (options.reasoningCellStore !== undefined && options.reasoningVerificationPolicy !== undefined && options.reasoningAdmissionPolicy !== undefined) {
    reasoningCellsInstalled = {
      store: options.reasoningCellStore,
      service: makeReasoningCellService({
        store: options.reasoningCellStore,
        verificationPolicy: options.reasoningVerificationPolicy,
        admissionPolicy: options.reasoningAdmissionPolicy,
        ...(options.reasoningClaimTypes === undefined ? {} : { claimTypes: options.reasoningClaimTypes }),
      }),
    };
  }

  // G10-T CF-T-02: evidence-grounded extraction exists whenever the proof plane exists. It is
  // built even without reasoning/branch/content wiring (those are reported honestly as
  // `capability_required` at call time) so the proof surface always answers `analyze`.

  return {
    organization,
    institution,
    runtimeScopes,
    holons,
    organizationDynamics,
    organizationEvolutionInstalled,
    runtimeEvolutionInstalled,
    reasoningCellsInstalled,
  };
}
