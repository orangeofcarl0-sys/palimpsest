/**
 * SR-1D R2 §11 — the COMPATIBILITY surface.
 *
 * The implementation monolith that used to live here is now eight cohesive cluster modules under
 * `surfaces/`, composed by `factory.ts`. This file keeps the old import path working, and publishes
 * exactly the names the canonical `palimpsest-dsh/advanced` entry published — no more.
 *
 * The re-exports are EXPLICIT rather than `export *` on purpose. A wildcard would also publish each
 * cluster's `make*Surfaces` constructor and its narrow `*SurfaceDeps` input: internal wiring symbols
 * a consumer never had, which would reach the public API through `application/index.ts` →
 * `advanced.ts` (SR-1 closure §2). Everything here is a type; the clusters' only value export, their
 * constructor, is consumed by `factory.ts` directly and stays internal.
 */

export { makePalimpsestApplicationSurface } from "./factory.js";
export type { ApplicationSurfaceDeps, PalimpsestApplicationSurface } from "./factory.js";

export type {
  AdvisorApplicationSurface,
  AdvisorExplanation,
  AdvisorProfileInput,
  EmpiricalApplicationSurface,
  ReasoningApplicationSurface,
  RecipeExecutionApplicationSurface,
  RecipeExecutionStatus,
  RecipeReadinessReport,
  RecipesApplicationSurface,
} from "./surfaces/cognition.js";
export type {
  AttentionApplicationSurface,
  BoundaryApplicationSurface,
  FederationApplicationSurface,
  RemoteSubmissionPort,
} from "./surfaces/federation.js";
export type {
  CampaignApplicationSurface,
  DynamicsApplicationSurface,
  EvolutionApplicationSurface,
  OrganizationApplicationSurface,
  RuntimeApplicationSurface,
} from "./surfaces/organization.js";
export type { CollaborationApplicationSurface, CrossProjectApplicationSurface } from "./surfaces/product.js";
export type { DisclosureApplicationSurface, ProofApplicationSurface } from "./surfaces/proof.js";
export type {
  ExternalAssetPrepareImportCommand,
  ExternalAssetPreparePublicationCommand,
  ExternalAssetPrepareReferenceCommand,
  ExternalAssetsApplicationSurface,
  MonitorApplicationSurface,
  ProjectManagementApplicationSurface,
  ProjectWorkspaceApplicationSurface,
  VerificationApplicationSurface,
} from "./surfaces/project.js";
export type { BoundaryWorkspaceReadPort, ProjectionsApplicationSurface } from "./surfaces/projections.js";
export type { WorkApplicationSurface } from "./surfaces/work.js";
