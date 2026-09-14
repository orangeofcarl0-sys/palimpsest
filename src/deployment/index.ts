/** G10-P deployment: typed host profile + reproducible full-stack launch (CF-O-02). */

import { readFileSync } from "node:fs";

import {
  DEPLOYMENT_PROFILE_SCHEMA_VERSION,
  DeploymentProfileError,
  parseDeploymentProfile,
  type DeploymentAttentionConfig,
  type DeploymentDirectoryEntry,
  type DeploymentServeConfig,
  type ProjectAgentDeploymentProfile,
} from "./profile.js";
import { DeploymentLaunchError, launchDeployment, type Deployment, type DeploymentHostServices, type DeploymentPumpReport, type DeploymentActivationReport } from "./launch.js";

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
};

export type {
  ProjectAgentDeploymentProfile,
  DeploymentDirectoryEntry,
  DeploymentAttentionConfig,
  DeploymentServeConfig,
  Deployment,
  DeploymentHostServices,
  DeploymentPumpReport,
  DeploymentActivationReport,
};
