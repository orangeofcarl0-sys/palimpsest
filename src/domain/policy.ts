/** Trusted configuration that issues immutable, authorized TaskEnvelopes. */

import {
  canonicalDigest,
  parseTaskEnvelope,
  type AllowedCommand,
  type NetworkEndpoint,
  type ProjectIr,
  type TaskEnvelope,
} from "../schema/index.js";
import { PolicyError } from "./errors.js";
import { actionKey, stableEntityId } from "./idempotency.js";

export interface AuthorizedTaskEnvelope {
  envelope: TaskEnvelope;
  policy_id: string;
  policy_digest: string;
}

export interface TaskPolicyInput {
  policy_id: string;
  read_paths: string[];
  allowed_commands: AllowedCommand[];
  network_policy: "deny" | "allow-listed";
  network_allowlist: NetworkEndpoint[];
  timeout_s: number;
  lease_s: number;
  attempt_limit: number;
  candidate_limit: 1 | 2;
}

/**
 * Human-controlled policy input; it is not model-generated project state.
 * The digest must match the Python TaskPolicy digest for identical input
 * (canonical JSON over the same fields).
 */
export class TaskPolicy {
  readonly policy_id: string;
  readonly read_paths: string[];
  readonly allowed_commands: AllowedCommand[];
  readonly network_policy: "deny" | "allow-listed";
  readonly network_allowlist: NetworkEndpoint[];
  readonly timeout_s: number;
  readonly lease_s: number;
  readonly attempt_limit: number;
  readonly candidate_limit: 1 | 2;

  constructor(input: TaskPolicyInput) {
    this.policy_id = input.policy_id;
    this.read_paths = [...input.read_paths];
    this.allowed_commands = input.allowed_commands.map((command) => ({ ...command, argv_prefix: [...command.argv_prefix] }));
    this.network_policy = input.network_policy;
    this.network_allowlist = input.network_allowlist.map((endpoint) => ({ ...endpoint }));
    this.timeout_s = input.timeout_s;
    this.lease_s = input.lease_s;
    this.attempt_limit = input.attempt_limit;
    this.candidate_limit = input.candidate_limit;
  }

  get digest(): string {
    return canonicalDigest({
      policy_id: this.policy_id,
      read_paths: this.read_paths,
      allowed_commands: this.allowed_commands,
      network_policy: this.network_policy,
      network_allowlist: this.network_allowlist,
      timeout_s: this.timeout_s,
      lease_s: this.lease_s,
      attempt_limit: this.attempt_limit,
      candidate_limit: this.candidate_limit,
    });
  }

  authorize(project: ProjectIr, taskId: string): AuthorizedTaskEnvelope {
    const task = project.tasks.find((item) => item.task_id === taskId);
    if (task === undefined) {
      throw new PolicyError(`Task ${taskId} is not declared by ProjectIR`);
    }

    const identity = actionKey("task-envelope-v1", {
      project_id: project.project_id,
      task_id: task.task_id,
      project_revision: project.revision,
      project_digest: project.digest,
      policy_id: this.policy_id,
      policy_digest: this.digest,
    });
    const registrationKey = actionKey("task-register-v1", {
      project_id: project.project_id,
      task_id: task.task_id,
      project_revision: project.revision,
      project_digest: project.digest,
      policy_id: this.policy_id,
      policy_digest: this.digest,
    });
    try {
      const envelope = parseTaskEnvelope({
        schema_version: 1,
        project_id: project.project_id,
        task_id: task.task_id,
        envelope_id: stableEntityId("envelope", identity),
        project_revision: project.revision,
        project_digest: project.digest,
        base_commit: project.head_commit,
        objective: task.objective,
        read_paths: this.read_paths,
        write_paths: task.write_paths,
        required_artifacts: task.required_artifacts,
        allowed_commands: this.allowed_commands,
        network_policy: this.network_policy,
        network_allowlist: this.network_allowlist,
        timeout_s: this.timeout_s,
        lease_s: this.lease_s,
        attempt_limit: this.attempt_limit,
        candidate_limit: this.candidate_limit,
        idempotency_key: registrationKey,
      });
      return { envelope, policy_id: this.policy_id, policy_digest: this.digest };
    } catch (error) {
      throw new PolicyError(
        `trusted policy produced an invalid TaskEnvelope: ${(error as Error).message}`,
      );
    }
  }
}
