/** Deployment-owned identity decision, shared by review and canonical head admission. */
export interface OperatorAuthorityPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  authorize(actor: string): { readonly authorized: boolean; readonly role: "operator" | "agent" | "unknown"; readonly reason?: string | undefined };
}
