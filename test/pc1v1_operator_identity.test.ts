/**
 * PC1-V1 — the operator identity is a signed credential, not a caller-supplied string.
 */
import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  makeSignedOperatorAuthority,
  signOperatorToken,
  verifyOperatorToken,
} from "../src/project_review/index.js";

function keyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const keys = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function claims(overrides: Partial<{ operatorId: string; purpose: string; issuedAt: string; expiresAt: string; nonce: string }> = {}) {
  return {
    operatorId: "operator:alice",
    purpose: "review project changes",
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    nonce: "nonce-1",
    ...overrides,
  };
}

describe("PC1-V1 operator identity", () => {
  it("does not keep authorizing a credential after it expires in this process", () => {
    const value = claims();
    const authority = makeSignedOperatorAuthority({ claims: value, actor: "operator:alice" });
    expect(authority.authorize("operator:alice").authorized).toBe(true);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(value.expiresAt) + 1);
    try { expect(authority.authorize("operator:alice")).toMatchObject({ authorized: false, role: "unknown" }); }
    finally { clock.mockRestore(); }
  });
  it("accepts only a correctly signed, current credential for the exact subject and purpose", () => {
    const keys = keyPair();
    const token = signOperatorToken({ claims: claims(), privateKeyPem: keys.privateKeyPem });
    const verified = verifyOperatorToken({
      token,
      publicKeyPem: keys.publicKeyPem,
      expectedOperatorId: "operator:alice",
      expectedPurpose: "review project changes",
    });
    expect(verified.valid).toBe(true);
    if (!verified.valid) return;
    const authority = makeSignedOperatorAuthority({ claims: verified.claims, actor: "operator:alice" });
    expect(authority.authorize("operator:alice")).toMatchObject({ authorized: true, role: "operator" });
    expect(authority.authorize("operator:mallory")).toMatchObject({ authorized: false, role: "unknown" });
  });

  it("rejects tampering, a different key, expiry, a different purpose and a different subject", () => {
    const keys = keyPair();
    const other = keyPair();
    const token = signOperatorToken({ claims: claims(), privateKeyPem: keys.privateKeyPem });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(claims({ operatorId: "operator:mallory" }))).toString("base64url")}.${parts[2]}`;

    expect(verifyOperatorToken({ token: tampered, publicKeyPem: keys.publicKeyPem, expectedOperatorId: "operator:alice", expectedPurpose: "review project changes" })).toMatchObject({ valid: false });
    expect(verifyOperatorToken({ token, publicKeyPem: other.publicKeyPem, expectedOperatorId: "operator:alice", expectedPurpose: "review project changes" })).toMatchObject({ valid: false });
    expect(verifyOperatorToken({ token, publicKeyPem: keys.publicKeyPem, expectedOperatorId: "operator:mallory", expectedPurpose: "review project changes" })).toMatchObject({ valid: false });
    expect(verifyOperatorToken({ token, publicKeyPem: keys.publicKeyPem, expectedOperatorId: "operator:alice", expectedPurpose: "different" })).toMatchObject({ valid: false });

    const expired = signOperatorToken({
      claims: claims({ issuedAt: new Date(Date.now() - 7_200_000).toISOString(), expiresAt: new Date(Date.now() - 3_600_000).toISOString() }),
      privateKeyPem: keys.privateKeyPem,
    });
    expect(verifyOperatorToken({ token: expired, publicKeyPem: keys.publicKeyPem, expectedOperatorId: "operator:alice", expectedPurpose: "review project changes" })).toMatchObject({ valid: false, reason: expect.stringMatching(/expired/iu) });
  });
});
