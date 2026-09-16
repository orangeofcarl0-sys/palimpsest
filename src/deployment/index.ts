/** G10-P deployment: typed host profile + reproducible full-stack launch (CF-O-02). */

import { readFileSync } from "node:fs";

import {
  DEPLOYMENT_PROFILE_SCHEMA_VERSION,
  DeploymentProfileError,
  parseDeploymentProfile,
  type DeploymentAttentionConfig,
  type DeploymentDirectoryEntry,
  type DeploymentReasoningConfig,
  type DeploymentServeConfig,
  type ProjectAgentDeploymentProfile,
} from "./profile.js";
import {
  DeploymentLaunchError,
  launchDeployment,
  type Deployment,
  type DeploymentHostServices,
  type DeploymentPumpReport,
  type DeploymentActivationReport,
} from "./launch.js";
import { deriveHostCollaborationReadiness } from "./readiness.js";
import type { HostCollaborationReadiness, HostCollaborationReadinessInput } from "./readiness.js";
import {
  FIRST_PARTY_EXPLORATORY_ADMISSION_DOMAIN,
  FIRST_PARTY_EXPLORATORY_ADMISSION_POLICY_ID,
  FIRST_PARTY_EXPLORATORY_VERIFICATION_DOMAIN,
  FIRST_PARTY_EXPLORATORY_VERIFICATION_POLICY_ID,
  FIRST_PARTY_EXPLORE_ADMISSION_POLICY_REF,
  FIRST_PARTY_EXPLORE_VERIFICATION_POLICY_REF,
  deploymentReasoningStorePath,
  firstPartyExploratoryAdmissionPolicy,
  firstPartyExploratoryVerificationPolicy,
} from "./reasoning_bundle.js";
import {
  BRANCH_RESULT_TOOL_NAME,
  BranchHostError,
  composeBranchHostEnvironment,
  defineBranchResultTool,
  parseBranchHostPayload,
  type BranchHostEnvironment,
  type BranchHostEnvironmentResult,
  type BranchHostEvidenceContext,
  type BranchHostPayload,
  type BranchHostPayloadParse,
  type BranchResultRecorder,
  type BranchResultStatus,
} from "./branch_host.js";
import { composeRunnerActivation, type ComposeRunnerActivationInput, type RunnerActivationAgents, type RunnerActivationAgent } from "./host_activation.js";

/** Load and STRICTLY parse a deployment profile JSON file. */
export function loadDeploymentProfile(path: string): ProjectAgentDeploymentProfile {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parseDeploymentProfile(raw, `DeploymentProfile(${path})`);
}

export {
  DEPLOYMENT_PROFILE_SCHEMA_VERSION,
  DeploymentProfileError,
  parseDeploymentProfile,
  DeploymentLaunchError,
  launchDeployment,
  // UX-C §30: the derived, non-authoritative host collaboration readiness view.
  deriveHostCollaborationReadiness,
  // UX-C §11/§12/§9: the first-party exploratory policies and the derived store path.
  FIRST_PARTY_EXPLORATORY_ADMISSION_DOMAIN,
  FIRST_PARTY_EXPLORATORY_ADMISSION_POLICY_ID,
  FIRST_PARTY_EXPLORATORY_VERIFICATION_DOMAIN,
  FIRST_PARTY_EXPLORATORY_VERIFICATION_POLICY_ID,
  FIRST_PARTY_EXPLORE_ADMISSION_POLICY_REF,
  FIRST_PARTY_EXPLORE_VERIFICATION_POLICY_REF,
  deploymentReasoningStorePath,
  firstPartyExploratoryAdmissionPolicy,
  firstPartyExploratoryVerificationPolicy,
  // UX-C §16/§17/§18: the minimal packaged DSH branch environment.
  BRANCH_RESULT_TOOL_NAME,
  BranchHostError,
  composeBranchHostEnvironment,
  defineBranchResultTool,
  parseBranchHostPayload,
  // UX-C §23/§40: the shipped runner's activation wiring (cold-resume proof seam).
  composeRunnerActivation,
};

export type {
  ProjectAgentDeploymentProfile,
  DeploymentDirectoryEntry,
  DeploymentAttentionConfig,
  DeploymentReasoningConfig,
  DeploymentServeConfig,
  Deployment,
  DeploymentHostServices,
  DeploymentPumpReport,
  DeploymentActivationReport,
  HostCollaborationReadiness,
  HostCollaborationReadinessInput,
  BranchHostEnvironment,
  BranchHostEnvironmentResult,
  BranchHostEvidenceContext,
  BranchHostPayload,
  BranchHostPayloadParse,
  BranchResultRecorder,
  BranchResultStatus,
  ComposeRunnerActivationInput,
  RunnerActivationAgents,
  RunnerActivationAgent,
};
