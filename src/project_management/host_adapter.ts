/**
 * G10-V graduated project-management autonomy — host-bounded management cognition.
 *
 *   HostCognition ≠ Authority      Candidate ≠ Command       Adapter ≠ StoreMutator
 *
 * The adapter turns an (untrusted) host proposal into a digest-bound candidate.
 * It holds no store mutator and no authority port: it can propose only. A
 * proposal MUST still pass the management policy (`evaluateManagementAction`)
 * AND the existing `controller.plan` validation before any effect — this module
 * deliberately cannot do either on the caller's behalf, because it must not be
 * able to enact what it proposes.
 */

import { canonicalDigest } from "../schema/canonical.js";

import type { ManagementActionClass } from "./profile.js";
import { managementFail } from "./profile.js";

export const HOST_MANAGEMENT_PROPOSAL_KINDS = ["PLAN_REVISION", "RECIPE_CHOICE", "NEXT_ACTION"] as const;
export type HostManagementProposalKind = (typeof HOST_MANAGEMENT_PROPOSAL_KINDS)[number];

export const HOST_MANAGEMENT_PROPOSAL_DOMAIN = "palimpsest.project-management.host-proposal.v1";

export const HOST_MANAGEMENT_COGNITION_NOTES: readonly string[] = Object.freeze([
  "the host adapter holds no store mutator and no authority port",
  "every proposal is UNTRUSTED and must pass the management policy",
  "a plan-shaped proposal must additionally pass the existing controller.plan validation",
  "cognition proposes; the bounded management service and the governed services enact",
]);

/** Map a proposal kind onto the action class the policy must evaluate it as. */
export function managementActionClassForProposalKind(kind: HostManagementProposalKind): ManagementActionClass {
  switch (kind) {
    case "PLAN_REVISION":
      return "APPLY_LOCAL_PLAN_REVISION";
    case "RECIPE_CHOICE":
      return "START_LOCAL_RECIPE";
    case "NEXT_ACTION":
      return "DISPATCH_LOCAL_WORK";
  }
}

export interface HostManagementProposal {
  readonly kind: HostManagementProposalKind;
  readonly payload: unknown;
  readonly digest: string;
}

export interface HostBoundedManagementCognition {
  proposeUntrusted(input: { readonly kind: HostManagementProposalKind; readonly payload: unknown }): Promise<HostManagementProposal>;
}

export interface HostBoundedManagementCognitionDeps {
  /**
   * The host activation binding (shape owned by the host). It is held only so
   * the adapter can be constructed next to a real host; it is never used to
   * mutate anything, which is why its type is `unknown`.
   */
  readonly activation: unknown;
}

function isProposalKind(value: unknown): value is HostManagementProposalKind {
  return typeof value === "string" && (HOST_MANAGEMENT_PROPOSAL_KINDS as readonly string[]).includes(value);
}

export function makeHostBoundedManagementCognition(deps: HostBoundedManagementCognitionDeps): HostBoundedManagementCognition {
  // Held, never invoked for mutation. The adapter intentionally has no default
  // export and no store parameter, so it cannot write.
  const activation = deps.activation;
  void activation;

  return Object.freeze({
    async proposeUntrusted(input: { readonly kind: HostManagementProposalKind; readonly payload: unknown }): Promise<HostManagementProposal> {
      if (!isProposalKind(input.kind)) {
        managementFail("unknown_kind", `host management proposal kind must be one of ${HOST_MANAGEMENT_PROPOSAL_KINDS.join(", ")}`);
      }
      let digest: string;
      try {
        digest = canonicalDigest({
          domain: HOST_MANAGEMENT_PROPOSAL_DOMAIN,
          kind: input.kind,
          payload: input.payload,
          untrusted: true,
        });
      } catch (error) {
        return managementFail(
          "invalid_value",
          `the host proposal payload has no canonical JSON representation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return Object.freeze({ kind: input.kind, payload: input.payload, digest });
    },
  });
}
