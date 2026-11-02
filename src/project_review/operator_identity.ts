/**
 * PC1-V1 — a signed local Operator credential.
 *
 * The previous CLI accepted `--actor=<operatorId>` as a bare string, so any local process (or a
 * model that could write a command line) could assert the operator identity. This adapter replaces
 * that assertion with an Ed25519-signed bearer credential:
 *
 *     token = pc1v1-opv1.<base64url(claims)>.<base64url(signature)>
 *
 * The CLI verifies the signature against a public key configured at `init` time, checks the exact
 * operator id, purpose and validity window, and only then exposes an `OperatorAuthorityPort` that
 * authorizes `operator:<id>` for this process. A deployment that needs a remote IdP/SSO still
 * supplies its own `OperatorAuthorityPort`; this is a local cryptographic credential, not an IdP.
 */
import { createPublicKey, sign, verify } from "node:crypto";

import type { OperatorAuthorityPort } from "./types.js";

export const OPERATOR_TOKEN_PREFIX = "pc1v1-opv1";

export interface OperatorTokenClaims {
  readonly operatorId: string;
  readonly purpose: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
}

export type OperatorTokenVerification =
  | { readonly valid: true; readonly claims: OperatorTokenClaims }
  | { readonly valid: false; readonly reason: string };

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function isClaims(value: unknown): value is OperatorTokenClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.operatorId === "string" &&
    raw.operatorId.trim() !== "" &&
    typeof raw.purpose === "string" &&
    raw.purpose.trim() !== "" &&
    typeof raw.issuedAt === "string" &&
    typeof raw.expiresAt === "string" &&
    typeof raw.nonce === "string" &&
    raw.nonce.trim() !== ""
  );
}

export function signOperatorToken(input: { readonly claims: OperatorTokenClaims; readonly privateKeyPem: string }): string {
  if (!isClaims(input.claims)) throw new Error("operator token claims are incomplete");
  const payload = encode(input.claims);
  const signingInput = `${OPERATOR_TOKEN_PREFIX}.${payload}`;
  const signature = sign(null, Buffer.from(signingInput, "utf8"), input.privateKeyPem);
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function verifyOperatorToken(input: {
  readonly token: string;
  readonly publicKeyPem: string;
  readonly expectedOperatorId: string;
  readonly expectedPurpose: string;
  readonly now?: Date | undefined;
  readonly clockSkewMs?: number | undefined;
}): OperatorTokenVerification {
  const parts = input.token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== OPERATOR_TOKEN_PREFIX || parts[1] === "" || parts[2] === "") {
    return { valid: false, reason: "the credential is not a pc1v1-opv1 token" };
  }
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "the credential claims are not valid JSON" };
  }
  if (!isClaims(claims)) return { valid: false, reason: "the credential claims are incomplete" };
  const signingInput = `${parts[0]}.${parts[1]}`;
  let signatureValid = false;
  try {
    const publicKey = createPublicKey(input.publicKeyPem);
    signatureValid = verify(null, Buffer.from(signingInput, "utf8"), publicKey, Buffer.from(parts[2]!, "base64url"));
  } catch (error) {
    return { valid: false, reason: `the credential signature cannot be checked: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!signatureValid) return { valid: false, reason: "the credential signature does not match the configured operator public key" };
  if (claims.operatorId !== input.expectedOperatorId) {
    return { valid: false, reason: `the credential names ${claims.operatorId}, not the configured operator ${input.expectedOperatorId}` };
  }
  if (claims.purpose !== input.expectedPurpose) {
    return { valid: false, reason: `the credential purpose "${claims.purpose}" does not match "${input.expectedPurpose}"` };
  }
  const issuedAt = Date.parse(claims.issuedAt);
  const expiresAt = Date.parse(claims.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    return { valid: false, reason: "the credential validity window is malformed" };
  }
  const now = (input.now ?? new Date()).getTime();
  const skew = input.clockSkewMs ?? 60_000;
  if (now + skew < issuedAt) return { valid: false, reason: "the credential is not valid yet" };
  if (now - skew > expiresAt) return { valid: false, reason: "the credential has expired" };
  return { valid: true, claims };
}

/**
 * The port exposed to the review service after verification. It authorizes exactly the verified
 * subject for this process; a bare operator id string is not accepted without that verification.
 */
export function makeSignedOperatorAuthority(input: {
  readonly claims: OperatorTokenClaims;
  readonly actor: string;
}): OperatorAuthorityPort {
  return {
    policyRef: { policyId: "pc1v1-signed-operator", version: "1" },
    authorize(actor) {
      return actor === input.actor
        ? { authorized: true, role: "operator" }
        : {
            authorized: false,
            role: "unknown",
            reason: `actor "${actor}" is not the verified operator "${input.claims.operatorId}" for purpose "${input.claims.purpose}"`,
          };
    },
  };
}
