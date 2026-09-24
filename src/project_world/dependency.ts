/**
 * PLMP-LEAN-1 §D3-a — deriving a work's dependency footprint and its SEMANTIC projection digest from the
 * canonical envelope, without reintroducing a global-counter predicate.
 *
 *     start coarse, model general
 *
 * §D3-a resolves `source` at REPOSITORY granularity. That is a choice of resolver, not a limit of
 * `ResourceSelector`: the type already admits narrower source scopes, and a later slice can resolve
 * `write_paths` down to individual paths or symbols without changing this function's signature or any
 * stored basis. Doing it the other way round — storing `string[]` git paths now and migrating later —
 * is exactly the migration D3-0 exists to avoid.
 *
 * THE SEMANTIC PROJECTION DIGEST IS THE POINT OF THIS MODULE. `TaskEnvelope` carries two kinds of field,
 * and conflating them is how a global counter becomes the new `HEAD`:
 *
 *   SEMANTIC      task_id, objective, read_paths, write_paths, required_artifacts, allowed_commands,
 *                 network policy, timeouts, lease, attempt/candidate limits — what this work IS;
 *   POSITIONAL    `base_commit` (the SOURCE facet, resolved separately) and `project_revision` /
 *                 `project_digest` (global counters).
 *
 * Only the first kind enters the digest. A `ProjectIR` revision bump caused by an unrelated task must
 * not make this work stale, which is only true if the digest never sees the revision number — and the
 * envelope is where that number would otherwise leak in.
 *
 * Layer: L2 (`src/project_world/`), beside `project_verification/`.
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { TaskEnvelope } from "../schema/index.js";
import { materializeWorkDependency, type ResourceSelector, type WorkDependency } from "../domain/world_basis.js";

const SEMANTIC_PROJECTION_DOMAIN = "palimpsest.work-semantic-projection.v1";

/** The coarse source selector: this work depends on the canonical repository as a whole. */
export const REPOSITORY_SOURCE: ResourceSelector = Object.freeze({ domain: "source", scope: "repository" } as const);

/**
 * The digest of what this work IS, with every positional field excluded.
 *
 * The field list is written out rather than spread-and-delete so that a NEW envelope field is a
 * deliberate decision: adding one to the envelope will not silently enter the digest, and failing to
 * add it here will not silently make the digest blind. Both mistakes are caught by review of one list.
 */
export function semanticProjectionDigestOf(envelope: Pick<
  TaskEnvelope,
  | "task_id"
  | "objective"
  | "read_paths"
  | "write_paths"
  | "required_artifacts"
  | "allowed_commands"
  | "network_policy"
  | "network_allowlist"
  | "timeout_s"
  | "lease_s"
  | "attempt_limit"
  | "candidate_limit"
>): string {
  return canonicalDigest({
    domain: SEMANTIC_PROJECTION_DOMAIN,
    taskId: envelope.task_id,
    objective: envelope.objective,
    readPaths: [...envelope.read_paths],
    writePaths: [...envelope.write_paths],
    requiredArtifacts: [...envelope.required_artifacts],
    allowedCommands: envelope.allowed_commands.map((command) => ({
      executable: command.executable,
      argvPrefix: [...command.argv_prefix],
    })),
    networkPolicy: envelope.network_policy,
    networkAllowlist: envelope.network_allowlist,
    timeoutSeconds: envelope.timeout_s,
    leaseSeconds: envelope.lease_s,
    attemptLimit: envelope.attempt_limit,
    candidateLimit: envelope.candidate_limit,
  });
}

/**
 * The footprint a canonical envelope implies, at the coarse resolution §D3-a implements.
 *
 * A work READS the canonical source (its objective is stated against it) and WRITES it exactly when the
 * envelope declares a write scope. An envelope that declares no write path writes nothing — which is a
 * knowledge claim the envelope supports, not an omission: `begin` refuses an empty write scope outright,
 * so a write-less envelope is a genuinely read-only work.
 *
 * No asset selector is produced, because no canonical field can declare one yet. That is why a D3-a
 * basis reports `assets = NOT_REQUIRED`: the projection IS the selectors the work named, and this work
 * named none. It is NOT the same statement as a legacy record's `UNKNOWN`, and D3-0's three-state value
 * is what keeps the two apart.
 */
export function deriveWorkDependency(envelope: Pick<TaskEnvelope, "write_paths">): WorkDependency {
  return materializeWorkDependency({
    reads: [REPOSITORY_SOURCE],
    writes: envelope.write_paths.length > 0 ? [REPOSITORY_SOURCE] : [],
  });
}
